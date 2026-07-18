// Six tests for validate_cancel_open covering the happy path and each
// fail mode. EscrowDatum has 16 fields - field order must match the
// declaration in types.ak or Aiken rejects with "N fields in a context
// where there should be M".

use aiken/collection/dict
use aiken/interval
use cardano/address.{Address, VerificationKey}
use cardano/assets
use cardano/transaction.{NoDatum, Transaction} as transaction
use chaintask/escrow_logic.{validate_cancel_open}
use chaintask/types.{EscrowDatum, Open, Selected}

// ── Helper: build a canonical Open EscrowDatum for testing ──
fn mock_open_datum(
  client: Address,
  arbitrator: Address,
  amount: Int,
) -> EscrowDatum {
  EscrowDatum {
    client_address: client,
    builder_address: None,
    arbitrator_address: arbitrator,
    job_cid: "QmMockJobCid",
    amount_lovelace: amount,
    category: "design",
    created_at: 1_700_000_000_000,
    selected_at: None,
    submitted_at: None,
    submission_cid: None,
    auto_release_deadline: 1_209_600,
    auto_refund_deadline: 1_209_600,
    dispute_raised_by: None,
    dispute_raised_at: None,
    dispute_evidence_cid: None,
    status: Open,
  }
}

// ── Helper: build a minimal Transaction with given signers + outputs ──
fn mock_tx(
  signers: List<ByteArray>,
  outputs: List<transaction.Output>,
) -> Transaction {
  Transaction {
    inputs: [],
    reference_inputs: [],
    outputs: outputs,
    fee: 200_000,
    mint: assets.zero,
    certificates: [],
    withdrawals: [],
    validity_range: interval.everything,
    extra_signatories: signers,
    redeemers: [],
    datums: dict.empty,
    id: #"",
    votes: [],
    proposal_procedures: [],
    current_treasury_amount: None,
    treasury_donation: None,
  }
}

// ────────────────────────────────────────────────────────────────
// Positive test - happy path
// ────────────────────────────────────────────────────────────────

test cancel_open_ok_when_client_signs_and_refunds() {
  let client_key = #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  let client = Address {
    payment_credential: VerificationKey(client_key),
    stake_credential: None,
  }
  let arbitrator = Address {
    payment_credential: VerificationKey(
      #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ),
    stake_credential: None,
  }
  let d = mock_open_datum(client, arbitrator, 25_000_000)

  let refund_output = transaction.Output {
    address: client,
    value: assets.from_lovelace(25_000_000),
    datum: NoDatum,
    reference_script: None,
  }
  let tx = mock_tx([client_key], [refund_output])

  validate_cancel_open(tx, d)
}

// ────────────────────────────────────────────────────────────────
// Negative tests - each gate must fail independently
// ────────────────────────────────────────────────────────────────

test cancel_open_fails_when_client_does_not_sign() {
  let client_key = #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  let client = Address {
    payment_credential: VerificationKey(client_key),
    stake_credential: None,
  }
  let arbitrator = Address {
    payment_credential: VerificationKey(
      #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ),
    stake_credential: None,
  }
  let d = mock_open_datum(client, arbitrator, 25_000_000)

  // A random other party signs - not the client.
  let other = #"cccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  let refund_output = transaction.Output {
    address: client,
    value: assets.from_lovelace(25_000_000),
    datum: NoDatum,
    reference_script: None,
  }
  let tx = mock_tx([other], [refund_output])

  !validate_cancel_open(tx, d)
}

test cancel_open_fails_when_status_not_open() {
  let client_key = #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  let client = Address {
    payment_credential: VerificationKey(client_key),
    stake_credential: None,
  }
  let arbitrator = Address {
    payment_credential: VerificationKey(
      #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ),
    stake_credential: None,
  }
  // Selected, not Open - CancelOpen must not apply.
  let d0 = mock_open_datum(client, arbitrator, 25_000_000)
  let d = EscrowDatum { ..d0, status: Selected }

  let refund_output = transaction.Output {
    address: client,
    value: assets.from_lovelace(25_000_000),
    datum: NoDatum,
    reference_script: None,
  }
  let tx = mock_tx([client_key], [refund_output])

  !validate_cancel_open(tx, d)
}

test cancel_open_fails_when_builder_assigned() {
  let client_key = #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  let client = Address {
    payment_credential: VerificationKey(client_key),
    stake_credential: None,
  }
  let arbitrator = Address {
    payment_credential: VerificationKey(
      #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ),
    stake_credential: None,
  }
  let builder = Address {
    payment_credential: VerificationKey(
      #"dddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    ),
    stake_credential: None,
  }
  // Status is Open but a builder is somehow assigned - defense-in-depth
  // check that the validator catches inconsistent state.
  let d0 = mock_open_datum(client, arbitrator, 25_000_000)
  let d = EscrowDatum { ..d0, builder_address: Some(builder) }

  let refund_output = transaction.Output {
    address: client,
    value: assets.from_lovelace(25_000_000),
    datum: NoDatum,
    reference_script: None,
  }
  let tx = mock_tx([client_key], [refund_output])

  !validate_cancel_open(tx, d)
}

test cancel_open_fails_when_refund_insufficient() {
  let client_key = #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  let client = Address {
    payment_credential: VerificationKey(client_key),
    stake_credential: None,
  }
  let arbitrator = Address {
    payment_credential: VerificationKey(
      #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ),
    stake_credential: None,
  }
  let d = mock_open_datum(client, arbitrator, 25_000_000)

  // Client tries to steal - refunds less than the escrow amount.
  let short_refund = transaction.Output {
    address: client,
    value: assets.from_lovelace(10_000_000),
    datum: NoDatum,
    reference_script: None,
  }
  let tx = mock_tx([client_key], [short_refund])

  !validate_cancel_open(tx, d)
}

test cancel_open_fails_when_refund_goes_elsewhere() {
  let client_key = #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  let client = Address {
    payment_credential: VerificationKey(client_key),
    stake_credential: None,
  }
  let arbitrator = Address {
    payment_credential: VerificationKey(
      #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ),
    stake_credential: None,
  }
  let attacker = Address {
    payment_credential: VerificationKey(
      #"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    ),
    stake_credential: None,
  }
  let d = mock_open_datum(client, arbitrator, 25_000_000)

  // Refund is the right amount but goes to the wrong address.
  let stolen_refund = transaction.Output {
    address: attacker,
    value: assets.from_lovelace(25_000_000),
    datum: NoDatum,
    reference_script: None,
  }
  let tx = mock_tx([client_key], [stolen_refund])

  !validate_cancel_open(tx, d)
}
