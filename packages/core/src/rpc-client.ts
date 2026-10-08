/**
 * RPC client implementation using @stellar/stellar-sdk + raw fetch for getLedgerEntries.
 *
 * Why raw fetch for getLedgerEntries?
 * The SDK's server.getLedgerEntries() expects keys as xdr.LedgerKey objects from
 * its internal stellar-base bundle. When imported via ESM, our xdr.LedgerKey
 * objects come from a different module instance and .toXDR() is not found on them
 * due to class identity mismatch. Direct JSON-RPC fetch bypasses this entirely.
 * Recorded in DECISIONS.md as ADR-006.
 */

import { rpc as StellarRpc, Keypair } from "@stellar/stellar-sdk";
import type {
  RpcClient,
  SimulateResponse,
  SendResponse,
} from "./types.js";

/** Default Stellar testnet RPC URL. */
export const TESTNET_RPC_URL = "https://soroban-testnet.stellar.org";
/** Default Stellar mainnet RPC URL. */
export const MAINNET_RPC_URL = "https://soroban-rpc.stellar.org";

let _fetchImpl: typeof fetch = globalThis.fetch;

/** Override the fetch implementation (useful for testing). */
export function setFetchImpl(f: typeof fetch) {
  _fetchImpl = f;
}

let _rpcIdCounter = 1;

/**
 * Make a raw JSON-RPC POST to the Stellar RPC endpoint.
 * This bypasses the SDK's class binding for getLedgerEntries.
 */
async function rpcPost<T>(url: string, method: string, params: unknown): Promise<T> {
  const id = _rpcIdCounter++;
  const resp = await _fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!resp.ok) {
    throw new Error(`RPC HTTP error: ${resp.status} ${resp.statusText}`);
  }
  const json = (await resp.json()) as { result?: T; error?: { code: number; message: string } };
  if (json.error) {
    throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
  }
  return json.result!;
}

/** Create a production RpcClient against the given RPC URL. */
export function createRpcClient(rpcUrl: string): RpcClient {
  const server = new StellarRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });

  return {
    async getAccount(address: string) {
      const account = await server.getAccount(address);
      return { accountId: account.accountId(), sequence: account.sequenceNumber() };
    },

    async getLatestLedger() {
      const result = await server.getLatestLedger();
      return { sequence: result.sequence };
    },

    async getLedgerEntries(keys: string[]) {
      if (keys.length === 0) return { latestLedger: 0, entries: [] };
      const result = await rpcPost<{
        latestLedger: number;
        entries?: Array<{
          key: string;
          xdr: string;
          liveUntilLedgerSeq: number;
          lastModifiedLedgerSeq: number;
        }>;
      }>(rpcUrl, "getLedgerEntries", { keys });
      return {
        latestLedger: result.latestLedger,
        entries: result.entries ?? [],
      };
    },

    async simulateTransaction(txXdr: string): Promise<SimulateResponse> {
      const result = await rpcPost<{
        error?: string;
        results?: Array<{ auth: string[]; xdr: string }>;
        transactionData?: string;
        minResourceFee?: string;
        events?: string[];
      }>(rpcUrl, "simulateTransaction", { transaction: txXdr });
      return result;
    },

    async sendTransaction(txXdr: string): Promise<SendResponse> {
      const result = await rpcPost<{
        status: string;
        hash?: string;
        errorResultXdr?: string;
      }>(rpcUrl, "sendTransaction", { transaction: txXdr });
      return result as SendResponse;
    },

    async getAccountBalance(address: string): Promise<bigint> {
      // The SDK account response has no balance list, so query the ledger entry.
      // The getAccount method returns a simplified Account with no balances.
      // Use getLatestLedger + raw account entry lookup.
      // Actually sdk server.getAccount only has sequenceNumber.
      // For balance we need raw ledger entry lookup.
      const accountKey = buildAccountKey(address);
      const result = await rpcPost<{
        latestLedger: number;
        entries?: Array<{ key: string; xdr: string; liveUntilLedgerSeq: number; lastModifiedLedgerSeq: number }>;
      }>(rpcUrl, "getLedgerEntries", { keys: [accountKey] });
      if (!result.entries || result.entries.length === 0) {
        return 0n;
      }
      // Parse XDR account entry to get balance
      const { xdr } = await import("@stellar/stellar-sdk");
      const entryXdr = result.entries[0].xdr;
      const ledgerEntry = xdr.LedgerEntry.fromXDR(entryXdr, "base64");
      const accountEntry = ledgerEntry.data().account();
      return BigInt(accountEntry.balance().toString());
    },
  };
}

/**
 * Build the base64-encoded XDR LedgerKey for an account entry.
 * We do this inline with XDR to avoid the SDK class identity mismatch.
 */
function buildAccountKey(address: string): string {
  const kp = Keypair.fromPublicKey(address);
  const publicKeyBytes = kp.rawPublicKey();

  // Build LedgerKey.account via XDR
  const { xdr } = require("@stellar/stellar-sdk");
  const key = xdr.LedgerKey.account(new xdr.LedgerKeyAccount({
    accountId: xdr.AccountId.publicKeyTypeEd25519(publicKeyBytes),
  }));
  return key.toXDR("base64");
}
