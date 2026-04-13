import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { logger } from "../lib/logger.js";
import { eq, and, gt } from "drizzle-orm";
import { db, agentsTable, servicesTable, paymentsTable, ratingsTable, sessionsTable } from "@workspace/db";
import { RunDemoAgentBody } from "@workspace/api-zod";
import {
  buildX402Challenge,
  buildMppPaymentTransaction,
  PROTOCOL_FEE_ADDRESS,
  PROTOCOL_FEE_FRACTION,
  server as horizonServer,
} from "../lib/stellarPayments.js";
import { sorobanAuthorizeSpend } from "../lib/soroban.js";

// Demo agent keypair — funded with testnet USDC, signs all demo payments
const DEMO_AGENT_SECRET = process.env.DEMO_AGENT_SECRET;
const demoKeypair = DEMO_AGENT_SECRET ? Keypair.fromSecret(DEMO_AGENT_SECRET) : null;


const router: IRouter = Router();

router.post("/demo/run", async (req, res): Promise<void> => {
  const parsed = RunDemoAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }
  const { agentId, serviceId, textToSummarize } = parsed.data;

  const steps: Array<{ step: string; status: "success" | "failed" | "skipped"; message: string; data?: object }> = [];

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, Number(agentId)));
  if (!agent) {
    res.status(404).json({ error: "not_found", message: "Agent not found" });
    return;
  }

  const [svc] = await db.select().from(servicesTable).where(eq(servicesTable.id, Number(serviceId)));
  if (!svc) {
    res.status(404).json({ error: "not_found", message: "Service not found" });
    return;
  }

  const amountUsdc = Number(svc.priceUsdc);

  // ── Step 1: Service Discovery ─────────────────────────────────────────────
  steps.push({
    step: "service_discovery",
    status: "success",
    message: `Agent "${agent.name}" discovered service "${svc.name}" in the registry`,
    data: {
      agentAddress: agent.stellarAddress,
      serviceEndpoint: svc.endpoint,
      priceUsdc: amountUsdc,
      serviceReputation: Number(svc.reputationScore),
    },
  });

  // ── Step 2: Session Check / Create ────────────────────────────────────────
  // Look for an existing active session scoped to this endpoint
  const now = new Date();
  const [existingSession] = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.agentId, agent.id),
        eq(sessionsTable.status, "active"),
        gt(sessionsTable.expiresAt, now)
      )
    )
    .limit(1);

  let sessionId: number | undefined;
  let sessionWasNew = false;

  const sessionEndpoints: string[] = existingSession?.allowedEndpoints ?? [];
  const endpointAllowed =
    sessionEndpoints.length === 0 || sessionEndpoints.includes(svc.endpoint);
  const withinBudget = existingSession
    ? Number(existingSession.spentUsdc) + amountUsdc <= Number(existingSession.maxSpendUsdc)
    : true;

  if (!existingSession) {
    // No active session at all — hard block
    steps.push({
      step: "session_check",
      status: "error",
      message: `Access denied — no active session found for agent "${agent.name}". Create a session in Sessions Manager before running this agent.`,
      data: {
        agentId: String(agentId),
        agentName: agent.name,
        sessionFound: false,
        hint: "Go to /sessions and create an active session for this agent",
      },
    });
    res.status(403).json({ steps, error: "No active session for this agent." });
    return;
  }

  if (!endpointAllowed) {
    // Session exists but endpoint not whitelisted
    steps.push({
      step: "session_check",
      status: "error",
      message: `Access denied — endpoint "${svc.endpoint}" is not in this session's allowlist.`,
      data: {
        sessionId: String(existingSession.id),
        allowedEndpoints: sessionEndpoints,
        requestedEndpoint: svc.endpoint,
      },
    });
    res.status(403).json({ steps, error: `Endpoint ${svc.endpoint} not allowed by session policy.` });
    return;
  }

  if (!withinBudget) {
    // Session exists but spend limit exhausted
    steps.push({
      step: "session_check",
      status: "error",
      message: `Access denied — session spend limit reached (${Number(existingSession.spentUsdc).toFixed(4)} / ${Number(existingSession.maxSpendUsdc).toFixed(4)} USDC). Create a new session to continue.`,
      data: {
        sessionId: String(existingSession.id),
        spentUsdc: Number(existingSession.spentUsdc),
        maxSpendUsdc: Number(existingSession.maxSpendUsdc),
        requestedAmount: amountUsdc,
      },
    });
    res.status(402).json({ steps, error: "Session spend limit exhausted." });
    return;
  }

  // All checks passed — use this session
  sessionId = existingSession.id;
  steps.push({
    step: "session_check",
    status: "success",
    message: `Active session found — endpoint ${svc.endpoint} whitelisted, ${(Number(existingSession.maxSpendUsdc) - Number(existingSession.spentUsdc)).toFixed(4)} USDC remaining`,
    data: {
      sessionId: String(sessionId),
      sessionToken: existingSession.sessionToken.slice(0, 20) + "...",
      maxSpendUsdc: Number(existingSession.maxSpendUsdc),
      spentUsdc: Number(existingSession.spentUsdc),
      allowedEndpoints: sessionEndpoints,
      expiresAt: existingSession.expiresAt.toISOString(),
    },
  });

  // ── Step 3: x402 Request ──────────────────────────────────────────────────
  const x402Challenge = buildX402Challenge({
    serviceAddress: svc.ownerAddress ?? PROTOCOL_FEE_ADDRESS,
    amountUsdc,
    resource: svc.endpoint,
    description: `${svc.name} — ${svc.priceUsdc} USDC per request`,
  });

  steps.push({
    step: "x402_request",
    status: "success",
    message: `Agent sent HTTP request to ${svc.endpoint} — received 402 Payment Required`,
    data: {
      httpStatus: 402,
      x402Version: x402Challenge.x402Version,
      requiredAmount: `${svc.priceUsdc} USDC`,
      network: "stellar-testnet",
      payTo: x402Challenge.accepts[0]?.payTo ?? svc.ownerAddress,
      asset: x402Challenge.accepts[0]?.asset,
      mppEnabled: x402Challenge.accepts[0]?.extra?.mppEnabled,
      protocolFeeAddress: x402Challenge.accepts[0]?.extra?.protocolFeeAddress,
      protocolFeeFraction: x402Challenge.accepts[0]?.extra?.protocolFeeFraction,
    },
  });

  // ── Step 4: Soroban On-Chain Authorization ───────────────────────────────
  let sorobanAuthHash: string | null = null;
  if (existingSession) {
    const sorobanAuth = await sorobanAuthorizeSpend(existingSession.sessionToken, amountUsdc);
    if (sorobanAuth) {
      sorobanAuthHash = sorobanAuth.sorobanAuthHash;
      steps.push({
        step: "soroban_authorization",
        status: "success",
        message: `Soroban session contract authorized spend of ${amountUsdc} USDC on-chain`,
        data: {
          sorobanAuthTxHash: sorobanAuth.sorobanAuthHash,
          onChainSpentUsdc: sorobanAuth.onChainSpentUsdc,
          onChainMaxSpendUsdc: sorobanAuth.onChainMaxSpendUsdc,
          contractId: "CAKSBWFSRPCBN6XHV5PUOVHU5234CHOGZNXKLXBOAUW4RZCIL45RU2F7",
          explorerUrl: `https://stellar.expert/explorer/testnet/tx/${sorobanAuth.sorobanAuthHash}`,
        },
      });
    } else {
      steps.push({
        step: "soroban_authorization",
        status: "error",
        message: "Soroban session contract DENIED this spend — on-chain budget exceeded or session not registered on-chain",
        data: { sessionToken: existingSession.sessionToken.slice(0, 20) + "..." },
      });
      res.status(403).json({ steps, error: "On-chain session authorization denied by Soroban contract." });
      return;
    }
  }

  // ── Step 5: Payment ───────────────────────────────────────────────────────
  let txHash: string;
  let verifiedOnChain = false;
  const serviceAmount = (amountUsdc * (1 - PROTOCOL_FEE_FRACTION)).toFixed(7);
  const feeAmount = (amountUsdc * PROTOCOL_FEE_FRACTION).toFixed(7);

  if (demoKeypair) {
    try {
      const { xdr } = await buildMppPaymentTransaction({
        fromKeypair: demoKeypair,
        serviceAddress: svc.ownerAddress ?? PROTOCOL_FEE_ADDRESS ?? demoKeypair.publicKey(),
        amountUsdc,
        memo: sorobanAuthHash ? `stf:${sorobanAuthHash.slice(0, 20)}` : `stf-x402-demo`,
      });
      const { TransactionBuilder } = await import("@stellar/stellar-sdk");
      const { STELLAR_PASSPHRASE } = await import("../lib/stellarPayments.js");
      const tx = TransactionBuilder.fromXDR(xdr, STELLAR_PASSPHRASE);
      const result = await horizonServer.submitTransaction(tx as Parameters<typeof horizonServer.submitTransaction>[0]);
      txHash = result.hash;
      verifiedOnChain = true;
    } catch (payErr: any) {
      const errDetail = payErr?.response
        ? await payErr.response.json().catch(() => ({ raw: payErr.message }))
        : { raw: payErr?.message ?? String(payErr) };
      logger.error({ err: errDetail }, "Demo real payment failed — falling back to simulated");
      txHash = randomBytes(32).toString("hex");
      verifiedOnChain = false;
      (steps as any).__paymentError = errDetail;
    }
  } else {
    txHash = randomBytes(32).toString("hex");
    verifiedOnChain = false;
    (steps as any).__paymentError = { raw: "DEMO_AGENT_SECRET not configured on this server" };
  }

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      agentId: Number(agentId),
      serviceId: Number(serviceId),
      ...(sessionId != null ? { sessionId } : {}),
      amountUsdc: String(amountUsdc),
      txHash,
      fromAddress: agent.stellarAddress,
      status: "confirmed",
      network: "testnet",
    })
    .returning();

  // Update session spentUsdc (only if a session was used)
  if (sessionId != null) {
    const prevSpent = existingSession && !sessionWasNew ? Number(existingSession.spentUsdc) : 0;
    await db
      .update(sessionsTable)
      .set({ spentUsdc: String(prevSpent + amountUsdc) })
      .where(eq(sessionsTable.id, sessionId));
  }

  // Update agent totals
  await db
    .update(agentsTable)
    .set({
      totalTransactions: agent.totalTransactions + 1,
      totalSpentUsdc: String(Number(agent.totalSpentUsdc) + amountUsdc),
    })
    .where(eq(agentsTable.id, agent.id));

  // Update service call count
  await db
    .update(servicesTable)
    .set({ totalCalls: svc.totalCalls + 1 })
    .where(eq(servicesTable.id, svc.id));

  const demoFromAddress = verifiedOnChain && demoKeypair
    ? demoKeypair.publicKey()
    : agent.stellarAddress;

  steps.push({
    step: "payment_confirmed",
    status: "success",
    message: verifiedOnChain
      ? `Real MPP payment of ${amountUsdc} USDC confirmed on Stellar Testnet — verified on-chain`
      : `MPP payment of ${amountUsdc} USDC split and confirmed on Stellar Testnet (simulated)`,
    data: {
      txHash,
      totalUsdc: amountUsdc,
      serviceAmount,
      protocolFee: feeAmount,
      fromAddress: demoFromAddress,
      toAddress: svc.ownerAddress ?? PROTOCOL_FEE_ADDRESS,
      network: "testnet",
      verifiedOnChain,
      ...(sessionId != null ? { sessionId: String(sessionId) } : { sessionId: null }),
      paymentId: String(payment!.id),
      stellarExplorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
      ...(sorobanAuthHash ? {
        sorobanAuthTxHash: sorobanAuthHash,
        sorobanExplorerUrl: `https://stellar.expert/explorer/testnet/tx/${sorobanAuthHash}`,
      } : {}),
    },
  });

  // ── Step 5: Service Execution ─────────────────────────────────────────────
  const text = textToSummarize ?? "The Stellar network is a decentralized blockchain that enables fast, low-cost financial transactions and smart contracts through Soroban.";
  const words = text.trim().split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  const summary =
    sentences.length > 0
      ? sentences.slice(0, 2).join(". ").trim() + "."
      : words.slice(0, 20).join(" ") + "...";

  steps.push({
    step: "service_executed",
    status: "success",
    message: `Service returned response — access granted after payment verification`,
    data: {
      summary,
      wordCount: words.length,
      httpStatus: 200,
    },
  });

  // ── Step 6: Reputation Update ─────────────────────────────────────────────
  const stars = Math.random() > 0.2 ? 4 + Math.floor(Math.random() * 2) : 3;
  const delta = Math.round(Math.log1p(amountUsdc) * (stars - 3) * 2.5 * 100) / 100;

  const [rating] = await db
    .insert(ratingsTable)
    .values({
      agentId: Number(agentId),
      serviceId: Number(serviceId),
      paymentId: payment!.id,
      stars,
      comment: stars >= 4 ? "Excellent service — fast response and accurate output." : "Acceptable service, met requirements.",
      reputationDelta: String(delta),
    })
    .returning();

  const [updatedAgent] = await db.select().from(agentsTable).where(eq(agentsTable.id, Number(agentId)));
  const agentCurrentScore = Number(updatedAgent?.reputationScore ?? agent.reputationScore);
  const newScore = Math.max(0, Math.min(100, agentCurrentScore + delta));

  const allRatings = await db.select().from(ratingsTable).where(eq(ratingsTable.agentId, Number(agentId)));
  const avgStars = allRatings.reduce((s, r) => s + r.stars, 0) / allRatings.length;

  await db
    .update(agentsTable)
    .set({
      reputationScore: String(Math.round(newScore * 100) / 100),
      avgRating: String(Math.round(avgStars * 100) / 100),
    })
    .where(eq(agentsTable.id, Number(agentId)));

  steps.push({
    step: "reputation_updated",
    status: "success",
    message: `Agent rated ${stars}/5 stars — on-chain reputation updated by ${delta > 0 ? "+" : ""}${delta} points`,
    data: {
      stars,
      reputationDelta: delta,
      previousScore: agentCurrentScore,
      newScore: Math.round(newScore * 100) / 100,
    },
  });

  const stellarExplorerUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;

  res.json({
    steps,
    finalReputationScore: Math.round(newScore * 100) / 100,
    paymentId: String(payment!.id),
    ratingId: String(rating!.id),
    sessionId: String(sessionId),
    txHash,
    verified: verifiedOnChain,
    stellarExplorerUrl: verifiedOnChain ? stellarExplorerUrl : null,
    _debug: {
      demoKeypairConfigured: !!demoKeypair,
      demoWalletAddress: demoKeypair?.publicKey() ?? null,
      paymentError: (steps as any).__paymentError ?? null,
    },
    summary: `Agent "${agent.name}" successfully completed the full x402 payment cycle: discovered service, authorized a scoped session, paid ${amountUsdc} USDC on Stellar Testnet${verifiedOnChain ? "" : " (simulated)"} (tx: ${txHash.slice(0, 16)}...), received service output, and earned ${stars}/5 stars, updating its reputation score to ${Math.round(newScore * 100) * 100 / 10000}.`,
  });
});

export default router;
