/**
 * Stellar Agent Trust Fabric — Soroban Contract Integration
 *
 * Calls the three on-chain Soroban contracts when their contract IDs are
 * configured via environment variables.  Falls back gracefully to
 * PostgreSQL-only mode when the env vars are not set (e.g. during local dev
 * or before contracts are deployed).
 *
 * Required env vars to enable on-chain calls:
 *   SOROBAN_REPUTATION_CONTRACT_ID  — deployed reputation contract
 *   SOROBAN_REGISTRY_CONTRACT_ID    — deployed registry contract
 *   SOROBAN_SESSION_CONTRACT_ID     — deployed session-policy contract
 *   SOROBAN_ADMIN_SECRET            — Stellar secret key for the admin account
 *
 * Compile & deploy:
 *   cd contracts && stellar contract build
 *   stellar contract deploy --wasm target/wasm32-unknown-unknown/release/reputation.wasm \
 *     --source <admin-secret> --network testnet
 */

import {
  Contract,
  rpc as SorobanRpc,
  TransactionBuilder,
  Networks,
  Keypair,
  nativeToScVal,
  Address,
  xdr as XDR,
  StrKey,
} from "@stellar/stellar-sdk";
import { logger } from "./logger.js";

// ── RPC + config ──────────────────────────────────────────────────────────────

const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
const server = new SorobanRpc.Server(SOROBAN_RPC_URL, { allowHttp: false });

export const REPUTATION_CONTRACT_ID =
  process.env.SOROBAN_REPUTATION_CONTRACT_ID ?? null;
export const REGISTRY_CONTRACT_ID =
  process.env.SOROBAN_REGISTRY_CONTRACT_ID ?? null;
export const SESSION_CONTRACT_ID =
  process.env.SOROBAN_SESSION_CONTRACT_ID ?? null;
export const ADMIN_SECRET = process.env.SOROBAN_ADMIN_SECRET ?? null;

export function sorobanEnabled(): boolean {
  return !!(REPUTATION_CONTRACT_ID && ADMIN_SECRET);
}

export function sorobanStatus(): {
  enabled: boolean;
  reputation: string | null;
  registry: string | null;
  session: string | null;
  rpcUrl: string;
} {
  return {
    enabled: sorobanEnabled(),
    reputation: REPUTATION_CONTRACT_ID,
    registry: REGISTRY_CONTRACT_ID,
    session: SESSION_CONTRACT_ID,
    rpcUrl: SOROBAN_RPC_URL,
  };
}

// ── Helper: build, prepare, sign, submit ─────────────────────────────────────

async function invokeContract(
  contractId: string,
  method: string,
  args: XDR.ScVal[],
  keypair: Keypair
): Promise<{ hash: string; success: boolean }> {
  const account = await server.getAccount(keypair.publicKey());

  const contract = new Contract(contractId);

  const rawTx = new TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(300)
    .build();

  const prepared = await server.prepareTransaction(rawTx);
  prepared.sign(keypair);

  const response = await server.sendTransaction(prepared);

  if (response.status === "ERROR") {
    throw new Error(`Contract call failed: ${JSON.stringify(response)}`);
  }

  // Poll until complete
  const hash = response.hash;
  let getResponse = await server.getTransaction(hash);
  let attempts = 0;

  while (
    getResponse.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND &&
    attempts < 20
  ) {
    await new Promise((r) => setTimeout(r, 1500));
    getResponse = await server.getTransaction(hash);
    attempts++;
  }

  return {
    hash,
    success:
      getResponse.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS,
  };
}

// ── Reputation contract calls ─────────────────────────────────────────────────

/**
 * Record a confirmed x402 payment for an agent on the Reputation contract.
 * Bumps the agent's reputation score weighted by payment size.
 *
 * @param agentAddress  Agent's Stellar public key
 * @param amountStroops Payment amount in stroops (1 XLM = 10,000,000)
 * @returns tx hash if submitted, null if Soroban not configured
 */
export async function sorobanRecordPayment(
  agentAddress: string,
  amountStroops: bigint
): Promise<string | null> {
  if (!REPUTATION_CONTRACT_ID || !ADMIN_SECRET) return null;
  if (!StrKey.isValidEd25519PublicKey(agentAddress)) return null;

  try {
    const keypair = Keypair.fromSecret(ADMIN_SECRET);

    const result = await invokeContract(
      REPUTATION_CONTRACT_ID,
      "record_payment",
      [
        new Address(agentAddress).toScVal(),
        nativeToScVal(amountStroops, { type: "i64" }),
      ],
      keypair
    );

    logger.info(
      { contractId: REPUTATION_CONTRACT_ID, hash: result.hash, agentAddress },
      "Soroban: reputation.record_payment submitted"
    );

    return result.hash;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), agentAddress },
      "Soroban: record_payment failed — falling back to off-chain"
    );
    return null;
  }
}

