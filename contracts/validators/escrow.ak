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
////   ArbitratorTimeout — slot >= dispute_raised_at + 30d; auto-resolves
////
//// Cross-cutting checks (every redeemer):
////   - output value matches expected (defends double-satisfaction)
////   - datum size <= max_datum_bytes (defends ex-units griefing)

use aiken/collection/list
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, OutputReference, Transaction}
use chaintask/types.{
  Apply, ArbitratorTimeout, AutoRefund, AutoRelease, Dispute, EscrowDatum,
  EscrowRedeemer, GlobalConfig, Refund, Release, Resolve, Select, Submit, Update,
}

/// The validator is parameterized by the Admin Policy ID to securely locate 
/// the GlobalConfig reference UTxO.
validator escrow(admin_policy: PolicyId) {
  spend(
    datum: Option<EscrowDatum>,
    redeemer: EscrowRedeemer,
    _own_ref: OutputReference,
    transaction: Transaction,
  ) {
    expect Some(escrow_datum) = datum

    // --- HELPER: Read the Global Configuration ---
    // Finds the reference UTxO holding the Admin NFT and extracts the config.
    let get_config =
      fn() -> GlobalConfig {
        expect Some(config_input) =
          list.find(
            transaction.reference_inputs,
            fn(input) {
              assets.quantity_of(input.output.value, admin_policy, "") == 1
            },
          )

        // Extract the inline datum and cast it to GlobalConfig
        expect InlineDatum(datum_data) = config_input.output.datum
        expect config: GlobalConfig = datum_data
        config
      }

    when redeemer is {
      Apply -> False

      Select { .. } ->
        // TODO (Week 2): Verify client signature.
        // TODO (Week 2): Verify only builder_address, selected_at, and status fields changed.
        True

      Submit ->
        // TODO (Week 2): Verify builder signature.
        // TODO (Week 2): Verify only submitted_at and status fields changed.
        True
      Update ->
        // TODO (Week 2): Verify transaction is signed by client_address
        // TODO (Week 2): Verify input escrow_datum.status == Open
        // TODO (Week 2): Verify the output UTxO goes back to this exact script address
        // TODO (Week 2): Verify the output datum ONLY changes job_cid, amount_lovelace, auto_release_deadline, or auto_refund_deadline
        // TODO (Week 2): Verify the output status remains Open
        True

      Release -> {
        let config = get_config()

        // 1. Calculate the base cut (e.g., 5% of amount_lovelace)
        let base_cut =
          escrow_datum.amount_lovelace * config.platform_cut_percent / 100

        // 2. Edge Case Protection: Ensure the treasury output meets Min-UTxO (1.5 ADA)
        let treasury_cut =
          if base_cut < 1_500_000 {
            1_500_000
          } else {
            base_cut
          }

        // 3. Calculate builder payout (underscore silences unused variable warning for the stub)
        let _builder_payout = escrow_datum.amount_lovelace - treasury_cut

        // TODO (Week 2): Verify transaction is signed by client_address AND builder_address
        // TODO (Week 2): Verify an output goes to config.treasury_address with value == treasury_cut
        // TODO (Week 2): Verify an output goes to escrow_datum.builder_address with value == _builder_payout
        True
      }

      Refund ->
        // TODO (Week 2): Verify transaction is signed by client_address AND builder_address
        // TODO (Week 2): Verify an output goes to client_address with value == escrow_datum.amount_lovelace
        True

      Dispute -> {
        let _config = get_config()
        // TODO (Week 3): Verify transaction is signed by client_address OR builder_address
        // TODO (Week 3): Verify an output pays the dispute fee (config.dispute_fee_lovelace) into the script
        // TODO (Week 3): Verify the output datum matches input datum exactly, EXCEPT status = Disputed
        True
      }

      Resolve { .. } -> {
        let _config = get_config()
        // TODO (Week 3): Verify arbitrator signature + one party signature.
        // TODO (Week 3): Handle distribution of funds + dispute fee based on resolution.
        True
      }

      AutoRelease -> {
        let config = get_config()

        let base_cut =
          escrow_datum.amount_lovelace * config.platform_cut_percent / 100

        let treasury_cut =
          if base_cut < 1_500_000 {
            1_500_000
          } else {
            base_cut
          }

        let _builder_payout = escrow_datum.amount_lovelace - treasury_cut

        // TODO (Week 3): Verify current slot >= submitted_at + auto_release_deadline
        // TODO (Week 3): Verify outputs (same logic as Release)
        True
      }

      AutoRefund ->
        // TODO (Week 3): Verify current slot >= selected_at + auto_refund_deadline
        // TODO (Week 3): Verify output goes to client_address (full amount)
        True

      ArbitratorTimeout ->
        // TODO (Week 3): Verify 30 days passed since dispute raised
        // TODO (Week 3): Auto-resolve based on evidence submission timestamp
        True
    }
  }

  else(_) {
    fail
  }
}
