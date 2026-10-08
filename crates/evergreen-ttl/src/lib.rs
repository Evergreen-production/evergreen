//! # Evergreen TTL Helpers for Soroban Smart Contracts
//!
//! Provides inline utility functions for contract authors to extend storage entry TTLs
//! directly inside Soroban contract functions.
//!
//! ## Storage Pattern Guidelines
//!
//! Soroban provides three distinct storage types:
//!
//! 1. **Instance Storage (`env.storage().instance()`)**:
//!    - **Use for**: Contract admin address, global settings, small shared state.
//!    - **Lifetime**: Bound to the contract instance. Auto-extended along with instance TTL.
//!    - **Recommendation**: Extend instance TTL on high-frequency administrative invocations.
//!
//! 2. **Persistent Storage (`env.storage().persistent()`)**:
//!    - **Use for**: User balances, critical state, records that must never be automatically pruned.
//!    - **Lifetime**: Must be explicitly extended before expiration. Can be restored if archived.
//!    - **Recommendation**: Extend TTL on user interaction (e.g. deposit, transfer).
//!
//! 3. **Temporary Storage (`env.storage().temporary()`)**:
//!    - **Use for**: Short-lived data, nonces, session tokens, ephemeral offers.
//!    - **Lifetime**: Pruned upon expiration; **cannot be restored** once archived.
//!    - **Recommendation**: Set small extend_to bounds; avoid storing user funds here.

#![no_std]

use soroban_sdk::Env;

/// Recommended default threshold: 30 days worth of ledgers (~518,400 ledgers at 5s/ledger)
pub const DEFAULT_THRESHOLD_LEDGERS: u32 = 518_400;

/// Recommended default extend-to: 90 days worth of ledgers (~1,555,200 ledgers)
pub const DEFAULT_EXTEND_TO_LEDGERS: u32 = 1_555_200;

/// Extend contract instance TTL if remaining TTL is below `threshold_ledgers`.
///
/// # Arguments
/// * `env` - Soroban environment reference
/// * `threshold_ledgers` - Extend only if remaining TTL is less than this
/// * `extend_to_ledgers` - Extend target duration in ledgers
pub fn extend_instance_ttl(env: &Env, threshold_ledgers: u32, extend_to_ledgers: u32) {
    env.storage()
        .instance()
        .extend_ttl(threshold_ledgers, extend_to_ledgers);
}

/// Extend a persistent storage entry TTL if remaining TTL is below `threshold_ledgers`.
///
/// # Arguments
/// * `env` - Soroban environment reference
/// * `key` - Storage key reference
/// * `threshold_ledgers` - Threshold below which to extend
/// * `extend_to_ledgers` - Target duration in ledgers
pub fn extend_persistent_ttl<K>(env: &Env, key: &K, threshold_ledgers: u32, extend_to_ledgers: u32)
where
    K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
{
    env.storage()
        .persistent()
        .extend_ttl(key, threshold_ledgers, extend_to_ledgers);
}

/// Extend a temporary storage entry TTL if remaining TTL is below `threshold_ledgers`.
///
/// # Arguments
/// * `env` - Soroban environment reference
/// * `key` - Storage key reference
/// * `threshold_ledgers` - Threshold below which to extend
/// * `extend_to_ledgers` - Target duration in ledgers
pub fn extend_temporary_ttl<K>(env: &Env, key: &K, threshold_ledgers: u32, extend_to_ledgers: u32)
where
    K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
{
    env.storage()
        .temporary()
        .extend_ttl(key, threshold_ledgers, extend_to_ledgers);
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{contract, contractimpl, symbol_short, Symbol};

    #[contract]
    pub struct DummyContract;

    #[contractimpl]
    impl DummyContract {
        pub fn test_instance(env: Env) {
            extend_instance_ttl(&env, 100, 1000);
        }

        pub fn test_persistent(env: Env) {
            let key: Symbol = symbol_short!("counter");
            env.storage().persistent().set(&key, &42u32);
            extend_persistent_ttl(&env, &key, 100, 1000);
        }

        pub fn test_temporary(env: Env) {
            let key: Symbol = symbol_short!("nonce");
            env.storage().temporary().set(&key, &100u32);
            extend_temporary_ttl(&env, &key, 100, 1000);
        }
    }

    #[test]
    fn test_extend_instance_ttl() {
        let env = Env::default();
        let contract_id = env.register_contract(None, DummyContract);
        let client = DummyContractClient::new(&env, &contract_id);
        client.test_instance();
    }

    #[test]
    fn test_extend_persistent_ttl() {
        let env = Env::default();
        let contract_id = env.register_contract(None, DummyContract);
        let client = DummyContractClient::new(&env, &contract_id);
        client.test_persistent();
    }

    #[test]
    fn test_extend_temporary_ttl() {
        let env = Env::default();
        let contract_id = env.register_contract(None, DummyContract);
        let client = DummyContractClient::new(&env, &contract_id);
        client.test_temporary();
    }
}
