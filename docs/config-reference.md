# Configuration Reference

Top-level fields define `network`, `rpc_url`, `network_passphrase`, `check_interval_seconds`, optional global spend and balance limits, the SQLite path, API token, contract list, and alert channels.

Each contract requires an ID, label, warning/extension thresholds, target extension duration, and transaction fee cap. Instance and code monitoring default to enabled. Named entries require a stable name, base64 LedgerKey XDR, and `persistent` or `temporary` durability.

Keep secrets out of TOML. Use `EVERGREEN_SECRET_KEY` for signing and `EVERGREEN_KEEPER_API_TOKEN` for the status API. Environment files are ignored, but production deployments should use a managed secret provider.

Validate configuration with `evergreen check --config evergreen.toml` on Testnet before enabling a signer.
