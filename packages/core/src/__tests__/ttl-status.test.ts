/**
 * Unit tests for core TTL status logic.
 * Pure functions — no network calls, no mocks needed.
 */

import { describe, it, expect } from "vitest";
import {
  daysToLedgers,
  ledgersToSeconds,
  classifyStatus,
  worstStatus,
  buildEntryStatus,
  buildArchivedEntryStatus,
  resolveThresholds,
} from "../../src/ttl-status.js";
import type { ContractConfig, ThresholdLedgers } from "../../src/types.js";

const mockConfig: ContractConfig = {
  id: "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526",
  label: "Test Contract",
  watchInstance: true,
  watchCode: true,
  namedEntries: [],
  warnBelowDays: 30,
  extendBelowDays: 7,
  extendToDays: 90,
  maxFeeStroops: 500_000,
};

const mockThresholds: ThresholdLedgers = {
  warn: daysToLedgers(30),
  extend: daysToLedgers(7),
  extendTo: daysToLedgers(90),
};

describe("daysToLedgers", () => {
  it("converts 1 day to ~17280 ledgers (at 5s/ledger)", () => {
    expect(daysToLedgers(1)).toBe(17280);
  });

  it("converts 7 days correctly", () => {
    expect(daysToLedgers(7)).toBe(7 * 17280);
  });

  it("converts 30 days correctly", () => {
    expect(daysToLedgers(30)).toBe(30 * 17280);
  });
});

describe("ledgersToSeconds", () => {
  it("converts ledgers to seconds at 5s each", () => {
    expect(ledgersToSeconds(100)).toBe(500);
    expect(ledgersToSeconds(0)).toBe(0);
  });
});

describe("classifyStatus", () => {
  it("returns 'healthy' when well above warn threshold", () => {
    expect(classifyStatus(daysToLedgers(60), mockThresholds)).toBe("healthy");
  });

  it("returns 'warning' when below warn but above extend threshold", () => {
    const remaining = daysToLedgers(20); // 20 days, warn=30, extend=7
    expect(classifyStatus(remaining, mockThresholds)).toBe("warning");
  });

  it("returns 'critical' when at or below extend threshold", () => {
    const remaining = daysToLedgers(6); // 6 days, extend threshold = 7
    expect(classifyStatus(remaining, mockThresholds)).toBe("critical");
  });

  it("returns 'critical' when exactly at extend threshold", () => {
    expect(classifyStatus(daysToLedgers(7), mockThresholds)).toBe("critical");
  });

  it("returns 'archived' when remainingLedgers is 0", () => {
    expect(classifyStatus(0, mockThresholds)).toBe("archived");
  });

  it("returns 'archived' when remainingLedgers is negative", () => {
    expect(classifyStatus(-100, mockThresholds)).toBe("archived");
  });
});

describe("worstStatus", () => {
  it("returns healthy when all healthy", () => {
    expect(worstStatus(["healthy", "healthy"])).toBe("healthy");
  });

  it("returns warning when mixed healthy+warning", () => {
    expect(worstStatus(["healthy", "warning"])).toBe("warning");
  });

  it("returns critical when mixed", () => {
    expect(worstStatus(["healthy", "warning", "critical"])).toBe("critical");
  });

  it("returns archived when any is archived", () => {
    expect(worstStatus(["critical", "archived", "warning"])).toBe("archived");
  });

  it("returns healthy for empty array", () => {
    expect(worstStatus([])).toBe("healthy");
  });
});

describe("buildEntryStatus", () => {
  const currentLedger = 1_000_000;
  const liveUntilLedgerSeq = 1_000_000 + daysToLedgers(60); // 60 days remaining

  it("builds a healthy entry status", () => {
    const result = buildEntryStatus({
      contractId: mockConfig.id,
      entryKey: "instance",
      entryType: "contract_instance",
      durability: "persistent",
      liveUntilLedgerSeq,
      currentLedger,
      lastModifiedLedgerSeq: 999_000,
      thresholds: mockThresholds,
    });

    expect(result.status).toBe("healthy");
    expect(result.remainingLedgers).toBe(liveUntilLedgerSeq - currentLedger);
    expect(result.contractId).toBe(mockConfig.id);
    expect(result.entryKey).toBe("instance");
    expect(result.entryType).toBe("contract_instance");
    expect(result.durability).toBe("persistent");
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("builds a warning entry correctly", () => {
    const warningLiveUntil = currentLedger + daysToLedgers(20);
    const result = buildEntryStatus({
      contractId: mockConfig.id,
      entryKey: "code",
      entryType: "contract_code",
      durability: "persistent",
      liveUntilLedgerSeq: warningLiveUntil,
      currentLedger,
      lastModifiedLedgerSeq: 999_000,
      thresholds: mockThresholds,
    });
    expect(result.status).toBe("warning");
  });

  it("builds a critical entry correctly", () => {
    const criticalLiveUntil = currentLedger + daysToLedgers(3);
    const result = buildEntryStatus({
      contractId: mockConfig.id,
      entryKey: "instance",
      entryType: "contract_instance",
      durability: "persistent",
      liveUntilLedgerSeq: criticalLiveUntil,
      currentLedger,
      lastModifiedLedgerSeq: 999_000,
      thresholds: mockThresholds,
    });
    expect(result.status).toBe("critical");
  });
});

describe("buildArchivedEntryStatus", () => {
  it("returns archived status with zero liveUntil", () => {
    const result = buildArchivedEntryStatus({
      contractId: mockConfig.id,
      entryKey: "instance",
      entryType: "contract_instance",
      durability: "persistent",
      currentLedger: 1_000_000,
    });
    expect(result.status).toBe("archived");
    expect(result.liveUntilLedgerSeq).toBe(0);
    expect(result.remainingLedgers).toBe(-1);
    expect(result.remainingSeconds).toBe(0);
  });
});

describe("resolveThresholds", () => {
  it("resolves thresholds from contract config", () => {
    const thresholds = resolveThresholds(mockConfig);
    expect(thresholds.warn).toBe(daysToLedgers(30));
    expect(thresholds.extend).toBe(daysToLedgers(7));
    expect(thresholds.extendTo).toBe(daysToLedgers(90));
  });
});
