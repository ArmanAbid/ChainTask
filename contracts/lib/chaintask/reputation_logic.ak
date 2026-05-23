//// Reputation cross-validator logic.
//// The reputation validator's job is to ensure builders can't fake their own reputation. A rep UTxO can only be spent if a matching escrow event is happening in the same tx with the right redeemer.

use aiken/collection/list
use aiken/collection/pairs
use cardano/address.{Address, Script}
use cardano/transaction.{InlineDatum, Input, Spend, Transaction}
use chaintask/types.{
  ArbitratorTimeout, AutoRelease, BuilderWithdraw, EscrowDatum, EscrowRedeemer,
  Release, ReputationDatum, Resolve, Submitted, max_recent_jobs,
}

// Cross-validator helpers

/// Find an escrow input in the tx for the given builder. Returns the
/// input plus its decoded datum. None if no such input exists.
pub fn find_escrow_input_for_builder(
  tx: Transaction,
  escrow_script_hash: ByteArray,
  builder: Address,
) -> Option<(Input, EscrowDatum)> {
  let matching =
    list.find(
      tx.inputs,
      fn(input) {
        let is_escrow_addr =
          when input.output.address.payment_credential is {
            Script(hash) -> hash == escrow_script_hash
            _ -> False
          }
        if !is_escrow_addr {
          False
        } else {
          when input.output.datum is {
            InlineDatum(data) -> {
              expect d: EscrowDatum = data
              d.builder_address == Some(builder)
            }
            _ -> False
          }
        }
      },
    )

  when matching is {
    Some(input) -> {
      expect InlineDatum(raw) = input.output.datum
      expect d: EscrowDatum = raw
      Some((input, d))
    }
    None -> None
  }
}

/// Look up the redeemer used to spend a given input, decoded as EscrowRedeemer.
pub fn escrow_redeemer_for_input(
  tx: Transaction,
  input: Input,
) -> Option<EscrowRedeemer> {
  let purpose = Spend(input.output_reference)
  when pairs.get_first(tx.redeemers, purpose) is {
    Some(raw) -> {
      expect r: EscrowRedeemer = raw
      Some(r)
    }
    None -> None
  }
}

/// Prepend an item to a list and truncate to at most `cap` elements.
/// Used for recent_job_cids — bounded mini-history that grows from the front.
pub fn prepend_capped(
  item: ByteArray,
  list_: List<ByteArray>,
  cap: Int,
) -> List<ByteArray> {
  let extended = [item, ..list_]
  if list.length(extended) <= cap {
    extended
  } else {
    list.take(extended, cap)
  }
}

// IncrementOnRelease - fires on escrow's Release or AutoRelease redeemer

pub fn validate_increment_on_release(
  tx: Transaction,
  escrow_script_hash: ByteArray,
  old_datum: ReputationDatum,
  new_datum: ReputationDatum,
  volume: Int,
  timestamp: Int,
  job_cid: ByteArray,
) -> Bool {
  when
    find_escrow_input_for_builder(
      tx,
      escrow_script_hash,
      old_datum.builder_address,
    )
  is {
    None -> False
    Some((escrow_input, escrow_datum)) ->
      when escrow_redeemer_for_input(tx, escrow_input) is {
        None -> False
        Some(escrow_redeemer) -> {
          let valid_redeemer =
            when escrow_redeemer is {
              Release -> True
              AutoRelease -> True
              _ -> False
            }

          let valid_state = escrow_datum.status == Submitted
          let volume_matches = volume == escrow_datum.amount_lovelace
          let job_cid_matches = job_cid == escrow_datum.job_cid

          let counters_correct = and {
              new_datum.completed_jobs == old_datum.completed_jobs + 1,
              new_datum.total_volume_lovelace == old_datum.total_volume_lovelace + volume,
              new_datum.last_activity_timestamp == timestamp,
            }

          let recent_updated =
            new_datum.recent_job_cids == prepend_capped(
              job_cid,
              old_datum.recent_job_cids,
              max_recent_jobs,
            )

          let frozen = and {
              new_datum.builder_address == old_datum.builder_address,
              new_datum.first_job_timestamp == old_datum.first_job_timestamp,
              new_datum.disputes_won == old_datum.disputes_won,
              new_datum.disputes_lost == old_datum.disputes_lost,
              new_datum.withdrawals == old_datum.withdrawals,
            }

          and {
            valid_redeemer,
            valid_state,
            volume_matches,
            job_cid_matches,
            counters_correct,
            recent_updated,
            frozen,
          }
        }
      }
  }
}

