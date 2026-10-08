/**
 * Transaction executor for the keeper daemon.
 *
 * Handles account sequence management, building, signing, submitting,
 * and retrying extend/restore transactions with bounded exponential backoff.
 *
 * Accounts for common failure modes:
 * - tx_bad_seq: re-fetch sequence and retry
 * - TIMEOUT / TRY_AGAIN_LATER: exponential backoff retry
 * - Permanent failures: give up after max retries
 */

import {
  Account,
  Keypair,
  Operation,
  SorobanDataBuilder,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import type { ContractConfig, ContractStatus, RpcClient } from "@evergreen/core";
import { buildExtendPlan, buildRestorePlan } from "@evergreen/core";
import type { AlertManager } from "./alerts.js";
import type { StateStore } from "./state-store.js";

const BASE_FEE = 100;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 3000, 10000]; // exponential backoff steps

interface ExecuteResult {
  contractId: string;
  operation: "extend" | "restore";
  success: boolean;
  feeCharged: number;
  txHash?: string;
  error?: string;
}

/** Fetch updated account sequence and return a fresh Account object. */
async function fetchAccount(keypair: Keypair, rpc: RpcClient): Promise<Account> {
  // We use the rpc.getLedgerEntries with the account's ledger key to get sequence
  // The keeper's RPC client exposes this via getAccountBalance-adjacent queries
  // For now, we use a direct fetch approach via the SDK's getAccount equivalent
  const { rpc: StellarRpc } = await import("@stellar/stellar-sdk");
  const server = new StellarRpc.Server(
    // We need the RPC URL — this is a limitation of the executor's current design.
    // The URL should be passed as a constructor parameter.
    process.env["EVERGREEN_RPC_URL"] ?? "https://soroban-testnet.stellar.org"
  );
  const accountData = await server.getAccount(keypair.publicKey());
  return accountData;
}

/**
 * Execute an extend operation with retry logic.
 */
