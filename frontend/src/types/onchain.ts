/**
 * On-chain type mirrors.
 *
 * These types match the Aiken contract datums byte-for-byte after CBOR
 * decoding. Use these for any data that came from the chain or is about
 * to be put on the chain. For UI-friendly types, see ./domain.ts.
 *
 * Conventions:
 *   - Addresses are bech32 strings (addr1..., addr_test1...).
 *   - All ADA amounts are bigints in lovelace (1 ADA = 1_000_000 lovelace).
 *   - Timestamps are bigints in POSIX milliseconds.
 *   - Aiken's Option<T> maps to T | null.
 *   - ByteArrays from chain are decoded to either:
 *       - utf8 strings when semantically text (category, IPFS CID)
 *       - hex strings when opaque bytes (script hashes, tx ids)
 */

// ────────────────────────────────────────────────────────────────────────
// Status
// ────────────────────────────────────────────────────────────────────────

export type OnchainStatus = "Open" | "Selected" | "Submitted" | "Disputed";

// ────────────────────────────────────────────────────────────────────────
// Escrow datum
// ────────────────────────────────────────────────────────────────────────

export interface OnchainEscrowDatum {
  /** Bech32 address of the client who posted the job. */
  clientAddress: string;
  /** Bech32 address of the selected builder, or null while Open. */
  builderAddress: string | null;
  /** Bech32 address of the arbitrator assigned to this job. */
  arbitratorAddress: string;
  /** IPFS CID (v0 or v1) of the job description JSON. */
  jobCid: string;
  /** Lovelace locked in the escrow UTxO. */
  amountLovelace: bigint;
  /** Coarse category, max 16 bytes (e.g. "design", "dev"). */
  category: string;
  /** POSIX ms of when the job was first posted. */
  createdAt: bigint;
  /** POSIX ms of when a builder was selected. Null while Open. */
  selectedAt: bigint | null;
  /** POSIX ms of when the builder submitted work. Null while Open/Selected. */
  submittedAt: bigint | null;
  /**
   * IPFS CID of the builder's work submission. Required when status is
   * Submitted/Disputed; null while Open/Selected. Set by the Submit
   * redeemer and frozen thereafter.
   */
  submissionCid: string | null;
  /** Relative seconds; auto-release triggers at submittedAt + this. */
  autoReleaseDeadlineSeconds: bigint;
  /** Relative seconds; auto-refund triggers at selectedAt + this. */
  autoRefundDeadlineSeconds: bigint;
  /** Bech32 of whoever raised the dispute, or null. */
  disputeRaisedBy: string | null;
  /** POSIX ms when dispute was raised, or null. */
  disputeRaisedAt: bigint | null;
  /** IPFS CID of dispute evidence, or null. */
  disputeEvidenceCid: string | null;
  status: OnchainStatus;
}

// ────────────────────────────────────────────────────────────────────────
// Reputation datum
// ────────────────────────────────────────────────────────────────────────

export interface OnchainReputationDatum {
  builderAddress: string;
  completedJobs: bigint;
  totalVolumeLovelace: bigint;
  disputesWon: bigint;
  disputesLost: bigint;
  withdrawals: bigint;
  /** POSIX ms of the builder's first completed job. */
  firstJobTimestamp: bigint;
  /** POSIX ms of the most recent activity affecting reputation. */
  lastActivityTimestamp: bigint;
  /** Recent completed job CIDs, max 10. Newest first. */
  recentJobCids: string[];
}

// ────────────────────────────────────────────────────────────────────────
// Profile datum
// ────────────────────────────────────────────────────────────────────────

/**
 * Self-attested profile UTxO. One per wallet, lazily created the first
 * time a user saves a profile. Independent from reputation — anyone can
 * have a profile from day one.
 *
 * The profile content (display name, bio, avatar) lives off-chain on
 * IPFS; only the pointing CID is on chain.
 */
export interface OnchainProfileDatum {
  /** The wallet that owns this profile. */
  ownerAddress: string;
  /** IPFS CID of the profile JSON: `{ display_name, bio?, avatar_cid? }`. */
  profileCid: string;
}

// ────────────────────────────────────────────────────────────────────────
// Global config (admin reference UTxO)
// ────────────────────────────────────────────────────────────────────────

export interface OnchainGlobalConfig {
  treasuryAddress: string;
  /** Smallest accepted job size in lovelace. */
  minJobAmountLovelace: bigint;
  /** Treasury cut as a whole-percent integer (e.g. 5 = 5%). */
  platformCutPercent: bigint;
  /** Fixed dispute fee in lovelace. Always paid to treasury on Resolve. */
  disputeFeeLovelace: bigint;
}

// ────────────────────────────────────────────────────────────────────────
// UTxO envelope
// ────────────────────────────────────────────────────────────────────────

/**
 * A typed UTxO carrying a decoded datum. Wraps the bare Lucid UTxO with
 * our decoded form so consumers don't have to know about CBOR.
 */
export interface TypedUtxo<T> {
  txHash: string;
  outputIndex: number;
  address: string;
  /** Total lovelace at this UTxO (may include non-ADA assets in future). */
  lovelace: bigint;
  datum: T;
}

export type EscrowUtxo = TypedUtxo<OnchainEscrowDatum>;
export type ReputationUtxo = TypedUtxo<OnchainReputationDatum>;
export type ProfileUtxo = TypedUtxo<OnchainProfileDatum>;
export type GlobalConfigUtxo = TypedUtxo<OnchainGlobalConfig>;
