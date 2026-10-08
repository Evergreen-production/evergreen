/**
 * Contract TTL inspector — the primary read-only API of @evergreen/core.
 *
 * Discovers and fetches the TTL status of all watched entries for a
 * given contract. Uses the injectable RpcClient interface for all network calls,
 * enabling full testability with mock RPC clients.
 */

import type {
  ContractConfig,
  ContractStatus,
  EntryTtlStatus,
  RpcClient,
} from "./types.js";
import {
  buildContractInstanceKey,
  buildContractCodeKey,
  buildNamedEntryKey,
  extractWasmHashFromInstanceEntry,
} from "./ledger-keys.js";
import {
  buildEntryStatus,
  buildArchivedEntryStatus,
  worstStatus,
  resolveThresholds,
} from "./ttl-status.js";

/** Max number of LedgerKeys per getLedgerEntries call (protocol limit). */
const MAX_KEYS_PER_BATCH = 200;

/**
 * Inspect the TTL status for all watched entries in a contract.
 *
 * Performs:
 * 1. Fetches the contract instance entry => determines liveUntilLedgerSeq + wasm hash
 * 2. Fetches the contract code (Wasm) entry using the extracted wasm hash
 * 3. Fetches all named entries listed in config.namedEntries
 *
 * Entries that are missing from the RPC response are classified as "archived".
 */
export async function inspectContract(
  config: ContractConfig,
  rpc: RpcClient
): Promise<ContractStatus> {
  const { sequence: currentLedger } = await rpc.getLatestLedger();
  const thresholds = resolveThresholds(config);

  const entryStatuses: EntryTtlStatus[] = [];

  // Step 1: Build all keys we want to fetch
  // We always start with the instance key to get the wasm hash
  const instanceKey = buildContractInstanceKey(config.id);

  // Step 2: Fetch the instance entry first (we need the wasm hash for code entry)
  const instanceResult = await rpc.getLedgerEntries([instanceKey]);
  const instanceEntry = instanceResult.entries.find((e) => e.key === instanceKey);

  // Determine if instance is archived
  const watchInstance = config.watchInstance !== false;
  if (watchInstance) {
    if (instanceEntry) {
      entryStatuses.push(
        buildEntryStatus({
          contractId: config.id,
          entryKey: "instance",
          entryType: "contract_instance",
          durability: "persistent",
          liveUntilLedgerSeq: instanceEntry.liveUntilLedgerSeq,
          currentLedger,
          lastModifiedLedgerSeq: instanceEntry.lastModifiedLedgerSeq,
          thresholds,
        })
      );
    } else {
      entryStatuses.push(
        buildArchivedEntryStatus({
          contractId: config.id,
          entryKey: "instance",
          entryType: "contract_instance",
          durability: "persistent",
          currentLedger,
        })
      );
    }
  }

  // Step 3: Fetch contract code (Wasm) entry if the instance is known
  const watchCode = config.watchCode !== false;
  if (watchCode && instanceEntry) {
    let wasmHash: string | null = null;
    try {
      wasmHash = extractWasmHashFromInstanceEntry(instanceEntry.xdr);
    } catch {
      // Might be an asset contract, skip code entry
    }

    if (wasmHash) {
      const codeKey = buildContractCodeKey(wasmHash);
      await fetchAndBuildEntries(
        rpc,
        [{ key: codeKey, name: "code", type: "contract_code" as const, durability: "persistent" as const }],
        config.id,
        currentLedger,
        thresholds,
        entryStatuses
      );
    }
  } else if (watchCode && !instanceEntry) {
    // Instance is archived so code can't be fetched — mark code as archived too
    entryStatuses.push(
      buildArchivedEntryStatus({
        contractId: config.id,
        entryKey: "code",
        entryType: "contract_code",
        durability: "persistent",
        currentLedger,
      })
    );
  }

  // Step 4: Fetch named entries in batches
  if (config.namedEntries && config.namedEntries.length > 0) {
    const namedKeyInfos = config.namedEntries.map((entry) => ({
      key: buildNamedEntryKey(config.id, entry.ledgerKeyXdr, entry.durability),
      name: entry.name,
      type: (entry.durability === "persistent" ? "named_persistent" : "named_temporary") as
        | "named_persistent"
        | "named_temporary",
      durability: entry.durability,
    }));

    // Batch requests
    for (let i = 0; i < namedKeyInfos.length; i += MAX_KEYS_PER_BATCH) {
      const batch = namedKeyInfos.slice(i, i + MAX_KEYS_PER_BATCH);
      await fetchAndBuildEntries(
        rpc,
        batch,
        config.id,
        currentLedger,
        thresholds,
        entryStatuses
      );
    }
  }

  const overallStatus = worstStatus(entryStatuses.map((e) => e.status));

  return {
    contractId: config.id,
    label: config.label,
    overallStatus,
    entries: entryStatuses,
    checkedAt: new Date(),
  };
}

/**
 * Batch-fetches ledger entries and appends their status to the result array.
 * Missing entries are classified as archived.
 */
async function fetchAndBuildEntries(
  rpc: RpcClient,
  keyInfos: Array<{
    key: string;
    name: string;
    type: "contract_code" | "named_persistent" | "named_temporary";
    durability: "persistent" | "temporary";
  }>,
  contractId: string,
  currentLedger: number,
  thresholds: ReturnType<typeof resolveThresholds>,
  results: EntryTtlStatus[]
): Promise<void> {
  const keys = keyInfos.map((k) => k.key);
  const result = await rpc.getLedgerEntries(keys);

  // Build a lookup map from key -> entry
  const entryMap = new Map(result.entries.map((e) => [e.key, e]));

  for (const info of keyInfos) {
    const entry = entryMap.get(info.key);
    if (entry) {
      results.push(
        buildEntryStatus({
          contractId,
          entryKey: info.name,
          entryType: info.type,
          durability: info.durability,
          liveUntilLedgerSeq: entry.liveUntilLedgerSeq,
          currentLedger,
          lastModifiedLedgerSeq: entry.lastModifiedLedgerSeq,
          thresholds,
        })
      );
    } else {
      results.push(
        buildArchivedEntryStatus({
          contractId,
          entryKey: info.name,
          entryType: info.type,
          durability: info.durability,
          currentLedger,
        })
      );
    }
  }
}

/**
 * Inspect multiple contracts in sequence (the full per-run scan).
 *
 * Failures for an individual contract do not abort the entire run.
 * Errors are propagated as ContractStatus with all entries marked "archived"
 * and the error stored in a separate `error` field (returned as a wrapped result).
 */
export async function inspectContracts(
  configs: ContractConfig[],
  rpc: RpcClient
): Promise<Array<ContractStatus & { error?: string }>> {
  const results: Array<ContractStatus & { error?: string }> = [];

  for (const config of configs) {
    try {
      const status = await inspectContract(config, rpc);
      results.push(status);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({
        contractId: config.id,
        label: config.label,
        overallStatus: "archived",
        entries: [],
        checkedAt: new Date(),
        error: errorMsg,
      });
    }
  }

  return results;
}
