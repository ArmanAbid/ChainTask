/**
 * Datum decoders.
 *
 * Convert CBOR-hex inline datums returned by Blockfrost into our typed
 * Onchain* form. The schemas in lib/tx/schemas.ts define the exact wire
 * format; this module just runs `Data.from` against them and maps the
 * raw fields onto our domain-friendly types (bech32 addresses, decoded
 * UTF-8 strings, etc.).
 *
 * If a datum doesn't match the expected schema we return null. This
 * keeps the data layer safe: malformed UTxOs at a script address (which
 * can happen if someone sent funds with a wrong datum) get filtered out
 * rather than crashing the listing.
 */

import { Data, fromHex, toText } from "@lucid-evolution/lucid";
import { env } from "@/config/env";
import {
  EscrowDatum,
  GlobalConfig,
  ProfileDatum,
  ReputationDatum,
  type EscrowDatumT,
  type GlobalConfigT,
  type ProfileDatumT,
  type ReputationDatumT,
} from "@/lib/tx/schemas";
import { addressToBech32 } from "@/lib/tx/address";
import type {
  EscrowUtxo,
  GlobalConfigUtxo,
  OnchainEscrowDatum,
  OnchainGlobalConfig,
  OnchainProfileDatum,
  OnchainReputationDatum,
  OnchainStatus,
  ProfileUtxo,
  ReputationUtxo,
} from "@/types/onchain";
import type { BfUtxo } from "./blockfrost";

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

/**
 * Tries to decode `bytes` (hex string) as UTF-8 text. If it doesn't
 * decode cleanly (i.e. it's binary), falls back to the raw hex string.
 * Useful for fields like `category` that we expect to be text but can't
 * fully guarantee from the chain.
 */
