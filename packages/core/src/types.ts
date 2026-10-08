/**
 * Core type definitions for the Evergreen TTL keeper.
 *
 * These types represent ledger entry statuses, configuration structures,
 * and transaction results. They are the shared language across core, cli, and keeper.
 */

// ─── Entry Classification ───────────────────────────────────────────────────

/** The durability type of a Soroban ledger entry. */
export type Durability = "persistent" | "temporary";

/** The type of a monitored ledger entry. */
export type EntryType =
  | "contract_instance" // xdr.LedgerKeyContractData with scvLedgerKeyContractInstance
  | "contract_code" // xdr.LedgerKeyContractCode (the Wasm bytecode entry)
  | "named_persistent" // named persistent ContractData entry
  | "named_temporary"; // named temporary ContractData entry

/** The health status of a ledger entry's TTL. */
export type EntryStatus = "healthy" | "warning" | "critical" | "archived";

// ─── Entry Result ────────────────────────────────────────────────────────────

/** The full TTL status for a single ledger entry. */
export interface EntryTtlStatus {
  contractId: string;
  entryKey: string; // stable string key: "instance", "code", or user-defined name
  entryType: EntryType;
  durability: Durability;
  /** The ledger sequence number when this entry's TTL expires. 0 if archived/missing. */
  liveUntilLedgerSeq: number;
  /** The current ledger sequence number at time of check. */
  currentLedger: number;
  /** Remaining ledgers before TTL expiry. Negative if already archived. */
  remainingLedgers: number;
  /** Estimated remaining time in seconds, based on 5-second ledger close time. */
  remainingSeconds: number;
  /** Approximate UTC date of expiry. */
  expiresAt: Date;
  /** Health classification based on configured thresholds. */
  status: EntryStatus;
  /** The ledger this entry was last modified at. */
  lastModifiedLedgerSeq: number;
}

// ─── Contract Status ─────────────────────────────────────────────────────────

/** Aggregated status for all watched entries of a single contract. */
export interface ContractStatus {
  contractId: string;
  label: string;
  /** Overall worst status across all entries. */
  overallStatus: EntryStatus;
  entries: EntryTtlStatus[];
  checkedAt: Date;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/** A named entry key to watch in a contract. */
export interface WatchedEntry {
  /** Human-readable name for this entry (used as entryKey). */
  name: string;
  /** The base64-encoded XDR of the LedgerKey for this entry. */
  ledgerKeyXdr: string;
  /** Durability type of this entry. */
  durability: Durability;
}

/** Per-contract configuration. */
export interface ContractConfig {
  id: string;
  label: string;
  /** Whether to watch the contract instance entry. Default: true. */
  watchInstance?: boolean;
  /** Whether to watch the contract code (Wasm) entry. Default: true. */
  watchCode?: boolean;
  /** Additional named entries to watch. */
  namedEntries?: WatchedEntry[];
  /** Alert when TTL is below this many days. */
  warnBelowDays: number;
  /** Extend when TTL is below this many days. */
  extendBelowDays: number;
  /** Extend TTL to this many days from current ledger. */
  extendToDays: number;
  /** Max fee in stroops per extend/restore transaction. */
  maxFeeStroops: number;
  /** Optional per-contract daily spend cap in stroops. */
  maxDailySpendStroops?: number;
}

/** Alert channel configuration. */
export interface AlertChannelConfig {
  type: "webhook" | "slack" | "discord";
  url: string;
  /** Optional bearer token for the webhook receiver. */
  token?: string;
}

/** Top-level Evergreen configuration (parsed from evergreen.toml). */
export interface EvergreenConfig {
  network: "testnet" | "mainnet" | "futurenet" | "standalone";
  rpcUrl: string;
  networkPassphrase: string;
  /** How often to run checks, in seconds. */
  checkIntervalSeconds: number;
  /** Global daily spend cap across all contracts, in stroops. */
  maxDailySpendStroops?: number;
  /** Minimum keeper account balance in stroops before alert fires. */
  minKeeperBalanceStroops?: number;
  contracts: ContractConfig[];
  alerts: AlertChannelConfig[];
  /** SQLite database path for keeper state. Default: ./evergreen.db. */
  dbPath?: string;
  /** Bearer token for keeper HTTP status API. Optional. */
  keeperApiToken?: string;
}

// ─── RPC Client Interface ────────────────────────────────────────────────────

/**
 * Minimal RPC interface that core depends on.
 * Injectable for testing without live network calls.
 */
export interface RpcClient {
  /** Returns the account id and current sequence needed to build a transaction. */
  getAccount(address: string): Promise<{ accountId: string; sequence: string }>;
  /** Returns the latest ledger sequence number. */
  getLatestLedger(): Promise<{ sequence: number }>;
  /**
   * Fetches raw ledger entry data for a list of base64-encoded XDR LedgerKeys.
   * Returns entries that exist (archived/missing entries are absent).
   */
  getLedgerEntries(keys: string[]): Promise<{
    latestLedger: number;
    entries: Array<{
      key: string; // base64 XDR
      xdr: string; // base64 XDR of LedgerEntryData
      liveUntilLedgerSeq: number;
      lastModifiedLedgerSeq: number;
    }>;
  }>;
  /**
   * Simulates a transaction (for footprint resolution and fee estimation).
   * Takes a base64-encoded XDR transaction envelope string.
   */
  simulateTransaction(txXdr: string): Promise<SimulateResponse>;
  /**
   * Submits a signed transaction.
   * Takes a base64-encoded XDR transaction envelope string.
   */
  sendTransaction(txXdr: string): Promise<SendResponse>;
  /**
   * Gets the current balance of an account in stroops.
   */
  getAccountBalance(address: string): Promise<bigint>;
}

/** Result from simulateTransaction. */
export interface SimulateResponse {
  error?: string;
  results?: Array<{ auth: string[]; xdr: string }>;
  /** Footprint XDR base64 */
  transactionData?: string;
  minResourceFee?: string;
  events?: string[];
}

/** Result from sendTransaction. */
export interface SendResponse {
  status: "PENDING" | "DUPLICATE" | "TRY_AGAIN_LATER" | "ERROR";
  hash?: string;
  errorResultXdr?: string;
}

// ─── Extend / Restore Results ────────────────────────────────────────────────

/** Result of an extend or restore operation. */
export interface OperationResult {
  contractId: string;
  entryKeys: string[];
  operation: "extend" | "restore";
  /** Whether this was a dry-run (no transaction submitted). */
  dryRun: boolean;
  success: boolean;
  /** Transaction hash if submitted. */
  txHash?: string;
  /** Fee charged (stroops). */
  feeCharged?: number;
  /** Error message if unsuccessful. */
  error?: string;
}

// ─── Thresholds ──────────────────────────────────────────────────────────────

/** Resolved threshold values for a contract, in ledgers. */
export interface ThresholdLedgers {
  warn: number;
  extend: number;
  extendTo: number;
}

// ─── Approximate ledger close time constant ──────────────────────────────────
/** Average Stellar ledger close time in seconds (approximate). */
export const LEDGER_CLOSE_SECONDS = 5;
/** Max TTL that can be requested (protocol-defined, in ledgers). */
export const MAX_TTL_LEDGERS = 3110400; // ~6 months at 5s/ledger
