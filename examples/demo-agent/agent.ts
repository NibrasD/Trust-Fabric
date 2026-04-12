/**
 * Stellar Agent Trust Fabric — Real x402 Demo Agent
 *
 * This agent demonstrates the full end-to-end x402 payment flow on Stellar Testnet:
 *
 * 1. Creates a real Stellar keypair and funds it via Friendbot.
 * 2. Adds a USDC trustline (required to receive USDC).
 * 3. Checks reputation in the Trust Fabric registry.
 * 4. Discovers services from the on-chain registry.
 * 5. Creates a scoped session with spend limits.
 * 6. Calls a paid endpoint → receives HTTP 402 Payment Required.
 * 7. Reads the x402 payment spec from the 402 response.
 * 8. Builds an MPP-style Stellar transaction (90% service, 10% protocol fee).
 * 9. Submits the transaction to Stellar Testnet via Horizon.
 * 10. Re-issues the request with the tx hash as X-PAYMENT header.
 * 11. Rates the service to update on-chain reputation.
 *
 * Usage:
 *   npx ts-node examples/demo-agent/agent.ts [--real-payment]
 *
 * Environment variables:
 *   API_BASE_URL         — Trust Fabric backend (default: http://localhost:3000/api)
 *   AGENT_ID             — Agent ID from the Trust Fabric registry
 *   AGENT_SECRET_KEY     — Stellar secret key (generated if not provided)
 *   SERVICE_ID           — Service ID to call
 *   USE_REAL_PAYMENT     — "true" to submit actual Stellar transactions
 */

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000/api";
const AGENT_ID = process.env.AGENT_ID ?? "1";
const SERVICE_ID = process.env.SERVICE_ID ?? "1";
const USE_REAL_PAYMENT =
  process.env.USE_REAL_PAYMENT === "true" || process.argv.includes("--real-payment");

// ── Stellar SDK (tree-shakeable named imports) ────────────────────────────────

import {
  Keypair,
  Asset,
  TransactionBuilder,
  Operation,
  Memo,
  BASE_FEE,
  Networks,
  Horizon,
  StrKey,
} from "@stellar/stellar-sdk";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const FRIENDBOT_URL = "https://friendbot.stellar.org";

// Our testnet USDC issuer (custom issuer with funded accounts for hackathon demo)
const USDC_ISSUER =
  process.env.USDC_ISSUER ??
  "GBB6YO4V5K37CXZV4N3ZG4X7NQBCOSSFFQ566CAWSXGMCDIG63GH7UCZ";

const USDC_TESTNET = new Asset("USDC", USDC_ISSUER);

const horizonServer = new Horizon.Server(HORIZON_URL);

// ── Logging helpers ───────────────────────────────────────────────────────────

function log(label: string, msg: string) {
  console.log(`  [${label}] ${msg}`);
}
function step(n: number, total: number, title: string) {
  console.log(`\n[${n}/${total}] ${title}`);
  console.log("─".repeat(50));
}
function ok(msg: string) {
  log("OK", msg);
}
function info(msg: string) {
  log("..", msg);
}
function warn(msg: string) {
  log("!!", msg);
}

// ── Stellar helpers ───────────────────────────────────────────────────────────

