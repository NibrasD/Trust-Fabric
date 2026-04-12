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
- **Payment Asset**: Native XLM by default (no trustline needed); set `USDC_ISSUER` for USDC
- **Friendbot**: `createAndFundTestnetAccount()` creates and funds real Stellar Testnet keypairs
- **Demo Agent**: `examples/demo-agent/agent.ts` shows full x402 cycle with `--real-payment` flag for real Stellar tx

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

Tables: `agents`, `services`, `sessions`, `payments`, `ratings`

Key relationships:
- `payments` references `agents` + `services` + `sessions`
- `ratings` references `agents` + `services` + `payments`
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

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Cookie signing secret
- `PORT` — Server port (auto-assigned by Replit)

See `.env.example` for full list including Stellar/Soroban configuration.

## User Preferences

- No emojis in UI
- Dense, information-rich dashboard with dark theme
- Stellar testnet transaction hashes as truncated monospace links
