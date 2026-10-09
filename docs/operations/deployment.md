# Deployment

Choose the operating model that matches your durability and security requirements.

## Vercel submission deployment

The repository's `vercel.json` deploys the Next.js dashboard and containerized keeper as one project. The keeper is internal and the dashboard reaches it through `KEEPER_URL`, which Vercel injects from the declared service binding.

Required configuration:

- `EVERGREEN_CONFIG_TOML` for Production and Preview
- `EVERGREEN_SECRET_KEY` only when automated submissions are intended
- `EVERGREEN_KEEPER_API_TOKEN` when API authentication is required

Use `/tmp/evergreen.db` on Vercel and treat history as ephemeral. The ledger remains the source of truth.

## Docker Compose

Create `evergreen.toml`, optionally export a signer, and start the keeper:

```bash
export EVERGREEN_SECRET_KEY="S..." # omit for read-only mode
docker compose up --build -d
curl http://localhost:8742/health
```

Compose stores SQLite data in the `keeper-data` volume.

## Production recommendation

For durable operations, run the keeper on a container platform with persistent storage, a managed secret store, restart policies, centralized logs, and an external health monitor. Keep the dashboard and status API private or authenticated when contract metadata is sensitive.

Complete the [production checklist](production-checklist.md) before enabling a funded signer.
