//// ChainTask shared types: Datum, Redeemer, Status, and Config.
//// Used by both the escrow validator and the reputation validator.

use cardano/address.{Address}

/// The dynamic configuration stored in a reference UTxO.
/// Allows the protocol to update fees and cuts based on ADA price fluctuations 
/// without needing to redeploy the escrow validator.
pub type GlobalConfig {
  treasury_address: Address,
  min_job_amount_lovelace: Int,
  // e.g., 20_000_000 (20 ADA)
  platform_cut_percent: Int,
  // e.g., 5 (5%)
  dispute_fee_lovelace: Int,
}

// e.g., 15_000_000 (15 ADA)

/// Status of an escrow job. Drives which redeemers are valid in which phase.
pub type Status {
  Open
  Selected
  Submitted
  Disputed
}

/// Full escrow datum. Capped at 256 bytes to defend against ex-units griefing.
///
/// Field-level immutability is enforced per redeemer in escrow.ak — only the
/// fields explicitly listed for a given action may change between input and
/// output datum.
pub type EscrowDatum {
  client_address: Address,
  builder_address: Option<Address>,
  arbitrator_address: Address,
  /// IPFS CID of the job description JSON. Fixed-length ByteArray.
  job_cid: ByteArray,
  /// Locked job payment. Validator enforces this against the GlobalConfig min amount.
  amount_lovelace: Int,
  //IPFS roundtrip per listing
  category: ByteArray,
  /// Block POSIX time at posting / selection / submission. None until reached.
  /// Stored as milliseconds since epoch (Int).
  created_at: Int,
  selected_at: Option<Int>,
  submitted_at: Option<Int>,
  submission_cid: Option<ByteArray>,
  /// Relative seconds. Builder may AutoRelease after submitted_at + this delay.
  auto_release_deadline: Int,
  /// Relative seconds. Client may AutoRefund after selected_at + this delay.
  auto_refund_deadline: Int,
  /// Address that raised the active dispute, if any.
  dispute_raised_by: Option<Address>,
  dispute_raised_at: Option<Int>,
  dispute_evidence_cid: Option<ByteArray>,
  status: Status,
}

/// All valid actions on an escrow UTxO.
pub type EscrowRedeemer {
  Apply
  Update {
    new_job_cid: ByteArray,
    new_amount_lovelace: Int,
    new_category: ByteArray,
  }
  Select { builder: Address }
  Submit { submission_cid: ByteArray }
  AmendSubmission { new_submission_cid: ByteArray }
  Release
  Refund
  BuilderWithdraw
  Dispute { evidence_cid: ByteArray }
  Resolve { release_to_builder: Bool }
  AutoRelease
  AutoRefund
  ArbitratorTimeout
}

/// Builder reputation, stored as a single UTxO per builder address.
/// Updated sequentially to prevent concurrency forks on multiple releases.
pub type ReputationDatum {
  builder_address: Address,
  completed_jobs: Int,
  total_volume_lovelace: Int,
  disputes_won: Int,
  disputes_lost: Int,
  withdrawals: Int,
  first_job_timestamp: Int,
  last_activity_timestamp: Int,
  recent_job_cids: List<ByteArray>,
}

pub type ReputationRedeemer {
  IncrementOnRelease { volume: Int, timestamp: Int, job_cid: ByteArray }
  IncrementOnWithdraw { timestamp: Int }
  IncrementDisputeOutcome { won: Bool, timestamp: Int }
}

pub type ProfileDatum {
  /// The wallet that owns this profile. Only this address can update the CID.
  owner_address: Address,
  /// IPFS CID of the profile JSON: { display_name, bio?, avatar_cid? }.
  profile_cid: ByteArray,
}

pub type ProfileRedeemer {
  /// Update the pointed-to CID. Owner-signed.
  UpdateProfile { new_profile_cid: ByteArray }
}

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

pub const default_auto_release_seconds: Int = 1_209_600

// 14 days

pub const default_auto_refund_seconds: Int = 1_209_600

// 14 days

pub const arbitrator_timeout_seconds: Int = 1_209_600

// 14 days

/// Maximum datum size. Bounded to keep validator ex-units predictable.
pub const max_datum_bytes: Int = 512

pub const max_category_bytes: Int = 16

pub const max_recent_jobs: Int = 10

pub const max_evidence_cid_bytes: Int = 64

pub const max_submission_cid_bytes: Int = 64

pub const max_profile_cid_bytes: Int = 64
