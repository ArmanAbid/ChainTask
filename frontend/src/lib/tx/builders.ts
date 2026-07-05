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
  ReputationDatum,
  ReputationRedeemer,
  type EscrowDatumT,
  type ProfileDatumT,
  type ReputationDatumT,
} from "./schemas";
import { addressToBech32, bech32ToAddress } from "./address";
import {
  escrowAddress,
  getEscrowValidator,
  getProfileValidator,
  getReputationValidator,
  profileAddress,
  reputationAddress,
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
// Reputation helpers
//
// The reputation validator enforces that any spend of a builder's
// reputation UTxO must coincide with a matching escrow event in the same
// tx (Release, BuilderWithdraw, Resolve, AutoRelease, ArbitratorTimeout).
// The escrow validator does NOT require a reputation update, so we treat
// reputation as an optional but always-attempted side effect:
//
//   - If builder has no reputation UTxO: create one lazily (no validator
//     runs because nothing is being spent on the reputation side).
//   - If builder has a reputation UTxO: spend it with the matching
//     IncrementOn* redeemer and re-create with updated counters. The
//     reputation validator enforces correctness.
//
// Minimum lovelace held by a reputation UTxO. Datum is ~256 bytes; 2 ADA
// is safe under Cardano's min-utxo formula.
// ────────────────────────────────────────────────────────────────────────

const REPUTATION_UTXO_LOVELACE = 2_000_000n;
const MAX_RECENT_JOBS = 10;

/**
 * Find a builder's reputation UTxO at the reputation script address.
 * Returns null if none exists yet (first job).
 */
async function findReputationUtxo(
  lucid: LucidEvolution,
  builderPaymentHex: string,
): Promise<{ utxo: UTxO; datum: ReputationDatumT } | null> {
  const repAddr = reputationAddress();
  const utxos = await lucid.utxosAt(repAddr);
  for (const u of utxos) {
    if (!u.datum) continue;
    try {
      const d = Data.from<ReputationDatumT>(u.datum, ReputationDatum);
      const hex =
        "VerificationKey" in d.builder_address.payment_credential
          ? d.builder_address.payment_credential.VerificationKey[0]
          : d.builder_address.payment_credential.Script[0];
      if (hex === builderPaymentHex) {
        return { utxo: u, datum: d };
      }
    } catch {
      // Skip undecodable datums — they're not ours.
      continue;
    }
  }
  return null;
}

/**
 * Prepend a job CID to a builder's recent jobs list, capping at 10.
 * Mirrors the on-chain `prepend_capped` helper exactly so the validator's
 * equality check passes.
 */
function prependCapped(
  cid: string,
  list: string[],
  cap = MAX_RECENT_JOBS,
): string[] {
  const next = [cid, ...list];
  return next.length <= cap ? next : next.slice(0, cap);
}

/** Build initial reputation datum for a first-time release. */
function initialRepDatumOnRelease(
  builderAddress: ReputationDatumT["builder_address"],
  volumeLovelace: bigint,
  jobCidHex: string,
  timestamp: bigint,
): ReputationDatumT {
  return {
    builder_address: builderAddress,
    completed_jobs: 1n,
    total_volume_lovelace: volumeLovelace,
    disputes_won: 0n,
    disputes_lost: 0n,
    withdrawals: 0n,
    first_job_timestamp: timestamp,
    last_activity_timestamp: timestamp,
    recent_job_cids: [jobCidHex],
  };
}

/** Build initial reputation datum for a first-ever event being a withdrawal. */
function initialRepDatumOnWithdraw(
  builderAddress: ReputationDatumT["builder_address"],
  timestamp: bigint,
): ReputationDatumT {
  return {
    builder_address: builderAddress,
    completed_jobs: 0n,
    total_volume_lovelace: 0n,
    disputes_won: 0n,
    disputes_lost: 0n,
    withdrawals: 1n,
    first_job_timestamp: timestamp,
    last_activity_timestamp: timestamp,
    recent_job_cids: [],
  };
}

/** Build initial reputation datum for a first-ever event being a dispute outcome. */
function initialRepDatumOnDispute(
  builderAddress: ReputationDatumT["builder_address"],
  won: boolean,
  timestamp: bigint,
): ReputationDatumT {
  return {
    builder_address: builderAddress,
    completed_jobs: 0n,
    total_volume_lovelace: 0n,
    disputes_won: won ? 1n : 0n,
    disputes_lost: won ? 0n : 1n,
    withdrawals: 0n,
    first_job_timestamp: timestamp,
    last_activity_timestamp: timestamp,
    recent_job_cids: [],
  };
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

  const treasuryBech32 = env.treasuryAddress;
  if (!treasuryBech32) {
    throw new Error(
      "Treasury address not configured (VITE_TREASURY_ADDRESS). Required to release.",
    );
  }

  const builderPlutus = oldDatum.builder_address;
  const builderAddr = addressToBech32(builderPlutus, env.network);
  if (!builderAddr) {
    throw new Error("Builder address decode failed; cannot pay out.");
  }
  const builderPaymentHex =
    "VerificationKey" in builderPlutus.payment_credential
      ? builderPlutus.payment_credential.VerificationKey[0]
      : builderPlutus.payment_credential.Script[0];

  const redeemer = Data.to("Release", EscrowRedeemer);

  const clientCred = paymentCredentialOf(await lucid.wallet().address());
  const builderCredHash = builderPaymentHex;

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

  // ── Reputation cross-validator wiring ──
  //
  // The reputation validator requires that an IncrementOnRelease redeemer
  // is paired with an escrow input being spent with Release (or
  // AutoRelease). We satisfy that here. If the builder has no rep UTxO
  // yet, we just create one and don't spend anything — no rep validator
  // runs in that case.
  const timestamp = nowMs();
  const existingRep = await findReputationUtxo(lucid, builderPaymentHex);
  const repAddr = reputationAddress();

  let txBuilder = lucid
    .newTx()
    .collectFrom([utxo], redeemer)
    .attach.SpendingValidator(validator)
    .readFrom(gcUtxos)
    .pay.ToAddress(builderAddr, { lovelace: builderPayout })
    .pay.ToAddress(treasuryBech32, { lovelace: treasuryCut })
    .addSignerKey(clientCred.hash)
    .addSignerKey(builderCredHash);

  if (existingRep) {
    // Spend + replace the existing reputation UTxO.
    const repValidator = getReputationValidator();
    if (!repValidator) {
      throw new Error("Reputation validator not configured");
    }
    const repRedeemer = Data.to(
      {
        IncrementOnRelease: {
          volume: amount,
          timestamp,
          job_cid: oldDatum.job_cid,
        },
      },
      ReputationRedeemer,
    );
    const newRepDatum: ReputationDatumT = {
      ...existingRep.datum,
      completed_jobs: existingRep.datum.completed_jobs + 1n,
      total_volume_lovelace:
        existingRep.datum.total_volume_lovelace + amount,
      last_activity_timestamp: timestamp,
      recent_job_cids: prependCapped(
        oldDatum.job_cid,
        existingRep.datum.recent_job_cids,
      ),
    };
    txBuilder = txBuilder
      .collectFrom([existingRep.utxo], repRedeemer)
      .attach.SpendingValidator(repValidator)
      .pay.ToAddressWithData(
        repAddr,
        { kind: "inline", value: Data.to(newRepDatum, ReputationDatum) },
        { lovelace: existingRep.utxo.assets.lovelace ?? REPUTATION_UTXO_LOVELACE },
      );
  } else {
    // Lazy-create — no rep validator runs because we're not spending one.
    const initialRep = initialRepDatumOnRelease(
      builderPlutus,
      amount,
      oldDatum.job_cid,
      timestamp,
    );
    txBuilder = txBuilder.pay.ToAddressWithData(
      repAddr,
      { kind: "inline", value: Data.to(initialRep, ReputationDatum) },
      { lovelace: REPUTATION_UTXO_LOVELACE },
    );
  }

  const tx = await txBuilder.complete();
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
// refund — mutual cancellation
//
// Both client + builder sign; status must be Selected or Submitted.
// Full amount returned to client (no platform fee on mutual cancel).
// ────────────────────────────────────────────────────────────────────────

export interface RefundInput {
  jobId: string;
}

export async function refund(
  lucid: LucidEvolution,
  input: RefundInput,
): Promise<string> {
  const validator = getEscrowValidator();
  if (!validator) throw new Error("Escrow validator not configured");

  const utxo = await findEscrowUtxo(lucid, input.jobId);
  if (!utxo.datum) throw new Error("Job UTxO has no inline datum");
  const oldDatum = Data.from<EscrowDatumT>(utxo.datum, EscrowDatum);
  if (oldDatum.status !== "Selected" && oldDatum.status !== "Submitted") {
    throw new Error(
      `Refund requires Selected or Submitted status; this job is ${oldDatum.status}`,
    );
  }
  if (!oldDatum.builder_address) {
    throw new Error("Job has no builder — nothing to refund mutually");
  }

  const clientAddr = addressToBech32(oldDatum.client_address, env.network);
  if (!clientAddr) throw new Error("Could not decode client bech32");

  const clientCredHash =
    "VerificationKey" in oldDatum.client_address.payment_credential
      ? oldDatum.client_address.payment_credential.VerificationKey[0]
      : oldDatum.client_address.payment_credential.Script[0];
  const builderCredHash =
    "VerificationKey" in oldDatum.builder_address.payment_credential
      ? oldDatum.builder_address.payment_credential.VerificationKey[0]
      : oldDatum.builder_address.payment_credential.Script[0];

  const redeemer = Data.to("Refund", EscrowRedeemer);
  const tx = await lucid
    .newTx()
    .collectFrom([utxo], redeemer)
    .attach.SpendingValidator(validator)
    .pay.ToAddress(clientAddr, { lovelace: oldDatum.amount_lovelace })
    .addSignerKey(clientCredHash)
    .addSignerKey(builderCredHash)
    .complete();

  const signed = await tx.sign.withWallet().complete();
  return signed.submit();
}

// ────────────────────────────────────────────────────────────────────────
// builderWithdraw — builder leaves a Selected job before submitting
//
// Builder signs alone. Escrow resets to Open (builder_address = null,
// selected_at = null); funds stay locked at script address.
// ────────────────────────────────────────────────────────────────────────

export interface BuilderWithdrawInput {
  jobId: string;
}

export async function builderWithdraw(
  lucid: LucidEvolution,
  input: BuilderWithdrawInput,
): Promise<string> {
  const validator = getEscrowValidator();
  if (!validator) throw new Error("Escrow validator not configured");

  const utxo = await findEscrowUtxo(lucid, input.jobId);
  if (!utxo.datum) throw new Error("Job UTxO has no inline datum");
  const oldDatum = Data.from<EscrowDatumT>(utxo.datum, EscrowDatum);
  if (oldDatum.status !== "Selected") {
    throw new Error(
      `Withdraw requires Selected status; this job is ${oldDatum.status}`,
    );
  }
  if (!oldDatum.builder_address) {
    throw new Error("Job has no builder assigned");
  }

  const newDatum: EscrowDatumT = {
    ...oldDatum,
    builder_address: null,
    selected_at: null,
    status: "Open",
  };

  const builderPlutus = oldDatum.builder_address;
  const builderCredHash =
    "VerificationKey" in builderPlutus.payment_credential
      ? builderPlutus.payment_credential.VerificationKey[0]
      : builderPlutus.payment_credential.Script[0];

  const redeemer = Data.to("BuilderWithdraw", EscrowRedeemer);

  // Reputation cross-validator: spend or create rep UTxO with
  // IncrementOnWithdraw redeemer.
  const timestamp = nowMs();
  const existingRep = await findReputationUtxo(lucid, builderCredHash);
  const repAddr = reputationAddress();

  let txBuilder = lucid
    .newTx()
    .collectFrom([utxo], redeemer)
    .attach.SpendingValidator(validator)
    .pay.ToAddressWithData(
      utxo.address,
      { kind: "inline", value: Data.to(newDatum, EscrowDatum) },
      utxo.assets,
    )
    .addSignerKey(builderCredHash);

  if (existingRep) {
    const repValidator = getReputationValidator();
    if (!repValidator) {
      throw new Error("Reputation validator not configured");
    }
    const repRedeemer = Data.to(
      { IncrementOnWithdraw: { timestamp } },
      ReputationRedeemer,
    );
    const newRepDatum: ReputationDatumT = {
      ...existingRep.datum,
      withdrawals: existingRep.datum.withdrawals + 1n,
      last_activity_timestamp: timestamp,
    };
    txBuilder = txBuilder
      .collectFrom([existingRep.utxo], repRedeemer)
      .attach.SpendingValidator(repValidator)
      .pay.ToAddressWithData(
        repAddr,
        { kind: "inline", value: Data.to(newRepDatum, ReputationDatum) },
        { lovelace: existingRep.utxo.assets.lovelace ?? REPUTATION_UTXO_LOVELACE },
      );
  } else {
    const initialRep = initialRepDatumOnWithdraw(builderPlutus, timestamp);
    txBuilder = txBuilder.pay.ToAddressWithData(
      repAddr,
      { kind: "inline", value: Data.to(initialRep, ReputationDatum) },
      { lovelace: REPUTATION_UTXO_LOVELACE },
    );
  }

  const tx = await txBuilder.complete();
  const signed = await tx.sign.withWallet().complete();
  return signed.submit();
}

// ────────────────────────────────────────────────────────────────────────
// dispute — either party raises a dispute
//
// Raiser signs (client OR builder). Adds dispute fee to the UTxO,
// pins evidence CID in datum, advances status to Disputed.
// ────────────────────────────────────────────────────────────────────────

export interface DisputeInput {
  jobId: string;
  evidenceCid: string;
  raiserSide: "client" | "builder";
}

export async function dispute(
  lucid: LucidEvolution,
  input: DisputeInput,
): Promise<string> {
  const validator = getEscrowValidator();
  if (!validator) throw new Error("Escrow validator not configured");

  const utxo = await findEscrowUtxo(lucid, input.jobId);
  if (!utxo.datum) throw new Error("Job UTxO has no inline datum");
  const oldDatum = Data.from<EscrowDatumT>(utxo.datum, EscrowDatum);
  if (oldDatum.status !== "Selected" && oldDatum.status !== "Submitted") {
    throw new Error(
      `Dispute requires Selected or Submitted status; this job is ${oldDatum.status}`,
    );
  }
  if (!oldDatum.builder_address) {
    throw new Error("Cannot dispute a job with no builder");
  }

  const evidenceHex = stringToHex(input.evidenceCid);
  const raiserAddress =
    input.raiserSide === "client"
      ? oldDatum.client_address
      : oldDatum.builder_address;
  const raiserCredHash =
    "VerificationKey" in raiserAddress.payment_credential
      ? raiserAddress.payment_credential.VerificationKey[0]
      : raiserAddress.payment_credential.Script[0];

  const newDatum: EscrowDatumT = {
    ...oldDatum,
    dispute_raised_by: raiserAddress,
    dispute_raised_at: nowMs(),
    dispute_evidence_cid: evidenceHex,
    status: "Disputed",
  };

  const disputeFee = BigInt(PROTOCOL_PARAMS.disputeFee * 1_000_000);
  const newLockedLovelace = oldDatum.amount_lovelace + disputeFee;

  const redeemer = Data.to(
    { Dispute: { evidence_cid: evidenceHex } },
    EscrowRedeemer,
  );

  if (!env.globalConfigOutRef) {
    throw new Error("VITE_GLOBAL_CONFIG_OUTREF not set");
  }
  const [gcTxHash, gcIxStr] = env.globalConfigOutRef.split("#");
  const gcUtxos = await lucid.utxosByOutRef([
    { txHash: gcTxHash, outputIndex: parseInt(gcIxStr, 10) },
  ]);

  const tx = await lucid
    .newTx()
    .collectFrom([utxo], redeemer)
    .attach.SpendingValidator(validator)
    .readFrom(gcUtxos)
    .pay.ToAddressWithData(
      utxo.address,
      { kind: "inline", value: Data.to(newDatum, EscrowDatum) },
      { lovelace: newLockedLovelace },
    )
    .addSignerKey(raiserCredHash)
    .complete();

  const signed = await tx.sign.withWallet().complete();
  return signed.submit();
}

// ────────────────────────────────────────────────────────────────────────
// resolve — arbitrator decides a Disputed job
//
// Arbitrator + winning party sign. Distributes funds per direction:
//   releaseToBuilder = true:  builder gets ~95%, treasury gets 5% + dispute fee
//   releaseToBuilder = false: client gets 100%, treasury gets dispute fee
// ────────────────────────────────────────────────────────────────────────

export interface ResolveInput {
  jobId: string;
  releaseToBuilder: boolean;
}

export async function resolve(
  lucid: LucidEvolution,
  input: ResolveInput,
): Promise<string> {
  const validator = getEscrowValidator();
  if (!validator) throw new Error("Escrow validator not configured");

  const utxo = await findEscrowUtxo(lucid, input.jobId);
  if (!utxo.datum) throw new Error("Job UTxO has no inline datum");
  const oldDatum = Data.from<EscrowDatumT>(utxo.datum, EscrowDatum);
  if (oldDatum.status !== "Disputed") {
    throw new Error(
      `Resolve requires Disputed status; this job is ${oldDatum.status}`,
    );
  }
  if (!oldDatum.builder_address) {
    throw new Error("Cannot resolve a job with no builder");
  }

  const arbitratorAddr = addressToBech32(oldDatum.arbitrator_address, env.network);
  const clientAddr = addressToBech32(oldDatum.client_address, env.network);
  const builderAddr = addressToBech32(oldDatum.builder_address, env.network);
  if (!arbitratorAddr || !clientAddr || !builderAddr) {
    throw new Error("Address decode failed");
  }

  const arbitratorCredHash =
    "VerificationKey" in oldDatum.arbitrator_address.payment_credential
      ? oldDatum.arbitrator_address.payment_credential.VerificationKey[0]
      : oldDatum.arbitrator_address.payment_credential.Script[0];

  if (!env.treasuryAddress) {
    throw new Error("VITE_TREASURY_ADDRESS not set");
  }

  const amount = oldDatum.amount_lovelace;
  const cutPercent = BigInt(PROTOCOL_PARAMS.platformCutPercent);
  const rawCut = (amount * cutPercent) / 100n;
  const minUtxo = 1_500_000n;
  const treasuryCut = rawCut < minUtxo ? minUtxo : rawCut;
  const builderPayout = amount - treasuryCut;
  const disputeFee = BigInt(PROTOCOL_PARAMS.disputeFee * 1_000_000);

  const redeemer = Data.to(
    { Resolve: { release_to_builder: input.releaseToBuilder } },
    EscrowRedeemer,
  );

  if (!env.globalConfigOutRef) {
    throw new Error("VITE_GLOBAL_CONFIG_OUTREF not set");
  }
  const [gcTxHash, gcIxStr] = env.globalConfigOutRef.split("#");
  const gcUtxos = await lucid.utxosByOutRef([
    { txHash: gcTxHash, outputIndex: parseInt(gcIxStr, 10) },
  ]);

  let txBuilder = lucid
    .newTx()
    .collectFrom([utxo], redeemer)
    .attach.SpendingValidator(validator)
    .readFrom(gcUtxos)
    .addSignerKey(arbitratorCredHash);

  if (input.releaseToBuilder) {
    const builderCredHash =
      "VerificationKey" in oldDatum.builder_address.payment_credential
        ? oldDatum.builder_address.payment_credential.VerificationKey[0]
        : oldDatum.builder_address.payment_credential.Script[0];
    txBuilder = txBuilder
      .pay.ToAddress(builderAddr, { lovelace: builderPayout })
      .pay.ToAddress(env.treasuryAddress, {
        lovelace: treasuryCut + disputeFee,
      })
      .addSignerKey(builderCredHash);
  } else {
    const clientCredHash =
      "VerificationKey" in oldDatum.client_address.payment_credential
        ? oldDatum.client_address.payment_credential.VerificationKey[0]
        : oldDatum.client_address.payment_credential.Script[0];
    txBuilder = txBuilder
      .pay.ToAddress(clientAddr, { lovelace: amount })
      .pay.ToAddress(env.treasuryAddress, { lovelace: disputeFee })
      .addSignerKey(clientCredHash);
  }

  // Reputation cross-validator: builder's win/loss is recorded.
  // Per the reputation validator's `validate_increment_dispute_outcome`:
  //   `won == release_to_builder` for Resolve
  // So if releaseToBuilder=true, builder won. If false, builder lost.
  const timestamp = nowMs();
  const builderPlutus = oldDatum.builder_address;
  const builderPaymentHex =
    "VerificationKey" in builderPlutus.payment_credential
      ? builderPlutus.payment_credential.VerificationKey[0]
      : builderPlutus.payment_credential.Script[0];
  const existingRep = await findReputationUtxo(lucid, builderPaymentHex);
  const repAddr = reputationAddress();
  const won = input.releaseToBuilder;

  if (existingRep) {
    const repValidator = getReputationValidator();
    if (!repValidator) {
      throw new Error("Reputation validator not configured");
    }
    const repRedeemer = Data.to(
      { IncrementDisputeOutcome: { won, timestamp } },
      ReputationRedeemer,
    );
    const newRepDatum: ReputationDatumT = {
      ...existingRep.datum,
      disputes_won: won
        ? existingRep.datum.disputes_won + 1n
        : existingRep.datum.disputes_won,
      disputes_lost: won
        ? existingRep.datum.disputes_lost
        : existingRep.datum.disputes_lost + 1n,
      last_activity_timestamp: timestamp,
    };
    txBuilder = txBuilder
      .collectFrom([existingRep.utxo], repRedeemer)
      .attach.SpendingValidator(repValidator)
      .pay.ToAddressWithData(
        repAddr,
        { kind: "inline", value: Data.to(newRepDatum, ReputationDatum) },
        { lovelace: existingRep.utxo.assets.lovelace ?? REPUTATION_UTXO_LOVELACE },
      );
  } else {
    const initialRep = initialRepDatumOnDispute(
      builderPlutus,
      won,
      timestamp,
    );
    txBuilder = txBuilder.pay.ToAddressWithData(
      repAddr,
      { kind: "inline", value: Data.to(initialRep, ReputationDatum) },
      { lovelace: REPUTATION_UTXO_LOVELACE },
    );
  }

  const tx = await txBuilder.complete();
  const signed = await tx.sign.withWallet().complete();
  return signed.submit();
}

// ────────────────────────────────────────────────────────────────────────
// amendSubmission — builder replaces submission_cid before client releases
//
// Contract branch: validate_amend_submission. Status stays Submitted;
// submitted_at MUST advance strictly forward (resets client review window);
// submission_cid changes; everything else frozen; builder signs alone.
// ────────────────────────────────────────────────────────────────────────

export interface AmendSubmissionInput {
  jobId: string;
  newSubmissionCid: string;
}

export async function amendSubmission(
  lucid: LucidEvolution,
  input: AmendSubmissionInput,
): Promise<string> {
  const validator = getEscrowValidator();
  if (!validator) throw new Error("Escrow validator not configured");

  const utxo = await findEscrowUtxo(lucid, input.jobId);
  if (!utxo.datum) throw new Error("Job UTxO has no inline datum");
  const oldDatum = Data.from<EscrowDatumT>(utxo.datum, EscrowDatum);
  if (oldDatum.status !== "Submitted") {
    throw new Error(
      `Amend requires Submitted status; this job is ${oldDatum.status}`,
    );
  }
  if (!oldDatum.builder_address) {
    throw new Error("Job has no builder — cannot amend");
  }

  const newCidHex = stringToHex(input.newSubmissionCid);
  // submitted_at must advance strictly forward. Use current time; if the
  // wall clock somehow ended up <= old submitted_at, bump by 1ms to make
  // the validator's strict inequality happy.
  const now = nowMs();
  const oldSubmittedAt = oldDatum.submitted_at ?? 0n;
  const newSubmittedAt = now > oldSubmittedAt ? now : oldSubmittedAt + 1n;

  const newDatum: EscrowDatumT = {
    ...oldDatum,
    submission_cid: newCidHex,
    submitted_at: newSubmittedAt,
  };

  const builderCredHash =
    "VerificationKey" in oldDatum.builder_address.payment_credential
      ? oldDatum.builder_address.payment_credential.VerificationKey[0]
      : oldDatum.builder_address.payment_credential.Script[0];

  const redeemer = Data.to(
    { AmendSubmission: { new_submission_cid: newCidHex } },
    EscrowRedeemer,
  );

  const tx = await lucid
    .newTx()
    .collectFrom([utxo], redeemer)
    .attach.SpendingValidator(validator)
    .pay.ToAddressWithData(
      utxo.address,
      { kind: "inline", value: Data.to(newDatum, EscrowDatum) },
      utxo.assets,
    )
    .addSignerKey(builderCredHash)
    .complete();

  const signed = await tx.sign.withWallet().complete();
  return signed.submit();
}

// ────────────────────────────────────────────────────────────────────────
// updateJob — client edits an Open job (title/description/amount/category)
//
// Contract branch: validate_update. Status stays Open; client signs alone.
// If new_amount > old_amount, client tops up escrow. If new_amount <
// old_amount, delta returns to client. Everything else frozen except
// job_cid + amount + category.
// ────────────────────────────────────────────────────────────────────────

export interface UpdateJobInput {
  jobId: string;
  newJobCid: string;
  newAmountAda: number;
  newCategory: string;
}

export async function updateJob(
  lucid: LucidEvolution,
  input: UpdateJobInput,
): Promise<string> {
  const validator = getEscrowValidator();
  if (!validator) throw new Error("Escrow validator not configured");

  const utxo = await findEscrowUtxo(lucid, input.jobId);
  if (!utxo.datum) throw new Error("Job UTxO has no inline datum");
  const oldDatum = Data.from<EscrowDatumT>(utxo.datum, EscrowDatum);
  if (oldDatum.status !== "Open") {
    throw new Error(
      `Update requires Open status; this job is ${oldDatum.status}`,
    );
  }

  const newCidHex = stringToHex(input.newJobCid);
  const newCategoryHex = stringToHex(input.newCategory);
  const newAmountLovelace = BigInt(Math.floor(input.newAmountAda * 1_000_000));

  const newDatum: EscrowDatumT = {
    ...oldDatum,
    job_cid: newCidHex,
    amount_lovelace: newAmountLovelace,
    category: newCategoryHex,
  };

  const clientCred = paymentCredentialOf(await lucid.wallet().address());

  const redeemer = Data.to(
    {
      Update: {
        new_job_cid: newCidHex,
        new_amount_lovelace: newAmountLovelace,
        new_category: newCategoryHex,
      },
    },
    EscrowRedeemer,
  );

  const tx = await lucid
    .newTx()
    .collectFrom([utxo], redeemer)
    .attach.SpendingValidator(validator)
    .pay.ToAddressWithData(
      utxo.address,
      { kind: "inline", value: Data.to(newDatum, EscrowDatum) },
      { lovelace: newAmountLovelace },
    )
    .addSignerKey(clientCred.hash)
    .complete();

  const signed = await tx.sign.withWallet().complete();
  return signed.submit();
}

// ────────────────────────────────────────────────────────────────────────
// autoRelease — anyone can trigger after auto_release_deadline
//
// Contract branch: validate_auto_release. Status must be Submitted,
// tx validity range entirely after (submitted_at + auto_release_deadline).
// Builder signs alone. Same payout as Release. Reputation increments via
// IncrementOnRelease redeemer (validator accepts both Release and
// AutoRelease as matching escrow events).
// ────────────────────────────────────────────────────────────────────────

export interface AutoReleaseInput {
  jobId: string;
}

export async function autoRelease(
  lucid: LucidEvolution,
  input: AutoReleaseInput,
): Promise<string> {
  const validator = getEscrowValidator();
  if (!validator) throw new Error("Escrow validator not configured");

  const utxo = await findEscrowUtxo(lucid, input.jobId);
  if (!utxo.datum) throw new Error("Job UTxO has no inline datum");
  const oldDatum = Data.from<EscrowDatumT>(utxo.datum, EscrowDatum);
  if (oldDatum.status !== "Submitted") {
    throw new Error(
      `AutoRelease requires Submitted status; this job is ${oldDatum.status}`,
    );
  }
  if (!oldDatum.builder_address) throw new Error("Job has no builder");
  if (oldDatum.submitted_at == null) {
    throw new Error("Job has no submitted_at timestamp");
  }

  const deadlineMs =
    oldDatum.submitted_at + oldDatum.auto_release_deadline * 1000n;
  const now = nowMs();
  if (now <= deadlineMs) {
    const remainingS = Number((deadlineMs - now) / 1000n);
    throw new Error(
      `AutoRelease deadline not reached yet. ${Math.ceil(
        remainingS / 3600,
      )}h remaining.`,
    );
  }

  const amount = oldDatum.amount_lovelace;
  const cutPercent = BigInt(PROTOCOL_PARAMS.platformCutPercent);
  const rawCut = (amount * cutPercent) / 100n;
  const minUtxo = 1_500_000n;
  const treasuryCut = rawCut < minUtxo ? minUtxo : rawCut;
  const builderPayout = amount - treasuryCut;

  if (!env.treasuryAddress) throw new Error("Treasury not configured");
  if (!env.globalConfigOutRef) throw new Error("GlobalConfig not configured");

  const builderPlutus = oldDatum.builder_address;
  const builderAddr = addressToBech32(builderPlutus, env.network);
  if (!builderAddr) throw new Error("Builder address decode failed");
  const builderPaymentHex =
    "VerificationKey" in builderPlutus.payment_credential
      ? builderPlutus.payment_credential.VerificationKey[0]
      : builderPlutus.payment_credential.Script[0];

  const redeemer = Data.to("AutoRelease", EscrowRedeemer);

  const [gcTxHash, gcIxStr] = env.globalConfigOutRef.split("#");
  const gcUtxos = await lucid.utxosByOutRef([
    { txHash: gcTxHash, outputIndex: parseInt(gcIxStr, 10) },
  ]);

  const timestamp = nowMs();
  const existingRep = await findReputationUtxo(lucid, builderPaymentHex);
  const repAddr = reputationAddress();
  const validFrom = Number(deadlineMs) + 30_000;

  let txBuilder = lucid
    .newTx()
    .collectFrom([utxo], redeemer)
    .attach.SpendingValidator(validator)
    .readFrom(gcUtxos)
    .pay.ToAddress(builderAddr, { lovelace: builderPayout })
    .pay.ToAddress(env.treasuryAddress, { lovelace: treasuryCut })
    .addSignerKey(builderPaymentHex)
    .validFrom(validFrom);

  if (existingRep) {
    const repValidator = getReputationValidator();
    if (!repValidator) throw new Error("Reputation validator not configured");
    const repRedeemer = Data.to(
      {
        IncrementOnRelease: {
          volume: amount,
          timestamp,
          job_cid: oldDatum.job_cid,
        },
      },
      ReputationRedeemer,
    );
    const newRepDatum: ReputationDatumT = {
      ...existingRep.datum,
      completed_jobs: existingRep.datum.completed_jobs + 1n,
      total_volume_lovelace:
        existingRep.datum.total_volume_lovelace + amount,
      last_activity_timestamp: timestamp,
      recent_job_cids: prependCapped(
        oldDatum.job_cid,
        existingRep.datum.recent_job_cids,
      ),
    };
    txBuilder = txBuilder
      .collectFrom([existingRep.utxo], repRedeemer)
      .attach.SpendingValidator(repValidator)
      .pay.ToAddressWithData(
        repAddr,
        { kind: "inline", value: Data.to(newRepDatum, ReputationDatum) },
        { lovelace: existingRep.utxo.assets.lovelace ?? REPUTATION_UTXO_LOVELACE },
      );
  } else {
    const initialRep = initialRepDatumOnRelease(
      builderPlutus,
      amount,
      oldDatum.job_cid,
      timestamp,
    );
    txBuilder = txBuilder.pay.ToAddressWithData(
      repAddr,
      { kind: "inline", value: Data.to(initialRep, ReputationDatum) },
      { lovelace: REPUTATION_UTXO_LOVELACE },
    );
  }

  const tx = await txBuilder.complete();
  const signed = await tx.sign.withWallet().complete();
  return signed.submit();
}

// ────────────────────────────────────────────────────────────────────────
// autoRefund — client-only, kicks in if builder never submits
//
// Contract branch: validate_auto_refund. Status must be Selected,
// tx validity range entirely after (selected_at + auto_refund_deadline).
// Client signs alone. Full refund. No treasury cut. No reputation update.
// ────────────────────────────────────────────────────────────────────────

export interface AutoRefundInput {
  jobId: string;
}

export async function autoRefund(
  lucid: LucidEvolution,
  input: AutoRefundInput,
): Promise<string> {
  const validator = getEscrowValidator();
  if (!validator) throw new Error("Escrow validator not configured");

  const utxo = await findEscrowUtxo(lucid, input.jobId);
  if (!utxo.datum) throw new Error("Job UTxO has no inline datum");
  const oldDatum = Data.from<EscrowDatumT>(utxo.datum, EscrowDatum);
  if (oldDatum.status !== "Selected") {
    throw new Error(
      `AutoRefund requires Selected status; this job is ${oldDatum.status}`,
    );
  }
  if (oldDatum.selected_at == null) {
    throw new Error("Job has no selected_at timestamp");
  }

  const deadlineMs =
    oldDatum.selected_at + oldDatum.auto_refund_deadline * 1000n;
  const now = nowMs();
  if (now <= deadlineMs) {
    const remainingS = Number((deadlineMs - now) / 1000n);
    throw new Error(
      `AutoRefund deadline not reached yet. ${Math.ceil(
        remainingS / 3600,
      )}h remaining.`,
    );
  }

  const clientAddr = addressToBech32(oldDatum.client_address, env.network);
  if (!clientAddr) throw new Error("Client address decode failed");
  const clientPaymentHex =
    "VerificationKey" in oldDatum.client_address.payment_credential
      ? oldDatum.client_address.payment_credential.VerificationKey[0]
      : oldDatum.client_address.payment_credential.Script[0];

  const redeemer = Data.to("AutoRefund", EscrowRedeemer);
  const validFrom = Number(deadlineMs) + 30_000;

  const tx = await lucid
    .newTx()
    .collectFrom([utxo], redeemer)
    .attach.SpendingValidator(validator)
    .pay.ToAddress(clientAddr, { lovelace: oldDatum.amount_lovelace })
    .addSignerKey(clientPaymentHex)
    .validFrom(validFrom)
    .complete();

  const signed = await tx.sign.withWallet().complete();
  return signed.submit();
}

// ────────────────────────────────────────────────────────────────────────
// arbitratorTimeout — dispute raiser wins by default if arbitrator silent
//
// Contract branch: validate_arbitrator_timeout. Status must be Disputed,
// tx validity range entirely after (dispute_raised_at + arbitrator_timeout).
// Raiser signs alone. Defaults in raiser's favor. Reputation via
// IncrementDisputeOutcome (won = raiser == builder).
// ────────────────────────────────────────────────────────────────────────

const ARBITRATOR_TIMEOUT_SECONDS = 14n * 24n * 60n * 60n;

export interface ArbitratorTimeoutInput {
  jobId: string;
}

export async function arbitratorTimeout(
  lucid: LucidEvolution,
  input: ArbitratorTimeoutInput,
): Promise<string> {
  const validator = getEscrowValidator();
  if (!validator) throw new Error("Escrow validator not configured");

  const utxo = await findEscrowUtxo(lucid, input.jobId);
  if (!utxo.datum) throw new Error("Job UTxO has no inline datum");
  const oldDatum = Data.from<EscrowDatumT>(utxo.datum, EscrowDatum);
  if (oldDatum.status !== "Disputed") {
    throw new Error(
      `ArbitratorTimeout requires Disputed status; this job is ${oldDatum.status}`,
    );
  }
  if (!oldDatum.builder_address) throw new Error("Job has no builder");
  if (!oldDatum.dispute_raised_by || oldDatum.dispute_raised_at == null) {
    throw new Error("Job is Disputed but missing raiser or raised_at");
  }

  const deadlineMs =
    oldDatum.dispute_raised_at + ARBITRATOR_TIMEOUT_SECONDS * 1000n;
  const now = nowMs();
  if (now <= deadlineMs) {
    const remainingS = Number((deadlineMs - now) / 1000n);
    throw new Error(
      `Arbitrator timeout not reached yet. ${Math.ceil(
        remainingS / 3600,
      )}h remaining.`,
    );
  }

  const raiser = oldDatum.dispute_raised_by;
  const raiserPaymentHex =
    "VerificationKey" in raiser.payment_credential
      ? raiser.payment_credential.VerificationKey[0]
      : raiser.payment_credential.Script[0];
  const builderPlutus = oldDatum.builder_address;
  const builderPaymentHex =
    "VerificationKey" in builderPlutus.payment_credential
      ? builderPlutus.payment_credential.VerificationKey[0]
      : builderPlutus.payment_credential.Script[0];
  const raiserIsBuilder = raiserPaymentHex === builderPaymentHex;

  if (!env.treasuryAddress) throw new Error("Treasury not configured");
  if (!env.globalConfigOutRef) throw new Error("GlobalConfig not configured");

  const clientAddr = addressToBech32(oldDatum.client_address, env.network);
  const builderAddr = addressToBech32(builderPlutus, env.network);
  if (!clientAddr || !builderAddr) throw new Error("Address decode failed");

  const amount = oldDatum.amount_lovelace;
  const disputeFee = BigInt(PROTOCOL_PARAMS.disputeFee * 1_000_000);

  const redeemer = Data.to("ArbitratorTimeout", EscrowRedeemer);
  const validFrom = Number(deadlineMs) + 30_000;

  const [gcTxHash, gcIxStr] = env.globalConfigOutRef.split("#");
  const gcUtxos = await lucid.utxosByOutRef([
    { txHash: gcTxHash, outputIndex: parseInt(gcIxStr, 10) },
  ]);

  let txBuilder = lucid
    .newTx()
    .collectFrom([utxo], redeemer)
    .attach.SpendingValidator(validator)
    .readFrom(gcUtxos)
    .addSignerKey(raiserPaymentHex)
    .validFrom(validFrom);

  if (raiserIsBuilder) {
    const cutPercent = BigInt(PROTOCOL_PARAMS.platformCutPercent);
    const rawCut = (amount * cutPercent) / 100n;
    const minUtxo = 1_500_000n;
    const treasuryCut = rawCut < minUtxo ? minUtxo : rawCut;
    const builderPayout = amount - treasuryCut;
    txBuilder = txBuilder
      .pay.ToAddress(builderAddr, { lovelace: builderPayout })
      .pay.ToAddress(env.treasuryAddress, {
        lovelace: treasuryCut + disputeFee,
      });
  } else {
    txBuilder = txBuilder
      .pay.ToAddress(clientAddr, { lovelace: amount })
      .pay.ToAddress(env.treasuryAddress, { lovelace: disputeFee });
  }

  const timestamp = nowMs();
  const existingRep = await findReputationUtxo(lucid, builderPaymentHex);
  const repAddr = reputationAddress();
  const won = raiserIsBuilder;

  if (existingRep) {
    const repValidator = getReputationValidator();
    if (!repValidator) throw new Error("Reputation validator not configured");
    const repRedeemer = Data.to(
      { IncrementDisputeOutcome: { won, timestamp } },
      ReputationRedeemer,
    );
    const newRepDatum: ReputationDatumT = {
      ...existingRep.datum,
      disputes_won: won
        ? existingRep.datum.disputes_won + 1n
        : existingRep.datum.disputes_won,
      disputes_lost: won
        ? existingRep.datum.disputes_lost
        : existingRep.datum.disputes_lost + 1n,
      last_activity_timestamp: timestamp,
    };
    txBuilder = txBuilder
      .collectFrom([existingRep.utxo], repRedeemer)
      .attach.SpendingValidator(repValidator)
      .pay.ToAddressWithData(
        repAddr,
        { kind: "inline", value: Data.to(newRepDatum, ReputationDatum) },
        { lovelace: existingRep.utxo.assets.lovelace ?? REPUTATION_UTXO_LOVELACE },
      );
  } else {
    const initialRep = initialRepDatumOnDispute(builderPlutus, won, timestamp);
    txBuilder = txBuilder.pay.ToAddressWithData(
      repAddr,
      { kind: "inline", value: Data.to(initialRep, ReputationDatum) },
      { lovelace: REPUTATION_UTXO_LOVELACE },
    );
  }

  const tx = await txBuilder.complete();
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