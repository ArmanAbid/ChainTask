// Lucid Data schemas matching the Aiken contract types.

import { Data } from "@lucid-evolution/lucid";

// Address  (matches Aiken's cardano/address.Address)

const CredentialSchema = Data.Enum([
  // VerificationKey { hash: ByteArray } - Constr 0
  Data.Object({
    VerificationKey: Data.Tuple([Data.Bytes({ minLength: 28, maxLength: 28 })]),
  }),
  // Script { hash: ByteArray } - Constr 1
  Data.Object({
    Script: Data.Tuple([Data.Bytes({ minLength: 28, maxLength: 28 })]),
  }),
]);
export type CredentialT = Data.Static<typeof CredentialSchema>;
export const Credential = CredentialSchema as unknown as CredentialT;

const StakeCredentialSchema = Data.Enum([
  // Inline { credential } - Constr 0
  Data.Object({
    Inline: Data.Tuple([CredentialSchema]),
  }),
  // Pointer { slot, tx_index, cert_index } - Constr 1 (we never construct
  // these; pointer addresses are extremely rare. Included so decoding
  // doesn't break on existing UTxOs that happen to use them.)
  Data.Object({
    Pointer: Data.Object({
      slot_number: Data.Integer(),
      transaction_index: Data.Integer(),
      certificate_index: Data.Integer(),
    }),
  }),
]);
export type StakeCredentialT = Data.Static<typeof StakeCredentialSchema>;

const AddressSchema = Data.Object({
  payment_credential: CredentialSchema,
  stake_credential: Data.Nullable(StakeCredentialSchema),
});
export type AddressT = Data.Static<typeof AddressSchema>;
export const Address = AddressSchema as unknown as AddressT;

// Status enum

const StatusSchema = Data.Enum([
  Data.Literal("Open"),
  Data.Literal("Selected"),
  Data.Literal("Submitted"),
  Data.Literal("Disputed"),
  Data.Literal("Completed"),
  Data.Literal("Cancelled"),
]);
export type StatusT = Data.Static<typeof StatusSchema>;
export const Status = StatusSchema as unknown as StatusT;

// EscrowDatum
//
// Field order MUST match types.ak exactly:
//   client_address, builder_address, arbitrator_address, job_cid,
//   amount_lovelace, category, created_at, selected_at, submitted_at,
//   submission_cid, auto_release_deadline, auto_refund_deadline,
//   dispute_raised_by, dispute_raised_at, dispute_evidence_cid, status.

const EscrowDatumSchema = Data.Object({
  client_address: AddressSchema,
  builder_address: Data.Nullable(AddressSchema),
  arbitrator_address: AddressSchema,
  job_cid: Data.Bytes(),
  amount_lovelace: Data.Integer(),
  category: Data.Bytes({ maxLength: 16 }),
  created_at: Data.Integer(),
  selected_at: Data.Nullable(Data.Integer()),
  submitted_at: Data.Nullable(Data.Integer()),
  submission_cid: Data.Nullable(Data.Bytes({ maxLength: 64 })),
  auto_release_deadline: Data.Integer(),
  auto_refund_deadline: Data.Integer(),
  dispute_raised_by: Data.Nullable(AddressSchema),
  dispute_raised_at: Data.Nullable(Data.Integer()),
  dispute_evidence_cid: Data.Nullable(Data.Bytes({ maxLength: 64 })),
  status: StatusSchema,
});
export type EscrowDatumT = Data.Static<typeof EscrowDatumSchema>;
export const EscrowDatum = EscrowDatumSchema as unknown as EscrowDatumT;

// EscrowRedeemer
// EscrowRedeemer
//
// Variant order MUST match types.ak EXACTLY. Index drift silently breaks
// every later variant's CBOR encoding.
//
//   0. Apply
//   1. Update { new_job_cid, new_amount_lovelace, new_category }
//   2. Select { builder }
//   3. Submit { submission_cid }
//   4. AmendSubmission { new_submission_cid }
//   5. Release
//   6. Refund
//   7. BuilderWithdraw
//   8. Dispute { evidence_cid }
//   9. Resolve { release_to_builder }
//  10. AutoRelease
//  11. AutoRefund
//  12. ArbitratorTimeout

