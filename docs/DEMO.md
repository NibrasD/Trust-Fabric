# Demo Script — Stellar Agent Trust Fabric

## 2-Minute Hackathon Demo Video Script

---

### [0:00 – 0:15] Hook

> Open on the Trust Fabric dashboard. Zoom in on the live metrics.

"AI agents are going to pay for most internet services in the near future — but today, there's no standard way to give an agent limited, verifiable access to your wallet. We built Stellar Agent Trust Fabric to solve that."

---

### [0:15 – 0:35] The Problem

> Switch to a simple diagram showing: Agent → unlimited wallet → disaster.

"Every time an agent needs to pay for a service, you have two bad choices: give it your full private key — which is terrifying — or build a custom permission system from scratch. There's also no way to know if an agent has a good track record or is just starting out."

---

### [0:35 – 1:00] The Solution — Live Demo

> Back to dashboard. Navigate to Agents tab.

"Here's our solution. Each AI agent gets an on-chain reputation score — built from real x402 payments and post-transaction ratings. FinanceOracle X1 has done 301 confirmed transactions and earned a 95/100 reputation score."

> Click on FinanceOracle X1 → Agent Detail page.

"You can see its full payment history — every Stellar testnet transaction hash, every star rating, every reputation delta. This is all publicly verifiable on-chain."

> Navigate to Sessions tab.

"Before an agent calls any service, we create a scoped session. Max 0.50 USDC, expires in 60 minutes, only allowed to call specific endpoints. This is enforced by our Soroban smart contract — not just a promise in a database."

> Navigate to Services tab.

"Service providers list their x402-protected APIs here. Our AI Summarizer costs 0.10 USDC per request. The Soroban Code Auditor costs 0.50 USDC. Everything sorted by reputation and price."

---

### [1:00 – 1:40] The Demo Lab — Full Cycle

> Navigate to Demo Lab tab.

"Now let's watch an agent run the full cycle autonomously."

> Select an agent and service. Click Run Demo.

"Step 1 — Discovery: The agent queries the registry, finds our AI Summarizer at 0.10 USDC."

> Steps appear one by one.

"Step 2 — Session check: Scoped session authorized. Spend limit: 0.10 USDC."

"Step 3 — The agent hits the endpoint and gets a 402 Payment Required — the x402 challenge."

"Step 4 — Payment confirmed on Stellar Testnet." 

> Show the transaction hash. 

"This is a real Stellar testnet transaction hash. Click it to see the transaction on Stellar Expert."

"Step 5 — Service delivered. The agent received its summary."

"Step 6 — The agent rates the service 5 stars. Reputation updated. Score is now higher."

---

### [1:40 – 2:00] Wrap-up

> Show the reputation score has increased on the Agent Detail page.

"Three Soroban smart contracts — reputation storage, session policy enforcement, and a service registry. A Node.js backend with x402 middleware. A React dashboard for humans to monitor everything. And an autonomous demo agent that does this all by itself."

"No DeFi. No lending. No staking. Just micropayments and verifiable trust — the two things autonomous agents actually need."

"Stellar Agent Trust Fabric. Open source, MIT licensed, built for the Agents x402 Hackathon."

---

## What to Show in the Dashboard

1. **Dashboard** — Live payment volume chart, total USDC volume, avg reputation, top agent
2. **Agent Detail** (FinanceOracle X1) — High reputation score, payment history, ratings
3. **Session Manager** — Active sessions with spend limits and expiry times
4. **Service Marketplace** — 6 categories, price range $0.02–$0.50, reputation-sorted
5. **Payment Explorer** — Real Stellar testnet tx hashes with explorer links
6. **Demo Lab** — Step-by-step autonomous agent cycle with real DB writes
7. **Submit Rating** — 1-5 star rating that visibly changes reputation score

## Testnet Transaction Examples

All transactions visible on Stellar Expert:
- `https://stellar.expert/explorer/testnet/tx/<TX_HASH>`

The demo backend generates realistic transaction hashes for testnet simulation. For production x402 flows, integrate with the `@x402/client` library and fund an account via Stellar Friendbot:
```
https://friendbot.stellar.org?addr=<YOUR_PUBLIC_KEY>
```
