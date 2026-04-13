# Stellar Agent Trust Fabric

## Overview

A trust and permission layer for autonomous AI agents on Stellar. Built for the Stellar Agents x402 Hackathon.

Enables AI agents to:
- Discover and pay for services using real x402 micropayments (HTTP 402 Payment Required, verified on Horizon)
- Operate with scoped, time-limited, spend-capped permissions via Soroban smart contracts
- Build and maintain an on-chain reputation score based on payment history and star ratings
- Execute MPP-style split payments (90% service + 10% protocol fee) via native Stellar SDK

## Real Stellar Integration

- **x402 Middleware**: Custom `x402Middleware.ts` implements the full x402 HTTP payment standard for Stellar
- **MPP Payments**: `buildMppPaymentTransaction()` creates atomic multi-operation transactions splitting payments
- **Horizon Verification**: `verifyPayment()` checks Stellar Testnet via Horizon API (enabled via `STELLAR_VERIFY_ONCHAIN=true`)
- **Payment Asset**: USDC (issuer `GBB6YO4V5K37CXZV4N3ZG4X7NQBCOSSFFQ566CAWSXGMCDIG63GH7UCZ`) — all 6 service accounts + demo agent have 100+ USDC funded; set via `USDC_ISSUER` env var
- **Friendbot**: `createAndFundTestnetAccount()` creates and funds real Stellar Testnet keypairs
- **Demo Agent**: `examples/demo-agent/agent.ts` shows full x402 cycle with `--real-payment` flag for real Stellar tx; uses correct USDC issuer
- **Soroban Integration**: `soroban.ts` uses `Operation.invokeContractFunction` + `rpc.assembleTransaction` to invoke WAT-compiled contracts; always enabled with hardcoded defaults
- **Soroban Status API**: `GET /api/stellar/soroban` returns contract deployment status (shown on Dashboard)
- **Deployed Contracts (Stellar Testnet, April 2026)**:
  - Reputation: `CAXV62IIEHBEPRNKZXYNEITMENNSX6U5Y7VT36N4XLI63ZNPCC73CRQ6`
  - Registry: `CDG7G7MBLWLG3FD3YPMVGCFWB4HCF7PWSX2VIOHIAUVBJ23QQAMSPPHA`
  - Session Policy: `CAKSBWFSRPCBN6XHV5PUOVHU5234CHOGZNXKLXBOAUW4RZCIL45RU2F7`
- **WAT Contract Findings**: Soroban host function mapping (interface v90194313216 / protocol 21 style on protocol 25):
  - `l."0"` = has_contract_data(key, storage_type) → Bool
  - `l."1"` = get_contract_data(key, storage_type) → Val
  - `l."2"` = del_contract_data(key, storage_type) → Void
  - `l."_"` = put_contract_data(key, val, storage_type) → Void
  - Valid storage_type: Void(1)=Temporary, False(0)=Instance — both confirmed working via simulation + execution

## Funded Testnet Accounts

- **Demo Agent**: `GDUQ244UFWD3DK3VEH665Y3ISELZBN6WMNHMA35QZ64K5LQWIDDMNZQB` — 500 USDC + XLM
- **Protocol Fee**: `GAUFDDTXBUK3SGKGZQVAXPJDAF3FTUAN325DEKIEUXEGFBMGMWQI5O75` — 100 USDC
- All 6 service accounts funded with XLM + 100 USDC trustlines via custom issuer
- **USDC Issuer**: `GBB6YO4V5K37CXZV4N3ZG4X7NQBCOSSFFQ566CAWSXGMCDIG63GH7UCZ` (controlled; Circle testnet USDC requires fiat onramp)

## Project Structure

```
contracts/              # Soroban Rust smart contracts
  reputation/           # On-chain reputation storage and scoring
  session-policy/       # Scoped authorization enforcement (spend caps, time limits)
  registry/             # Service provider on-chain registry
artifacts/
  api-server/           # Node.js + Express 5 backend API
  trust-fabric/         # React + Vite frontend dashboard
lib/
  db/                   # PostgreSQL schema (Drizzle ORM)
  api-spec/             # OpenAPI 3.1 contract (single source of truth)
  api-zod/              # Generated Zod validation schemas
  api-client-react/     # Generated React Query hooks
examples/
  demo-agent/           # Autonomous demo agent (TypeScript)
docs/
  README.md             # Full hackathon submission README
  ARCHITECTURE.md       # Technical architecture deep-dive
  DEMO.md               # 2-minute video demo script
.env.example            # Environment variable template
```

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (zod/v4), drizzle-zod
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Smart Contracts**: Rust + Soroban SDK 22.x
- **Frontend**: React + Vite + TailwindCSS + React Query

