//// Transaction-shape helpers used by the escrow validator.
////
//// Small pure functions over a Transaction so the per-redeemer logic in
//// escrow_logic.ak stays readable and individually testable.

use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Address, VerificationKey}
use cardano/assets.{PolicyId, lovelace_of, quantity_of}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use chaintask/types.{GlobalConfig}

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

/// Cardano min-UTxO floor for a plain ADA-only output. Below this, an output
/// can't exist on-chain. Used as the floor on platform_cut so the treasury
/// payment is always a valid standalone UTxO.
pub const min_utxo_lovelace: Int = 1_500_000

// ───────────────────────────────────────────────────────────────────────────
// Signatures
// ───────────────────────────────────────────────────────────────────────────

/// True if `addr` (a VerificationKey-paymented address) signed this tx.
/// Script addresses cannot sign, so they are rejected.
pub fn is_signed_by(tx: Transaction, addr: Address) -> Bool {
  when addr.payment_credential is {
    VerificationKey(vkh) -> list.has(tx.extra_signatories, vkh)
    _ -> False
  }
}

/// Lift an Address to its VerificationKeyHash if possible. Used by tests.
pub fn vkh_of(addr: Address) -> Option<VerificationKeyHash> {
  when addr.payment_credential is {
    VerificationKey(vkh) -> Some(vkh)
    _ -> None
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Output lookups
// ───────────────────────────────────────────────────────────────────────────

/// Sum of lovelace paid to `recipient` across all tx outputs.
/// Used to verify the validator distributed funds correctly.
pub fn lovelace_paid_to(tx: Transaction, recipient: Address) -> Int {
  list.foldr(
    tx.outputs,
    0,
    fn(out: Output, acc: Int) {
      if out.address == recipient {
        acc + lovelace_of(out.value)
      } else {
        acc
      }
    },
  )
}

/// Find the single continuing output at the same script address as the
/// input being spent, with an inline datum. Used by Update/Select/Submit
/// where the escrow continues to live on-chain after the action.
///
/// Returns None if there is no continuing output, or more than one - which
/// the caller should treat as a validation failure.
pub fn continuing_output(
  tx: Transaction,
  own_ref: OutputReference,
) -> Option<Output> {
  let own_input = list.find(tx.inputs, fn(i) { i.output_reference == own_ref })

  when own_input is {
    None -> None
    Some(input) -> {
      let own_addr = input.output.address
      let continuing = list.filter(tx.outputs, fn(o) { o.address == own_addr })
      when continuing is {
        [single] -> Some(single)
        _ -> None
      }
    }
  }
}

/// Extract the inline datum from an Output, if present.
/// Returns None for hash-only or no-datum outputs (we only support inline).
pub fn inline_datum_of(output: Output) -> Option<Data> {
  when output.datum is {
    InlineDatum(data) -> Some(data)
    _ -> None
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Global config reference UTxO lookup
// ───────────────────────────────────────────────────────────────────────────

/// Locate the GlobalConfig reference UTxO via the Admin NFT.
///
/// The escrow validator is parameterized by the Admin Policy ID at deploy
/// time. The single NFT minted under that policy lives at a known reference
/// UTxO that holds the current GlobalConfig as inline datum. Anyone can
/// reference (read) this UTxO without consuming it; only the protocol admin
/// can update the config by spending and recreating it.
///
/// Returns None if the Admin NFT is not present in any reference input -
/// which the caller should treat as a validation failure for any branch
/// that needs config (Release, AutoRelease, Resolve, Dispute, Update).
pub fn find_global_config(
  tx: Transaction,
  admin_policy: PolicyId,
) -> Option<GlobalConfig> {
  // Look for the "ChainTaskAdmin" NFT in reference inputs. The admin
  // policy is unique per deployment (parameterized by a one-shot
  // OutputReference at mint time), so no third party can forge one.
  // The asset name matches what deploy.mjs / deploy-mainnet.mjs mint:
  //   ADMIN_ASSET_NAME = "ChainTaskAdmin"
  //     hex bytes      = 436861696e5461736b41646d696e
  // Keep these in sync. If you rename the asset in the deploy script,
  // update this hex string too and rebuild + redeploy.
  let config_input =
    list.find(
      tx.reference_inputs,
      fn(input) {
        quantity_of(
          input.output.value,
          admin_policy,
          #"436861696e5461736b41646d696e",
        ) >= 1
      },
    )

  when config_input is {
    None -> None
    Some(input) ->
      when input.output.datum is {
        InlineDatum(data) -> {
          expect cfg: GlobalConfig = data
          Some(cfg)
        }
        _ -> None
      }
  }
}

/// Treasury cut: percent of the locked amount, with the protocol's
/// min-UTxO floor so the treasury payment is always a valid output.
pub fn treasury_cut(amount_lovelace: Int, platform_cut_percent: Int) -> Int {
  let base = amount_lovelace * platform_cut_percent / 100
  if base < min_utxo_lovelace {
    min_utxo_lovelace
  } else {
    base
  }
}

/// Builder payout: locked amount minus the treasury cut.
pub fn builder_payout(amount_lovelace: Int, platform_cut_percent: Int) -> Int {
  amount_lovelace - treasury_cut(amount_lovelace, platform_cut_percent)
}
