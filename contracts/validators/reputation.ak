//// ChainTask builder reputation validator.
//// Each builder has at most one reputation UTxO carrying their lifetime stats. Cross-validates against the escrow validator to ensure rep updates only happen as a side effect of real escrow events.

use cardano/transaction.{OutputReference, Transaction}
use chaintask/reputation_logic.{
  validate_increment_dispute_outcome, validate_increment_on_release,
  validate_increment_on_withdraw,
}
use chaintask/tx_helpers.{continuing_output, inline_datum_of}
use chaintask/types.{
  IncrementDisputeOutcome, IncrementOnRelease, IncrementOnWithdraw,
  ReputationDatum, ReputationRedeemer,
}

validator reputation(escrow_script_hash: ByteArray) {
  spend(
    datum: Option<ReputationDatum>,
    redeemer: ReputationRedeemer,
    own_ref: OutputReference,
    tx: Transaction,
  ) {
    expect Some(old) = datum

    expect Some(out) = continuing_output(tx, own_ref)
    expect Some(raw) = inline_datum_of(out)
    expect new: ReputationDatum = raw

    when redeemer is {
      IncrementOnRelease { volume, timestamp, job_cid } ->
        validate_increment_on_release(
          tx,
          escrow_script_hash,
          old,
          new,
          volume,
          timestamp,
          job_cid,
        )

      IncrementOnWithdraw { timestamp } ->
        validate_increment_on_withdraw(
          tx,
          escrow_script_hash,
          old,
          new,
          timestamp,
        )

      IncrementDisputeOutcome { won, timestamp } ->
        validate_increment_dispute_outcome(
          tx,
          escrow_script_hash,
          old,
          new,
          won,
          timestamp,
        )
    }
  }

  else(_) {
    fail
  }
}
