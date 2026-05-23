//// Reputation cross-validator tests.

use aiken/interval
use cardano/address.{Address, Script, VerificationKey}
use cardano/assets
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Spend, Transaction, placeholder,
}
use chaintask/reputation_logic.{
  prepend_capped, validate_increment_dispute_outcome,
  validate_increment_on_release, validate_increment_on_withdraw,
}
use chaintask/types.{
  ArbitratorTimeout, BuilderWithdraw, Disputed, EscrowDatum, EscrowRedeemer,
  Release, ReputationDatum, Resolve, Selected, Submit, Submitted,
  default_auto_refund_seconds, default_auto_release_seconds,
}

// Fixtures

const client_vkh: ByteArray =
  #"a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"

const builder_vkh: ByteArray =
  #"b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2"

const arbitrator_vkh: ByteArray =
  #"c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"

const escrow_script_hash: ByteArray =
  #"d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4"

const rep_script_hash: ByteArray =
  #"e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"

const evidence_cid: ByteArray = "QmEvidence111111111111111111"

fn vk_address(vkh: ByteArray) -> Address {
  Address { payment_credential: VerificationKey(vkh), stake_credential: None }
}

fn script_address(hash: ByteArray) -> Address {
  Address { payment_credential: Script(hash), stake_credential: None }
}

fn client_addr() -> Address {
  vk_address(client_vkh)
}

fn builder_addr() -> Address {
  vk_address(builder_vkh)
}

fn arbitrator_addr() -> Address {
  vk_address(arbitrator_vkh)
}

fn escrow_addr() -> Address {
  script_address(escrow_script_hash)
}

fn rep_addr() -> Address {
  script_address(rep_script_hash)
}

fn fresh_rep_datum() -> ReputationDatum {
  ReputationDatum {
    builder_address: builder_addr(),
    completed_jobs: 0,
    total_volume_lovelace: 0,
    disputes_won: 0,
    disputes_lost: 0,
    withdrawals: 0,
    first_job_timestamp: 1_700_000_000_000,
    last_activity_timestamp: 1_700_000_000_000,
    recent_job_cids: [],
  }
}

fn submitted_escrow_datum() -> EscrowDatum {
  EscrowDatum {
    client_address: client_addr(),
    builder_address: Some(builder_addr()),
    arbitrator_address: arbitrator_addr(),
    job_cid: #"516d61626364",
    amount_lovelace: 50_000_000,
    category: "design",
    created_at: 1_700_000_000_000,
    selected_at: Some(1_700_001_000_000),
    submitted_at: Some(1_700_002_000_000),
    auto_release_deadline: default_auto_release_seconds,
    auto_refund_deadline: default_auto_refund_seconds,
    dispute_raised_by: None,
    dispute_raised_at: None,
    dispute_evidence_cid: None,
    status: Submitted,
  }
}

fn selected_escrow_datum() -> EscrowDatum {
  EscrowDatum {
    ..submitted_escrow_datum(),
    submitted_at: None,
    status: Selected,
  }
}

fn disputed_escrow_datum(raiser: Address) -> EscrowDatum {
  EscrowDatum {
    ..submitted_escrow_datum(),
    status: Disputed,
    dispute_raised_by: Some(raiser),
    dispute_raised_at: Some(1_700_003_000_000),
    dispute_evidence_cid: Some(evidence_cid),
  }
}

const escrow_ref: OutputReference =
  OutputReference {
    transaction_id: #"f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1",
    output_index: 0,
  }

const rep_ref: OutputReference =
  OutputReference {
    transaction_id: #"f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2",
    output_index: 0,
  }

fn escrow_input(d: EscrowDatum) -> Input {
  Input {
    output_reference: escrow_ref,
    output: Output {
      address: escrow_addr(),
      value: assets.from_lovelace(d.amount_lovelace),
      datum: InlineDatum(d),
      reference_script: None,
    },
  }
}

fn rep_input(d: ReputationDatum) -> Input {
  Input {
    output_reference: rep_ref,
    output: Output {
      address: rep_addr(),
      value: assets.from_lovelace(2_000_000),
      datum: InlineDatum(d),
      reference_script: None,
    },
  }
}

