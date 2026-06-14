/**
 * JobDetail — full view of a single escrow.
 *
 * Layout (matches design AI's 2-column shape):
 *   - Main column: header, description, submission section, dispute panel
 *   - Side column: parties, timeline, actions
 *
 * Role-aware: shows different actions/panels depending on whether the
 * connected wallet is the client, builder, arbitrator, or just a viewer.
 *
 * All write actions are disabled this week (Week 6 is read-only). The
 * buttons render with tooltips explaining "available in Week 7" so the
 * UX is honest about what's wired.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useJob, useProfile, useReputation } from "@/hooks/useQueries";
import { useWallet } from "@/hooks/useWallet";
import { Ada, Cid, Identity, Pill } from "@/components/atoms";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/Icons";
import { formatAda, formatRelative, truncateAddress } from "@/lib/format";
import { gatewayUrl, listFolder, pinByHash, type IpfsDirEntry } from "@/lib/ipfs";
import { pushToast } from "@/components/Toasts";
import type { Job } from "@/types/domain";

/**
 * The connected wallet's relationship to *this* escrow UTxO.
 * Different from the global `useRole()` lens — that's a UI preference,
 * this is computed from on-chain addresses.
 */
type EscrowRole = "client" | "builder" | "arbitrator" | "viewer";

function useEscrowRole(job: Job): EscrowRole {
  const w = useWallet();
  const address = w.status === "connected" ? w.address : null;
  return useMemo<EscrowRole>(() => {
    if (!address) return "viewer";
    if (address === job.clientAddress) return "client";
    if (address === job.builderAddress) return "builder";
    if (address === job.arbitratorAddress) return "arbitrator";
    return "viewer";
  }, [address, job.clientAddress, job.builderAddress, job.arbitratorAddress]);
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const decodedId = id ? decodeURIComponent(id) : null;
  const { data: job, isLoading, error } = useJob(decodedId);

  if (isLoading) {
    return (
      <div className="max-w-[1180px] mx-auto px-8 py-12 text-center text-[13px] text-text-faint">
        Loading job…
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-[720px] mx-auto px-8 py-12">
        <EmptyState
          icon={<Icons.briefcase className="w-5 h-5" />}
          title="Job not found"
          description="This escrow UTxO may have been spent (released, refunded, or resolved) — or the ID is wrong. Try the marketplace."
          action={
            <Link to="/app/marketplace" className="btn">
              <Icons.arrR className="w-4 h-4" /> Back to marketplace
            </Link>
          }
        />
      </div>
    );
  }

  return <JobDetailContent job={job} />;
}

