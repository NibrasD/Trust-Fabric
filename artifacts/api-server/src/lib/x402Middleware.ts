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
 *    → If valid, records the payment and allows the request through.
 *    → If invalid, returns 402 again.
 *
 * The X-PAYMENT header format:
 *   X-PAYMENT: <stellar_tx_hash>
 *   (In production, this would be a signed payment payload per x402 spec)
 */

import type { Request, Response, NextFunction } from "express";
import {
  verifyPayment,
  buildX402Challenge,
  PROTOCOL_FEE_ADDRESS,
} from "./stellarPayments.js";
import { logger } from "./logger.js";

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

/**
 * Extract X-PAYMENT header from request.
 * The header should contain the Stellar transaction hash (64-char hex).
 */
function extractPaymentHeader(req: Request): string | null {
  const header = req.headers["x-payment"] ?? req.headers["X-PAYMENT"];
  if (!header || typeof header !== "string") return null;
  const trimmed = header.trim();
  if (trimmed.length < 32) return null;
  return trimmed;
}

/**
 * Create the x402 middleware for a specific resource.
 *
 * Usage:
 *   router.post("/paid/summarize",
 *     x402Middleware({ payToAddress: "G...", amountUsdc: 0.10, description: "AI Summarizer" }),
 *     handler
 *   );
 */
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

    // Payment header present — verify the transaction
    const txHash = paymentHeader.toUpperCase().replace(/^0x/, "");

    if (verifyOnChain) {
      const verification = await verifyPayment({
        txHash,
        expectedPayTo: payToAddress,
        expectedMinAmountUsdc: amountUsdc,
        maxAgeSeconds: 600, // 10 minutes
      });

      if (!verification.valid) {
        req.log.warn({ txHash, error: verification.error }, "x402 payment verification failed");
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

      req.log.info(
        { txHash, from: verification.fromAddress, amount: verification.amount },
        "x402 payment verified on Stellar Testnet"
      );

      // Attach verified payment info to request for handlers to use
      (req as X402Request).x402Payment = {
        txHash,
        fromAddress: verification.fromAddress!,
        amount: verification.amount!,
        verified: true,
        verifiedOnChain: true,
      };
    } else {
      // Development mode: accept the tx hash as-is, don't verify on Horizon
      req.log.info({ txHash }, "x402 payment accepted (dev mode - no on-chain verification)");
      (req as X402Request).x402Payment = {
        txHash,
        fromAddress: "dev_mode",
        amount: String(amountUsdc),
        verified: true,
        verifiedOnChain: false,
      };
    }

    next();
  };
}

// Extend Express Request type with payment info
export interface X402Payment {
  txHash: string;
  fromAddress: string;
  amount: string;
  verified: boolean;
  verifiedOnChain: boolean;
}

export interface X402Request extends Request {
  x402Payment?: X402Payment;
}
