import { Router, type IRouter } from "express";
import { eq, desc, sql, lte, and } from "drizzle-orm";
import { db, servicesTable } from "@workspace/db";
import { Keypair } from "@stellar/stellar-sdk";
import {
  ListServicesQueryParams,
  RegisterServiceBody,
  GetServiceParams,
} from "@workspace/api-zod";
import { x402Middleware, type X402Request } from "../lib/x402Middleware.js";
import {
  PROTOCOL_FEE_ADDRESS,
  isValidStellarAddress,
} from "../lib/stellarPayments.js";
import { sorobanRecordPayment, sorobanEnabled } from "../lib/soroban.js";

const router: IRouter = Router();

// Service receiving address for the AI Summarizer.
// Priority: env SUMMARIZER_ADDRESS → valid PROTOCOL_FEE_ADDRESS → deterministic demo keypair
function getSummarizerPayTo(): string {
  const envAddr = process.env.SUMMARIZER_ADDRESS;
  if (envAddr && isValidStellarAddress(envAddr)) return envAddr;
  if (PROTOCOL_FEE_ADDRESS) return PROTOCOL_FEE_ADDRESS;
  // Derive a deterministic demo address (never used for real funds — just for the challenge spec)
  return Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
}

const SUMMARIZER_PAYTO = getSummarizerPayTo();

// Whether to verify payments on Horizon (set STELLAR_VERIFY_ONCHAIN=true in prod)
const VERIFY_ONCHAIN = process.env.STELLAR_VERIFY_ONCHAIN === "true";

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

/**
 * GET /services/paid/summarize
 * Returns the x402 payment challenge (402 Payment Required).
 * Clients should POST with X-PAYMENT header after submitting Stellar tx.
 */
router.get("/services/paid/summarize", async (req, res): Promise<void> => {
  const { buildX402Challenge } = await import("../lib/stellarPayments.js");
  res.status(402).json(
    buildX402Challenge({
      serviceAddress: SUMMARIZER_PAYTO,
      amountUsdc: 0.1,
      resource: `${req.protocol}://${req.get("host")}/api/services/paid/summarize`,
      description: "AI Summarizer — 0.10 USDC per request (MPP: 90% service, 10% protocol fee)",
    })
  );
});

/**
 * POST /services/paid/summarize
 * x402-protected AI text summarization endpoint.
 *
 * Requires X-PAYMENT header containing a Stellar transaction hash.
 * The middleware verifies the payment on Horizon before allowing access.
 *
 * Flow:
 *   1. Agent submits 0.10 USDC payment to SUMMARIZER_PAYTO on Stellar Testnet
 *   2. Agent includes tx hash in X-PAYMENT header
 *   3. Middleware verifies the payment via Horizon API
 *   4. On success, this handler summarizes the text and records the payment
 *
 * In development (STELLAR_VERIFY_ONCHAIN != "true"), any tx hash is accepted.
 */
router.post(
  "/services/paid/summarize",
  x402Middleware({
    payToAddress: SUMMARIZER_PAYTO,
    amountUsdc: 0.1,
    description: "AI Summarizer — 0.10 USDC per request",
    verifyOnChain: VERIFY_ONCHAIN,
  }),
  async (req, res): Promise<void> => {
    const x402Req = req as X402Request;
    const { text, agentId } = req.body as {
      text?: string;
      agentId?: string;
      sessionToken?: string;
    };

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

    // Accept agentId as numeric DB id OR as a Stellar address
    const numericId = Number(agentId);
    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(
        isNaN(numericId)
          ? eq(agentsTable.stellarAddress, agentId)
          : eq(agentsTable.id, numericId)
      );

    if (!agent) {
      res.status(404).json({ error: "not_found", message: "Agent not found" });
      return;
    }

    const [svc] = await db
      .select()
      .from(servicesTable)
      .where(eq(servicesTable.name, "AI Summarizer"));

    const serviceId = svc?.id ?? 1;

    // Use the verified tx hash from x402 middleware (or "dev_mode" fallback)
    const txHash = x402Req.x402Payment?.txHash ?? `dev_${Date.now().toString(16)}`;
    const fromAddress = x402Req.x402Payment?.fromAddress;
    const verifiedOnChain = x402Req.x402Payment?.verifiedOnChain ?? false;

    const [payment] = await db
      .insert(paymentsTable)
      .values({
        agentId: agent.id,
        serviceId,
        amountUsdc: "0.10",
        txHash,
        status: "confirmed",
        network: "testnet",
        ...(fromAddress && isValidStellarAddress(fromAddress) ? { fromAddress } : {}),
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

    // Fire-and-forget: record payment on Soroban Reputation contract
    // Only runs when SOROBAN_REPUTATION_CONTRACT_ID + SOROBAN_ADMIN_SECRET are set
    const amountStroops = BigInt(Math.round(0.1 * 10_000_000));
    sorobanRecordPayment(agent.stellarAddress, amountStroops).catch(() => {});

    res.json({
      summary,
      wordCount,
      paymentRecorded: true,
      paymentId: String(payment!.id),
      txHash,
      verifiedOnChain,
      mppEnabled: true,
      sorobanEnabled: sorobanEnabled(),
      payTo: SUMMARIZER_PAYTO,
    });
  }
);

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
