/**
 * Stellar Agent Trust Fabric — Demo Agent
 *
 * A minimal autonomous agent that:
 * 1. Discovers services from the on-chain registry (via the backend API).
 * 2. Creates a scoped session with spend limits.
 * 3. Attempts to call a service → receives a 402 Payment Required.
 * 4. Pays via x402 on Stellar Testnet.
 * 5. Re-issues the request with a payment proof header.
 * 6. Rates the service (1-5 stars) to update its on-chain reputation.
 *
 * This agent simulates the full x402 flow using the Trust Fabric backend.
 * For production use, integrate with the official @x402/client library
 * and a real Stellar keypair funded on testnet via Friendbot.
 *
 * Usage:
 *   npx ts-node examples/demo-agent/agent.ts
 *
 * Environment variables:
 *   API_BASE_URL  — Trust Fabric backend (default: http://localhost:3000/api)
 *   AGENT_ID      — Agent ID from the Trust Fabric registry
 *   SERVICE_ID    — Service ID to call
 */

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000/api";
const AGENT_ID = process.env.AGENT_ID ?? "1";
const SERVICE_ID = process.env.SERVICE_ID ?? "1";

interface Step {
  step: string;
  status: "success" | "failed" | "skipped";
  message: string;
  data?: Record<string, unknown>;
}

interface DemoRunResult {
  steps: Step[];
  finalReputationScore: number;
  paymentId: string;
  ratingId: string;
  txHash: string;
  summary: string;
}

async function runAgent(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Stellar Agent Trust Fabric — Demo Agent v1.0");
  console.log("=".repeat(60));
  console.log(`API: ${API_BASE}`);
  console.log(`Agent ID: ${AGENT_ID} | Service ID: ${SERVICE_ID}`);
  console.log("");

  // ── Step 1: Check agent reputation ────────────────────────────────────────
  console.log("[1/5] Fetching agent reputation...");
  const agentRes = await fetch(`${API_BASE}/agents/${AGENT_ID}`);
  if (!agentRes.ok) {
    throw new Error(`Agent ${AGENT_ID} not found. Register it first via POST /api/agents`);
  }
  const agent = await agentRes.json() as {
    name: string;
    stellarAddress: string;
    reputationScore: number;
    totalTransactions: number;
  };
  console.log(`  Name: ${agent.name}`);
  console.log(`  Stellar: ${agent.stellarAddress}`);
  console.log(`  Reputation: ${agent.reputationScore}/100`);
  console.log(`  Transactions: ${agent.totalTransactions}`);
  console.log("");

  // ── Step 2: Discover services ──────────────────────────────────────────────
  console.log("[2/5] Discovering services in the registry...");
  const svcRes = await fetch(`${API_BASE}/services?limit=5`);
  const svcData = await svcRes.json() as { services: Array<{ id: string; name: string; priceUsdc: number; category: string }> };
  console.log(`  Found ${svcData.services.length} services`);
  for (const s of svcData.services) {
    console.log(`  · [${s.category}] ${s.name} — ${s.priceUsdc} USDC`);
  }
  console.log("");

  // ── Step 3: Create a scoped session ───────────────────────────────────────
  console.log("[3/5] Creating scoped session...");
  const sessionRes = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: AGENT_ID,
      maxSpendUsdc: 0.5,
      durationMinutes: 60,
      allowedEndpoints: [`/api/services/paid/summarize`],
    }),
  });
  const session = await sessionRes.json() as { id: string; sessionToken: string; maxSpendUsdc: number; expiresAt: string };
  console.log(`  Session ID: ${session.id}`);
  console.log(`  Token: ${session.sessionToken.slice(0, 20)}...`);
  console.log(`  Max spend: ${session.maxSpendUsdc} USDC`);
  console.log(`  Expires: ${session.expiresAt}`);
  console.log("");

  // ── Step 4: Run full x402 payment cycle via backend demo endpoint ──────────
  console.log("[4/5] Executing x402 payment cycle...");
  console.log("  (Discovery → 402 challenge → payment → service access → rating)");
  const demoRes = await fetch(`${API_BASE}/demo/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: AGENT_ID,
      serviceId: SERVICE_ID,
      textToSummarize:
        "The Stellar Agent Trust Fabric is an open-source trust layer for autonomous AI agents operating on the Stellar blockchain. It provides scoped session permissions, on-chain reputation scoring, and an x402 micropayment marketplace — enabling agents to discover, pay for, and rate services in a trustless, permissionless environment without requiring DeFi, lending, or yield mechanisms.",
    }),
  });
  const result = await demoRes.json() as DemoRunResult;
  console.log("");

  for (const step of result.steps) {
    const icon = step.status === "success" ? "✓" : step.status === "failed" ? "✗" : "−";
    console.log(`  ${icon} ${step.step}: ${step.message}`);
    if (step.data) {
      for (const [k, v] of Object.entries(step.data)) {
        console.log(`      ${k}: ${v}`);
      }
    }
  }

  console.log("");
  console.log("[5/5] Results:");
  console.log(`  Transaction hash: ${result.txHash}`);
  console.log(
    `  Explorer: https://stellar.expert/explorer/testnet/tx/${result.txHash}`
  );
  console.log(`  Payment ID: ${result.paymentId}`);
  console.log(`  Rating ID: ${result.ratingId}`);
  console.log(`  Final reputation score: ${result.finalReputationScore}/100`);
  console.log("");
  console.log("=".repeat(60));
  console.log("Summary:", result.summary);
  console.log("=".repeat(60));
}

runAgent().catch((err) => {
  console.error("Agent error:", err.message);
  process.exit(1);
});
