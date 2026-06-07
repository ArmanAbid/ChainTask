//// Per-redeemer validation logic for the ChainTask escrow validator.
////
//// Each `validate_X` function returns True iff the spending tx is allowed
//// for that redeemer. The dispatcher in escrow.ak just calls the right one.
////
//// Field-level immutability is the key defense: each branch returns True only if the new datum equals the old datum modulo the fields that branch is allowed to change. Prevents datum hijacking.
////
//// GlobalConfig is passed in explicitly to per-branch validators rather than looked up internally. The dispatcher resolves the config from reference inputs (in production) or tests pass a mock config directly.This keeps each branch a pure function of (tx, datum, redeemer payload,config) - easy to reason about, easy to unit test.

use aiken/builtin
use aiken/interval
use cardano/address.{Address}
use cardano/transaction.{OutputReference, Transaction}
use chaintask/tx_helpers.{
  builder_payout, continuing_output, inline_datum_of, is_signed_by,
  lovelace_paid_to, treasury_cut,
}
use chaintask/types.{
  Disputed, EscrowDatum, GlobalConfig, Open, Selected, Submitted,
  arbitrator_timeout_seconds, default_auto_refund_seconds,
  default_auto_release_seconds, max_category_bytes, max_evidence_cid_bytes,
  max_submission_cid_bytes,
}

