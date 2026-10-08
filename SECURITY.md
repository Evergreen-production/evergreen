# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within Evergreen, please follow responsible disclosure guidelines:

1. **Do NOT open a public GitHub issue.**
2. Send an email with details, reproduction steps, and potential impact to `security@stellar.org` (or create a draft GitHub Security Advisory).
3. We will acknowledge receipt within 48 hours and provide status updates as we work on a resolution.

## Key Security Principles in Evergreen

- **Zero Secret Persistence**: Secret keys are only read from process environment variables and are never stored on disk or rendered in logs/status endpoints.
- **Strict Network Isolation**: Defaults to Testnet; Mainnet execution requires explicit consent and configuration.
- **Transaction Resource Guardrails**: Per-transaction and per-day stroop spend caps enforce strict transaction fee upper bounds.
