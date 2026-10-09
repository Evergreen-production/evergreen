# Evergreen Documentation

Evergreen is an operational safety layer for Stellar Soroban state. It continuously inspects contract ledger-entry TTLs, reports risk before archival, and can execute bounded extension or restoration workflows when an operator enables a signer.

## What you can do

- Monitor contract instance and WASM code TTLs.
- Track selected persistent or temporary contract-data entries.
- Run one-time checks from a CLI or continuous checks from the keeper.
- Receive webhook, Slack, or Discord alerts.
- Review live health through a read-only API and dashboard.
- Apply fee ceilings and daily budgets before any transaction is signed.

## Explore Evergreen

- [See the live submission](submission/live-demo.md)
- [Understand the architecture](introduction/architecture.md)
- [Complete the quickstart](using/quickstart.md)
- [Deploy the keeper](operations/deployment.md)
- [Review security controls](threat-model.md)

{% hint style="info" %}
The public deployment runs on Stellar Testnet in read-only mode. A private signing key is required only for automated extend and restore transactions.
{% endhint %}
