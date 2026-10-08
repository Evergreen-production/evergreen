import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StateStore } from "../state-store.js";
import { unlinkSync, existsSync } from "node:fs";

const TEST_DB = "./test-evergreen.db";

describe("StateStore", () => {
  let store: StateStore;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    store = new StateStore(TEST_DB);
  });

  afterEach(() => {
    store.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("creates and finishes run records", () => {
    const runId = store.startRun();
    expect(runId).toBeGreaterThan(0);

    store.finishRun(runId, {
      contractsChecked: 3,
      errorsCount: 0,
      extendCount: 1,
      restoreCount: 0,
      totalFeeSpent: 500,
    });

    const recent = store.getRecentRuns(10);
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe(runId);
    expect(recent[0].contractsChecked).toBe(3);
    expect(recent[0].extendCount).toBe(1);
    expect(recent[0].totalFeeSpent).toBe(500);
  });

  it("deduplicates alerts using cooldown", () => {
    const key = "C123:instance:warning";
    const cooldown = 3600; // 1 hour

    // First time should return true (should send alert)
    const first = store.shouldAlert(key, cooldown);
    expect(first).toBe(true);

    // Second time within cooldown should return false
    const second = store.shouldAlert(key, cooldown);
    expect(second).toBe(false);

    // Clearing cooldown allows alerting again
    store.clearAlertCooldown(key);
    const third = store.shouldAlert(key, cooldown);
    expect(third).toBe(true);
  });

  it("tracks daily spend correctly", () => {
    expect(store.getDailySpend()).toBe(0);

    store.addDailySpend(100);
    expect(store.getDailySpend()).toBe(100);

    store.addDailySpend(400);
    expect(store.getDailySpend()).toBe(500);
  });
});
