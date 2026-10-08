/**
 * @evergreen/keeper entry point.
 *
 * Reads config from environment / CLI args, starts the keeper daemon.
 */

import { readFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";
import { parseConfig } from "@evergreen/core";
import { Keeper } from "./keeper.js";

async function main() {
  const configPath = process.env["EVERGREEN_CONFIG"] ?? "./evergreen.toml";

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    console.error(`[keeper] Cannot read config: ${configPath}`);
    process.exit(1);
  }

  const toml = parseToml(raw);
  const config = parseConfig(toml);

  if (config.network === "mainnet") {
    console.warn("[keeper] ⚠️  WARNING: Operating against MAINNET. Real stroops will be spent.");
  }

  const keeper = new Keeper(config);
  await keeper.start();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[keeper] ${signal} received, shutting down gracefully...`);
    await keeper.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[keeper] Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
