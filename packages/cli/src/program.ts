/**
 * Commander.js program definition for the Evergreen CLI.
 * All commands are defined here with their options and descriptions.
 */

import { Command } from "commander";
import { writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  inspectContracts,
  buildExtendPlan,
  buildRestorePlan,
  executeExtend,
  executeRestore,
  generateStarterToml,
} from "@evergreen/core";
import {
  loadConfig,
  buildRpcClient,
  warnIfMainnet,
  getSignerKeypair,
  printTable,
  printJson,
  computeExitCode,
} from "./utils.js";

export const program = new Command();

program
  .name("evergreen")
  .description("TTL & state-archival keeper for Soroban contracts on Stellar")
  .version("0.1.0")
  .option("--config <path>", "Path to evergreen.toml", "./evergreen.toml")
  .option("--network <network>", "Override network (testnet|mainnet)")
  .option("--rpc-url <url>", "Override RPC URL")
  .option("--verbose", "Enable verbose output", false);

// ─── init ─────────────────────────────────────────────────────────────────────

program
  .command("init")
  .description("Generate a starter evergreen.toml configuration")
  .option("--out <path>", "Output path", "./evergreen.toml")
  .action((opts: { out: string }) => {
    const outPath = path.resolve(opts.out);
    if (existsSync(outPath)) {
      console.error(`Config file already exists at ${outPath}. Remove it first or specify --out.`);
      process.exit(1);
    }
    const content = generateStarterToml();
    writeFileSync(outPath, content, "utf-8");
    console.log(`✅ Config written to ${outPath}`);
    console.log("   Edit the file to add your contract IDs, then run: evergreen check");
  });

// ─── check ───────────────────────────────────────────────────────────────────

program
  .command("check")
  .description("Report TTL status for all configured contracts")
  .option("--format <format>", "Output format: table|json", "table")
  .option("--contract <id>", "Only check the specified contract ID")
  .action(async (opts: { format: string; contract?: string }, cmd) => {
    const globalOpts = cmd.parent?.opts() as {
      config: string;
      network?: string;
      rpcUrl?: string;
      verbose: boolean;
    };
    const config = loadConfig(globalOpts.config);
    warnIfMainnet(config);
    const rpc = buildRpcClient(config, {
      network: globalOpts.network,
      rpcUrl: globalOpts.rpcUrl,
    });

    let contracts = config.contracts;
    if (opts.contract) {
      contracts = contracts.filter((c) => c.id === opts.contract);
      if (contracts.length === 0) {
        console.error(`No contract with id '${opts.contract}' found in config.`);
        process.exit(3);
      }
    }

    if (globalOpts.verbose) {
      console.log(`Checking ${contracts.length} contract(s) via ${config.rpcUrl}...`);
    }

    const statuses = await inspectContracts(contracts, rpc);

    if (opts.format === "json") {
      printJson(statuses);
    } else {
      printTable(statuses);
    }

    // Print summary
    const hasErrors = statuses.some((s) => s.error);
    if (hasErrors) {
      const errors = statuses.filter((s) => s.error);
      console.error(`\n❌ Errors for ${errors.length} contract(s):`);
      for (const e of errors) {
        console.error(`  ${e.label}: ${e.error}`);
      }
    }

    const exitCode = computeExitCode(statuses);
    if (exitCode === 0 && opts.format !== "json") {
      console.log("\n✅ All entries healthy.");
    }
    process.exit(exitCode);
  });

// ─── extend ──────────────────────────────────────────────────────────────────

program
  .command("extend")
  .description("Extend TTL for entries below threshold")
  .option("--dry-run", "Simulate only — do not submit transactions", false)
  .option("--contract <id>", "Only extend the specified contract ID")
  .option("--yes", "Skip confirmation prompt", false)
  .option("--secret-key <key>", "Signer secret key (prefer EVERGREEN_SECRET_KEY env var)")
  .action(async (opts: { dryRun: boolean; contract?: string; yes: boolean; secretKey?: string }, cmd) => {
    const globalOpts = cmd.parent?.opts() as {
      config: string;
      network?: string;
      rpcUrl?: string;
      verbose: boolean;
    };
    const config = loadConfig(globalOpts.config);
    warnIfMainnet(config);
    const rpc = buildRpcClient(config, {
      network: globalOpts.network,
      rpcUrl: globalOpts.rpcUrl,
    });

    let contracts = config.contracts;
    if (opts.contract) {
      contracts = contracts.filter((c) => c.id === opts.contract);
      if (contracts.length === 0) {
        console.error(`No contract with id '${opts.contract}' found in config.`);
        process.exit(3);
      }
    }

    // Inspect to find which entries need extension
    const { sequence: currentLedger } = await rpc.getLatestLedger();
    const statuses = await inspectContracts(contracts, rpc);

    const entriesToExtend = statuses.flatMap((s) =>
      s.entries.filter((e) => e.status === "critical" || e.status === "warning")
    );

    if (entriesToExtend.length === 0) {
      console.log("✅ No entries below the extend threshold. Nothing to do.");
      process.exit(0);
    }

    console.log(`\nEntries to extend (${entriesToExtend.length}):`);
    for (const e of entriesToExtend) {
      console.log(`  [${e.status.toUpperCase()}] ${e.contractId} / ${e.entryKey}`);
    }

    if (opts.dryRun) {
      console.log("\n[DRY RUN] Simulating extend transactions...\n");
      for (const contractStatus of statuses) {
        const contractConfig = config.contracts.find((c) => c.id === contractStatus.contractId)!;
        const toExtend = contractStatus.entries.filter(
          (e) => e.status === "critical" || e.status === "warning"
        );
        if (toExtend.length === 0) continue;
        try {
          const plan = await buildExtendPlan(
            toExtend,
            contractConfig,
            rpc,
            currentLedger,
            config.networkPassphrase
          );
          console.log(
            `  ${contractStatus.label}: would extend [${plan.entryKeys.join(", ")}] by ${plan.ledgerExtendBy} ledgers (~${plan.extendToLedgers} total). Estimated fee: ${plan.estimatedFee} stroops`
          );
        } catch (err) {
          console.error(`  ${contractStatus.label}: simulation failed — ${err instanceof Error ? err.message : err}`);
        }
      }
      console.log("\n[DRY RUN] No transactions submitted.");
      process.exit(0);
    }

    if (!opts.yes) {
      console.log("\nRun with --yes to execute, or use --dry-run to simulate first.");
      process.exit(0);
    }

    const signer = getSignerKeypair(opts);
    let failed = false;
    for (const status of statuses) {
      const contractConfig = config.contracts.find((c) => c.id === status.contractId)!;
      const entries = status.entries.filter((e) => e.status === "critical" || e.status === "warning");
      if (entries.length === 0) continue;
      const plan = await buildExtendPlan(entries, contractConfig, rpc, currentLedger, config.networkPassphrase);
      const result = await executeExtend(plan, contractConfig, rpc, config.networkPassphrase, signer, false, currentLedger);
      failed ||= !result.success;
      console.log(result.success ? `✅ ${status.label}: submitted ${result.txHash}` : `❌ ${status.label}: ${result.error}`);
    }
    process.exit(failed ? 3 : 0);
  });

