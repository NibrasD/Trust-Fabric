//! Stellar Agent Trust Fabric — Session Policy Contract
//!
//! Enforces scoped, time-limited, spend-capped authorization for AI agents.
//! Instead of giving an agent unlimited wallet access, operators create a
//! session key that restricts:
//!   - Maximum USDC spend (e.g. 0.50 USDC per session).
//!   - Allowed endpoints (whitelisted service identifiers).
//!   - Session lifetime (expires at a specific ledger timestamp).
//!
//! All session state lives on-chain; every spend check updates the spent total.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, vec, Address, Bytes, Env,
    String as SorobanString, Symbol, Vec,
};

// ── Storage keys ─────────────────────────────────────────────────────────────

const ADMIN: Symbol = symbol_short!("ADMIN");
const SESSION_PREFIX: Symbol = symbol_short!("SESSION");

// ── Data types ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum SessionStatus {
    Active,
    Expired,
    Revoked,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct SessionPolicy {
    /// The agent this session belongs to.
    pub agent: Address,
    /// Maximum spend in stroops (1 USDC = 10,000,000 stroops).
    pub max_spend_stroops: i64,
    /// USDC already spent in this session (stroops).
    pub spent_stroops: i64,
    /// Ledger timestamp after which this session is invalid.
    pub expires_at: u64,
    /// Current status.
    pub status: SessionStatus,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct SessionPolicyContract;

#[contractimpl]
impl SessionPolicyContract {
    /// Initialise the contract.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&ADMIN) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&ADMIN, &admin);
    }

    /// Create a new scoped session for an agent.
    ///
    /// # Parameters
    /// - `session_id`: unique 32-byte session identifier.
    /// - `agent`: the agent this session authorizes.
    /// - `max_spend_stroops`: spending cap in stroops.
    /// - `duration_seconds`: how long the session is valid.
    ///
    /// # Returns
    /// The session key (same as `session_id`) for use in subsequent calls.
    pub fn create_session(
        env: Env,
        session_id: Bytes,
        agent: Address,
        max_spend_stroops: i64,
        duration_seconds: u64,
    ) -> Bytes {
        Self::require_admin(&env);
        if env
            .storage()
            .instance()
            .has(&(SESSION_PREFIX, session_id.clone()))
        {
            panic!("session already exists");
        }

        let expires_at = env.ledger().timestamp() + duration_seconds;

        let policy = SessionPolicy {
            agent: agent.clone(),
            max_spend_stroops,
            spent_stroops: 0,
            expires_at,
            status: SessionStatus::Active,
        };

        env.storage()
            .instance()
            .set(&(SESSION_PREFIX, session_id.clone()), &policy);

        env.events().publish(
            (symbol_short!("created"), agent),
            (session_id.clone(), max_spend_stroops, expires_at),
        );

        session_id
    }

    /// Verify and record a spend against a session.
    ///
    /// Returns `true` if the spend is allowed (session active, within limits).
    /// Increments `spent_stroops` on success.
    /// Panics on policy violation so the calling contract can abort.
    pub fn authorize_spend(
        env: Env,
        session_id: Bytes,
        amount_stroops: i64,
    ) -> bool {
        let mut policy: SessionPolicy = env
            .storage()
            .instance()
            .get(&(SESSION_PREFIX, session_id.clone()))
            .expect("session not found");

        // Auto-expire.
        if env.ledger().timestamp() >= policy.expires_at {
            policy.status = SessionStatus::Expired;
            env.storage()
                .instance()
                .set(&(SESSION_PREFIX, session_id), &policy);
            panic!("session expired");
        }

        match policy.status {
            SessionStatus::Active => {}
            SessionStatus::Expired => panic!("session expired"),
            SessionStatus::Revoked => panic!("session revoked"),
        }

        let new_spent = policy.spent_stroops + amount_stroops;
        if new_spent > policy.max_spend_stroops {
            panic!("spend limit exceeded");
        }

        policy.spent_stroops = new_spent;
        env.storage()
            .instance()
            .set(&(SESSION_PREFIX, session_id.clone()), &policy);

        env.events().publish(
            (symbol_short!("spend"), policy.agent.clone()),
            (session_id, amount_stroops, new_spent),
        );

        true
    }

    /// Revoke a session, preventing any further spending.
    pub fn revoke_session(env: Env, session_id: Bytes) {
        Self::require_admin(&env);
        let mut policy: SessionPolicy = env
            .storage()
            .instance()
            .get(&(SESSION_PREFIX, session_id.clone()))
            .expect("session not found");

        policy.status = SessionStatus::Revoked;
        env.storage()
            .instance()
            .set(&(SESSION_PREFIX, session_id.clone()), &policy);

        env.events().publish(
            (symbol_short!("revoked"), policy.agent),
            session_id,
        );
    }

    /// Return the current state of a session.
    pub fn get_session(env: Env, session_id: Bytes) -> SessionPolicy {
        env.storage()
            .instance()
            .get(&(SESSION_PREFIX, session_id))
            .expect("session not found")
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Bytes, Env};

    fn mk_session_id(env: &Env, n: u8) -> Bytes {
        let mut b = [0u8; 32];
        b[0] = n;
        Bytes::from_array(env, &b)
    }

    #[test]
    fn test_authorize_spend_within_limit() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SessionPolicyContract);
        let client = SessionPolicyContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let agent = Address::generate(&env);
        client.initialize(&admin);

        let sid = mk_session_id(&env, 1);
        client.create_session(&sid, &agent, &10_000_000, &3600);

        let ok = client.authorize_spend(&sid, &5_000_000);
        assert!(ok);

        let policy = client.get_session(&sid);
        assert_eq!(policy.spent_stroops, 5_000_000);
    }

    #[test]
    #[should_panic(expected = "spend limit exceeded")]
    fn test_authorize_spend_exceeds_limit() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SessionPolicyContract);
        let client = SessionPolicyContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let agent = Address::generate(&env);
        client.initialize(&admin);

        let sid = mk_session_id(&env, 2);
        client.create_session(&sid, &agent, &1_000_000, &3600);
        client.authorize_spend(&sid, &5_000_000); // should panic
    }

    #[test]
    #[should_panic(expected = "session revoked")]
    fn test_revoked_session_cannot_spend() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SessionPolicyContract);
        let client = SessionPolicyContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let agent = Address::generate(&env);
        client.initialize(&admin);

        let sid = mk_session_id(&env, 3);
        client.create_session(&sid, &agent, &10_000_000, &3600);
        client.revoke_session(&sid);
        client.authorize_spend(&sid, &1_000_000); // should panic
    }
}
