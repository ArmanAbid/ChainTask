// DisputeQueue - arbitrator view of Disputed jobs.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ada, Pill } from "@/components/atoms";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/Icons";
import { useJobs, useProfile } from "@/hooks/useQueries";
import { useWallet } from "@/hooks/useWallet";
import { formatRelative, truncateAddress } from "@/lib/format";
import type { Job } from "@/types/domain";

type Scope = "mine" | "all";

const ARBITRATOR_TIMEOUT_MS = 14 * 24 * 60 * 60 * 1000;

function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return "expired";
  const secs = Math.floor(msRemaining / 1000);
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function DisputeQueue() {
  const w = useWallet();
  const { data: allJobs = [], isLoading } = useJobs();
  const [scope, setScope] = useState<Scope>("mine");

  // All hooks must run on every render. Derive `myAddress` here and run
  // the memoized filters BEFORE any early-return branch so hook count
  // is stable across connect/disconnect transitions. When disconnected,
  // `myAddress` is undefined and `assignedToMe` returns [] - cheap and
  // harmless.
  const myAddress = w.status === "connected" ? w.address : undefined;

  const disputed = useMemo(
    () => allJobs.filter((j) => j.status === "Disputed"),
    [allJobs],
  );

  const assignedToMe = useMemo(
    () =>
      myAddress
        ? disputed.filter((j) => j.arbitratorAddress === myAddress)
        : [],
    [disputed, myAddress],
  );

  if (w.status !== "connected") {
    return (
      <div className="max-w-[720px] mx-auto px-8 py-12">
        <EmptyState
          icon={<Icons.wallet className="w-5 h-5" />}
          title="Connect a wallet"
          description="Arbitrators sign in with the wallet that clients named on their jobs."
        />
      </div>
    );
  }

  const shown = scope === "mine" ? assignedToMe : disputed;

  return (
    <div className="max-w-[1180px] mx-auto px-8 py-8 pb-20">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">
            Dispute queue
          </h1>
          <div className="text-text-dim text-[13.5px]">
            {isLoading ? (
              "Loading from chain…"
            ) : scope === "mine" ? (
              <>
                {assignedToMe.length} assigned to you
                {disputed.length !== assignedToMe.length && (
                  <span className="text-text-faint">
                    {" "}
                    · {disputed.length - assignedToMe.length} more on the platform
                  </span>
                )}
              </>
            ) : (
              <>{disputed.length} total on the platform</>
            )}
          </div>
        </div>
      </div>

      {/* Scope toggle */}
      <div className="inline-flex items-center gap-0.5 p-0.5 bg-surface border border-border rounded-md mb-4">
        <button
          type="button"
          onClick={() => setScope("mine")}
          className={`px-3 py-1.5 rounded-[5px] text-[12.5px] transition-colors ${scope === "mine"
            ? "bg-surface-2 text-text"
            : "text-text-dim hover:text-text"
            }`}
        >
          Assigned to me{" "}
          <span className="ml-1 text-text-faint">{assignedToMe.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setScope("all")}
          className={`px-3 py-1.5 rounded-[5px] text-[12.5px] transition-colors ${scope === "all"
            ? "bg-surface-2 text-text"
            : "text-text-dim hover:text-text"
            }`}
        >
          All disputes{" "}
          <span className="ml-1 text-text-faint">{disputed.length}</span>
        </button>
      </div>

      {/* Listing */}
      <div className="card p-0">
        {isLoading ? (
          <div className="text-center py-16 text-[13px] text-text-faint">
            Reading disputes from chain…
          </div>
        ) : shown.length === 0 ? (
          <QueueEmpty scope={scope} />
        ) : (
          shown
            .sort(
              (a, b) =>
                (a.disputeRaisedAt?.getTime() ?? 0) -
                (b.disputeRaisedAt?.getTime() ?? 0),
            )
            .map((j) => (
              <DisputeRow key={j.id} job={j} myAddress={w.address} />
            ))
        )}
      </div>
    </div>
  );
}

function DisputeRow({
  job,
  myAddress,
}: {
  job: Job;
  myAddress: string;
}) {
  const navigate = useNavigate();
  const raiserIsClient = job.disputeRaisedBy === job.clientAddress;
  const raiserAddress = job.disputeRaisedBy;
  const { data: raiserProfile } = useProfile(raiserAddress ?? "");
  const { data: clientProfile } = useProfile(job.clientAddress ?? "");
  const { data: builderProfile } = useProfile(job.builderAddress ?? "");

  const timeoutDeadline =
    (job.disputeRaisedAt?.getTime() ?? 0) + ARBITRATOR_TIMEOUT_MS;
  const now = Date.now();
  const remaining = timeoutDeadline - now;
  const overdue = remaining <= 0;

  const iAmArbitrator = job.arbitratorAddress === myAddress;

  return (
    <div
      className="p-5 border-b border-border last:border-b-0 hover:bg-surface cursor-pointer"
      onClick={() => navigate(`/app/jobs/${encodeURIComponent(job.id)}`)}
    >
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h3 className="text-[14.5px] font-medium m-0 tracking-tight truncate">
              {job.title || "(no title)"}
            </h3>
            <Pill status={job.status} />
            {iAmArbitrator && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] bg-accent-soft border border-accent-line text-accent text-[10.5px] font-medium">
                assigned to you
              </span>
            )}
            {overdue && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] bg-danger-soft border border-[oklch(0.72_0.17_25/0.4)] text-danger text-[10.5px] font-medium">
                timeout eligible
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-faint">
            <span>
              Client:{" "}
              <span className="text-text-dim">
                {clientProfile?.content?.displayName ??
                  (job.clientAddress ? truncateAddress(job.clientAddress) : "—")}
              </span>
            </span>
            <span>·</span>
            <span>
              Builder:{" "}
              <span className="text-text-dim">
                {builderProfile?.content?.displayName ??
                  (job.builderAddress
                    ? truncateAddress(job.builderAddress)
                    : "—")}
              </span>
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-dim">
            <span>
              Raised by{" "}
              <span className="text-text">
                {raiserIsClient ? "client" : "builder"}
              </span>
              {raiserProfile?.content?.displayName && (
                <>
                  {" "}
                  <span className="text-text-faint">
                    ({raiserProfile.content.displayName})
                  </span>
                </>
              )}
            </span>
            <span className="text-text-faint">·</span>
            <span>{formatRelative(job.disputeRaisedAt ?? new Date())}</span>
            {job.disputeEvidenceCid && (
              <>
                <span className="text-text-faint">·</span>
                <a
                  href={`https://ipfs.io/ipfs/${job.disputeEvidenceCid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  view evidence
                </a>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 pl-4 border-l border-border">
          <Ada amount={job.budget} big />
          <div
            className={`text-[11px] font-mono ${overdue ? "text-danger" : "text-text-faint"
              }`}
          >
            {overdue
              ? "overdue"
              : `timeout in ${formatCountdown(remaining)}`}
          </div>
        </div>
      </div>
    </div>
  );
}

function QueueEmpty({ scope }: { scope: Scope }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="text-[14px] text-text mb-1">
        {scope === "mine"
          ? "No disputes assigned to you"
          : "No active disputes on the platform"}
      </div>
      <div className="text-[13px] text-text-dim max-w-[440px] mx-auto">
        {scope === "mine" ? (
          <>
            You're only the arbitrator on a job if a client named your address
            when they posted it. When they do and something goes wrong, the
            dispute lands here.
          </>
        ) : (
          <>Clean queue. Everyone's cooperating.</>
        )}
      </div>
    </div>
  );
}