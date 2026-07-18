//// ChainTask profile validator logic.
////
//// Profiles are self-attested: anyone can claim any name. The validator's
//// only job is to enforce that *only the owner* can update their own
//// profile UTxO, and that the owner_address never changes after creation.
////
//// Profile UTxOs are lazily created - the first time a user sets a profile,
//// the frontend builds a tx that produces an output at the profile script
//// address with their profile datum. No validator runs on creation. The
//// validator only runs when an existing profile UTxO is being spent
//// (i.e. when the user updates their CID).
////
//// One UTxO per owner is a frontend convention, not a validator
//// invariant - the script doesn't enforce uniqueness. If two profile
//// UTxOs exist for the same owner the frontend picks the most recent.

use aiken/builtin
use cardano/transaction.{OutputReference, Transaction}
use chaintask/tx_helpers.{continuing_output, inline_datum_of, is_signed_by}
use chaintask/types.{ProfileDatum, max_profile_cid_bytes}

// ───────────────────────────────────────────────────────────────────────────
// UpdateProfile - owner changes the off-chain profile CID.
// ───────────────────────────────────────────────────────────────────────────
//
// Allowed to change:  profile_cid
// Frozen:             owner_address
// Signed by:          owner only
//
pub fn validate_update_profile(
  tx: Transaction,
  own_ref: OutputReference,
  old_datum: ProfileDatum,
  new_profile_cid: ByteArray,
) -> Bool {
  let signed = is_signed_by(tx, old_datum.owner_address)

  expect Some(out) = continuing_output(tx, own_ref)
  expect Some(raw) = inline_datum_of(out)
  expect new_datum: ProfileDatum = raw

  // owner_address must remain pinned to the original wallet - otherwise an
  // attacker could "transfer ownership" of a profile to themselves.
  let owner_frozen = new_datum.owner_address == old_datum.owner_address

  // The output CID must match the redeemer value exactly, and stay bounded.
  let cid_len = builtin.length_of_bytearray(new_profile_cid)
  let cid_set_correctly = and {
      new_datum.profile_cid == new_profile_cid,
      cid_len > 0,
      cid_len <= max_profile_cid_bytes,
    }

  and {
    signed,
    owner_frozen,
    cid_set_correctly,
  }
}
