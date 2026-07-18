//// Profile validator tests.

use cardano/address.{Address, Script, VerificationKey}
use cardano/assets
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, placeholder,
}
use chaintask/profile_logic.{validate_update_profile}
use chaintask/types.{ProfileDatum}

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

const owner_vkh: ByteArray =
  #"f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0"

const attacker_vkh: ByteArray =
  #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

const profile_script_hash: ByteArray =
  #"90909090909090909090909090909090909090909090909090909090"

const cid_old: ByteArray = "QmOldProfile1111111111111111111"

const cid_new: ByteArray = "QmNewProfile2222222222222222222"

fn vk_address(vkh: ByteArray) -> Address {
  Address { payment_credential: VerificationKey(vkh), stake_credential: None }
}

fn owner_addr() -> Address {
  vk_address(owner_vkh)
}

fn attacker_addr() -> Address {
  vk_address(attacker_vkh)
}

fn profile_script_addr() -> Address {
  Address {
    payment_credential: Script(profile_script_hash),
    stake_credential: None,
  }
}

fn fresh_profile() -> ProfileDatum {
  ProfileDatum { owner_address: owner_addr(), profile_cid: cid_old }
}

const own_ref: OutputReference =
  OutputReference {
    transaction_id: #"f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1",
    output_index: 0,
  }

fn profile_input(d: ProfileDatum) -> Input {
  Input {
    output_reference: own_ref,
    output: Output {
      address: profile_script_addr(),
      value: assets.from_lovelace(2_000_000),
      datum: InlineDatum(d),
      reference_script: None,
    },
  }
}

fn continuing_profile_output(d: ProfileDatum) -> Output {
  Output {
    address: profile_script_addr(),
    value: assets.from_lovelace(2_000_000),
    datum: InlineDatum(d),
    reference_script: None,
  }
}

fn mk_tx(
  old: ProfileDatum,
  outputs: List<Output>,
  signers: List<ByteArray>,
) -> Transaction {
  Transaction {
    ..placeholder,
    inputs: [profile_input(old)],
    outputs,
    extra_signatories: signers,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// UpdateProfile tests
// ───────────────────────────────────────────────────────────────────────────

test update_profile_happy_path() {
  let old = fresh_profile()
  let new = ProfileDatum { ..old, profile_cid: cid_new }
  let tx = mk_tx(old, [continuing_profile_output(new)], [owner_vkh])
  validate_update_profile(tx, own_ref, old, cid_new)
}

test update_profile_rejected_when_not_signed_by_owner() {
  let old = fresh_profile()
  let new = ProfileDatum { ..old, profile_cid: cid_new }
  let tx = mk_tx(old, [continuing_profile_output(new)], [attacker_vkh])
  !validate_update_profile(tx, own_ref, old, cid_new)
}

test update_profile_rejected_when_owner_changed() {
  // Owner address must stay pinned - an attacker who somehow got the
  // owner's signature on a tx shouldn't be able to "transfer ownership".
  let old = fresh_profile()
  let new =
    ProfileDatum { owner_address: attacker_addr(), profile_cid: cid_new }
  let tx = mk_tx(old, [continuing_profile_output(new)], [owner_vkh])
  !validate_update_profile(tx, own_ref, old, cid_new)
}

test update_profile_rejected_when_output_cid_mismatches_redeemer() {
  // The CID in the output datum must match the CID in the redeemer.
  // Prevents a builder from claiming "I'm updating to CID X" while actually
  // writing CID Y to the chain.
  let old = fresh_profile()
  let new =
    ProfileDatum { ..old, profile_cid: "QmSomethingElse00000000000000000" }
  let tx = mk_tx(old, [continuing_profile_output(new)], [owner_vkh])
  !validate_update_profile(tx, own_ref, old, cid_new)
}

test update_profile_rejected_when_cid_empty() {
  // Empty CID is meaningless - fail it explicitly to avoid weird states.
  let old = fresh_profile()
  let new = ProfileDatum { ..old, profile_cid: #"" }
  let tx = mk_tx(old, [continuing_profile_output(new)], [owner_vkh])
  !validate_update_profile(tx, own_ref, old, #"")
}

test update_profile_rejected_when_cid_too_long() {
  // Bounded at 64 bytes (max_profile_cid_bytes). Anything longer should fail
  // to keep datum size predictable and bound validator ex-units.
  let too_long: ByteArray =
    #"6161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161"
  let old = fresh_profile()
  let new = ProfileDatum { ..old, profile_cid: too_long }
  let tx = mk_tx(old, [continuing_profile_output(new)], [owner_vkh])
  !validate_update_profile(tx, own_ref, old, too_long)
}
