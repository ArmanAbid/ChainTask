/**
 * Lucid Evolution instance — a singleton tied to the connected wallet.
 *
 * Lucid is heavy (CSL deps, WASM init), so we lazy-initialize it on the
 * first tx the user attempts. Subsequent calls return the same instance.
 *
 * When the wallet disconnects we drop the instance so a future
 * reconnection starts fresh (e.g. if the user switches wallets).
 */

import { Blockfrost, Lucid } from "@lucid-evolution/lucid";
import type { LucidEvolution } from "@lucid-evolution/lucid";
import { env } from "@/config/env";

let _lucid: LucidEvolution | null = null;
let _connectedWalletKey: string | null = null;

/**
 * Get a Lucid instance with the given wallet API attached.
 *
 * `walletKey` is the wallet identifier (e.g. "nami", "eternl"). When it
 * changes we rebuild the instance so we don't sign with the wrong key.
 */
export async function getLucid(
  walletApi: import("@lucid-evolution/lucid").WalletApi,
  walletKey: string,
): Promise<LucidEvolution> {
  if (_lucid && _connectedWalletKey === walletKey) return _lucid;

  // Lucid expects "Mainnet" | "Preprod" | "Preview" | "Custom".
  // Our env.network is already a Cardano network name.
  const network = env.network as "Mainnet" | "Preprod" | "Preview";

  const lucid = await Lucid(
    new Blockfrost(env.blockfrostUrl, env.blockfrostProjectId),
    network,
  );
  lucid.selectWallet.fromAPI(walletApi);

  _lucid = lucid;
  _connectedWalletKey = walletKey;
  return lucid;
}

export function clearLucid() {
  _lucid = null;
  _connectedWalletKey = null;
}
