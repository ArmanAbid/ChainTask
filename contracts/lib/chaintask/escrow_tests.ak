//// Validator branch tests for Week 2 redeemers.
////
//// Each test constructs a small mock Transaction and EscrowDatum, passes it through the per-branch validator, and asserts True/False. Both happy paths and the most important rejection cases are covered.
////
//// Unit-level - these don't simulate a full Cardano tx end to end.
//// Integration tests come in Week 5 against the testnet.

use aiken/interval
use cardano/address.{Address, VerificationKey}
use cardano/assets
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Transaction, placeholder,
}
use chaintask/escrow_logic.{
  validate_amend_submission, validate_arbitrator_timeout, validate_auto_refund,
  validate_auto_release, validate_builder_withdraw, validate_dispute,
  validate_refund, validate_release, validate_resolve, validate_select,
  validate_submit, validate_update,
}
use chaintask/types.{
  Disputed, EscrowDatum, GlobalConfig, Open, Selected, Submitted,
  arbitrator_timeout_seconds, default_auto_refund_seconds,
  default_auto_release_seconds,
}

// ───────────────────────────────────────────────────────────────────────────
// Test fixtures
// ───────────────────────────────────────────────────────────────────────────

const client_vkh: ByteArray =
  #"a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"

const builder_vkh: ByteArray =
  #"b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2"

const arbitrator_vkh: ByteArray =
  #"c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"

const script_vkh: ByteArray =
  #"d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4"

const treasury_vkh: ByteArray =
  #"7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e"

const default_category: ByteArray = "design"

const evidence_cid_a: ByteArray = "QmEvidence111111111111111111"

const submission_cid_a: ByteArray = "QmSubmission11111111111111111"

fn vk_address(vkh: ByteArray) -> Address {
  Address { payment_credential: VerificationKey(vkh), stake_credential: None }
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

fn script_addr() -> Address {
  vk_address(script_vkh)
}

fn treasury_addr() -> Address {
  vk_address(treasury_vkh)
}

fn mock_config() -> GlobalConfig {
  GlobalConfig {
    treasury_address: treasury_addr(),
    min_job_amount_lovelace: 20_000_000,
    platform_cut_percent: 5,
    dispute_fee_lovelace: 15_000_000,
  }
}

fn fresh_open_datum() -> EscrowDatum {
  EscrowDatum {
    client_address: client_addr(),
    builder_address: None,
    arbitrator_address: arbitrator_addr(),
    job_cid: #"516d61626364",
    amount_lovelace: 50_000_000,
    category: default_category,
    created_at: 1_700_000_000_000,
    selected_at: None,
    submitted_at: None,
    submission_cid: None,
    auto_release_deadline: default_auto_release_seconds,
    auto_refund_deadline: default_auto_refund_seconds,
    dispute_raised_by: None,
    dispute_raised_at: None,
    dispute_evidence_cid: None,
    status: Open,
  }
}

fn own_ref() -> OutputReference {
  OutputReference {
    transaction_id: #"e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5",
    output_index: 0,
  }
}

fn script_input(d: EscrowDatum) -> Input {
  Input {
    output_reference: own_ref(),
    output: Output {
      address: script_addr(),
      value: assets.from_lovelace(d.amount_lovelace),
      datum: InlineDatum(d),
      reference_script: None,
    },
  }
}

fn continuing_script_output(d: EscrowDatum) -> Output {
  Output {
    address: script_addr(),
    value: assets.from_lovelace(d.amount_lovelace),
    datum: InlineDatum(d),
    reference_script: None,
  }
}

fn continuing_script_output_with(d: EscrowDatum, extra_lovelace: Int) -> Output {
  Output {
    address: script_addr(),
    value: assets.from_lovelace(d.amount_lovelace + extra_lovelace),
    datum: InlineDatum(d),
    reference_script: None,
  }
}

fn payment_output(to: Address, lovelace: Int) -> Output {
  Output {
    address: to,
    value: assets.from_lovelace(lovelace),
    datum: NoDatum,
    reference_script: None,
  }
}

fn mk_tx(
  d_in: EscrowDatum,
  outputs: List<Output>,
  signers: List<ByteArray>,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [script_input(d_in)],
    outputs,
    extra_signatories: signers,
    validity_range: interval.everything,
  }
}

