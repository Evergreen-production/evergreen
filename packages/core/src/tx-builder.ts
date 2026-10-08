/**
 * Transaction builder for ExtendFootprintTTL and RestoreFootprint operations.
 *
 * These operations use simulation to discover the transaction footprint,
 * then apply fee + resource caps before returning a ready-to-submit transaction.
 *
 * References:
 * - https://developers.stellar.org/docs/build/smart-contracts/example-contracts/ttl
 * - ExtendFootprintTTL operation: CAP-0046
 * - RestoreFootprint operation: CAP-0046
 */

import {
  Account,
  Keypair,
  Operation,
  SorobanDataBuilder,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import type { ContractConfig, EntryTtlStatus, RpcClient, OperationResult, SimulateResponse } from "./types.js";
import { MAX_TTL_LEDGERS, LEDGER_CLOSE_SECONDS } from "./types.js";
import { buildContractInstanceKey, buildContractCodeKey, buildNamedEntryKey, extractWasmHashFromInstanceEntry } from "./ledger-keys.js";
import { daysToLedgers } from "./ttl-status.js";

/** Max resource fee increase factor (1.1 = 10% buffer above simulated fee). */
const FEE_BUFFER_FACTOR = 1.1;
/** Base transaction fee in stroops (per-operation, non-resource fee). */
const BASE_FEE_STROOPS = 100;

export interface ExtendOptions {
  /** If true, build and simulate but do not submit the transaction. */
  dryRun: boolean;
  /** Signer keypair. Not needed in dry-run mode. */
  keypair?: Keypair;
  /** Override: extend only these entry keys (by entryKey name). All if undefined. */
  onlyEntryKeys?: string[];
}

export interface RestoreOptions {
  dryRun: boolean;
  keypair?: Keypair;
  onlyEntryKeys?: string[];
}

export interface ExtendPlan {
  contractId: string;
  entryKeys: string[];
  extendToLedgers: number;
  /** Estimated fee in stroops based on simulation. */
  estimatedFee: number;
  /** SorobanData object for the transaction, from simulation. */
  sorobanData: string; // base64 XDR
  /** The network-adjusted ledger sequence number for the transaction. */
  ledgerExtendBy: number;
}

export interface RestorePlan {
  contractId: string;
  entryKeys: string[];
  estimatedFee: number;
  sorobanData: string; // base64 XDR
}

/**
 * Validate that a proposed fee does not exceed the contract-level cap.
 */
function assertFeeWithinCap(fee: number, config: ContractConfig): void {
  if (fee > config.maxFeeStroops) {
    throw new Error(
      `Simulated fee ${fee} stroops exceeds maxFeeStroops cap of ${config.maxFeeStroops} for contract ${config.id}`
    );
  }
}

/**
 * Clamp extend-to ledgers to the protocol maximum.
 */
function clampExtendTo(ledgers: number): number {
  return Math.min(ledgers, MAX_TTL_LEDGERS);
}

/**
 * Calculate the extend amount: current ledger + extendToDays worth of ledgers.
 * The protocol takes extendTo as "extend to at least this many ledgers from now",
 * but ExtendFootprintTTL takes a `extendTo` parameter representing the
 * target liveUntilLedgerSeq, relative to the current ledger.
 *
 * Actually, per Protocol 21+ docs:
 * ExtendFootprintTTL has a `extendTo` field which is the number of ledgers to
 * extend TTL by (i.e., it is an increment, NOT an absolute ledger number).
 * The resulting liveUntilLedger = max(current liveUntil, currentLedger + extendTo).
 */
function computeExtendByLedgers(config: ContractConfig): number {
  const target = clampExtendTo(daysToLedgers(config.extendToDays));
  return target;
}

/**
 * Build the LedgerKey XDR base64 strings for entries that need extension.
 */
async function buildKeysForEntries(
  entries: EntryTtlStatus[],
  config: ContractConfig,
  rpc: RpcClient
): Promise<Map<string, string>> {
  /** Map from entry key name -> base64 LedgerKey XDR */
  const keyMap = new Map<string, string>();

  for (const entry of entries) {
    switch (entry.entryType) {
      case "contract_instance":
        keyMap.set("instance", buildContractInstanceKey(config.id));
        break;
      case "contract_code": {
        // Fetch instance to get wasm hash
        const instanceKeyXdr = buildContractInstanceKey(config.id);
        const instanceResult = await rpc.getLedgerEntries([instanceKeyXdr]);
        if (instanceResult.entries.length > 0) {
          const wasmHash = extractWasmHashFromInstanceEntry(instanceResult.entries[0].xdr);
          keyMap.set("code", buildContractCodeKey(wasmHash));
        }
        break;
      }
      case "named_persistent":
      case "named_temporary": {
        const namedEntry = config.namedEntries?.find((ne) => ne.name === entry.entryKey);
        if (namedEntry) {
          keyMap.set(
            entry.entryKey,
            buildNamedEntryKey(config.id, namedEntry.ledgerKeyXdr, namedEntry.durability)
          );
        }
        break;
      }
    }
  }
  return keyMap;
}

/**
 * Build and simulate an ExtendFootprintTTL transaction.
 *
 * The simulation returns the SorobanTransactionData (footprint) and minimum
 * resource fee. We apply a small buffer, check caps, then return the plan.
 *
 * Note: ExtendFootprintTTL operations must have ALL keys in a single footprint.
 * We batch up to MAX_FOOTPRINT_KEYS per transaction.
 */
export async function buildExtendPlan(
  entriesToExtend: EntryTtlStatus[],
  config: ContractConfig,
  rpc: RpcClient,
  currentLedger: number,
  networkPassphrase: string
): Promise<ExtendPlan> {
  const keyMap = await buildKeysForEntries(entriesToExtend, config, rpc);
  const ledgerKeyXdrList = [...keyMap.values()];

  if (ledgerKeyXdrList.length === 0) {
    throw new Error("No ledger keys to extend");
  }

  const extendBy = computeExtendByLedgers(config);

  // Build a placeholder transaction for simulation
  // We use a throwaway keypair for simulation — the real signer is applied after
  const placeholderKeypair = Keypair.random();
  const placeholderAccount = new Account(placeholderKeypair.publicKey(), "0");

  // Build footprint from the keys we want to extend
  const footprintEntries = ledgerKeyXdrList.map((k) => xdr.LedgerKey.fromXDR(k, "base64"));
  const sorobanDataBuilder = new SorobanDataBuilder()
    .setReadWrite(footprintEntries);

  const tx = new TransactionBuilder(placeholderAccount, {
    fee: String(BASE_FEE_STROOPS),
    networkPassphrase,
  })
    .setSorobanData(sorobanDataBuilder.build())
    .addOperation(
      Operation.extendFootprintTtl({ extendTo: extendBy })
    )
    .setTimeout(300)
    .build();

  const simResult = await rpc.simulateTransaction(tx.toXDR());
  if (simResult.error) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const minFee = Number(simResult.minResourceFee ?? "0");
  const estimatedFee = Math.ceil(minFee * FEE_BUFFER_FACTOR) + BASE_FEE_STROOPS;
  assertFeeWithinCap(estimatedFee, config);

  return {
    contractId: config.id,
    entryKeys: [...keyMap.keys()],
    extendToLedgers: extendBy,
    estimatedFee,
    sorobanData: simResult.transactionData ?? "",
    ledgerExtendBy: extendBy,
  };
}

/**
 * Build and simulate a RestoreFootprint transaction for archived entries.
 */
export async function buildRestorePlan(
  archivedEntries: EntryTtlStatus[],
  config: ContractConfig,
  rpc: RpcClient,
  networkPassphrase: string
): Promise<RestorePlan> {
  const keyMap = await buildKeysForEntries(archivedEntries, config, rpc);
  const ledgerKeyXdrList = [...keyMap.values()];

  if (ledgerKeyXdrList.length === 0) {
    throw new Error("No ledger keys to restore");
  }

  const placeholderKeypair = Keypair.random();
  const placeholderAccount = new Account(placeholderKeypair.publicKey(), "0");

  const footprintEntries = ledgerKeyXdrList.map((k) => xdr.LedgerKey.fromXDR(k, "base64"));
  const sorobanDataBuilder = new SorobanDataBuilder()
    .setReadWrite(footprintEntries);

  const tx = new TransactionBuilder(placeholderAccount, {
    fee: String(BASE_FEE_STROOPS),
    networkPassphrase,
  })
    .setSorobanData(sorobanDataBuilder.build())
    .addOperation(Operation.restoreFootprint({}))
    .setTimeout(300)
    .build();

  const simResult = await rpc.simulateTransaction(tx.toXDR());
  if (simResult.error) {
    throw new Error(`Restore simulation failed: ${simResult.error}`);
  }

  const minFee = Number(simResult.minResourceFee ?? "0");
  const estimatedFee = Math.ceil(minFee * FEE_BUFFER_FACTOR) + BASE_FEE_STROOPS;
  assertFeeWithinCap(estimatedFee, config);

  return {
    contractId: config.id,
    entryKeys: [...keyMap.keys()],
    estimatedFee,
    sorobanData: simResult.transactionData ?? "",
  };
}

/**
 * Execute an extend plan: build the real transaction, sign, and submit.
 * Returns the operation result including txHash.
 *
 * In dry-run mode, returns without submitting (success=true, dryRun=true).
 */
export async function executeExtend(
  plan: ExtendPlan,
  config: ContractConfig,
  rpc: RpcClient,
  networkPassphrase: string,
  signerKeypair: Keypair,
  dryRun: boolean,
  _currentLedger: number
): Promise<OperationResult> {
  if (dryRun) {
    return {
      contractId: config.id,
      entryKeys: plan.entryKeys,
      operation: "extend",
      dryRun: true,
      success: true,
      feeCharged: plan.estimatedFee,
    };
  }

  const accountData = await rpc.getAccount(signerKeypair.publicKey());
  const account = new Account(accountData.accountId, accountData.sequence);
  const sorobanData = xdr.SorobanTransactionData.fromXDR(plan.sorobanData, "base64");
  const tx = new TransactionBuilder(account, {
    fee: String(plan.estimatedFee),
    networkPassphrase,
  })
    .setSorobanData(sorobanData)
    .addOperation(Operation.extendFootprintTtl({ extendTo: plan.ledgerExtendBy }))
    .setTimeout(300)
    .build();
  tx.sign(signerKeypair);
  const submitted = await rpc.sendTransaction(tx.toXDR());
  const success = submitted.status === "PENDING" || submitted.status === "DUPLICATE";
  return {
    contractId: config.id,
    entryKeys: plan.entryKeys,
    operation: "extend",
    dryRun: false,
    success,
    txHash: submitted.hash,
    feeCharged: success ? plan.estimatedFee : 0,
    error: success ? undefined : `Transaction status: ${submitted.status}`,
  };
}

/**
 * Execute a restore plan: build the real transaction, sign, and submit.
 */
export async function executeRestore(
  plan: RestorePlan,
  config: ContractConfig,
  rpc: RpcClient,
  networkPassphrase: string,
  signerKeypair: Keypair,
  dryRun: boolean
): Promise<OperationResult> {
  if (dryRun) {
    return {
      contractId: config.id,
      entryKeys: plan.entryKeys,
      operation: "restore",
      dryRun: true,
      success: true,
      feeCharged: plan.estimatedFee,
    };
  }

  const accountData = await rpc.getAccount(signerKeypair.publicKey());
  const account = new Account(accountData.accountId, accountData.sequence);
  const sorobanData = xdr.SorobanTransactionData.fromXDR(plan.sorobanData, "base64");
  const tx = new TransactionBuilder(account, {
    fee: String(plan.estimatedFee),
    networkPassphrase,
  })
    .setSorobanData(sorobanData)
    .addOperation(Operation.restoreFootprint({}))
    .setTimeout(300)
    .build();
  tx.sign(signerKeypair);
  const submitted = await rpc.sendTransaction(tx.toXDR());
  const success = submitted.status === "PENDING" || submitted.status === "DUPLICATE";
  return {
    contractId: config.id,
    entryKeys: plan.entryKeys,
    operation: "restore",
    dryRun: false,
    success,
    txHash: submitted.hash,
    feeCharged: success ? plan.estimatedFee : 0,
    error: success ? undefined : `Transaction status: ${submitted.status}`,
  };
}
