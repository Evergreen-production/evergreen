# Thresholds and Guardrails

`warn_below_days` controls early notification, `extend_below_days` controls when renewal becomes eligible, and `extend_to_days` sets the target lifetime. `max_fee_stroops` rejects unexpectedly expensive simulations. Daily spend limits stop the keeper when aggregate fees exceed the operator's budget.

Start on Testnet, use conservative caps, and validate observed fees before enabling Mainnet signing.