fn mk_tx_with_validity(
  d_in: EscrowDatum,
  outputs: List<Output>,
  signers: List<ByteArray>,
  validity: interval.Interval,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [script_input(d_in)],
    outputs,
    extra_signatories: signers,
    validity_range: validity,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Update tests
// ───────────────────────────────────────────────────────────────────────────

test update_happy_path() {
  let old = fresh_open_datum()
  let new_cid = #"516d6e657763"
  let new_amount = 75_000_000
  let new_cat: ByteArray = "dev"
  let new =
    EscrowDatum {
      ..old,
      job_cid: new_cid,
      amount_lovelace: new_amount,
      category: new_cat,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [client_vkh])
  validate_update(
    tx,
    own_ref(),
    old,
    mock_config(),
    new_cid,
    new_amount,
    new_cat,
  )
}

test update_rejected_when_not_signed_by_client() {
  let old = fresh_open_datum()
  let new_cid = #"516d6e657763"
  let new_amount = 75_000_000
  let new = EscrowDatum { ..old, job_cid: new_cid, amount_lovelace: new_amount }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_update(
    tx,
    own_ref(),
    old,
    mock_config(),
    new_cid,
    new_amount,
    old.category,
  )
}

test update_rejected_when_arbitrator_changes() {
  // Datum hijack: client tries to swap arbitrator while updating.
  let old = fresh_open_datum()
  let new_cid = #"516d6e657763"
  let new_amount = 75_000_000
  let evil_arb =
    vk_address(#"deaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddead")
  let new =
    EscrowDatum {
      ..old,
      job_cid: new_cid,
      amount_lovelace: new_amount,
      arbitrator_address: evil_arb,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [client_vkh])
  !validate_update(
    tx,
    own_ref(),
    old,
    mock_config(),
    new_cid,
    new_amount,
    old.category,
  )
}

test update_rejected_after_select() {
  let old = EscrowDatum { ..fresh_open_datum(), status: Selected }
  let new_cid = #"516d6e657763"
  let new_amount = 75_000_000
  let new = EscrowDatum { ..old, job_cid: new_cid, amount_lovelace: new_amount }
  let tx = mk_tx(old, [continuing_script_output(new)], [client_vkh])
  !validate_update(
    tx,
    own_ref(),
    old,
    mock_config(),
    new_cid,
    new_amount,
    old.category,
  )
}

test update_rejected_when_category_too_long() {
  let old = fresh_open_datum()
  let new_cid = #"516d6e657763"
  let new_amount = 75_000_000
  // 17-byte category - over the 16-byte cap.
  let oversized: ByteArray = "abcdefghijklmnopq"
  let new =
    EscrowDatum {
      ..old,
      job_cid: new_cid,
      amount_lovelace: new_amount,
      category: oversized,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [client_vkh])
  !validate_update(
    tx,
    own_ref(),
    old,
    mock_config(),
    new_cid,
    new_amount,
    oversized,
  )
}

test update_rejected_when_amount_below_minimum() {
  // Attack: post a 50 ADA job to pass off-chain validation, then Update it down to 1 ADA. Validator must enforce the GlobalConfig minimum.
  let old = fresh_open_datum()
  let too_low = 1_000_000
  let new = EscrowDatum { ..old, amount_lovelace: too_low }
  let tx = mk_tx(old, [continuing_script_output(new)], [client_vkh])
  !validate_update(
    tx,
    own_ref(),
    old,
    mock_config(),
    old.job_cid,
    too_low,
    old.category,
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Select tests
// ───────────────────────────────────────────────────────────────────────────

test select_happy_path() {
  let old = fresh_open_datum()
  let new =
    EscrowDatum {
      ..old,
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [client_vkh])
  validate_select(tx, own_ref(), old, builder_addr())
}

test select_rejected_when_not_signed_by_client() {
  let old = fresh_open_datum()
  let new =
    EscrowDatum {
      ..old,
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_select(tx, own_ref(), old, builder_addr())
}

test select_rejected_when_arbitrator_changes() {
  let old = fresh_open_datum()
  let evil_arb =
    vk_address(#"deaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddead")
  let new =
    EscrowDatum {
      ..old,
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
      arbitrator_address: evil_arb,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [client_vkh])
  !validate_select(tx, own_ref(), old, builder_addr())
}

test select_rejected_when_amount_changes() {
  let old = fresh_open_datum()
  let new =
    EscrowDatum {
      ..old,
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
      amount_lovelace: 1,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [client_vkh])
  !validate_select(tx, own_ref(), old, builder_addr())
}

test select_rejected_when_category_changes() {
  let old = fresh_open_datum()
  let new =
    EscrowDatum {
      ..old,
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
      category: "different",
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [client_vkh])
  !validate_select(tx, own_ref(), old, builder_addr())
}

// ───────────────────────────────────────────────────────────────────────────
// Submit tests
// ───────────────────────────────────────────────────────────────────────────

test submit_happy_path() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
    }
  let new =
    EscrowDatum {
      ..old,
      submitted_at: Some(1_700_002_000_000),
      submission_cid: Some(submission_cid_a),
      status: Submitted,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  validate_submit(tx, own_ref(), old, submission_cid_a)
}

test submit_rejected_when_signed_by_client() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
    }
  let new =
    EscrowDatum {
      ..old,
      submitted_at: Some(1_700_002_000_000),
      submission_cid: Some(submission_cid_a),
      status: Submitted,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [client_vkh])
  !validate_submit(tx, own_ref(), old, submission_cid_a)
}

test submit_rejected_when_status_is_open() {
  let old =
    EscrowDatum { ..fresh_open_datum(), builder_address: Some(builder_addr()) }
  let new =
    EscrowDatum {
      ..old,
      submitted_at: Some(1_700_002_000_000),
      submission_cid: Some(submission_cid_a),
      status: Submitted,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_submit(tx, own_ref(), old, submission_cid_a)
}

test submit_rejected_when_cid_mismatched() {
  // Builder claims one CID in the redeemer but writes a different one to the
  // datum. Must fail - otherwise the submission_cid on chain wouldn't
  // necessarily match what the client agreed to review.
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
    }
  let new =
    EscrowDatum {
      ..old,
      submitted_at: Some(1_700_002_000_000),
      submission_cid: Some("QmDifferentCid000000000000000"),
      status: Submitted,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_submit(tx, own_ref(), old, submission_cid_a)
}

test submit_rejected_when_submission_cid_none() {
  // Builder must actually set the CID - None is not a valid submission.
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
    }
  let new =
    EscrowDatum {
      ..old,
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_submit(tx, own_ref(), old, submission_cid_a)
}

// ───────────────────────────────────────────────────────────────────────────
// AmendSubmission tests
// ───────────────────────────────────────────────────────────────────────────
//
// Amend lets the builder replace their submission_cid with a revised one
// while status is still Submitted. submitted_at must advance (resetting
// the client's review window); everything else is frozen.

// A second submission CID, distinct from submission_cid_a, used as the
// "revised" target across Amend tests.
const submission_cid_b: ByteArray = "QmSubmission22222222222222222"

// A canonical post-Submit datum to start Amend tests from. Everything that
// would be set by a real Submit is set here.
fn submitted_datum() -> EscrowDatum {
  EscrowDatum {
    ..fresh_open_datum(),
    builder_address: Some(builder_addr()),
    selected_at: Some(1_700_001_000_000),
    submitted_at: Some(1_700_002_000_000),
    submission_cid: Some(submission_cid_a),
    status: Submitted,
  }
}

test amend_happy_path() {
  // Builder replaces submission_a with submission_b. submitted_at advances.
  let old = submitted_datum()
  let new =
    EscrowDatum {
      ..old,
      submitted_at: Some(1_700_002_500_000),
      submission_cid: Some(submission_cid_b),
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  validate_amend_submission(tx, own_ref(), old, submission_cid_b)
}

test amend_rejected_when_signed_by_client() {
  // Builder controls Amend, not client. A client-signed Amend must fail
  // even if the proposed CID looks reasonable.
  let old = submitted_datum()
  let new =
    EscrowDatum {
      ..old,
      submitted_at: Some(1_700_002_500_000),
      submission_cid: Some(submission_cid_b),
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [client_vkh])
  !validate_amend_submission(tx, own_ref(), old, submission_cid_b)
}

test amend_rejected_when_status_is_open() {
  // Can't Amend before there's a submission to amend.
  // (Old datum has builder but still Open - could happen if someone
  // mis-issues a redeemer; validator must reject on state.)
  let old =
    EscrowDatum { ..fresh_open_datum(), builder_address: Some(builder_addr()) }
  let new =
    EscrowDatum {
      ..old,
      submitted_at: Some(1_700_002_500_000),
      submission_cid: Some(submission_cid_b),
      status: Submitted,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_amend_submission(tx, own_ref(), old, submission_cid_b)
}

test amend_rejected_when_status_is_selected() {
  // Selected but not yet Submitted - should use Submit, not Amend.
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
    }
  let new =
    EscrowDatum {
      ..old,
      submitted_at: Some(1_700_002_500_000),
      submission_cid: Some(submission_cid_b),
      status: Submitted,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_amend_submission(tx, own_ref(), old, submission_cid_b)
}

test amend_rejected_when_status_is_disputed() {
  // Once a dispute is active, the arbitrator owns the outcome. Builder
  // must not be able to swap the submission out from under them.
  let old =
    EscrowDatum {
      ..submitted_datum(),
      status: Disputed,
      dispute_raised_by: Some(client_addr()),
      dispute_raised_at: Some(1_700_003_000_000),
      dispute_evidence_cid: Some(evidence_cid_a),
    }
  let new = EscrowDatum { ..old, submission_cid: Some(submission_cid_b) }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_amend_submission(tx, own_ref(), old, submission_cid_b)
}

test amend_rejected_when_output_cid_mismatches_redeemer() {
  // Builder declares one CID in the redeemer but writes another to the
  // datum. Same redeemer-vs-datum drift defense as Submit.
  let old = submitted_datum()
  let new =
    EscrowDatum {
      ..old,
      submitted_at: Some(1_700_002_500_000),
      submission_cid: Some("QmDecoy0000000000000000000000"),
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_amend_submission(tx, own_ref(), old, submission_cid_b)
}

test amend_rejected_when_submitted_at_not_advanced() {
  // submitted_at must strictly advance - otherwise builder could submit
  // garbage at day 13 and Amend at day 13 to the same time, robbing the
  // client of meaningful review time.
  let old = submitted_datum()
  let new = EscrowDatum { ..old, submission_cid: Some(submission_cid_b) }
  // ^ note: submitted_at NOT changed
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_amend_submission(tx, own_ref(), old, submission_cid_b)
}

test amend_rejected_when_submitted_at_goes_backwards() {
  // Builder must not rewind time. Backwards submitted_at fails the strict
  // monotonicity check.
  let old = submitted_datum()
  let new =
    EscrowDatum {
      ..old,
      submitted_at: Some(1_700_001_500_000),
      // ^ earlier than old's 1_700_002_000_000
      submission_cid: Some(submission_cid_b),
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_amend_submission(tx, own_ref(), old, submission_cid_b)
}

test amend_rejected_when_amount_changes() {
  // Amount is frozen during Amend. Builder must not be able to bump the
  // job price via Amend.
  let old = submitted_datum()
  let new =
    EscrowDatum {
      ..old,
      submitted_at: Some(1_700_002_500_000),
      submission_cid: Some(submission_cid_b),
      amount_lovelace: old.amount_lovelace * 2,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_amend_submission(tx, own_ref(), old, submission_cid_b)
}

test amend_rejected_when_builder_changes() {
  // Builder address is frozen. Original builder must not be able to
  // hand the job off to a different builder via Amend.
  let other_builder_vkh: ByteArray =
    #"b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9"
  let other_builder_addr = vk_address(other_builder_vkh)
  let old = submitted_datum()
  let new =
    EscrowDatum {
      ..old,
      submitted_at: Some(1_700_002_500_000),
      submission_cid: Some(submission_cid_b),
      builder_address: Some(other_builder_addr),
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_amend_submission(tx, own_ref(), old, submission_cid_b)
}

test amend_sequence_two_amends_still_valid() {
  // Sanity check: two consecutive Amends should each independently
  // pass validation. The state advances cleanly each time.
  let v1 = submitted_datum()
  let v2 =
    EscrowDatum {
      ..v1,
      submitted_at: Some(1_700_002_500_000),
      submission_cid: Some(submission_cid_b),
    }
  let v3 =
    EscrowDatum {
      ..v2,
      submitted_at: Some(1_700_003_000_000),
      submission_cid: Some("QmSubmission33333333333333333"),
    }
  let tx_a = mk_tx(v1, [continuing_script_output(v2)], [builder_vkh])
  let tx_b = mk_tx(v2, [continuing_script_output(v3)], [builder_vkh])
  and {
    validate_amend_submission(tx_a, own_ref(), v1, submission_cid_b),
    validate_amend_submission(
      tx_b,
      own_ref(),
      v2,
      "QmSubmission33333333333333333",
    ),
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Release tests - these now validate the platform-fee split is enforced.
// ───────────────────────────────────────────────────────────────────────────

test release_happy_path() {
  // 50 ADA × 5% = 2.5 ADA cut, well above the 1.5 ADA min-UTxO floor. builder gets 47.5 ADA, treasury gets 2.5 ADA.
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let cfg = mock_config()
  let tx =
    mk_tx(
      old,
      [
        payment_output(builder_addr(), 47_500_000),
        payment_output(treasury_addr(), 2_500_000),
      ],
      [client_vkh, builder_vkh],
    )
  validate_release(tx, old, cfg)
}

test release_ok_with_only_client_sig() {
  // Release is now client-only. Builder's signature is no longer required.
  // The state machine (status == Submitted) + locked builder_address in
  // the datum are sufficient to protect the builder.
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let tx =
    mk_tx(
      old,
      [
        payment_output(builder_addr(), 47_500_000),
        payment_output(treasury_addr(), 2_500_000),
      ],
      [client_vkh],
    )
  validate_release(tx, old, mock_config())
}

test release_rejected_when_skipping_treasury() {
  // Attack: pay builder the full amount, no treasury cut.
  // Without the treasury check this would pass.
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let tx =
    mk_tx(
      old,
      [payment_output(builder_addr(), 50_000_000)],
      [client_vkh, builder_vkh],
    )
  !validate_release(tx, old, mock_config())
}

test release_rejected_with_underpaid_treasury() {
  // Attack: pay treasury something, but less than the 5% cut.
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let tx =
    mk_tx(
      old,
      [
        payment_output(builder_addr(), 49_000_000),
        payment_output(treasury_addr(), 1_000_000),
      ],
      [client_vkh, builder_vkh],
    )
  !validate_release(tx, old, mock_config())
}

test release_rejected_with_underpaid_builder() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let tx =
    mk_tx(
      old,
      [
        payment_output(builder_addr(), 47_499_999),
        payment_output(treasury_addr(), 2_500_000),
      ],
      [client_vkh, builder_vkh],
    )
  !validate_release(tx, old, mock_config())
}

test release_rejected_when_status_is_selected() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
    }
  let tx =
    mk_tx(
      old,
      [
        payment_output(builder_addr(), 47_500_000),
        payment_output(treasury_addr(), 2_500_000),
      ],
      [client_vkh, builder_vkh],
    )
  !validate_release(tx, old, mock_config())
}

test release_min_floor_kicks_in_for_small_jobs() {
  // 20 ADA × 5% = 1 ADA, but min-UTxO floor is 1.5 ADA. So treasury gets 1.5 ADA, builder gets 18.5 ADA.
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
      amount_lovelace: 20_000_000,
    }
  let tx =
    mk_tx(
      old,
      [
        payment_output(builder_addr(), 18_500_000),
        payment_output(treasury_addr(), 1_500_000),
      ],
      [client_vkh, builder_vkh],
    )
  validate_release(tx, old, mock_config())
}

// ───────────────────────────────────────────────────────────────────────────
// Refund tests - no platform fee, full amount returns to client.
// ───────────────────────────────────────────────────────────────────────────

test refund_happy_path_from_selected() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
    }
  let tx =
    mk_tx(
      old,
      [payment_output(client_addr(), old.amount_lovelace)],
      [client_vkh, builder_vkh],
    )
  validate_refund(tx, old)
}

test refund_happy_path_from_submitted() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let tx =
    mk_tx(
      old,
      [payment_output(client_addr(), old.amount_lovelace)],
      [client_vkh, builder_vkh],
    )
  validate_refund(tx, old)
}

test refund_rejected_with_only_one_sig() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
    }
  let tx =
    mk_tx(
      old,
      [payment_output(client_addr(), old.amount_lovelace)],
      [client_vkh],
    )
  !validate_refund(tx, old)
}

test refund_rejected_paying_builder_instead() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
    }
  let tx =
    mk_tx(
      old,
      [payment_output(builder_addr(), old.amount_lovelace)],
      [client_vkh, builder_vkh],
    )
  !validate_refund(tx, old)
}

// ───────────────────────────────────────────────────────────────────────────
// BuilderWithdraw tests
// ───────────────────────────────────────────────────────────────────────────

test builder_withdraw_happy_path() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
    }
  let new =
    EscrowDatum {
      ..old,
      builder_address: None,
      selected_at: None,
      status: Open,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  validate_builder_withdraw(tx, own_ref(), old)
}

