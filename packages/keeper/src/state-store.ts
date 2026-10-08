/**
 * SQLite-backed state store for the Evergreen keeper daemon.
 *
 * Stores:
 * - contract check run history
 * - alert cooldown registry (for deduplication)
 * - daily spend tracking
 * - last known entry statuses
 */

import Database from "better-sqlite3";
import type { ContractStatus, EntryTtlStatus } from "@evergreen/core";

export interface RunRecord {
  id: number;
  startedAt: string; // ISO 8601
  finishedAt?: string;
  contractsChecked: number;
  errorsCount: number;
  extendCount: number;
  restoreCount: number;
  totalFeeSpent: number;
  notes?: string;
}

export interface AlertCooldownRecord {
  key: string; // contractId:entryKey:alertType
  lastAlertedAt: string; // ISO 8601
  cooldownSeconds: number;
}

export interface DailySpend {
  date: string; // YYYY-MM-DD
  totalStroops: number;
}

export class StateStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        contracts_checked INTEGER NOT NULL DEFAULT 0,
        errors_count INTEGER NOT NULL DEFAULT 0,
        extend_count INTEGER NOT NULL DEFAULT 0,
        restore_count INTEGER NOT NULL DEFAULT 0,
        total_fee_spent INTEGER NOT NULL DEFAULT 0,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS alert_cooldowns (
        key TEXT PRIMARY KEY,
        last_alerted_at TEXT NOT NULL,
        cooldown_seconds INTEGER NOT NULL DEFAULT 3600
      );

      CREATE TABLE IF NOT EXISTS daily_spend (
        date TEXT PRIMARY KEY,
        total_stroops INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS entry_statuses (
        contract_id TEXT NOT NULL,
        entry_key TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        durability TEXT NOT NULL,
        live_until_ledger_seq INTEGER NOT NULL,
        current_ledger INTEGER NOT NULL,
        remaining_ledgers INTEGER NOT NULL,
        status TEXT NOT NULL,
        last_modified_ledger_seq INTEGER NOT NULL,
        checked_at TEXT NOT NULL,
        PRIMARY KEY (contract_id, entry_key)
      );
    `);
  }

  // ─── Runs ─────────────────────────────────────────────────────────────────

  startRun(): number {
    const stmt = this.db.prepare(`
      INSERT INTO runs (started_at, contracts_checked, errors_count, extend_count, restore_count, total_fee_spent)
      VALUES (?, 0, 0, 0, 0, 0)
    `);
    const result = stmt.run(new Date().toISOString());
    return result.lastInsertRowid as number;
  }

  finishRun(
    id: number,
    stats: {
      contractsChecked: number;
      errorsCount: number;
      extendCount: number;
      restoreCount: number;
      totalFeeSpent: number;
      notes?: string;
    }
  ) {
    this.db
      .prepare(`
        UPDATE runs SET
          finished_at = ?,
          contracts_checked = ?,
          errors_count = ?,
          extend_count = ?,
          restore_count = ?,
          total_fee_spent = ?,
          notes = ?
        WHERE id = ?
      `)
      .run(
        new Date().toISOString(),
        stats.contractsChecked,
        stats.errorsCount,
        stats.extendCount,
        stats.restoreCount,
        stats.totalFeeSpent,
        stats.notes ?? null,
        id
      );
  }

  getRecentRuns(limit = 20): RunRecord[] {
    return this.db
      .prepare("SELECT * FROM runs ORDER BY id DESC LIMIT ?")
      .all(limit)
      .map((r: unknown) => {
        const row = r as Record<string, unknown>;
        return {
          id: row["id"] as number,
          startedAt: row["started_at"] as string,
          finishedAt: (row["finished_at"] as string | null) ?? undefined,
          contractsChecked: row["contracts_checked"] as number,
          errorsCount: row["errors_count"] as number,
          extendCount: row["extend_count"] as number,
          restoreCount: row["restore_count"] as number,
          totalFeeSpent: row["total_fee_spent"] as number,
          notes: (row["notes"] as string | null) ?? undefined,
        };
      });
  }

  // ─── Alert Deduplication ─────────────────────────────────────────────────

  /**
   * Returns true if an alert for this key has NOT been sent within the cooldown period.
   * If it returns true, records the alert in the cooldown registry.
   */
  shouldAlert(key: string, cooldownSeconds: number): boolean {
    const existing = this.db
      .prepare("SELECT last_alerted_at, cooldown_seconds FROM alert_cooldowns WHERE key = ?")
      .get(key) as { last_alerted_at: string; cooldown_seconds: number } | undefined;

    if (existing) {
      const lastAlertedMs = new Date(existing.last_alerted_at).getTime();
      const elapsedSeconds = (Date.now() - lastAlertedMs) / 1000;
      if (elapsedSeconds < cooldownSeconds) {
        return false; // Still in cooldown
      }
    }

    // Set / update the cooldown entry
    this.db
      .prepare(`
        INSERT OR REPLACE INTO alert_cooldowns (key, last_alerted_at, cooldown_seconds)
        VALUES (?, ?, ?)
      `)
      .run(key, new Date().toISOString(), cooldownSeconds);

    return true;
  }

  /** Clear a cooldown (e.g., when an entry recovers to healthy). */
  clearAlertCooldown(key: string) {
    this.db.prepare("DELETE FROM alert_cooldowns WHERE key = ?").run(key);
  }

  // ─── Daily Spend ──────────────────────────────────────────────────────────

  /** Get today's spend in stroops. */
  getDailySpend(): number {
    const today = new Date().toISOString().slice(0, 10);
    const row = this.db
      .prepare("SELECT total_stroops FROM daily_spend WHERE date = ?")
      .get(today) as { total_stroops: number } | undefined;
    return row?.total_stroops ?? 0;
  }

  /** Add to today's spend in stroops. */
  addDailySpend(stroops: number) {
    const today = new Date().toISOString().slice(0, 10);
    this.db
      .prepare(`
        INSERT INTO daily_spend (date, total_stroops) VALUES (?, ?)
        ON CONFLICT(date) DO UPDATE SET total_stroops = total_stroops + excluded.total_stroops
      `)
      .run(today, stroops);
  }

  // ─── Entry Statuses ───────────────────────────────────────────────────────

  /** Persist the latest entry statuses from a contract check. */
  saveEntryStatuses(statuses: ContractStatus[]) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO entry_statuses
        (contract_id, entry_key, entry_type, durability, live_until_ledger_seq,
         current_ledger, remaining_ledgers, status, last_modified_ledger_seq, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const saveAll = this.db.transaction(() => {
      for (const contractStatus of statuses) {
        for (const entry of contractStatus.entries) {
          stmt.run(
            entry.contractId,
            entry.entryKey,
            entry.entryType,
            entry.durability,
            entry.liveUntilLedgerSeq,
            entry.currentLedger,
            entry.remainingLedgers,
            entry.status,
            entry.lastModifiedLedgerSeq,
            contractStatus.checkedAt.toISOString()
          );
        }
      }
    });

    saveAll();
  }

  /** Get the last known statuses for all entries. */
  getLastEntryStatuses(): EntryTtlStatus[] {
    const rows = this.db.prepare("SELECT * FROM entry_statuses").all();
    return rows.map((r: unknown) => {
      const row = r as Record<string, unknown>;
      return {
        contractId: row["contract_id"] as string,
        entryKey: row["entry_key"] as string,
        entryType: row["entry_type"] as EntryTtlStatus["entryType"],
        durability: row["durability"] as EntryTtlStatus["durability"],
        liveUntilLedgerSeq: row["live_until_ledger_seq"] as number,
        currentLedger: row["current_ledger"] as number,
        remainingLedgers: row["remaining_ledgers"] as number,
        remainingSeconds: 0,
        expiresAt: new Date(0),
        status: row["status"] as EntryTtlStatus["status"],
        lastModifiedLedgerSeq: row["last_modified_ledger_seq"] as number,
      };
    });
  }

  close() {
    this.db.close();
  }
}
