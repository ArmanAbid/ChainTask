/**
 * Tx builders for the Week 7 happy-path flows.
 *
 * Each function takes the inputs it needs, builds a transaction, has
 * the connected wallet sign it, submits it, and returns the tx hash.
 * Callers (the UI screens) wrap these in TanStack `useMutation` for
 * pending/success/error UX.
 *
 * Conventions:
 *   - Times are POSIX ms (Date.now() compatible).
 *   - Addresses are bech32 strings; we convert to/from Plutus Address inside.
 *   - All Lucid `complete()` calls await wallet signing then submit.
 *
 * Out of scope for W7 (lands in W8): the other 8 redeemers (refund,
 * dispute, resolve, amend, builderWithdraw, autoRelease, autoRefund,
 * arbitratorTimeout) and the reputation cross-validator increment on
 * Release. The Release call below is single-validator only; the
 * reputation hook gets wired when we ship the W8 batch.
 */

import { Data, paymentCredentialOf } from "@lucid-evolution/lucid";
import type { LucidEvolution, UTxO } from "@lucid-evolution/lucid";
import { env } from "@/config/env";
import { PROTOCOL_PARAMS } from "@/config/protocol";
import {
  EscrowDatum,
  EscrowRedeemer,
  ProfileDatum,
  ProfileRedeemer,
  type EscrowDatumT,
  type ProfileDatumT,
} from "./schemas";
import { addressToBech32, bech32ToAddress } from "./address";
import {
  escrowAddress,
  getEscrowValidator,
  getProfileValidator,
  profileAddress,
} from "./scripts";

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function adaToLovelace(ada: number): bigint {
  return BigInt(Math.round(ada * 1_000_000));
}

function nowMs(): bigint {
  return BigInt(Date.now());
}

/**
 * Find an escrow UTxO at the script address by tx-hash + output index.
 * We need the full UTxO (not just our decoded view) to spend it.
 */
async function findEscrowUtxo(
  lucid: LucidEvolution,
  jobId: string,
): Promise<UTxO> {
  const [txHash, outputIndexStr] = jobId.split("#");
  if (!txHash || outputIndexStr === undefined) {
    throw new Error(`Bad job id format: ${jobId} (expected txHash#index)`);
  }
  const outputIndex = parseInt(outputIndexStr, 10);
  const utxos = await lucid.utxosByOutRef([{ txHash, outputIndex }]);
  if (utxos.length === 0) {
    throw new Error(
      `Job UTxO not found on chain. It may have been spent or the id is wrong.`,
    );
  }
  return utxos[0];
}

// ────────────────────────────────────────────────────────────────────────
// postJob
// ────────────────────────────────────────────────────────────────────────

export interface PostJobInput {
  clientAddress: string;
  arbitratorAddress: string;
  jobCid: string;
  category: string;
  budgetAda: number;
}

/**
 * Create a new escrow UTxO.
 *
 * Plutus V3 doesn't require a redeemer to *create* a UTxO — only to
 * spend one. So posting a job is a simple "pay to script" with the
 * datum attached inline. The escrow validator runs only when this UTxO
 * is later consumed (Select / Refund / etc.).
 */
export async function postJob(
  lucid: LucidEvolution,
  input: PostJobInput,
): Promise<string> {
  if (input.budgetAda < PROTOCOL_PARAMS.minJob) {
    throw new Error(
      `Budget must be at least ${PROTOCOL_PARAMS.minJob} ADA (minimum job size).`,
    );
  }

  const datum: EscrowDatumT = {
    client_address: bech32ToAddress(input.clientAddress),
    builder_address: null,
    arbitrator_address: bech32ToAddress(input.arbitratorAddress),
    job_cid: stringToHex(input.jobCid),
    amount_lovelace: adaToLovelace(input.budgetAda),
    category: stringToHex(input.category),
    created_at: nowMs(),
    selected_at: null,
    submitted_at: null,
    submission_cid: null,
    auto_release_deadline: BigInt(PROTOCOL_PARAMS.autoReleaseDays * 24 * 60 * 60),
    auto_refund_deadline: BigInt(PROTOCOL_PARAMS.autoRefundDays * 24 * 60 * 60),
    dispute_raised_by: null,
    dispute_raised_at: null,
    dispute_evidence_cid: null,
    status: "Open",
  };

  const tx = await lucid
    .newTx()
    .pay.ToAddressWithData(
      escrowAddress(),
      { kind: "inline", value: Data.to(datum, EscrowDatum) },
      { lovelace: adaToLovelace(input.budgetAda) },
    )
    .complete();

  const signed = await tx.sign.withWallet().complete();
  return signed.submit();
}

