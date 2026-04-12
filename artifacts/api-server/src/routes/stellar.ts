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
import {
  createAndFundTestnetAccount,
  addUsdcTrustline,
  getAccountBalances,
  buildMppPaymentTransaction,
  verifyPayment,
  isValidStellarAddress,
  getPaymentAsset,
  getAssetDisplayName,
  HORIZON_URL,
  PROTOCOL_FEE_ADDRESS,
  PROTOCOL_FEE_ADDRESS_DISPLAY,
  PROTOCOL_FEE_FRACTION,
  server,
} from "../lib/stellarPayments.js";

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

    // Add USDC trustline so the account can receive USDC
    const keypair = Keypair.fromSecret(secretKey);
    let trustlineTxHash: string | null = null;
    try {
      trustlineTxHash = await addUsdcTrustline(keypair);
    } catch (trustErr) {
      req.log.warn({ err: trustErr }, "Failed to add USDC trustline (account may need XLM first)");
    }

    const balances = await getAccountBalances(publicKey);

    res.status(201).json({
      publicKey,
      secretKey,
      network: "testnet",
      friendbotFunded: true,
      usdcTrustlineAdded: !!trustlineTxHash,
      trustlineTxHash,
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
  const { fromSecretKey, toAddress, amountUsdc, memo } = req.body as {
    fromSecretKey?: string;
    toAddress?: string;
    amountUsdc?: number;
    memo?: string;
  };

  if (!fromSecretKey || !toAddress || !amountUsdc) {
    res.status(400).json({
      error: "bad_request",
      message: "fromSecretKey, toAddress, and amountUsdc are required",
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
      instructions: "Sign and submit this XDR to Stellar Testnet, then use the tx hash as X-PAYMENT header",
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
  const { xdr } = req.body as { xdr?: string };

  if (!xdr) {
    res.status(400).json({ error: "bad_request", message: "xdr is required" });
    return;
  }

  try {
    const { TransactionBuilder } = await import("@stellar/stellar-sdk");
    const tx = TransactionBuilder.fromXDR(xdr, "Test SDF Network ; September 2015");
    const result = await server.submitTransaction(tx as Parameters<typeof server.submitTransaction>[0]);

    res.json({
      txHash: result.hash,
      ledger: result.ledger,
      successful: true,
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${result.hash}`,
      nextStep: "Use the txHash as your X-PAYMENT header to call protected endpoints",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ error: message }, "Failed to submit Stellar transaction");
    res.status(500).json({ error: "submission_failed", message });
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
