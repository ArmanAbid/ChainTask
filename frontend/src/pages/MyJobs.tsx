/**
 * MyJobs — jobs the connected wallet is involved in.
 *
 * Two tabs: "As client" and "As builder". Each shows a filterable list of
 * jobs where the wallet is that party. Status filter pill toggles across
 * all lifecycle states (All, Open, Selected, Submitted, Disputed, plus
 * a "Completed" bucket meaning "you're the client of a job whose
 * escrow UTxO has been spent" — but since spent UTxOs don't come back
 * from utxosAt, we detect these by their absence from the current fetch).
 *
 * All data is real:
 *   - useJobs() reads escrow UTxOs from the escrow script address
 *   - Filter to jobs where wallet is client or builder
 *   - Status derives from EscrowDatum.status field
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Ada, Pill } from "@/components/atoms";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/Icons";
import { useJobs, useProfile } from "@/hooks/useQueries";
import { useWallet } from "@/hooks/useWallet";
import { formatRelative, truncateAddress } from "@/lib/format";
import type { Job, JobStatus } from "@/types/domain";

type SideTab = "client" | "builder";
type StatusFilter = "All" | JobStatus;

const STATUS_FILTERS: StatusFilter[] = [
  "All",
  "Open",
  "Selected",
  "Submitted",
  "Disputed",
];

export default function MyJobs() {
  const w = useWallet();
  const { data: allJobs = [], isLoading } = useJobs();
  const [tab, setTab] = useState<SideTab>("client");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

  if (w.status !== "connected") {
    return (
      <div className="max-w-[720px] mx-auto px-8 py-12">
        <EmptyState
          icon={<Icons.wallet className="w-5 h-5" />}
          title="Connect a wallet"
          description="Connect your Cardano wallet to see the jobs you're part of."
        />
      </div>
    );
  }

  const myAddress = w.address;

  const asClient = useMemo(
    () => allJobs.filter((j) => j.clientAddress === myAddress),
    [allJobs, myAddress],
  );
  const asBuilder = useMemo(
    () => allJobs.filter((j) => j.builderAddress === myAddress),
    [allJobs, myAddress],
  );

  const current = tab === "client" ? asClient : asBuilder;
  const filtered = useMemo(
    () =>
      statusFilter === "All"
        ? current
        : current.filter((j) => j.status === statusFilter),
    [current, statusFilter],
  );

  const statusCount = (s: StatusFilter): number =>
    s === "All"
      ? current.length
      : current.filter((j) => j.status === s).length;

  return (
    <div className="max-w-[1180px] mx-auto px-8 py-8 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">
            My jobs
          </h1>
          <div className="text-text-dim text-[13.5px]">
            {isLoading ? (
              "Loading from chain…"
            ) : (
              <>
                {asClient.length} as client · {asBuilder.length} as builder
              </>
            )}
          </div>
        </div>
        <Link to="/app/post" className="btn btn-primary">
          <Icons.plus className="w-3.5 h-3.5" /> Post a job
        </Link>
      </div>

      {/* Tab toggle */}
      <div className="inline-flex items-center gap-0.5 p-0.5 bg-surface border border-border rounded-md mb-4">
        <button
          type="button"
          onClick={() => {
            setTab("client");
            setStatusFilter("All");
          }}
          className={`px-3 py-1.5 rounded-[5px] text-[12.5px] transition-colors ${tab === "client"
              ? "bg-surface-2 text-text"
              : "text-text-dim hover:text-text"
            }`}
        >
          As client{" "}
          <span className="ml-1 text-text-faint">{asClient.length}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("builder");
            setStatusFilter("All");
          }}
          className={`px-3 py-1.5 rounded-[5px] text-[12.5px] transition-colors ${tab === "builder"
              ? "bg-surface-2 text-text"
              : "text-text-dim hover:text-text"
            }`}
        >
          As builder{" "}
          <span className="ml-1 text-text-faint">{asBuilder.length}</span>
        </button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {STATUS_FILTERS.map((s) => {
          const count = statusCount(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1.5 rounded-md text-[12.5px] border transition-colors ${statusFilter === s
                  ? "bg-surface-2 text-text border-border-strong"
                  : "bg-surface text-text-dim border-border hover:text-text"
                }`}
            >
              {s} <span className="text-text-faint ml-0.5">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Listing */}
      <div className="card p-0">
        {isLoading ? (
          <div className="text-center py-16 text-[13px] text-text-faint">
            Reading from chain…
          </div>
        ) : filtered.length === 0 ? (
          <MyJobsEmpty tab={tab} filterActive={statusFilter !== "All"} />
        ) : (
          filtered.map((j) => <MyJobRow key={j.id} job={j} tab={tab} />)
        )}
      </div>
    </div>
  );
}

function MyJobRow({ job, tab }: { job: Job; tab: SideTab }) {
  const navigate = useNavigate();
  const otherAddr =
    tab === "client" ? job.builderAddress : job.clientAddress;
  const { data: otherProfile } = useProfile(otherAddr);
  const otherName = otherProfile?.content?.displayName;

  return (
    <div
      className="flex items-center gap-4 p-5 border-b border-border last:border-b-0 hover:bg-surface cursor-pointer"
      onClick={() => navigate(`/app/jobs/${encodeURIComponent(job.id)}`)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h3 className="text-[14.5px] font-medium m-0 tracking-tight truncate">
            {job.title || "(no title)"}
          </h3>
          <Pill status={job.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-text-faint mt-1">
          {otherAddr ? (
            <>
              <span>
                {tab === "client" ? "Builder" : "Client"}:{" "}
                <span className="text-text-dim">
                  {otherName ?? truncateAddress(otherAddr)}
                </span>
              </span>
              <span>·</span>
            </>
          ) : tab === "client" && job.status === "Open" ? (
            <>
              <span>Awaiting applicants</span>
              <span>·</span>
            </>
          ) : null}
          <span>posted {formatRelative(job.createdAt)}</span>
          {job.deadlineDays != null && (
            <>
              <span>·</span>
              <span>in {job.deadlineDays} days</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0 sm:pl-4 sm:border-l border-border">
        <Ada amount={job.budget} big />
      </div>
    </div>
  );
}

function MyJobsEmpty({
  tab,
  filterActive,
}: {
  tab: SideTab;
  filterActive: boolean;
}) {
  if (filterActive) {
    return (
      <div className="text-center py-16 px-6">
        <div className="text-[14px] text-text mb-1">
          No jobs match this filter
        </div>
        <div className="text-[13px] text-text-dim">
          Try a broader status filter.
        </div>
      </div>
    );
  }
  return (
    <div className="text-center py-16 px-6">
      <div className="text-[14px] text-text mb-1">
        {tab === "client" ? "No jobs posted yet" : "No jobs assigned yet"}
      </div>
      <div className="text-[13px] text-text-dim max-w-[400px] mx-auto">
        {tab === "client" ? (
          <>
            Ready to hire?{" "}
            <Link to="/app/post" className="text-accent hover:underline">
              Post a job
            </Link>{" "}
            and lock the escrow.
          </>
        ) : (
          <>
            Browse the{" "}
            <Link to="/app/marketplace" className="text-accent hover:underline">
              marketplace
            </Link>{" "}
            and apply to open positions.
          </>
        )}
      </div>
    </div>
  );
}