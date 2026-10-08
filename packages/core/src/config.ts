/**
 * Config schema validation using Zod.
 * Parses and validates evergreen.toml content into strongly-typed config objects.
 *
 * Secret keys are NEVER fields in this schema. The schema intentionally
 * omits any secretKey/privateKey field; if accidentally present in a parsed
 * file, the extra keys are stripped by Zod's strict parsing.
 */

import { z } from "zod";
import type { EvergreenConfig, ContractConfig, AlertChannelConfig, WatchedEntry } from "./types.js";

// ─── Watched Entry Schema ─────────────────────────────────────────────────────

const WatchedEntrySchema = z.object({
  name: z.string().min(1, "Entry name must not be empty"),
  ledgerKeyXdr: z.string().min(1, "ledgerKeyXdr must be a base64-encoded XDR LedgerKey"),
  durability: z.enum(["persistent", "temporary"]),
});

// ─── Contract Config Schema ───────────────────────────────────────────────────

const ContractConfigSchema = z.object({
  id: z
    .string()
    .regex(/^C[A-Z2-7]{55}$/, "Contract ID must be a valid Stellar C... strkey"),
  label: z.string().min(1).default("Unnamed Contract"),
  watchInstance: z.boolean().default(true),
  watchCode: z.boolean().default(true),
  namedEntries: z.array(WatchedEntrySchema).default([]),
  warnBelowDays: z.number().positive().default(30),
  extendBelowDays: z.number().positive().default(7),
  extendToDays: z.number().positive().default(90),
  maxFeeStroops: z.number().int().positive().default(500_000),
  maxDailySpendStroops: z.number().int().positive().optional(),
});

// ─── Alert Channel Schema ─────────────────────────────────────────────────────

const AlertChannelSchema = z.object({
  type: z.enum(["webhook", "slack", "discord"]),
  url: z.string().url("Alert channel URL must be a valid HTTPS URL"),
  token: z.string().optional(),
});

// ─── Top-Level Config Schema ──────────────────────────────────────────────────

const EvergreenConfigSchema = z.object({
  network: z
    .enum(["testnet", "mainnet", "futurenet", "standalone"])
    .default("testnet"),
  rpcUrl: z
    .string()
    .url("rpcUrl must be a valid URL")
    .default("https://soroban-testnet.stellar.org"),
  networkPassphrase: z
    .string()
    .min(1)
    .default("Test SDF Network ; September 2015"),
  checkIntervalSeconds: z.number().int().min(60).default(3600),
  maxDailySpendStroops: z.number().int().positive().optional(),
  minKeeperBalanceStroops: z.number().int().nonnegative().optional(),
  contracts: z.array(ContractConfigSchema).min(1, "Must configure at least one contract"),
  alerts: z.array(AlertChannelSchema).default([]),
  dbPath: z.string().optional(),
  keeperApiToken: z.string().optional(),
}).strict();

// ─── TOML Shape (raw values before camelCase normalization) ──────────────────

/**
 * Raw TOML shape (snake_case keys as in the config file).
 * We normalize to camelCase before zod validation.
 */
interface RawTomlContract {
  id: string;
  label?: string;
  watch_instance?: boolean;
  watch_code?: boolean;
  named_entries?: Array<{
    name: string;
    ledger_key_xdr: string;
    durability: string;
  }>;
  warn_below_days?: number;
  extend_below_days?: number;
  extend_to_days?: number;
  max_fee_stroops?: number;
  max_daily_spend_stroops?: number;
}

interface RawTomlAlert {
  type: string;
  url: string;
  token?: string;
}