// ────────────────────────────────────────────────────────────────────────
// selectBuilder
// ────────────────────────────────────────────────────────────────────────

export interface SelectBuilderInput {
  jobId: string; // "txHash#index"
  builderAddress: string;
}

/**
 * Client picks a builder from off-chain proposals. Transitions the
 * escrow UTxO from Open -> Selected. Status update + builder_address +
 * selected_at; everything else frozen.
 */
export async function selectBuilder(
  lucid: LucidEvolution,
  input: SelectBuilderInput,
): Promise<string> {
  const validator = getEscrowValidator();
  if (!validator) throw new Error("Escrow validator not configured");

  const utxo = await findEscrowUtxo(lucid, input.jobId);
  if (!utxo.datum) throw new Error("Job UTxO has no inline datum");

  const oldDatum = Data.from<EscrowDatumT>(utxo.datum, EscrowDatum);
  if (oldDatum.status !== "Open") {
    throw new Error(`Cannot select on a job with status ${oldDatum.status}`);
  }

  const builderAddrPlutus = bech32ToAddress(input.builderAddress);
  const newDatum: EscrowDatumT = {
    ...oldDatum,
    builder_address: builderAddrPlutus,
    selected_at: nowMs(),
    status: "Selected",
  };

  const redeemer = Data.to(
    { Select: { builder: builderAddrPlutus } },
    EscrowRedeemer,
  );

  // The client must sign as the spending authority. Lucid adds their
  // payment key hash to extra_signatories automatically when we use
  // collectFrom against a script UTxO.
  const clientCred = paymentCredentialOf(await lucid.wallet().address());
  const tx = await lucid
    .newTx()
    .collectFrom([utxo], redeemer)
    .attach.SpendingValidator(validator)
    .pay.ToAddressWithData(
      utxo.address,
      { kind: "inline", value: Data.to(newDatum, EscrowDatum) },
      utxo.assets,
    )
    .addSignerKey(clientCred.hash)
    .complete();

  const signed = await tx.sign.withWallet().complete();
  return signed.submit();
}

// ────────────────────────────────────────────────────────────────────────
// submit
// ────────────────────────────────────────────────────────────────────────

export interface SubmitWorkInput {
  jobId: string;
  submissionCid: string;
}

/**
 * Builder marks work delivered. Transitions Selected -> Submitted.
 * Sets submitted_at and submission_cid; everything else frozen.
 */
export async function submitWork(
  lucid: LucidEvolution,
  input: SubmitWorkInput,
): Promise<string> {
  const validator = getEscrowValidator();
  if (!validator) throw new Error("Escrow validator not configured");

  const utxo = await findEscrowUtxo(lucid, input.jobId);
  if (!utxo.datum) throw new Error("Job UTxO has no inline datum");
  const oldDatum = Data.from<EscrowDatumT>(utxo.datum, EscrowDatum);
  if (oldDatum.status !== "Selected") {
    throw new Error(
      `Cannot submit on a job with status ${oldDatum.status} — must be Selected.`,
    );
  }

  const submissionCidHex = stringToHex(input.submissionCid);
  const newDatum: EscrowDatumT = {
    ...oldDatum,
    submitted_at: nowMs(),
    submission_cid: submissionCidHex,
    status: "Submitted",
  };

  const redeemer = Data.to(
    { Submit: { submission_cid: submissionCidHex } },
    EscrowRedeemer,
  );

  const builderCred = paymentCredentialOf(await lucid.wallet().address());
  const tx = await lucid
    .newTx()
    .collectFrom([utxo], redeemer)
    .attach.SpendingValidator(validator)
    .pay.ToAddressWithData(
      utxo.address,
      { kind: "inline", value: Data.to(newDatum, EscrowDatum) },
      utxo.assets,
    )
    .addSignerKey(builderCred.hash)
    .complete();

  const signed = await tx.sign.withWallet().complete();
  return signed.submit();
}

