import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AlertManager } from "../alerts.js";
import { StateStore } from "../state-store.js";
import { unlinkSync, existsSync } from "node:fs";

const TEST_DB = "./test-alerts-evergreen.db";

describe("AlertChannels & AlertManager", () => {
  let store: StateStore;

  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    store = new StateStore(TEST_DB);
  });

  afterEach(() => {
    store.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  it("sends alerts to channel and enforces deduplication", async () => {
    const mockChannel = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    const manager = new AlertManager([mockChannel], store, 3600);

    const payload = {
      level: "warning" as const,
      title: "TTL Warning",
      message: "Contract TTL low",
      contractId: "C123",
      entryKey: "instance",
      timestamp: new Date(),
    };

    // First call sends alert
    await manager.send(payload);
    expect(mockChannel.send).toHaveBeenCalledTimes(1);

    // Immediate second call is suppressed by cooldown
    await manager.send(payload);
    expect(mockChannel.send).toHaveBeenCalledTimes(1);

    // Recovered clears cooldown
    manager.clearCooldown("C123", "instance", "warning");
    await manager.send(payload);
    expect(mockChannel.send).toHaveBeenCalledTimes(2);
  });
});
