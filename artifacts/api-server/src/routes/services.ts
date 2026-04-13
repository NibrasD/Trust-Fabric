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

// ── Helper: record a service payment to DB ────────────────────────────────────
async function recordServicePayment(opts: {
  req: X402Request;
  agentId: string | null;
  serviceEndpoint: string;
  amountUsdc: number;
}) {
  const { req: x402Req, agentId, serviceEndpoint, amountUsdc } = opts;
  const { paymentsTable, agentsTable } = await import("@workspace/db");

  const [svc] = await db
    .select()
    .from(servicesTable)
    .where(eq(servicesTable.endpoint, serviceEndpoint));

  const numericAgentId = agentId ? Number(agentId) : null;
  const [agent] = numericAgentId
    ? await db.select().from(agentsTable).where(eq(agentsTable.id, numericAgentId))
    : [null];

  const txHash =
    x402Req.x402Payment?.txHash ?? `dev_${Date.now().toString(16)}`;
  const fromAddress = x402Req.x402Payment?.fromAddress;
  const verifiedOnChain = x402Req.x402Payment?.verifiedOnChain ?? false;

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      agentId: agent?.id ?? 1,
      serviceId: svc?.id ?? 1,
      amountUsdc: String(amountUsdc),
      txHash,
      status: "confirmed",
      network: "testnet",
      ...(fromAddress && isValidStellarAddress(fromAddress) ? { fromAddress } : {}),
    })
    .returning();

  if (agent) {
    await db
      .update(agentsTable)
      .set({
        totalTransactions: agent.totalTransactions + 1,
        totalSpentUsdc: String(Number(agent.totalSpentUsdc) + amountUsdc),
      })
      .where(eq(agentsTable.id, agent.id));
  }

  if (svc) {
    await db
      .update(servicesTable)
      .set({ totalCalls: svc.totalCalls + 1 })
      .where(eq(servicesTable.id, svc.id));
  }

  return { payment, txHash, verifiedOnChain, svc };
}

// ── Market Data Feed ──────────────────────────────────────────────────────────
router.get("/services/market/data", async (req, res): Promise<void> => {
  const { buildX402Challenge } = await import("../lib/stellarPayments.js");
  const [svc] = await db.select().from(servicesTable).where(eq(servicesTable.endpoint, "/api/services/market/data"));
  res.status(402).json(
    buildX402Challenge({
      serviceAddress: svc?.ownerAddress ?? SUMMARIZER_PAYTO,
      amountUsdc: Number(svc?.priceUsdc ?? 0.05),
      resource: `${req.protocol}://${req.get("host")}/api/services/market/data`,
      description: "Market Data Feed — 0.05 USDC per request",
    })
  );
});

