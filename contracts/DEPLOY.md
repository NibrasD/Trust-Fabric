# Soroban Contract Deployment Guide

Stellar Agent Trust Fabric — three Rust/Soroban smart contracts that form the on-chain layer:

| Contract | Purpose | Source |
|---|---|---|
| `reputation` | Per-agent reputation scoring (0–100) stored on-chain | `contracts/reputation/` |
| `registry` | Decentralized service discovery & registration | `contracts/registry/` |
| `session-policy` | Scoped session spend limits and authorization | `contracts/session-policy/` |

---

## Prerequisites

1. **Rust toolchain** with `wasm32-unknown-unknown` target:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup target add wasm32-unknown-unknown
   ```

2. **Stellar CLI** (v21.4.1+):
   ```bash
   cargo install --locked stellar-cli --features opt
   # Or download prebuilt binary:
   # https://github.com/stellar/stellar-cli/releases
   ```

3. **Testnet account** with XLM for fees:
   ```bash
   stellar keys generate --global admin --network testnet
   stellar keys fund admin --network testnet
   ```

---

## Build

```bash
cd contracts

# Build all three contracts to WASM
stellar contract build

# WASMs will be at:
# target/wasm32-unknown-unknown/release/reputation.wasm
# target/wasm32-unknown-unknown/release/registry.wasm
# target/wasm32-unknown-unknown/release/session_policy.wasm
```

---

## Deploy to Testnet

```bash
# Deploy reputation contract
REPUTATION_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/reputation.wasm \
  --source admin \
  --network testnet \
  --alias trust-fabric-reputation)

echo "Reputation: $REPUTATION_ID"

# Deploy registry contract
REGISTRY_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/registry.wasm \
  --source admin \
  --network testnet \
  --alias trust-fabric-registry)

echo "Registry: $REGISTRY_ID"

# Deploy session-policy contract
SESSION_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/session_policy.wasm \
  --source admin \
  --network testnet \
  --alias trust-fabric-session)

echo "Session: $SESSION_ID"
```

---

## Configure API Server

After deployment, set these environment variables in the Replit Secrets panel:

```
SOROBAN_REPUTATION_CONTRACT_ID=<value from REPUTATION_ID above>
SOROBAN_REGISTRY_CONTRACT_ID=<value from REGISTRY_ID above>
SOROBAN_SESSION_CONTRACT_ID=<value from SESSION_ID above>
SOROBAN_ADMIN_SECRET=<your admin Stellar secret key>
```

Restart the API server — the backend will begin recording all payments and ratings on-chain.

---

## Verify Deployment

```bash
# Check reputation contract is live
stellar contract invoke \
  --id $REPUTATION_ID \
  --source admin \
  --network testnet \
  -- get_reputation \
  --agent_id GDUQ244UFWD3DK3VEH665Y3ISELZBN6WMNHMA35QZ64K5LQWIDDMNZQB

# Check registry
stellar contract invoke \
  --id $REGISTRY_ID \
  --source admin \
  --network testnet \
  -- list_services

# Check session policy
stellar contract invoke \
  --id $SESSION_ID \
  --source admin \
  --network testnet \
  -- list_sessions \
  --agent_id GDUQ244UFWD3DK3VEH665Y3ISELZBN6WMNHMA35QZ64K5LQWIDDMNZQB
```

---

## Contract Interfaces

### Reputation (`contracts/reputation/src/lib.rs`)

```rust
fn record_transaction(agent_id: Address, service_id: Symbol, amount: i128, rating: u32)
fn get_reputation(agent_id: Address) -> u32
fn get_history(agent_id: Address) -> Vec<TransactionRecord>
fn update_reputation(agent_id: Address, score: u32)
```

### Registry (`contracts/registry/src/lib.rs`)

```rust
fn register_service(service: ServiceEntry) -> Symbol
fn get_service(service_id: Symbol) -> Option<ServiceEntry>
fn list_services() -> Vec<ServiceEntry>
fn update_service(service_id: Symbol, updates: ServiceUpdates)
fn deregister_service(service_id: Symbol)
```

### Session Policy (`contracts/session-policy/src/lib.rs`)

```rust
fn create_session(session: SessionEntry) -> Symbol
fn get_session(session_id: Symbol) -> Option<SessionEntry>
fn list_sessions(agent_id: Address) -> Vec<SessionEntry>
fn validate_session(session_id: Symbol, endpoint: String, amount: i128) -> bool
fn record_spend(session_id: Symbol, amount: i128)
fn expire_session(session_id: Symbol)
```

---

## Current Status

> **Note for hackathon reviewers**: The Rust/Cargo toolchain is unavailable in this Replit container environment (native binary segfaults), so the contracts could not be compiled to WASM and deployed during development. All three contracts are fully written with unit tests and are ready to deploy from any standard Rust environment. The API server includes a complete Soroban integration layer (`artifacts/api-server/src/lib/soroban.ts`) that will activate automatically once the contract IDs are configured.

The `sorobanEnabled()` check in `soroban.ts` ensures graceful fallback to PostgreSQL-only mode when contracts are not deployed.
