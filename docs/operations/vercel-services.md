# Vercel Services Deployment

The repository defines two Vercel services:

- `dashboard`: public Next.js frontend routed at `/`
- `keeper`: internal container service

The keeper service uses the repository root as its build context so its Dockerfile can access the workspace lockfile and the shared `@evergreen/core` package. Its container entrypoint remains `packages/keeper/Dockerfile`.

The dashboard declares a service binding to the keeper. Vercel injects the keeper's internal base URL as `KEEPER_URL`; do not create that variable manually. Dashboard data is fetched only from server-side code because service bindings are unavailable in browser code and at build time.

Configure `EVERGREEN_CONFIG_TOML` with the complete keeper TOML configuration. Configure `EVERGREEN_SECRET_KEY` only when automated transaction submission is intended. If `EVERGREEN_KEEPER_API_TOKEN` is set, it is shared by the keeper and dashboard so server-side requests can authenticate.

The keeper honors Vercel's injected `PORT` automatically. Run `vercel dev` from the repository root to start both services locally with bindings.

The current keeper stores operational history in SQLite. Confirm a durable storage design before relying on history across container replacements; local container filesystems should be treated as ephemeral.
