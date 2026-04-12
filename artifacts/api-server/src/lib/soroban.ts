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

/**
 * Create / update a session policy on-chain.
 *
 * @param sessionId       Session identifier (UUID or hex string)
 * @param agentAddress    Agent's Stellar public key (for flags derivation)
 * @param maxSpendStroops Spend cap in stroops
 * @param durationSeconds Session lifetime
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
    const flags = Math.min(
      Math.ceil(Number(maxSpendStroops) / 1_000_000) | (durationSeconds & 0xff),
      4294967295
    );

    const result = await invokeContract(
      SESSION_CONTRACT_ID,
      "set_policy",
      [XDR.ScVal.scvU32(key), XDR.ScVal.scvU32(flags)],
      keypair
    );

    logger.info(
      { hash: result.hash, agentAddress, maxSpendStroops, durationSeconds },
      "Soroban: session_policy.set_policy submitted"
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
 */
export async function sorobanRevokeSession(
  sessionId: string
): Promise<string | null> {
  try {
    const keypair = Keypair.fromSecret(ADMIN_SECRET);
    const key = sessionToKey(sessionId);

    const result = await invokeContract(
      SESSION_CONTRACT_ID,
      "clear_policy",
      [XDR.ScVal.scvU32(key)],
      keypair
    );

    return result.hash;
  } catch {
    return null;
  }
}
