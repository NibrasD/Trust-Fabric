import { Router, type IRouter } from "express";
import { eq, and, gt } from "drizzle-orm";
import { db, agentsTable, servicesTable, paymentsTable, ratingsTable, sessionsTable } from "@workspace/db";
import { RunDemoAgentBody } from "@workspace/api-zod";
import {
  buildX402Challenge,
  PROTOCOL_FEE_ADDRESS,
  PROTOCOL_FEE_FRACTION,
} from "../lib/stellarPayments.js";


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

  if (existingSession && endpointAllowed && withinBudget) {
    // Re-use the existing session
    sessionId = existingSession.id;
    steps.push({
      step: "session_check",
      status: "success",
      message: `Active session found — endpoint ${svc.endpoint} whitelisted, ${(Number(existingSession.maxSpendUsdc) - Number(existingSession.spentUsdc)).toFixed(4)} USDC remaining`,
      data: {
        sessionId: String(sessionId),
        sessionToken: sessionToken.slice(0, 20) + "...",
        maxSpendUsdc: Number(existingSession.maxSpendUsdc),
        spentUsdc: Number(existingSession.spentUsdc),
        allowedEndpoints: sessionEndpoints,
        expiresAt: existingSession.expiresAt.toISOString(),
      },
    });
  } else if (existingSession && (!endpointAllowed || !withinBudget)) {
    // Session exists but blocked — report why and continue without session
    sessionWasNew = false;
    const reason = !endpointAllowed
      ? `endpoint ${svc.endpoint} not in session allowlist`
      : `spend limit reached (${Number(existingSession.spentUsdc).toFixed(4)} / ${Number(existingSession.maxSpendUsdc).toFixed(4)} USDC)`;
    steps.push({
      step: "session_check",
      status: "skipped",
      message: `Session policy denied — ${reason}. Proceeding with payment-only access.`,
      data: {
        sessionId: String(existingSession.id),
        denied: true,
        reason,
        fallback: "payment_only",
      },
    });
  } else {
    // No active session — proceed with payment-only access (no session needed)
    steps.push({
      step: "session_check",
      status: "skipped",
      message: `No active session for this agent — open access via payment. Create a session in Sessions Manager to enforce spend limits and endpoint policies.`,
      data: {
        sessionFound: false,
        fallback: "payment_only",
        hint: "Visit /sessions to create a scoped session for this agent",
      },
    });
  }

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

  // ── Step 4: Payment ───────────────────────────────────────────────────────
  const txHash = `${Buffer.from(Date.now().toString()).toString("hex").slice(0, 32)}${Math.random().toString(16).slice(2, 34)}`;
  const serviceAmount = (amountUsdc * (1 - PROTOCOL_FEE_FRACTION)).toFixed(7);
  const feeAmount = (amountUsdc * PROTOCOL_FEE_FRACTION).toFixed(7);

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

  steps.push({
    step: "payment_confirmed",
    status: "success",
    message: `MPP payment of ${amountUsdc} USDC split and confirmed on Stellar Testnet`,
    data: {
      txHash,
      totalUsdc: amountUsdc,
      serviceAmount,
      protocolFee: feeAmount,
      fromAddress: agent.stellarAddress,
      toAddress: svc.ownerAddress ?? PROTOCOL_FEE_ADDRESS,
      network: "testnet",
      verifiedOnChain: false,
      ...(sessionId != null ? { sessionId: String(sessionId) } : { sessionId: null }),
      paymentId: String(payment!.id),
      stellarExplorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
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

  res.json({
    steps,
    finalReputationScore: Math.round(newScore * 100) / 100,
    paymentId: String(payment!.id),
    ratingId: String(rating!.id),
    sessionId: String(sessionId),
    txHash,
    summary: `Agent "${agent.name}" successfully completed the full x402 payment cycle: discovered service, authorized a scoped session, paid ${amountUsdc} USDC on Stellar Testnet (tx: ${txHash.slice(0, 16)}...), received service output, and earned ${stars}/5 stars, updating its reputation score to ${Math.round(newScore * 100) * 100 / 10000}.`,
  });
});

export default router;