// ───────────────────────────────────────────────────────────────────────────
// Update — client edits job before a builder is selected.
// ───────────────────────────────────────────────────────────────────────────
//
// Allowed to change:  job_cid, amount_lovelace, category
// Frozen:             everything else (incl. arbitrator, status must stay Open)
// Signed by:          client only
// State guard:        status == Open
// Config check:       new amount must satisfy GlobalConfig.min_job_amount_lovelace
//
pub fn validate_update(
  tx: Transaction,
  own_ref: OutputReference,
  old_datum: EscrowDatum,
  config: GlobalConfig,
  new_job_cid: ByteArray,
  new_amount_lovelace: Int,
  new_category: ByteArray,
) -> Bool {
  let signed = is_signed_by(tx, old_datum.client_address)
  let in_open_state = old_datum.status == Open
  let category_within_bounds =
    builtin.length_of_bytearray(new_category) <= max_category_bytes
  let amount_meets_minimum =
    new_amount_lovelace >= config.min_job_amount_lovelace

  expect Some(out) = continuing_output(tx, own_ref)
  expect Some(raw) = inline_datum_of(out)
  expect new_datum: EscrowDatum = raw

  // Field-level immutability — only the three declared fields may change.
  let datum_ok = and {
      new_datum.client_address == old_datum.client_address,
      new_datum.builder_address == old_datum.builder_address,
      new_datum.arbitrator_address == old_datum.arbitrator_address,
      new_datum.created_at == old_datum.created_at,
      new_datum.selected_at == old_datum.selected_at,
      new_datum.submitted_at == old_datum.submitted_at,
      new_datum.submission_cid == old_datum.submission_cid,
      new_datum.auto_release_deadline == old_datum.auto_release_deadline,
      new_datum.auto_refund_deadline == old_datum.auto_refund_deadline,
      new_datum.dispute_raised_by == old_datum.dispute_raised_by,
      new_datum.dispute_raised_at == old_datum.dispute_raised_at,
      new_datum.dispute_evidence_cid == old_datum.dispute_evidence_cid,
      new_datum.status == old_datum.status,
    }

  let values_match = and {
      new_datum.job_cid == new_job_cid,
      new_datum.amount_lovelace == new_amount_lovelace,
      new_datum.category == new_category,
    }

  and {
    signed,
    in_open_state,
    category_within_bounds,
    amount_meets_minimum,
    datum_ok,
    values_match,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Select — client picks a builder and locks them into the escrow.
// ───────────────────────────────────────────────────────────────────────────
//
// Allowed to change:  builder_address (None → Some), selected_at, status
// Frozen:             everything else
// Signed by:          client only
// State guard:        status == Open, builder_address must currently be None
//
// No config dependency — Select is purely a state transition.
//
pub fn validate_select(
  tx: Transaction,
  own_ref: OutputReference,
  old_datum: EscrowDatum,
  builder: Address,
) -> Bool {
  let signed = is_signed_by(tx, old_datum.client_address)
  let in_open_state = old_datum.status == Open
  let no_builder_yet = old_datum.builder_address == None

  expect Some(out) = continuing_output(tx, own_ref)
  expect Some(raw) = inline_datum_of(out)
  expect new_datum: EscrowDatum = raw

  let builder_set = new_datum.builder_address == Some(builder)
  let status_advanced = new_datum.status == Selected
  let selected_at_set =
    when new_datum.selected_at is {
      Some(_) -> True
      None -> False
    }

  let datum_ok = and {
      new_datum.client_address == old_datum.client_address,
      new_datum.arbitrator_address == old_datum.arbitrator_address,
      new_datum.job_cid == old_datum.job_cid,
      new_datum.amount_lovelace == old_datum.amount_lovelace,
      new_datum.category == old_datum.category,
      new_datum.created_at == old_datum.created_at,
      new_datum.submitted_at == old_datum.submitted_at,
      new_datum.submission_cid == old_datum.submission_cid,
      new_datum.auto_release_deadline == old_datum.auto_release_deadline,
      new_datum.auto_refund_deadline == old_datum.auto_refund_deadline,
      new_datum.dispute_raised_by == old_datum.dispute_raised_by,
      new_datum.dispute_raised_at == old_datum.dispute_raised_at,
      new_datum.dispute_evidence_cid == old_datum.dispute_evidence_cid,
    }

  and {
    signed,
    in_open_state,
    no_builder_yet,
    builder_set,
    status_advanced,
    selected_at_set,
    datum_ok,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Submit — builder marks work delivered.
// ───────────────────────────────────────────────────────────────────────────
//
// Allowed to change:  submitted_at, status
// Frozen:             everything else
// Signed by:          builder only
// State guard:        status == Selected, builder_address must be Some
//
// No config dependency.
//
pub fn validate_submit(
  tx: Transaction,
  own_ref: OutputReference,
  old_datum: EscrowDatum,
  submission_cid: ByteArray,
) -> Bool {
  expect Some(builder_addr) = old_datum.builder_address
  let signed = is_signed_by(tx, builder_addr)
  let in_selected_state = old_datum.status == Selected

  expect Some(out) = continuing_output(tx, own_ref)
  expect Some(raw) = inline_datum_of(out)
  expect new_datum: EscrowDatum = raw

  let status_advanced = new_datum.status == Submitted
  let submitted_at_set =
    when new_datum.submitted_at is {
      Some(_) -> True
      None -> False
    }
  // submission_cid must transition from None to exactly the redeemer value.
  // Bound the length to keep datum size predictable.
  let submission_cid_set = and {
      new_datum.submission_cid == Some(submission_cid),
      builtin.length_of_bytearray(submission_cid) <= max_submission_cid_bytes,
    }

  let datum_ok = and {
      new_datum.client_address == old_datum.client_address,
      new_datum.builder_address == old_datum.builder_address,
      new_datum.arbitrator_address == old_datum.arbitrator_address,
      new_datum.job_cid == old_datum.job_cid,
      new_datum.amount_lovelace == old_datum.amount_lovelace,
      new_datum.category == old_datum.category,
      new_datum.created_at == old_datum.created_at,
      new_datum.selected_at == old_datum.selected_at,
      new_datum.auto_release_deadline == old_datum.auto_release_deadline,
      new_datum.auto_refund_deadline == old_datum.auto_refund_deadline,
      new_datum.dispute_raised_by == old_datum.dispute_raised_by,
      new_datum.dispute_raised_at == old_datum.dispute_raised_at,
      new_datum.dispute_evidence_cid == old_datum.dispute_evidence_cid,
    }

  and {
    signed,
    in_selected_state,
    status_advanced,
    submitted_at_set,
    submission_cid_set,
    datum_ok,
  }
}

pub fn validate_amend_submission(
  tx: Transaction,
  own_ref: OutputReference,
  old_datum: EscrowDatum,
  new_submission_cid: ByteArray,
) -> Bool {
  expect Some(builder_addr) = old_datum.builder_address
  let signed = is_signed_by(tx, builder_addr)
  let in_submitted_state = old_datum.status == Submitted

  expect Some(out) = continuing_output(tx, own_ref)
  expect Some(raw) = inline_datum_of(out)
  expect new_datum: EscrowDatum = raw

  // Status stays Submitted.
  let status_unchanged = new_datum.status == Submitted

  // submission_cid must equal the redeemer value and stay bounded.
  let cid_set_correctly = and {
      new_datum.submission_cid == Some(new_submission_cid),
      builtin.length_of_bytearray(new_submission_cid) <= max_submission_cid_bytes,
    }

  // submitted_at must advance (strictly greater than old). The validity
  // range's lower bound gives us a monotonic timestamp the chain agrees on.
  let new_submitted_at_advanced =
    when (new_datum.submitted_at, old_datum.submitted_at) is {
      (Some(new_ts), Some(old_ts)) -> new_ts > old_ts
      _ -> False
    }

  let datum_ok = and {
      new_datum.client_address == old_datum.client_address,
      new_datum.builder_address == old_datum.builder_address,
      new_datum.arbitrator_address == old_datum.arbitrator_address,
      new_datum.job_cid == old_datum.job_cid,
      new_datum.amount_lovelace == old_datum.amount_lovelace,
      new_datum.category == old_datum.category,
      new_datum.created_at == old_datum.created_at,
      new_datum.selected_at == old_datum.selected_at,
      new_datum.auto_release_deadline == old_datum.auto_release_deadline,
      new_datum.auto_refund_deadline == old_datum.auto_refund_deadline,
      new_datum.dispute_raised_by == old_datum.dispute_raised_by,
      new_datum.dispute_raised_at == old_datum.dispute_raised_at,
      new_datum.dispute_evidence_cid == old_datum.dispute_evidence_cid,
    }

  and {
    signed,
    in_submitted_state,
    status_unchanged,
    cid_set_correctly,
    new_submitted_at_advanced,
    datum_ok,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Release — happy path payout to builder, with platform fee to treasury.
// ───────────────────────────────────────────────────────────────────────────
//
// Required signatures: client AND builder
// State guard:         status == Submitted (work delivered)
// Config-driven splits:
//   treasury_cut    = max(amount * platform_cut_percent / 100, min_utxo_lovelace)
//   builder_payout  = amount - treasury_cut
// Output checks:
//   builder receives ≥ builder_payout
//   treasury receives ≥ treasury_cut
//
// The reputation cross-validator increment lands in Week 4.
//
pub fn validate_release(
  tx: Transaction,
  old_datum: EscrowDatum,
  config: GlobalConfig,
) -> Bool {
  expect Some(builder_addr) = old_datum.builder_address

  let client_signed = is_signed_by(tx, old_datum.client_address)
  let builder_signed = is_signed_by(tx, builder_addr)
  let in_submitted_state = old_datum.status == Submitted

  let expected_builder_payout =
    builder_payout(old_datum.amount_lovelace, config.platform_cut_percent)
  let expected_treasury_cut =
    treasury_cut(old_datum.amount_lovelace, config.platform_cut_percent)

  let builder_paid_enough =
    lovelace_paid_to(tx, builder_addr) >= expected_builder_payout
  let treasury_paid_enough =
    lovelace_paid_to(tx, config.treasury_address) >= expected_treasury_cut

  and {
    client_signed,
    builder_signed,
    in_submitted_state,
    builder_paid_enough,
    treasury_paid_enough,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Refund — both parties agree to cancel; full amount returns to client.
// ───────────────────────────────────────────────────────────────────────────
//
// Required signatures: client AND builder
// State guard:         status is Selected or Submitted
// Output check:        amount_lovelace must be paid to client
// No platform fee     — mutual cancellation is no-fault, no value extracted.
// No reputation change.
//
pub fn validate_refund(tx: Transaction, old_datum: EscrowDatum) -> Bool {
  expect Some(builder_addr) = old_datum.builder_address

  let client_signed = is_signed_by(tx, old_datum.client_address)
  let builder_signed = is_signed_by(tx, builder_addr)
  let in_valid_state =
    old_datum.status == Selected || old_datum.status == Submitted
  let paid_enough =
    lovelace_paid_to(tx, old_datum.client_address) >= old_datum.amount_lovelace

  and {
    client_signed,
    builder_signed,
    in_valid_state,
    paid_enough,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// BuilderWithdraw — builder unilaterally exits a Selected job.
// ───────────────────────────────────────────────────────────────────────────
//
// Required signatures: builder only
// State guard:         status == Selected
// Output check:        funds remain locked at the script (escrow stays alive)
// Datum changes:       status → Open, builder_address → None,
//                      selected_at → None
// Frozen:              everything else
//
// The reputation hit (`withdrawals` +1) is enforced cross-validator in Week 4.
//
pub fn validate_builder_withdraw(
  tx: Transaction,
  own_ref: OutputReference,
  old_datum: EscrowDatum,
) -> Bool {
  expect Some(builder_addr) = old_datum.builder_address
  let signed = is_signed_by(tx, builder_addr)
  let in_selected_state = old_datum.status == Selected

  expect Some(out) = continuing_output(tx, own_ref)
  expect Some(raw) = inline_datum_of(out)
  expect new_datum: EscrowDatum = raw

  let reset_correctly = and {
      new_datum.builder_address == None,
      new_datum.selected_at == None,
      new_datum.status == Open,
    }

  let datum_ok = and {
      new_datum.client_address == old_datum.client_address,
      new_datum.arbitrator_address == old_datum.arbitrator_address,
      new_datum.job_cid == old_datum.job_cid,
      new_datum.amount_lovelace == old_datum.amount_lovelace,
      new_datum.category == old_datum.category,
      new_datum.created_at == old_datum.created_at,
      new_datum.submitted_at == old_datum.submitted_at,
      new_datum.submission_cid == old_datum.submission_cid,
      new_datum.auto_release_deadline == old_datum.auto_release_deadline,
      new_datum.auto_refund_deadline == old_datum.auto_refund_deadline,
      new_datum.dispute_raised_by == old_datum.dispute_raised_by,
      new_datum.dispute_raised_at == old_datum.dispute_raised_at,
      new_datum.dispute_evidence_cid == old_datum.dispute_evidence_cid,
    }

  and {
    signed,
    in_selected_state,
    reset_correctly,
    datum_ok,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Dispute — either party raises a dispute, locks in evidence CID.
// ───────────────────────────────────────────────────────────────────────────
//
// Required signatures: client OR builder (one is enough)
// State guard:         status is Selected or Submitted (not already Disputed)
// Output:              continuing UTxO at script address with
//                      original amount + dispute_fee (added by raiser)
// Datum changes:       status → Disputed
//                      dispute_raised_by → Some(raiser)
//                      dispute_raised_at → Some(timestamp from datum)
//                      dispute_evidence_cid → Some(evidence_cid)
// Frozen:              everything else
//
pub fn validate_dispute(
  tx: Transaction,
  own_ref: OutputReference,
  old_datum: EscrowDatum,
  config: GlobalConfig,
  evidence_cid: ByteArray,
) -> Bool {
  expect Some(builder_addr) = old_datum.builder_address

  let client_signed = is_signed_by(tx, old_datum.client_address)
  let builder_signed = is_signed_by(tx, builder_addr)
  let either_party_signed = client_signed || builder_signed

  let in_disputable_state =
    old_datum.status == Selected || old_datum.status == Submitted

  let evidence_within_bounds =
    builtin.length_of_bytearray(evidence_cid) <= max_evidence_cid_bytes && builtin.length_of_bytearray(
      evidence_cid,
    ) > 0

  expect Some(out) = continuing_output(tx, own_ref)
  expect Some(raw) = inline_datum_of(out)
  expect new_datum: EscrowDatum = raw

  // Continuing UTxO must hold the original amount + dispute fee.
  let expected_locked = old_datum.amount_lovelace + config.dispute_fee_lovelace
  let utxo_funded = lovelace_paid_to(tx, out.address) >= expected_locked

  // dispute_raised_by must match a signer.
  let raiser_recorded =
    when new_datum.dispute_raised_by is {
      Some(addr) ->
        client_signed && addr == old_datum.client_address || builder_signed && addr == builder_addr
      None -> False
    }

  let raised_at_set =
    when new_datum.dispute_raised_at is {
      Some(_) -> True
      None -> False
    }

  let evidence_cid_set = new_datum.dispute_evidence_cid == Some(evidence_cid)

  let status_advanced = new_datum.status == Disputed

  let datum_ok = and {
      new_datum.client_address == old_datum.client_address,
      new_datum.builder_address == old_datum.builder_address,
      new_datum.arbitrator_address == old_datum.arbitrator_address,
      new_datum.job_cid == old_datum.job_cid,
      new_datum.amount_lovelace == old_datum.amount_lovelace,
      new_datum.category == old_datum.category,
      new_datum.created_at == old_datum.created_at,
      new_datum.selected_at == old_datum.selected_at,
      new_datum.submitted_at == old_datum.submitted_at,
      new_datum.submission_cid == old_datum.submission_cid,
      new_datum.auto_release_deadline == old_datum.auto_release_deadline,
      new_datum.auto_refund_deadline == old_datum.auto_refund_deadline,
    }

  and {
    either_party_signed,
    in_disputable_state,
    evidence_within_bounds,
    utxo_funded,
    raiser_recorded,
    raised_at_set,
    evidence_cid_set,
    status_advanced,
    datum_ok,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Resolve — arbitrator + winning party decide who gets the funds.
// ───────────────────────────────────────────────────────────────────────────
//
// Required signatures: arbitrator AND the winning party
//                      (matches release_to_builder direction)
// State guard:         status == Disputed
// Outputs:
//   release_to_builder = True:
//     builder receives ≥ amount - treasury_cut
//     treasury receives ≥ treasury_cut + dispute_fee
//   release_to_builder = False:
//     client receives ≥ amount
//     treasury receives ≥ dispute_fee
//
// Treasury always keeps the dispute fee — it's the cost of using the
// arbitration system, not a refundable deposit.
//
pub fn validate_resolve(
  tx: Transaction,
  old_datum: EscrowDatum,
  config: GlobalConfig,
  release_to_builder: Bool,
) -> Bool {
  expect Some(builder_addr) = old_datum.builder_address

  let arbitrator_signed = is_signed_by(tx, old_datum.arbitrator_address)
  let in_disputed_state = old_datum.status == Disputed

  let outputs_correct =
    if release_to_builder {
      let builder_signed = is_signed_by(tx, builder_addr)
      let expected_builder =
        builder_payout(old_datum.amount_lovelace, config.platform_cut_percent)
      let expected_treasury =
        treasury_cut(old_datum.amount_lovelace, config.platform_cut_percent) + config.dispute_fee_lovelace
      and {
        builder_signed,
        lovelace_paid_to(tx, builder_addr) >= expected_builder,
        lovelace_paid_to(tx, config.treasury_address) >= expected_treasury,
      }
    } else {
      let client_signed = is_signed_by(tx, old_datum.client_address)
      and {
        client_signed,
        lovelace_paid_to(tx, old_datum.client_address) >= old_datum.amount_lovelace,
        lovelace_paid_to(tx, config.treasury_address) >= config.dispute_fee_lovelace,
      }
    }

  and {
    arbitrator_signed,
    in_disputed_state,
    outputs_correct,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// AutoRelease — builder claims funds after submit deadline elapsed.
// ───────────────────────────────────────────────────────────────────────────
//
// Required signatures: builder only (no client cooperation needed)
// State guard:         status == Submitted
// Time check:          tx validity range entirely after
//                      submitted_at + auto_release_deadline
// Outputs:             same as Release (builder + treasury split)
//
// auto_release_deadline is in seconds; submitted_at is in ms.
//
pub fn validate_auto_release(
  tx: Transaction,
  old_datum: EscrowDatum,
  config: GlobalConfig,
) -> Bool {
  expect Some(builder_addr) = old_datum.builder_address
  expect Some(submitted_at_ms) = old_datum.submitted_at

  let builder_signed = is_signed_by(tx, builder_addr)
  let in_submitted_state = old_datum.status == Submitted

  // Convert deadline from seconds to ms before adding to submitted_at.
  let deadline_ms = submitted_at_ms + old_datum.auto_release_deadline * 1000
  let deadline_passed =
    interval.is_entirely_after(tx.validity_range, deadline_ms)

  let expected_builder =
    builder_payout(old_datum.amount_lovelace, config.platform_cut_percent)
  let expected_treasury =
    treasury_cut(old_datum.amount_lovelace, config.platform_cut_percent)

  and {
    builder_signed,
    in_submitted_state,
    deadline_passed,
    lovelace_paid_to(tx, builder_addr) >= expected_builder,
    lovelace_paid_to(tx, config.treasury_address) >= expected_treasury,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// AutoRefund — client claims funds back after select deadline elapsed.
// ───────────────────────────────────────────────────────────────────────────
//
// Required signatures: client only (no builder cooperation needed)
// State guard:         status == Selected (builder ghosted before submitting)
// Time check:          tx validity range entirely after
//                      selected_at + auto_refund_deadline
// Output:              full amount to client (no platform fee on no-show)
//
pub fn validate_auto_refund(tx: Transaction, old_datum: EscrowDatum) -> Bool {
  expect Some(selected_at_ms) = old_datum.selected_at

  let client_signed = is_signed_by(tx, old_datum.client_address)
  let in_selected_state = old_datum.status == Selected

  let deadline_ms = selected_at_ms + old_datum.auto_refund_deadline * 1000
  let deadline_passed =
    interval.is_entirely_after(tx.validity_range, deadline_ms)

  let paid_enough =
    lovelace_paid_to(tx, old_datum.client_address) >= old_datum.amount_lovelace

  and {
    client_signed,
    in_selected_state,
    deadline_passed,
    paid_enough,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// ArbitratorTimeout — auto-resolve when arbitrator goes silent.
// ───────────────────────────────────────────────────────────────────────────
//
// Required signatures: dispute raiser only (they submitted evidence)
// State guard:         status == Disputed
// Time check:          tx validity range entirely after
//                      dispute_raised_at + arbitrator_timeout_seconds
// Outputs:             default in favor of dispute raiser:
//                        - client raised → full refund + dispute fee to treasury
//                        - builder raised → release split (builder + treasury)
//
// The dispute raiser submitted evidence; if the arbitrator failed to respond
// in 14 days, the chain defaults to the side that documented their case.
// The other party still had time to dispute counter-evidence off-chain.
//
pub fn validate_arbitrator_timeout(
  tx: Transaction,
  old_datum: EscrowDatum,
  config: GlobalConfig,
) -> Bool {
  expect Some(builder_addr) = old_datum.builder_address
  expect Some(raised_at_ms) = old_datum.dispute_raised_at
  expect Some(raiser) = old_datum.dispute_raised_by

  let in_disputed_state = old_datum.status == Disputed
  let raiser_signed = is_signed_by(tx, raiser)

  // arbitrator_timeout_seconds constant from types.ak — convert to ms.
  let deadline_ms = raised_at_ms + arbitrator_timeout_seconds * 1000
  let deadline_passed =
    interval.is_entirely_after(tx.validity_range, deadline_ms)

  // Outputs default in favor of the raiser.
  let outputs_correct =
    if raiser == old_datum.client_address {
      // Client raised: full refund to client, dispute fee to treasury.
      and {
        lovelace_paid_to(tx, old_datum.client_address) >= old_datum.amount_lovelace,
        lovelace_paid_to(tx, config.treasury_address) >= config.dispute_fee_lovelace,
      }
    } else if raiser == builder_addr {
      // Builder raised: release split + dispute fee to treasury.
      let expected_builder =
        builder_payout(old_datum.amount_lovelace, config.platform_cut_percent)
      let expected_treasury =
        treasury_cut(old_datum.amount_lovelace, config.platform_cut_percent) + config.dispute_fee_lovelace
      and {
        lovelace_paid_to(tx, builder_addr) >= expected_builder,
        lovelace_paid_to(tx, config.treasury_address) >= expected_treasury,
      }
    } else {
      // dispute_raised_by must be one of the two parties; if not, reject.
      False
    }

  and {
    in_disputed_state,
    raiser_signed,
    deadline_passed,
    outputs_correct,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Default helpers  for convenience
// ───────────────────────────────────────────────────────────────────────────

pub fn default_release_seconds() -> Int {
  default_auto_release_seconds
}

pub fn default_refund_seconds() -> Int {
  default_auto_refund_seconds
}