export async function executeExtendWithRetry(
  contractStatus: ContractStatus,
  config: ContractConfig,
  rpc: RpcClient,
  keypair: Keypair,
  networkPassphrase: string,
  store: StateStore,
  alerts: AlertManager,
  rpcUrl: string
): Promise<ExecuteResult> {
  const entriesToExtend = contractStatus.entries.filter(
    (e) => e.status === "critical" || e.status === "warning"
  );

  if (entriesToExtend.length === 0) {
    return { contractId: config.id, operation: "extend", success: true, feeCharged: 0 };
  }

  const { sequence: currentLedger } = await rpc.getLatestLedger();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const plan = await buildExtendPlan(
        entriesToExtend,
        config,
        rpc,
        currentLedger,
        networkPassphrase
      );

      // Check daily spend cap
      const dailySpent = store.getDailySpend();
      const globalCap = config.maxDailySpendStroops;
      if (globalCap && dailySpent + plan.estimatedFee > globalCap) {
        const msg = `Daily spend cap exceeded for ${config.label}: spent ${dailySpent}, cap ${globalCap}`;
        console.warn(`[keeper] ${msg}`);
        await alerts.send({
          level: "error",
          title: "Daily spend cap reached",
          message: msg,
          contractId: config.id,
          timestamp: new Date(),
        });
        return { contractId: config.id, operation: "extend", success: false, feeCharged: 0, error: msg };
      }

      // Build a real signed transaction
      const { rpc: StellarRpc } = await import("@stellar/stellar-sdk");
      const server = new StellarRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
      const account = await server.getAccount(keypair.publicKey());

      const sorobanData = xdr.SorobanTransactionData.fromXDR(plan.sorobanData, "base64");
      const tx = new TransactionBuilder(account, {
        fee: String(plan.estimatedFee),
        networkPassphrase,
      })
        .setSorobanData(sorobanData)
        .addOperation(Operation.extendFootprintTtl({ extendTo: plan.ledgerExtendBy }))
        .setTimeout(300)
        .build();

      tx.sign(keypair);
      const sendResult = await rpc.sendTransaction(tx.toXDR());

      if (sendResult.status === "PENDING" || sendResult.status === "DUPLICATE") {
        store.addDailySpend(plan.estimatedFee);
        return {
          contractId: config.id,
          operation: "extend",
          success: true,
          feeCharged: plan.estimatedFee,
          txHash: sendResult.hash,
        };
      }

      if (sendResult.status === "TRY_AGAIN_LATER" && attempt < MAX_RETRIES) {
        await sleep(RETRY_BACKOFF_MS[attempt] ?? 10000);
        continue;
      }

      return {
        contractId: config.id,
        operation: "extend",
        success: false,
        feeCharged: 0,
        error: `Transaction status: ${sendResult.status}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // tx_bad_seq: retry with fresh sequence
      if (message.includes("tx_bad_seq") && attempt < MAX_RETRIES) {
        await sleep(RETRY_BACKOFF_MS[attempt] ?? 10000);
        continue;
      }
      if (attempt >= MAX_RETRIES) {
        return { contractId: config.id, operation: "extend", success: false, feeCharged: 0, error: message };
      }
      await sleep(RETRY_BACKOFF_MS[attempt] ?? 10000);
    }
  }

  return { contractId: config.id, operation: "extend", success: false, feeCharged: 0, error: "Max retries exceeded" };
}

/**
 * Execute a restore operation with retry logic.
 */
export async function executeRestoreWithRetry(
  contractStatus: ContractStatus,
  config: ContractConfig,
  rpc: RpcClient,
  keypair: Keypair,
  networkPassphrase: string,
  store: StateStore,
  alerts: AlertManager,
  rpcUrl: string
): Promise<ExecuteResult> {
  const archivedEntries = contractStatus.entries.filter((e) => e.status === "archived");

  if (archivedEntries.length === 0) {
    return { contractId: config.id, operation: "restore", success: true, feeCharged: 0 };
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const plan = await buildRestorePlan(archivedEntries, config, rpc, networkPassphrase);

      const dailySpent = store.getDailySpend();
      const globalCap = config.maxDailySpendStroops;
      if (globalCap && dailySpent + plan.estimatedFee > globalCap) {
        const msg = `Daily cap exceeded — cannot restore ${config.label}`;
        return { contractId: config.id, operation: "restore", success: false, feeCharged: 0, error: msg };
      }

      const { rpc: StellarRpc } = await import("@stellar/stellar-sdk");
      const server = new StellarRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
      const account = await server.getAccount(keypair.publicKey());

      const sorobanData = xdr.SorobanTransactionData.fromXDR(plan.sorobanData, "base64");
      const tx = new TransactionBuilder(account, {
        fee: String(plan.estimatedFee),
        networkPassphrase,
      })
        .setSorobanData(sorobanData)
        .addOperation(Operation.restoreFootprint({}))
        .setTimeout(300)
        .build();

      tx.sign(keypair);
      const sendResult = await rpc.sendTransaction(tx.toXDR());

      if (sendResult.status === "PENDING" || sendResult.status === "DUPLICATE") {
        store.addDailySpend(plan.estimatedFee);
        return {
          contractId: config.id,
          operation: "restore",
          success: true,
          feeCharged: plan.estimatedFee,
          txHash: sendResult.hash,
        };
      }

      if (sendResult.status === "TRY_AGAIN_LATER" && attempt < MAX_RETRIES) {
        await sleep(RETRY_BACKOFF_MS[attempt] ?? 10000);
        continue;
      }

      return {
        contractId: config.id,
        operation: "restore",
        success: false,
        feeCharged: 0,
        error: `Status: ${sendResult.status}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("tx_bad_seq") && attempt < MAX_RETRIES) {
        await sleep(RETRY_BACKOFF_MS[attempt] ?? 10000);
        continue;
      }
      if (attempt >= MAX_RETRIES) {
        return { contractId: config.id, operation: "restore", success: false, feeCharged: 0, error: message };
      }
      await sleep(RETRY_BACKOFF_MS[attempt] ?? 10000);
    }
  }

  return { contractId: config.id, operation: "restore", success: false, feeCharged: 0, error: "Max retries exceeded" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