const EscrowRedeemerSchema = Data.Enum([
  Data.Literal("Apply"),
  Data.Object({
    Update: Data.Object({
      new_job_cid: Data.Bytes(),
      new_amount_lovelace: Data.Integer(),
      new_category: Data.Bytes({ maxLength: 16 }),
    }),
  }),
  Data.Object({
    Select: Data.Object({ builder: AddressSchema }),
  }),
  Data.Object({
    Submit: Data.Object({ submission_cid: Data.Bytes({ maxLength: 64 }) }),
  }),
  Data.Object({
    AmendSubmission: Data.Object({
      new_submission_cid: Data.Bytes({ maxLength: 64 }),
    }),
  }),
  Data.Literal("Release"),
  Data.Literal("Refund"),
  Data.Literal("BuilderWithdraw"),
  Data.Object({
    Dispute: Data.Object({ evidence_cid: Data.Bytes({ maxLength: 64 }) }),
  }),
  Data.Object({
    Resolve: Data.Object({ release_to_builder: Data.Boolean() }),
  }),
  Data.Literal("AutoRelease"),
  Data.Literal("AutoRefund"),
  Data.Literal("ArbitratorTimeout"),
  Data.Literal("CancelOpen"),
]);
export type EscrowRedeemerT = Data.Static<typeof EscrowRedeemerSchema>;
export const EscrowRedeemer = EscrowRedeemerSchema as unknown as EscrowRedeemerT;

// ReputationDatum

const ReputationDatumSchema = Data.Object({
  builder_address: AddressSchema,
  completed_jobs: Data.Integer(),
  total_volume_lovelace: Data.Integer(),
  disputes_won: Data.Integer(),
  disputes_lost: Data.Integer(),
  withdrawals: Data.Integer(),
  first_job_timestamp: Data.Integer(),
  last_activity_timestamp: Data.Integer(),
  recent_job_cids: Data.Array(Data.Bytes(), { maxItems: 10 }),
});
export type ReputationDatumT = Data.Static<typeof ReputationDatumSchema>;
export const ReputationDatum = ReputationDatumSchema as unknown as ReputationDatumT;

const ReputationRedeemerSchema = Data.Enum([
  Data.Object({
    IncrementOnRelease: Data.Object({
      volume: Data.Integer(),
      timestamp: Data.Integer(),
      job_cid: Data.Bytes(),
    }),
  }),
  Data.Object({
    IncrementOnWithdraw: Data.Object({ timestamp: Data.Integer() }),
  }),
  Data.Object({
    IncrementDisputeOutcome: Data.Object({
      won: Data.Boolean(),
      timestamp: Data.Integer(),
    }),
  }),
]);
export type ReputationRedeemerT = Data.Static<typeof ReputationRedeemerSchema>;
export const ReputationRedeemer = ReputationRedeemerSchema as unknown as ReputationRedeemerT;

// ProfileDatum / ProfileRedeemer

const ProfileDatumSchema = Data.Object({
  owner_address: AddressSchema,
  profile_cid: Data.Bytes({ minLength: 1, maxLength: 64 }),
});
export type ProfileDatumT = Data.Static<typeof ProfileDatumSchema>;
export const ProfileDatum = ProfileDatumSchema as unknown as ProfileDatumT;

// ProfileRedeemer has one variant (UpdateProfile) in the contract. If we
// wrap a single variant in `Data.Enum`, TypeBox's `Type.Union` collapses
// the array to just the item (see @sinclair/typebox union.mjs), which
// interacts badly with Lucid's Enum shape rewriter and produces a schema
// castTo can't traverse - the encoder crashes with "Could not type cast
// to bytes." Since Aiken's `UpdateProfile { new_profile_cid: ByteArray }`
// compiles to `Constr 0 [ByteArray]`, and `Data.Object` with hasConstr:true
// also produces `Constr 0 [...]`, we can encode as a plain Object and
// call it as `Data.to({ new_profile_cid: hex }, ProfileRedeemer)`. Same
// on-chain shape, no single-variant enum bug.
const ProfileRedeemerSchema = Data.Object({
  new_profile_cid: Data.Bytes({ minLength: 1, maxLength: 64 }),
});
export type ProfileRedeemerT = Data.Static<typeof ProfileRedeemerSchema>;
export const ProfileRedeemer = ProfileRedeemerSchema as unknown as ProfileRedeemerT;

// GlobalConfig (reference UTxO holding protocol params)

const GlobalConfigSchema = Data.Object({
  treasury_address: AddressSchema,
  min_job_amount_lovelace: Data.Integer(),
  platform_cut_percent: Data.Integer(),
  dispute_fee_lovelace: Data.Integer(),
});
export type GlobalConfigT = Data.Static<typeof GlobalConfigSchema>;
export const GlobalConfig = GlobalConfigSchema as unknown as GlobalConfigT;