test builder_withdraw_rejected_when_signed_by_client() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
    }
  let new =
    EscrowDatum {
      ..old,
      builder_address: None,
      selected_at: None,
      status: Open,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [client_vkh])
  !validate_builder_withdraw(tx, own_ref(), old)
}

test builder_withdraw_rejected_after_submit() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let new =
    EscrowDatum {
      ..old,
      builder_address: None,
      selected_at: None,
      submitted_at: None,
      submission_cid: None,
      status: Open,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_builder_withdraw(tx, own_ref(), old)
}

test builder_withdraw_rejected_when_amount_changes() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      status: Selected,
    }
  let new =
    EscrowDatum {
      ..old,
      builder_address: None,
      selected_at: None,
      status: Open,
      amount_lovelace: 1,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_builder_withdraw(tx, own_ref(), old)
}

// ───────────────────────────────────────────────────────────────────────────
// Dispute tests
// ───────────────────────────────────────────────────────────────────────────

test dispute_happy_path_client_raised() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let cfg = mock_config()
  let new =
    EscrowDatum {
      ..old,
      status: Disputed,
      dispute_raised_by: Some(client_addr()),
      dispute_raised_at: Some(1_700_003_000_000),
      dispute_evidence_cid: Some(evidence_cid_a),
    }
  // UTxO now holds amount + dispute fee.
  let tx =
    mk_tx(
      old,
      [continuing_script_output_with(new, cfg.dispute_fee_lovelace)],
      [client_vkh],
    )
  validate_dispute(tx, own_ref(), old, cfg, evidence_cid_a)
}