// ────────────────────────────────────────────────────────────────────────
// release
// ────────────────────────────────────────────────────────────────────────

export interface ReleaseInput {
  jobId: string;
}

/**
 * Client approves the submission. Spends the escrow UTxO and pays out
 * to the builder (minus the platform cut to the treasury).
 *
 * NOTE for W8: this version does NOT also increment the builder's
 * reputation UTxO. The reputation cross-validator increment lands in
 * the next release.
 *
 * Splits:
 *   treasury_cut    = amount * platform_cut_percent / 100, min 1.5 ADA
 *   builder_payout  = amount - treasury_cut
 */
export async function release(
  lucid: LucidEvolution,
  input: ReleaseInput,
): Promise<string> {
  const validator = getEscrowValidator();
  if (!validator) throw new Error("Escrow validator not configured");

  const utxo = await findEscrowUtxo(lucid, input.jobId);
  if (!utxo.datum) throw new Error("Job UTxO has no inline datum");
  const oldDatum = Data.from<EscrowDatumT>(utxo.datum, EscrowDatum);
  if (oldDatum.status !== "Submitted") {
    throw new Error(
      `Cannot release on a job with status ${oldDatum.status} — must be Submitted.`,
    );
  }
  if (!oldDatum.builder_address) {
    throw new Error("Job has no builder selected — cannot release.");
  }

  const amount = oldDatum.amount_lovelace;
  const cutPercent = BigInt(PROTOCOL_PARAMS.platformCutPercent);
  const rawCut = (amount * cutPercent) / 100n;
  const minUtxo = 1_500_000n;
  const treasuryCut = rawCut < minUtxo ? minUtxo : rawCut;
  const builderPayout = amount - treasuryCut;
  if (builderPayout <= 0n) {
    throw new Error("Builder payout would be non-positive after treasury cut.");
  }

  // We need bech32 addresses for the outputs.
  // The contract reads treasury_address from the GlobalConfig
  // reference UTxO; we mirror it here for the actual payout.
  const treasuryBech32 = env.treasuryAddress;
  if (!treasuryBech32) {
    throw new Error(
      "Treasury address not configured (VITE_TREASURY_ADDRESS). Required to release.",
    );
  }

  const builderBech32 = oldDatum.builder_address;
  const builderAddr = addressToBech32(builderBech32, env.network);
  if (!builderAddr) {
    throw new Error("Builder address decode failed; cannot pay out.");
  }

  const redeemer = Data.to("Release", EscrowRedeemer);

  // Client + builder both sign Release.
  const clientCred = paymentCredentialOf(await lucid.wallet().address());
  const builderCredHash =
    "VerificationKey" in builderBech32.payment_credential
      ? builderBech32.payment_credential.VerificationKey[0]
      : builderBech32.payment_credential.Script[0];

  // Need the GlobalConfig reference UTxO for the validator's config read.
  if (!env.globalConfigOutRef) {
    throw new Error(
      "GlobalConfig out-ref not configured (VITE_GLOBAL_CONFIG_OUTREF). Required to release.",
    );
  }
  const [gcTxHash, gcIxStr] = env.globalConfigOutRef.split("#");
  const gcUtxos = await lucid.utxosByOutRef([
    { txHash: gcTxHash, outputIndex: parseInt(gcIxStr, 10) },
  ]);
  if (gcUtxos.length === 0) {
    throw new Error("GlobalConfig reference UTxO not found on chain.");
  }

  const tx = await lucid
    .newTx()
    .collectFrom([utxo], redeemer)
    .attach.SpendingValidator(validator)
    .readFrom(gcUtxos)
    .pay.ToAddress(builderAddr, { lovelace: builderPayout })
    .pay.ToAddress(treasuryBech32, { lovelace: treasuryCut })
    .addSignerKey(clientCred.hash)
    .addSignerKey(builderCredHash)
    .complete();

  const signed = await tx.sign.withWallet().complete();
  return signed.submit();
}

