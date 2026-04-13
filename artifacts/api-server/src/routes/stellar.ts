/**
 * Stellar Integration Routes
 *
 * Provides endpoints for:
 * - Creating and funding Stellar Testnet accounts (Friendbot)
 * - Checking account balances (XLM + USDC)
 * - Building MPP-style split payment transactions
 * - Verifying payment transactions on Horizon
 */

import { Router, type IRouter } from "express";
import { Keypair } from "@stellar/stellar-sdk";
import { eq, and } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";
import {
  createAndFundTestnetAccount,
  addUsdcTrustline,
  seedUsdcToAccount,
  getAccountBalances,
  buildMppPaymentTransaction,
  verifyPayment,
  isValidStellarAddress,
  getPaymentAsset,
  getAssetDisplayName,
  parseHorizonError,
  HORIZON_URL,
  PROTOCOL_FEE_ADDRESS,
  PROTOCOL_FEE_ADDRESS_DISPLAY,
  PROTOCOL_FEE_FRACTION,
  server,
} from "../lib/stellarPayments.js";
import { sorobanStatus } from "../lib/soroban.js";

async function validateSessionBudget(
  sessionToken: string,
  amountUsdc: number
): Promise<{ session: typeof sessionsTable.$inferSelect; error?: never } | { error: string; session?: never }> {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.sessionToken, sessionToken), eq(sessionsTable.status, "active")));

  if (!session) return { error: "session_invalid: no active session found for this token" };
  if (new Date(session.expiresAt) < new Date()) return { error: "session_expired: session has passed its expiry time" };

  const remaining = Number(session.maxSpendUsdc) - Number(session.spentUsdc);
  if (amountUsdc > remaining) {
    return {
      error: `session_budget_exceeded: this transaction requires ${amountUsdc} USDC but the session only has ${remaining.toFixed(7)} USDC remaining (limit: ${session.maxSpendUsdc})`,
    };
  }
  return { session };
}

const router: IRouter = Router();

/**
 * GET /stellar/network
 * Return network info — useful for frontend to confirm testnet connectivity.
 */
router.get("/stellar/network", async (_req, res): Promise<void> => {
  const asset = getPaymentAsset();
  const assetStr = asset.isNative() ? "XLM" : `${asset.getCode()}:${asset.getIssuer()}`;

  // Use direct fetch to check Horizon — server.serverInfo() is unreliable in some SDK versions
  let horizonConnected = false;
  try {
    const resp = await fetch(`${HORIZON_URL}/`);
    horizonConnected = resp.ok;
  } catch {
    horizonConnected = false;
  }

  res.json({
    network: "testnet",
    horizonUrl: HORIZON_URL,
    paymentAsset: assetStr,
    assetName: getAssetDisplayName(),
    protocolFeeAddress: PROTOCOL_FEE_ADDRESS ?? PROTOCOL_FEE_ADDRESS_DISPLAY,
    protocolFeeAddressValid: PROTOCOL_FEE_ADDRESS !== null,
    protocolFeeFraction: PROTOCOL_FEE_FRACTION,
    horizonConnected,
    mppEnabled: true,
  });
});

/**
 * GET /stellar/soroban
 * Return Soroban smart contract deployment status.
 */
router.get("/stellar/soroban", (_req, res): void => {
  const status = sorobanStatus();
  res.json({
    ...status,
    contracts: [
      {
        name: "Reputation",
        description: "On-chain agent reputation scoring — bump_reputation, get_reputation, has_reputation",
        contractId: status.reputation,
        deployed: !!status.reputation,
        sourceFile: "contracts/wat/reputation.wat",
      },
      {
        name: "Registry",
        description: "Decentralized agent registration — register, deregister, is_registered, get_stake",
        contractId: status.registry,
        deployed: !!status.registry,
        sourceFile: "contracts/wat/registry.wat",
      },
      {
        name: "Session Policy",
        description: "Scoped spend limits and session authorization — set_policy, get_policy, has_policy",
        contractId: status.session,
        deployed: !!status.session,
        sourceFile: "contracts/wat/session_policy.wat",
      },
    ],
    rpcUrl: status.rpcUrl,
    network: "testnet",
    deploymentNote: "3 WAT contracts live on Stellar Testnet — verified put/has/get/del working (protocol 25, interface v90194313216)",
  });
});

/**
 * POST /stellar/account/create
 * Create a new Stellar Testnet keypair and fund it via Friendbot.
 *
 * WARNING: Secret key is returned once. Store it securely.
 * In production, key management should use HSM or MPC.
 */
