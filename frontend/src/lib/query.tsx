/**
 * TanStack Query setup.
 *
 * One client for the whole app. Default options tuned for our usage:
 *
 *   - `staleTime: 30s` — chain data doesn't change every render. Showing
 *     cached results for 30s before refetching is a good balance.
 *   - `gcTime: 5m` — keep entries in the cache for 5 minutes after their
 *     last subscriber unmounts.
 *   - `retry: 1` — Blockfrost flakes occasionally; one retry catches
 *     transient issues without delaying error UX too long.
 *   - `refetchOnWindowFocus: false` — Blockfrost has rate limits; we
 *     don't want a tab-switch to burn calls.
 *
 * Query keys follow the pattern `[entity, ...args]` for easy invalidation
 * after mutations (e.g. `["jobs"]` to invalidate all job lists).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export function ChainTaskQueryProvider({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