test dispute_happy_path_builder_raised() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let cfg = mock_config()
  let new =
    EscrowDatum {
      ..old,
      status: Disputed,
      dispute_raised_by: Some(builder_addr()),
      dispute_raised_at: Some(1_700_003_000_000),
      dispute_evidence_cid: Some(evidence_cid_a),
    }
  let tx =
    mk_tx(
      old,
      [continuing_script_output_with(new, cfg.dispute_fee_lovelace)],
      [builder_vkh],
    )
  validate_dispute(tx, own_ref(), old, cfg, evidence_cid_a)
}

test dispute_rejected_without_dispute_fee() {
  // Attack: try to raise a dispute without paying the fee.
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let new =
    EscrowDatum {
      ..old,
      status: Disputed,
      dispute_raised_by: Some(client_addr()),
      dispute_raised_at: Some(1_700_003_000_000),
      dispute_evidence_cid: Some(evidence_cid_a),
    }
  // No extra lovelace added to the continuing UTxO.
  let tx = mk_tx(old, [continuing_script_output(new)], [client_vkh])
  !validate_dispute(tx, own_ref(), old, mock_config(), evidence_cid_a)
}

test dispute_rejected_when_no_signatures() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let cfg = mock_config()
  let new =
    EscrowDatum {
      ..old,
      status: Disputed,
      dispute_raised_by: Some(client_addr()),
      dispute_raised_at: Some(1_700_003_000_000),
      dispute_evidence_cid: Some(evidence_cid_a),
    }
  // Tx has no signers - should reject.
  let tx =
    mk_tx(
      old,
      [continuing_script_output_with(new, cfg.dispute_fee_lovelace)],
      [],
    )
  !validate_dispute(tx, own_ref(), old, cfg, evidence_cid_a)
}

