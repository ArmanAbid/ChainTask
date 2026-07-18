// Dashboard - landing page after connect.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Ada, Avatar, Pill } from "@/components/atoms";
import { env } from "@/config/env";
import { useWallet } from "@/hooks/useWallet";
import { useRole } from "@/hooks/useRole";
import { listJobsByBuilder, listJobsByClient } from "@/lib/data/jobs";
import { formatAbsolute, formatRemaining } from "@/lib/format";
import type { Job } from "@/types/domain";

export default function Dashboard() {
  const wallet = useWallet();
  const { role } = useRole();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  // Depend on the actual primitive values, not the object wrappers - those
  // are recreated every render and would cause an infinite re-fetch loop.
  const address = wallet.status === "connected" ? wallet.address : null;
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setLoading(true);
    const fetcher = role === "client"
      ? listJobsByClient(address)
      : listJobsByBuilder(address);
    fetcher
      .then(j => { if (!cancelled) setJobs(j); })
      .catch(err => console.error("[Dashboard] load failed:", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [address, role]);

  // KPIs derived from real on-chain data (zero when no jobs).
  const lockedJobs = jobs.filter(j => ["Selected", "Submitted", "Disputed"].includes(j.status));
  const completedJobs = jobs.filter(j => j.status === "Completed");
  const reviewNeeded = jobs.filter(j => j.status === "Submitted").length;
  const totalLocked = lockedJobs.reduce((s, j) => s + j.budget, 0);
  const totalReleased = completedJobs.reduce((s, j) => s + j.budget, 0);

  return (
    <div className="max-w-[1180px] mx-auto px-8 py-8 pb-20">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">
          {role === "client" ? "My jobs" : role === "builder" ? "My work" : "Disputes"}
        </h1>
        <div className="text-text-dim text-[13.5px]">
          {role === "client" ? "Jobs you've posted" :
           role === "builder" ? "Jobs you're working on" :
           "Disputes assigned to you"}
        </div>
      </div>

      {!env.contractsDeployed && <DeploymentBanner />}
      {wallet.status === "connected" && !wallet.isCorrectNetwork && <WrongNetworkBanner />}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Kpi
          label="Locked in escrow"
          val={<Ada amount={totalLocked} />}
          sub={lockedJobs.length === 0 ? "none active" : `${lockedJobs.length} active`}
        />
        <Kpi
          label={role === "client" ? "Released to builders" : "Earned (released)"}
          val={<Ada amount={totalReleased} />}
          sub={completedJobs.length === 0 ? "no history yet" : `${completedJobs.length} completed`}
        />
        <Kpi
          label="Awaiting your review"
          val={reviewNeeded.toString()}
          sub={reviewNeeded > 0 ? "action required" : "all clear"}
          subClass={reviewNeeded > 0 ? "text-warn" : "text-text-faint"}
        />
      </div>

      <div className="card p-0">
        <div className="px-5 py-4 border-b border-border flex items-center">
          <h3 className="m-0 text-[14px]">Active &amp; recent</h3>
          <span className="flex-1" />
          <span className="text-[12px] text-text-faint">{jobs.length} jobs</span>
        </div>

        {loading && (
          <div className="text-center py-16 text-text-faint text-[13px]">Loading…</div>
        )}

        {!loading && jobs.length === 0 && (
          <EmptyJobList role={role} />
        )}

        {!loading && jobs.map(j => (
          <JobRow key={j.id} job={j} role={role} />
        ))}
      </div>
    </div>
  );
}


function JobRow({ job, role }: { job: Job; role: string }) {
  const counterpartyAddr = role === "client" ? job.builderAddress : job.clientAddress;
  const counterpartyLabel = counterpartyAddr
    ? `${counterpartyAddr.slice(0, 8)}…${counterpartyAddr.slice(-4)}`
    : "—";

  const subText =
    job.status === "Completed" ? "released" :
    job.status === "Submitted" ? "awaiting review" :
    job.status === "Disputed"  ? "in dispute" :
    job.status === "Cancelled" ? "cancelled" :
    "in progress";

  const subColor =
    job.status === "Completed" ? "text-success" :
    job.status === "Submitted" ? "text-warn" :
    job.status === "Disputed"  ? "text-danger" :
    "text-text-faint";

  // Show countdown when relevant (auto-release / auto-refund).
  const countdownDate = job.status === "Submitted" ? job.autoReleaseAt
                      : job.status === "Selected"  ? job.autoRefundAt
                      : null;
  const countdownLabel = job.status === "Submitted" ? "auto-release in"
                       : job.status === "Selected"  ? "auto-refund in"
                       : null;

  return (
    <Link
      to={`/app/jobs/${encodeURIComponent(job.id)}`}
      className="flex gap-4 p-5 w-full text-left border-b border-border last:border-b-0 hover:bg-surface transition-colors"
    >
      <Avatar name={counterpartyLabel} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
          <h3 className="text-[14.5px] font-medium m-0 truncate">{job.title || "Untitled job"}</h3>
          <Pill status={job.status} />
          {countdownDate && countdownLabel && (
            <span className="font-mono text-[11px] text-text-faint">
              {countdownLabel} {formatRemaining(countdownDate)}
            </span>
          )}
        </div>
        <div className="flex gap-3.5 text-[12.5px] text-text-faint flex-wrap">
          <span className="text-text-dim font-mono">{counterpartyLabel}</span>
          <span>·</span>
          <span>posted {formatAbsolute(job.createdAt)}</span>
          {job.category && (<><span>·</span><span>{job.category}</span></>)}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 pl-4 border-l border-border flex-shrink-0">
        <Ada amount={job.budget} big />
        <span className={`text-[11px] ${subColor}`}>{subText}</span>
      </div>
    </Link>
  );
}

function EmptyJobList({ role }: { role: string }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="text-[14px] text-text mb-1">
        {role === "client" ? "No jobs posted yet" :
         role === "builder" ? "No active work" :
         "No disputes assigned"}
      </div>
      <div className="text-[13px] text-text-dim max-w-[460px] mx-auto">
        {env.contractsDeployed ? (
          role === "client"
            ? <>Get started by <Link to="/app/post" className="text-accent hover:underline">posting your first job</Link>.</>
            : role === "builder"
              ? <>Find work in the <Link to="/app/marketplace" className="text-accent hover:underline">marketplace</Link>.</>
              : <>You'll see disputes here once they're assigned to your wallet.</>
        ) : (
          <>The on-chain protocol deploys on Cardano {env.network} in earlier of the launch. Posting jobs and applying as a builder will work as soon as the smart contracts are live.</>
        )}
      </div>
    </div>
  );
}

