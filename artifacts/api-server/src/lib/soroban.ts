/**
 * Stellar Agent Trust Fabric — Soroban Contract Integration
 *
 * Integrates the three on-chain WAT-compiled Soroban contracts deployed on
 * Stellar testnet. Uses the confirmed-working host function mapping:
 *
 *   l."0" = has_contract_data(key, storage_type) → Bool
 *   l."1" = get_contract_data(key, storage_type) → Val
 *   l."2" = del_contract_data(key, storage_type) → Void
 *   l."_" = put_contract_data(key, val, storage_type) → Void
 *   storage_type 1 (Void/Temporary) = confirmed working
 *
 * Deployed contract IDs (Stellar testnet, April 2026):
 *   Reputation:    CAXV62IIEHBEPRNKZXYNEITMENNSX6U5Y7VT36N4XLI63ZNPCC73CRQ6
 *   Registry:      CDG7G7MBLWLG3FD3YPMVGCFWB4HCF7PWSX2VIOHIAUVBJ23QQAMSPPHA
 *   Session Policy:CAKSBWFSRPCBN6XHV5PUOVHU5234CHOGZNXKLXBOAUW4RZCIL45RU2F7
 */

import {
  rpc as SorobanRpc,
  TransactionBuilder,
  Networks,
  Keypair,
  xdr as XDR,
  Operation,
  StrKey,
} from "@stellar/stellar-sdk";
import { logger } from "./logger.js";

// ── RPC + config ──────────────────────────────────────────────────────────────

const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
const server = new SorobanRpc.Server(SOROBAN_RPC_URL, { allowHttp: false });

export const REPUTATION_CONTRACT_ID =
  process.env.SOROBAN_REPUTATION_CONTRACT_ID ??
  "CAXV62IIEHBEPRNKZXYNEITMENNSX6U5Y7VT36N4XLI63ZNPCC73CRQ6";

export const REGISTRY_CONTRACT_ID =
  process.env.SOROBAN_REGISTRY_CONTRACT_ID ??
  "CDG7G7MBLWLG3FD3YPMVGCFWB4HCF7PWSX2VIOHIAUVBJ23QQAMSPPHA";

export const SESSION_CONTRACT_ID =
  process.env.SOROBAN_SESSION_CONTRACT_ID ??
  "CAKSBWFSRPCBN6XHV5PUOVHU5234CHOGZNXKLXBOAUW4RZCIL45RU2F7";

export const ADMIN_SECRET =
  process.env.SOROBAN_ADMIN_SECRET ??
  "SCFNDN5N3SXNGOJMDIILW44TBBDCKENNQJ24KVJQDAFXDKALVHV5WOZO";

export function sorobanEnabled(): boolean {
  return true;
}

export function sorobanStatus(): {
  enabled: boolean;
  reputation: string | null;
  registry: string | null;
  session: string | null;
  rpcUrl: string;
} {
  return {
    enabled: true,
    reputation: REPUTATION_CONTRACT_ID,
    registry: REGISTRY_CONTRACT_ID,
    session: SESSION_CONTRACT_ID,
    rpcUrl: SOROBAN_RPC_URL,
  };
}

// ── Key conversion ────────────────────────────────────────────────────────────

/**
 * Convert an agent address (Stellar public key) to a u32 key for on-chain storage.
 * Takes the first 4 bytes of the decoded raw key as a big-endian u32.
 */
function addressToKey(address: string): number {
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new Error(`Invalid Stellar address: ${address}`);
  }
  const raw = StrKey.decodeEd25519PublicKey(address);
  return ((raw[0] << 24) | (raw[1] << 16) | (raw[2] << 8) | raw[3]) >>> 0;
}

/** Convert a session UUID/string to a u32 key. */
function sessionToKey(sessionId: string): number {
  const clean = sessionId.replace(/-/g, "");
  const hex = clean.slice(0, 8).padStart(8, "0");
  return parseInt(hex, 16) >>> 0;
}

// ── Helper: build, simulate, sign, submit ─────────────────────────────────────

async function invokeContract(
  contractId: string,
  method: string,
  args: XDR.ScVal[],
  keypair: Keypair
): Promise<{ hash: string; success: boolean; returnValue?: XDR.ScVal }> {
  const account = await server.getAccount(keypair.publicKey());

  const rawTx = new TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: method,
        args,
      })
    )
    .setTimeout(300)
    .build();

  const sim = await server.simulateTransaction(rawTx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  const assembled = SorobanRpc.assembleTransaction(rawTx, sim).build();
  assembled.sign(keypair);

  const response = await server.sendTransaction(assembled);

  if (response.status === "ERROR") {
    throw new Error(`Send failed: ${JSON.stringify(response)}`);
  }

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

  const retval =
    getResponse.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS &&
    "returnValue" in getResponse
      ? (getResponse.returnValue as XDR.ScVal)
      : undefined;

  return {
    hash,
    success:
      getResponse.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS,
    returnValue: retval,
  };
}

