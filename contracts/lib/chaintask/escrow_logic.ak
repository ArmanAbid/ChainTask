//// Per-redeemer validation logic for the ChainTask escrow validator.
////
//// Each `validate_X` function returns True iff the spending tx is allowed
//// for that redeemer. The dispatcher in escrow.ak just calls the right one.
////
//// Field-level immutability is the key defense: each branch returns True only if the new datum equals the old datum modulo the fields that branch is allowed to change. Prevents datum hijacking.
////
//// GlobalConfig is passed in explicitly to per-branch validators rather than looked up internally. The dispatcher resolves the config from reference inputs (in production) or tests pass a mock config directly.This keeps each branch a pure function of (tx, datum, redeemer payload,config) - easy to reason about, easy to unit test.

use aiken/builtin
use cardano/address.{Address}
use cardano/transaction.{OutputReference, Transaction}
use chaintask/tx_helpers.{
  builder_payout, continuing_output, inline_datum_of, is_signed_by,
  lovelace_paid_to, treasury_cut,
}
use chaintask/types.{
  EscrowDatum, GlobalConfig, Open, Selected, Submitted,
  default_auto_refund_seconds, default_auto_release_seconds, max_category_bytes,
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
      new_datum.auto_release_deadline == old_datum.auto_release_deadline,
      new_datum.auto_refund_deadline == old_datum.auto_refund_deadline,
      new_datum.dispute_raised_by == old_datum.dispute_raised_by,
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
      new_datum.auto_release_deadline == old_datum.auto_release_deadline,
      new_datum.auto_refund_deadline == old_datum.auto_refund_deadline,
      new_datum.dispute_raised_by == old_datum.dispute_raised_by,
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
    }

  and {
    signed,
    in_selected_state,
    status_advanced,
    submitted_at_set,
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
      new_datum.auto_release_deadline == old_datum.auto_release_deadline,
      new_datum.auto_refund_deadline == old_datum.auto_refund_deadline,
      new_datum.dispute_raised_by == old_datum.dispute_raised_by,
    }

  and {
    signed,
    in_selected_state,
    reset_correctly,
    datum_ok,
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
