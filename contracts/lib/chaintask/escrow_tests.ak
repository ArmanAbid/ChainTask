//// Validator branch tests for Week 2 redeemers.
////
//// Each test constructs a small mock Transaction and EscrowDatum, passes it through the per-branch validator, and asserts True/False. Both happy paths and the most important rejection cases are covered.
////
//// Unit-level — these don't simulate a full Cardano tx end to end.
//// Integration tests come in Week 5 against the testnet.

use aiken/interval
use cardano/address.{Address, VerificationKey}
use cardano/assets
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Transaction, placeholder,
}
use chaintask/escrow_logic.{
  validate_builder_withdraw, validate_refund, validate_release, validate_select,
  validate_submit, validate_update,
}
use chaintask/types.{
  EscrowDatum, GlobalConfig, Open, Selected, Submitted,
  default_auto_refund_seconds, default_auto_release_seconds,
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
    auto_release_deadline: default_auto_release_seconds,
    auto_refund_deadline: default_auto_refund_seconds,
    dispute_raised_by: None,
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
  // 17-byte category — over the 16-byte cap.
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
      status: Submitted,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  validate_submit(tx, own_ref(), old)
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
      status: Submitted,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [client_vkh])
  !validate_submit(tx, own_ref(), old)
}

test submit_rejected_when_status_is_open() {
  let old =
    EscrowDatum { ..fresh_open_datum(), builder_address: Some(builder_addr()) }
  let new =
    EscrowDatum {
      ..old,
      submitted_at: Some(1_700_002_000_000),
      status: Submitted,
    }
  let tx = mk_tx(old, [continuing_script_output(new)], [builder_vkh])
  !validate_submit(tx, own_ref(), old)
}

// ───────────────────────────────────────────────────────────────────────────
// Release tests — these now validate the platform-fee split is enforced.
// ───────────────────────────────────────────────────────────────────────────

test release_happy_path() {
  // 50 ADA × 5% = 2.5 ADA cut, well above the 1.5 ADA min-UTxO floor. builder gets 47.5 ADA, treasury gets 2.5 ADA.
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
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

test release_rejected_with_only_client_sig() {
  let old =
    EscrowDatum {
      ..fresh_open_datum(),
      builder_address: Some(builder_addr()),
      selected_at: Some(1_700_001_000_000),
      submitted_at: Some(1_700_002_000_000),
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
  !validate_release(tx, old, mock_config())
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
// Refund tests — no platform fee, full amount returns to client.
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
      status: Submitted,
    }
  let new =
    EscrowDatum {
      ..old,
      builder_address: None,
      selected_at: None,
      submitted_at: None,
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
