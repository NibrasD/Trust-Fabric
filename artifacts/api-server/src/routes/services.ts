import { Router, type IRouter } from "express";
import { eq, desc, sql, lte, and } from "drizzle-orm";
import { db, servicesTable } from "@workspace/db";
import {
  ListServicesQueryParams,
  RegisterServiceBody,
  GetServiceParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatService(s: typeof servicesTable.$inferSelect) {
  return {
    id: String(s.id),
    name: s.name,
    description: s.description,
    category: s.category,
    endpoint: s.endpoint,
    priceUsdc: Number(s.priceUsdc),
    ownerAddress: s.ownerAddress,
    reputationScore: Number(s.reputationScore),
    totalCalls: s.totalCalls,
    avgRating: Number(s.avgRating),
    isActive: s.isActive,
    createdAt: s.createdAt.toISOString(),
  };
}

router.get("/services", async (req, res): Promise<void> => {
  const qp = ListServicesQueryParams.safeParse(req.query);
  if (!qp.success) {
    res.status(400).json({ error: "bad_request", message: qp.error.message });
    return;
  }
  const { category, maxPrice, limit = 20 } = qp.data;

  const conditions = [];
  if (category) conditions.push(eq(servicesTable.category, category));
  if (maxPrice != null) conditions.push(lte(servicesTable.priceUsdc, String(maxPrice)));

  const services = await db
    .select()
    .from(servicesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(servicesTable.reputationScore))
    .limit(limit);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(servicesTable);

  res.json({ services: services.map(formatService), total: count });
});

router.post("/services", async (req, res): Promise<void> => {
  const parsed = RegisterServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }
  const [svc] = await db
    .insert(servicesTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      endpoint: parsed.data.endpoint,
      priceUsdc: String(parsed.data.priceUsdc),
      ownerAddress: parsed.data.ownerAddress,
    })
    .returning();

  res.status(201).json(formatService(svc!));
});

router.get("/services/categories/counts", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      category: servicesTable.category,
      count: sql<number>`count(*)::int`,
    })
    .from(servicesTable)
    .groupBy(servicesTable.category)
    .orderBy(desc(sql`count(*)`));

  res.json({ categories: rows });
});

router.get("/services/paid/summarize", async (req, res): Promise<void> => {
  res.status(402).json({
    error: "Payment Required",
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "stellar-testnet",
        maxAmountRequired: "0.10",
        resource: `${req.protocol}://${req.get("host")}/api/services/paid/summarize`,
        description: "AI Summarizer — 0.10 USDC per request",
        mimeType: "application/json",
        payTo: "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ",
        maxTimeoutSeconds: 60,
        asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA",
        extra: { name: "AI Summarizer", version: "1.0" },
      },
    ],
  });
});

router.post("/services/paid/summarize", async (req, res): Promise<void> => {
  const { text, agentId } = req.body as { text?: string; agentId?: string; sessionToken?: string };

  if (!text || !agentId) {
    res.status(400).json({ error: "bad_request", message: "text and agentId are required" });
    return;
  }

  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  const summary =
    sentences.length > 0
      ? sentences.slice(0, Math.min(2, sentences.length)).join(". ").trim() + "."
      : words.slice(0, Math.min(30, words.length)).join(" ") + "...";

  const { paymentsTable, agentsTable } = await import("@workspace/db");
  const { generateStellarTxHash } = await import("../lib/stellarUtils.js");

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, Number(agentId)));
  if (!agent) {
    res.status(404).json({ error: "not_found", message: "Agent not found" });
    return;
  }

  const [svc] = await db
    .select()
    .from(servicesTable)
    .where(eq(servicesTable.name, "AI Summarizer"));

  const serviceId = svc?.id ?? 1;
  const txHash = generateStellarTxHash();

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      agentId: Number(agentId),
      serviceId,
      amountUsdc: "0.10",
      txHash,
      status: "confirmed",
      network: "testnet",
    })
    .returning();

  await db
    .update(agentsTable)
    .set({
      totalTransactions: agent.totalTransactions + 1,
      totalSpentUsdc: String(Number(agent.totalSpentUsdc) + 0.1),
    })
    .where(eq(agentsTable.id, agent.id));

  await db
    .update(servicesTable)
    .set({ totalCalls: (svc?.totalCalls ?? 0) + 1 })
    .where(eq(servicesTable.id, serviceId));

  res.json({
    summary,
    wordCount,
    paymentRecorded: true,
    paymentId: String(payment!.id),
  });
});

router.get("/services/:serviceId", async (req, res): Promise<void> => {
  const params = GetServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }
  const [svc] = await db
    .select()
    .from(servicesTable)
    .where(eq(servicesTable.id, Number(params.data.serviceId)));

  if (!svc) {
    res.status(404).json({ error: "not_found", message: "Service not found" });
    return;
  }
  res.json(formatService(svc));
});

export default router;
