import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, proxiesTable } from "@workspace/db";
import { x402Middleware, type X402Request } from "../lib/x402Middleware.js";
import { isValidStellarAddress, PROTOCOL_FEE_ADDRESS } from "../lib/stellarPayments.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function formatProxy(p: typeof proxiesTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    targetUrl: p.targetUrl,
    httpMethod: p.httpMethod,
    amountUsdc: p.amountUsdc,
    variables: p.variables,
    isActive: p.isActive,
    totalCalls: p.totalCalls,
    createdAt: p.createdAt,
  };
}

router.get("/proxies", async (_req, res): Promise<void> => {
  const proxies = await db
    .select()
    .from(proxiesTable)
    .where(eq(proxiesTable.isActive, true))
    .orderBy(desc(proxiesTable.createdAt));
  res.json(proxies.map(formatProxy));
});

router.get("/proxies/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid proxy id" });
    return;
  }
  const [proxy] = await db.select().from(proxiesTable).where(eq(proxiesTable.id, id));
  if (!proxy) {
    res.status(404).json({ error: "not_found", message: "Proxy not found" });
    return;
  }
  res.json(formatProxy(proxy));
});

router.post("/proxies", async (req, res): Promise<void> => {
  const { name, description, targetUrl, httpMethod, amountUsdc, variables } = req.body as {
    name?: string;
    description?: string;
    targetUrl?: string;
    httpMethod?: string;
    amountUsdc?: string | number;
    variables?: unknown;
  };

  if (!name || !targetUrl) {
    res.status(400).json({ error: "bad_request", message: "name and targetUrl are required" });
    return;
  }

  try {
    new URL(targetUrl);
  } catch {
    res.status(400).json({ error: "bad_request", message: "targetUrl must be a valid URL" });
    return;
  }

  const [proxy] = await db
    .insert(proxiesTable)
    .values({
      name,
      description: description ?? null,
      targetUrl,
      httpMethod: httpMethod ?? "POST",
      amountUsdc: String(amountUsdc ?? "0.10"),
      variables: (variables as typeof proxiesTable.$inferSelect["variables"]) ?? null,
      isActive: true,
    })
    .returning();

  logger.info({ proxyId: proxy.id, name: proxy.name }, "Proxy created");
  res.status(201).json(formatProxy(proxy));
});

router.delete("/proxies/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid proxy id" });
    return;
  }
  await db.update(proxiesTable).set({ isActive: false }).where(eq(proxiesTable.id, id));
  res.json({ success: true });
});

const ADMIN_PAYTO = process.env.SUMMARIZER_ADDRESS ?? PROTOCOL_FEE_ADDRESS ?? "";

router.post(
  "/proxy/:id",
  x402Middleware({
    payToAddress: ADMIN_PAYTO,
    amountUsdc: 0.05,
    description: "API Proxy call",
    verifyOnChain: false,
  }),
  async (req, res): Promise<void> => {
    const x402Req = req as X402Request;
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "bad_request", message: "Invalid proxy id" });
      return;
    }

    const [proxy] = await db.select().from(proxiesTable).where(eq(proxiesTable.id, id));
    if (!proxy || !proxy.isActive) {
      res.status(404).json({ error: "not_found", message: "Proxy not found" });
      return;
    }

    try {
      const resp = await fetch(proxy.targetUrl, {
        method: proxy.httpMethod,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "StellarAgentTrustFabric/1.0",
        },
        body: proxy.httpMethod !== "GET" && proxy.httpMethod !== "HEAD"
          ? JSON.stringify(req.body)
          : undefined,
      });

      await db
        .update(proxiesTable)
        .set({ updatedAt: new Date() })
        .where(eq(proxiesTable.id, id));

      const contentType = resp.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await resp.json();
        res.status(resp.status).json({
          data,
          proxyId: id,
          txHash: x402Req.x402Payment?.txHash,
        });
      } else {
        const text = await resp.text();
        res.status(resp.status).json({
          data: text,
          proxyId: id,
          txHash: x402Req.x402Payment?.txHash,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ proxyId: id, error: msg }, "Proxy call failed");
      res.status(502).json({ error: "proxy_error", message: msg });
    }
  }
);

export default router;