async function fundWithFriendbot(publicKey: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}?addr=${publicKey}`);
  if (!res.ok) throw new Error(`Friendbot failed: ${await res.text()}`);
  ok(`Funded ${publicKey.slice(0, 8)}...${publicKey.slice(-4)} with 10,000 XLM`);
}

async function addUsdcTrustline(keypair: Keypair): Promise<string | null> {
  const account = await horizonServer.loadAccount(keypair.publicKey());

  // Check if trustline already exists
  for (const b of account.balances) {
    if (
      b.asset_type === "credit_alphanum4" &&
      (b as Horizon.HorizonApi.BalanceLineAsset).asset_code === "USDC"
    ) {
      ok("USDC trustline already exists");
      return null;
    }
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: USDC_TESTNET }))
    .setTimeout(300)
    .build();

  tx.sign(keypair);
  const result = await horizonServer.submitTransaction(tx);
  ok(`USDC trustline added — tx: ${result.hash.slice(0, 16)}...`);
  return result.hash;
}

async function buildAndSubmitPayment(
  fromKeypair: Keypair,
  toAddress: string,
  amountUsdc: number,
  protocolFeeAddress: string,
  memo?: string
): Promise<string> {
  const account = await horizonServer.loadAccount(fromKeypair.publicKey());

  const serviceAmount = (amountUsdc * 0.9).toFixed(7);
  const feeAmount = (amountUsdc * 0.1).toFixed(7);

  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  });

  // MPP-style split: 90% to service, 10% protocol fee
  builder.addOperation(
    Operation.payment({
      destination: toAddress,
      asset: USDC_TESTNET,
      amount: serviceAmount,
    })
  );

  builder.addOperation(
    Operation.payment({
      destination: protocolFeeAddress,
      asset: USDC_TESTNET,
      amount: feeAmount,
    })
  );

  if (memo) {
    builder.addMemo(Memo.text(memo.slice(0, 28)));
  }

  const tx = builder.setTimeout(300).build();
  tx.sign(fromKeypair);

  const result = await horizonServer.submitTransaction(tx);
  ok(`MPP payment submitted — tx: ${result.hash}`);
  ok(`  Service (${toAddress.slice(0, 8)}...): ${serviceAmount} USDC`);
  ok(`  Protocol fee: ${feeAmount} USDC`);
  return result.hash;
}

// ── Main agent flow ───────────────────────────────────────────────────────────

async function runAgent(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Stellar Agent Trust Fabric — Demo Agent v2.0");
  console.log("=".repeat(60));
  console.log(`API: ${API_BASE}`);
  console.log(`Agent ID: ${AGENT_ID} | Service ID: ${SERVICE_ID}`);
  console.log(`Real Stellar payments: ${USE_REAL_PAYMENT ? "ENABLED" : "disabled (demo mode)"}`);

  const TOTAL_STEPS = USE_REAL_PAYMENT ? 8 : 6;
  let agentKeypair: Keypair | null = null;

  // ── Step 1: Stellar keypair setup ──────────────────────────────────────────
  if (USE_REAL_PAYMENT) {
    step(1, TOTAL_STEPS, "Stellar keypair setup");

    if (process.env.AGENT_SECRET_KEY) {
      agentKeypair = Keypair.fromSecret(process.env.AGENT_SECRET_KEY);
      ok(`Using existing keypair: ${agentKeypair.publicKey()}`);
    } else {
      info("Creating new Stellar Testnet keypair via Trust Fabric API...");
      const createRes = await fetch(`${API_BASE}/stellar/account/create`, { method: "POST" });
      const created = await createRes.json() as {
        publicKey: string;
        secretKey: string;
        usdcTrustlineAdded: boolean;
        balances: { xlm: string; usdc: string };
      };
      agentKeypair = Keypair.fromSecret(created.secretKey);
      ok(`New keypair created: ${created.publicKey}`);
      ok(`Balances — XLM: ${created.balances.xlm}, USDC: ${created.balances.usdc}`);
      ok(`USDC trustline: ${created.usdcTrustlineAdded ? "added" : "pending"}`);
      warn(`Store this secret key: ${created.secretKey}`);
    }
  }

  // ── Step 2: Check agent reputation ─────────────────────────────────────────
  step(USE_REAL_PAYMENT ? 2 : 1, TOTAL_STEPS, "Check agent reputation");

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
  ok(`Name: ${agent.name}`);
  ok(`Stellar: ${agent.stellarAddress}`);
  ok(`Reputation: ${agent.reputationScore}/100`);
  ok(`Transactions: ${agent.totalTransactions}`);

  // ── Step 3: Discover services ───────────────────────────────────────────────
  step(USE_REAL_PAYMENT ? 3 : 2, TOTAL_STEPS, "Service discovery");

  const svcRes = await fetch(`${API_BASE}/services?limit=5`);
  const svcData = await svcRes.json() as {
    services: Array<{ id: string; name: string; priceUsdc: number; category: string; ownerAddress: string }>;
  };
  ok(`Found ${svcData.services.length} services in registry`);
  for (const s of svcData.services) {
    info(`[${s.category}] ${s.name} — ${s.priceUsdc} USDC`);
  }

  // ── Step 4: Create scoped session ──────────────────────────────────────────
  step(USE_REAL_PAYMENT ? 4 : 3, TOTAL_STEPS, "Create scoped session");

  const sessionRes = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: AGENT_ID,
      maxSpendUsdc: 0.5,
      durationMinutes: 60,
      allowedEndpoints: ["/api/services/paid/summarize"],
    }),
  });
  const session = await sessionRes.json() as {
    id: string;
    sessionToken: string;
    maxSpendUsdc: number;
    expiresAt: string;
  };
  ok(`Session ID: ${session.id}`);
  ok(`Token: ${session.sessionToken.slice(0, 20)}...`);
  ok(`Max spend: ${session.maxSpendUsdc} USDC | Expires: ${session.expiresAt}`);

  // ── Step 5: Probe the paid endpoint (receive 402) ──────────────────────────
  step(USE_REAL_PAYMENT ? 5 : 4, TOTAL_STEPS, "Probe paid endpoint (x402 discovery)");

  const probeRes = await fetch(`${API_BASE}/services/paid/summarize`, { method: "GET" });
  const paymentSpec = await probeRes.json() as {
    error: string;
    x402Version: number;
    accepts: Array<{
      payTo: string;
      maxAmountRequired: string;
      asset: string;
      extra?: { protocolFeeAddress?: string; protocolFeeFraction?: number };
    }>;
  };

  if (probeRes.status !== 402) {
    warn(`Expected 402, got ${probeRes.status} — proceeding anyway`);
  } else {
    ok(`Received HTTP 402 Payment Required (x402 v${paymentSpec.x402Version})`);
  }

  const spec = paymentSpec.accepts[0]!;
  ok(`Pay to: ${spec.payTo}`);
  ok(`Amount: ${spec.maxAmountRequired} USDC`);
  ok(`Asset: ${spec.asset}`);
  const protocolFeeAddress = spec.extra?.protocolFeeAddress ?? spec.payTo;
  ok(`Protocol fee: ${(spec.extra?.protocolFeeFraction ?? 0.1) * 100}% → ${protocolFeeAddress}`);

  // ── Step 6: Submit payment on Stellar Testnet ──────────────────────────────
  let txHash: string;

  if (USE_REAL_PAYMENT && agentKeypair) {
    step(6, TOTAL_STEPS, "Submit MPP payment on Stellar Testnet");

    info("Building split payment transaction (90% service / 10% protocol fee)...");
    txHash = await buildAndSubmitPayment(
      agentKeypair,
      spec.payTo,
      parseFloat(spec.maxAmountRequired),
      protocolFeeAddress,
      `trustfabric-agent-${AGENT_ID}`
    );
    ok(`Stellar Explorer: https://stellar.expert/explorer/testnet/tx/${txHash}`);
  } else {
    // Dev mode: use a placeholder hash (accepted when STELLAR_VERIFY_ONCHAIN != "true")
    txHash = `dev_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`;
    info(`Dev mode: using placeholder tx hash ${txHash}`);
  }

  // ── Step 7: Call the paid service with X-PAYMENT header ────────────────────
  step(USE_REAL_PAYMENT ? 7 : 5, TOTAL_STEPS, "Call paid service (x402 payment proof)");

  const TEXT_TO_SUMMARIZE =
    "The Stellar Agent Trust Fabric is an open-source trust layer for autonomous AI agents operating on the Stellar blockchain. It provides scoped session permissions, on-chain reputation scoring, and an x402 micropayment marketplace — enabling agents to discover, pay for, and rate services in a trustless, permissionless environment without requiring DeFi, lending, or yield mechanisms.";

  info(`Sending X-PAYMENT: ${txHash}`);

  const paidRes = await fetch(`${API_BASE}/services/paid/summarize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": txHash,
    },
    body: JSON.stringify({
      agentId: AGENT_ID,
      text: TEXT_TO_SUMMARIZE,
      sessionToken: session.sessionToken,
    }),
  });

  if (!paidRes.ok) {
    const errBody = await paidRes.json();
    throw new Error(`Service call failed: ${JSON.stringify(errBody)}`);
  }

  const serviceResult = await paidRes.json() as {
    summary: string;
    wordCount: number;
    paymentId: string;
    txHash: string;
    verifiedOnChain: boolean;
    mppEnabled: boolean;
  };

  ok(`Service response received`);
  ok(`Word count: ${serviceResult.wordCount}`);
  ok(`Payment ID: ${serviceResult.paymentId}`);
  ok(`Verified on Horizon: ${serviceResult.verifiedOnChain}`);
  ok(`MPP split recorded: ${serviceResult.mppEnabled}`);
  info(`Summary: "${serviceResult.summary}"`);

  // ── Step 8: Rate the service ────────────────────────────────────────────────
  step(USE_REAL_PAYMENT ? 8 : 6, TOTAL_STEPS, "Rate service (update on-chain reputation)");

  const ratingRes = await fetch(`${API_BASE}/ratings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: AGENT_ID,
      serviceId: SERVICE_ID,
      paymentId: serviceResult.paymentId,
      score: 5,
      comment: "Fast, accurate, and on-chain. Perfect for autonomous agent workflows.",
    }),
  });

  const rating = await ratingRes.json() as { id: string; score: number };
  ok(`Rating submitted: ${rating.score}/5 stars (ID: ${rating.id})`);

  // ── Final summary ──────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("AGENT RUN COMPLETE");
  console.log("=".repeat(60));
  console.log(`Transaction hash : ${txHash}`);
  if (USE_REAL_PAYMENT) {
    console.log(`Explorer         : https://stellar.expert/explorer/testnet/tx/${txHash}`);
  }
  console.log(`Payment ID       : ${serviceResult.paymentId}`);
  console.log(`Rating ID        : ${rating.id}`);
  console.log(`Summary          : ${serviceResult.summary}`);
  console.log("=".repeat(60));
}

runAgent().catch((err: Error) => {
  console.error("\nAgent error:", err.message);
  process.exit(1);
});
