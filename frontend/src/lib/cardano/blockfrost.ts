/**
 * Thin Blockfrost wrapper.
 *
 * Only the endpoints ChainTask actually needs. Returns Lucid-compatible
 * shapes where possible so we can hand results straight to the tx builder
 * in later weeks.
 *
 * Uses `fetch` rather than the `@blockfrost/blockfrost-js` SDK because:
 *   1. Smaller bundle (~50KB savings vs the SDK)
 *   2. The SDK is Node-centric and brings polyfills we don't need
 *   3. We only call ~5 endpoints
 */

import { env } from "@/config/env";

export class BlockfrostError extends Error {
  readonly status: number;
  readonly endpoint: string;
  constructor(endpoint: string, status: number, message: string) {
    super(`Blockfrost ${endpoint} → ${status}: ${message}`);
    this.name = "BlockfrostError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

async function blockfrostGet<T>(path: string): Promise<T> {
  const url = `${env.blockfrostUrl}${path}`;
  const res = await fetch(url, {
    headers: { project_id: env.blockfrostProjectId },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new BlockfrostError(path, res.status, text || res.statusText);
  }
  return res.json() as Promise<T>;
}

// ────────────────────────────────────────────────────────────────────────
// Types matching Blockfrost responses (subset)
// ────────────────────────────────────────────────────────────────────────

export interface BfUtxo {
  tx_hash: string;
  output_index: number;
  address: string;
  amount: { unit: string; quantity: string }[];
  data_hash: string | null;
  inline_datum: string | null;
  reference_script_hash: string | null;
}

export interface BfAddressInfo {
  address: string;
  amount: { unit: string; quantity: string }[];
  stake_address: string | null;
  type: string;
  script: boolean;
}

// ────────────────────────────────────────────────────────────────────────
// API
// ────────────────────────────────────────────────────────────────────────

export const blockfrost = {
  /**
   * All UTxOs currently at the given address. Pages through results.
   * Returns empty array if the address has never been used.
   */
  async utxosAtAddress(address: string): Promise<BfUtxo[]> {
    const all: BfUtxo[] = [];
    let page = 1;
    while (true) {
      const batch = await blockfrostGet<BfUtxo[]>(
        `/addresses/${address}/utxos?page=${page}&count=100&order=asc`,
      ).catch((err) => {
        // 404 means address has never been seen → empty result, not an error.
        if (err instanceof BlockfrostError && err.status === 404) return [];
        throw err;
      });
      all.push(...batch);
      if (batch.length < 100) break;
      page++;
    }
    return all;
  },

  /**
   * Get a specific UTxO by its (tx_hash, output_index). Used to refetch a
   * single escrow after a tx confirms.
   */
  async utxoByRef(txHash: string, outputIndex: number): Promise<BfUtxo | null> {
    const utxos = await blockfrostGet<BfUtxo[]>(
      `/txs/${txHash}/utxos`,
    ).then((tx: any) => tx.outputs as BfUtxo[]).catch((err) => {
      if (err instanceof BlockfrostError && err.status === 404) return [];
      throw err;
    });
    return utxos.find((u) => u.output_index === outputIndex) ?? null;
  },

  /**
   * UTxOs holding a specific native asset. Used to find the GlobalConfig
   * UTxO, which is uniquely identified by holding the admin NFT.
   */
  async utxosWithAsset(unit: string): Promise<BfUtxo[]> {
    return blockfrostGet<BfUtxo[]>(`/assets/${unit}/addresses`)
      .then(async (holders: any[]) => {
        // The asset's holders endpoint returns addresses; we need UTxOs.
        // Walk each holder's UTxOs and filter to ones containing this asset.
        const all: BfUtxo[] = [];
        for (const h of holders) {
          const utxos = await blockfrost.utxosAtAddress(h.address);
          for (const u of utxos) {
            if (u.amount.some((a) => a.unit === unit)) all.push(u);
          }
        }
        return all;
      })
      .catch((err) => {
        if (err instanceof BlockfrostError && err.status === 404) return [];
        throw err;
      });
  },

  /**
   * Basic info on an address (current balance, etc.).
   */
  async addressInfo(address: string): Promise<BfAddressInfo | null> {
    return blockfrostGet<BfAddressInfo>(`/addresses/${address}`).catch(
      (err) => {
        if (err instanceof BlockfrostError && err.status === 404) return null;
        throw err;
      },
    );
  },
};

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

/** Get the lovelace amount from a Blockfrost amount array. */
export function lovelaceFromAmount(
  amount: { unit: string; quantity: string }[],
): bigint {
  const ada = amount.find((a) => a.unit === "lovelace");
  return ada ? BigInt(ada.quantity) : 0n;
}