test dispute_rejected_when_status_is_open() {
  // Attack: dispute a job that's still Open. Status guard must reject this
  // even when a builder_address is somehow set in the datum.
  let old =
    EscrowDatum { ..fresh_open_datum(), builder_address: Some(builder_addr()) }
  let cfg = mock_config()
  let new =
    EscrowDatum {
      ..old,
      status: Disputed,
      dispute_raised_by: Some(client_addr()),
      dispute_raised_at: Some(1_700_003_000_000),
      dispute_evidence_cid: Some(evidence_cid_a),
    }
  let tx =
    mk_tx(
      old,
      [continuing_script_output_with(new, cfg.dispute_fee_lovelace)],
      [client_vkh],
    )
  !validate_dispute(tx, own_ref(), old, cfg, evidence_cid_a)
}

test dispute_rejected_with_empty_evidence() {
  // Attack: dispute without actually pointing to any evidence.
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let cfg = mock_config()
  let empty: ByteArray = ""
  let new =
    EscrowDatum {
      ..old,
      status: Disputed,
      dispute_raised_by: Some(client_addr()),
      dispute_raised_at: Some(1_700_003_000_000),
      dispute_evidence_cid: Some(empty),
    }
  let tx =
    mk_tx(
      old,
      [continuing_script_output_with(new, cfg.dispute_fee_lovelace)],
      [client_vkh],
    )
  !validate_dispute(tx, own_ref(), old, cfg, empty)
}

