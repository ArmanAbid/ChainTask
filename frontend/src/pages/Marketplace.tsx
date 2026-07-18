// Marketplace - Open jobs, click a row to open detail.

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { env } from "@/config/env";
import { Ada, Avatar, Pill } from "@/components/atoms";
import { Icons } from "@/components/Icons";
import { useJobs } from "@/hooks/useQueries";
import { useProfile } from "@/hooks/useQueries";
import { useRole } from "@/hooks/useRole";
import { formatRelative, truncateAddress } from "@/lib/format";
import type { Job } from "@/types/domain";

const FIXED_CATS = ["All"];

export default function Marketplace() {
  const { data: jobs = [], isLoading } = useJobs();
  const { role } = useRole();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");

  // Build category list from what's on-chain (case-insensitive de-dupe).
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const j of jobs) {
      const c = j.category?.trim();
      if (!c) continue;
      const k = c.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c[0].toUpperCase() + c.slice(1));
    }
    return [...FIXED_CATS, ...out.sort()];
  }, [jobs]);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      // Marketplace is a browsing surface: only Open jobs are actionable
      // for prospective builders. Selected/Submitted/Disputed jobs live
      // in the participants' own dashboards (My jobs / Dispute queue).
      if (j.status !== "Open") return false;
      if (cat !== "All" && j.category.toLowerCase() !== cat.toLowerCase()) {
        return false;
      }
      if (q) {
        const needle = q.toLowerCase();
        const hay = [j.title, j.description, j.skills.join(" "), j.category]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [jobs, q, cat]);

  return (
    <div className="max-w-[1180px] mx-auto px-6 md:px-8 py-8 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">
            Marketplace
          </h1>
          <div className="text-text-dim text-[13.5px]">
            {isLoading ? (
              <>Loading from chain…</>
            ) : (
              <>
                {filtered.length} open job{filtered.length === 1 ? "" : "s"}{" "}
                · escrow funded on Cardano {env.network}
              </>
            )}
          </div>
        </div>
        {role === "client" && (
          <Link to="/app/post" className="btn btn-primary">
            <Icons.plus className="w-3.5 h-3.5" /> Post a job
          </Link>
        )}
      </div>

      {/* Search + category pills */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mb-4">
        <div className="flex-1 relative">
          <Icons.search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
          <input
            className="input pl-9"
            placeholder="Search jobs, skills, descriptions…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={`px-2.5 py-1.5 rounded-md text-[12.5px] border transition-colors ${
                  cat === c
                    ? "bg-surface-2 text-text border-border-strong"
                    : "bg-surface text-text-dim border-border hover:text-text"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Listing */}
      <div className="card p-0">
        {!env.contractsDeployed ? (
          <EmptyContent
            title="Contracts not yet deployed"
            body="The marketplace will populate once the validators are on testnet and jobs start being posted."
          />
        ) : isLoading ? (
          <EmptyContent title="Reading from chain…" body="Fetching Open jobs from the escrow script address." />
        ) : filtered.length === 0 ? (
          jobs.length === 0 ? (
            <EmptyContent
              title="No jobs yet"
              body={
                role === "client" ? (
                  <>
                    Post the first one from{" "}
                    <Link to="/app/post" className="text-accent hover:underline">
                      here
                    </Link>
                    .
                  </>
                ) : (
                  <>Be the first builder when one drops.</>
                )
              }
            />
          ) : (
            <EmptyContent
              title="No jobs match your filters"
              body="Try a broader search or clear the category."
            />
          )
        ) : (
          filtered.map((j) => (
            <JobRow
              key={j.id}
              job={j}
              onOpen={() => navigate(`/app/jobs/${encodeURIComponent(j.id)}`)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Subcomponents

function JobRow({ job, onOpen }: { job: Job; onOpen: () => void }) {
  const { data: profile } = useProfile(job.clientAddress);
  const navigate = useNavigate();
  const clientName =
    profile?.content?.displayName ?? truncateAddress(job.clientAddress);
  const initial = (clientName[0] || "?").toUpperCase();

  return (
    <div
      className="flex flex-col sm:flex-row gap-4 p-5 border-b border-border last:border-b-0 hover:bg-surface transition-colors cursor-pointer"
      onClick={onOpen}
    >
      {/* Avatar (own click stops bubbling so it goes to the profile not the job) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/app/profiles/${encodeURIComponent(job.clientAddress)}`);
        }}
        className="bg-transparent border-0 p-0 self-start"
        aria-label={`View ${clientName}'s profile`}
      >
        {profile?.content?.avatarCid ? (
          <Avatar name={initial} src={profile.content.avatarCid} />
        ) : (
          <Avatar name={initial} />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-1 flex-wrap">
          <h3 className="text-[14.5px] font-medium m-0 tracking-tight truncate">
            {job.title || "(no title)"}
          </h3>
          <Pill status={statusFor(job)}>{job.status}</Pill>
        </div>
        {job.description && (
          <p className="text-text-dim text-[13px] line-clamp-2 my-1">
            {job.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-text-faint mt-2">
          <button
            type="button"
            className="link-name"
            onClick={(e) => {
              e.stopPropagation();
              navigate(
                `/app/profiles/${encodeURIComponent(job.clientAddress)}`,
              );
            }}
          >
            {clientName}
          </button>
          <span>·</span>
          <span>posted {formatRelative(job.createdAt)}</span>
          {job.deadlineDays != null && (
            <>
              <span>·</span>
              <span>in {job.deadlineDays} days</span>
            </>
          )}
          {job.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 ml-1">
              {job.skills.slice(0, 3).map((s) => (
                <span key={s} className="tag">
                  {s}
                </span>
              ))}
              {job.skills.length > 3 && (
                <span className="tag text-text-faint">+{job.skills.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex sm:flex-col sm:items-end gap-0.5 sm:pl-4 sm:border-l border-border flex-shrink-0">
        <Ada amount={job.budget} big />
      </div>
    </div>
  );
}

function EmptyContent({
  title,
  body,
}: {
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="text-center py-16 px-6">
      <div className="text-[14px] text-text mb-1">{title}</div>
      <div className="text-[13px] text-text-dim">{body}</div>
    </div>
  );
}

function statusFor(j: Job): "open" | "selected" | "submitted" | "completed" | "disputed" | "cancelled" {
  // Job.status from our domain type uses on-chain enum names. The Pill
  // atom expects lowercase. Map both ways for safety.
  const s = String(j.status).toLowerCase();
  if (s === "open" || s === "selected" || s === "submitted" || s === "completed" || s === "disputed" || s === "cancelled") {
    return s as ReturnType<typeof statusFor>;
  }
  return "open";
}
