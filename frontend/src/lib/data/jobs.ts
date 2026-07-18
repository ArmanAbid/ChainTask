// Jobs data access.

import { env } from "@/config/env";
import { blockfrost } from "@/lib/cardano/blockfrost";
import { toEscrowUtxo } from "@/lib/cardano/decoders";
import { fetchJson } from "@/lib/ipfs";
import { lovelaceToAda } from "@/lib/format";
import type { EscrowUtxo } from "@/types/onchain";
import type { Job, JobStatus } from "@/types/domain";
import type { JobDescription } from "@/lib/ipfs";

// Reads

/** All currently-open jobs (any status that has an active escrow UTxO). */
export async function listOpenJobs(): Promise<Job[]> {
  if (!env.contractsDeployed) return [];
  const utxos = await blockfrost.utxosAtAddress(env.escrowScriptAddress);
  const escrows = utxos.map(toEscrowUtxo).filter((u): u is EscrowUtxo => u !== null);
  return Promise.all(escrows.map(toJob));
}

/** Jobs where the connected wallet is the client. */
export async function listJobsByClient(clientAddress: string): Promise<Job[]> {
  const all = await listOpenJobs();
  return all.filter((j) => j.clientAddress === clientAddress);
}

/** Jobs where the connected wallet is the builder. */
export async function listJobsByBuilder(
  builderAddress: string,
): Promise<Job[]> {
  const all = await listOpenJobs();
  return all.filter((j) => j.builderAddress === builderAddress);
}

/** Fetch a single job by its escrow UTxO id (`${txHash}#${outputIndex}`). */
export async function getJobById(id: string): Promise<Job | null> {
  if (!env.contractsDeployed) return null;
  const [txHash, idxStr] = id.split("#");
  if (!txHash || !idxStr) return null;
  const bfUtxo = await blockfrost.utxoByRef(txHash, Number(idxStr));
  if (!bfUtxo) return null;
  const escrow = toEscrowUtxo(bfUtxo);
  if (!escrow) return null;
  return toJob(escrow);
}

// Transform: EscrowUtxo + IPFS content → Job

async function toJob(escrow: EscrowUtxo): Promise<Job> {
  const desc = await fetchJson<JobDescription>(escrow.datum.jobCid).catch<
    JobDescription
  >(() => ({
    title: "Untitled",
    description: "",
    category: escrow.datum.category,
    skills: [],
  }));

  const status = escrow.datum.status as JobStatus;
  const autoReleaseAt = escrow.datum.submittedAt
    ? new Date(
        Number(
          escrow.datum.submittedAt +
            escrow.datum.autoReleaseDeadlineSeconds * 1000n,
        ),
      )
    : null;
  const autoRefundAt = escrow.datum.selectedAt
    ? new Date(
        Number(
          escrow.datum.selectedAt +
            escrow.datum.autoRefundDeadlineSeconds * 1000n,
        ),
      )
    : null;
  // Arbitrator timeout is a constant 14 days (= 1_209_600 seconds) after
  // dispute_raised_at. Mirrors arbitrator_timeout_seconds in types.ak.
  const arbitratorTimeoutAt = escrow.datum.disputeRaisedAt
    ? new Date(Number(escrow.datum.disputeRaisedAt + 1_209_600_000n))
    : null;

  return {
    id: `${escrow.txHash}#${escrow.outputIndex}`,
    title: desc.title,
    description: desc.description,
    category: desc.category || escrow.datum.category,
    skills: desc.skills,
    deadlineDays: desc.deadlineDays,
    budget: lovelaceToAda(escrow.datum.amountLovelace),
    clientAddress: escrow.datum.clientAddress,
    builderAddress: escrow.datum.builderAddress,
    arbitratorAddress: escrow.datum.arbitratorAddress,
    jobCid: escrow.datum.jobCid,
    createdAt: new Date(Number(escrow.datum.createdAt)),
    selectedAt: escrow.datum.selectedAt
      ? new Date(Number(escrow.datum.selectedAt))
      : null,
    submittedAt: escrow.datum.submittedAt
      ? new Date(Number(escrow.datum.submittedAt))
      : null,
    submissionCid: escrow.datum.submissionCid,
    autoReleaseAt,
    autoRefundAt,
    disputeRaisedBy: escrow.datum.disputeRaisedBy,
    disputeRaisedAt: escrow.datum.disputeRaisedAt
      ? new Date(Number(escrow.datum.disputeRaisedAt))
      : null,
    arbitratorTimeoutAt,
    disputeEvidenceCid: escrow.datum.disputeEvidenceCid,
    status,
  };
}
