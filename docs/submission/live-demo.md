# Live Demo

The Evergreen submission is deployed as a Vercel multi-service project.

## Links

- **Dashboard:** [evergreen-labs.vercel.app](https://evergreen-labs.vercel.app)
- **Source:** [github.com/Evergreen-production/evergreen](https://github.com/Evergreen-production/evergreen)
- **Monitored contract:** [`CCAK6YBIECDQ2GFPMYLV3GWQPJN2DVGJGDHKY76ESZHI56DZMELSTPRV`](https://stellar.expert/explorer/testnet/contract/CCAK6YBIECDQ2GFPMYLV3GWQPJN2DVGJGDHKY76ESZHI56DZMELSTPRV)
- **Network:** Stellar Testnet

## What the demo proves

The dashboard calls the internal keeper through a Vercel service binding. On each cold start, the keeper reads the configured contract instance and code entries from Stellar RPC, calculates their remaining TTL, and returns the classified state to the dashboard.

The displayed `critical` state is live data, not a hard-coded presentation value. It demonstrates the exact condition Evergreen is designed to detect before archival.

## Demo safety

The public deployment intentionally has no `EVERGREEN_SECRET_KEY`. It can inspect the ledger but cannot sign or submit transactions. This avoids exposing a funded account in a public submission while preserving the complete extension workflow in the CLI and keeper code.

## Suggested walkthrough

1. Open the dashboard and confirm the keeper is connected.
2. Inspect the monitored contract row and remaining ledger TTL.
3. Open the contract explorer link to verify the Testnet address independently.
4. Review the architecture and guardrails in this documentation.
5. Review the CI, CodeQL, release, and branch-protection evidence in GitHub.
