//! Stellar Agent Trust Fabric — Reputation Contract
//!
//! Stores and updates on-chain reputation profiles for AI agents.
//! Each agent's reputation is derived from successful x402 payments
//! and post-transaction ratings (1-5 stars).
//!
//! Key design decisions:
//! - Reputation is strictly non-financial (no staking, lending, yield).
//! - Weighted by payment amount: high-value transactions carry more weight.
//! - Stored as a simple mapping: agent_address → ReputationProfile.
//! - All state mutations emit events for off-chain indexing.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

// ── Storage keys ─────────────────────────────────────────────────────────────

const REPUTATION: Symbol = symbol_short!("REP");
const ADMIN: Symbol = symbol_short!("ADMIN");

// ── Data types ────────────────────────────────────────────────────────────────

/// Full reputation profile stored per agent.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ReputationProfile {
    /// Scaled integer (×100) representing a 0–10000 score (= 0.00–100.00).
    pub score: i64,
    /// Number of confirmed x402 payments.
    pub total_transactions: u32,
    /// Sum of stars × 100 across all ratings (for average calculation).
    pub total_stars_scaled: i64,
    /// Number of ratings received.
    pub rating_count: u32,
    /// Total USDC paid (in stroops, 1 USDC = 10^7).
    pub total_paid_stroops: i64,
}

impl Default for ReputationProfile {
    fn default() -> Self {
        ReputationProfile {
            score: 0,
            total_transactions: 0,
            total_stars_scaled: 0,
            rating_count: 0,
            total_paid_stroops: 0,
        }
    }
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct ReputationContract;

#[contractimpl]
impl ReputationContract {
    /// Initialise the contract with an admin address.
    /// Must be called once immediately after deployment.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&ADMIN) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&ADMIN, &admin);
    }

    /// Return the admin address.
    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&ADMIN).unwrap()
    }

    /// Return the reputation profile for an agent, or a default profile if
    /// the agent has never interacted with the fabric.
    pub fn get_reputation(env: Env, agent: Address) -> ReputationProfile {
        env.storage()
            .instance()
            .get(&(REPUTATION, agent))
            .unwrap_or_default()
    }

    /// Record a confirmed x402 payment for an agent.
    ///
    /// # Parameters
    /// - `agent`: the agent's Stellar address.
    /// - `amount_stroops`: payment amount in stroops (1 USDC = 10,000,000).
    ///
    /// # Authorization
    /// Only the admin (backend facilitator) can record payments.
    pub fn record_payment(env: Env, agent: Address, amount_stroops: i64) {
        Self::require_admin(&env);
        let mut profile: ReputationProfile = env
            .storage()
            .instance()
            .get(&(REPUTATION, agent.clone()))
            .unwrap_or_default();

        profile.total_transactions += 1;
        profile.total_paid_stroops += amount_stroops;

        // Positive reputation bump: log-scaled by payment size.
        // Small constant bump (10 = 0.10 score points) multiplied by log factor.
        let bump = Self::log_weight(amount_stroops);
        profile.score = (profile.score + bump).min(10000);

        env.storage()
            .instance()
            .set(&(REPUTATION, agent.clone()), &profile);

        env.events().publish(
            (symbol_short!("payment"), agent),
            (amount_stroops, profile.score),
        );
    }

    /// Submit a post-transaction rating for an agent (1–5 stars).
    ///
    /// # Authorization
    /// Only the admin can submit ratings (prevents self-rating abuse).
    pub fn submit_rating(env: Env, agent: Address, stars: u32, amount_stroops: i64) {
        Self::require_admin(&env);
        if stars < 1 || stars > 5 {
            panic!("stars must be between 1 and 5");
        }

        let mut profile: ReputationProfile = env
            .storage()
            .instance()
            .get(&(REPUTATION, agent.clone()))
            .unwrap_or_default();

        profile.rating_count += 1;
        profile.total_stars_scaled += (stars as i64) * 100;

        // Reputation delta: weighted by payment size and star quality.
        // Neutral is 3 stars — anything above increases score, below decreases.
        let weight = Self::log_weight(amount_stroops);
        let star_factor: i64 = (stars as i64 - 3) * 25; // –50 to +50 per log unit
        let delta = weight * star_factor / 100;

        profile.score = (profile.score + delta).clamp(0, 10000);

        env.storage()
            .instance()
            .set(&(REPUTATION, agent.clone()), &profile);

        env.events().publish(
            (symbol_short!("rating"), agent),
            (stars, delta, profile.score),
        );
    }

    /// Compute the average star rating for an agent (×100 for precision).
    pub fn avg_rating_scaled(env: Env, agent: Address) -> i64 {
        let profile: ReputationProfile = env
            .storage()
            .instance()
            .get(&(REPUTATION, agent))
            .unwrap_or_default();

        if profile.rating_count == 0 {
            return 0;
        }
        profile.total_stars_scaled / profile.rating_count as i64
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        admin.require_auth();
    }

    /// Log-weight for payment size: approximation of ln(1 + stroops / 1e7).
    /// Returns an integer weight in the range [0, ~230].
    fn log_weight(stroops: i64) -> i64 {
        if stroops <= 0 {
            return 0;
        }
        // Approximate log using integer arithmetic (base-2 bit length).
        let usdc_cents = stroops / 100_000; // centUSdc
        let bits = (64 - usdc_cents.leading_zeros()) as i64;
        bits.max(0)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_record_payment_increases_score() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ReputationContract);
        let client = ReputationContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let agent = Address::generate(&env);

        client.initialize(&admin);

        let before = client.get_reputation(&agent);
        assert_eq!(before.score, 0);

        // Record a 1 USDC payment (10,000,000 stroops).
        client.record_payment(&agent, &10_000_000);

        let after = client.get_reputation(&agent);
        assert!(after.score > 0);
        assert_eq!(after.total_transactions, 1);
    }

    #[test]
    fn test_five_star_rating_increases_score() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ReputationContract);
        let client = ReputationContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let agent = Address::generate(&env);
        client.initialize(&admin);
        client.record_payment(&agent, &10_000_000);
        let before = client.get_reputation(&agent).score;

        client.submit_rating(&agent, &5, &10_000_000);
        let after = client.get_reputation(&agent).score;
        assert!(after > before);
    }

    #[test]
    fn test_one_star_rating_decreases_score() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ReputationContract);
        let client = ReputationContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let agent = Address::generate(&env);
        client.initialize(&admin);
        // Build some score first.
        client.record_payment(&agent, &100_000_000);
        let before = client.get_reputation(&agent).score;

        client.submit_rating(&agent, &1, &10_000_000);
        let after = client.get_reputation(&agent).score;
        assert!(after < before);
    }
}
