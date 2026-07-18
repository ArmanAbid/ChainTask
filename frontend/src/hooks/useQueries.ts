// Query hooks built on TanStack Query.

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

// Jobs

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

// Reputation

export function useReputation(builderAddress: string | null | undefined) {
  return useQuery({
    queryKey: ["reputation", builderAddress],
    queryFn: () =>
      builderAddress ? getBuilderReputation(builderAddress) : null,
    enabled: !!builderAddress,
  });
}

// Profile

export function useProfile(ownerAddress: string | null | undefined) {
  return useQuery({
    queryKey: ["profile", ownerAddress],
    queryFn: () => (ownerAddress ? getProfileByOwner(ownerAddress) : null),
    enabled: !!ownerAddress,
  });
}

// Protocol config

export function useProtocolConfig() {
  return useQuery({
    queryKey: ["protocolConfig"],
    queryFn: () => getProtocolConfig(),
    // Config rarely changes; cache for longer.
    staleTime: 5 * 60_000,
  });
}

// Proposals (off-chain, via IPFS metadata listing)

export function useProposals(jobId: string | null | undefined) {
  return useQuery({
    queryKey: ["proposals", jobId],
    queryFn: () => (jobId ? listProposals(jobId) : []),
    enabled: !!jobId,
    // Proposals can change frequently as builders apply; don't cache long.
    staleTime: 15_000,
  });
}
