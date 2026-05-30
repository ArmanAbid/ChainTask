/**
 * Small reusable display components used across screens.
 *
 * No data dependencies. Each component takes its props and renders.
 * USD conversion was removed — would need a live price feed, which we
 * skip for the hackathon. Add later if desired.
 */

import type { JobStatus, BuilderReputation } from "@/types/domain";

const STATUS_LABEL: Record<JobStatus, string> = {
  Open: "Open",
  Selected: "Selected",
  Submitted: "Submitted",
  Disputed: "Disputed",
  Completed: "Completed",
  Cancelled: "Cancelled",
};

export function Pill({ status, children }: { status?: JobStatus | string; children?: React.ReactNode }) {
  const cls =
    status === "Open" || status === "Cancelled" ? "pill-open" :
    status === "Selected"  ? "pill-selected" :
    status === "Submitted" ? "pill-submitted" :
    status === "Completed" ? "pill-completed" :
    status === "Disputed"  ? "pill-disputed" :
    "";
  return (
    <span className={`pill ${cls}`}>
      <span className="dot" />
      {children || (status && STATUS_LABEL[status as JobStatus]) || status}
    </span>
  );
}

export function Ada({ amount, big = false }: { amount: number; big?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 font-mono tabular-nums">
      <span className={`ada ${big ? "text-lg font-semibold" : ""}`}>
        {amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </span>
    </span>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" | "xl" }) {
  // Pick a stable single-char display for the avatar.
  const ch = name.trim().charAt(0).toUpperCase() || "?";
  const dim = size === "xl" ? "w-[72px] h-[72px] text-[22px]"
            : size === "lg" ? "w-12 h-12 text-base"
            : size === "sm" ? "w-7 h-7 text-[11px]"
            : "w-8 h-8 text-[12px]";
  return (
    <div className={`${dim} rounded-full inline-flex items-center justify-center font-semibold text-text bg-gradient-to-br from-surface-3 to-surface-2 border border-border flex-shrink-0`}>
      {ch}
    </div>
  );
}

/** Render reputation in either a compact pill or a full row. */
export function RepStats({ rep, compact = false }: { rep?: BuilderReputation | null; compact?: boolean }) {
  if (!rep) return null;
  const dispTotal = rep.disputesWon + rep.disputesLost;
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] text-text-faint font-mono flex-wrap">
        <span>{rep.completedJobs} jobs</span>
        <span className="opacity-50">·</span>
        <span className={dispTotal ? "text-warn" : ""}>{dispTotal} disp</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2.5 text-[12px] text-text-dim flex-wrap">
      <span><span className="text-text font-mono">{rep.completedJobs}</span> jobs</span>
      <span className="text-text-faint">·</span>
      <span><span className="text-text font-mono">{rep.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> ₳ volume</span>
      <span className="text-text-faint">·</span>
      <span className={dispTotal ? "text-warn" : "text-text-dim"}>
        <span className="font-mono">{rep.disputesWon}/{rep.disputesLost}</span> disputes
      </span>
    </span>
  );
}

export function Cid({ cid }: { cid: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-text-faint px-2 py-0.5 rounded-md bg-bg-2 border border-dashed border-border hover:text-text-dim hover:border-border-strong transition-colors">
      <span>ipfs ·</span>
      <span className="text-accent">{cid.slice(0, 8)}…{cid.slice(-4)}</span>
    </span>
  );
}

export function Countdown({ at, label }: { at?: Date | number | null; label: string }) {
  if (!at) return null;
  const target = at instanceof Date ? at.getTime() : at;
  const ms = target - Date.now();
  const days = Math.max(0, Math.floor(ms / (86400 * 1000)));
  const hours = Math.max(0, Math.floor((ms % (86400 * 1000)) / (3600 * 1000)));
  const cls = days <= 2
    ? "bg-danger-soft border-[oklch(0.72_0.17_25/0.35)] text-danger"
    : days <= 7
      ? "bg-warn-soft border-[oklch(0.85_0.13_78/0.3)] text-warn"
      : "bg-surface-2 border-border text-text-dim";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md border font-mono ${cls}`}>
      {label}: {days}d {hours}h
    </span>
  );
}

export function TxHash({ hash }: { hash: string }) {
  const short = hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
  return <span className="font-mono text-[11.5px] text-text-faint hover:text-text-dim">tx · {short}</span>;
}
