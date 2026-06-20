/**
 * Compiled validator scripts.
 *
 * After `aiken build` produces `plutus.json`, the deploy script extracts
 * the three validators' compiled CBOR and writes them into this module
 * as constants. The frontend uses them to:
 *
 *   1. Compute the parameterized script addresses (escrow needs the
 *      admin_policy parameter applied; reputation needs the escrow
 *      script hash applied).
 *   2. Attach as `spend` scripts when consuming UTxOs.
 *
 * These are the canonical Plutus V3 scripts. They never change at
 * runtime — only when the contracts are recompiled and redeployed.
 */

import { applyParamsToScript, validatorToAddress, validatorToScriptHash, Data } from "@lucid-evolution/lucid";
import type { Network, SpendingValidator } from "@lucid-evolution/lucid";
import { env } from "@/config/env";

// ──────────────────────────────────────────────────────────────────────
// Raw compiled CBOR — set by the deploy script.
//
// Until deploy lands, these are empty strings. The deploy script
// (scripts/deploy.ts) updates them in-place after `aiken build` and
// regenerates this file.
// ──────────────────────────────────────────────────────────────────────

/** escrow.escrow.spend — parameterized by admin_policy: PolicyId. */
export const ESCROW_VALIDATOR_CBOR = "";

/** reputation.reputation.spend — parameterized by escrow_script_hash. */
export const REPUTATION_VALIDATOR_CBOR = "";

/** profile.profile.spend — no parameters. */
export const PROFILE_VALIDATOR_CBOR = "";

// ──────────────────────────────────────────────────────────────────────
// Validator constructors
// ──────────────────────────────────────────────────────────────────────

const network = env.network as Network;

/**
 * Build the escrow spending validator. Applies the admin_policy
 * parameter to the raw script. If the admin policy id isn't yet set in
 * env (i.e. contracts aren't deployed), returns null.
 */
export function getEscrowValidator(): SpendingValidator | null {
  if (!ESCROW_VALIDATOR_CBOR || !env.adminPolicyId) return null;
  const applied = applyParamsToScript(ESCROW_VALIDATOR_CBOR, [env.adminPolicyId]);
  return { type: "PlutusV3", script: applied };
}

export function getReputationValidator(): SpendingValidator | null {
  if (!REPUTATION_VALIDATOR_CBOR) return null;
  const escrow = getEscrowValidator();
  if (!escrow) return null;
  const escrowHash = validatorToScriptHash(escrow);
  const applied = applyParamsToScript(REPUTATION_VALIDATOR_CBOR, [escrowHash]);
  return { type: "PlutusV3", script: applied };
}

export function getProfileValidator(): SpendingValidator | null {
  if (!PROFILE_VALIDATOR_CBOR) return null;
  return { type: "PlutusV3", script: PROFILE_VALIDATOR_CBOR };
}

// ──────────────────────────────────────────────────────────────────────
// Script-derived addresses (cached at module load)
//
// These match the env variables that the deploy script also fills in
// (VITE_ESCROW_SCRIPT_ADDRESS, etc.). We compute them from the script
// when available, and fall back to the env value otherwise — that way
// the addresses are consistent even before the scripts are wired in.
// ──────────────────────────────────────────────────────────────────────

export function escrowAddress(): string {
  if (env.escrowScriptAddress) return env.escrowScriptAddress;
  const v = getEscrowValidator();
  if (!v) throw new Error("Escrow validator not configured");
  return validatorToAddress(network, v);
}

export function reputationAddress(): string {
  if (env.reputationScriptAddress) return env.reputationScriptAddress;
  const v = getReputationValidator();
  if (!v) throw new Error("Reputation validator not configured");
  return validatorToAddress(network, v);
}

export function profileAddress(): string {
  if (env.profileScriptAddress) return env.profileScriptAddress;
  const v = getProfileValidator();
  if (!v) throw new Error("Profile validator not configured");
  return validatorToAddress(network, v);
}

// Re-exports so builders can use Data.to for redeemers without
// importing from @lucid-evolution/lucid directly everywhere.
export { Data };
