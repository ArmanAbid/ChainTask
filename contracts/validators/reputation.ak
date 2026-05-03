//// ChainTask builder reputation validator.
////
//// Each builder has a single reputation UTxO carrying their lifetime stats.
//// On a successful Release in escrow.ak, this validator must:
////
////   - increment completed_jobs by 1
////   - add the released amount to total_volume_lovelace
////   - leave first_job_timestamp untouched
////   - require the spending tx also spends an escrow UTxO with redeemer = Release
////
//// The escrow → reputation cross-validator check is what prevents builders
//// from inflating their own reputation without an actual paid job.

use cardano/transaction.{OutputReference, Transaction}
use chaintask/types.{IncrementOnRelease, ReputationDatum, ReputationRedeemer}

validator reputation {
  spend(
    datum: Option<ReputationDatum>,
    redeemer: ReputationRedeemer,
    _own_ref: OutputReference,
    _tx: Transaction,
  ) {
    expect Some(rep_datum) = datum
    // We bind the redeemer values here so they are ready for Week 4 logic.
    let IncrementOnRelease { volume: _volume, timestamp: _timestamp } = redeemer

    // TODO (Week 4): Verify the transaction also spends a valid Escrow UTxO 
    //                with the `Release` redeemer. (Cross-contract verification)
    // TODO (Week 4): Find the output UTxO sent back to this script address.
    // TODO (Week 4): Verify output completed_jobs == rep_datum.completed_jobs + 1
    // TODO (Week 4): Verify output total_volume_lovelace == rep_datum.total_volume_lovelace + _volume
    // TODO (Week 4): Verify output first_job_timestamp == rep_datum.first_job_timestamp
    True
  }

  else(_) {
    fail
  }
}