function DeploymentBanner() {
  return (
    <div className="mb-6 card p-4 border-accent-line">
      <div className="text-[13px] font-medium text-accent mb-1">Hackathon build — contracts deploying soon</div>
      <div className="text-[12.5px] text-text-dim">
        Smart contracts ({" "}
        <a href="https://github.com/ArmanAbid/ChainTask" target="_blank" rel="noopener noreferrer" className="text-text hover:underline">78 unit tests passing</a>
        ) deploy to Cardano {env.network} in earlier. Until then, lists are empty. Your wallet shown here is live.
      </div>
    </div>
  );
}

function WrongNetworkBanner() {
  return (
    <div className="mb-6 card p-4 border-warn-line">
      <div className="text-[13px] font-medium text-warn mb-1">Wrong network</div>
      <div className="text-[12.5px] text-text-dim">
        Your wallet is on a different network than this app expects ({env.network}). Switch your wallet to {env.network} in its settings to continue.
      </div>
    </div>
  );
}

function Kpi({ label, val, sub, subClass }: { label: string; val: React.ReactNode; sub?: string; subClass?: string }) {
  return (
    <div className="p-3.5 border border-border rounded-md bg-surface">
      <div className="text-[11.5px] uppercase tracking-wider text-text-faint">{label}</div>
      <div className="text-[22px] font-semibold tracking-tight mt-1">{val}</div>
      {sub && <div className={`text-[11.5px] font-mono ${subClass || "text-text-faint"} mt-0.5`}>{sub}</div>}
    </div>
  );
}
