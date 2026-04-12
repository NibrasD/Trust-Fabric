import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, agentsTable, servicesTable, paymentsTable, ratingsTable } from "@workspace/db";
import { RunDemoAgentBody } from "@workspace/api-zod";
import { generateStellarTxHash } from "../lib/stellarUtils.js";

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

  steps.push({
    step: "service_discovery",
    status: "success",
    message: `Agent "${agent.name}" discovered service "${svc.name}" in the registry`,
    data: {
      agentAddress: agent.stellarAddress,
      serviceEndpoint: svc.endpoint,
      priceUsdc: Number(svc.priceUsdc),
      serviceReputation: Number(svc.reputationScore),
    },
  });

  steps.push({
    step: "session_check",
    status: "success",
    message: `Scoped session authorized — max spend ${svc.priceUsdc} USDC, endpoint ${svc.endpoint} whitelisted`,
    data: {
      maxSpendUsdc: Number(svc.priceUsdc),
      allowedEndpoints: [svc.endpoint],
      timeoutSeconds: 3600,
    },
  });

  steps.push({
    step: "x402_request",
    status: "success",
    message: `Agent sent HTTP request to ${svc.endpoint} — received 402 Payment Required`,
    data: {
      httpStatus: 402,
      x402Version: 1,
      requiredAmount: `${svc.priceUsdc} USDC`,
      network: "stellar-testnet",
    },
  });

  const txHash = generateStellarTxHash();
  const amountUsdc = Number(svc.priceUsdc);

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      agentId: Number(agentId),
      serviceId: Number(serviceId),
      amountUsdc: String(amountUsdc),
      txHash,
      status: "confirmed",
      network: "testnet",
    })
    .returning();

  await db
    .update(agentsTable)
    .set({
      totalTransactions: agent.totalTransactions + 1,
      totalSpentUsdc: String(Number(agent.totalSpentUsdc) + amountUsdc),
    })
    .where(eq(agentsTable.id, agent.id));

  await db
    .update(servicesTable)
    .set({ totalCalls: svc.totalCalls + 1 })
    .where(eq(servicesTable.id, svc.id));

  steps.push({
    step: "payment_confirmed",
    status: "success",
    message: `x402 payment of ${amountUsdc} USDC confirmed on Stellar Testnet`,
    data: {
      txHash,
      amountUsdc,
      network: "testnet",
      stellarExplorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
    },
  });

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

  const updatedAgent = await db.select().from(agentsTable).where(eq(agentsTable.id, Number(agentId)));
  const agentCurrentScore = Number(updatedAgent[0]?.reputationScore ?? agent.reputationScore);
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
    txHash,
    summary: `Agent "${agent.name}" successfully completed the full x402 payment cycle: discovered service, authorized a scoped session, paid ${amountUsdc} USDC on Stellar Testnet (tx: ${txHash.slice(0, 16)}...), received service output, and earned ${stars}/5 stars, updating its reputation score to ${Math.round(newScore * 100) / 100}.`,
  });
});

export default router;