function JobDetailContent({ job }: { job: Job }) {
  const role = useEscrowRole(job);
  const { data: clientProfile } = useProfile(job.clientAddress);
  const { data: builderProfile } = useProfile(job.builderAddress);
  const { data: builderRep } = useReputation(job.builderAddress);

  return (
    <div className="max-w-[1180px] mx-auto px-8 py-8 pb-20">
      {/* Breadcrumb */}
      <Link
        to="/app/marketplace"
        className="inline-flex items-center gap-1.5 text-[12px] text-text-dim hover:text-text mb-6"
      >
        <Icons.arrR className="w-3.5 h-3.5 rotate-180" /> Marketplace
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Pill status={job.status} />
            <span className="text-[12px] text-text-faint">
              {job.category} · posted {formatRelative(job.createdAt)}
            </span>
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight">
            {job.title || "Untitled job"}
          </h1>
        </div>
        <div className="text-right">
          <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-0.5">
            Budget
          </div>
          <div className="text-[24px] font-mono font-semibold">
            <Ada amount={job.budget} big />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8">
        {/* Main */}
        <div className="space-y-6">
          <section className="card p-6">
            <SectionHeading icon={<Icons.paper className="w-4 h-4" />}>
              Description
            </SectionHeading>
            {job.description ? (
              <p className="text-[14px] leading-relaxed text-text whitespace-pre-line">
                {job.description}
              </p>
            ) : (
              <p className="text-[13px] text-text-faint italic">
                No description (IPFS content not available).
              </p>
            )}
            {job.skills && job.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-5 pt-5 border-t border-border">
                {job.skills.map((s) => (
                  <span key={s} className="tag">
                    {s}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-5 pt-5 border-t border-border flex items-center justify-between text-[12px] text-text-faint">
              <span>Job CID</span>
              <Cid cid={job.jobCid} />
            </div>
          </section>

          {/* Submission section (only if Submitted+) */}
          {(job.status === "Submitted" ||
            job.status === "Disputed" ||
            job.status === "Completed") &&
            job.submissionCid && (
              <SubmissionPanel
                submissionCid={job.submissionCid}
                role={role}
                submittedAt={job.submittedAt}
              />
            )}

          {/* Dispute panel */}
          {job.status === "Disputed" && job.disputeEvidenceCid && (
            <DisputePanel
              evidenceCid={job.disputeEvidenceCid}
              raisedBy={job.disputeRaisedBy}
              raisedAt={job.disputeRaisedAt}
            />
          )}

          {/* Builder reputation (when there is one) */}
          {builderRep && (
            <section className="card p-6">
              <SectionHeading icon={<Icons.user className="w-4 h-4" />}>
                Selected builder
              </SectionHeading>
              <div className="flex items-start gap-4">
                <Identity
                  address={job.builderAddress!}
                  profile={builderProfile ?? null}
                  size="lg"
                  showAvatar
                />
                <Link
                  to={`/app/profiles/${job.builderAddress}`}
                  className="btn btn-sm ml-auto"
                >
                  View profile <Icons.arrR className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-border">
                <RepStat label="Completed" value={builderRep.completedJobs} />
                <RepStat
                  label="Volume"
                  value={`₳${formatAda(builderRep.totalVolume)}`}
                />
                <RepStat
                  label="Disputes"
                  value={`${builderRep.disputesWon}W · ${builderRep.disputesLost}L`}
                />
              </div>
            </section>
          )}
        </div>

        {/* Side */}
        <aside className="space-y-4">
          <Card>
            <CardHeading>Parties</CardHeading>
            <div className="space-y-3">
              <PartyRow
                label="Client"
                address={job.clientAddress}
                profile={clientProfile ?? null}
              />
              <PartyRow
                label="Builder"
                address={job.builderAddress}
                profile={builderProfile ?? null}
              />
              <PartyRow label="Arbitrator" address={job.arbitratorAddress} />
            </div>
          </Card>

          <Card>
            <CardHeading>Timeline</CardHeading>
            <Timeline job={job} />
          </Card>

          <Card>
            <CardHeading>Actions</CardHeading>
            <Actions job={job} role={role} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Submission panel
// ────────────────────────────────────────────────────────────────────────

function SubmissionPanel({
  submissionCid,
  role,
  submittedAt,
}: {
  submissionCid: string;
  role: EscrowRole;
  submittedAt: Date | null;
}) {
  const [folder, setFolder] = useState<IpfsDirEntry[] | null>(null);
  const [folderChecked, setFolderChecked] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [pinned, setPinned] = useState(false);

  // Probe whether this CID is a folder or a single file. One-shot per cid.
  useEffect(() => {
    let cancelled = false;
    listFolder(submissionCid).then((entries) => {
      if (!cancelled) {
        setFolder(entries);
        setFolderChecked(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [submissionCid]);

  async function handlePin() {
    setPinning(true);
    try {
      await pinByHash(submissionCid);
      setPinned(true);
      pushToast("Submission pinned to your IPFS account", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Pin failed";
      pushToast(`Pin failed: ${msg}`, "error");
    } finally {
      setPinning(false);
    }
  }

  return (
    <section className="card p-6">
      <SectionHeading icon={<Icons.send className="w-4 h-4" />}>
        Submission
      </SectionHeading>

      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-text-faint mb-1">
            {submittedAt
              ? `Submitted ${formatRelative(submittedAt)}`
              : "Submitted"}
          </div>
          <Cid cid={submissionCid} />
        </div>
        <div className="flex items-center gap-2">
          <a
            href={gatewayUrl(submissionCid)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm"
          >
            Open <Icons.ext className="w-3.5 h-3.5" />
          </a>
          {role === "client" && (
            <button
              className="btn btn-sm"
              onClick={handlePin}
              disabled={pinning || pinned}
              title="Pin this submission to your IPFS account so you keep a copy"
            >
              {pinned ? (
                <>
                  <Icons.check className="w-3.5 h-3.5" /> Pinned
                </>
              ) : pinning ? (
                <>
                  <span className="tx-spinner" /> Pinning…
                </>
              ) : (
                <>
                  <Icons.lock className="w-3.5 h-3.5" /> Pin a copy
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Folder listing if applicable */}
      {folderChecked && folder && folder.length > 0 && (
        <div className="border-t border-border pt-4">
          <div className="text-[11px] uppercase tracking-wider text-text-faint mb-2">
            Files ({folder.length})
          </div>
          <div className="flex flex-col">
            {folder.map((entry) => (
              <a
                key={entry.cid}
                href={gatewayUrl(`${submissionCid}/${entry.name}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-2 py-1.5 -mx-2 rounded text-[13px] hover:bg-surface-2"
              >
                <span className="flex items-center gap-2 truncate">
                  <Icons.paper className="w-3.5 h-3.5 text-text-faint flex-shrink-0" />
                  <span className="truncate">{entry.name}</span>
                </span>
                <span className="text-[11px] text-text-faint font-mono">
                  {formatBytes(entry.size)}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {folderChecked && !folder && (
        <div className="border-t border-border pt-4 text-[12px] text-text-faint">
          Single-file submission. Use Open to view the content.
        </div>
      )}

      {role === "client" && (
        <div className="mt-4 pt-4 border-t border-border text-[11.5px] text-text-faint">
          <Icons.lock className="w-3 h-3 inline-block mr-1.5 align-middle" />
          As the client, pinning a copy guarantees the submission stays
          available even if the builder unpins it.
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Dispute panel
// ────────────────────────────────────────────────────────────────────────

function DisputePanel({
  evidenceCid,
  raisedBy,
  raisedAt,
}: {
  evidenceCid: string;
  raisedBy: string | null;
  raisedAt: Date | null;
}) {
  return (
    <section className="card p-6 border-danger/30">
      <SectionHeading icon={<Icons.flag className="w-4 h-4" />}>
        Dispute raised
      </SectionHeading>
      <div className="text-[13px] text-text-dim mb-4">
        {raisedBy ? `Raised by ${truncateAddress(raisedBy)}` : "Raised"}
        {raisedAt && ` · ${formatRelative(raisedAt)}`}. The arbitrator has
        14 days to resolve before either party may force-resolve.
      </div>
      <div className="flex items-center gap-2">
        <a
          href={gatewayUrl(evidenceCid)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm"
        >
          View evidence <Icons.ext className="w-3.5 h-3.5" />
        </a>
        <Cid cid={evidenceCid} />
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Side panels
// ────────────────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return <div className="card p-5">{children}</div>;
}

function CardHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-3">
      {children}
    </div>
  );
}

function PartyRow({
  label,
  address,
  profile,
}: {
  label: string;
  address: string | null;
  profile?: import("@/types/domain").Profile | null;
}) {
  return (
    <div>
      <div className="text-[11px] text-text-faint mb-1">{label}</div>
      {address ? (
        <Identity address={address} profile={profile ?? null} size="sm" />
      ) : (
        <span className="text-[12.5px] text-text-faint italic">
          Not assigned
        </span>
      )}
    </div>
  );
}

function Timeline({ job }: { job: Job }) {
  const items: { label: string; at: Date | null; active?: boolean }[] = [
    { label: "Posted", at: job.createdAt },
    { label: "Builder selected", at: job.selectedAt },
    { label: "Work submitted", at: job.submittedAt },
  ];
  if (job.status === "Completed") {
    items.push({ label: "Released", at: job.submittedAt, active: true });
  } else if (job.status === "Disputed") {
    items.push({
      label: "Disputed",
      at: job.disputeRaisedAt,
      active: true,
    });
  } else if (job.submittedAt && job.autoReleaseAt) {
    items.push({ label: "Auto-release", at: job.autoReleaseAt });
  } else if (job.selectedAt && job.autoRefundAt) {
    items.push({ label: "Auto-refund", at: job.autoRefundAt });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((i) => (
        <div
          key={i.label}
          className={`flex items-center justify-between text-[12px] ${
            i.at ? "text-text" : "text-text-faint"
          }`}
        >
          <span className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                i.active
                  ? "bg-accent"
                  : i.at
                  ? "bg-text-dim"
                  : "bg-border"
              }`}
            />
            {i.label}
          </span>
          <span className="text-[11px] font-mono text-text-faint">
            {i.at ? formatRelative(i.at) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function Actions({
  job,
  role,
}: {
  job: Job;
  role: EscrowRole;
}) {
  const w = useWallet();
  const isConnected = w.status === "connected";
  if (!isConnected) {
    return (
      <div className="text-[12.5px] text-text-faint">
        Connect a wallet to apply or interact.
      </div>
    );
  }

  // Each action is disabled this week with a tooltip explaining why.
  const wkSeven = "Available when contracts deploy in Week 7";

  if (role === "viewer" && job.status === "Open") {
    return (
      <button className="btn btn-accent w-full" disabled title={wkSeven}>
        <Icons.send className="w-4 h-4" /> Apply
      </button>
    );
  }
  if (role === "client" && job.status === "Open") {
    return (
      <div className="space-y-2">
        <button className="btn w-full" disabled title={wkSeven}>
          Edit job
        </button>
        <button className="btn btn-danger w-full" disabled title={wkSeven}>
          Cancel & refund
        </button>
      </div>
    );
  }
  if (role === "client" && job.status === "Submitted") {
    return (
      <div className="space-y-2">
        <button className="btn btn-accent w-full" disabled title={wkSeven}>
          <Icons.check className="w-4 h-4" /> Approve & release
        </button>
        <button className="btn btn-danger w-full" disabled title={wkSeven}>
          <Icons.flag className="w-4 h-4" /> Raise dispute
        </button>
      </div>
    );
  }
  if (role === "builder" && job.status === "Selected") {
    return (
      <div className="space-y-2">
        <button className="btn btn-accent w-full" disabled title={wkSeven}>
          <Icons.send className="w-4 h-4" /> Submit work
        </button>
        <button className="btn w-full" disabled title={wkSeven}>
          Withdraw
        </button>
      </div>
    );
  }
  if (role === "builder" && job.status === "Submitted") {
    return (
      <div className="space-y-2">
        <button className="btn w-full" disabled title={wkSeven}>
          Amend submission
        </button>
        <button className="btn btn-danger w-full" disabled title={wkSeven}>
          <Icons.flag className="w-4 h-4" /> Raise dispute
        </button>
      </div>
    );
  }
  if (role === "arbitrator" && job.status === "Disputed") {
    return (
      <div className="space-y-2">
        <button className="btn btn-accent w-full" disabled title={wkSeven}>
          Resolve in favor of client
        </button>
        <button className="btn btn-accent w-full" disabled title={wkSeven}>
          Resolve in favor of builder
        </button>
      </div>
    );
  }

  return (
    <div className="text-[12.5px] text-text-faint">
      No actions available in this state.
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function SectionHeading({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-accent-soft border border-accent-line text-accent">
        {icon}
      </span>
      <h2 className="text-[14px] font-medium">{children}</h2>
    </div>
  );
}

function RepStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-0.5">
        {label}
      </div>
      <div className="text-[15px] font-mono font-medium">{value}</div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
