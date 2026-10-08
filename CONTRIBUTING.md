# Contributing to Evergreen

Thank you for your interest in contributing to Evergreen!

## Development Setup

### Prerequisites
- **Node.js**: v20.0.0 or higher
- **pnpm**: v8.0.0 or higher
- **Rust**: 1.75+ with `wasm32-unknown-unknown` target (for contract testing)

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/stellar/evergreen.git
   cd evergreen
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Build all workspace packages:
   ```bash
   pnpm build
   ```

4. Run tests:
   ```bash
   pnpm test
   pnpm cargo:test
   ```

5. Run linters:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm cargo:clippy
   ```

## Commit Conventions

We follow Conventional Commits for commit messages:
- `feat: add Discord alert channel`
- `fix: handle RPC rate limit retry backoff`
- `docs: update threat model`
- `test: add unit tests for daily spend cap enforcement`

## Architecture & Design Guidelines

- **No I/O in `@evergreen/core`**: Core must remain a pure domain logic library. Inject mock RPC clients for testing.
- **Never Log Secrets**: Ensure secret keys (e.g. `EVERGREEN_SECRET_KEY`) are masked or sanitized prior to logging.
- **Document Decisions**: Record major design choices or trade-offs in `docs/DECISIONS.md`.
