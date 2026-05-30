/**
 * Datum decoders.
 *
 * These convert Blockfrost UTxOs (with inline_datum as a hex-encoded CBOR
 * string) into our typed OnchainEscrowDatum / OnchainReputationDatum /
 * OnchainGlobalConfig forms.
 *
 * STATUS: Stubs until contracts deploy (Week 7).
 *
 * The real implementation will use Lucid Evolution's Data.from() with a
 * matching schema. We can't write that until we have the generated
 * plutus.json from `aiken build`, which gives us the precise type shape
 * each validator expects.
 *
 * For Week 5, all decoders return null. Consumers handle the empty case
 * cleanly, which means the entire UI works in "no data yet" mode.
 */

import type {
  EscrowUtxo,
  GlobalConfigUtxo,
  OnchainEscrowDatum,
  OnchainGlobalConfig,
  OnchainReputationDatum,
  ReputationUtxo,
} from "@/types/onchain";
import type { BfUtxo } from "./blockfrost";

// ────────────────────────────────────────────────────────────────────────
// Decoders (Week 7 will fill these in)
// ────────────────────────────────────────────────────────────────────────

export function decodeEscrowDatum(_cborHex: string): OnchainEscrowDatum | null {
  // TODO(week-7): Use Lucid's Data.from(cborHex, EscrowDatumSchema).
  return null;
}

export function decodeReputationDatum(
  _cborHex: string,
): OnchainReputationDatum | null {
  // TODO(week-7): Same pattern, ReputationDatumSchema.
  return null;
}

export function decodeGlobalConfig(
  _cborHex: string,
): OnchainGlobalConfig | null {
  // TODO(week-7): GlobalConfigSchema.
  return null;
}

// ────────────────────────────────────────────────────────────────────────
// UTxO transformers
// ────────────────────────────────────────────────────────────────────────

/**
 * Convert a Blockfrost UTxO into a typed escrow UTxO if it has a valid
 * escrow datum. Returns null if the UTxO has no inline datum or the
 * datum doesn't decode as an escrow.
 */
export function toEscrowUtxo(u: BfUtxo): EscrowUtxo | null {
  if (!u.inline_datum) return null;
  const datum = decodeEscrowDatum(u.inline_datum);
  if (!datum) return null;
  return {
    txHash: u.tx_hash,
    outputIndex: u.output_index,
    address: u.address,
    lovelace: lovelaceFromAmounts(u.amount),
    datum,
  };
}

export function toReputationUtxo(u: BfUtxo): ReputationUtxo | null {
  if (!u.inline_datum) return null;
  const datum = decodeReputationDatum(u.inline_datum);
  if (!datum) return null;
  return {
    txHash: u.tx_hash,
    outputIndex: u.output_index,
    address: u.address,
    lovelace: lovelaceFromAmounts(u.amount),
    datum,
  };
}

export function toGlobalConfigUtxo(u: BfUtxo): GlobalConfigUtxo | null {
  if (!u.inline_datum) return null;
  const datum = decodeGlobalConfig(u.inline_datum);
  if (!datum) return null;
  return {
    txHash: u.tx_hash,
    outputIndex: u.output_index,
    address: u.address,
    lovelace: lovelaceFromAmounts(u.amount),
    datum,
  };
}

function lovelaceFromAmounts(amount: { unit: string; quantity: string }[]): bigint {
  const ada = amount.find((a) => a.unit === "lovelace");
  return ada ? BigInt(ada.quantity) : 0n;
}
