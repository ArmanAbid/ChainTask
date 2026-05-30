/**
 * Toasts — lightweight notification system.
 *
 * Module-level pub/sub: components call `pushToast()` directly without
 * needing React context. The visible <Toasts /> component subscribes via
 * useSyncExternalStore. No Redux dependency.
 */

import { useEffect, useSyncExternalStore } from "react";
import { Icons } from "./Icons";

interface Toast {
  id: string;
  text: string;
  variant?: "default" | "success" | "error";
}

// ────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────

let nextId = 1;
let snapshot: Toast[] = [];
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const l of listeners) l();
}

// ────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────

export function pushToast(text: string, variant: Toast["variant"] = "default") {
  const id = `t${nextId++}`;
  snapshot = [...snapshot, { id, text, variant }];
  notify();
}

function popToast(id: string) {
  snapshot = snapshot.filter((t) => t.id !== id);
  notify();
}

// ────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────

export function Toasts() {
  const toasts = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );

  // Auto-dismiss each toast after 4 seconds.
  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => {
      const oldest = toasts[0];
      if (oldest) popToast(oldest.id);
    }, 4000);
    return () => clearTimeout(t);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto card px-4 py-2.5 flex items-center gap-3 shadow-s2 animate-fade-up ${
            t.variant === "success" ? "border-accent-line" :
            t.variant === "error"   ? "border-warn-line" : ""
          }`}
        >
          <span className="text-[13px]">{t.text}</span>
          <button
            onClick={() => popToast(t.id)}
            className="text-text-faint hover:text-text"
            aria-label="Dismiss"
          >
            <Icons.x className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
