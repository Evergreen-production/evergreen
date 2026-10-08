# Threat Model

## Assets

The primary assets are the keeper signing key, fee balance, monitored contract availability, configuration integrity, and operational history.

## Main threats

- Secret disclosure through configuration, logs, process arguments, or public APIs.
- Fee exhaustion caused by repeated or unexpectedly expensive submissions.
- Wrong-network execution or malicious RPC responses.
- Unauthorized access to status data or operational controls.
- Missed renewals during RPC, host, database, or alert outages.

## Controls

Secrets are environment-only and redacted, Mainnet is explicit and warned, simulations precede submissions, fee caps limit exposure, alert cooldowns reduce floods, and the keeper API supports bearer authentication. Operators should add network isolation, managed secrets, independent monitoring, and key rotation.

## Out of scope

Evergreen does not prove contract correctness, guarantee RPC honesty or availability, or recover a compromised signer. Report suspected vulnerabilities privately using the process in `SECURITY.md`.