router.post(
  "/services/market/data",
  x402Middleware({ payToAddress: SUMMARIZER_PAYTO, amountUsdc: 0.05, description: "Market Data Feed", verifyOnChain: VERIFY_ONCHAIN }),
  async (req, res): Promise<void> => {
    const x402Req = req as X402Request;
    const { agentId } = req.body as { agentId?: string };

    try {
      const [priceResp, horizonResp] = await Promise.allSettled([
        fetch("https://api.coingecko.com/api/v3/simple/price?ids=stellar,bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true"),
        fetch("https://horizon.stellar.org/order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=USDC&buying_asset_issuer=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN&limit=5"),
      ]);

      const prices = priceResp.status === "fulfilled" && priceResp.value.ok
        ? await priceResp.value.json()
        : { stellar: { usd: 0.11, usd_24h_change: 0 }, bitcoin: { usd: 68000, usd_24h_change: 0 } };

      const orderBook = horizonResp.status === "fulfilled" && horizonResp.value.ok
        ? await horizonResp.value.json()
        : { bids: [], asks: [] };

      const xlmUsd = prices?.stellar?.usd ?? 0.11;
      const xlm24h = prices?.stellar?.usd_24h_change ?? 0;
      const btcUsd = prices?.bitcoin?.usd ?? 68000;
      const ethUsd = prices?.ethereum?.usd ?? 3400;

      const topBid = orderBook.bids?.[0] ?? { price: "0", amount: "0" };
      const topAsk = orderBook.asks?.[0] ?? { price: "0", amount: "0" };

      const { payment, txHash, verifiedOnChain } = await recordServicePayment({
        req: x402Req, agentId: agentId ?? null,
        serviceEndpoint: "/api/services/market/data", amountUsdc: 0.05,
      });

      res.json({
        timestamp: new Date().toISOString(),
        network: "stellar-testnet",
        prices: {
          XLM: { usd: xlmUsd, change24h: Number(xlm24h.toFixed(2)) },
          BTC: { usd: btcUsd, change24h: Number((prices?.bitcoin?.usd_24h_change ?? 0).toFixed(2)) },
          ETH: { usd: ethUsd, change24h: Number((prices?.ethereum?.usd_24h_change ?? 0).toFixed(2)) },
        },
        stellarDex: {
          pair: "XLM/USDC",
          topBid: { price: topBid.price, amount: topBid.amount },
          topAsk: { price: topAsk.price, amount: topAsk.amount },
          spread: topAsk.price && topBid.price
            ? (Number(topAsk.price) - Number(topBid.price)).toFixed(7)
            : "n/a",
        },
        paymentRecorded: true,
        paymentId: String(payment?.id),
        txHash,
        verifiedOnChain,
      });
    } catch (err) {
      res.status(500).json({ error: "service_error", message: String(err) });
    }
  }
);

// ── Web Scraper Pro ───────────────────────────────────────────────────────────
router.get("/services/scraper", async (req, res): Promise<void> => {
  const { buildX402Challenge } = await import("../lib/stellarPayments.js");
  const [svc] = await db.select().from(servicesTable).where(eq(servicesTable.endpoint, "/api/services/scraper"));
  res.status(402).json(
    buildX402Challenge({
      serviceAddress: svc?.ownerAddress ?? SUMMARIZER_PAYTO,
      amountUsdc: Number(svc?.priceUsdc ?? 0.08),
      resource: `${req.protocol}://${req.get("host")}/api/services/scraper`,
      description: "Web Scraper Pro — 0.08 USDC per URL",
    })
  );
});

