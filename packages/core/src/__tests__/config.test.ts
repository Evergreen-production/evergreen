/**
 * Unit tests for config validation.
 */

import { describe, it, expect } from "vitest";
import { parseConfig, generateStarterToml } from "../../src/config.js";

const VALID_CONTRACT_ID = "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526";

const validRawConfig = {
  network: "testnet",
  rpc_url: "https://soroban-testnet.stellar.org",
  network_passphrase: "Test SDF Network ; September 2015",
  contracts: {
    my_contract: {
      id: VALID_CONTRACT_ID,
      label: "Test",
      warn_below_days: 30,
      extend_below_days: 7,
      extend_to_days: 90,
      max_fee_stroops: 500_000,
    },
  },
};

describe("parseConfig", () => {
  it("parses a valid minimal config", () => {
    const config = parseConfig(validRawConfig);
    expect(config.network).toBe("testnet");
    expect(config.contracts).toHaveLength(1);
    expect(config.contracts[0].id).toBe(VALID_CONTRACT_ID);
    expect(config.contracts[0].warnBelowDays).toBe(30);
    expect(config.contracts[0].extendBelowDays).toBe(7);
  });

  it("applies default values for missing optional fields", () => {
    const config = parseConfig({
      ...validRawConfig,
      check_interval_seconds: undefined,
    });
    expect(config.checkIntervalSeconds).toBe(3600);
    expect(config.alerts).toEqual([]);
  });

  it("throws on invalid contract ID format", () => {
    expect(() =>
      parseConfig({
        ...validRawConfig,
        contracts: { bad: { id: "GXXXXXXXX", label: "Bad" } },
      })
    ).toThrow(/Invalid evergreen\.toml configuration/);
  });

  it("throws when no contracts are configured", () => {
    expect(() =>
      parseConfig({ ...validRawConfig, contracts: {} })
    ).toThrow(/Invalid evergreen\.toml configuration/);
  });

  it("throws on invalid network value", () => {
    expect(() =>
      parseConfig({ ...validRawConfig, network: "banana" })
    ).toThrow(/Invalid evergreen\.toml configuration/);
  });

  it("throws on invalid alert URL", () => {
    expect(() =>
      parseConfig({
        ...validRawConfig,
        alerts: [{ type: "slack", url: "not-a-url" }],
      })
    ).toThrow(/Invalid evergreen\.toml configuration/);
  });

  it("accepts mainnet network", () => {
    const config = parseConfig({ ...validRawConfig, network: "mainnet" });
    expect(config.network).toBe("mainnet");
  });

  it("parses named entries", () => {
    const config = parseConfig({
      ...validRawConfig,
      contracts: {
        my_contract: {
          ...Object.values(validRawConfig.contracts)[0],
          named_entries: [
            {
              name: "my_key",
              ledger_key_xdr: "AAAAFA==",
              durability: "persistent",
            },
          ],
        },
      },
    });
    expect(config.contracts[0].namedEntries).toHaveLength(1);
    expect(config.contracts[0].namedEntries![0].name).toBe("my_key");
    expect(config.contracts[0].namedEntries![0].durability).toBe("persistent");
  });

  it("does not expose secretKey in parsed config (security check)", () => {
    // If an evil user adds a secretKey to the raw config, it must NOT appear
    // in the parsed output config. The normalization step explicitly only picks
    // known fields, so secret_key is silently dropped — never reaching parsed config.
    const rawWithSecret = {
      ...validRawConfig,
      secret_key: "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    };
    // Should parse successfully but NOT expose secret_key in the output
    const config = parseConfig(rawWithSecret);
    // The parsed config has no secretKey field whatsoever
    expect((config as unknown as Record<string, unknown>)["secretKey"]).toBeUndefined();
    expect((config as unknown as Record<string, unknown>)["secret_key"]).toBeUndefined();
    // JSON serialization (e.g., for status API) should not include any secret
    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain("SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
    expect(serialized.toLowerCase()).not.toMatch(/secret/);
  });
});

describe("generateStarterToml", () => {
  it("generates a non-empty TOML string", () => {
    const toml = generateStarterToml();
    expect(toml).toContain("network = \"testnet\"");
    expect(toml).toContain("EVERGREEN_SECRET_KEY");
    expect(toml).toContain("warn_below_days");
    // Ensure no secret key is mentioned as a config field
    expect(toml.toLowerCase()).not.toContain("secret_key =");
  });
});
