/**
 * Protocol config (reference UTxO holding the admin NFT).
 *
 * STATUS (earlier): Empty until contracts deploy.
 */

import { env } from "@/config/env";
import { blockfrost } from "@/lib/cardano/blockfrost";
import { toGlobalConfigUtxo } from "@/lib/cardano/decoders";
import { lovelaceToAda } from "@/lib/format";
import type { ProtocolConfig } from "@/types/domain";

/**
 * Fetch the current GlobalConfig. There is exactly one UTxO holding the
 * admin NFT; we locate it by querying the asset's holders.
 */
export async function getProtocolConfig(): Promise<ProtocolConfig | null> {
  if (!env.contractsDeployed || !env.adminPolicyId || !env.adminAssetName) {
    return null;
  }
  const unit = `${env.adminPolicyId}${env.adminAssetName}`;
  const utxos = await blockfrost.utxosWithAsset(unit);
  for (const u of utxos) {
    const cfg = toGlobalConfigUtxo(u);
    if (cfg) {
      return {
        treasuryAddress: cfg.datum.treasuryAddress,
        minJobAmount: lovelaceToAda(cfg.datum.minJobAmountLovelace),
        platformCutPercent: Number(cfg.datum.platformCutPercent),
        disputeFee: lovelaceToAda(cfg.datum.disputeFeeLovelace),
      };
    }
  }
  return null;
}