router.post(
  "/services/scraper",
  x402Middleware({ payToAddress: SUMMARIZER_PAYTO, amountUsdc: 0.08, description: "Web Scraper Pro", verifyOnChain: VERIFY_ONCHAIN }),
  async (req, res): Promise<void> => {
    const x402Req = req as X402Request;
    const { url, agentId } = req.body as { url?: string; agentId?: string };

    if (!url) {
      res.status(400).json({ error: "bad_request", message: "url is required" });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      res.status(400).json({ error: "bad_request", message: "Invalid URL" });
      return;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        headers: { "User-Agent": "TrustFabric-Scraper/1.0 (x402-gated)" },
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        res.status(502).json({ error: "fetch_failed", message: `Remote returned ${resp.status}` });
        return;
      }

      const html = await resp.text();
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? "No title";
      const description = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim() ?? "";
      const bodyText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2000);
      const links = (html.match(/href=["']([^"'#?]+)["']/gi) ?? [])
        .map((h) => h.replace(/href=["']/i, "").replace(/["']/, ""))
        .filter((l) => l.startsWith("http"))
        .slice(0, 10);
      const wordCount = bodyText.split(/\s+/).length;

      const { payment, txHash, verifiedOnChain } = await recordServicePayment({
        req: x402Req, agentId: agentId ?? null,
        serviceEndpoint: "/api/services/scraper", amountUsdc: 0.08,
      });

      res.json({
        url: parsedUrl.toString(),
        title,
        description,
        bodyText,
        wordCount,
        links,
        scrapedAt: new Date().toISOString(),
        paymentRecorded: true,
        paymentId: String(payment?.id),
        txHash,
        verifiedOnChain,
      });
    } catch (err) {
      res.status(502).json({ error: "fetch_failed", message: String(err) });
    }
  }
);

// ── Soroban Code Auditor ──────────────────────────────────────────────────────
router.get("/services/audit", async (req, res): Promise<void> => {
  const { buildX402Challenge } = await import("../lib/stellarPayments.js");
  const [svc] = await db.select().from(servicesTable).where(eq(servicesTable.endpoint, "/api/services/audit"));
  res.status(402).json(
    buildX402Challenge({
      serviceAddress: svc?.ownerAddress ?? SUMMARIZER_PAYTO,
      amountUsdc: Number(svc?.priceUsdc ?? 0.5),
      resource: `${req.protocol}://${req.get("host")}/api/services/audit`,
      description: "Soroban Code Auditor — 0.50 USDC per audit",
    })
  );
});

router.post(
  "/services/audit",
  x402Middleware({ payToAddress: SUMMARIZER_PAYTO, amountUsdc: 0.5, description: "Soroban Code Auditor", verifyOnChain: VERIFY_ONCHAIN }),
  async (req, res): Promise<void> => {
    const x402Req = req as X402Request;
    const { code, agentId } = req.body as { code?: string; agentId?: string };

    if (!code) {
      res.status(400).json({ error: "bad_request", message: "code is required" });
      return;
    }

    const findings: Array<{ severity: string; rule: string; description: string; line?: number }> = [];

    const rules: Array<{ pattern: RegExp; severity: string; rule: string; description: string }> = [
      { pattern: /panic!/g, severity: "HIGH", rule: "UNHANDLED_PANIC", description: "Direct panic! calls abort the contract and waste gas. Use Result<T, E> instead." },
      { pattern: /unwrap\(\)/g, severity: "HIGH", rule: "UNWRAP_WITHOUT_CONTEXT", description: "unwrap() panics on None/Err. Use ok_or() or expect() with context." },
      { pattern: /unsafe\s*\{/g, severity: "CRITICAL", rule: "UNSAFE_BLOCK", description: "Unsafe blocks bypass Rust safety guarantees. Avoid in Soroban contracts." },
      { pattern: /overflow|wrapping_add|saturating/gi, severity: "MEDIUM", rule: "ARITHMETIC_OVERFLOW_CHECK", description: "Ensure arithmetic operations handle overflow correctly on i128/u128." },
      { pattern: /env\.storage\(\)\.instance\(\)/g, severity: "INFO", rule: "INSTANCE_STORAGE_USAGE", description: "Instance storage is shared per contract invocation. Ensure key uniqueness." },
      { pattern: /env\.storage\(\)\.persistent\(\)/g, severity: "INFO", rule: "PERSISTENT_STORAGE", description: "Persistent storage has TTL. Set appropriate expiry to avoid data loss." },
      { pattern: /require_auth\(\)/g, severity: "INFO", rule: "AUTH_CHECK_PRESENT", description: "Authentication check detected. Verify all privileged functions call require_auth." },
      { pattern: /todo!\(\)|unimplemented!\(\)/g, severity: "HIGH", rule: "INCOMPLETE_IMPLEMENTATION", description: "Placeholder macros found. Remove before deployment." },
    ];

    const lines = code.split("\n");
    for (const rule of rules) {
      for (let i = 0; i < lines.length; i++) {
        if (rule.pattern.test(lines[i]!)) {
          findings.push({ ...rule, line: i + 1 });
        }
        rule.pattern.lastIndex = 0;
      }
    }

    const criticalCount = findings.filter((f) => f.severity === "CRITICAL").length;
    const highCount = findings.filter((f) => f.severity === "HIGH").length;
    const score = Math.max(0, 100 - criticalCount * 30 - highCount * 10 - findings.filter((f) => f.severity === "MEDIUM").length * 3);

    const { payment, txHash, verifiedOnChain } = await recordServicePayment({
      req: x402Req, agentId: agentId ?? null,
      serviceEndpoint: "/api/services/audit", amountUsdc: 0.5,
    });

    res.json({
      auditedAt: new Date().toISOString(),
      linesAnalyzed: lines.length,
      securityScore: score,
      verdict: score >= 80 ? "PASS" : score >= 50 ? "REVIEW" : "FAIL",
      findings,
      summary: findings.length === 0
        ? "No issues detected. Contract appears safe for deployment."
        : `Found ${findings.length} issue(s): ${criticalCount} critical, ${highCount} high. Review before deploying.`,
      paymentRecorded: true,
      paymentId: String(payment?.id),
      txHash,
      verifiedOnChain,
    });
  }
);

// ── Stellar Pathfinder ────────────────────────────────────────────────────────
router.get("/services/pathfinder", async (req, res): Promise<void> => {
  const { buildX402Challenge } = await import("../lib/stellarPayments.js");
  const [svc] = await db.select().from(servicesTable).where(eq(servicesTable.endpoint, "/api/services/pathfinder"));
  res.status(402).json(
    buildX402Challenge({
      serviceAddress: svc?.ownerAddress ?? SUMMARIZER_PAYTO,
      amountUsdc: Number(svc?.priceUsdc ?? 0.02),
      resource: `${req.protocol}://${req.get("host")}/api/services/pathfinder`,
      description: "Stellar Pathfinder — 0.02 USDC per query",
    })
  );
});

router.post(
  "/services/pathfinder",
  x402Middleware({ payToAddress: SUMMARIZER_PAYTO, amountUsdc: 0.02, description: "Stellar Pathfinder", verifyOnChain: VERIFY_ONCHAIN }),
  async (req, res): Promise<void> => {
    const x402Req = req as X402Request;
    const { sourceAddress, destinationAddress, destinationAmount, destinationAsset, agentId } = req.body as {
      sourceAddress?: string;
      destinationAddress?: string;
      destinationAmount?: string;
      destinationAsset?: string;
      agentId?: string;
    };

    const srcAddr = sourceAddress ?? "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3ZNA5N5AABC";
    const dstAmount = destinationAmount ?? "10";
    const dstAsset = destinationAsset ?? "native";

    try {
      const baseUrl = "https://horizon.stellar.org/paths/strict-receive";
      const params = new URLSearchParams({
        source_account: srcAddr,
        destination_amount: dstAmount,
        destination_asset_type: dstAsset === "native" ? "native" : "credit_alphanum4",
        ...(dstAsset !== "native" ? {
          destination_asset_code: dstAsset,
          destination_asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        } : {}),
      });

      const horizonResp = await fetch(`${baseUrl}?${params}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });

      const pathData = horizonResp.ok ? await horizonResp.json() : { _embedded: { records: [] } };
      const paths = pathData._embedded?.records ?? [];

      const { payment, txHash, verifiedOnChain } = await recordServicePayment({
        req: x402Req, agentId: agentId ?? null,
        serviceEndpoint: "/api/services/pathfinder", amountUsdc: 0.02,
      });

      res.json({
        queriedAt: new Date().toISOString(),
        sourceAddress: srcAddr,
        destinationAmount: dstAmount,
        destinationAsset: dstAsset,
        pathsFound: paths.length,
        paths: paths.slice(0, 5).map((p: any) => ({
          sourceAmount: p.source_amount,
          sourceAsset: p.source_asset_type === "native" ? "XLM" : p.source_asset_code,
          intermediateAssets: (p.path ?? []).map((a: any) =>
            a.asset_type === "native" ? "XLM" : a.asset_code
          ),
          destinationAmount: p.destination_amount,
        })),
        recommendation: paths.length > 0
          ? `Best path: ${paths[0]?.source_amount} ${paths[0]?.source_asset_type === "native" ? "XLM" : paths[0]?.source_asset_code} → ${dstAmount} ${dstAsset}`
          : "No paths found for this route on Stellar Testnet.",
        paymentRecorded: true,
        paymentId: String(payment?.id),
        txHash,
        verifiedOnChain,
      });
    } catch (err) {
      res.status(502).json({ error: "horizon_error", message: String(err) });
    }
  }
);

// ── Sentiment Oracle ──────────────────────────────────────────────────────────
router.get("/services/sentiment", async (req, res): Promise<void> => {
  const { buildX402Challenge } = await import("../lib/stellarPayments.js");
  const [svc] = await db.select().from(servicesTable).where(eq(servicesTable.endpoint, "/api/services/sentiment"));
  res.status(402).json(
    buildX402Challenge({
      serviceAddress: svc?.ownerAddress ?? SUMMARIZER_PAYTO,
      amountUsdc: Number(svc?.priceUsdc ?? 0.15),
      resource: `${req.protocol}://${req.get("host")}/api/services/sentiment`,
      description: "Sentiment Oracle — 0.15 USDC per analysis",
    })
  );
});

router.post(
  "/services/sentiment",
  x402Middleware({ payToAddress: SUMMARIZER_PAYTO, amountUsdc: 0.15, description: "Sentiment Oracle", verifyOnChain: VERIFY_ONCHAIN }),
  async (req, res): Promise<void> => {
    const x402Req = req as X402Request;
    const { text, agentId } = req.body as { text?: string; agentId?: string };

    if (!text) {
      res.status(400).json({ error: "bad_request", message: "text is required" });
      return;
    }

    const lower = text.toLowerCase();
    const bullishTerms = ["bullish", "moon", "rally", "surge", "breakout", "pump", "ath", "growth", "gain", "up", "rise", "buy", "strong", "positive", "optimistic", "recovery", "adoption", "innovation"];
    const bearishTerms = ["bearish", "crash", "dump", "drop", "fall", "sell", "weak", "negative", "pessimistic", "decline", "loss", "down", "risk", "fear", "panic", "correction", "bear"];
    const neutralTerms = ["stable", "sideways", "flat", "consolidation", "neutral", "hold", "wait", "unclear"];

    const bullishScore = bullishTerms.filter((t) => lower.includes(t)).length;
    const bearishScore = bearishTerms.filter((t) => lower.includes(t)).length;
    const neutralScore = neutralTerms.filter((t) => lower.includes(t)).length;
    const total = bullishScore + bearishScore + neutralScore || 1;

    const bullishPct = Math.round((bullishScore / total) * 100);
    const bearishPct = Math.round((bearishScore / total) * 100);
    const neutralPct = Math.max(0, 100 - bullishPct - bearishPct);

    let verdict: string;
    let confidence: number;
    if (bullishScore > bearishScore && bullishScore > neutralScore) {
      verdict = "BULLISH";
      confidence = Math.round((bullishScore / total) * 100);
    } else if (bearishScore > bullishScore && bearishScore > neutralScore) {
      verdict = "BEARISH";
      confidence = Math.round((bearishScore / total) * 100);
    } else {
      verdict = "NEUTRAL";
      confidence = Math.round(Math.max(neutralPct, 40));
    }

    const matchedBullish = bullishTerms.filter((t) => lower.includes(t));
    const matchedBearish = bearishTerms.filter((t) => lower.includes(t));

    const { payment, txHash, verifiedOnChain } = await recordServicePayment({
      req: x402Req, agentId: agentId ?? null,
      serviceEndpoint: "/api/services/sentiment", amountUsdc: 0.15,
    });

    res.json({
      analyzedAt: new Date().toISOString(),
      text: text.slice(0, 200),
      verdict,
      confidence,
      scores: { bullish: bullishPct, bearish: bearishPct, neutral: neutralPct },
      signals: { bullish: matchedBullish, bearish: matchedBearish },
      wordCount: text.split(/\s+/).length,
      paymentRecorded: true,
      paymentId: String(payment?.id),
      txHash,
      verifiedOnChain,
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
