# Stellar Agent Trust Fabric

**A trust and permission layer for autonomous AI agents on Stellar**

> Submitted to the [Stellar Agents x402 Hackathon](https://stellar.org/foundation)

---

## Problem

Autonomous AI agents need to pay for services — but giving an agent full wallet access is dangerous and unpractical. There is no standard way to:
- Restrict what an agent can spend (no unlimited access).
- Build a verifiable trust record that other agents and services can rely on.
- Discover and pay for services in a permissionless, agent-friendly way.

## Solution

**Stellar Agent Trust Fabric** is an open-source infrastructure layer that enables AI agents to:

1. **Operate with scoped, limited permissions** — session keys with spend caps, time limits, and endpoint whitelists, enforced via Soroban smart contracts.
2. **Build an on-chain reputation score** — every x402 payment and post-transaction rating increases (or decreases) the agent's verifiable reputation, stored on Soroban.
3. **Discover services via a decentralized marketplace** — service providers register x402-protected endpoints; agents query the registry sorted by reputation and price.
4. **Pay using x402** — all service access requires real on-chain micropayments via the x402 standard on Stellar Testnet.

No DeFi. No lending. No yield. Clean micropayments and verifiable trust only.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Agent                                │
│  1. Discover services  2. Create session  3. Pay via x402  │
│  4. Rate service  5. Reputation updated on-chain           │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTP + x402
               ▼
┌─────────────────────────────────────────────────────────────┐
│               Node.js + Express Backend                      │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────────┐│
│  │ x402 Middle-│ │ Reputation   │ │ Service Registry       ││
│  │ ware        │ │ Engine       │ │ (on-chain + DB mirror) ││
│  └─────────────┘ └──────────────┘ └───────────────────────┘│
└──────────────┬──────────────────────────────────────────────┘
               │ Soroban RPC + PostgreSQL
               ▼
┌─────────────────────────────────────────────────────────────┐
│              Stellar Testnet (Soroban)                       │
│  ┌──────────────┐ ┌───────────────┐ ┌────────────────────┐ │
│  │ Reputation   │ │ Session Policy│ │ Registry Contract  │ │
│  │ Contract     │ │ Contract      │ │                    │ │
│  └──────────────┘ └───────────────┘ └────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
               ▲
               │ React Dashboard
┌─────────────────────────────────────────────────────────────┐
│  Dashboard | Agents | Sessions | Marketplace | Payments      │
│  Demo Lab | Rate Service                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Smart Contracts (Soroban / Rust)

### `contracts/reputation/`
Stores agent reputation profiles on-chain.
- `record_payment(agent, amount_stroops)` — called after each x402 payment
- `submit_rating(agent, stars, amount_stroops)` — updates reputation after service delivery
- Reputation formula: log-weighted payment size × star quality (1-5 stars, neutral at 3)
- Score range: 0–100 (stored as 0–10000 integer internally for precision)

### `contracts/session-policy/`
Enforces scoped authorization for agents.
- `create_session(session_id, agent, max_spend_stroops, duration_seconds)` — creates a time-limited spend cap
- `authorize_spend(session_id, amount_stroops)` — checks and records each payment
- `revoke_session(session_id)` — immediately terminates a session
- Panics on policy violations (spend cap, expiry, revocation) to abort the calling transaction

### `contracts/registry/`
Service provider registry on-chain.
- `register_service(id, name, category, endpoint_hash, price_stroops, owner)` — lists a new x402 service
- `get_service(id)` / `list_service_ids()` — agent discovery queries
- Owner-authorized deactivation and price updates

---

## How x402 Works Here

```
Agent ──── GET /api/services/paid/summarize ────► Backend
                                                    │
                                                    │ 402 Payment Required
                                                    │ { x402Version: 1,
                                                    │   accepts: [{
                                                    │     scheme: "exact",
                                                    │     network: "stellar-testnet",
                                                    │     maxAmountRequired: "0.10",
                                                    │     payTo: "G...",
                                                    │     asset: "USDC:G..."
                                                    │   }]
                                                    │ }
                                                    ◄──────────────────────────

Agent signs Stellar transaction (0.10 USDC to payTo address)
Agent ──── POST /api/services/paid/summarize ───► Backend
           Header: X-PAYMENT: <base64 signed tx>
                                                    │ Verify payment on-chain
                                                    │ Record payment in DB
                                                    │ Update reputation
                                                    │
                                                    ◄── 200 { summary, paymentId }

Agent ──── POST /api/ratings ───────────────────► Backend
           { agentId, serviceId, paymentId, stars }
                                                    │ Update reputation on-chain
                                                    │ Compute delta
                                                    │
                                                    ◄── 201 { rating, reputationDelta }
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Rust + Soroban SDK 22.x |
| Backend API | Node.js + Express 5 + TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Payment Standard | x402 (HTTP 402 Payment Required) |
| Blockchain | Stellar Testnet (USDC SAC) |
| Frontend | React + Vite + TailwindCSS + React Query |
| API Contract | OpenAPI 3.1 + Orval codegen |
| Validation | Zod v4 |

---

## Running Locally

### Prerequisites
- Node.js 20+
- pnpm 9+
- Rust + `cargo` (for contracts)
- Stellar CLI (`stellar-cli`) for contract deployment
- PostgreSQL

### 1. Clone & install
```bash
git clone https://github.com/your-org/stellar-agent-trust-fabric
cd stellar-agent-trust-fabric
pnpm install
```

### 2. Environment
```bash
cp .env.example .env
# Fill in DATABASE_URL, SESSION_SECRET
```

### 3. Database
```bash
pnpm --filter @workspace/db run push
```

### 4. Run backend
```bash
pnpm --filter @workspace/api-server run dev
```

### 5. Run frontend
```bash
pnpm --filter @workspace/trust-fabric run dev
```

### 6. (Optional) Build Soroban contracts
```bash
cd contracts
cargo build --release --target wasm32-unknown-unknown
```

### 7. Run demo agent
```bash
# Register an agent first via the dashboard, then:
AGENT_ID=1 SERVICE_ID=1 npx ts-node examples/demo-agent/agent.ts
```

---

## Deploying Contracts to Testnet

```bash
# Install Stellar CLI
cargo install --locked stellar-cli --features opt

# Configure testnet
stellar network add testnet --rpc-url https://soroban-testnet.stellar.org --network-passphrase "Test SDF Network ; September 2015"

# Fund your account
stellar keys generate deployer --network testnet
stellar keys fund deployer --network testnet

# Build contracts
cd contracts
cargo build --release --target wasm32-unknown-unknown

# Deploy reputation contract
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/reputation.wasm \
  --source deployer \
  --network testnet

# Initialize
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- initialize --admin <YOUR_PUBLIC_KEY>
```

---

## Why This Fits the Hackathon

- **x402 payments**: All service access requires real x402 HTTP payment flows on Stellar Testnet
- **AI agent focus**: Purpose-built for autonomous agent workflows — discovery, payment, reputation, rating
- **Soroban smart contracts**: Three purpose-built contracts (reputation, session policy, registry) with full test suites
- **No DeFi**: Zero lending, staking, slashing, or yield — pure micropayments and trust mechanics
- **Open source**: Full MIT license, production-quality code, comprehensive docs

---

## Future Vision

- **MPP (Multi-Party Payments)**: Split payments between multiple service providers in a single transaction
- **Cross-agent trust delegation**: High-reputation agents vouch for new agents (social trust graph)
- **Privacy-preserving reputation**: Zero-knowledge proofs to prove reputation thresholds without revealing exact scores
- **Reputation NFTs**: Milestone-based reputation certificates as Stellar NFTs
- **Agent-to-agent micropayments**: Agents paying other agents for sub-tasks (recursive x402)
- **Mainnet deployment**: Production-ready with audited contracts and USDC settlement

---

## License

MIT © 2025 Stellar Agent Trust Fabric Contributors
