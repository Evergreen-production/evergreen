# Technical Decisions Log (DECISIONS.md)

This log records major technical decisions made during the design and implementation of Evergreen, including rationale and considered alternatives.

---

## ADR-001: Monorepo Structure & Package Boundaries
- **Date**: 2026-10-08
- **Decision**: Use pnpm workspaces with clean layer boundaries:
  - `@evergreen/core`: Pure library containing TTL calculations, footprint building, inspection algorithms, simulation wrappers, and footprint extend/restore logic. Takes injectable RPC provider and config. No direct process, env, or CLI I/O.
  - `@evergreen/cli`: Node.js CLI wrapping `@evergreen/core` with Command line flags, formatted outputs (table, JSON), and exit codes.
  - `@evergreen/keeper`: Service daemon wrapping `@evergreen/core`, managing scheduling, persistent SQLite store (`better-sqlite3`), alert notification channels, daily spend cap tracking, and HTTP status API.
  - `@evergreen/dashboard`: Next.js 14+ (App Router) frontend visualizing Keeper status via the HTTP API.
  - `evergreen-ttl`: Rust crate providing inline Soroban contract storage extension utilities.
- **Alternatives Considered**:
  - Single monolithic package: Harder to reuse `core` in CI or standalone tools; mixes HTTP/server dependencies into CLI.
  - Lerna or Turborepo: pnpm native workspaces provide light-weight, fast dependency linking without extra orchestration overhead.
- **Reason**: Maintains strict separation of concerns, enables modular testing, fast build speeds, and clean dependency management.

---

## ADR-002: Default Network Policy (Testnet vs Mainnet Safety)
- **Date**: 2026-10-08
- **Decision**: Default network throughout all packages, CLI commands, config templates, and keeper service is **Testnet**. Mainnet operations require explicit `--network mainnet` CLI flag or `network = "mainnet"` in `evergreen.toml`, paired with a loud warning output.
- **Alternatives Considered**:
  - Requiring network name explicitly on every command: Annoying developer UX for quick local testing.
  - Defaulting to local network (Futurenet/standalone): Most developers test state archival on Stellar Testnet.
- **Reason**: Prevents accidental mainnet spending while maintaining smooth developer quickstart experiences.

---

## ADR-003: Secret Key Handling & Environment Isolation
- **Date**: 2026-10-08
- **Decision**: Secret keys for Stellar accounts (keeper / submitter keys) must NEVER be read from config files (`evergreen.toml`), logged in console/file logs, or returned in error messages/status APIs. Secret keys are loaded solely from environment variables (e.g. `EVERGREEN_SECRET_KEY`) or passed via CLI flag `--secret-key` (discouraged in production).
- **Alternatives Considered**:
  - Encrypted keys in config files: Adds key management complexity without preventing secret leakage in plaintext repos.
- **Reason**: Strict security posture avoiding credential leaks in repository configuration files or logs.

---

## ADR-004: Persistent State Storage Engine for Keeper
- **Date**: 2026-10-08
- **Decision**: Use SQLite via `better-sqlite3` (with a simple JSON file store fallback if native build is unavailable in light environments) for the Keeper daemon.
- **Alternatives Considered**:
  - PostgreSQL/MySQL: Overkill for a lightweight keeper agent; introduces external database dependencies for deployment.
  - Plain JSON files: Lacks atomic transaction guarantees for spend tracking and alert deduplication during unexpected process restarts.
- **Reason**: SQLite is self-contained, high performance, zero-configuration, robust, and ideal for single-instance daemon state persistence.

---

## ADR-005: Alert Channel Architecture & Deduplication Strategy
- **Date**: 2026-10-08
- **Decision**: Implement a pluggable `AlertChannel` interface with standard channels (Generic Webhook, Slack, Discord). Deduplicate alerts using a stateful cooldown registry stored in SQLite/StateStore (keyed by `contractId:entryKey:alertType`), preventing notification spam across check cycles.
- **Alternatives Considered**:
  - In-memory alert cooldown: State lost on service restart, leading to alert bursts.
  - Stateless alerts: Causes spam on every check interval when a contract is low on TTL.
- **Reason**: Provides clean extensibility (<30 lines to implement a new channel) and reliable, low-noise operator notifications.
