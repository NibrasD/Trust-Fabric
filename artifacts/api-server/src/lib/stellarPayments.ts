/**
 * Stellar Payment Verification & x402 Integration
 *
 * This module handles:
 * 1. Verifying Stellar payments on Testnet via Horizon API
 * 2. Building x402-style payment challenges (402 responses)
 * 3. MPP-style split payment flow (agent → service + protocol fee)
 *
 * Payment asset: native XLM (testnet demo) or USDC when issuer is configured.
 * XLM is used by default because every Friendbot-funded account has XLM
 * immediately — no trustline required. This is ideal for the hackathon demo.
 *
 * To use USDC in production, set the USDC_ISSUER env var.
 */

import {
  Horizon,
  Networks,
  Keypair,
  Asset,
  TransactionBuilder,
  Operation,
  Memo,
  BASE_FEE,
  StrKey,
} from "@stellar/stellar-sdk";
import { logger } from "./logger.js";

// ── Network config ────────────────────────────────────────────────────────────

export const STELLAR_NETWORK = "TESTNET";
export const STELLAR_PASSPHRASE = Networks.TESTNET;
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const FRIENDBOT_URL = "https://friendbot.stellar.org";

/**
 * The payment asset used for x402 micropayments.
 *
 * Default: native XLM (works immediately on any Friendbot-funded testnet account).
 * To use USDC: set USDC_ISSUER env var to a valid 56-char Stellar public key.
 *
 * This is a lazy getter — the Asset is only constructed when first called,
 * so module loading never crashes even if env vars are wrong.
 */
let _paymentAsset: Asset | null = null;
export function getPaymentAsset(): Asset {
  if (_paymentAsset) return _paymentAsset;

  const usdcIssuer = process.env.USDC_ISSUER;
  if (usdcIssuer && StrKey.isValidEd25519PublicKey(usdcIssuer)) {
    _paymentAsset = new Asset("USDC", usdcIssuer);
    logger.info({ issuer: usdcIssuer }, "Payment asset: USDC");
  } else {
    _paymentAsset = Asset.native();
    if (usdcIssuer) {
      logger.warn({ usdcIssuer }, "USDC_ISSUER is not a valid Stellar key — falling back to native XLM");
    } else {
      logger.info("Payment asset: native XLM (set USDC_ISSUER env var to use USDC)");
    }
  }
  return _paymentAsset;
}

export function getAssetDisplayName(): string {
  const asset = getPaymentAsset();
  return asset.isNative() ? "XLM" : "USDC";
}

// Trust Fabric protocol fee receiver (10% of each payment)
export const PROTOCOL_FEE_ADDRESS =
  process.env.PROTOCOL_FEE_ADDRESS ??
  "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ";

// Fraction of payment taken as protocol fee (for MPP-style split)
export const PROTOCOL_FEE_FRACTION = 0.1;

export const server = new Horizon.Server(HORIZON_URL);

// ── x402 Payment Challenge ─────────────────────────────────────────────────

export interface X402PaymentSpec {
  scheme: "exact";
  network: "stellar-testnet";
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: {
    name: string;
    version: string;
    paymentAsset: string;
    mppEnabled: boolean;
    protocolFeeAddress: string;
    protocolFeeFraction: number;
  };
}

export function buildX402Challenge(params: {
  serviceAddress: string;
  amountUsdc: number;
  resource: string;
  description: string;
}): { error: string; x402Version: number; accepts: X402PaymentSpec[] } {
  const asset = getPaymentAsset();
  const assetStr = asset.isNative() ? "XLM" : `${asset.getCode()}:${asset.getIssuer()}`;

  return {
    error: "Payment Required",
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "stellar-testnet",
        maxAmountRequired: params.amountUsdc.toFixed(7),
        resource: params.resource,
        description: params.description,
        mimeType: "application/json",
        payTo: params.serviceAddress,
        maxTimeoutSeconds: 300,
        asset: assetStr,
        extra: {
          name: "Stellar Agent Trust Fabric",
          version: "1.0",
          paymentAsset: assetStr,
          mppEnabled: true,
          protocolFeeAddress: PROTOCOL_FEE_ADDRESS,
          protocolFeeFraction: PROTOCOL_FEE_FRACTION,
        },
      },
    ],
  };
}

// ── Stellar Payment Verification ───────────────────────────────────────────

export interface PaymentVerification {
  valid: boolean;
  txHash: string;
  fromAddress?: string;
  toAddress?: string;
  amount?: string;
  assetCode?: string;
  memo?: string;
  error?: string;
}

/**
 * Verify a Stellar payment transaction via Horizon.
 *
 * Checks:
 * - Transaction exists and is successful on Stellar Testnet
 * - Contains a payment to the expected payTo address
 * - Amount is ≥ required amount in XLM (or USDC if configured)
 * - Transaction is recent (not replayed)
 */
