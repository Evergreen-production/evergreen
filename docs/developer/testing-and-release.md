# Testing and Release

Pull requests must pass lint, TypeScript type checking, unit tests, package builds, Rust formatting, Clippy, and Rust tests. Releases use semantic version tags (`vMAJOR.MINOR.PATCH`) and immutable GitHub release notes.

Before tagging, verify a Testnet dry run against a real contract, review dependency alerts, confirm the container starts without secrets in its logs, and complete the production checklist.