router.post("/stellar/account/create", async (req, res): Promise<void> => {
  try {
    req.log.info("Creating new Stellar Testnet account via Friendbot");
    const { publicKey, secretKey } = await createAndFundTestnetAccount();

    const keypair = Keypair.fromSecret(secretKey);
    let trustlineTxHash: string | null = null;
    let seedTxHash: string | null = null;

    // Add USDC trustline so the account can receive USDC
    try {
      trustlineTxHash = await addUsdcTrustline(keypair);
      req.log.info({ publicKey }, "USDC trustline added");
    } catch (trustErr) {
      req.log.warn({ err: trustErr }, "Failed to add USDC trustline");
    }

    // Seed 10 USDC from faucet so the account can make payments immediately
    if (trustlineTxHash && trustlineTxHash !== "trustline_exists") {
      try {
        seedTxHash = await seedUsdcToAccount(publicKey, 10);
        req.log.info({ publicKey, seedTxHash }, "Seeded 10 USDC to new account");
      } catch (seedErr) {
        req.log.warn({ err: seedErr }, "Failed to seed USDC to new account");
      }
    }

    const balances = await getAccountBalances(publicKey);

    res.status(201).json({
      publicKey,
      secretKey,
      network: "testnet",
      friendbotFunded: true,
      usdcTrustlineAdded: !!trustlineTxHash,
      trustlineTxHash,
      usdcSeeded: !!seedTxHash,
      seedTxHash,
      balances,
      horizonUrl: `https://stellar.expert/explorer/testnet/account/${publicKey}`,
      warning: "This secret key is shown once. Store it securely. Never share it.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ error: message }, "Failed to create Stellar account");
    res.status(500).json({ error: "account_creation_failed", message });
  }
});

/**
 * GET /stellar/account/:address/balance
 * Check the XLM and USDC balance of a Stellar address.
 */
router.get("/stellar/account/:address/balance", async (req, res): Promise<void> => {
  const { address } = req.params as { address: string };

  if (!isValidStellarAddress(address)) {
    res.status(400).json({ error: "invalid_address", message: "Not a valid Stellar public key" });
    return;
  }

  const balances = await getAccountBalances(address);
  res.json({
    address,
    network: "testnet",
    balances,
    horizonUrl: `https://stellar.expert/explorer/testnet/account/${address}`,
  });
});

/**
 * POST /stellar/payment/build
 * Build an MPP-style split payment transaction (unsigned XDR).
 *
 * The agent signs and submits this transaction, then provides the tx hash
 * as the X-PAYMENT header to call x402-protected endpoints.
 *
 * MPP split:
 *   90% → service provider (payTo address)
 *   10% → protocol fee receiver (Trust Fabric)
 */
router.post("/stellar/payment/build", async (req, res): Promise<void> => {
  const { fromSecretKey, toAddress, amountUsdc, memo, sessionToken } = req.body as {
    fromSecretKey?: string;
    toAddress?: string;
    amountUsdc?: number;
    memo?: string;
    sessionToken?: string;
  };

  if (!fromSecretKey || !toAddress || !amountUsdc) {
    res.status(400).json({
      error: "bad_request",
      message: "fromSecretKey, toAddress, and amountUsdc are required",
    });
    return;
  }

  if (!sessionToken) {
    res.status(403).json({
      error: "session_required",
      message: "A valid session token is required to build a payment. Create a session first via POST /api/sessions.",
    });
    return;
  }

  if (!isValidStellarAddress(toAddress)) {
    res.status(400).json({ error: "invalid_address", message: "toAddress is not a valid Stellar public key" });
    return;
  }

  if (amountUsdc < 0.0001 || amountUsdc > 100) {
    res.status(400).json({ error: "invalid_amount", message: "amountUsdc must be between 0.0001 and 100" });
    return;
  }

  // Session validation — enforce budget and expiry
  const validationResult = await validateSessionBudget(sessionToken, amountUsdc);
  if (validationResult.error) {
    res.status(403).json({ error: "session_denied", message: validationResult.error });
    return;
  }
  const s = validationResult.session!;
  const sessionContext = {
    id: s.id,
    remainingUsdc: Number(s.maxSpendUsdc) - Number(s.spentUsdc),
    expiresAt: s.expiresAt.toISOString(),
  };

  try {
    const keypair = Keypair.fromSecret(fromSecretKey);
    const result = await buildMppPaymentTransaction({
      fromKeypair: keypair,
      serviceAddress: toAddress,
      amountUsdc,
      memo,
    });

    res.json({
      xdr: result.xdr,
      fromAddress: keypair.publicKey(),
      toAddress,
      amountUsdc,
      mppSplit: {
        serviceAmount: result.serviceAmount,
        protocolFee: result.feeAmount,
        protocolFeeAddress: PROTOCOL_FEE_ADDRESS ?? "(no valid fee address configured)",
        hasFeeRecipient: result.hasFeeRecipient,
      },
      network: "testnet",
      sessionContext,
      instructions: "Pass the same sessionToken when submitting to deduct from your session budget",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ error: message }, "Failed to build payment transaction");
    res.status(500).json({ error: "build_failed", message });
  }
});

/**
 * POST /stellar/payment/submit
 * Submit a pre-built signed XDR transaction to Stellar Testnet.
 * Returns the transaction hash to use as X-PAYMENT header.
 */
router.post("/stellar/payment/submit", async (req, res): Promise<void> => {
  const { xdr, sessionToken, amountUsdc } = req.body as {
    xdr?: string;
    sessionToken?: string;
    amountUsdc?: number;
  };

  if (!xdr) {
    res.status(400).json({ error: "bad_request", message: "xdr is required" });
    return;
  }

  if (!sessionToken || !amountUsdc) {
    res.status(403).json({
      error: "session_required",
      message: "sessionToken and amountUsdc are required to submit a payment. Build the transaction with a valid session first.",
    });
    return;
  }

  // Re-validate session budget at submit time to prevent TOCTOU races
  const check = await validateSessionBudget(sessionToken, amountUsdc);
  if (check.error) {
    res.status(403).json({ error: "session_denied", message: check.error });
    return;
  }

  try {
    const { TransactionBuilder } = await import("@stellar/stellar-sdk");
    const tx = TransactionBuilder.fromXDR(xdr, "Test SDF Network ; September 2015");
    const result = await server.submitTransaction(tx as Parameters<typeof server.submitTransaction>[0]);

    // Deduct from session budget after confirmed on-chain submission
    let sessionUpdate: { remainingUsdc: number; spentUsdc: number } | null = null;
    if (sessionToken && amountUsdc) {
      const [currentSession] = await db
        .select()
        .from(sessionsTable)
        .where(and(eq(sessionsTable.sessionToken, sessionToken), eq(sessionsTable.status, "active")));
      if (currentSession) {
        const newSpent = Number(currentSession.spentUsdc) + amountUsdc;
        const [updated] = await db
          .update(sessionsTable)
          .set({ spentUsdc: String(newSpent) })
          .where(eq(sessionsTable.id, currentSession.id))
          .returning();
        sessionUpdate = {
          spentUsdc: Number(updated!.spentUsdc),
          remainingUsdc: Number(updated!.maxSpendUsdc) - Number(updated!.spentUsdc),
        };
      }
    }

    res.json({
      txHash: result.hash,
      ledger: result.ledger,
      successful: true,
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${result.hash}`,
      sessionUpdate,
      nextStep: "Use the txHash as your X-PAYMENT header to call protected endpoints",
    });
  } catch (err: unknown) {
    const parsed = parseHorizonError(err);
    req.log.error({ error: parsed.message, resultCodes: parsed.resultCodes }, "Failed to submit Stellar transaction");
    res.status(400).json({
      error: "submission_failed",
      message: parsed.message,
      resultCodes: parsed.resultCodes,
      hint: parsed.resultCodes?.includes("op_underfunded")
        ? "Your account does not have enough USDC. Create a new account to get 10 USDC, or use the admin secret key."
        : parsed.resultCodes?.includes("op_no_trust")
        ? "The recipient account does not have a USDC trustline. Ask them to add one first."
        : parsed.resultCodes?.includes("tx_bad_seq")
        ? "This transaction was already submitted. Build a new one."
        : undefined,
    });
  }
});

/**
 * GET /stellar/payment/verify/:txHash
 * Verify a Stellar transaction was a valid USDC payment.
 * Useful for frontend to check payment status before/after submission.
 */
router.get("/stellar/payment/verify/:txHash", async (req, res): Promise<void> => {
  const { txHash } = req.params as { txHash: string };
  const { payTo, minAmount } = req.query as { payTo?: string; minAmount?: string };

  if (!payTo || !minAmount) {
    res.status(400).json({ error: "bad_request", message: "payTo and minAmount query params are required" });
    return;
  }

  const verification = await verifyPayment({
    txHash: txHash.toUpperCase(),
    expectedPayTo: payTo,
    expectedMinAmountUsdc: parseFloat(minAmount),
    maxAgeSeconds: 3600,
  });

  res.json({
    ...verification,
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
  });
});

export default router;
