/**
 * Keeper daemon — the heart of Evergreen.
 *
 * Orchestrates:
 * 1. Scheduled TTL inspection cycles (with jitter)
 * 2. Extend/restore execution within caps
 * 3. Alert dispatch (via AlertManager)
 * 4. State persistence (via StateStore)
 * 5. HTTP status API
 *
 * The Keeper never logs or exposes the secret key.
 */

import { Keypair } from "@stellar/stellar-sdk";
import type { EvergreenConfig } from "@evergreen/core";
import { createRpcClient, inspectContracts } from "@evergreen/core";
import { StateStore } from "./state-store.js";
import { AlertManager, createAlertChannels } from "./alerts.js";
import { executeExtendWithRetry, executeRestoreWithRetry } from "./executor.js";
import { HttpStatusApi } from "./http-api.js";

/** Add random jitter to the check interval to avoid thundering herd. */
function withJitter(baseMs: number, jitterFraction = 0.1): number {
  const jitter = baseMs * jitterFraction * (Math.random() * 2 - 1);
  return Math.max(baseMs + jitter, 1000);
}

export class Keeper {
  private store: StateStore;
  private alertManager: AlertManager;
  private httpApi: HttpStatusApi;
  private rpc: ReturnType<typeof createRpcClient>;
  private keypair?: Keypair;
  private running = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly config: EvergreenConfig) {
    const dbPath = config.dbPath ?? "./evergreen.db";
    this.store = new StateStore(dbPath);

    const channels = createAlertChannels(config.alerts);
    this.alertManager = new AlertManager(channels, this.store);

    this.rpc = createRpcClient(config.rpcUrl);

    // Load keypair from environment only — never from config
    const secretKey = process.env["EVERGREEN_SECRET_KEY"];
    if (secretKey) {
      try {
        this.keypair = Keypair.fromSecret(secretKey);
        console.log(`[keeper] Keeper account: ${this.keypair.publicKey()}`);
      } catch {
        console.warn("[keeper] EVERGREEN_SECRET_KEY is set but invalid. Running in read-only mode.");
      }
    } else {
      console.warn("[keeper] EVERGREEN_SECRET_KEY not set. Running in read-only/check mode (no extend/restore).");
    }

    this.httpApi = new HttpStatusApi(this.store, {
      port: parseInt(process.env["PORT"] ?? process.env["EVERGREEN_API_PORT"] ?? "8742", 10),
      token: config.keeperApiToken ?? process.env["EVERGREEN_KEEPER_API_TOKEN"],
      network: config.network,
      signerConfigured: Boolean(this.keypair),
    });
  }

  async start(): Promise<void> {
    this.running = true;
    console.log(`[keeper] Starting Evergreen keeper (network: ${this.config.network})`);
    // Seed the API before accepting requests. Container platforms can route the
    // first request as soon as the port opens; listening first would expose an
    // empty contract list while the initial Stellar scan was still running.
    await this.runCycle();
    await this.httpApi.start();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    await this.httpApi.stop();
    this.store.close();
    console.log("[keeper] Stopped.");
  }

  private async runCycle(): Promise<void> {
    if (!this.running) return;

    const runId = this.store.startRun();
    let extendCount = 0;
    let restoreCount = 0;
    let errorsCount = 0;
    let totalFeeSpent = 0;

    console.log(`[keeper] Starting check cycle (run #${runId})...`);

    try {
      const statuses = await inspectContracts(this.config.contracts, this.rpc);
      this.httpApi.updateStatuses(statuses);
      this.store.saveEntryStatuses(statuses);

      // Check keeper account balance
      if (this.keypair) {
        try {
          const balance = await this.rpc.getAccountBalance(this.keypair.publicKey());
          const minBalance = BigInt(this.config.minKeeperBalanceStroops ?? 50_000_000);
          if (balance < minBalance) {
            await this.alertManager.send({
              level: "warning",
              title: "Keeper account balance low",
              message: `Keeper account ${this.keypair.publicKey()} has ${balance} stroops — below minimum of ${minBalance}`,
              timestamp: new Date(),
            });
          }
        } catch (err) {
          console.warn("[keeper] Could not fetch keeper balance:", err instanceof Error ? err.message : err);
        }
      }

      for (const contractStatus of statuses) {
        const contractConfig = this.config.contracts.find((c) => c.id === contractStatus.contractId);
        if (!contractConfig) continue;

        // Fire alerts for degraded entries
        for (const entry of contractStatus.entries) {
          if (entry.status === "warning" || entry.status === "critical" || entry.status === "archived") {
            const level = entry.status === "archived"
              ? "archived"
              : entry.status === "critical"
              ? "critical"
              : "warning";
            await this.alertManager.send({
              level,
              title: `TTL ${entry.status}: ${contractConfig.label} / ${entry.entryKey}`,
              message: `Entry ${entry.entryKey} on contract ${contractConfig.label} (${contractStatus.contractId}) has ${entry.remainingLedgers} ledgers remaining (status: ${entry.status}).`,
              contractId: contractStatus.contractId,
              entryKey: entry.entryKey,
              timestamp: new Date(),
            });
          } else if (entry.status === "healthy") {
            // Clear any existing cooldowns for recovered entries
            this.alertManager.clearCooldown(contractStatus.contractId, entry.entryKey, "warning");
            this.alertManager.clearCooldown(contractStatus.contractId, entry.entryKey, "critical");
          }
        }

        // Execute extends/restores if keypair is available
        if (this.keypair) {
          // Restore archived entries first
          const hasArchived = contractStatus.entries.some((e) => e.status === "archived");
          if (hasArchived) {
            const result = await executeRestoreWithRetry(
              contractStatus,
              contractConfig,
              this.rpc,
              this.keypair,
              this.config.networkPassphrase,
              this.store,
              this.alertManager,
              this.config.rpcUrl
            );
            if (result.success) {
              restoreCount++;
              totalFeeSpent += result.feeCharged;
            } else {
              errorsCount++;
              await this.alertManager.send({
                level: "error",
                title: `Restore failed: ${contractConfig.label}`,
                message: result.error ?? "Unknown error",
                contractId: result.contractId,
                timestamp: new Date(),
              });
            }
          }

          // Extend entries below threshold
          const needsExtension = contractStatus.entries.some(
            (e) => e.status === "critical" || e.status === "warning"
          );
          if (needsExtension) {
            const result = await executeExtendWithRetry(
              contractStatus,
              contractConfig,
              this.rpc,
              this.keypair,
              this.config.networkPassphrase,
              this.store,
              this.alertManager,
              this.config.rpcUrl
            );
            if (result.success) {
              extendCount++;
              totalFeeSpent += result.feeCharged;
            } else {
              errorsCount++;
              await this.alertManager.send({
                level: "error",
                title: `Extend failed: ${contractConfig.label}`,
                message: result.error ?? "Unknown error",
                contractId: result.contractId,
                timestamp: new Date(),
              });
            }
          }
        }
      }
    } catch (err) {
      errorsCount++;
      console.error("[keeper] Cycle error:", err instanceof Error ? err.message : err);
    }

    this.store.finishRun(runId, {
      contractsChecked: this.config.contracts.length,
      errorsCount,
      extendCount,
      restoreCount,
      totalFeeSpent,
    });

    console.log(
      `[keeper] Cycle #${runId} done: ${this.config.contracts.length} contracts, ${extendCount} extends, ${restoreCount} restores, ${errorsCount} errors`
    );

    // Schedule next cycle with jitter
    const intervalMs = this.config.checkIntervalSeconds * 1000;
    const nextMs = withJitter(intervalMs);
    this.timer = setTimeout(() => this.runCycle(), nextMs);
  }
}
