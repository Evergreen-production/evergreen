# Production Checklist

- Use a dedicated, minimally funded signer account and store its secret in a managed secret store.
- Pin and review the RPC endpoint and network passphrase; start on Testnet.
- Configure per-transaction and daily fee caps.
- Protect the keeper API with a bearer token and private network access.
- Configure at least one alert channel and test delivery.
- Persist and back up the SQLite state directory.
- Run the full CI suite and a live Testnet dry run before every release.
- Require reviewed pull requests and passing CI on the default branch.
- Monitor signer balance, failed cycles, archived entries, and transaction hashes.
- Keep an operator runbook for RPC outages, bad sequence errors, and key rotation.

Evergreen reduces TTL operational risk; it does not replace contract audits, infrastructure monitoring, or signer-key controls.
