/**
 * Stellar x402 Payment Middleware
 *
 * Implements the x402 HTTP payment standard for Stellar/USDC:
 *
 * 1. On first request (no X-PAYMENT header):
 *    → Returns 402 Payment Required with a payment specification.
 *
 * 2. On subsequent request (with X-PAYMENT header containing tx hash):
 *    → Verifies the Stellar transaction via Horizon API.
 *    → Checks active Session policy for this agent (if one exists):
 *        - Endpoint must be in allowedEndpoints
 *        - spentUsdc must not exceed maxSpendUsdc
 *    → If valid, allows the request through.
 *    → If invalid, returns 402 / 403 as appropriate.
 *
 * The X-PAYMENT header format:
 *   X-PAYMENT: <stellar_tx_hash>
 */

import type { Request, Response, NextFunction } from "express";
import { eq, and, gt } from "drizzle-orm";
import {
  verifyPayment,
  buildX402Challenge,
} from "./stellarPayments.js";
import { db, agentsTable, sessionsTable } from "@workspace/db";

export interface X402MiddlewareOptions {
  /** Address that receives the payment */
  payToAddress: string;
  /** Minimum required amount in USDC */
  amountUsdc: number;
  /** Human-readable description shown in 402 response */
  description: string;
  /** Whether to verify via Horizon (set false in dev to skip real verification) */
  verifyOnChain?: boolean;
}

function extractPaymentHeader(req: Request): string | null {
  const header = req.headers["x-payment"] ?? req.headers["X-PAYMENT"];
  if (!header || typeof header !== "string") return null;
  const trimmed = header.trim();
  if (trimmed.length < 32) return null;
  return trimmed;
}

/**
 * Check if a session policy allows this request.
 * Returns { allowed: true, sessionId } or { allowed: false, error, reason }.
 *
 * If no session exists for this agent, the request is allowed (payment alone is sufficient).
 * If a session exists, it must permit the endpoint and have remaining spend capacity.
 */
async function enforceSessionPolicy(
  fromAddress: string,
  endpoint: string,
  amountUsdc: number
): Promise<{ allowed: true; sessionId?: number } | { allowed: false; error: string; reason: string }> {
  // Skip enforcement for dev_mode
  if (fromAddress === "dev_mode") return { allowed: true };

  // Look up agent by Stellar address
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.stellarAddress, fromAddress));

  if (!agent) return { allowed: true }; // Unknown agent — payment alone is sufficient

  // Find an active, non-expired session for this agent
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.agentId, agent.id),
        eq(sessionsTable.status, "active"),
        gt(sessionsTable.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!session) return { allowed: true }; // No active session — open access via payment

  // Session exists — enforce endpoint policy
  const allowedEndpoints: string[] = session.allowedEndpoints ?? [];
  if (allowedEndpoints.length > 0 && !allowedEndpoints.includes(endpoint)) {
    return {
      allowed: false,
      error: "session_endpoint_denied",
      reason: `Endpoint ${endpoint} is not in the allowed list for session ${session.sessionToken}. Allowed: ${allowedEndpoints.join(", ")}`,
    };
  }

  // Enforce spending limit
  const spent = Number(session.spentUsdc ?? 0);
  const maxSpend = Number(session.maxSpendUsdc ?? 0);
  if (maxSpend > 0 && spent + amountUsdc > maxSpend) {
    return {
      allowed: false,
      error: "session_spend_limit_exceeded",
      reason: `Session spending limit reached: ${spent.toFixed(4)} / ${maxSpend.toFixed(4)} USDC. Create a new session to continue.`,
    };
  }

  // All checks passed — increment spentUsdc
  await db
    .update(sessionsTable)
    .set({ spentUsdc: String(spent + amountUsdc) })
    .where(eq(sessionsTable.id, session.id));

  return { allowed: true, sessionId: session.id };
}

export function x402Middleware(opts: X402MiddlewareOptions) {
  const {
    payToAddress,
    amountUsdc,
    description,
    verifyOnChain = true,
  } = opts;

  return async function x402Guard(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const paymentHeader = extractPaymentHeader(req);

    // No payment header — issue the 402 challenge
    if (!paymentHeader) {
      const resource = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
      res
        .status(402)
        .json(buildX402Challenge({ serviceAddress: payToAddress, amountUsdc, resource, description }));
      return;
    }

    const txHash = paymentHeader.toUpperCase().replace(/^0x/, "");
    let fromAddress = "dev_mode";
    let paymentAmount = String(amountUsdc);
    let verifiedOnChain = false;

    if (verifyOnChain) {
      const verification = await verifyPayment({
        txHash,
        expectedPayTo: payToAddress,
        expectedMinAmountUsdc: amountUsdc,
        maxAgeSeconds: 600,
      });

      if (!verification.valid) {
        res.status(402).json({
          error: "Payment verification failed",
          reason: verification.error,
          x402Version: 1,
          accepts: buildX402Challenge({
            serviceAddress: payToAddress,
            amountUsdc,
            resource: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
            description,
          }).accepts,
        });
        return;
      }

      fromAddress = verification.fromAddress!;
      paymentAmount = verification.amount!;
      verifiedOnChain = true;
    }

    // Derive the canonical endpoint path (strip query string)
    const endpoint = req.originalUrl.split("?")[0]!;

    // Enforce session policy (if an active session exists for this agent)
    const sessionCheck = await enforceSessionPolicy(fromAddress, endpoint, amountUsdc);

    if (!sessionCheck.allowed) {
      res.status(403).json({
        error: sessionCheck.error,
        reason: sessionCheck.reason,
        x402Version: 1,
      });
      return;
    }

    (req as X402Request).x402Payment = {
      txHash,
      fromAddress,
      amount: paymentAmount,
      verified: true,
      verifiedOnChain,
      sessionId: sessionCheck.allowed && "sessionId" in sessionCheck ? sessionCheck.sessionId : undefined,
    };

    next();
  };
}

export interface X402Payment {
  txHash: string;
  fromAddress: string;
  amount: string;
  verified: boolean;
  verifiedOnChain: boolean;
  sessionId?: number;
}

export interface X402Request extends Request {
  x402Payment?: X402Payment;
}
