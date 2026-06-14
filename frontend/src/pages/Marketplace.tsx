/**
 * Marketplace — browse open jobs.
 *
 * Filterable by category, sortable by recency / budget. Shows a card per
 * job with the client's resolved name + address.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { env } from "@/config/env";
import { EmptyState } from "@/components/EmptyState";
import { Ada, Identity, Pill } from "@/components/atoms";
import { Icons } from "@/components/Icons";
import { useJobs } from "@/hooks/useQueries";
import { useProfile } from "@/hooks/useQueries";
import { formatRelative } from "@/lib/format";
import type { Job } from "@/types/domain";

type SortKey = "newest" | "budget-desc" | "budget-asc";

export default function Marketplace() {
  const { data: jobs = [], isLoading } = useJobs();
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("newest");

  // Build the category list from what's actually on-chain (no fixed taxonomy).
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) if (j.category) set.add(j.category);
    return Array.from(set).sort();
  }, [jobs]);

  const filtered = useMemo(() => {
    let out = jobs.filter((j) => j.status === "Open");
    if (category) out = out.filter((j) => j.category === category);
    if (sort === "newest")
      out = [...out].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (sort === "budget-desc") out = [...out].sort((a, b) => b.budget - a.budget);
    if (sort === "budget-asc") out = [...out].sort((a, b) => a.budget - b.budget);
    return out;
  }, [jobs, category, sort]);

  return (
    <div className="max-w-[1180px] mx-auto px-8 py-8 pb-20">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Marketplace</h1>
        <div className="text-text-dim text-[13.5px]">
          Open jobs waiting for a builder
        </div>
      </div>

      {!env.contractsDeployed && (
        <div className="mb-6 card p-4 border-accent-line">
          <div className="text-[13px] font-medium text-accent mb-1">Contracts not yet deployed</div>
          <div className="text-[12.5px] text-text-dim">
            The marketplace is empty until smart contracts deploy on Cardano {env.network}. Posting and applying will work as soon as deployment lands in Week 7.
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <aside>
          <div className="text-[11px] uppercase tracking-wider text-text-faint mb-2 px-1">Category</div>
          <div className="flex flex-col gap-1">
            <FilterButton
              label="All"
              count={filtered.length}
              active={category === null}
              onClick={() => setCategory(null)}
            />
            {categories.map((c) => {
              const n = jobs.filter((j) => j.status === "Open" && j.category === c).length;
              return (
                <FilterButton
                  key={c}
                  label={c}
                  count={n}
                  active={category === c}
                  onClick={() => setCategory(c)}
                />
              );
            })}
          </div>

          <div className="text-[11px] uppercase tracking-wider text-text-faint mt-6 mb-2 px-1">Sort</div>
          <select
            className="select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="newest">Newest first</option>
            <option value="budget-desc">Budget · high to low</option>
            <option value="budget-asc">Budget · low to high</option>
          </select>
        </aside>

        <div>
          {isLoading && (
            <div className="text-center py-16 text-[13px] text-text-faint">Loading jobs…</div>
          )}

          {!isLoading && filtered.length === 0 && (
            <EmptyState
              icon={<Icons.briefcase className="w-5 h-5" />}
              title="No open jobs"
              description={
                env.contractsDeployed
                  ? "There are no open jobs in this category right now. Try a different filter, or check back later."
                  : "Once contracts deploy and clients start posting, jobs will appear here."
              }
            />
          )}

          {!isLoading && filtered.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              {filtered.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between px-2.5 py-2 rounded-md text-[13px] transition-colors ${
        active
          ? "bg-surface text-text border border-border"
          : "text-text-dim border border-transparent hover:bg-surface hover:text-text"
      }`}
    >
      <span className="capitalize">{label}</span>
      <span className="text-[11px] text-text-faint font-mono">{count}</span>
    </button>
  );
}

function JobCard({ job }: { job: Job }) {
  const { data: clientProfile } = useProfile(job.clientAddress);
  return (
    <Link
      to={`/app/jobs/${encodeURIComponent(job.id)}`}
      className="card p-5 hover:border-border-strong hover:-translate-y-0.5 transition-all flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-medium truncate">{job.title || "Untitled"}</h3>
          <div className="text-[12px] text-text-faint mt-0.5">
            {job.category} · posted {formatRelative(job.createdAt)}
          </div>
        </div>
        <Pill status={job.status} />
      </div>

      {job.description && (
        <p className="text-[13px] text-text-dim line-clamp-2 leading-relaxed">
          {job.description}
        </p>
      )}

      {job.skills && job.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {job.skills.slice(0, 4).map((s) => (
            <span key={s} className="tag">{s}</span>
          ))}
          {job.skills.length > 4 && (
            <span className="text-[11px] text-text-faint self-center">+{job.skills.length - 4}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
        <Identity address={job.clientAddress} profile={clientProfile ?? null} size="sm" showAvatar />
        <Ada amount={job.budget} big />
      </div>
    </Link>
  );
}
