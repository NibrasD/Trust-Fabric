//! Stellar Agent Trust Fabric — Service Registry Contract
//!
//! A lightweight on-chain registry where service providers list their
//! x402-protected API endpoints. Agents can query the registry to discover
//! services, their prices, and categories.
//!
//! The registry stores:
//!   - Service metadata (name, category, price, owner).
//!   - A list of all registered service IDs for enumeration.
//!
//! Reputation integration: the off-chain backend cross-references the registry
//! with the Reputation contract when sorting results by reputation + price.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Bytes, Env, Symbol, Vec,
};

// ── Storage keys ─────────────────────────────────────────────────────────────

const ADMIN: Symbol = symbol_short!("ADMIN");
const SVC_PREFIX: Symbol = symbol_short!("SVC");
const SVC_LIST: Symbol = symbol_short!("SVCLIST");

// ── Data types ────────────────────────────────────────────────────────────────

/// Service listing stored in the registry.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ServiceListing {
    /// Unique service identifier (bytes32 hash of name + owner).
    pub id: Bytes,
    /// Human-readable name.
    pub name: Bytes,
    /// Category tag (e.g. "AI", "Data", "Finance").
    pub category: Bytes,
    /// x402-protected endpoint URL hash (bytes32).
    pub endpoint_hash: Bytes,
    /// Price per call in stroops.
    pub price_stroops: i64,
    /// Service owner address (receives payments).
    pub owner: Address,
    /// Whether the listing is currently active.
    pub is_active: bool,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct RegistryContract;

#[contractimpl]
impl RegistryContract {
    /// Initialise the contract.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&ADMIN) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&ADMIN, &admin);
        env.storage()
            .instance()
            .set(&SVC_LIST, &Vec::<Bytes>::new(&env));
    }

    /// Register a new service listing.
    ///
    /// # Authorization
    /// The owner must sign the transaction (proves control of the address).
    pub fn register_service(
        env: Env,
        id: Bytes,
        name: Bytes,
        category: Bytes,
        endpoint_hash: Bytes,
        price_stroops: i64,
        owner: Address,
    ) {
        owner.require_auth();

        if env
            .storage()
            .instance()
            .has(&(SVC_PREFIX, id.clone()))
        {
            panic!("service already registered");
        }

        let listing = ServiceListing {
            id: id.clone(),
            name,
            category,
            endpoint_hash,
            price_stroops,
            owner: owner.clone(),
            is_active: true,
        };

        env.storage()
            .instance()
            .set(&(SVC_PREFIX, id.clone()), &listing);

        let mut list: Vec<Bytes> = env
            .storage()
            .instance()
            .get(&SVC_LIST)
            .unwrap_or_else(|| Vec::new(&env));
        list.push_back(id.clone());
        env.storage().instance().set(&SVC_LIST, &list);

        env.events().publish(
            (symbol_short!("register"), owner),
            (id, price_stroops),
        );
    }

    /// Return the listing for a specific service ID.
    pub fn get_service(env: Env, id: Bytes) -> ServiceListing {
        env.storage()
            .instance()
            .get(&(SVC_PREFIX, id))
            .expect("service not found")
    }

    /// Return all registered service IDs.
    pub fn list_service_ids(env: Env) -> Vec<Bytes> {
        env.storage()
            .instance()
            .get(&SVC_LIST)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Deactivate a service listing.
    pub fn deactivate_service(env: Env, id: Bytes, owner: Address) {
        owner.require_auth();
        let mut listing: ServiceListing = env
            .storage()
            .instance()
            .get(&(SVC_PREFIX, id.clone()))
            .expect("service not found");

        if listing.owner != owner {
            panic!("unauthorized: not the service owner");
        }

        listing.is_active = false;
        env.storage()
            .instance()
            .set(&(SVC_PREFIX, id.clone()), &listing);

        env.events().publish((symbol_short!("deactivate"), owner), id);
    }

    /// Update the price of a service.
    pub fn update_price(env: Env, id: Bytes, owner: Address, new_price_stroops: i64) {
        owner.require_auth();
        let mut listing: ServiceListing = env
            .storage()
            .instance()
            .get(&(SVC_PREFIX, id.clone()))
            .expect("service not found");

        if listing.owner != owner {
            panic!("unauthorized: not the service owner");
        }

        listing.price_stroops = new_price_stroops;
        env.storage()
            .instance()
            .set(&(SVC_PREFIX, id), &listing);
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Bytes, Env};

    fn mk_bytes(env: &Env, n: u8) -> Bytes {
        let mut b = [0u8; 32];
        b[0] = n;
        Bytes::from_array(env, &b)
    }

    #[test]
    fn test_register_and_get_service() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        client.initialize(&admin);

        let id = mk_bytes(&env, 1);
        let name = mk_bytes(&env, 2);
        let category = mk_bytes(&env, 3);
        let endpoint = mk_bytes(&env, 4);

        client.register_service(&id, &name, &category, &endpoint, &1_000_000, &owner);

        let listing = client.get_service(&id);
        assert_eq!(listing.price_stroops, 1_000_000);
        assert!(listing.is_active);

        let ids = client.list_service_ids();
        assert_eq!(ids.len(), 1);
    }

    #[test]
    fn test_deactivate_service() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        client.initialize(&admin);

        let id = mk_bytes(&env, 10);
        client.register_service(
            &id,
            &mk_bytes(&env, 11),
            &mk_bytes(&env, 12),
            &mk_bytes(&env, 13),
            &500_000,
            &owner,
        );
        client.deactivate_service(&id, &owner);
        let listing = client.get_service(&id);
        assert!(!listing.is_active);
    }
}