// ─── restore ─────────────────────────────────────────────────────────────────

program
  .command("restore")
  .description("Restore archived Soroban entries")
  .option("--dry-run", "Simulate only — do not submit transactions", false)
  .option("--contract <id>", "Only restore the specified contract ID")
  .option("--yes", "Skip confirmation prompt", false)
  .option("--secret-key <key>", "Signer secret key")
  .action(async (opts: { dryRun: boolean; contract?: string; yes: boolean; secretKey?: string }, cmd) => {
    const globalOpts = cmd.parent?.opts() as {
      config: string;
      network?: string;
      rpcUrl?: string;
      verbose: boolean;
    };
    const config = loadConfig(globalOpts.config);
    warnIfMainnet(config);
    const rpc = buildRpcClient(config, {
      network: globalOpts.network,
      rpcUrl: globalOpts.rpcUrl,
    });

    let contracts = config.contracts;
    if (opts.contract) {
      contracts = contracts.filter((c) => c.id === opts.contract);
    }

    const statuses = await inspectContracts(contracts, rpc);
    const archivedEntries = statuses.flatMap((s) =>
      s.entries.filter((e) => e.status === "archived")
    );

    if (archivedEntries.length === 0) {
      console.log("✅ No archived entries found. Nothing to restore.");
      process.exit(0);
    }

    console.log(`\nArchived entries (${archivedEntries.length}):`);
    for (const e of archivedEntries) {
      console.log(`  [ARCHIVED] ${e.contractId} / ${e.entryKey}`);
    }

    if (opts.dryRun) {
      console.log("\n[DRY RUN] Simulating restore transactions...\n");
      for (const contractStatus of statuses) {
        const contractConfig = config.contracts.find((c) => c.id === contractStatus.contractId)!;
        const archived = contractStatus.entries.filter((e) => e.status === "archived");
        if (archived.length === 0) continue;
        try {
          const plan = await buildRestorePlan(archived, contractConfig, rpc, config.networkPassphrase);
          console.log(
            `  ${contractStatus.label}: would restore [${plan.entryKeys.join(", ")}]. Estimated fee: ${plan.estimatedFee} stroops`
          );
        } catch (err) {
          console.error(`  ${contractStatus.label}: simulation failed — ${err instanceof Error ? err.message : err}`);
        }
      }
      console.log("\n[DRY RUN] No transactions submitted.");
      process.exit(0);
    }

    if (!opts.yes) {
      console.log("\n⚠️  Restoring archived entries requires submitting transactions.");
      console.log("Run with --yes to execute, or --dry-run to simulate.");
      process.exit(0);
    }

    const signer = getSignerKeypair(opts);
    let failed = false;
    for (const status of statuses) {
      const contractConfig = config.contracts.find((c) => c.id === status.contractId)!;
      const entries = status.entries.filter((e) => e.status === "archived");
      if (entries.length === 0) continue;
      const plan = await buildRestorePlan(entries, contractConfig, rpc, config.networkPassphrase);
      const result = await executeRestore(plan, contractConfig, rpc, config.networkPassphrase, signer, false);
      failed ||= !result.success;
      console.log(result.success ? `✅ ${status.label}: submitted ${result.txHash}` : `❌ ${status.label}: ${result.error}`);
    }
    process.exit(failed ? 3 : 0);
  });

// ─── watch ───────────────────────────────────────────────────────────────────

program
  .command("watch")
  .description("Run the keeper daemon in the foreground")
  .action(async (_, cmd) => {
    const globalOpts = cmd.parent?.opts() as { config: string; verbose: boolean };
    console.log(`Starting Evergreen keeper from ${globalOpts.config}...`);
    console.log("Note: The keeper service is in packages/keeper. Start it with: cd packages/keeper && node dist/index.js");
    process.exit(0);
  });
