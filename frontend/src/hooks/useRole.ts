// useRole - the current role "lens" the user is acting as.

import { useMemo, useSyncExternalStore } from "react";
import type { Role } from "@/types/domain";

const KEY = "chaintask:role";
const DEFAULT_ROLE: Role = "client";

function readRole(): Role {
  if (typeof window === "undefined") return DEFAULT_ROLE;
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "client" || v === "builder" || v === "arbitrator") return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_ROLE;
}

let snapshot: Role = readRole();
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setRole(next: Role) {
  if (snapshot === next) return;
  snapshot = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function useRole(): { role: Role; setRole: (r: Role) => void } {
  const role = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
  return useMemo(() => ({ role, setRole }), [role]);
}