fn mk_tx_with_escrow(
  rep_d: ReputationDatum,
  escrow_d: EscrowDatum,
  escrow_redeemer: EscrowRedeemer,
  signers: List<ByteArray>,
) -> Transaction {
  let redeemer_data: Data = escrow_redeemer
  let reds: Pairs<transaction.ScriptPurpose, transaction.Redeemer> =
    [Pair(Spend(escrow_ref), redeemer_data)]
  Transaction {
    ..placeholder,
    inputs: [escrow_input(escrow_d), rep_input(rep_d)],
    redeemers: reds,
    extra_signatories: signers,
    validity_range: interval.everything,
  }
}

// IncrementOnRelease tests

test increment_on_release_happy_path() {
  let old = fresh_rep_datum()
  let escrow_d = submitted_escrow_datum()
  let new =
    ReputationDatum {
      ..old,
      completed_jobs: 1,
      total_volume_lovelace: 50_000_000,
      last_activity_timestamp: 1_700_003_000_000,
      recent_job_cids: [escrow_d.job_cid],
    }
  let tx = mk_tx_with_escrow(old, escrow_d, Release, [client_vkh, builder_vkh])
  validate_increment_on_release(
    tx,
    escrow_script_hash,
    old,
    new,
    50_000_000,
    1_700_003_000_000,
    escrow_d.job_cid,
  )
}

test increment_on_release_rejected_without_escrow_input() {
  let old = fresh_rep_datum()
  let escrow_d = submitted_escrow_datum()
  let new =
    ReputationDatum {
      ..old,
      completed_jobs: 1,
      total_volume_lovelace: 50_000_000,
      last_activity_timestamp: 1_700_003_000_000,
      recent_job_cids: [escrow_d.job_cid],
    }
  let tx =
    Transaction {
      ..placeholder,
      inputs: [rep_input(old)],
      redeemers: [],
      extra_signatories: [builder_vkh],
      validity_range: interval.everything,
    }
  !validate_increment_on_release(
    tx,
    escrow_script_hash,
    old,
    new,
    50_000_000,
    1_700_003_000_000,
    escrow_d.job_cid,
  )
}

test increment_on_release_rejected_with_wrong_redeemer() {
  let old = fresh_rep_datum()
  let escrow_d = submitted_escrow_datum()
  let new =
    ReputationDatum {
      ..old,
      completed_jobs: 1,
      total_volume_lovelace: 50_000_000,
      last_activity_timestamp: 1_700_003_000_000,
      recent_job_cids: [escrow_d.job_cid],
    }
  let tx = mk_tx_with_escrow(old, escrow_d, Submit, [builder_vkh])
  !validate_increment_on_release(
    tx,
    escrow_script_hash,
    old,
    new,
    50_000_000,
    1_700_003_000_000,
    escrow_d.job_cid,
  )
}

test increment_on_release_rejected_with_inflated_volume() {
  let old = fresh_rep_datum()
  let escrow_d = submitted_escrow_datum()
  let new =
    ReputationDatum {
      ..old,
      completed_jobs: 1,
      total_volume_lovelace: 999_999_999,
      last_activity_timestamp: 1_700_003_000_000,
      recent_job_cids: [escrow_d.job_cid],
    }
  let tx = mk_tx_with_escrow(old, escrow_d, Release, [client_vkh, builder_vkh])
  !validate_increment_on_release(
    tx,
    escrow_script_hash,
    old,
    new,
    999_999_999,
    1_700_003_000_000,
    escrow_d.job_cid,
  )
}

test increment_on_release_rejected_with_wrong_increment() {
  let old = fresh_rep_datum()
  let escrow_d = submitted_escrow_datum()
  let new =
    ReputationDatum {
      ..old,
      completed_jobs: 2,
      total_volume_lovelace: 50_000_000,
      last_activity_timestamp: 1_700_003_000_000,
      recent_job_cids: [escrow_d.job_cid],
    }
  let tx = mk_tx_with_escrow(old, escrow_d, Release, [client_vkh, builder_vkh])
  !validate_increment_on_release(
    tx,
    escrow_script_hash,
    old,
    new,
    50_000_000,
    1_700_003_000_000,
    escrow_d.job_cid,
  )
}

test increment_on_release_rejected_when_disputes_changed() {
  let old = fresh_rep_datum()
  let escrow_d = submitted_escrow_datum()
  let new =
    ReputationDatum {
      ..old,
      completed_jobs: 1,
      total_volume_lovelace: 50_000_000,
      last_activity_timestamp: 1_700_003_000_000,
      recent_job_cids: [escrow_d.job_cid],
      disputes_won: 5,
    }
  let tx = mk_tx_with_escrow(old, escrow_d, Release, [client_vkh, builder_vkh])
  !validate_increment_on_release(
    tx,
    escrow_script_hash,
    old,
    new,
    50_000_000,
    1_700_003_000_000,
    escrow_d.job_cid,
  )
}

