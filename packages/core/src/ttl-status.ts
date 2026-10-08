/**
 * TTL status classification and threshold math.
 *
 * This module contains pure functions for computing TTL health status
 * based on remaining ledgers and configured thresholds.
 * No I/O, no side effects — trivially unit-testable.
 */

import type {
  EntryStatus,
  EntryTtlStatus,
  EntryType,
  Durability,
  ThresholdLedgers,
  ContractConfig,
} from "./types.js";
import { LEDGER_CLOSE_SECONDS } from "./types.js";

// ─── Days ↔ Ledgers Conversion ───────────────────────────────────────────────

/** Convert days to an approximate number of ledgers. */
export function daysToLedgers(days: number): number {
  // 24h * 60min * 60s / LEDGER_CLOSE_SECONDS
  return Math.ceil((days * 24 * 60 * 60) / LEDGER_CLOSE_SECONDS);
}

/** Convert ledgers to an approximate number of seconds. */
export function ledgersToSeconds(ledgers: number): number {
  return ledgers * LEDGER_CLOSE_SECONDS;
}

// ─── Threshold Resolution ────────────────────────────────────────────────────

/** Resolve configured day-based thresholds to ledger counts. */
export function resolveThresholds(config: ContractConfig): ThresholdLedgers {
  return {
    warn: daysToLedgers(config.warnBelowDays),
    extend: daysToLedgers(config.extendBelowDays),
    extendTo: daysToLedgers(config.extendToDays),
  };
}

// ─── Status Classification ───────────────────────────────────────────────────

/**
 * Classify an entry's health status based on remaining ledgers and thresholds.
 *
 * @param remainingLedgers - Ledgers until expiry. May be negative if archived.
 * @param thresholds - Warn and critical threshold ledger counts.
 */
export function classifyStatus(
  remainingLedgers: number,
  thresholds: { warn: number; extend: number }
): EntryStatus {
  if (remainingLedgers <= 0) return "archived";
  if (remainingLedgers <= thresholds.extend) return "critical";
  if (remainingLedgers <= thresholds.warn) return "warning";
  return "healthy";
}

/**
 * Determine the worst status across an array of statuses.
 * Priority: archived > critical > warning > healthy
 */
export function worstStatus(statuses: EntryStatus[]): EntryStatus {
  const priority: Record<EntryStatus, number> = {
    archived: 3,
    critical: 2,
    warning: 1,
    healthy: 0,
  };
  return statuses.reduce<EntryStatus>((worst, s) => {
    return priority[s] > priority[worst] ? s : worst;
  }, "healthy");
}

// ─── Entry Status Builder ─────────────────────────────────────────────────────

/** Build a full EntryTtlStatus from raw RPC data. */
export function buildEntryStatus(params: {
  contractId: string;
  entryKey: string;
  entryType: EntryType;
  durability: Durability;
  liveUntilLedgerSeq: number;
  currentLedger: number;
  lastModifiedLedgerSeq: number;
  thresholds: ThresholdLedgers;
}): EntryTtlStatus {
  const {
    contractId,
    entryKey,
    entryType,
    durability,
    liveUntilLedgerSeq,
    currentLedger,
    lastModifiedLedgerSeq,
    thresholds,
  } = params;

  const remainingLedgers = liveUntilLedgerSeq - currentLedger;
  const remainingSeconds = Math.max(0, ledgersToSeconds(remainingLedgers));
  const expiresAt = new Date(Date.now() + remainingSeconds * 1000);
  const status = classifyStatus(remainingLedgers, thresholds);

  return {
    contractId,
    entryKey,
    entryType,
    durability,
    liveUntilLedgerSeq,
    currentLedger,
    remainingLedgers,
    remainingSeconds,
    expiresAt,
    status,
    lastModifiedLedgerSeq,
  };
}

/** Build a tombstone EntryTtlStatus for an archived/missing entry. */
export function buildArchivedEntryStatus(params: {
  contractId: string;
  entryKey: string;
  entryType: EntryType;
  durability: Durability;
  currentLedger: number;
}): EntryTtlStatus {
  const { contractId, entryKey, entryType, durability, currentLedger } = params;
  return {
    contractId,
    entryKey,
    entryType,
    durability,
    liveUntilLedgerSeq: 0,
    currentLedger,
    remainingLedgers: -1,
    remainingSeconds: 0,
    expiresAt: new Date(0),
    status: "archived",
    lastModifiedLedgerSeq: 0,
  };
}
