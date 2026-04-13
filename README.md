Stellar Agent Trust Fabric
A decentralized trust and micropayment infrastructure for autonomous AI agents on the Stellar network. Built for the Stellar Agents x402 Hackathon.

What Is It?
Stellar Agent Trust Fabric is an infrastructure layer that lets AI agents discover, pay for, and rate services using native Stellar micropayments — with no custodians, no API keys to share, and no trust required. Every payment is a real Stellar transaction. Every reputation score lives on-chain. Every spend is authorized by a Soroban smart contract before it happens.

Core principle: no agent can execute any transaction without a valid Session Key, and no payment can be built without on-chain Soroban authorization.

Architecture
┌─────────────────────────────────────────────────────────────────┐
│                         AI Agent (any LLM)                      │
│          Claude · GPT-4 · Cursor · Custom MCP Client            │
└───────────────────────────────┬─────────────────────────────────┘
                                │  HTTP + X-PAYMENT header (x402)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Trust Fabric API Server                       │
│                     (Node.js / Express 5)                       │
│                                                                  │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │  x402 Middleware│  │  MCP Server  │  │   Workflow Engine   │ │
│  │  Payment Verify │  │  (10 Tools)  │  │  (HTTP/Pay/Chain)   │ │
│  └────────────────┘  └──────────────┘  └─────────────────────┘ │
│                                                                  │
│  ┌────────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐  │
│  │  Agents    │  │ Services │  │  Sessions  │  │  Payments  │  │
│  │  Registry  │  │Marketplace│  │  Manager  │  │   Ledger   │  │
│  └────────────┘  └──────────┘  └───────────┘  └────────────┘  │
└────────────┬────────────────────────────────────────┬───────────┘
             │                                        │
             ▼                                        ▼
┌────────────────────────┐              ┌─────────────────────────┐
│  Soroban Smart Contracts│              │     Stellar Horizon      │
│  (Stellar Testnet)      │              │    (Testnet)              │
│                         │              │                          │
│  Reputation Contract    │              │  Transaction verification │
│  Registry Contract      │              │  Balance lookups          │
│  Session Policy Contract│              │  Friendbot funding        │
└────────────────────────┘              └─────────────────────────┘
             │
             ▼
┌────────────────────────┐
│  Supabase PostgreSQL   │
│  (EU West 1)           │
│                        │
│  agents · services     │
│  sessions · payments   │
│  ratings · workflows   │
└────────────────────────┘

Payment Flow: Session Keys + On-Chain Authorization
This is the core security model. Every payment goes through three mandatory gates before any USDC moves:

Agent requests payment
        │
        ▼
┌──────────────────────────┐
│  Gate 1: Session Check   │  Database validates session token,
│  (API Layer)             │  expiry, budget, endpoint whitelist
└──────────┬───────────────┘
           │ Pass
           ▼
┌──────────────────────────┐
│  Gate 2: Soroban Auth    │  Smart contract reads on-chain budget,
│  (Blockchain Layer)      │  validates spend, WRITES updated spent
│                          │  amount to blockchain. Returns Soroban
│                          │  tx hash as cryptographic proof.
└──────────┬───────────────┘
           │ Pass + sorobanAuthHash
           ▼
┌──────────────────────────┐
│  Gate 3: Stellar Payment │  MPP transaction built and signed.
│  (Blockchain Layer)      │  90% to service, 10% protocol fee.
│                          │  Soroban auth hash in memo field.
└──────────┬───────────────┘
           │ Submitted to Stellar
           ▼
     Payment confirmed
     on-chain (Horizon)

Without a valid Session Key → 403 Forbidden. Without Soroban on-chain authorization → payment is never built. There is no bypass.

x402 Protocol Implementation
The x402 protocol turns HTTP 402 "Payment Required" into a machine-readable payment challenge:

Agent ──── GET /api/services/paid/summarize ────► Backend
                                                    │
                                                    │ 402 Payment Required
                                                    │ { x402Version: 1,
                                                    │   accepts: [{
                                                    │     scheme: "exact",
                                                    │     network: "stellar-testnet",
                                                    │     maxAmountRequired: "0.10",
                                                    │     payTo: "G...",
                                                    │     asset: "USDC:G...",
                                                    │     extra: {
                                                    │       mppEnabled: true,
                                                    │       protocolFeeAddress: "G...",
                                                    │       protocolFeeFraction: 0.10
                                                    │     }
                                                    │   }]
                                                    │ }
                                                    ◄──────────────────────────
Agent signs Stellar transaction (0.10 USDC, MPP split)
Agent ──── POST /api/services/paid/summarize ───► Backend
           Header: X-PAYMENT: <tx_hash>
                                                    │ Verify payment on Horizon
                                                    │ Record payment in DB
                                                    │ Update reputation on-chain
                                                    │
                                                    ◄── 200 { summary, paymentId }

