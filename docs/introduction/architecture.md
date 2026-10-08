# System Architecture

`@evergreen/core` owns configuration validation, ledger inspection, and transaction construction. The CLI provides one-shot operator workflows. `@evergreen/keeper` schedules checks, submits guarded transactions, persists history, and sends alerts. The dashboard consumes the keeper status API. `evergreen-ttl` provides contract-side helpers.

Secrets enter only through environment variables and are never written to configuration or the database.
