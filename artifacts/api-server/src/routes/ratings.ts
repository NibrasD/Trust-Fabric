import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, ratingsTable, agentsTable, servicesTable, paymentsTable } from "@workspace/db";
import { SubmitRatingBody } from "@workspace/api-zod";
import { sorobanSubmitRating } from "../lib/soroban.js";

const router: IRouter = Router();

function computeReputationDelta(stars: number, amountUsdc: number): number {
  const baseWeight = Math.log1p(amountUsdc);
  const starFactor = (stars - 3) * 2.5;
  return Math.round(baseWeight * starFactor * 100) / 100;
}

router.post("/ratings", async (req, res): Promise<void> => {
  const parsed = SubmitRatingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }
  const { agentId, serviceId, paymentId, stars, comment } = parsed.data;

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

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, Number(paymentId)));
  const amountUsdc = payment ? Number(payment.amountUsdc) : 0.1;

  const delta = computeReputationDelta(stars, amountUsdc);

  const [rating] = await db
    .insert(ratingsTable)
    .values({
      agentId: Number(agentId),
      serviceId: Number(serviceId),
      paymentId: Number(paymentId),
      stars,
      comment: comment ?? null,
      reputationDelta: String(delta),
    })
    .returning();

  const allRatings = await db
    .select()
    .from(ratingsTable)
    .where(eq(ratingsTable.agentId, Number(agentId)));

  const totalStars = allRatings.reduce((s, r) => s + r.stars, 0);
  const avgStars = allRatings.length > 0 ? totalStars / allRatings.length : stars;

  const currentScore = Number(agent.reputationScore);
  const newScore = Math.max(0, Math.min(100, currentScore + delta));

  await db
    .update(agentsTable)
    .set({
      avgRating: String(Math.round(avgStars * 100) / 100),
      reputationScore: String(Math.round(newScore * 100) / 100),
    })
    .where(eq(agentsTable.id, Number(agentId)));

  const svcRatings = await db
    .select()
    .from(ratingsTable)
    .where(eq(ratingsTable.serviceId, Number(serviceId)));
  const svcAvg = svcRatings.reduce((s, r) => s + r.stars, 0) / svcRatings.length;
  await db
    .update(servicesTable)
    .set({ avgRating: String(Math.round(svcAvg * 100) / 100) })
    .where(eq(servicesTable.id, Number(serviceId)));

  // Fire-and-forget: update reputation on Soroban contract
  const amountStroops = BigInt(Math.round(amountUsdc * 10_000_000));
  sorobanSubmitRating(agent.stellarAddress, stars, amountStroops).catch(() => {});

  res.status(201).json({
    id: String(rating!.id),
    agentId: String(rating!.agentId),
    agentName: agent.name,
    serviceId: String(rating!.serviceId),
    serviceName: svc.name,
    paymentId: String(rating!.paymentId),
    stars: rating!.stars,
    comment: rating!.comment ?? undefined,
    reputationDelta: Number(rating!.reputationDelta),
    createdAt: rating!.createdAt.toISOString(),
  });
});

export default router;