## Database Schema

Tables: `agents`, `services`, `sessions`, `payments`, `ratings`, `proxies`, `workflows`, `workflow_executions`

Key relationships:
- `payments` references `agents` + `services` + `sessions`
- `ratings` references `agents` + `services` + `payments`
- `workflow_executions` references `workflows`
- Reputation is computed from payments and ratings

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/trust-fabric run dev` — run frontend locally

## API Routes

- `GET /api/agents` — list agents sorted by reputation
- `POST /api/agents` — register agent
- `GET /api/agents/:id` — agent detail
- `GET /api/agents/stats/summary` — dashboard metrics
- `GET /api/agents/:id/activity` — recent payments + ratings
- `GET /api/sessions` — list sessions
- `POST /api/sessions` — create scoped session
- `POST /api/sessions/:id/revoke` — revoke session
- `GET /api/services` — service marketplace
- `POST /api/services` — register service
- `GET /api/services/categories/counts` — category breakdown
- `POST /api/services/paid/summarize` — x402 protected endpoint
- `GET /api/payments` — payment ledger
- `GET /api/payments/stats/volume` — volume analytics
- `POST /api/ratings` — submit post-transaction rating
- `POST /api/demo/run` — simulate full agent cycle
- `GET /api/proxies` — list all published API proxies
- `POST /api/proxies` — publish a new API proxy
- `GET /api/proxies/:id` — proxy detail
- `PUT /api/proxies/:id` — update proxy
- `DELETE /api/proxies/:id` — delete proxy
- `POST /api/proxies/:id/call` — x402-gated proxy call (pass payment in Authorization header)
- `GET /api/workflows` — list workflows
- `POST /api/workflows` — create workflow
- `GET /api/workflows/:id` — workflow detail
- `POST /api/workflows/:id/execute` — run workflow (HTTP/payment/onchain steps)
- `GET /api/mcp` — MCP server info (name, version, 10 tools)
- `POST /api/mcp` — JSON-RPC 2.0 MCP endpoint (10 tools, auto-pay via Authorization: Bearer <stellar_secret>)

## Database

The app uses **Supabase** (not Replit's built-in PostgreSQL) as its database.

- Project: `bodmjihhibzzokuvemsf.supabase.co` (EU West 1 region)
- Connection: Session pooler at `aws-0-eu-west-1.pooler.supabase.com:5432`
- The `lib/db/src/index.ts` prefers `SUPABASE_DATABASE_URL` over `DATABASE_URL`
- The `sslmode=require` is stripped from the URL and `ssl: { rejectUnauthorized: false }` is passed as an object to avoid self-signed cert errors with pg@8
- Drizzle push: `pnpm --filter @workspace/db run push` (sets `NODE_TLS_REJECT_UNAUTHORIZED=0` for push only)

## Environment Variables

- `SUPABASE_DATABASE_URL` — Supabase session pooler connection string (preferred, set as shared env var)
- `DATABASE_URL` — Replit-managed PostgreSQL (fallback, not used when SUPABASE_DATABASE_URL is set)
- `SUPABASE_DB_PASSWORD` — Supabase database password (Replit secret)
- `SESSION_SECRET` — Cookie signing secret
- `PORT` — Server port (auto-assigned by Replit)
- `USDC_ISSUER` — USDC asset issuer (`GBB6YO4V5K37CXZV4N3ZG4X7NQBCOSSFFQ566CAWSXGMCDIG63GH7UCZ`) — **set and active**
- `PROTOCOL_FEE_ADDRESS` — Protocol fee receiver (`GAUFDDTXBUK3...`) — **set and active**
- `SOROBAN_REPUTATION_CONTRACT_ID` — Reputation contract (set once deployed from `contracts/`)
- `SOROBAN_REGISTRY_CONTRACT_ID` — Registry contract (set once deployed)
- `SOROBAN_SESSION_CONTRACT_ID` — Session policy contract (set once deployed)
- `SOROBAN_ADMIN_SECRET` — Admin signing key for Soroban invocations

See `contracts/DEPLOY.md` for Soroban deployment instructions.

## User Preferences

- No emojis in UI
- Dense, information-rich dashboard with dark theme
- Stellar testnet transaction hashes as truncated monospace links
