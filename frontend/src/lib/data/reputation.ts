/**
 * Reputation data access.
 *
 * Source of truth: reputation validator UTxOs. One UTxO per builder.
 *
 * STATUS (Week 5): Empty until contracts deploy.
 */

import { env } from "@/config/env";
import { blockfrost } from "@/lib/cardano/blockfrost";
import { toReputationUtxo } from "@/lib/cardano/decoders";
import { lovelaceToAda } from "@/lib/format";
import type { BuilderReputation } from "@/types/domain";
import type { ReputationUtxo } from "@/types/onchain";

/**
 * Find a builder's reputation UTxO by their address. Returns null if the
 * builder has never been paid for a job (no rep UTxO exists yet).
 */
export async function getBuilderReputation(
  builderAddress: string,
): Promise<BuilderReputation | null> {
  if (!env.contractsDeployed) return null;
  // The reputation script address holds all builders' rep UTxOs. We walk
  // them and find the one whose datum.builderAddress matches.
  const utxos = await blockfrost.utxosAtAddress(env.reputationScriptAddress);
  const reps = utxos
    .map(toReputationUtxo)
    .filter((u): u is ReputationUtxo => u !== null);
  const match = reps.find((r) => r.datum.builderAddress === builderAddress);
  return match ? toBuilderReputation(match) : null;
}

function toBuilderReputation(u: ReputationUtxo): BuilderReputation {
  return {
    builderAddress: u.datum.builderAddress,
    completedJobs: Number(u.datum.completedJobs),
    totalVolume: lovelaceToAda(u.datum.totalVolumeLovelace),
    disputesWon: Number(u.datum.disputesWon),
    disputesLost: Number(u.datum.disputesLost),
    withdrawals: Number(u.datum.withdrawals),
    firstActiveAt: new Date(Number(u.datum.firstJobTimestamp)),
    lastActiveAt: new Date(Number(u.datum.lastActivityTimestamp)),
    recentJobCids: u.datum.recentJobCids,
  };
}
