# Architecture — Stellar Agent Trust Fabric

## Overview

The system is organized as a pnpm monorepo with four main layers:

```
stellar-agent-trust-fabric/
├── contracts/              # Soroban Rust smart contracts
│   ├── reputation/         # On-chain reputation storage
│   ├── session-policy/     # Scoped authorization enforcement
│   └── registry/           # Service provider registry
├── artifacts/
│   ├── api-server/         # Node.js Express backend
│   └── trust-fabric/       # React + Vite frontend dashboard
├── lib/
│   ├── db/                 # PostgreSQL schema (Drizzle ORM)
│   ├── api-spec/           # OpenAPI 3.1 contract
│   ├── api-zod/            # Generated Zod validation schemas
│   └── api-client-react/   # Generated React Query hooks
├── examples/
│   └── demo-agent/         # Autonomous demo agent
└── docs/
```

## Contract Architecture

### Reputation Contract

**Storage layout:**
```
ADMIN          → Address
(REP, address) → ReputationProfile {
  score: i64              // 0–10000 (= 0.00–100.00)
  total_transactions: u32
  total_stars_scaled: i64 // sum of (stars × 100)
  rating_count: u32
  total_paid_stroops: i64
}
```

**Reputation formula:**
```
payment_weight = bit_length(amount_stroops / 100_000)
score += payment_weight  // on each payment

rating_weight  = bit_length(amount_stroops / 100_000)
star_factor    = (stars - 3) × 25  // –50 to +50 per weight unit
score += rating_weight × star_factor / 100
score = clamp(score, 0, 10000)
```

**Key invariants:**
- Only admin can call `record_payment` and `submit_rating` (backend is the facilitator)
- Score is monotonically bounded between 0 and 10,000
- Every mutation emits an event for off-chain indexing

### Session Policy Contract

**Storage layout:**
```
ADMIN                  → Address
(SESSION, session_id)  → SessionPolicy {
  agent: Address
  max_spend_stroops: i64
  spent_stroops: i64
  expires_at: u64  // ledger timestamp
  status: Active | Expired | Revoked
}
```

**Authorization flow:**
1. Backend creates a session with a unique 32-byte ID.
2. Agent includes the session ID in payment requests.
3. Before processing a payment, backend calls `authorize_spend(session_id, amount)`.
4. Contract checks: active status, not expired, spend + amount ≤ max_spend.
5. On success: increments `spent_stroops`, emits event.
6. On failure: panics → transaction aborts.

### Registry Contract

**Storage layout:**
```
ADMIN          → Address
SVCLIST        → Vec<Bytes>  // ordered list of IDs
(SVC, id)      → ServiceListing {
  id, name, category, endpoint_hash, price_stroops, owner, is_active
}
```

## API Architecture

The backend is an Express 5 + TypeScript server following contract-first OpenAPI design.

**Request lifecycle:**
```
HTTP Request
    │
    ▼
Express Router (/api/*)
    │
    ├── Zod validation (request params/body via @workspace/api-zod)
    │
    ├── Business logic (db queries, reputation computation)
    │
    ├── Zod validation (response via @workspace/api-zod)
    │
    └── JSON response
```

**Route modules:**
- `routes/agents.ts` — CRUD + stats for agent profiles
- `routes/services.ts` — Service registry + x402 protected endpoint
- `routes/sessions.ts` — Scoped session lifecycle
- `routes/payments.ts` — Payment ledger + volume analytics
- `routes/ratings.ts` — Post-transaction star ratings + reputation updates
- `routes/demo.ts` — Full autonomous agent simulation cycle

## Frontend Architecture

React + Vite SPA with React Query for server state management. All API calls go through generated Orval hooks from `@workspace/api-client-react`.

**Page structure:**
- `/` — Dashboard (summary stats, payment volume chart, category breakdown)
- `/agents` — Agent explorer (searchable, sortable by reputation)
- `/agents/:id` — Agent detail (reputation timeline, activity feed)
- `/agents/new` — Register new agent
- `/sessions` — Session manager (filter by status)
- `/sessions/new` — Create scoped session
- `/services` — Service marketplace (filter by category/price)
- `/services/new` — Register service
- `/payments` — Payment explorer (Stellar tx hash links)
- `/demo` — Interactive demo lab
- `/rate` — Submit rating

## x402 Payment Flow

```
1. Agent → GET /api/services/paid/summarize
2. Server → 402 { x402Version, accepts: [{ payTo, amount, network }] }
3. Agent → sign Stellar transaction (USDC transfer to payTo)
4. Agent → POST /api/services/paid/summarize { agentId, text }
           (In production: with X-PAYMENT header containing signed tx)
5. Server → verify tx on Stellar RPC
6. Server → record_payment() on Reputation contract
7. Server → 200 { summary, paymentId }
8. Agent → POST /api/ratings { agentId, serviceId, paymentId, stars }
9. Server → submit_rating() on Reputation contract
10. Server → 201 { rating, reputationDelta }
```

## Security Considerations

- **Session isolation**: Each session has a unique token; spend cap prevents runaway charges.
- **Admin-only mutations**: Reputation contract only accepts mutations from the backend admin key.
- **No self-rating**: Ratings can only be submitted after a confirmed payment with a valid paymentId.
- **Time-bound sessions**: Sessions auto-expire at the ledger timestamp; expired sessions cannot authorize new spends.
- **Input validation**: All API inputs are validated against Zod schemas derived from the OpenAPI spec.
- **No private keys in frontend**: The frontend never handles Stellar keys; all signing happens in agent code or a backend facilitator.
