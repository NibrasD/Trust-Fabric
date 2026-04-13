/**
 * MCP (Model Context Protocol) Server endpoint
 * Exposes Trust Fabric capabilities as MCP tools so AI agents
 * (Claude, Cursor, etc.) can discover and call them directly.
 *
 * Protocol: JSON-RPC 2.0 over HTTP POST
 * Spec: https://spec.modelcontextprotocol.io/specification/2024-11-05/
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db, agentsTable, proxiesTable, workflowsTable, sessionsTable } from "@workspace/db";
import { eq, desc, and, gt } from "drizzle-orm";
import {
  buildMppPaymentTransaction,
  submitTransaction,
  isValidStellarAddress,
  PROTOCOL_FEE_ADDRESS,
} from "../lib/stellarPayments.js";
import { Keypair } from "@stellar/stellar-sdk";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const SERVER_INFO = { name: "stellar-trust-fabric", version: "1.0.0" };
const PROTOCOL_VERSION = "2024-11-05";
const SUMMARIZER_PAYTO =
  process.env.SUMMARIZER_ADDRESS ?? PROTOCOL_FEE_ADDRESS ?? "";
const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8080";

// ─── Tool Definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "summarize_text",
    description:
      "Summarize a piece of text using the Trust Fabric AI Summarizer. Requires 0.10 USDC x402 payment on Stellar. Set STELLAR_SECRET in env for auto-payment.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The text to summarize" },
        agentId: { type: "string", description: "Your Stellar address or numeric agent ID" },
      },
      required: ["text"],
    },
  },
  {
    name: "list_services",
    description: "List all available x402-gated services on Trust Fabric.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_proxies",
    description: "List all published API proxies on the Trust Fabric marketplace.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_workflows",
    description: "List all available automation workflows.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "execute_workflow",
    description: "Execute a workflow by ID. Runs all steps (HTTP, payment, on-chain) in sequence.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "number", description: "Workflow ID to execute" },
        input: { type: "object", description: "Input variables for the workflow" },
        agentId: { type: "string", description: "Your agent ID (optional)" },
      },
      required: ["workflowId"],
    },
  },
  {
    name: "register_agent",
    description: "Register a new agent on Trust Fabric with a Stellar address.",
    inputSchema: {
      type: "object",
      properties: {
        stellarAddress: { type: "string", description: "Your Stellar public key (G...)" },
        name: { type: "string", description: "Agent display name" },
        description: { type: "string", description: "Agent description" },
      },
      required: ["stellarAddress", "name"],
    },
  },
  {
    name: "get_agent_reputation",
    description: "Get the on-chain reputation score and stats for a Stellar address.",
    inputSchema: {
      type: "object",
      properties: {
        stellarAddress: { type: "string", description: "Stellar public key (G...)" },
      },
      required: ["stellarAddress"],
    },
  },
  {
    name: "create_session",
    description: "Create a scoped session key with a spend cap and time limit for bounded agent access.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "number", description: "Numeric agent ID" },
        spendLimitUsdc: { type: "number", description: "Maximum USDC spend (default: 1.00)" },
        expiresInHours: { type: "number", description: "Session lifetime in hours (default: 24)" },
      },
      required: ["agentId"],
    },
  },
  {
    name: "verify_payment",
    description: "Verify a Stellar USDC payment transaction for x402 access.",
    inputSchema: {
      type: "object",
      properties: {
        txHash: { type: "string", description: "64-char hex transaction hash" },
        payTo: { type: "string", description: "Expected recipient Stellar address" },
        minAmount: { type: "number", description: "Minimum required USDC amount" },
      },
      required: ["txHash"],
    },
  },
  {
    name: "create_account",
    description: "Create a new funded Stellar testnet account with 10 USDC for testing.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ─── Tool Handlers ────────────────────────────────────────────────────────────

async function callTool(
  name: string,
  args: Record<string, unknown>,
  stellarSecret?: string
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {

  const ok = (text: string) => ({ content: [{ type: "text", text }] });
  const err = (msg: string) => ({ content: [{ type: "text", text: `Error: ${msg}` }], isError: true });

  // Auto-pay helper: build + submit a Stellar USDC payment
  // Enforces session key validation — no payment without an active session with sufficient budget
  async function autoPay(toAddress: string, amountUsdc: number): Promise<string | null> {
    if (!stellarSecret) return null;
    try {
      const fromKp = Keypair.fromSecret(stellarSecret);
      const agentAddress = fromKp.publicKey();

      // Look up the agent's active session with sufficient budget
      const now = new Date();
      const [agent] = await db
        .select()
        .from(agentsTable)
        .where(eq(agentsTable.stellarAddress, agentAddress));
      if (!agent) {
        logger.warn({ tool: name, agentAddress }, "MCP auto-pay blocked: no registered agent for this key");
        return null;
      }

      const [session] = await db
        .select()
        .from(sessionsTable)
        .where(
          and(
            eq(sessionsTable.agentId, agent.id),
            eq(sessionsTable.status, "active"),
            gt(sessionsTable.expiresAt, now)
          )
        )
        .orderBy(desc(sessionsTable.createdAt))
        .limit(1);

      if (!session) {
        logger.warn({ tool: name, agentId: agent.id }, "MCP auto-pay blocked: session_required — no active session for agent");
        return null;
      }

      const remaining = Number(session.maxSpendUsdc) - Number(session.spentUsdc);
      if (amountUsdc > remaining) {
        logger.warn({ tool: name, agentId: agent.id, amountUsdc, remaining }, "MCP auto-pay blocked: session_budget_exceeded");
        return null;
      }

      const { xdr } = await buildMppPaymentTransaction({
        fromKeypair: fromKp,
        serviceAddress: toAddress,
        amountUsdc,
      });
      const result = await submitTransaction(xdr);

      // Deduct from session budget after successful submission
      const newSpent = Number(session.spentUsdc) + amountUsdc;
      await db
        .update(sessionsTable)
        .set({ spentUsdc: String(newSpent) })
        .where(eq(sessionsTable.id, session.id));

      return result.txHash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn({ tool: name, error: msg }, "MCP auto-pay failed");
      return null;
    }
  }

  switch (name) {
    case "summarize_text": {
      const text = String(args.text ?? "");
      const agentId = String(args.agentId ?? stellarSecret
        ? Keypair.fromSecret(stellarSecret!).publicKey()
        : "unknown");

      if (!text) return err("text is required");

      // Auto-pay if STELLAR_SECRET is provided
      const txHash = await autoPay(SUMMARIZER_PAYTO, 0.1);
      if (!txHash && SUMMARIZER_PAYTO) {
        return err("Payment required. Ensure: (1) STELLAR_SECRET is set in MCP env, (2) the agent has an active session with sufficient budget. Create a session via POST /api/sessions before calling this tool.");
      }

      const resp = await fetch(`${BASE_URL}/api/services/paid/summarize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(txHash ? { "X-Payment": txHash } : {}),
        },
        body: JSON.stringify({ text, agentId: agentId || "mcp-agent" }),
      });
      const data = await resp.json() as Record<string, unknown>;
      if (data.error) return err(String(data.message ?? data.error));
      return ok(`Summary: ${data.summary}\n\nPayment: ${txHash ?? "dev_mode"}\nWord count: ${data.wordCount}`);
    }

    case "list_services": {
      const resp = await fetch(`${BASE_URL}/api/services`);
      const services = await resp.json() as Array<Record<string, unknown>>;
      const lines = services.map(
        (s) => `• ${s.name} — ${s.priceUsdc} USDC/call — ${s.description ?? ""}`
      );
      return ok(`Available Services (${services.length}):\n${lines.join("\n")}`);
    }

    case "list_proxies": {
      const proxies = await db.select().from(proxiesTable)
        .where(eq(proxiesTable.isActive, true))
        .orderBy(desc(proxiesTable.createdAt))
        .limit(20);
      if (proxies.length === 0) return ok("No API proxies published yet.");
      const lines = proxies.map(
        (p) => `• [${p.id}] ${p.name} — ${p.amountUsdc} USDC — ${p.httpMethod} ${p.targetUrl}`
      );
      return ok(`Published API Proxies (${proxies.length}):\n${lines.join("\n")}`);
    }

    case "list_workflows": {
      const workflows = await db.select().from(workflowsTable)
        .orderBy(desc(workflowsTable.createdAt))
        .limit(20);
      if (workflows.length === 0) return ok("No workflows created yet.");
      const lines = workflows.map(
        (w) => `• [${w.id}] ${w.name} — ${w.steps?.length ?? 0} steps — ${w.description ?? ""}`
      );
      return ok(`Workflows (${workflows.length}):\n${lines.join("\n")}`);
    }

    case "execute_workflow": {
      const workflowId = Number(args.workflowId);
      if (isNaN(workflowId)) return err("workflowId must be a number");
      const resp = await fetch(`${BASE_URL}/api/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: args.input ?? {}, agentId: args.agentId }),
      });
      const data = await resp.json() as Record<string, unknown>;
      if (data.error) return err(String(data.message ?? data.error));
      return ok(`Workflow executed.\nStatus: ${data.status}\nDuration: ${data.durationMs}ms\nOutput: ${JSON.stringify(data.output, null, 2)}`);
    }

    case "register_agent": {
      const { stellarAddress, name: agentName, description } = args;
      if (!stellarAddress || !agentName) return err("stellarAddress and name are required");
      if (!isValidStellarAddress(String(stellarAddress))) return err("Invalid Stellar address");
      const resp = await fetch(`${BASE_URL}/api/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stellarAddress, name: agentName, description }),
      });
      const data = await resp.json() as Record<string, unknown>;
      if (data.error) return err(String(data.message ?? data.error));
      return ok(`Agent registered!\nID: ${data.id}\nName: ${data.name}\nStellar: ${data.stellarAddress}\nReputation: ${data.reputationScore}/100`);
    }

    case "get_agent_reputation": {
      const addr = String(args.stellarAddress ?? "");
      if (!isValidStellarAddress(addr)) return err("Invalid Stellar address");
      const [agent] = await db.select().from(agentsTable)
        .where(eq(agentsTable.stellarAddress, addr));
      if (!agent) return ok(`No agent found for address ${addr}. Register first with register_agent.`);
      return ok(
        `Agent: ${agent.name}\nReputation Score: ${agent.reputationScore}/100\nTotal Transactions: ${agent.totalTransactions}\nAvg Rating: ${agent.avgRating}/5\nTotal Spent: ${agent.totalSpentUsdc} USDC\nActive: ${agent.isActive}`
      );
    }

    case "create_session": {
      const agentId = Number(args.agentId);
      const spendLimit = Number(args.spendLimitUsdc ?? 1.0);
      const expiresHours = Number(args.expiresInHours ?? 24);
      if (isNaN(agentId)) return err("agentId must be a number");
      const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000);
      const resp = await fetch(`${BASE_URL}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, spendLimitUsdc: String(spendLimit), expiresAt: expiresAt.toISOString() }),
      });
      const data = await resp.json() as Record<string, unknown>;
      if (data.error) return err(String(data.message ?? data.error));
      return ok(`Session created!\nToken: ${data.token}\nSpend Cap: ${data.spendLimitUsdc} USDC\nExpires: ${data.expiresAt}`);
    }

    case "verify_payment": {
      const txHash = String(args.txHash ?? "");
      const payTo = String(args.payTo ?? SUMMARIZER_PAYTO);
      const minAmount = Number(args.minAmount ?? 0.1);
      if (!txHash) return err("txHash is required");
      const url = `${BASE_URL}/api/stellar/payment/verify/${txHash}?payTo=${payTo}&minAmount=${minAmount}`;
      const resp = await fetch(url);
      const data = await resp.json() as Record<string, unknown>;
      return ok(
        data.valid
          ? `Payment verified!\nFrom: ${data.fromAddress}\nAmount: ${data.amount} USDC\nTx: ${txHash}`
          : `Payment invalid: ${data.error}`
      );
    }

    case "create_account": {
      const resp = await fetch(`${BASE_URL}/api/stellar/account/create`, { method: "POST" });
      const data = await resp.json() as Record<string, unknown>;
      if (data.error) return err(String(data.error));
      return ok(
        `New Stellar testnet account created!\nPublic Key: ${data.publicKey}\nSecret Key: ${data.secretKey}\nXLM Balance: ${(data.balances as Record<string, string>)?.xlm}\nUSDC Balance: ${(data.balances as Record<string, string>)?.usdc}\n\n⚠️ Save the secret key — it won't be shown again.`
      );
    }

    default:
      return err(`Unknown tool: ${name}`);
  }
}

// ─── MCP Endpoint ─────────────────────────────────────────────────────────────

router.post("/mcp", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    jsonrpc?: string;
    id?: number | string;
    method?: string;
    params?: Record<string, unknown>;
  };

  if (body.jsonrpc !== "2.0") {
    res.status(400).json({ error: "Invalid JSON-RPC version" });
    return;
  }

  const id = body.id ?? null;

  const respond = (result: unknown) =>
    res.json({ jsonrpc: "2.0", id, result });

  const respondError = (code: number, message: string) =>
    res.json({ jsonrpc: "2.0", id, error: { code, message } });

  // Extract Stellar secret from Authorization header or env
  const authHeader = req.headers.authorization;
  const stellarSecret =
    authHeader?.startsWith("Bearer S") ? authHeader.slice(7) : undefined;

  try {
    switch (body.method) {
      case "initialize":
        respond({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });
        break;

      case "notifications/initialized":
        res.status(200).end();
        break;

      case "ping":
        respond({});
        break;

      case "tools/list":
        respond({ tools: TOOLS });
        break;

      case "tools/call": {
        const params = body.params ?? {};
        const toolName = String(params.name ?? "");
        const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;

        if (!toolName) {
          respondError(-32602, "Tool name is required");
          return;
        }

        logger.info({ tool: toolName }, "MCP tool called");
        const result = await callTool(toolName, toolArgs, stellarSecret);
        respond(result);
        break;
      }

      case "resources/list":
        respond({ resources: [] });
        break;

      case "prompts/list":
        respond({ prompts: [] });
        break;

      default:
        respondError(-32601, `Method not found: ${body.method}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ method: body.method, error: msg }, "MCP error");
    respondError(-32603, msg);
  }
});

router.get("/mcp", (_req: Request, res: Response): void => {
  res.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocolVersion: PROTOCOL_VERSION,
    tools: TOOLS.length,
    description: "Stellar Agent Trust Fabric MCP Server",
    endpoint: "POST /mcp",
    docs: "https://spec.modelcontextprotocol.io/",
  });
});

export default router;