// IncrementOnWithdraw — fires on escrow's BuilderWithdraw redeemer

pub fn validate_increment_on_withdraw(
  tx: Transaction,
  escrow_script_hash: ByteArray,
  old_datum: ReputationDatum,
  new_datum: ReputationDatum,
  timestamp: Int,
) -> Bool {
  when
    find_escrow_input_for_builder(
      tx,
      escrow_script_hash,
      old_datum.builder_address,
    )
  is {
    None -> False
    Some((escrow_input, _)) ->
      when escrow_redeemer_for_input(tx, escrow_input) is {
        None -> False
        Some(escrow_redeemer) -> {
          let valid_redeemer =
            when escrow_redeemer is {
              BuilderWithdraw -> True
              _ -> False
            }

          let counter_correct =
            new_datum.withdrawals == old_datum.withdrawals + 1
          let timestamp_correct = new_datum.last_activity_timestamp == timestamp

          let frozen = and {
              new_datum.builder_address == old_datum.builder_address,
              new_datum.completed_jobs == old_datum.completed_jobs,
              new_datum.total_volume_lovelace == old_datum.total_volume_lovelace,
              new_datum.disputes_won == old_datum.disputes_won,
              new_datum.disputes_lost == old_datum.disputes_lost,
              new_datum.first_job_timestamp == old_datum.first_job_timestamp,
              new_datum.recent_job_cids == old_datum.recent_job_cids,
            }

          and {
            valid_redeemer,
            counter_correct,
            timestamp_correct,
            frozen,
          }
        }
      }
  }
}

// IncrementDisputeOutcome — fires on Resolve or ArbitratorTimeout

pub fn validate_increment_dispute_outcome(
  tx: Transaction,
  escrow_script_hash: ByteArray,
  old_datum: ReputationDatum,
  new_datum: ReputationDatum,
  won: Bool,
  timestamp: Int,
) -> Bool {
  when
    find_escrow_input_for_builder(
      tx,
      escrow_script_hash,
      old_datum.builder_address,
    )
  is {
    None -> False
    Some((escrow_input, escrow_datum)) ->
      when escrow_redeemer_for_input(tx, escrow_input) is {
        None -> False
        Some(escrow_redeemer) -> {
          let outcome_matches =
            when escrow_redeemer is {
              Resolve { release_to_builder } -> won == release_to_builder
              ArbitratorTimeout -> {
                let builder_raised =
                  escrow_datum.dispute_raised_by == Some(
                    old_datum.builder_address,
                  )
                won == builder_raised
              }
              _ -> False
            }

          let counters_correct =
            if won {
              and {
                new_datum.disputes_won == old_datum.disputes_won + 1,
                new_datum.disputes_lost == old_datum.disputes_lost,
              }
            } else {
              and {
                new_datum.disputes_won == old_datum.disputes_won,
                new_datum.disputes_lost == old_datum.disputes_lost + 1,
              }
            }

          let timestamp_correct = new_datum.last_activity_timestamp == timestamp

          let frozen = and {
              new_datum.builder_address == old_datum.builder_address,
              new_datum.completed_jobs == old_datum.completed_jobs,
              new_datum.total_volume_lovelace == old_datum.total_volume_lovelace,
              new_datum.withdrawals == old_datum.withdrawals,
              new_datum.first_job_timestamp == old_datum.first_job_timestamp,
              new_datum.recent_job_cids == old_datum.recent_job_cids,
            }

          and {
            outcome_matches,
            counters_correct,
            timestamp_correct,
            frozen,
          }
        }
      }
  }
}