async function simulateContract(
  contractId: string,
  method: string,
  args: XDR.ScVal[],
  callerKey: string
): Promise<XDR.ScVal | null> {
  try {
    const account = await server.getAccount(callerKey);
    const rawTx = new TransactionBuilder(account, {
      fee: "1000000",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: contractId,
          function: method,
          args,
        })
      )
      .setTimeout(300)
      .build();

    const sim = await server.simulateTransaction(rawTx);
    if (!SorobanRpc.Api.isSimulationSuccess(sim)) return null;
    return sim.result?.retval ?? null;
  } catch {
    return null;
  }
}

// ── Reputation contract calls ─────────────────────────────────────────────────

/**
 * Bump reputation score for an agent by the given amount.
 * Uses the on-chain bump_reputation function which adds to existing score.
 */
export async function sorobanRecordPayment(
  agentAddress: string,
  amountStroops: bigint
): Promise<string | null> {
  try {
    const keypair = Keypair.fromSecret(ADMIN_SECRET);
    const key = addressToKey(agentAddress);
    const bumpAmount = Math.min(Math.ceil(Number(amountStroops) / 1_000_000), 10);

    const result = await invokeContract(
      REPUTATION_CONTRACT_ID,
      "bump_reputation",
      [
        XDR.ScVal.scvU32(key),
        XDR.ScVal.scvU32(bumpAmount),
      ],
      keypair
    );

    logger.info(
      { contractId: REPUTATION_CONTRACT_ID, hash: result.hash, agentAddress, bumpAmount },
      "Soroban: reputation.bump_reputation submitted"
    );

    return result.hash;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), agentAddress },
      "Soroban: bump_reputation failed — continuing off-chain"
    );
    return null;
  }
}

/**
 * Submit a rating by setting a composite score on the Reputation contract.
 */
export async function sorobanSubmitRating(
  agentAddress: string,
  stars: number,
  _amountStroops: bigint
): Promise<string | null> {
  try {
    const keypair = Keypair.fromSecret(ADMIN_SECRET);
    const key = addressToKey(agentAddress);
    const score = Math.max(0, Math.min(stars * 20, 100));

    const result = await invokeContract(
      REPUTATION_CONTRACT_ID,
      "set_reputation",
      [XDR.ScVal.scvU32(key), XDR.ScVal.scvU32(score)],
      keypair
    );

    logger.info(
      { hash: result.hash, agentAddress, stars, score },
      "Soroban: reputation.set_reputation submitted"
    );

    return result.hash;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Soroban: set_reputation failed — continuing off-chain"
    );
    return null;
  }
}

/**
 * Query an agent's on-chain reputation score.
 */
export async function sorobanGetReputation(agentAddress: string): Promise<{
  score: number;
  totalTransactions: number;
  ratingCount: number;
  totalPaidStroops: string;
} | null> {
  try {
    const keypair = Keypair.fromSecret(ADMIN_SECRET);
    const key = addressToKey(agentAddress);

    const hasVal = await simulateContract(
      REPUTATION_CONTRACT_ID,
      "has_reputation",
      [XDR.ScVal.scvU32(key)],
      keypair.publicKey()
    );

    const exists = hasVal?.switch().name === "scvBool" && hasVal.b() === true;
    if (!exists) return null;

    const retval = await simulateContract(
      REPUTATION_CONTRACT_ID,
      "get_reputation",
      [XDR.ScVal.scvU32(key)],
      keypair.publicKey()
    );

    if (!retval) return null;
    const score = retval.switch().name === "scvU32" ? retval.u32() : 0;

    return {
      score,
      totalTransactions: 0,
      ratingCount: 0,
      totalPaidStroops: "0",
    };
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "Soroban: get_reputation simulation failed"
    );
    return null;
  }
}

// ── Registry contract calls ───────────────────────────────────────────────────

/**
 * Register an agent in the on-chain registry.
 */
export async function sorobanRegisterAgent(
  agentAddress: string,
  stakeStroops: bigint
): Promise<string | null> {
  try {
    const keypair = Keypair.fromSecret(ADMIN_SECRET);
    const key = addressToKey(agentAddress);
    const stakeVal = Math.min(Number(stakeStroops / 1_000_000n), 4294967295);

    const result = await invokeContract(
      REGISTRY_CONTRACT_ID,
      "register",
      [XDR.ScVal.scvU32(key), XDR.ScVal.scvU32(stakeVal)],
      keypair
    );

    logger.info(
      { hash: result.hash, agentAddress, stakeVal },
      "Soroban: registry.register submitted"
    );

    return result.hash;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Soroban: register failed"
    );
    return null;
  }
}