MPP Split Payments
Every payment is atomically split in a single Stellar transaction using multi-operation support:

┌────────────────────────────────────────────────────────┐
│              Single Stellar Transaction                 │
│                                                        │
│   Operation 1: Payment                                 │
│   ├─ To:     Service Owner Address                     │
│   ├─ Amount: 90% of total                              │
│   └─ Asset:  USDC                                      │
│                                                        │
│   Operation 2: Payment                                 │
│   ├─ To:     Protocol Fee Address                      │
│   ├─ Amount: 10% of total                              │
│   └─ Asset:  USDC                                      │
│                                                        │
│   Memo: Soroban auth tx hash (on-chain proof)          │
│                                                        │
│   Either both succeed or the entire tx is rejected.    │
└────────────────────────────────────────────────────────┘

Session-Based Access Control
Agents operate under scoped sessions with spend caps, time limits, and endpoint whitelists. Session budgets are tracked both in the database and on the Soroban smart contract.

POST /api/sessions
  │
  ├─ Creates session in PostgreSQL (maxSpend, duration, endpoints)
  └─ Writes session policy to Soroban contract on-chain
       ├─ sessionKey       → maxSpendUsdc (on-chain budget cap)
       └─ sessionKey+offset → spentUsdc = 0 (on-chain spend tracker)
Each payment:
  1. API checks DB session (expiry, budget, endpoint)
  2. sorobanAuthorizeSpend() reads on-chain budget
  3. Validates: onChainSpent + amount <= onChainMaxSpend
  4. Writes updated spent amount TO blockchain
  5. Returns Soroban tx hash as authorization proof
  6. Only THEN is the Stellar payment built

Session object:

{
  "sessionToken": "stf_6e2eb54e6dfa816dd95e75ed1035932e2e79c979e6bc0e7c",
  "maxSpendUsdc": 5.00,
  "spentUsdc": 0.00,
  "allowedEndpoints": ["/api/services/paid/summarize", "/api/services/sentiment"],
  "expiresAt": "2026-04-13T15:00:00Z",
  "status": "active"
}

Soroban Smart Contracts
Three contracts deployed on Stellar Testnet enforce the on-chain trust layer. They are written in WAT (WebAssembly Text) and use Soroban host functions for contract data storage.

Contract	Contract ID	Purpose
Reputation	CAXV62IIEHBEPRNKZXYNEITMENNSX6U5Y7VT36N4XLI63ZNPCC73CRQ6	Agent and service reputation scoring
Registry	CDG7G7MBLWLG3FD3YPMVGCFWB4HCF7PWSX2VIOHIAUVBJ23QQAMSPPHA	Service provider on-chain directory
Session Policy	CAKSBWFSRPCBN6XHV5PUOVHU5234CHOGZNXKLXBOAUW4RZCIL45RU2F7	Budget caps, spend authorization, revocation
Session Policy Contract — The Payment Gatekeeper
This is the critical contract that makes session enforcement on-chain:

set_policy(key, maxSpendCents) — registers a session with its budget cap on-chain
get_policy(key) — reads the current budget or spent amount from chain
has_policy(key) — checks if a session exists on-chain
clear_policy(key) — revokes a session by removing it from on-chain storage
The sorobanAuthorizeSpend() function in the API reads the on-chain budget, validates the spend, and writes the updated spent amount back to the contract — all as Soroban transactions with verifiable tx hashes.

Reputation Contract
set_reputation(key, score) — set an agent's on-chain reputation
bump_reputation(key, amount) — increment reputation after successful payment
get_reputation(key) — read an agent's on-chain score
has_reputation(key) — check if an agent has an on-chain record
Registry Contract
register(key, stakeVal) — register an agent/service on-chain
is_registered(key) — check if an entity is registered on-chain
Soroban Host Functions Used
l."_" = put_contract_data(key, val, storage_type)  → Write
l."1" = get_contract_data(key, storage_type)        → Read
l."0" = has_contract_data(key, storage_type)         → Check
l."2" = del_contract_data(key, storage_type)         → Delete

All contract writes require the ADMIN_SECRET key to sign transactions. External callers cannot write to the contracts without this key.

Service Marketplace
Six x402-protected services are available for agents to discover and pay for:

Service	Endpoint	Price	Data Source
Market Data Feed	/api/services/market/data	0.05 USDC	CoinGecko + Horizon DEX
Web Scraper Pro	/api/services/scraper	0.10 USDC	Live HTML fetch
Soroban Code Auditor	/api/services/audit	0.25 USDC	Rust pattern analysis
Stellar Pathfinder	/api/services/pathfinder	0.05 USDC	Horizon path API
Sentiment Oracle	/api/services/sentiment	0.05 USDC	Keyword scoring
AI Summarizer	/api/services/paid/summarize	0.10 USDC	Text summarization
Each service returns a 402 on GET with the x402 payment spec, and returns data on POST with a valid X-PAYMENT header containing a verified Stellar tx hash.

