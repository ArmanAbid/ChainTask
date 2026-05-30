

import type { OnchainStatus } from "./onchain";

// ────────────────────────────────────────────────────────────────────────
// Status (frontend-only extensions)
// ────────────────────────────────────────────────────────────────────────

export type JobStatus =
  | "Open"
  | "Selected"
  | "Submitted"
  | "Disputed"
  | "Completed"
  | "Cancelled";

/** A user's current "lens" into the app. Affects sidebar nav + dashboard copy. */
export type Role = "client" | "builder" | "arbitrator";

// ────────────────────────────────────────────────────────────────────────
// Money
// ────────────────────────────────────────────────────────────────────────

/** ADA as a plain number, intended for display. Precision-safe up to ~9 trillion ADA. */
export type Ada = number;

// ────────────────────────────────────────────────────────────────────────
// Job
// ────────────────────────────────────────────────────────────────────────

export interface Job {
  /** Composite id: `${txHash}#${outputIndex}` of the active escrow UTxO. */
  id: string;
  /** Off-chain title, sourced from the IPFS-pinned job description. */
  title: string;
  /** Off-chain description, sourced from IPFS. */
  description: string;
  category: string;
  /** Off-chain skills/tags, sourced from IPFS. */
  skills: string[];
  /** Lovelace locked in escrow, as ADA for display. */
  budget: Ada;
  /** Bech32 of the client. */
  clientAddress: string;
  /** Bech32 of the selected builder, or null. */
  builderAddress: string | null;
  /** Bech32 of the assigned arbitrator. */
  arbitratorAddress: string;
  /** IPFS CID of job description, for reading the full off-chain content. */
  jobCid: string;
  createdAt: Date;
  selectedAt: Date | null;
  submittedAt: Date | null;
  /** When auto-release will trigger if no client action. Null while not Submitted. */
  autoReleaseAt: Date | null;
  /** When auto-refund will trigger if no builder submission. Null while not Selected. */
  autoRefundAt: Date | null;
  disputeRaisedBy: string | null;
  disputeRaisedAt: Date | null;
  /** When arbitrator timeout becomes available. Null unless Disputed. */
  arbitratorTimeoutAt: Date | null;
  disputeEvidenceCid: string | null;
  status: JobStatus;
}

// ────────────────────────────────────────────────────────────────────────
// Builder reputation
// ────────────────────────────────────────────────────────────────────────

export interface BuilderReputation {
  builderAddress: string;
  completedJobs: number;
  /** Total ADA earned across all jobs. */
  totalVolume: Ada;
  disputesWon: number;
  disputesLost: number;
  withdrawals: number;
  firstActiveAt: Date;
  lastActiveAt: Date;
  /** Up to 10 most recent completed-job IPFS CIDs, newest first. */
  recentJobCids: string[];
}

// ────────────────────────────────────────────────────────────────────────
// Protocol config
// ────────────────────────────────────────────────────────────────────────

export interface ProtocolConfig {
  treasuryAddress: string;
  minJobAmount: Ada;
  platformCutPercent: number;
  disputeFee: Ada;
}

// ────────────────────────────────────────────────────────────────────────
// Network
// ────────────────────────────────────────────────────────────────────────

export type CardanoNetwork = "Mainnet" | "Preview" | "Preprod";

// Re-export the on-chain status so consumers don't need two imports.
export type { OnchainStatus };
