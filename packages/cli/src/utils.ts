/**
 * Shared CLI utilities: config loading, RPC building, output formatting.
 */

import { readFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";
import {
  createRpcClient,
  parseConfig,
  TESTNET_RPC_URL,
  MAINNET_RPC_URL,
} from "@evergreen/core";
import type { EvergreenConfig, RpcClient } from "@evergreen/core";

/** Load and parse evergreen.toml from the given path. */
export function loadConfig(configPath: string): EvergreenConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    throw new Error(`Cannot read config file: ${configPath}`);
  }
  const toml = parseToml(raw);
  return parseConfig(toml);
}

/** Build an RPC client from config + CLI overrides. */
export function buildRpcClient(
  config: EvergreenConfig,
  opts: { network?: string; rpcUrl?: string }
): RpcClient {
  const rpcUrl = opts.rpcUrl ?? config.rpcUrl;
  return createRpcClient(rpcUrl);
}

/** Print Mainnet warning when mainnet is used. */
export function warnIfMainnet(config: EvergreenConfig): void {
  if (config.network === "mainnet") {
    console.warn(
      "\n⚠️  WARNING: You are operating against MAINNET. Real transactions will be submitted and real stroops will be spent.\n"
    );
  }
}

/** Print a redacted secret key presence indicator (never the key itself). */
export function getSignerKeypair(opts: { secretKey?: string }) {
  const { Keypair } = require("@stellar/stellar-sdk");
  const rawKey = opts.secretKey ?? process.env["EVERGREEN_SECRET_KEY"];
  if (!rawKey) {
    throw new Error(
      "No secret key provided. Set EVERGREEN_SECRET_KEY environment variable or use --secret-key flag."
    );
  }
  try {
    return Keypair.fromSecret(rawKey);
  } catch {
    throw new Error("Invalid secret key. Ensure EVERGREEN_SECRET_KEY is a valid Stellar secret key (S...).");
  }
}

// ─── Output formatters ────────────────────────────────────────────────────────

import type { ContractStatus } from "@evergreen/core";

/** ANSI color helpers. */
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function statusColor(status: string): string {
  switch (status) {
    case "healthy":
      return colors.green;
    case "warning":
      return colors.yellow;
    case "critical":
      return colors.red;
    case "archived":
      return colors.red + colors.bold;
    default:
      return colors.reset;
  }
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "expired";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor(seconds / 60);
  return `${mins}m`;
}

/** Render contract statuses as a human-readable table. */
export function printTable(statuses: ContractStatus[]): void {
  for (const contract of statuses) {
    const sc = statusColor(contract.overallStatus);
    console.log(
      `\n${colors.bold}Contract: ${contract.label}${colors.reset} (${colors.cyan}${contract.contractId}${colors.reset})`
    );
    console.log(
      `  Overall: ${sc}${contract.overallStatus.toUpperCase()}${colors.reset}`
    );

    if (contract.entries.length === 0) {
      console.log(`  ${colors.gray}No entries returned.${colors.reset}`);
      continue;
    }

    const colWidths = [18, 10, 12, 14, 10];
    const headers = ["Entry Key", "Type", "Durability", "Expires In", "Status"];
    console.log(
      "  " +
        headers.map((h, i) => h.padEnd(colWidths[i]!)).join(" ")
    );
    console.log("  " + "-".repeat(colWidths.reduce((a, b) => a + b, 0) + headers.length - 1));

    for (const entry of contract.entries) {
      const ec = statusColor(entry.status);
      const cols = [
        entry.entryKey.padEnd(colWidths[0]!),
        entry.entryType.replace("contract_", "").padEnd(colWidths[1]!),
        entry.durability.padEnd(colWidths[2]!),
        formatDuration(entry.remainingSeconds).padEnd(colWidths[3]!),
        `${ec}${entry.status}${colors.reset}`,
      ];
      console.log("  " + cols.join(" "));
    }
  }
}

/** Render contract statuses as JSON. */
export function printJson(statuses: ContractStatus[]): void {
  console.log(
    JSON.stringify(
      statuses.map((s) => ({
        ...s,
        checkedAt: s.checkedAt.toISOString(),
        entries: s.entries.map((e) => ({
          ...e,
          expiresAt: e.expiresAt.toISOString(),
        })),
      })),
      null,
      2
    )
  );
}

/** Compute exit code from an array of contract statuses. */
export function computeExitCode(statuses: ContractStatus[]): number {
  const statusValues = statuses.flatMap((s) => s.entries.map((e) => e.status));
  if (statusValues.some((s) => s === "archived" || s === "critical")) return 2;
  if (statusValues.some((s) => s === "warning")) return 1;
  return 0;
}
