# Quickstart

This guide runs Evergreen against Stellar Testnet without submitting a transaction.

## Prerequisites

- Node.js 20 or newer
- pnpm 9
- A deployed Testnet contract ID beginning with `C`
- Rust only if you want to build or test the helper crate

## Install from source

```bash
git clone https://github.com/Evergreen-production/evergreen.git
cd evergreen
pnpm install --frozen-lockfile
pnpm build
```

## Create a configuration

```bash
node packages/cli/dist/index.js init
```

Open `evergreen.toml` and replace the placeholder contract ID. A minimal configuration looks like this:

```toml
network = "testnet"
rpc_url = "https://soroban-testnet.stellar.org"
network_passphrase = "Test SDF Network ; September 2015"
check_interval_seconds = 3600
max_daily_spend_stroops = 10000000

[contracts.example]
id = "CCAK6YBIECDQ2GFPMYLV3GWQPJN2DVGJGDHKY76ESZHI56DZMELSTPRV"
label = "Example Testnet Contract"
watch_instance = true
watch_code = true
warn_below_days = 30
extend_below_days = 7
extend_to_days = 90
max_fee_stroops = 500000
```

## Inspect TTL health

```bash
node packages/cli/dist/index.js --config evergreen.toml check
```

For machine-readable output:

```bash
node packages/cli/dist/index.js --config evergreen.toml check --format json
```

## Simulate remediation

```bash
node packages/cli/dist/index.js --config evergreen.toml extend --dry-run
node packages/cli/dist/index.js --config evergreen.toml restore --dry-run
```

Dry runs build and simulate a plan but do not sign or submit anything.

## Enable transaction submission

Create and fund a dedicated Testnet account, then store its secret in your shell or deployment secret manager:

```bash
export EVERGREEN_SECRET_KEY="S..."
node packages/cli/dist/index.js --config evergreen.toml extend --yes
```

{% hint style="danger" %}
Never commit, paste into TOML, or share an `S...` secret key. Use a dedicated, minimally funded keeper account—not a contract administrator or treasury account.
{% endhint %}
