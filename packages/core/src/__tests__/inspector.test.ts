/**
 * Unit tests for the contract inspector.
 * Uses an injectable mock RpcClient — no live network calls.
 */

import { describe, it, expect, vi } from "vitest";
import { inspectContract, inspectContracts } from "../../src/inspector.js";
import type { ContractConfig, RpcClient } from "../../src/types.js";
import { daysToLedgers } from "../../src/ttl-status.js";
import { buildContractInstanceKey } from "../../src/ledger-keys.js";

// A dummy valid C-strkey contract ID (32 bytes of 0x01)
const CONTRACT_ID = "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526";

const makeMockConfig = (overrides: Partial<ContractConfig> = {}): ContractConfig => ({
  id: CONTRACT_ID,
  label: "Test Contract",
  watchInstance: true,
  watchCode: true,
  namedEntries: [],
  warnBelowDays: 30,
  extendBelowDays: 7,
  extendToDays: 90,
  maxFeeStroops: 500_000,
  ...overrides,
});

const CURRENT_LEDGER = 1_000_000;

function makeMockRpc(overrides: Partial<RpcClient> = {}): RpcClient {
  return {
    getAccount: vi.fn().mockResolvedValue({ accountId: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", sequence: "1" }),
    getLatestLedger: vi.fn().mockResolvedValue({ sequence: CURRENT_LEDGER }),
    getLedgerEntries: vi.fn().mockResolvedValue({
      latestLedger: CURRENT_LEDGER,
      entries: [],
    }),
    simulateTransaction: vi.fn().mockResolvedValue({
      error: undefined,
      transactionData: "AAAA==",
      minResourceFee: "1000",
    }),
    sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "abc123" }),
    getAccountBalance: vi.fn().mockResolvedValue(100_000_000n),
    ...overrides,
  };
}

describe("inspectContract", () => {
  it("classifies missing entries as archived", async () => {
    const rpc = makeMockRpc();
    const config = makeMockConfig();

    const result = await inspectContract(config, rpc);

    expect(result.contractId).toBe(CONTRACT_ID);
    expect(result.overallStatus).toBe("archived");
    // Instance entry missing → archived
    const instanceEntry = result.entries.find((e) => e.entryKey === "instance");
    expect(instanceEntry?.status).toBe("archived");
  });

  it("returns healthy status for entries with ample TTL", async () => {
    const instanceKey = buildContractInstanceKey(CONTRACT_ID);
    const liveUntil = CURRENT_LEDGER + daysToLedgers(90);

    // We can't easily build real XDR but we can test without watchCode
    const rpc = makeMockRpc({
      getLedgerEntries: vi.fn().mockImplementation(async (keys: string[]) => {
        const entries = keys
          .filter((k) => k === instanceKey)
          .map((k) => ({
            key: k,
            xdr: "AAAA==", // placeholder — extractWasmHashFromInstanceEntry will throw
            liveUntilLedgerSeq: liveUntil,
            lastModifiedLedgerSeq: CURRENT_LEDGER - 1000,
          }));
        return { latestLedger: CURRENT_LEDGER, entries };
      }),
    });

    const config = makeMockConfig({ watchCode: false }); // skip code entry to avoid XDR parsing
    const result = await inspectContract(config, rpc);

    expect(result.contractId).toBe(CONTRACT_ID);
    const instanceEntry = result.entries.find((e) => e.entryKey === "instance");
    expect(instanceEntry?.status).toBe("healthy");
    expect(instanceEntry?.remainingLedgers).toBe(daysToLedgers(90));
  });

  it("classifies warning when between warn and extend threshold", async () => {
    const instanceKey = buildContractInstanceKey(CONTRACT_ID);
    const liveUntil = CURRENT_LEDGER + daysToLedgers(20); // 20 days: warn=30, extend=7

    const rpc = makeMockRpc({
      getLedgerEntries: vi.fn().mockImplementation(async (keys: string[]) => {
        const entries = keys
          .filter((k) => k === instanceKey)
          .map((k) => ({
            key: k,
            xdr: "AAAA==",
            liveUntilLedgerSeq: liveUntil,
            lastModifiedLedgerSeq: CURRENT_LEDGER - 1000,
          }));
        return { latestLedger: CURRENT_LEDGER, entries };
      }),
    });

    const config = makeMockConfig({ watchCode: false });
    const result = await inspectContract(config, rpc);
    const instanceEntry = result.entries.find((e) => e.entryKey === "instance");
    expect(instanceEntry?.status).toBe("warning");
    expect(result.overallStatus).toBe("warning");
  });

  it("classifies critical when below extend threshold", async () => {
    const instanceKey = buildContractInstanceKey(CONTRACT_ID);
    const liveUntil = CURRENT_LEDGER + daysToLedgers(3); // 3 days, extend=7

    const rpc = makeMockRpc({
      getLedgerEntries: vi.fn().mockImplementation(async (keys: string[]) => {
        const entries = keys
          .filter((k) => k === instanceKey)
          .map((k) => ({
            key: k,
            xdr: "AAAA==",
            liveUntilLedgerSeq: liveUntil,
            lastModifiedLedgerSeq: CURRENT_LEDGER - 1000,
          }));
        return { latestLedger: CURRENT_LEDGER, entries };
      }),
    });

    const config = makeMockConfig({ watchCode: false });
    const result = await inspectContract(config, rpc);
    const instanceEntry = result.entries.find((e) => e.entryKey === "instance");
    expect(instanceEntry?.status).toBe("critical");
  });
});

describe("inspectContracts", () => {
  it("continues inspecting other contracts when one fails", async () => {
    const rpc = makeMockRpc({
      getLedgerEntries: vi
        .fn()
        .mockRejectedValueOnce(new Error("RPC timeout"))
        .mockResolvedValue({ latestLedger: CURRENT_LEDGER, entries: [] }),
    });
    const configs = [
      makeMockConfig({ id: CONTRACT_ID }),
      makeMockConfig({
        id: "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526",
        label: "Second Contract",
      }),
    ];

    const results = await inspectContracts(configs, rpc);
    expect(results).toHaveLength(2);
    // First failed
    expect(results[0].error).toBeTruthy();
    // Second succeeded (entries missing → archived)
    expect(results[1].error).toBeUndefined();
  });
});
