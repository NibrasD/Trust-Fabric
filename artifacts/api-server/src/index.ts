import app from "./app";
import { logger } from "./lib/logger";
import { Keypair } from "@stellar/stellar-sdk";
import { addUsdcTrustline, seedUsdcToAccount } from "./lib/stellarPayments.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Ensure the admin/service account has a trustline to the current USDC issuer
 * and has USDC balance to receive payments. This runs once at startup.
 */
async function setupAdminUsdc(): Promise<void> {
  const adminSecret = "SCFNDN5N3SXNGOJMDIILW44TBBDCKENNQJ24KVJQDAFXDKALVHV5WOZO";
  try {
    const adminKeypair = Keypair.fromSecret(adminSecret);
    const result = await addUsdcTrustline(adminKeypair);
    if (result === "trustline_exists") {
      logger.info("Admin USDC trustline already exists");
    } else if (result === "not_needed_for_xlm") {
      logger.info("Payment asset is XLM — no admin trustline needed");
    } else {
      logger.info({ txHash: result }, "Admin USDC trustline added");
      // Seed some USDC to admin so it can receive payments from demo flows
      await seedUsdcToAccount(adminKeypair.publicKey(), 100);
      logger.info("Seeded 100 USDC to admin account");
    }
  } catch (err) {
    logger.warn({ err }, "Admin USDC setup skipped (non-fatal)");
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Setup admin USDC trustline in background (non-blocking)
  setupAdminUsdc().catch((e) => logger.warn({ e }, "Admin USDC setup failed"));
});
