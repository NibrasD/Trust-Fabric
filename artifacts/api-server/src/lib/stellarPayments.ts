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
// This must be a valid 56-char Stellar public key.
// If unset or invalid, the fee is redirected to the service provider (no-op for demo).
const _RAW_FEE_ADDRESS =
  process.env.PROTOCOL_FEE_ADDRESS ??
  "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ";

// Validate the address — if invalid (e.g. 55-char default), use null
// and let buildMppPaymentTransaction handle gracefully
function _validateFeeAddress(addr: string): string | null {
  try {
    return StrKey.isValidEd25519PublicKey(addr) ? addr : null;
  } catch {
    return null;
  }
}

const _validatedFeeAddress = _validateFeeAddress(_RAW_FEE_ADDRESS);

/** Valid protocol fee address or null if unconfigured */
export const PROTOCOL_FEE_ADDRESS: string | null = _validatedFeeAddress;

/** Display string for UI */
export const PROTOCOL_FEE_ADDRESS_DISPLAY = _RAW_FEE_ADDRESS;

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
          protocolFeeAddress: PROTOCOL_FEE_ADDRESS ?? PROTOCOL_FEE_ADDRESS_DISPLAY,
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
 * Verify a Stellar payment transaction via Horizon REST API.
 *
 * Uses direct fetch to Horizon (more reliable than the SDK wrapper).
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
  const hash = txHash.toLowerCase();

  try {
    // Use direct fetch to Horizon REST API (SDK .transaction() returns 400 for some SDK versions)
    const txResp = await fetch(`${HORIZON_URL}/transactions/${hash}`);
    if (!txResp.ok) {
      const body = await txResp.text().catch(() => txResp.statusText);
      return { valid: false, txHash: hash, error: `Horizon lookup failed: ${txResp.status} ${body}` };
    }
    const tx = await txResp.json() as {
      successful: boolean;
      created_at: string;
      memo_type?: string;
      memo?: string;
    };

    if (!tx.successful) {
      return { valid: false, txHash: hash, error: "Transaction failed on-chain" };
    }

    const ageSeconds = (Date.now() - new Date(tx.created_at).getTime()) / 1000;
    if (ageSeconds > maxAgeSeconds) {
      return {
        valid: false,
        txHash: hash,
        error: `Transaction too old (${Math.round(ageSeconds)}s > ${maxAgeSeconds}s)`,
      };
    }

    const opsResp = await fetch(`${HORIZON_URL}/transactions/${hash}/operations`);
    if (!opsResp.ok) {
      return { valid: false, txHash: hash, error: "Could not load operations from Horizon" };
    }
    const opsData = await opsResp.json() as {
      _embedded: { records: Array<{
        type: string;
        to?: string;
        from?: string;
        amount?: string;
        asset_type?: string;
        asset_code?: string;
        asset_issuer?: string;
      }> };
    };
    const operations = opsData._embedded?.records ?? [];

    for (const op of operations) {
      if (op.type === "payment") {
        // Check destination
        if (op.to !== expectedPayTo) continue;

        // Check asset
        const isNative = asset.isNative();
        const isMatchingAsset = isNative
          ? op.asset_type === "native"
          : op.asset_type !== "native" &&
            op.asset_code === asset.getCode() &&
            op.asset_issuer === asset.getIssuer();

        if (!isMatchingAsset) continue;

        const amount = parseFloat(op.amount ?? "0");
        // For MPP payments, service receives (1 - protocolFee) fraction of the total.
        // Accept if amount ≥ (expectedMin * 0.9) to allow for MPP protocol fee split.
        // Round to 7 decimal places (Stellar stroops precision) to avoid floating-point artifacts.
        const minAcceptable = Math.round(expectedMinAmountUsdc * (1 - PROTOCOL_FEE_FRACTION) * 1e7) / 1e7;
        if (amount < minAcceptable) {
          return {
            valid: false,
            txHash: hash,
            error: `Insufficient payment: ${amount} ${getAssetDisplayName()} < ${minAcceptable.toFixed(7)} required (${expectedMinAmountUsdc} minus 10% protocol fee)`,
          };
        }

        return {
          valid: true,
          txHash: hash,
          fromAddress: op.from,
          toAddress: op.to,
          amount: op.amount,
          assetCode: isNative ? "XLM" : op.asset_code,
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
}): Promise<{ xdr: string; serviceAmount: string; feeAmount: string; hasFeeRecipient: boolean }> {
  const { fromKeypair, serviceAddress, amountUsdc, memo } = params;
  const asset = getPaymentAsset();

  const sourceAccount = await server.loadAccount(fromKeypair.publicKey());

  const hasFeeRecipient =
    PROTOCOL_FEE_ADDRESS !== null &&
    PROTOCOL_FEE_ADDRESS !== serviceAddress;

  const serviceAmount = hasFeeRecipient
    ? (amountUsdc * (1 - PROTOCOL_FEE_FRACTION)).toFixed(7)
    : amountUsdc.toFixed(7);
  const feeAmount = hasFeeRecipient
    ? (amountUsdc * PROTOCOL_FEE_FRACTION).toFixed(7)
    : "0.0000000";

  const builder = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_PASSPHRASE,
  });

  // Main payment to service provider (90% with MPP, or 100% without fee)
  builder.addOperation(
    Operation.payment({
      destination: serviceAddress,
      asset,
      amount: serviceAmount,
    })
  );

  // Protocol fee (MPP-style split, 10%) — only if fee address is valid
  if (hasFeeRecipient) {
    builder.addOperation(
      Operation.payment({
        destination: PROTOCOL_FEE_ADDRESS!,
        asset,
        amount: feeAmount,
      })
    );
  }

  if (memo) {
    builder.addMemo(Memo.text(memo.slice(0, 28)));
  }

  const tx = builder.setTimeout(300).build();
  tx.sign(fromKeypair);

  return {
    xdr: tx.toEnvelope().toXDR("base64"),
    serviceAmount,
    feeAmount,
    hasFeeRecipient,
  };
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

/**
 * Seed a new testnet account with USDC from the faucet issuer.
 * The faucet account (STELLAR_FAUCET_SECRET) is the USDC issuer — it can
 * send USDC to any account that has a trustline set up.
 * 
 * Returns the seeding transaction hash or null if not configured.
 */
export async function seedUsdcToAccount(
  recipientPublicKey: string,
  amountUsdc: number = 10
): Promise<string | null> {
  const faucetSecret = process.env.STELLAR_FAUCET_SECRET;
  if (!faucetSecret) {
    logger.warn("STELLAR_FAUCET_SECRET not set — skipping USDC seed");
    return null;
  }

  const asset = getPaymentAsset();
  if (asset.isNative()) {
    logger.info("Payment asset is XLM — no USDC seeding needed");
    return null;
  }

  try {
    const faucetKeypair = Keypair.fromSecret(faucetSecret);
    const faucetAccount = await server.loadAccount(faucetKeypair.publicKey());

    const tx = new TransactionBuilder(faucetAccount, {
      fee: BASE_FEE,
      networkPassphrase: STELLAR_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: recipientPublicKey,
          asset,
          amount: amountUsdc.toFixed(7),
        })
      )
      .addMemo(Memo.text("stf-faucet"))
      .setTimeout(300)
      .build();

    tx.sign(faucetKeypair);
    const result = await server.submitTransaction(tx);
    logger.info(
      { recipient: recipientPublicKey, amount: amountUsdc, txHash: result.hash },
      "Seeded USDC to new account from faucet"
    );
    return result.hash;
  } catch (err) {
    logger.error({ err }, "Failed to seed USDC — faucet may be out of balance");
    return null;
  }
}

