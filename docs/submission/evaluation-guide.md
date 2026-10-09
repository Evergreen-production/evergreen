# Evaluation Guide

Evergreen is designed around a narrow production problem: preventing Soroban applications from unexpectedly losing access to archived state.

## Product value

Operators currently need to understand ledger-key construction, query RPC state, track TTL thresholds, fund a signer, and safely submit maintenance transactions. Evergreen combines those responsibilities into a repeatable workflow with visible health and bounded costs.

## Technical depth

- Builds contract-instance, code, and named-data ledger keys.
- Queries live ledger state through Stellar RPC.
- Converts time-based policies into ledger thresholds.
- Plans extend and restore footprints and simulates transactions.
- Enforces fee and daily-spend caps before signing.
- Maintains scheduled state and alert cooldowns.
- Deploys a Next.js dashboard and private container service from one repository.

## Production evidence

- Protected `main` branch with reviewed pull requests.
- TypeScript and Rust CI plus CodeQL scanning.
- Versioned GitHub releases and Apache-2.0 licensing.
- Public Testnet deployment with a verified contract.
- Documented threat model, operational checklist, and recovery considerations.

## Honest limitations

The public demo uses ephemeral SQLite storage and read-only operation. Durable production history requires persistent storage, and automatic remediation requires a privately managed, funded signer. These limitations are explicit so an operator can make an informed deployment decision.
