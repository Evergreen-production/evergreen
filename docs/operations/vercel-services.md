# Vercel Services

Evergreen uses Vercel Services to deploy two independently built services from one repository.

## Service map

- `dashboard`: public Next.js service at `/`
- `keeper`: internal container service with no public rewrite
- Binding: `dashboard` calls `keeper` through the injected `KEEPER_URL`

The root-level `Dockerfile` gives the keeper access to the pnpm workspace lockfile and shared `@evergreen/core` package. Runtime configuration comes from `EVERGREEN_CONFIG_TOML`; Vercel's injected `PORT` is honored automatically.

The dashboard performs keeper requests in server-side page code. Service bindings are runtime-only and are not available to browser code, middleware, or build steps.

## Current public configuration

The submission deployment monitors one verified Testnet contract every five minutes. Its SQLite database is stored at `/tmp/evergreen.db`, so cycle history may reset when Vercel replaces the container. Contract health is always recalculated from Stellar RPC during startup.

## Local integration

Run all declared services and bindings together from the repository root:

```bash
vercel dev
```

Do not create `KEEPER_URL` yourself. Vercel derives it from the service binding.
