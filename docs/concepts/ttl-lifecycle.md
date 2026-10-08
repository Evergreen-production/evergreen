# TTL Lifecycle

Evergreen tracks the contract instance, Wasm code, and explicitly configured contract-data keys. Each entry is assigned a status from its remaining ledgers and configured thresholds. Archived entries are restored before entries requiring extension are renewed.

Ledger-close time is an estimate; production policies should retain a generous margin and must not depend on wall-clock precision.