function bytesToText(hex: string): string {
  try {
    const decoded = toText(hex);
    // Quick sanity check: if it decodes to a string with mostly
    // printable characters, accept it. Otherwise stay in hex.
    if (/^[\x20-\x7e]*$/.test(decoded)) return decoded;
    return hex;
  } catch {
    return hex;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Escrow
// ────────────────────────────────────────────────────────────────────────

export function decodeEscrowDatum(cborHex: string): OnchainEscrowDatum | null {
  let raw: EscrowDatumT;
  try {
    raw = Data.from<EscrowDatumT>(cborHex, EscrowDatum);
  } catch {
    return null;
  }

  const clientAddress = addressToBech32(raw.client_address, env.network);
  const arbitratorAddress = addressToBech32(raw.arbitrator_address, env.network);
  if (!clientAddress || !arbitratorAddress) return null;

  const builderAddress = raw.builder_address
    ? addressToBech32(raw.builder_address, env.network)
    : null;
  const disputeRaisedBy = raw.dispute_raised_by
    ? addressToBech32(raw.dispute_raised_by, env.network)
    : null;

  return {
    clientAddress,
    builderAddress,
    arbitratorAddress,
    jobCid: bytesToText(raw.job_cid),
    amountLovelace: raw.amount_lovelace,
    category: bytesToText(raw.category),
    createdAt: raw.created_at,
    selectedAt: raw.selected_at,
    submittedAt: raw.submitted_at,
    submissionCid: raw.submission_cid ? bytesToText(raw.submission_cid) : null,
    autoReleaseDeadlineSeconds: raw.auto_release_deadline,
    autoRefundDeadlineSeconds: raw.auto_refund_deadline,
    disputeRaisedBy,
    disputeRaisedAt: raw.dispute_raised_at,
    disputeEvidenceCid: raw.dispute_evidence_cid
      ? bytesToText(raw.dispute_evidence_cid)
      : null,
    status: raw.status as OnchainStatus,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Reputation
// ────────────────────────────────────────────────────────────────────────

export function decodeReputationDatum(
  cborHex: string,
): OnchainReputationDatum | null {
  let raw: ReputationDatumT;
  try {
    raw = Data.from<ReputationDatumT>(cborHex, ReputationDatum);
  } catch {
    return null;
  }
  const builderAddress = addressToBech32(raw.builder_address, env.network);
  if (!builderAddress) return null;

  return {
    builderAddress,
    completedJobs: raw.completed_jobs,
    totalVolumeLovelace: raw.total_volume_lovelace,
    disputesWon: raw.disputes_won,
    disputesLost: raw.disputes_lost,
    withdrawals: raw.withdrawals,
    firstJobTimestamp: raw.first_job_timestamp,
    lastActivityTimestamp: raw.last_activity_timestamp,
    recentJobCids: raw.recent_job_cids.map(bytesToText),
  };
}

// ────────────────────────────────────────────────────────────────────────
// Profile
// ────────────────────────────────────────────────────────────────────────

export function decodeProfileDatum(
  cborHex: string,
): OnchainProfileDatum | null {
  let raw: ProfileDatumT;
  try {
    raw = Data.from<ProfileDatumT>(cborHex, ProfileDatum);
  } catch {
    return null;
  }
  const ownerAddress = addressToBech32(raw.owner_address, env.network);
  if (!ownerAddress) return null;
  return {
    ownerAddress,
    profileCid: bytesToText(raw.profile_cid),
  };
}

// ────────────────────────────────────────────────────────────────────────
// Global config
// ────────────────────────────────────────────────────────────────────────

export function decodeGlobalConfig(
  cborHex: string,
): OnchainGlobalConfig | null {
  let raw: GlobalConfigT;
  try {
    raw = Data.from<GlobalConfigT>(cborHex, GlobalConfig);
  } catch {
    return null;
  }
  const treasuryAddress = addressToBech32(raw.treasury_address, env.network);
  if (!treasuryAddress) return null;
  return {
    treasuryAddress,
    minJobAmountLovelace: raw.min_job_amount_lovelace,
    platformCutPercent: raw.platform_cut_percent,
    disputeFeeLovelace: raw.dispute_fee_lovelace,
  };
}

// ────────────────────────────────────────────────────────────────────────
// UTxO transformers
// ────────────────────────────────────────────────────────────────────────

function lovelaceFromAmounts(
  amount: { unit: string; quantity: string }[],
): bigint {
  const ada = amount.find((a) => a.unit === "lovelace");
  return ada ? BigInt(ada.quantity) : 0n;
}

export function toEscrowUtxo(u: BfUtxo): EscrowUtxo | null {
  if (!u.inline_datum) return null;
  const datum = decodeEscrowDatum(u.inline_datum);
  if (!datum) return null;
  return {
    txHash: u.tx_hash,
    outputIndex: u.output_index,
    address: u.address,
    lovelace: lovelaceFromAmounts(u.amount),
    datum,
  };
}

export function toReputationUtxo(u: BfUtxo): ReputationUtxo | null {
  if (!u.inline_datum) return null;
  const datum = decodeReputationDatum(u.inline_datum);
  if (!datum) return null;
  return {
    txHash: u.tx_hash,
    outputIndex: u.output_index,
    address: u.address,
    lovelace: lovelaceFromAmounts(u.amount),
    datum,
  };
}

export function toProfileUtxo(u: BfUtxo): ProfileUtxo | null {
  if (!u.inline_datum) return null;
  const datum = decodeProfileDatum(u.inline_datum);
  if (!datum) return null;
  return {
    txHash: u.tx_hash,
    outputIndex: u.output_index,
    address: u.address,
    lovelace: lovelaceFromAmounts(u.amount),
    datum,
  };
}

export function toGlobalConfigUtxo(u: BfUtxo): GlobalConfigUtxo | null {
  if (!u.inline_datum) return null;
  const datum = decodeGlobalConfig(u.inline_datum);
  if (!datum) return null;
  return {
    txHash: u.tx_hash,
    outputIndex: u.output_index,
    address: u.address,
    lovelace: lovelaceFromAmounts(u.amount),
    datum,
  };
}

// Re-export so callers can also encode (used by tx builders)
export { fromHex };
