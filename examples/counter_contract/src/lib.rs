#![no_std]

use evergreen_ttl::{extend_instance_ttl, extend_persistent_ttl};
use soroban_sdk::{contract, contractimpl, symbol_short, Env, Symbol};

const COUNTER: Symbol = symbol_short!("COUNTER");

#[contract]
pub struct CounterContract;

#[contractimpl]
impl CounterContract {
    /// Increment counter stored in persistent storage, auto-extending TTL
    pub fn increment(env: Env) -> u32 {
        let count: u32 = env.storage().persistent().get(&COUNTER).unwrap_or(0);
        let new_count = count + 1;

        env.storage().persistent().set(&COUNTER, &new_count);

        // Extend storage TTLs: if remaining TTL < 100,000 ledgers, extend to 500,000 ledgers
        extend_persistent_ttl(&env, &COUNTER, 100_000, 500_000);
        extend_instance_ttl(&env, 100_000, 500_000);

        new_count
    }

    /// Read counter value without extending TTL
    pub fn get_count(env: Env) -> u32 {
        env.storage().persistent().get(&COUNTER).unwrap_or(0)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn test_increment() {
        let env = Env::default();
        let contract_id = env.register_contract(None, CounterContract);
        let client = CounterContractClient::new(&env, &contract_id);

        assert_eq!(client.get_count(), 0);
        assert_eq!(client.increment(), 1);
        assert_eq!(client.increment(), 2);
        assert_eq!(client.get_count(), 2);
    }
}