MCP Server (Model Context Protocol)
The MCP server exposes Trust Fabric as a toolbox for any MCP-compatible AI client (Claude, Cursor, etc.):

GET  /api/mcp   → Server metadata and available tools
POST /api/mcp   → JSON-RPC 2.0 tool invocation

10 tools exposed:

Tool	Description
summarize_text	Pay-per-use AI text summarizer (0.10 USDC, auto-pay via session)
list_services	Browse the x402 service marketplace
list_proxies	Browse published API proxies
list_workflows	List available automation workflows
execute_workflow	Run a multi-step agent workflow by ID
register_agent	Onboard a new agent with a Stellar address
get_agent_reputation	Query on-chain reputation score and stats
create_session	Provision a scoped session key with spend caps
verify_payment	Verify a Stellar tx hash on Horizon
create_account	Generate and fund a new Stellar testnet account (10 USDC + XLM)
When STELLAR_SECRET is provided in the Authorization: Bearer header, the MCP server auto-pays for services using the agent's session budget. Payment requires an active session with sufficient on-chain budget — the same three-gate security model applies.

Workflow Engine
Orchestrate multi-step agent tasks combining HTTP calls, Stellar payments, and on-chain contract interactions:

Step types:

Type	What It Does
http	REST API call (GET/POST) to external or internal services
payment	Stellar USDC payment (amount, recipient, memo)
onchain	Soroban contract invocation (contract ID, method, args)
Steps can reference outputs from previous steps using {{variable}} interpolation (e.g., {{step1.data.price}}). All executions are logged with status, duration, and full input/output context.

Pay Links
Shareable URLs that pre-fill a Stellar payment intent:

/pay?to=GDUQ244U...&amount=1.00&asset=USDC&memo=invoice-42

The frontend renders a QR code and deep-link buttons compatible with Stellar wallets (Lobstr, Solar, etc.).

Reputation System
Agents accumulate reputation scores on a 0-100 scale, written to the Soroban reputation contract after each interaction:

