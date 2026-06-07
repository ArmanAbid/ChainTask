use cardano/transaction.{OutputReference, Transaction}
use chaintask/profile_logic.{validate_update_profile}
use chaintask/types.{ProfileDatum, ProfileRedeemer, UpdateProfile}

validator profile {
  spend(
    datum: Option<ProfileDatum>,
    redeemer: ProfileRedeemer,
    own_ref: OutputReference,
    tx: Transaction,
  ) {
    expect Some(old) = datum
    let UpdateProfile { new_profile_cid } = redeemer
    validate_update_profile(tx, own_ref, old, new_profile_cid)
  }

  else(_) {
    fail
  }
}
