import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, paymentsTable, agentsTable, servicesTable } from "@workspace/db";
import {
  ListPaymentsQueryParams,
  GetPaymentParams,
  GetPaymentVolumeQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function formatPayment(p: typeof paymentsTable.$inferSelect) {
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, p.agentId));
  const [svc] = await db.select().from(servicesTable).where(eq(servicesTable.id, p.serviceId));
  return {
    id: String(p.id),
    agentId: String(p.agentId),
    agentName: agent?.name ?? "Unknown",
    serviceId: String(p.serviceId),
    serviceName: svc?.name ?? "Unknown",
    sessionId: p.sessionId ? String(p.sessionId) : undefined,
    amountUsdc: Number(p.amountUsdc),
    txHash: p.txHash,
    status: p.status,
    network: p.network,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/payments", async (req, res): Promise<void> => {
  const qp = ListPaymentsQueryParams.safeParse(req.query);
  const { agentId, serviceId, limit = 20 } = qp.success ? qp.data : { limit: 20, agentId: undefined, serviceId: undefined };

  const conditions = [];
  if (agentId) conditions.push(eq(paymentsTable.agentId, Number(agentId)));
  if (serviceId) conditions.push(eq(paymentsTable.serviceId, Number(serviceId)));

  const payments = await db
    .select()
    .from(paymentsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(paymentsTable.createdAt))
    .limit(limit);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(paymentsTable);

  const mapped = await Promise.all(payments.map(formatPayment));
  res.json({ payments: mapped, total: count });
});

router.get("/payments/stats/volume", async (req, res): Promise<void> => {
  const qp = GetPaymentVolumeQueryParams.safeParse(req.query);
  const days = qp.success ? (qp.data.days ?? 7) : 7;

  const rows = await db
    .select({
      date: sql<string>`date_trunc('day', ${paymentsTable.createdAt})::date::text`,
      totalAmount: sql<number>`sum(${paymentsTable.amountUsdc}::numeric)::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(paymentsTable)
    .where(sql`${paymentsTable.createdAt} >= now() - interval '${sql.raw(String(days))} days'`)
    .groupBy(sql`date_trunc('day', ${paymentsTable.createdAt})`)
    .orderBy(sql`date_trunc('day', ${paymentsTable.createdAt})`);

  const [totals] = await db
    .select({
      totalVolume: sql<number>`sum(${paymentsTable.amountUsdc}::numeric)::float`,
      totalCount: sql<number>`count(*)::int`,
    })
    .from(paymentsTable);

  res.json({
    dailyVolume: rows.map((r) => ({
      date: r.date,
      totalAmount: r.totalAmount ?? 0,
      count: r.count,
    })),
    totalVolume: totals?.totalVolume ?? 0,
    totalCount: totals?.totalCount ?? 0,
  });
});

router.get("/payments/:paymentId", async (req, res): Promise<void> => {
  const params = GetPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.id, Number(params.data.paymentId)));

  if (!payment) {
    res.status(404).json({ error: "not_found", message: "Payment not found" });
    return;
  }
  res.json(await formatPayment(payment));
});

export default router;
