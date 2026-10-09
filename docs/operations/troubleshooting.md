# Troubleshooting

## Dashboard says “Keeper unavailable”

Confirm the deployment contains `EVERGREEN_CONFIG_TOML`, the keeper container is running, and the dashboard retains its `keeper` service binding. Check container logs for configuration validation or SQLite path errors.

## Keeper starts in read-only mode

This is expected when `EVERGREEN_SECRET_KEY` is absent. Monitoring and alerts still work; extend and restore transactions do not run.

## Contract is critical or archived

Run an `extend --dry-run` or `restore --dry-run` locally first. Review simulation output, fees, network, signer balance, and configured caps before using `--yes`.

## Contract shows missing entries

Verify that the contract ID belongs to the configured network. For named entries, regenerate and compare the base64 ledger-key XDR and durability.

## History disappears after a Vercel restart

Vercel container storage is ephemeral. Use a platform with persistent volumes for durable run history, or treat Stellar RPC as the live source of truth and export operational events elsewhere.

## RPC failures

Check endpoint reachability, rate limits, network passphrase, and provider status. Do not switch networks merely to make a failed request succeed.
