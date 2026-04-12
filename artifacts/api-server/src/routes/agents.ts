import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, agentsTable, paymentsTable, ratingsTable } from "@workspace/db";
import {
  ListAgentsQueryParams,
  RegisterAgentBody,
  GetAgentParams,
  GetAgentActivityParams,
  GetAgentActivityQueryParams,
} from "@workspace/api-zod";
import { crypto } from "../lib/stellarUtils.js";

const router: IRouter = Router();

function formatAgent(a: typeof agentsTable.$inferSelect) {
  return {
    id: String(a.id),
    name: a.name,
    stellarAddress: a.stellarAddress,
    reputationScore: Number(a.reputationScore),
    totalTransactions: a.totalTransactions,
    avgRating: Number(a.avgRating),
    totalSpentUsdc: Number(a.totalSpentUsdc),
    isActive: a.isActive,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

router.get("/agents", async (req, res): Promise<void> => {
  const query = ListAgentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "bad_request", message: query.error.message });
    return;
  }
  const { limit = 20, offset = 0 } = query.data;
  const agents = await db
    .select()
    .from(agentsTable)
    .orderBy(desc(agentsTable.reputationScore))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentsTable);

  res.json({ agents: agents.map(formatAgent), total: count });
});

router.post("/agents", async (req, res): Promise<void> => {
  const parsed = RegisterAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }
  const [agent] = await db
    .insert(agentsTable)
    .values({
      name: parsed.data.name,
      stellarAddress: parsed.data.stellarAddress,
    })
    .returning();
  res.status(201).json(formatAgent(agent!));
});

router.get("/agents/stats/summary", async (_req, res): Promise<void> => {
  const agents = await db.select().from(agentsTable);
  const total = agents.length;
  const active = agents.filter((a) => a.isActive).length;
  const avgRep = total > 0 ? agents.reduce((s, a) => s + Number(a.reputationScore), 0) / total : 0;
  const top = [...agents].sort((a, b) => Number(b.reputationScore) - Number(a.reputationScore))[0];

  // Always derive volume and tx count from the actual payments table — not agent cache fields
  const [paymentTotals] = await db
    .select({
      totalVolume: sql<number>`coalesce(sum(${paymentsTable.amountUsdc}::numeric), 0)::float`,
      totalCount: sql<number>`count(*)::int`,
    })
    .from(paymentsTable);

  res.json({
    totalAgents: total,
    activeAgents: active,
    avgReputationScore: Math.round(avgRep * 100) / 100,
    totalPaymentVolume: Math.round((paymentTotals?.totalVolume ?? 0) * 1000000) / 1000000,
    totalTransactions: paymentTotals?.totalCount ?? 0,
    topAgent: top ? formatAgent(top) : null,
  });
});

router.get("/agents/:agentId", async (req, res): Promise<void> => {
  const params = GetAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, Number(params.data.agentId)));

  if (!agent) {
    res.status(404).json({ error: "not_found", message: "Agent not found" });
    return;
  }
  res.json(formatAgent(agent));
});

router.get("/agents/:agentId/activity", async (req, res): Promise<void> => {
  const params = GetAgentActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }
  const qp = GetAgentActivityQueryParams.safeParse(req.query);
  const limit = qp.success ? (qp.data.limit ?? 10) : 10;
  const agentId = Number(params.data.agentId);

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) {
    res.status(404).json({ error: "not_found", message: "Agent not found" });
    return;
  }

  const payments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.agentId, agentId))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(limit);

  const { servicesTable } = await import("@workspace/db");
  const paymentsMapped = await Promise.all(
    payments.map(async (p) => {
      const [svc] = await db.select().from(servicesTable).where(eq(servicesTable.id, p.serviceId));
      return {
        id: String(p.id),
        agentId: String(p.agentId),
        agentName: agent.name,
        serviceId: String(p.serviceId),
        serviceName: svc?.name ?? "Unknown",
        sessionId: p.sessionId ? String(p.sessionId) : undefined,
        amountUsdc: Number(p.amountUsdc),
        txHash: p.txHash,
        status: p.status,
        network: p.network,
        createdAt: p.createdAt.toISOString(),
      };
    })
  );

  const ratingRows = await db
    .select()
    .from(ratingsTable)
    .where(eq(ratingsTable.agentId, agentId))
    .orderBy(desc(ratingsTable.createdAt))
    .limit(limit);

  const ratingsMapped = await Promise.all(
    ratingRows.map(async (r) => {
      const [svc] = await db.select().from(servicesTable).where(eq(servicesTable.id, r.serviceId));
      return {
        id: String(r.id),
        agentId: String(r.agentId),
        agentName: agent.name,
        serviceId: String(r.serviceId),
        serviceName: svc?.name ?? "Unknown",
        paymentId: String(r.paymentId),
        stars: r.stars,
        comment: r.comment ?? undefined,
        reputationDelta: Number(r.reputationDelta),
        createdAt: r.createdAt.toISOString(),
      };
    })
  );

  res.json({ payments: paymentsMapped, ratings: ratingsMapped });
});

export default router;
