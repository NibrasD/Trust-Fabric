import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, workflowsTable, workflowExecutionsTable, proxiesTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

function formatWorkflow(w: typeof workflowsTable.$inferSelect) {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    isPublic: w.isPublic,
    steps: w.steps,
    inputSchema: w.inputSchema,
    createdAt: w.createdAt,
  };
}

router.get("/workflows", async (_req, res): Promise<void> => {
  const workflows = await db
    .select()
    .from(workflowsTable)
    .orderBy(desc(workflowsTable.createdAt));
  res.json(workflows.map(formatWorkflow));
});

router.get("/workflows/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid workflow id" });
    return;
  }
  const [workflow] = await db.select().from(workflowsTable).where(eq(workflowsTable.id, id));
  if (!workflow) {
    res.status(404).json({ error: "not_found", message: "Workflow not found" });
    return;
  }
  res.json(formatWorkflow(workflow));
});

router.post("/workflows", async (req, res): Promise<void> => {
  const { name, description, isPublic, steps, inputSchema } = req.body as {
    name?: string;
    description?: string;
    isPublic?: boolean;
    steps?: typeof workflowsTable.$inferSelect["steps"];
    inputSchema?: typeof workflowsTable.$inferSelect["inputSchema"];
  };

  if (!name) {
    res.status(400).json({ error: "bad_request", message: "name is required" });
    return;
  }

  const [workflow] = await db
    .insert(workflowsTable)
    .values({
      name,
      description: description ?? null,
      isPublic: isPublic ?? false,
      steps: steps ?? [],
      inputSchema: inputSchema ?? null,
    })
    .returning();

  logger.info({ workflowId: workflow.id, name: workflow.name }, "Workflow created");
  res.status(201).json(formatWorkflow(workflow));
});

router.delete("/workflows/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(workflowsTable).where(eq(workflowsTable.id, id));
  res.json({ success: true });
});

router.post("/workflows/:id/execute", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "bad_request", message: "Invalid workflow id" });
    return;
  }

  const [workflow] = await db.select().from(workflowsTable).where(eq(workflowsTable.id, id));
  if (!workflow) {
    res.status(404).json({ error: "not_found", message: "Workflow not found" });
    return;
  }

  const input: Record<string, unknown> = req.body?.input ?? {};
  const startTime = Date.now();

  const [execution] = await db
    .insert(workflowExecutionsTable)
    .values({
      workflowId: id,
      agentId: req.body?.agentId ? Number(req.body.agentId) : null,
      status: "running",
      input,
    })
    .returning();

  const stepResults: Record<string, unknown> = {};

  // Always use localhost for self-calls — external URL doesn't work on Render
  const apiBaseUrl = `http://localhost:${process.env.PORT ?? 8080}`;

  let ctx: Record<string, unknown> = {
    API_BASE: apiBaseUrl,
    ...input,
  };
  let error: string | undefined;

  try {
    for (const step of workflow.steps ?? []) {
      logger.info({ stepId: step.id, stepType: step.type }, "Executing workflow step");

      if (step.type === "http") {
        const config = step.config as {
          url?: string;
          method?: string;
          body?: unknown;
          proxyId?: number;
        };

        let targetUrl = config.url ?? "";
        let method = config.method ?? "POST";
        let body: unknown = config.body;

        if (config.proxyId) {
          const [proxy] = await db.select().from(proxiesTable)
            .where(eq(proxiesTable.id, config.proxyId));
          if (proxy) {
            targetUrl = proxy.targetUrl;
            method = proxy.httpMethod;
          }
        }

        targetUrl = interpolate(targetUrl, ctx);
        if (typeof body === "string") body = interpolate(body, ctx);

        const resp = await fetch(targetUrl, {
          method,
          headers: { "Content-Type": "application/json" },
          body: method !== "GET" ? JSON.stringify(body) : undefined,
        });

        const data = resp.headers.get("content-type")?.includes("application/json")
          ? await resp.json()
          : await resp.text();

        stepResults[step.id] = { status: resp.status, data };
        if (step.outputAs) ctx[step.outputAs] = data;

      } else if (step.type === "payment") {
        const config = step.config as { amountUsdc?: number; toAddress?: string; memo?: string };
        stepResults[step.id] = {
          type: "payment",
          amountUsdc: config.amountUsdc ?? 0.1,
          toAddress: config.toAddress,
          memo: config.memo,
          note: "Payment step requires agent wallet integration",
        };

      } else if (step.type === "onchain") {
        const config = step.config as { contract?: string; method?: string; args?: unknown };
        stepResults[step.id] = {
          type: "onchain",
          contract: config.contract,
          method: config.method,
          note: "On-chain step recorded for Soroban execution",
        };
      }
    }

    const durationMs = Date.now() - startTime;
    await db
      .update(workflowExecutionsTable)
      .set({ status: "completed", output: ctx, stepResults, durationMs, updatedAt: new Date() })
      .where(eq(workflowExecutionsTable.id, execution.id));

    res.json({
      executionId: execution.id,
      workflowId: id,
      status: "completed",
      output: ctx,
      stepResults,
      durationMs,
    });

  } catch (err: unknown) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(workflowExecutionsTable)
      .set({ status: "failed", error, updatedAt: new Date() })
      .where(eq(workflowExecutionsTable.id, execution.id));

    res.status(500).json({ error: "execution_failed", message: error });
  }
});

router.get("/workflows/:id/executions", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const executions = await db
    .select()
    .from(workflowExecutionsTable)
    .where(eq(workflowExecutionsTable.workflowId, id))
    .orderBy(desc(workflowExecutionsTable.createdAt))
    .limit(20);
  res.json(executions);
});

function interpolate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => String(ctx[key] ?? ""));
}

export default router;