// ────────────────────────────────────────────────────────────────────────
// updateProfile
// ────────────────────────────────────────────────────────────────────────

export interface UpdateProfileInput {
  ownerAddress: string;
  profileCid: string;
}

/**
 * Set or update the connected wallet's profile UTxO.
 *
 * If a profile UTxO already exists at the profile script address with
 * this owner_address, we spend it and produce a new one with the
 * updated CID (UpdateProfile redeemer). If none exists, we lazy-create
 * by paying to the script address with the initial datum (no validator
 * runs on creation).
 */
export async function updateProfile(
  lucid: LucidEvolution,
  input: UpdateProfileInput,
): Promise<string> {
  const validator = getProfileValidator();
  if (!validator) throw new Error("Profile validator not configured");

  const newDatum: ProfileDatumT = {
    owner_address: bech32ToAddress(input.ownerAddress),
    profile_cid: stringToHex(input.profileCid),
  };

  // Find existing profile UTxO for this owner, if any.
  const profileScriptAddr = profileAddress();
  const existing: UTxO[] = await lucid.utxosAt(profileScriptAddr);
  const ownerPaymentHex =
    "VerificationKey" in newDatum.owner_address.payment_credential
      ? newDatum.owner_address.payment_credential.VerificationKey[0]
      : newDatum.owner_address.payment_credential.Script[0];

  // Naïve linear scan — fine for the hackathon. Production would index
  // by owner. Picks the most recent matching UTxO if there are dupes
  // (which the validator doesn't prevent).
  const mine: UTxO | null =
    existing
      .filter((u) => {
        if (!u.datum) return false;
        try {
          const d = Data.from<ProfileDatumT>(u.datum, ProfileDatum);
          const h =
            "VerificationKey" in d.owner_address.payment_credential
              ? d.owner_address.payment_credential.VerificationKey[0]
              : d.owner_address.payment_credential.Script[0];
          return h === ownerPaymentHex;
        } catch {
          return false;
        }
      })
      .pop() ?? null;

  // Minimum lovelace to attach to the UTxO — Cardano protocol parameters
  // require at least ~1.5 ADA per UTxO depending on size.
  const profileUtxoLovelace = 2_000_000n;

  if (mine) {
    // Update path.
    const redeemer = Data.to(
      { UpdateProfile: { new_profile_cid: stringToHex(input.profileCid) } },
      ProfileRedeemer,
    );
    const cred = paymentCredentialOf(await lucid.wallet().address());
    const tx = await lucid
      .newTx()
      .collectFrom([mine], redeemer)
      .attach.SpendingValidator(validator)
      .pay.ToAddressWithData(
        profileScriptAddr,
        { kind: "inline", value: Data.to(newDatum, ProfileDatum) },
        { lovelace: mine.assets.lovelace ?? profileUtxoLovelace },
      )
      .addSignerKey(cred.hash)
      .complete();
    const signed = await tx.sign.withWallet().complete();
    return signed.submit();
  }

  // Create path — lazy initial profile. No validator runs.
  const tx = await lucid
    .newTx()
    .pay.ToAddressWithData(
      profileScriptAddr,
      { kind: "inline", value: Data.to(newDatum, ProfileDatum) },
      { lovelace: profileUtxoLovelace },
    )
    .complete();
  const signed = await tx.sign.withWallet().complete();
  return signed.submit();
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

/**
 * Convert a UTF-8 string to lowercase hex. Used for ByteArray fields
 * that semantically hold text (job_cid, category, etc.).
 */
function stringToHex(s: string): string {
  const bytes = new TextEncoder().encode(s);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
