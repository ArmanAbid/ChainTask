//// ChainTask escrow validator.
//// Per-redeemer rules to implement:
////
////   Select  - only builder_address, selected_at, and status change; signed by client
////   Submit  - only submitted_at and status change; signed by builder
////   Release - client + builder sigs; pay builder_payout to builder, treasury_cut to platform;
////             call reputation validator to increment count + volume
////   Refund  - client + builder sigs; pay amount_lovelace to client (no fee)
////   Dispute - client OR builder sig + dispute_fee from config added to UTxO; status -> Disputed
////   Resolve - arbitrator + one party sig; distribute per resolution
////   AutoRelease - slot >= submitted_at + auto_release_deadline; builder sig only
////   AutoRefund  - slot >= selected_at + auto_refund_deadline; client sig only
////   ArbitratorTimeout - slot >= dispute_raised_at + 14d; auto-resolves
////
//// Cross-cutting checks (every redeemer):
////   - output value matches expected (defends double-satisfaction)
////   - datum size <= max_datum_bytes (defends ex-units griefing)

use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use chaintask/escrow_logic.{
  validate_amend_submission, validate_arbitrator_timeout, validate_auto_refund,
  validate_auto_release, validate_builder_withdraw, validate_cancel_open,
  validate_dispute, validate_refund, validate_release, validate_resolve,
  validate_select, validate_submit, validate_update,
}
use chaintask/tx_helpers.{find_global_config}
use chaintask/types.{
  AmendSubmission, Apply, ArbitratorTimeout, AutoRefund, AutoRelease,
  BuilderWithdraw, CancelOpen, Dispute, EscrowDatum, EscrowRedeemer, Refund,
  Release, Resolve, Select, Submit, Update,
}

/// The validator is parameterized by the Admin Policy ID to securely locate 
/// the GlobalConfig reference UTxO.
validator escrow(admin_policy: PolicyId) {
  spend(
    datum: Option<EscrowDatum>,
    redeemer: EscrowRedeemer,
    own_ref: OutputReference,
    tx: Transaction,
  ) {
    expect Some(d) = datum

    when redeemer is {
      Apply -> False

      Select { builder } -> validate_select(tx, own_ref, d, builder)

      Submit { submission_cid } ->
        validate_submit(tx, own_ref, d, submission_cid)

      AmendSubmission { new_submission_cid } ->
        validate_amend_submission(tx, own_ref, d, new_submission_cid)
      Update { new_job_cid, new_amount_lovelace, new_category } -> {
        expect Some(config) = find_global_config(tx, admin_policy)
        validate_update(
          tx,
          own_ref,
          d,
          config,
          new_job_cid,
          new_amount_lovelace,
          new_category,
        )
      }

      Release -> {
        expect Some(config) = find_global_config(tx, admin_policy)
        validate_release(tx, d, config)
      }

      Refund -> validate_refund(tx, d)

      BuilderWithdraw -> validate_builder_withdraw(tx, own_ref, d)

      Dispute { evidence_cid } -> {
        expect Some(config) = find_global_config(tx, admin_policy)
        validate_dispute(tx, own_ref, d, config, evidence_cid)
      }

      Resolve { release_to_builder } -> {
        expect Some(config) = find_global_config(tx, admin_policy)
        validate_resolve(tx, d, config, release_to_builder)
      }

      AutoRelease -> {
        expect Some(config) = find_global_config(tx, admin_policy)
        validate_auto_release(tx, d, config)
      }

      AutoRefund -> validate_auto_refund(tx, d)

      ArbitratorTimeout -> {
        expect Some(config) = find_global_config(tx, admin_policy)
        validate_arbitrator_timeout(tx, d, config)
      }

      CancelOpen -> validate_cancel_open(tx, d)
    }
  }

  else(_) {
    fail
  }
}