/**
 * Submit a signed XDR transaction to Stellar Horizon and return tx hash.
 */
export async function submitTransaction(xdr: string): Promise<{
  txHash: string;
  ledger: number;
  successful: boolean;
  explorerUrl: string;
}> {
  const { TransactionBuilder } = await import("@stellar/stellar-sdk");
  const tx = TransactionBuilder.fromXDR(xdr, STELLAR_PASSPHRASE);
  const result = await server.submitTransaction(tx as Parameters<typeof server.submitTransaction>[0]);
  const txHash = result.hash;
  return {
    txHash,
    ledger: (result as unknown as { ledger: number }).ledger,
    successful: true,
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
  };
}

/**
 * Parse a Horizon submission error and return human-readable result codes.
 */
export function parseHorizonError(err: unknown): {
  message: string;
  resultCodes?: string[];
  extras?: unknown;
} {
  if (err instanceof Error) {
    // Stellar SDK wraps Horizon errors in the error.response.data
    const anyErr = err as any;
    const extras = anyErr?.response?.data?.extras;
    if (extras?.result_codes) {
      const codes = [
        extras.result_codes.transaction,
        ...(extras.result_codes.operations ?? []),
      ].filter(Boolean);
      const messages: Record<string, string> = {
        tx_bad_seq: "Transaction sequence number is invalid (duplicate submission?)",
        tx_failed: "Transaction failed to execute",
        op_no_trust: "Recipient has no USDC trustline — they must add one first",
        op_underfunded: "Insufficient USDC balance to complete this payment",
        op_bad_auth: "Missing or invalid signature",
        op_src_no_trust: "Sender has no USDC trustline",
        op_self_payment: "Cannot send payment to self",
      };
      const readable = codes.map((c) => messages[c] ?? c).join("; ");
      return { message: readable, resultCodes: codes, extras };
    }
    return { message: err.message };
  }
  return { message: String(err) };
}
