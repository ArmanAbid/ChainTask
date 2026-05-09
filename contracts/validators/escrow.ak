//// ChainTask escrow validator.
//// Per-redeemer rules to implement:
////
////   Select  — only builder_address, selected_at, and status change; signed by client
////   Submit  — only submitted_at and status change; signed by builder
////   Release — client + builder sigs; pay builder_payout to builder, treasury_cut to platform;
////             call reputation validator to increment count + volume
////   Refund  — client + builder sigs; pay amount_lovelace to client (no fee)
////   Dispute — client OR builder sig + dispute_fee from config added to UTxO; status -> Disputed
////   Resolve — arbitrator + one party sig; distribute per resolution
////   AutoRelease — slot >= submitted_at + auto_release_deadline; builder sig only
////   AutoRefund  — slot >= selected_at + auto_refund_deadline; client sig only
////   ArbitratorTimeout — slot >= dispute_raised_at + 14d; auto-resolves
////
//// Cross-cutting checks (every redeemer):
////   - output value matches expected (defends double-satisfaction)
////   - datum size <= max_datum_bytes (defends ex-units griefing)

use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction}
use chaintask/escrow_logic.{
  validate_builder_withdraw, validate_refund, validate_release, validate_select,
  validate_submit, validate_update,
}
use chaintask/tx_helpers.{find_global_config}
use chaintask/types.{
  Apply, ArbitratorTimeout, AutoRefund, AutoRelease, BuilderWithdraw, Dispute,
  EscrowDatum, EscrowRedeemer, Refund, Release, Resolve, Select, Submit, Update,
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

      Submit -> validate_submit(tx, own_ref, d)
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

      Dispute ->
        // TODO (Week 3): Verify transaction is signed by client_address OR builder_address
        // TODO (Week 3): Verify an output pays the dispute fee (config.dispute_fee_lovelace) into the script
        // TODO (Week 3): Verify the output datum matches input datum exactly, EXCEPT status = Disputed
        True

      Resolve { .. } ->
        // TODO (Week 3): Verify arbitrator signature + one party signature.
        // TODO (Week 3): Handle distribution of funds + dispute fee based on resolution.
        True

      AutoRelease ->
        // TODO (Week 3): Verify current slot >= submitted_at + auto_release_deadline
        // TODO (Week 3): Verify outputs (same logic as Release)
        True

      AutoRefund ->
        // TODO (Week 3): Verify current slot >= selected_at + auto_refund_deadline
        // TODO (Week 3): Verify output goes to client_address (full amount)
        True

      ArbitratorTimeout ->
        // TODO (Week 3): Verify 14 days passed since dispute raised
        // TODO (Week 3): Auto-resolve based on evidence submission timestamp
        True
    }
  }

  else(_) {
    fail
  }
}
