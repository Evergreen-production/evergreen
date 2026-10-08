# Quickstart

Install Node.js 20+, pnpm 9+, and Rust. Run `pnpm install`, `pnpm build`, and `evergreen init`. Add Testnet contract IDs to `evergreen.toml`, then run `evergreen check` and `evergreen extend --dry-run`.

Set `EVERGREEN_SECRET_KEY` only when you are ready to submit. Use `--yes` for a confirmed one-shot extend or restore. Never commit a secret key.