test increment_on_release_rejected_when_builder_address_changes() {
  let old = fresh_rep_datum()
  let escrow_d = submitted_escrow_datum()
  let evil_addr =
    vk_address(#"deaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddead")
  let new =
    ReputationDatum {
      ..old,
      builder_address: evil_addr,
      completed_jobs: 1,
      total_volume_lovelace: 50_000_000,
      last_activity_timestamp: 1_700_003_000_000,
      recent_job_cids: [escrow_d.job_cid],
    }
  let tx = mk_tx_with_escrow(old, escrow_d, Release, [client_vkh, builder_vkh])
  !validate_increment_on_release(
    tx,
    escrow_script_hash,
    old,
    new,
    50_000_000,
    1_700_003_000_000,
    escrow_d.job_cid,
  )
}

test increment_on_release_caps_recent_cids_at_10() {
  let nine_cids: List<ByteArray> =
    [#"01", #"02", #"03", #"04", #"05", #"06", #"07", #"08", #"09", #"10"]
  let old =
    ReputationDatum {
      ..fresh_rep_datum(),
      completed_jobs: 10,
      total_volume_lovelace: 500_000_000,
      recent_job_cids: nine_cids,
    }
  let escrow_d = submitted_escrow_datum()
  let expected_cids = prepend_capped(escrow_d.job_cid, nine_cids, 10)
  let new =
    ReputationDatum {
      ..old,
      completed_jobs: 11,
      total_volume_lovelace: 550_000_000,
      last_activity_timestamp: 1_700_003_000_000,
      recent_job_cids: expected_cids,
    }
  let tx = mk_tx_with_escrow(old, escrow_d, Release, [client_vkh, builder_vkh])
  validate_increment_on_release(
    tx,
    escrow_script_hash,
    old,
    new,
    50_000_000,
    1_700_003_000_000,
    escrow_d.job_cid,
  )
}

// IncrementOnWithdraw tests

test increment_on_withdraw_happy_path() {
  let old = fresh_rep_datum()
  let escrow_d = selected_escrow_datum()
  let new =
    ReputationDatum {
      ..old,
      withdrawals: 1,
      last_activity_timestamp: 1_700_002_500_000,
    }
  let tx = mk_tx_with_escrow(old, escrow_d, BuilderWithdraw, [builder_vkh])
  validate_increment_on_withdraw(
    tx,
    escrow_script_hash,
    old,
    new,
    1_700_002_500_000,
  )
}

test increment_on_withdraw_rejected_with_release_redeemer() {
  let old = fresh_rep_datum()
  let escrow_d = submitted_escrow_datum()
  let new =
    ReputationDatum {
      ..old,
      withdrawals: 1,
      last_activity_timestamp: 1_700_002_500_000,
    }
  let tx = mk_tx_with_escrow(old, escrow_d, Release, [client_vkh, builder_vkh])
  !validate_increment_on_withdraw(
    tx,
    escrow_script_hash,
    old,
    new,
    1_700_002_500_000,
  )
}

test increment_on_withdraw_rejected_when_completed_jobs_changed() {
  let old = fresh_rep_datum()
  let escrow_d = selected_escrow_datum()
  let new =
    ReputationDatum {
      ..old,
      withdrawals: 1,
      completed_jobs: 5,
      last_activity_timestamp: 1_700_002_500_000,
    }
  let tx = mk_tx_with_escrow(old, escrow_d, BuilderWithdraw, [builder_vkh])
  !validate_increment_on_withdraw(
    tx,
    escrow_script_hash,
    old,
    new,
    1_700_002_500_000,
  )
}

// IncrementDisputeOutcome tests

test dispute_outcome_builder_wins_via_resolve() {
  let old = fresh_rep_datum()
  let escrow_d = disputed_escrow_datum(client_addr())
  let new =
    ReputationDatum {
      ..old,
      disputes_won: 1,
      last_activity_timestamp: 1_700_004_000_000,
    }
  let tx =
    mk_tx_with_escrow(
      old,
      escrow_d,
      Resolve { release_to_builder: True },
      [arbitrator_vkh, builder_vkh],
    )
  validate_increment_dispute_outcome(
    tx,
    escrow_script_hash,
    old,
    new,
    True,
    1_700_004_000_000,
  )
}

test dispute_outcome_builder_loses_via_resolve() {
  let old = fresh_rep_datum()
  let escrow_d = disputed_escrow_datum(client_addr())
  let new =
    ReputationDatum {
      ..old,
      disputes_lost: 1,
      last_activity_timestamp: 1_700_004_000_000,
    }
  let tx =
    mk_tx_with_escrow(
      old,
      escrow_d,
      Resolve { release_to_builder: False },
      [arbitrator_vkh, client_vkh],
    )
  validate_increment_dispute_outcome(
    tx,
    escrow_script_hash,
    old,
    new,
    False,
    1_700_004_000_000,
  )
}

test dispute_outcome_rejected_with_wrong_won_flag() {
  let old = fresh_rep_datum()
  let escrow_d = disputed_escrow_datum(client_addr())
  let new =
    ReputationDatum {
      ..old,
      disputes_won: 1,
      last_activity_timestamp: 1_700_004_000_000,
    }
  let tx =
    mk_tx_with_escrow(
      old,
      escrow_d,
      Resolve { release_to_builder: False },
      [arbitrator_vkh, client_vkh],
    )
  !validate_increment_dispute_outcome(
    tx,
    escrow_script_hash,
    old,
    new,
    True,
    1_700_004_000_000,
  )
}

test dispute_outcome_arbitrator_timeout_builder_wins_if_they_raised() {
  let old = fresh_rep_datum()
  let escrow_d = disputed_escrow_datum(builder_addr())
  let new =
    ReputationDatum {
      ..old,
      disputes_won: 1,
      last_activity_timestamp: 1_700_004_000_000,
    }
  let tx = mk_tx_with_escrow(old, escrow_d, ArbitratorTimeout, [builder_vkh])
  validate_increment_dispute_outcome(
    tx,
    escrow_script_hash,
    old,
    new,
    True,
    1_700_004_000_000,
  )
}

test dispute_outcome_arbitrator_timeout_builder_loses_if_client_raised() {
  let old = fresh_rep_datum()
  let escrow_d = disputed_escrow_datum(client_addr())
  let new =
    ReputationDatum {
      ..old,
      disputes_lost: 1,
      last_activity_timestamp: 1_700_004_000_000,
    }
  let tx = mk_tx_with_escrow(old, escrow_d, ArbitratorTimeout, [client_vkh])
  validate_increment_dispute_outcome(
    tx,
    escrow_script_hash,
    old,
    new,
    False,
    1_700_004_000_000,
  )
}

test dispute_outcome_rejected_with_release_redeemer() {
  let old = fresh_rep_datum()
  let escrow_d = submitted_escrow_datum()
  let new =
    ReputationDatum {
      ..old,
      disputes_won: 1,
      last_activity_timestamp: 1_700_004_000_000,
    }
  let tx = mk_tx_with_escrow(old, escrow_d, Release, [client_vkh, builder_vkh])
  !validate_increment_dispute_outcome(
    tx,
    escrow_script_hash,
    old,
    new,
    True,
    1_700_004_000_000,
  )
}

test dispute_outcome_rejected_when_completed_jobs_changed() {
  let old = fresh_rep_datum()
  let escrow_d = disputed_escrow_datum(client_addr())
  let new =
    ReputationDatum {
      ..old,
      disputes_won: 1,
      completed_jobs: 5,
      last_activity_timestamp: 1_700_004_000_000,
    }
  let tx =
    mk_tx_with_escrow(
      old,
      escrow_d,
      Resolve { release_to_builder: True },
      [arbitrator_vkh, builder_vkh],
    )
  !validate_increment_dispute_outcome(
    tx,
    escrow_script_hash,
    old,
    new,
    True,
    1_700_004_000_000,
  )
}

// prepend_capped unit tests

test prepend_capped_under_limit() {
  prepend_capped(#"03", [#"01", #"02"], 5) == [#"03", #"01", #"02"]
}

test prepend_capped_at_limit_evicts_oldest() {
  prepend_capped(#"06", [#"05", #"04", #"03", #"02", #"01"], 5) == [
    #"06", #"05", #"04", #"03", #"02",
  ]
}

test prepend_capped_empty() {
  prepend_capped(#"01", [], 10) == [#"01"]
}
