# Running the Keeper

The keeper is Evergreen's continuous operating mode. It scans configured contracts on a schedule, updates the status API, records cycle results, emits alerts, and optionally submits guarded maintenance transactions.

## Read-only mode

Start without `EVERGREEN_SECRET_KEY` to monitor safely:

```bash
pnpm --filter @evergreen/core build
pnpm --filter @evergreen/keeper build
EVERGREEN_CONFIG=./evergreen.toml pnpm --filter @evergreen/keeper start
```

The startup log explicitly reports read-only mode. This is the recommended first deployment state.

## Automated mode

Use a dedicated, minimally funded signer and inject its secret through a managed secret store:

```bash
EVERGREEN_CONFIG=./evergreen.toml \
EVERGREEN_SECRET_KEY="S..." \
pnpm --filter @evergreen/keeper start
```

Before enabling it, verify the network, run dry-run simulations, configure per-contract fee limits, set a global daily budget, and test alerts.

## Operational requirements

- Run under a supervisor with restart-on-failure behavior.
- Protect the status API with `EVERGREEN_KEEPER_API_TOKEN` or private networking.
- Probe `GET /health` from an external monitor.
- Persist and back up SQLite if run history is operationally important.
- Alert on failed cycles, low signer balance, and archived entries.
- Keep the signer out of source control, TOML, container images, and logs.
