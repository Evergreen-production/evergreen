# `evergreen-ttl`

Inline Soroban contract storage TTL extension helpers.

## Usage

Add `evergreen-ttl` to your contract's `Cargo.toml`:

```toml
[dependencies]
evergreen-ttl = "0.1.0"
```

In your contract code:

```rust
use evergreen_ttl::{extend_instance_ttl, extend_persistent_ttl};
use soroban_sdk::{contract, contractimpl, symbol_short, Env, Symbol};

const COUNTER: Symbol = symbol_short!("COUNTER");

#[contract]
pub struct CounterContract;

#[contractimpl]
impl CounterContract {
    pub fn increment(env: Env) -> u32 {
        let count: u32 = env.storage().persistent().get(&COUNTER).unwrap_or(0);
        let new_count = count + 1;
        env.storage().persistent().set(&COUNTER, &new_count);

        // Extend persistent storage entry TTL
        extend_persistent_ttl(&env, &COUNTER, 100_000, 500_000);
        // Extend instance TTL
        extend_instance_ttl(&env, 100_000, 500_000);

        new_count
    }
}
```
