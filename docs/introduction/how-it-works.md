# How It Works

1. The inspector resolves configured contract ledger keys and reads their live-until ledger.
2. The threshold engine classifies each entry as healthy, warning, critical, or archived.
3. The keeper alerts on degraded entries and builds simulated extend or restore transactions.
4. Fee and daily-spend caps are checked before signing.
5. Submitted operations and health snapshots are recorded in SQLite and exposed through the read-only status API.
