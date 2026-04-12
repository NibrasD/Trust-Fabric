import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, sessionsTable, agentsTable } from "@workspace/db";
import {
  ListSessionsQueryParams,
  CreateSessionBody,
  GetSessionParams,
  RevokeSessionParams,
} from "@workspace/api-zod";
import { randomBytes } from "crypto";

const router: IRouter = Router();

function generateSessionToken(): string {
  return "stf_" + randomBytes(24).toString("hex");
}

async function formatSession(s: typeof sessionsTable.$inferSelect) {
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, s.agentId));
  return {
    id: String(s.id),
    agentId: String(s.agentId),
    agentName: agent?.name ?? "Unknown",
    sessionToken: s.sessionToken,
    maxSpendUsdc: Number(s.maxSpendUsdc),
    spentUsdc: Number(s.spentUsdc),
    allowedEndpoints: s.allowedEndpoints ?? [],
    expiresAt: s.expiresAt.toISOString(),
    status: s.status,
    createdAt: s.createdAt.toISOString(),
  };
}

async function expireOldSessions() {
  const now = new Date();
  const active = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.status, "active"));
  for (const s of active) {
    if (s.expiresAt < now) {
      await db
        .update(sessionsTable)
        .set({ status: "expired" })
        .where(eq(sessionsTable.id, s.id));
    }
  }
}

router.get("/sessions", async (req, res): Promise<void> => {
  await expireOldSessions();
  const qp = ListSessionsQueryParams.safeParse(req.query);
  const { agentId, status } = qp.success ? qp.data : {};

  const conditions = [];
  if (agentId) conditions.push(eq(sessionsTable.agentId, Number(agentId)));
  if (status) conditions.push(eq(sessionsTable.status, status));

  const rows = await db
    .select()
    .from(sessionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sessionsTable.createdAt);

  const sessions = await Promise.all(rows.map(formatSession));
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

  res.json(await formatSession(updated!));
});

export default router;