/**
 * Submit a post-transaction rating on the Reputation contract.
 *
 * @param agentAddress  Agent's Stellar public key
 * @param stars         Rating (1–5)
 * @param amountStroops Original payment amount (for weighting)
 */
export async function sorobanSubmitRating(
  agentAddress: string,
  stars: number,
  amountStroops: bigint
): Promise<string | null> {
  if (!REPUTATION_CONTRACT_ID || !ADMIN_SECRET) return null;
  if (!StrKey.isValidEd25519PublicKey(agentAddress)) return null;

  try {
    const keypair = Keypair.fromSecret(ADMIN_SECRET);

    const result = await invokeContract(
      REPUTATION_CONTRACT_ID,
      "submit_rating",
      [
        new Address(agentAddress).toScVal(),
        nativeToScVal(stars, { type: "u32" }),
        nativeToScVal(amountStroops, { type: "i64" }),
      ],
      keypair
    );

    logger.info(
      { hash: result.hash, agentAddress, stars },
      "Soroban: reputation.submit_rating submitted"
    );

    return result.hash;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Soroban: submit_rating failed — falling back to off-chain"
    );
    return null;
  }
}

/**
 * Query an agent's on-chain reputation profile.
 *
 * @returns ReputationProfile or null if contract not configured
 */
export async function sorobanGetReputation(agentAddress: string): Promise<{
  score: number;
  totalTransactions: number;
  ratingCount: number;
  totalPaidStroops: string;
} | null> {
  if (!REPUTATION_CONTRACT_ID) return null;
  if (!StrKey.isValidEd25519PublicKey(agentAddress)) return null;

  try {
    const contract = new Contract(REPUTATION_CONTRACT_ID);

    const tx = await server
      .getAccount(
        ADMIN_SECRET
          ? Keypair.fromSecret(ADMIN_SECRET).publicKey()
          : agentAddress
      )
      .then((account) => {
        return new TransactionBuilder(account, {
          fee: "100",
          networkPassphrase: Networks.TESTNET,
        })
          .addOperation(
            contract.call(
              "get_reputation",
              new Address(agentAddress).toScVal()
            )
          )
          .setTimeout(30)
          .build();
      });

    const sim = await server.simulateTransaction(tx);

    if (!SorobanRpc.Api.isSimulationSuccess(sim)) return null;

    const result = sim.result?.retval;
    if (!result) return null;

    const mapData = result.map()?.value() as Array<{
      key: () => XDR.ScVal;
      val: () => XDR.ScVal;
    }>;
    if (!mapData) return null;

    const getField = (key: string): bigint => {
      const entry = mapData.find((e) => e.key().sym()?.toString() === key);
      return BigInt(entry?.val().i64()?.toString() ?? "0");
    };

    return {
      score: Number(getField("score")),
      totalTransactions: Number(getField("total_transactions")),
      ratingCount: Number(getField("rating_count")),
      totalPaidStroops: getField("total_paid_stroops").toString(),
    };
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "Soroban: get_reputation simulation failed"
    );
    return null;
  }
}

// ── Session Policy contract calls ─────────────────────────────────────────────

/**
 * Create a scoped session on-chain in the SessionPolicy contract.
 *
 * @param sessionId       Unique 32-byte session identifier (hex string)
 * @param agentAddress    Agent's Stellar public key
 * @param maxSpendStroops Spend cap in stroops
 * @param durationSeconds Session lifetime
 */
export async function sorobanCreateSession(
  sessionId: string,
  agentAddress: string,
  maxSpendStroops: bigint,
  durationSeconds: number
): Promise<string | null> {
  if (!SESSION_CONTRACT_ID || !ADMIN_SECRET) return null;

  try {
    const keypair = Keypair.fromSecret(ADMIN_SECRET);

    // Pad / hash sessionId to 32 bytes
    const sessionBytes = Buffer.alloc(32, 0);
    const idBuf = Buffer.from(sessionId.replace(/-/g, "").slice(0, 32), "hex");
    idBuf.copy(sessionBytes);

    const result = await invokeContract(
      SESSION_CONTRACT_ID,
      "create_session",
      [
        nativeToScVal(sessionBytes, { type: "bytes" }),
        new Address(agentAddress).toScVal(),
        nativeToScVal(maxSpendStroops, { type: "i64" }),
        nativeToScVal(durationSeconds, { type: "u64" }),
      ],
      keypair
    );

    logger.info(
      { hash: result.hash, agentAddress, maxSpendStroops },
      "Soroban: session_policy.create_session submitted"
    );

    return result.hash;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Soroban: create_session failed — falling back to off-chain"
    );
    return null;
  }
}