export async function verifyPayment(params: {
  txHash: string;
  expectedPayTo: string;
  expectedMinAmountUsdc: number;
  maxAgeSeconds?: number;
}): Promise<PaymentVerification> {
  const { txHash, expectedPayTo, expectedMinAmountUsdc, maxAgeSeconds = 300 } = params;
  const asset = getPaymentAsset();

  try {
    const tx = await server.transactions().transaction(txHash).call();

    if (!tx.successful) {
      return { valid: false, txHash, error: "Transaction failed on-chain" };
    }

    const ageSeconds = (Date.now() - new Date(tx.created_at).getTime()) / 1000;
    if (ageSeconds > maxAgeSeconds) {
      return {
        valid: false,
        txHash,
        error: `Transaction too old (${Math.round(ageSeconds)}s > ${maxAgeSeconds}s)`,
      };
    }

    const operations = await server.operations().forTransaction(txHash).call();

    for (const op of operations.records) {
      if (op.type === "payment") {
        const paymentOp = op as Horizon.HorizonApi.PaymentOperationResponse;

        // Check destination
        if (paymentOp.to !== expectedPayTo) continue;

        // Check asset
        const isNative = asset.isNative();
        const isMatchingAsset = isNative
          ? paymentOp.asset_type === "native"
          : paymentOp.asset_type !== "native" &&
            paymentOp.asset_code === asset.getCode() &&
            paymentOp.asset_issuer === asset.getIssuer();

        if (!isMatchingAsset) continue;

        const amount = parseFloat(paymentOp.amount);
        if (amount < expectedMinAmountUsdc) {
          return {
            valid: false,
            txHash,
            error: `Insufficient payment: ${amount} ${getAssetDisplayName()} < ${expectedMinAmountUsdc} required`,
          };
        }

        return {
          valid: true,
          txHash,
          fromAddress: paymentOp.from,
          toAddress: paymentOp.to,
          amount: paymentOp.amount,
          assetCode: isNative ? "XLM" : paymentOp.asset_code,
          memo: tx.memo_type === "text" ? tx.memo : undefined,
        };
      }
    }

    return {
      valid: false,
      txHash,
      error: `No valid ${getAssetDisplayName()} payment to ${expectedPayTo} found in transaction`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ txHash, error: message }, "Payment verification failed");
    return { valid: false, txHash, error: `Horizon lookup failed: ${message}` };
  }
}

// ── MPP-Style Split Payment ────────────────────────────────────────────────

/**
 * Build a multi-party payment transaction:
 *   agent → service provider (90% of amount)
 *   agent → protocol fee receiver (10% of amount)
 *
 * This mirrors the Machine Payments Protocol (MPP) pattern where a single
 * payment is atomically split between multiple recipients.
 *
 * Returns the base64-encoded XDR transaction envelope ready for signing.
 */
export async function buildMppPaymentTransaction(params: {
  fromKeypair: Keypair;
  serviceAddress: string;
  amountUsdc: number;
  memo?: string;
}): Promise<string> {
  const { fromKeypair, serviceAddress, amountUsdc, memo } = params;
  const asset = getPaymentAsset();

  const sourceAccount = await server.loadAccount(fromKeypair.publicKey());

  const serviceAmount = (amountUsdc * (1 - PROTOCOL_FEE_FRACTION)).toFixed(7);
  const feeAmount = (amountUsdc * PROTOCOL_FEE_FRACTION).toFixed(7);

  const builder = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_PASSPHRASE,
  });

  // Payment to service provider (90%)
  builder.addOperation(
    Operation.payment({
      destination: serviceAddress,
      asset,
      amount: serviceAmount,
    })
  );

  // Protocol fee (MPP-style split, 10%)
  builder.addOperation(
    Operation.payment({
      destination: PROTOCOL_FEE_ADDRESS,
      asset,
      amount: feeAmount,
    })
  );

  if (memo) {
    builder.addMemo(Memo.text(memo.slice(0, 28)));
  }

  const tx = builder.setTimeout(300).build();
  tx.sign(fromKeypair);

  return tx.toEnvelope().toXDR("base64");
}

// ── Keypair & Funding Utils ───────────────────────────────────────────────

/**
 * Generate a new Stellar keypair and fund it via Friendbot (testnet only).
 * Returns the funded keypair.
 */
export async function createAndFundTestnetAccount(): Promise<{
  publicKey: string;
  secretKey: string;
}> {
  const keypair = Keypair.random();
  const res = await fetch(`${FRIENDBOT_URL}?addr=${keypair.publicKey()}`);

  if (!res.ok) {
    throw new Error(`Friendbot funding failed: ${await res.text()}`);
  }

  logger.info({ address: keypair.publicKey() }, "Funded Stellar testnet account via Friendbot");

  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
}

/**
 * Add a USDC trustline to an account (required before receiving USDC).
 * Skip if the payment asset is native XLM.
 */
export async function addUsdcTrustline(keypair: Keypair): Promise<string> {
  const asset = getPaymentAsset();

  if (asset.isNative()) {
    return "not_needed_for_xlm";
  }

  const account = await server.loadAccount(keypair.publicKey());

  // Check if trustline already exists
  for (const balance of account.balances) {
    if (
      balance.asset_type === "credit_alphanum4" &&
      (balance as Horizon.HorizonApi.BalanceLineAsset).asset_code === asset.getCode() &&
      (balance as Horizon.HorizonApi.BalanceLineAsset).asset_issuer === asset.getIssuer()
    ) {
      return "trustline_exists";
    }
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(300)
    .build();

  tx.sign(keypair);
  const result = await server.submitTransaction(tx);
  return result.hash;
}

/**
 * Check the XLM and payment-asset balance of a Stellar account.
 */
export async function getAccountBalances(publicKey: string): Promise<{
  xlm: string;
  usdc: string;
}> {
  const asset = getPaymentAsset();

  try {
    const account = await server.loadAccount(publicKey);
    let xlm = "0";
    let usdc = "0";

    for (const b of account.balances) {
      if (b.asset_type === "native") {
        xlm = b.balance;
        if (asset.isNative()) usdc = b.balance; // XLM is both
      } else if (
        !asset.isNative() &&
        b.asset_type === "credit_alphanum4" &&
        (b as Horizon.HorizonApi.BalanceLineAsset).asset_code === asset.getCode()
      ) {
        usdc = b.balance;
      }
    }
    return { xlm, usdc };
  } catch {
    return { xlm: "0", usdc: "0" };
  }
}

/**
 * Validate that a string is a valid Stellar public key.
 */
export function isValidStellarAddress(address: string): boolean {
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}
