/**
 * Query hooks built on TanStack Query.
 *
 * All chain reads go through these hooks. Components don't call the data
 * layer directly — they `useJobs()`, `useJob(id)`, etc. This gives us:
 *
 *   - Automatic caching (one query for `useJobs()` shared across all
 *     pages that need the job list)
 *   - Automatic deduplication (parallel renders share one in-flight request)
 *   - Loading/error states without manual useState wiring
 *   - Cache invalidation: `queryClient.invalidateQueries({ queryKey: ["jobs"] })`
 *     after a mutation to refetch wherever jobs are displayed
 *
 * Query key conventions:
 *   - `["jobs"]`                      — list of all open jobs
 *   - `["jobs", "client", address]`   — jobs posted by a specific client
 *   - `["jobs", "builder", address]`  — jobs assigned to a specific builder
 *   - `["job", id]`                   — single job by escrow UTxO ref
 *   - `["reputation", address]`       — builder reputation
 *   - `["profile", address]`          — profile UTxO + IPFS content
 *   - `["protocolConfig"]`            — GlobalConfig reference UTxO
 */

import { useQuery } from "@tanstack/react-query";
import {
  getJobById,
  listJobsByBuilder,
  listJobsByClient,
  listOpenJobs,
} from "@/lib/data/jobs";
import { getBuilderReputation } from "@/lib/data/reputation";
import { getProfileByOwner } from "@/lib/data/profile";
import { getProtocolConfig } from "@/lib/data/config";
import { listProposals } from "@/lib/ipfs";

// ────────────────────────────────────────────────────────────────────────
// Jobs
// ────────────────────────────────────────────────────────────────────────

export function useJobs() {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: () => listOpenJobs(),
  });
}

export function useJob(id: string | null | undefined) {
  return useQuery({
    queryKey: ["job", id],
    queryFn: () => (id ? getJobById(id) : null),
    enabled: !!id,
  });
}

export function useClientJobs(clientAddress: string | null | undefined) {
  return useQuery({
    queryKey: ["jobs", "client", clientAddress],
    queryFn: () => (clientAddress ? listJobsByClient(clientAddress) : []),
    enabled: !!clientAddress,
  });
}

export function useBuilderJobs(builderAddress: string | null | undefined) {
  return useQuery({
    queryKey: ["jobs", "builder", builderAddress],
    queryFn: () => (builderAddress ? listJobsByBuilder(builderAddress) : []),
    enabled: !!builderAddress,
  });
}

// ────────────────────────────────────────────────────────────────────────
// Reputation
// ────────────────────────────────────────────────────────────────────────

export function useReputation(builderAddress: string | null | undefined) {
  return useQuery({
    queryKey: ["reputation", builderAddress],
    queryFn: () =>
      builderAddress ? getBuilderReputation(builderAddress) : null,
    enabled: !!builderAddress,
  });
}

// ────────────────────────────────────────────────────────────────────────
// Profile
// ────────────────────────────────────────────────────────────────────────

export function useProfile(ownerAddress: string | null | undefined) {
  return useQuery({
    queryKey: ["profile", ownerAddress],
    queryFn: () => (ownerAddress ? getProfileByOwner(ownerAddress) : null),
    enabled: !!ownerAddress,
  });
}

// ────────────────────────────────────────────────────────────────────────
// Protocol config
// ────────────────────────────────────────────────────────────────────────

export function useProtocolConfig() {
  return useQuery({
    queryKey: ["protocolConfig"],
    queryFn: () => getProtocolConfig(),
    // Config rarely changes; cache for longer.
    staleTime: 5 * 60_000,
  });
}

// ────────────────────────────────────────────────────────────────────────
// Proposals (off-chain, via IPFS metadata listing)
// ────────────────────────────────────────────────────────────────────────

export function useProposals(jobId: string | null | undefined) {
  return useQuery({
    queryKey: ["proposals", jobId],
    queryFn: () => (jobId ? listProposals(jobId) : []),
    enabled: !!jobId,
    // Proposals can change frequently as builders apply; don't cache long.
    staleTime: 15_000,
  });
}