record_payment — bumps reputation proportional to payment size (log-weighted)
submit_rating — adjusts reputation based on star rating (1-5 stars, neutral at 3)
Ratings require a linked payment hash, preventing fake reviews
The leaderboard on the Agents page is sorted by weighted reputation and volume
API Reference
Agents
Method	Endpoint	Description
GET	/api/agents	List agents sorted by reputation
POST	/api/agents	Register a new agent (name + Stellar public key)
GET	/api/agents/:id	Agent detail with reputation history
GET	/api/agents/stats/summary	Dashboard metrics
GET	/api/agents/:id/activity	Recent payments and ratings
Sessions
Method	Endpoint	Description
GET	/api/sessions	List all sessions
POST	/api/sessions	Create session (agentId, maxSpend, duration, endpoints)
POST	/api/sessions/:id/revoke	Revoke session (clears on-chain policy)
Services & Marketplace
Method	Endpoint	Description
GET	/api/services	Browse service marketplace
POST	/api/services	Register a new service
GET	/api/services/categories/counts	Category breakdown
POST	/api/services/paid/summarize	x402-protected AI summarizer
Payments & Ratings
Method	Endpoint	Description
GET	/api/payments	Payment ledger
GET	/api/payments/stats/volume	Volume analytics
POST	/api/ratings	Submit post-transaction rating (updates on-chain reputation)
Stellar & Soroban
Method	Endpoint	Description
GET	/api/stellar/network	Network info, asset, fee config
POST	/api/stellar/account/create	Create and fund testnet account (Friendbot + USDC)
POST	/api/stellar/payment/build	Build MPP transaction (requires session + Soroban auth)
POST	/api/stellar/payment/submit	Submit signed XDR to Stellar
GET	/api/stellar/payment/verify/:txHash	Verify payment on Horizon
GET	/api/stellar/soroban	Contract deployment status
API Proxies
Method	Endpoint	Description
GET	/api/proxies	List published API proxies
POST	/api/proxies	Publish a new x402-gated proxy
POST	/api/proxies/:id/call	Call proxy (payment in Authorization header)
Workflows
Method	Endpoint	Description
GET	/api/workflows	List workflows
POST	/api/workflows	Create workflow
POST	/api/workflows/:id/execute	Execute workflow
MCP & Demo
Method	Endpoint	Description
GET	/api/mcp	MCP server info
POST	/api/mcp	JSON-RPC 2.0 tool invocation
POST	/api/demo/run	Run full demo cycle (discovery → session → Soroban auth → payment → service → rating)
Tech Stack
Layer	Technology
Smart Contracts	WAT (WebAssembly Text) on Soroban (Stellar)
Backend	Node.js 24 + Express 5 + TypeScript 5.9
Payment Protocol	x402 (HTTP 402 Payment Required)
Stellar SDK	@stellar/stellar-sdk (Horizon + Soroban RPC)
Database	Supabase PostgreSQL + Drizzle ORM
Frontend	React 18 + Vite + TailwindCSS + React Query
UI Components	shadcn/ui + Recharts
API Contract	OpenAPI 3.1 → Zod v4 → React Query (codegen via Orval)
AI Protocol	Model Context Protocol (MCP)
Package Manager	pnpm workspaces (monorepo)
Network	Stellar Testnet (Friendbot-funded accounts)
Monorepo Structure
stellar-agent-trust-fabric/
│
├── artifacts/
│   ├── api-server/              # Express 5 backend
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── agents.ts        # Agent CRUD + reputation
│   │       │   ├── services.ts      # Marketplace + x402 endpoints
│   │       │   ├── sessions.ts      # Session lifecycle + on-chain policy
│   │       │   ├── payments.ts      # Payment ledger
│   │       │   ├── stellar.ts       # Account creation, payment build/submit/verify
│   │       │   ├── mcp.ts           # MCP server (10 tools)
│   │       │   ├── demo.ts          # Interactive demo with full cycle
│   │       │   ├── workflows.ts     # Workflow engine
│   │       │   ├── proxies.ts       # API proxy marketplace
│   │       │   └── pay.ts           # Pay links
│   │       └── lib/
│   │           ├── x402Middleware.ts   # 402 challenge + Horizon verification
│   │           ├── stellarPayments.ts  # MPP split, tx builder, Friendbot
│   │           └── soroban.ts         # Contract invocations + sorobanAuthorizeSpend
│   │
│   └── trust-fabric/            # React + Vite frontend
│       └── src/pages/
│           ├── dashboard/       # Network stats overview
│           ├── agents/          # Reputation leaderboard
│           ├── sessions/        # Session manager with Soroban status
│           ├── payments/        # Payment ledger with Stellar explorer links
│           ├── services/        # Service marketplace
│           ├── explore/         # API browser
│           ├── demo/            # Interactive demo lab
│           ├── stellar/         # Stellar Lab (account, payment, session key manager)
│           ├── mcp/             # MCP server configuration
│           ├── pay/             # Pay link generator
│           ├── workflows/       # Workflow builder
│           └── rate/            # Post-transaction rating
│
├── contracts/                   # Soroban contracts (WAT source)
│   ├── reputation/              # On-chain scoring
│   ├── registry/                # Service directory
│   └── session-policy/          # Spend enforcement + authorization
│
└── lib/
    ├── api-spec/                # OpenAPI 3.1 (single source of truth)
    ├── api-zod/                 # Zod schemas (generated)
    ├── api-client-react/        # React Query hooks (generated)
    └── db/                      # Drizzle ORM schema
        └── src/schema/
            ├── agents.ts
            ├── services.ts
            ├── sessions.ts
            ├── payments.ts
            ├── ratings.ts
            └── workflows.ts

Quick Start
Prerequisites
Node.js 20+
pnpm 9+
PostgreSQL (or Supabase account)
A Stellar testnet keypair (Stellar Laboratory)
Environment Variables
Copy .env.example to .env and configure:

Variable	Required	Description
SUPABASE_DATABASE_URL	Yes	PostgreSQL connection string
SESSION_SECRET	Yes	Random string for cookie signing (min 32 chars)
DEMO_AGENT_SECRET	Yes	Stellar secret key for the demo agent wallet
STELLAR_FAUCET_SECRET	Yes	Secret key of the USDC issuer/faucet account
SOROBAN_ADMIN_SECRET	Yes	Admin keypair for Soroban contract invocations
STELLAR_VERIFY_ONCHAIN	No	"true" to verify payments on Horizon
Run
pnpm install
# Push database schema
pnpm --filter @workspace/db run push
# Start API server
pnpm --filter @workspace/api-server run dev
# Start frontend
pnpm --filter @workspace/trust-fabric run dev

Test an x402 Payment
# 1. Get the 402 challenge
curl http://localhost:8080/api/services/paid/summarize
# 2. Create a session, build a payment, submit it
# Or use the Demo Lab in the frontend for the full interactive cycle

Future Vision
On-chain payment routing: Soroban contract directly calls USDC SAC (Stellar Asset Contract) to enforce payment atomically with session authorization in a single contract invocation
Cross-agent trust delegation: High-reputation agents vouch for new agents (social trust graph)
Privacy-preserving reputation: Zero-knowledge proofs to prove reputation thresholds without revealing exact scores
Agent-to-agent micropayments: Agents paying other agents for sub-tasks (recursive x402)
Mainnet deployment: Production-ready with audited contracts and real USDC settlement
License
MIT