// ───────────────────────────────────────────────────────────────────────────
// Resolve tests
// ───────────────────────────────────────────────────────────────────────────

fn disputed_datum_client_raised() -> EscrowDatum {
  EscrowDatum {
    ..fresh_open_datum(),
    builder_address: Some(builder_addr()),
    selected_at: Some(1_700_001_000_000),
    submitted_at: Some(1_700_002_000_000),
    submission_cid: None,
    status: Disputed,
    dispute_raised_by: Some(client_addr()),
    dispute_raised_at: Some(1_700_003_000_000),
    dispute_evidence_cid: Some(evidence_cid_a),
  }
}

test resolve_happy_path_in_favor_of_client() {
  let old = disputed_datum_client_raised()
  let cfg = mock_config()
  // Client gets full amount; treasury gets dispute fee.
  let tx =
    mk_tx(
      old,
      [
        payment_output(client_addr(), old.amount_lovelace),
        payment_output(treasury_addr(), cfg.dispute_fee_lovelace),
      ],
      [arbitrator_vkh, client_vkh],
    )
  validate_resolve(tx, old, cfg, False)
}

test resolve_happy_path_in_favor_of_builder() {
  let old = disputed_datum_client_raised()
  let cfg = mock_config()
  // Builder gets payout; treasury gets cut + dispute fee = 2.5 + 15 = 17.5 ADA.
  let tx =
    mk_tx(
      old,
      [
        payment_output(builder_addr(), 47_500_000),
        payment_output(treasury_addr(), 17_500_000),
      ],
      [arbitrator_vkh, builder_vkh],
    )
  validate_resolve(tx, old, cfg, True)
}

