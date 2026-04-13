import { Router, type IRouter } from "express";
import { eq, and, lt } from "drizzle-orm";
import { db, sessionsTable, agentsTable } from "@workspace/db";
import {
  ListSessionsQueryParams,
  CreateSessionBody,
  GetSessionParams,
  RevokeSessionParams,
} from "@workspace/api-zod";
import { randomBytes } from "crypto";
import { sorobanCreateSession, sorobanRevokeSession } from "../lib/soroban.js";

const router: IRouter = Router();

function generateSessionToken(): string {
  return "stf_" + randomBytes(24).toString("hex");
}

function formatSessionRow(s: typeof sessionsTable.$inferSelect, agentName: string) {
  return {
    id: String(s.id),
    agentId: String(s.agentId),
    agentName,
    sessionToken: s.sessionToken,
    maxSpendUsdc: Number(s.maxSpendUsdc),
    spentUsdc: Number(s.spentUsdc),
    allowedEndpoints: s.allowedEndpoints ?? [],
    expiresAt: s.expiresAt.toISOString(),
    status: s.status,
    createdAt: s.createdAt.toISOString(),
  };
}

function expireOldSessionsAsync() {
  db.update(sessionsTable)
    .set({ status: "expired" })
    .where(and(eq(sessionsTable.status, "active"), lt(sessionsTable.expiresAt, new Date())))
    .catch(() => {});
}

router.get("/sessions", async (req, res): Promise<void> => {
  expireOldSessionsAsync();

  const qp = ListSessionsQueryParams.safeParse(req.query);
  const { agentId, status } = qp.success ? qp.data : {};

  const conditions = [];
  if (agentId) conditions.push(eq(sessionsTable.agentId, Number(agentId)));
  if (status) conditions.push(eq(sessionsTable.status, status));

  const rows = await db
    .select({
      session: sessionsTable,
      agentName: agentsTable.name,
    })
    .from(sessionsTable)
    .leftJoin(agentsTable, eq(sessionsTable.agentId, agentsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sessionsTable.createdAt);

  const sessions = rows.map((r) => formatSessionRow(r.session, r.agentName ?? "Unknown"));
  res.json({ sessions });
});

router.post("/sessions", async (req, res): Promise<void> => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", message: parsed.error.message });
    return;
  }
  const { agentId, maxSpendUsdc, durationMinutes, allowedEndpoints } = parsed.data;

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, Number(agentId)));
  if (!agent) {
    res.status(404).json({ error: "not_found", message: "Agent not found" });
    return;
  }

  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  const sessionToken = generateSessionToken();

  const [session] = await db
    .insert(sessionsTable)
    .values({
      agentId: Number(agentId),
      sessionToken,
      maxSpendUsdc: String(maxSpendUsdc),
      allowedEndpoints,
      expiresAt,
      status: "active",
    })
    .returning();

  // Fire-and-forget: register session policy on Soroban contract
  sorobanCreateSession(
    sessionToken,
    agent.stellarAddress,
    BigInt(Math.round(maxSpendUsdc * 1_000_000)),
    durationMinutes * 60
  ).catch(() => {});

  res.status(201).json(await formatSession(session!));
});

router.get("/sessions/:sessionId", async (req, res): Promise<void> => {
  await expireOldSessions();
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, Number(params.data.sessionId)));

  if (!session) {
    res.status(404).json({ error: "not_found", message: "Session not found" });
    return;
  }
  res.json(await formatSession(session));
});

router.post("/sessions/:sessionId/revoke", async (req, res): Promise<void> => {
  const params = RevokeSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "bad_request", message: params.error.message });
    return;
  }
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, Number(params.data.sessionId)));

  if (!session) {
    res.status(404).json({ error: "not_found", message: "Session not found" });
    return;
  }
  const [updated] = await db
    .update(sessionsTable)
    .set({ status: "revoked" })
    .where(eq(sessionsTable.id, session.id))
    .returning();

  // Fire-and-forget: clear session policy on Soroban contract
  sorobanRevokeSession(session.sessionToken).catch(() => {});

  res.json(await formatSession(updated!));
});

export default router;