interface RawToml {
  network?: string;
  rpc_url?: string;
  network_passphrase?: string;
  check_interval_seconds?: number;
  max_daily_spend_stroops?: number;
  min_keeper_balance_stroops?: number;
  db_path?: string;
  keeper_api_token?: string;
  contracts?: Record<string, RawTomlContract> | RawTomlContract[];
  alerts?: RawTomlAlert[];
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Normalize a contracts table/array from TOML to ContractConfig array.
 * TOML inline: [contracts.my_contract] results in an object; [[contracts]] results in array.
 */
function normalizeContracts(
  raw: Record<string, RawTomlContract> | RawTomlContract[] | undefined
): object[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(normalizeContract);
  }
  // Object form: { name: contract }
  return Object.entries(raw).map(([, contract]) => normalizeContract(contract));
}

function normalizeContract(c: RawTomlContract): object {
  return {
    id: c.id,
    label: c.label,
    watchInstance: c.watch_instance,
    watchCode: c.watch_code,
    namedEntries: (c.named_entries ?? []).map((ne) => ({
      name: ne.name,
      ledgerKeyXdr: ne.ledger_key_xdr,
      durability: ne.durability,
    })),
    warnBelowDays: c.warn_below_days,
    extendBelowDays: c.extend_below_days,
    extendToDays: c.extend_to_days,
    maxFeeStroops: c.max_fee_stroops,
    maxDailySpendStroops: c.max_daily_spend_stroops,
  };
}

/**
 * Parse and validate a raw TOML object (as returned by smol-toml) into
 * a strongly-typed EvergreenConfig.
 *
 * Throws a Zod validation error with clear field-level messages on failure.
 */
export function parseConfig(raw: unknown): EvergreenConfig {
  const toml = raw as RawToml;

  // Normalize from snake_case TOML to camelCase schema
  const normalized = {
    network: toml.network,
    rpcUrl: toml.rpc_url,
    networkPassphrase: toml.network_passphrase,
    checkIntervalSeconds: toml.check_interval_seconds,
    maxDailySpendStroops: toml.max_daily_spend_stroops,
    minKeeperBalanceStroops: toml.min_keeper_balance_stroops,
    dbPath: toml.db_path,
    keeperApiToken: toml.keeper_api_token,
    contracts: normalizeContracts(toml.contracts as Record<string, RawTomlContract> | undefined),
    alerts: (toml.alerts ?? []).map((a) => ({
      type: a.type,
      url: a.url,
      token: a.token,
    })),
  };

  const result = EvergreenConfigSchema.safeParse(normalized);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid evergreen.toml configuration:\n${issues}`);
  }

  return result.data as EvergreenConfig;
}

/** Generate a starter evergreen.toml as a string. */
export function generateStarterToml(): string {
  return `# Evergreen configuration file
# https://github.com/stellar/evergreen/docs/config-reference.md
#
# SECURITY: Never put secret keys here.
# Set EVERGREEN_SECRET_KEY environment variable instead.

network = "testnet"
rpc_url = "https://soroban-testnet.stellar.org"
network_passphrase = "Test SDF Network ; September 2015"

# How often to run TTL checks (seconds). Minimum 60.
check_interval_seconds = 3600

# Global daily spend cap across all contracts (in stroops). Default: 1 XLM.
max_daily_spend_stroops = 10_000_000

# Alert when keeper account balance drops below this (in stroops). Default: 5 XLM.
min_keeper_balance_stroops = 50_000_000

[contracts.my_contract]
id = "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
label = "My Soroban Contract"
warn_below_days = 30
extend_below_days = 7
extend_to_days = 90
max_fee_stroops = 500_000

# Optional: additional named entries (persistent contract data)
# [[contracts.my_contract.named_entries]]
# name = "my_key"
# ledger_key_xdr = "<base64 XDR of ScVal key>"
# durability = "persistent"

# Optional: alert channels
# [[alerts]]
# type = "slack"
# url = "https://hooks.slack.com/services/..."

# [[alerts]]
# type = "discord"
# url = "https://discord.com/api/webhooks/..."

# [[alerts]]
# type = "webhook"
# url = "https://your-webhook.example.com/alerts"
`;
}