test resolve_rejected_without_arbitrator_sig() {
  // Attack: client + builder collude to "resolve" without arbitrator.
  let old = disputed_datum_client_raised()
  let cfg = mock_config()
  let tx =
    mk_tx(
      old,
      [
        payment_output(client_addr(), old.amount_lovelace),
        payment_output(treasury_addr(), cfg.dispute_fee_lovelace),
      ],
      [client_vkh, builder_vkh],
    )
  !validate_resolve(tx, old, cfg, False)
}

test resolve_rejected_when_treasury_doesnt_get_fee() {
  // Attack: arbitrator + client try to skip the dispute fee to treasury.
  let old = disputed_datum_client_raised()
  let cfg = mock_config()
  let tx =
    mk_tx(
      old,
      [payment_output(client_addr(), old.amount_lovelace)],
      [arbitrator_vkh, client_vkh],
    )
  !validate_resolve(tx, old, cfg, False)
}

test resolve_rejected_when_status_not_disputed() {
  // Try to resolve a non-disputed escrow.
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let cfg = mock_config()
  let tx =
    mk_tx(
      old,
      [
        payment_output(client_addr(), old.amount_lovelace),
        payment_output(treasury_addr(), cfg.dispute_fee_lovelace),
      ],
      [arbitrator_vkh, client_vkh],
    )
  !validate_resolve(tx, old, cfg, False)
}

// ───────────────────────────────────────────────────────────────────────────
// AutoRelease tests - validity-range time logic
// ───────────────────────────────────────────────────────────────────────────

test auto_release_happy_path_after_deadline() {
  let submitted_at_ms = 1_700_002_000_000
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(submitted_at_ms),
      submission_cid: None,
      status: Submitted,
    }
  let cfg = mock_config()
  // Deadline = submitted_at + 14 days. Tx validity starts after that.
  let deadline_ms = submitted_at_ms + 1_209_600 * 1000
  let tx =
    mk_tx_with_validity(
      old,
      [
        payment_output(builder_addr(), 47_500_000),
        payment_output(treasury_addr(), 2_500_000),
      ],
      [builder_vkh],
      interval.after(deadline_ms + 1),
    )
  validate_auto_release(tx, old, cfg)
}

test auto_release_rejected_before_deadline() {
  let submitted_at_ms = 1_700_002_000_000
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(submitted_at_ms),
      submission_cid: None,
      status: Submitted,
    }
  let cfg = mock_config()
  // Tx validity is before the deadline - must reject.
  let tx =
    mk_tx_with_validity(
      old,
      [
        payment_output(builder_addr(), 47_500_000),
        payment_output(treasury_addr(), 2_500_000),
      ],
      [builder_vkh],
      interval.after(submitted_at_ms),
    )
  !validate_auto_release(tx, old, cfg)
}

test auto_release_rejected_with_unbounded_validity() {
  // Attack: pass an open-ended validity range to bypass the time check.
  // is_entirely_after must reject this.
  let submitted_at_ms = 1_700_002_000_000
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(submitted_at_ms),
      submission_cid: None,
      status: Submitted,
    }
  let cfg = mock_config()
  let tx =
    mk_tx_with_validity(
      old,
      [
        payment_output(builder_addr(), 47_500_000),
        payment_output(treasury_addr(), 2_500_000),
      ],
      [builder_vkh],
      interval.everything,
    )
  !validate_auto_release(tx, old, cfg)
}

test auto_release_rejected_when_not_signed_by_builder() {
  let submitted_at_ms = 1_700_002_000_000
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(submitted_at_ms),
      submission_cid: None,
      status: Submitted,
    }
  let cfg = mock_config()
  let deadline_ms = submitted_at_ms + 1_209_600 * 1000
  // Client tries to trigger AutoRelease (only builder may do so).
  let tx =
    mk_tx_with_validity(
      old,
      [
        payment_output(builder_addr(), 47_500_000),
        payment_output(treasury_addr(), 2_500_000),
      ],
      [client_vkh],
      interval.after(deadline_ms + 1),
    )
  !validate_auto_release(tx, old, cfg)
}

// ───────────────────────────────────────────────────────────────────────────
// AutoRefund tests
// ───────────────────────────────────────────────────────────────────────────