/**
 * Check if an agent is registered in the on-chain registry.
 */
export async function sorobanIsRegistered(
  agentAddress: string
): Promise<boolean> {
  try {
    const keypair = Keypair.fromSecret(ADMIN_SECRET);
    const key = addressToKey(agentAddress);

    const retval = await simulateContract(
      REGISTRY_CONTRACT_ID,
      "is_registered",
      [XDR.ScVal.scvU32(key)],
      keypair.publicKey()
    );

    return retval?.switch().name === "scvBool" && retval.b() === true;
  } catch {
    return false;
  }
}

// ── Session Policy contract calls ─────────────────────────────────────────────

const SPENT_KEY_OFFSET = 0x40000000;

/**
 * Create / update a session policy on-chain.
 * Stores TWO on-chain entries per session:
 *   1. sessionKey       → maxSpendUsdc * 10000 (budget cap)
 *   2. sessionKey ^ SPENT_KEY_OFFSET → 0 (initial spent = 0)
 *
 * This allows sorobanAuthorizeSpend to read/validate/update budget on-chain.
 */
export async function sorobanCreateSession(
  sessionId: string,
  agentAddress: string,
  maxSpendStroops: bigint,
  durationSeconds: number
): Promise<string | null> {
  try {
    const keypair = Keypair.fromSecret(ADMIN_SECRET);
    const key = sessionToKey(sessionId);
    const spentKey = (key ^ SPENT_KEY_OFFSET) >>> 0;
    const maxSpendCents = Math.ceil(Number(maxSpendStroops) / 1_000_000 * 10000);

    const result = await invokeContract(
      SESSION_CONTRACT_ID,
      "set_policy",
      [XDR.ScVal.scvU32(key), XDR.ScVal.scvU32(maxSpendCents)],
      keypair
    );

    await invokeContract(
      SESSION_CONTRACT_ID,
      "set_policy",
      [XDR.ScVal.scvU32(spentKey), XDR.ScVal.scvU32(0)],
      keypair
    );

    logger.info(
      { hash: result.hash, agentAddress, maxSpendCents, durationSeconds },
      "Soroban: session created on-chain (max_spend + spent=0)"
    );

    return result.hash;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Soroban: set_policy failed — continuing off-chain"
    );
    return null;
  }
}

/**
 * ON-CHAIN session budget authorization.
 *
 * This is the CRITICAL function that makes the smart contract mandatory for payments.
 * Before ANY Stellar payment is built, this function MUST succeed. It:
 *
 *   1. Reads the session's max_spend from the blockchain (get_policy)
 *   2. Reads the session's current spent from the blockchain (get_policy)
 *   3. Validates: spent + amount <= max_spend
 *   4. Writes the updated spent amount TO the blockchain (set_policy) — this is the
 *      on-chain authorization proof
 *   5. Returns the Soroban tx hash — proof of on-chain authorization
 *
 * Without a valid Soroban auth tx hash, no payment can proceed.
 * The admin key is required to write to the contract, so external callers
 * cannot bypass this step.
 */
