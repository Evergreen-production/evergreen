# Configuration Reference

Evergreen reads TOML from a file or, for container deployments, from `EVERGREEN_CONFIG_TOML`. Secret keys are never part of this configuration.

## Top-level fields

| Field                        | Required | Description                                               |
| ---------------------------- | -------- | --------------------------------------------------------- |
| `network`                    | Yes      | `testnet`, `mainnet`, `futurenet`, or `standalone`        |
| `rpc_url`                    | Yes      | Stellar RPC endpoint for the selected network             |
| `network_passphrase`         | Yes      | Exact passphrase used to sign transactions                |
| `check_interval_seconds`     | Yes      | Scan interval; minimum 60 seconds                         |
| `max_daily_spend_stroops`    | No       | Global daily transaction-fee budget                       |
| `min_keeper_balance_stroops` | No       | Balance threshold for low-funds alerts                    |
| `db_path`                    | No       | SQLite path; defaults to `./evergreen.db`                 |
| `keeper_api_token`           | No       | API bearer token; prefer the environment variable instead |

One XLM equals 10,000,000 stroops.

## Contract fields

Each `[contracts.<name>]` block supports:

| Field                     | Default            | Description                                          |
| ------------------------- | ------------------ | ---------------------------------------------------- |
| `id`                      | —                  | Required Stellar contract address beginning with `C` |
| `label`                   | `Unnamed Contract` | Operator-friendly display name                       |
| `watch_instance`          | `true`             | Inspect the contract instance entry                  |
| `watch_code`              | `true`             | Inspect the contract WASM code entry                 |
| `warn_below_days`         | `30`               | Warning threshold                                    |
| `extend_below_days`       | `7`                | Automatic-extension threshold                        |
| `extend_to_days`          | `90`               | Target TTL after extension                           |
| `max_fee_stroops`         | `500000`           | Per-transaction fee ceiling                          |
| `max_daily_spend_stroops` | global value       | Optional contract-specific daily cap                 |

## Named entries

Use named entries when the application depends on specific persistent or temporary contract data:

```toml
[[contracts.example.named_entries]]
name = "configuration"
ledger_key_xdr = "AAAA..."
durability = "persistent"
```

`ledger_key_xdr` must be the base64-encoded XDR for the exact ledger key. An incorrect key is treated as missing or archived.

## Runtime environment

| Variable                     | Purpose                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `EVERGREEN_CONFIG_TOML`      | Complete inline configuration for container platforms      |
| `EVERGREEN_CONFIG`           | Path to a mounted TOML file                                |
| `EVERGREEN_SECRET_KEY`       | Optional signer; absence forces read-only mode             |
| `EVERGREEN_KEEPER_API_TOKEN` | Optional bearer token for the status API                   |
| `EVERGREEN_API_PORT`         | Local API port when `PORT` is not injected by the platform |

Do not set Vercel's `KEEPER_URL` manually. It is injected into the dashboard through the service binding.