test auto_refund_happy_path_after_deadline() {
  let selected_at_ms = 1_700_001_000_000
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(selected_at_ms),
      status: Selected,
    }
  let deadline_ms = selected_at_ms + 1_209_600 * 1000
  // Full amount to client, no platform fee on no-show.
  let tx =
    mk_tx_with_validity(
      old,
      [payment_output(client_addr(), old.amount_lovelace)],
      [client_vkh],
      interval.after(deadline_ms + 1),
    )
  validate_auto_refund(tx, old)
}

test auto_refund_rejected_before_deadline() {
  let selected_at_ms = 1_700_001_000_000
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(selected_at_ms),
      status: Selected,
    }
  let tx =
    mk_tx_with_validity(
      old,
      [payment_output(client_addr(), old.amount_lovelace)],
      [client_vkh],
      interval.after(selected_at_ms),
    )
  !validate_auto_refund(tx, old)
}

test auto_refund_rejected_after_submitted() {
  // Attack: builder already submitted; client tries to bypass via AutoRefund.
  let selected_at_ms = 1_700_001_000_000
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(selected_at_ms),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Submitted,
    }
  let deadline_ms = selected_at_ms + 1_209_600 * 1000
  let tx =
    mk_tx_with_validity(
      old,
      [payment_output(client_addr(), old.amount_lovelace)],
      [client_vkh],
      interval.after(deadline_ms + 1),
    )
  !validate_auto_refund(tx, old)
}

// ───────────────────────────────────────────────────────────────────────────
// ArbitratorTimeout tests
// ───────────────────────────────────────────────────────────────────────────

test arbitrator_timeout_happy_path_client_raiser() {
  let raised_at_ms = 1_700_003_000_000
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Disputed,
      dispute_raised_by: Some(client_addr()),
      dispute_raised_at: Some(raised_at_ms),
      dispute_evidence_cid: Some(evidence_cid_a),
    }
  let cfg = mock_config()
  let timeout_ms = raised_at_ms + arbitrator_timeout_seconds * 1000
  // Client raised → defaults to client refund + treasury fee.
  let tx =
    mk_tx_with_validity(
      old,
      [
        payment_output(client_addr(), old.amount_lovelace),
        payment_output(treasury_addr(), cfg.dispute_fee_lovelace),
      ],
      [client_vkh],
      interval.after(timeout_ms + 1),
    )
  validate_arbitrator_timeout(tx, old, cfg)
}

test arbitrator_timeout_happy_path_builder_raiser() {
  let raised_at_ms = 1_700_003_000_000
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Disputed,
      dispute_raised_by: Some(builder_addr()),
      dispute_raised_at: Some(raised_at_ms),
      dispute_evidence_cid: Some(evidence_cid_a),
    }
  let cfg = mock_config()
  let timeout_ms = raised_at_ms + arbitrator_timeout_seconds * 1000
  // Builder raised → defaults to release split + dispute fee to treasury.
  let tx =
    mk_tx_with_validity(
      old,
      [
        payment_output(builder_addr(), 47_500_000),
        payment_output(treasury_addr(), 17_500_000),
      ],
      [builder_vkh],
      interval.after(timeout_ms + 1),
    )
  validate_arbitrator_timeout(tx, old, cfg)
}

test arbitrator_timeout_rejected_before_deadline() {
  let raised_at_ms = 1_700_003_000_000
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Disputed,
      dispute_raised_by: Some(client_addr()),
      dispute_raised_at: Some(raised_at_ms),
      dispute_evidence_cid: Some(evidence_cid_a),
    }
  let cfg = mock_config()
  let tx =
    mk_tx_with_validity(
      old,
      [
        payment_output(client_addr(), old.amount_lovelace),
        payment_output(treasury_addr(), cfg.dispute_fee_lovelace),
      ],
      [client_vkh],
      interval.after(raised_at_ms),
    )
  !validate_arbitrator_timeout(tx, old, cfg)
}

test arbitrator_timeout_rejected_when_non_raiser_signs() {
  // Attack: client raised the dispute but builder tries to trigger timeout
  // and pay themselves.
  let raised_at_ms = 1_700_003_000_000
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
      submission_cid: None,
      status: Disputed,
      dispute_raised_by: Some(client_addr()),
      dispute_raised_at: Some(raised_at_ms),
      dispute_evidence_cid: Some(evidence_cid_a),
    }
  let cfg = mock_config()
  let timeout_ms = raised_at_ms + arbitrator_timeout_seconds * 1000
  let tx =
    mk_tx_with_validity(
      old,
      [
        payment_output(builder_addr(), 47_500_000),
        payment_output(treasury_addr(), 17_500_000),
      ],
      [builder_vkh],
      interval.after(timeout_ms + 1),
    )
  !validate_arbitrator_timeout(tx, old, cfg)
}