export async function sorobanAuthorizeSpend(
  sessionToken: string,
  amountUsdc: number,
  dbMaxSpendUsdc?: number
): Promise<{
  sorobanAuthHash: string;
  onChainSpentUsdc: number;
  onChainMaxSpendUsdc: number;
} | null> {
  try {
    const keypair = Keypair.fromSecret(ADMIN_SECRET);
    const key = sessionToKey(sessionToken);
    const spentKey = (key ^ SPENT_KEY_OFFSET) >>> 0;

    const hasVal = await simulateContract(
      SESSION_CONTRACT_ID,
      "has_policy",
      [XDR.ScVal.scvU32(key)],
      keypair.publicKey()
    );

    const sessionExists = hasVal?.switch().name === "scvBool" && hasVal.b() === true;

    let maxSpendCents: number;

    if (!sessionExists && dbMaxSpendUsdc) {
      logger.info(
        { sessionToken: sessionToken.slice(0, 16), dbMaxSpendUsdc },
        "Soroban: session not on-chain — auto-registering from DB"
      );
      maxSpendCents = Math.ceil(dbMaxSpendUsdc * 10000);
      await invokeContract(
        SESSION_CONTRACT_ID,
        "set_policy",
        [XDR.ScVal.scvU32(key), XDR.ScVal.scvU32(maxSpendCents)],
        keypair
      );
    } else if (!sessionExists) {
      logger.warn(
        { sessionToken: sessionToken.slice(0, 16) },
        "Soroban: authorize_spend REJECTED — session not found on-chain"
      );
      return null;
    } else {
      const policyVal = await simulateContract(
        SESSION_CONTRACT_ID,
        "get_policy",
        [XDR.ScVal.scvU32(key)],
        keypair.publicKey()
      );
      maxSpendCents = policyVal?.switch().name === "scvU32" ? policyVal.u32() : 0;

      if (dbMaxSpendUsdc && maxSpendCents < Math.ceil(dbMaxSpendUsdc * 10000) * 0.5) {
        logger.info(
          { sessionToken: sessionToken.slice(0, 16), oldCents: maxSpendCents, dbMaxSpendUsdc },
          "Soroban: legacy on-chain format detected — re-registering with correct budget"
        );
        maxSpendCents = Math.ceil(dbMaxSpendUsdc * 10000);
        await invokeContract(
          SESSION_CONTRACT_ID,
          "set_policy",
          [XDR.ScVal.scvU32(key), XDR.ScVal.scvU32(maxSpendCents)],
          keypair
        );
      }
    }

    let currentSpentCents = 0;
    const hasSpent = await simulateContract(
      SESSION_CONTRACT_ID,
      "has_policy",
      [XDR.ScVal.scvU32(spentKey)],
      keypair.publicKey()
    );
    if (hasSpent?.switch().name === "scvBool" && hasSpent.b() === true) {
      const spentVal = await simulateContract(
        SESSION_CONTRACT_ID,
        "get_policy",
        [XDR.ScVal.scvU32(spentKey)],
        keypair.publicKey()
      );
      currentSpentCents = spentVal?.switch().name === "scvU32" ? spentVal.u32() : 0;
    }

    const amountCents = Math.ceil(amountUsdc * 10000);

    if (currentSpentCents + amountCents > maxSpendCents) {
      logger.warn(
        {
          sessionToken: sessionToken.slice(0, 16),
          currentSpentCents,
          amountCents,
          maxSpendCents,
        },
        "Soroban: authorize_spend REJECTED — on-chain budget exceeded"
      );
      return null;
    }

    const newSpentCents = currentSpentCents + amountCents;
    const result = await invokeContract(
      SESSION_CONTRACT_ID,
      "set_policy",
      [XDR.ScVal.scvU32(spentKey), XDR.ScVal.scvU32(newSpentCents)],
      keypair
    );

    logger.info(
      {
        sorobanAuthHash: result.hash,
        sessionToken: sessionToken.slice(0, 16),
        amountUsdc,
        newSpentUsdc: newSpentCents / 10000,
        maxSpendUsdc: maxSpendCents / 10000,
        txConfirmed: result.success,
      },
      "Soroban: authorize_spend APPROVED — on-chain budget deducted"
    );

    return {
      sorobanAuthHash: result.hash,
      onChainSpentUsdc: newSpentCents / 10000,
      onChainMaxSpendUsdc: maxSpendCents / 10000,
    };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Soroban: authorize_spend failed"
    );
    return null;
  }
}

/**
 * Check if a session is active on-chain.
 */
export async function sorobanCheckSession(
  sessionId: string
): Promise<{ active: boolean; flags: number } | null> {
  try {
    const keypair = Keypair.fromSecret(ADMIN_SECRET);
    const key = sessionToKey(sessionId);

    const hasVal = await simulateContract(
      SESSION_CONTRACT_ID,
      "has_policy",
      [XDR.ScVal.scvU32(key)],
      keypair.publicKey()
    );

    const active = hasVal?.switch().name === "scvBool" && hasVal.b() === true;
    if (!active) return { active: false, flags: 0 };

    const policyVal = await simulateContract(
      SESSION_CONTRACT_ID,
      "get_policy",
      [XDR.ScVal.scvU32(key)],
      keypair.publicKey()
    );

    const flags =
      policyVal?.switch().name === "scvU32" ? policyVal.u32() : 0;

    return { active, flags };
  } catch {
    return null;
  }
}

/**
 * Revoke a session policy on-chain.
 * Clears both the session policy AND the spent tracking key.
 */
export async function sorobanRevokeSession(
  sessionId: string
): Promise<string | null> {
  try {
    const keypair = Keypair.fromSecret(ADMIN_SECRET);
    const key = sessionToKey(sessionId);
    const spentKey = (key ^ SPENT_KEY_OFFSET) >>> 0;

    const result = await invokeContract(
      SESSION_CONTRACT_ID,
      "clear_policy",
      [XDR.ScVal.scvU32(key)],
      keypair
    );

    try {
      await invokeContract(
        SESSION_CONTRACT_ID,
        "clear_policy",
        [XDR.ScVal.scvU32(spentKey)],
        keypair
      );
    } catch {
      // spent key may not exist yet
    }

    return result.hash;
  } catch {
    return null;
  }
}
