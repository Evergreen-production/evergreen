# FAQ and Limitations

## Does Evergreen need to own the monitored contract?

No. TTL inspection is read-only. A keeper signer pays maintenance fees but does not need to be the contract administrator unless the contract itself imposes additional authorization.

## Is a secret key required?

Only for submitting extend or restore transactions. Monitoring, classification, the API, and the dashboard work without one.

## Can Evergreen run on Mainnet?

Yes, but Testnet is the default. Mainnet operators should use a dedicated minimally funded signer, a reviewed RPC endpoint, strict caps, persistent storage, and external monitoring.

## Is the public dashboard fully autonomous?

No. It is intentionally read-only. This avoids placing a funded signing key in a public demonstration deployment.

## What is not yet included?

- A hosted multi-tenant control plane
- Durable database storage in the Vercel demo
- Hardware-wallet or threshold-signing integration
- A browser workflow for registering contracts
- A guarantee of RPC availability or contract correctness

These are deployment or roadmap concerns rather than hidden assumptions; the core monitoring and transaction-planning paths are implemented and tested.
