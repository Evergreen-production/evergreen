# Local Setup

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
cargo test --manifest-path crates/evergreen-ttl/Cargo.toml
```

Generated directories, incremental compiler state, databases, logs, and environment files are excluded from version control.
