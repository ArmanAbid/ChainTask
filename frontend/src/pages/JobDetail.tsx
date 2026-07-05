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
import { Link, useNavigate, useParams } from "react-router-dom";
import { useJob, useProfile, useProposals, useReputation } from "@/hooks/useQueries";
import { useAmendSubmission, useArbitratorTimeout, useAutoRefund, useAutoRelease, useBuilderWithdraw, useDispute, usePinProposal, useRefund, useRelease, useResolve, useSelectBuilder, useSubmitWork, useUpdateJob } from "@/hooks/useTx";
import { useWallet } from "@/hooks/useWallet";
import { Ada, Avatar, Cid, Identity, Pill } from "@/components/atoms";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { formatAda, formatRelative, truncateAddress } from "@/lib/format";
import { gatewayUrl, listFolder, pinByHash, pinJson, type IpfsDirEntry, type WorkSubmission } from "@/lib/ipfs";
import { pushToast } from "@/components/Toasts";
import { PROTOCOL_PARAMS } from "@/config/protocol";
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
      <div className="flex items-center gap-1.5 text-[12px] text-text-dim mb-6">
        <Link
          to="/app/marketplace"
          className="hover:text-text inline-flex items-center gap-1.5"
        >
          <Icons.arrR className="w-3.5 h-3.5 rotate-180" /> Marketplace
        </Link>
        <span className="text-text-faint">/</span>
        <span className="text-text-faint font-mono truncate">
          {job.id.slice(0, 12)}…
        </span>
      </div>

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

      <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
        {/* Main */}
        <div className="space-y-6 min-w-0">
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

          {/* Proposals (client of an Open job sees who's applied) */}
          {role === "client" && job.status === "Open" && (
            <ProposalsSection job={job} />
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
        <aside className="space-y-4 lg:sticky lg:top-6">
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
          className={`flex items-center justify-between text-[12px] ${i.at ? "text-text" : "text-text-faint"
            }`}
        >
          <span className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${i.active
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

  if (role === "viewer" && job.status === "Open") {
    return <ApplyButton job={job} />;
  }
  if (role === "client" && job.status === "Open") {
    return (
      <div className="space-y-2">
        <EditJobButton job={job} />
        <div className="text-[11.5px] text-text-faint pt-1.5 leading-relaxed">
          Open jobs can't be cancelled unilaterally. Once a builder is selected, you and the builder can mutually cancel via refund.
        </div>
      </div>
    );
  }
  if (role === "client" && (job.status === "Selected" || job.status === "Submitted")) {
    return (
      <div className="space-y-2">
        {job.status === "Submitted" && <ReleaseButton job={job} />}
        <RefundButton job={job} />
        <DisputeButton job={job} raiserSide="client" />
        {job.status === "Selected" && <AutoRefundButton job={job} />}
      </div>
    );
  }
  if (role === "builder" && job.status === "Selected") {
    return (
      <div className="space-y-2">
        <SubmitWorkButton job={job} />
        <WithdrawButton job={job} />
        <DisputeButton job={job} raiserSide="builder" />
      </div>
    );
  }
  if (role === "builder" && job.status === "Submitted") {
    return (
      <div className="space-y-2">
        <AmendSubmissionButton job={job} />
        <RefundButton job={job} />
        <DisputeButton job={job} raiserSide="builder" />
        <AutoReleaseButton job={job} />
      </div>
    );
  }
  if (role === "arbitrator" && job.status === "Disputed") {
    return (
      <div className="space-y-2">
        <ResolveButton job={job} releaseToBuilder={false} />
        <ResolveButton job={job} releaseToBuilder={true} />
      </div>
    );
  }
  // Dispute raiser waiting on arbitrator — expose ArbitratorTimeout when
  // the wait exceeds the timeout window (~14 days).
  if (job.status === "Disputed" && role !== "arbitrator") {
    return (
      <div className="space-y-2">
        <ArbitratorTimeoutButton job={job} />
        <div className="text-[11.5px] text-text-faint pt-1.5 leading-relaxed">
          Waiting on arbitrator. After ~14 days you can trigger arbitrator timeout — the dispute defaults in favor of whoever raised it.
        </div>
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

// ────────────────────────────────────────────────────────────────────────
// ApplyButton — for viewers (would-be builders) on Open jobs
// ────────────────────────────────────────────────────────────────────────

function ApplyButton({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const w = useWallet();
  const pinMut = usePinProposal();
  const [message, setMessage] = useState("");
  const [deliveryDays, setDeliveryDays] = useState("");
  const builderAddress = w.status === "connected" ? w.address : null;

  if (!builderAddress) {
    return (
      <button className="btn btn-accent w-full" disabled title="Connect wallet first">
        <Icons.send className="w-4 h-4" /> Apply
      </button>
    );
  }

  const messageErr =
    message.trim().length < 20
      ? "Tell the client why you're a fit (min 20 chars)"
      : message.length > 1000
        ? "Max 1000 characters"
        : null;
  const deliveryNum = Number(deliveryDays);
  const deliveryErr =
    deliveryDays && (!Number.isInteger(deliveryNum) || deliveryNum <= 0 || deliveryNum > 365)
      ? "Must be 1–365"
      : null;
  const valid = !messageErr && !deliveryErr;

  async function handleSubmit() {
    if (!valid || pinMut.isPending) return;
    try {
      await pinMut.mutateAsync({
        type: "proposal",
        jobId: job.id,
        builderAddress: builderAddress!,
        message: message.trim(),
        deliveryDays: deliveryDays ? deliveryNum : undefined,
        postedAt: Date.now(),
      });
      setOpen(false);
      setMessage("");
      setDeliveryDays("");
    } catch {
      // usePinProposal already toasts on error
    }
  }

  return (
    <>
      <button
        className="btn btn-accent w-full"
        onClick={() => setOpen(true)}
      >
        <Icons.send className="w-4 h-4" /> Apply
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Apply to this job"
        subtitle={`${job.title} · ₳${job.budget}`}
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)} disabled={pinMut.isPending}>
              Cancel
            </button>
            <button
              className="btn btn-accent"
              onClick={handleSubmit}
              disabled={!valid || pinMut.isPending}
            >
              {pinMut.isPending ? (
                <>
                  <span className="tx-spinner" /> Pinning…
                </>
              ) : (
                <>
                  <Icons.send className="w-3.5 h-3.5" /> Send proposal
                </>
              )}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <div>
            <label className="field-label">Cover note</label>
            <textarea
              className="textarea mt-1.5"
              rows={6}
              placeholder="Why you're a fit. Relevant past work. Questions about the scope."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
            />
            <div className="flex items-center justify-between text-[11px] text-text-faint mt-1">
              <span>{messageErr ? <span className="text-danger">{messageErr}</span> : "Visible to the client only"}</span>
              <span className="font-mono">{message.length}/1000</span>
            </div>
          </div>
          <div>
            <label className="field-label">Delivery estimate (days) — optional</label>
            <input
              className="input mt-1.5"
              type="text"
              inputMode="numeric"
              value={deliveryDays}
              onChange={(e) => setDeliveryDays(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={job.deadlineDays?.toString() ?? "14"}
            />
            {deliveryErr && (
              <div className="text-[11px] text-danger mt-1">{deliveryErr}</div>
            )}
          </div>
          <div className="flex items-start gap-2 p-2.5 bg-bg-2 border border-border rounded-md text-[12px] text-text-dim">
            <Icons.lock className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <span>
              Proposals are pinned to IPFS. The client sees your address, name (if you've set a profile), and this note. Funds are already locked in escrow — applying doesn't move ADA.
            </span>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// ProposalsSection — client of an Open job sees applications and picks
// ────────────────────────────────────────────────────────────────────────

function ProposalsSection({ job }: { job: Job }) {
  const { data: proposals = [], isLoading } = useProposals(job.id);

  return (
    <section className="card p-0">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="m-0 text-[14px] flex items-center gap-2">
          Proposals
          <span className="text-text-faint font-normal">
            {isLoading ? "…" : proposals.length}
          </span>
        </h3>
      </div>
      {isLoading ? (
        <div className="px-6 py-10 text-center text-[13px] text-text-faint">
          Fetching proposals from IPFS…
        </div>
      ) : proposals.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <div className="text-[14px] text-text mb-1">No proposals yet</div>
          <div className="text-[12.5px] text-text-faint">
            Builders' applications will appear here as they come in.
          </div>
        </div>
      ) : (
        proposals.map((p) => (
          <ProposalRow key={p.cid} jobId={job.id} proposal={p} />
        ))
      )}
    </section>
  );
}

function ProposalRow({
  jobId,
  proposal,
}: {
  jobId: string;
  proposal: {
    builderAddress: string;
    message: string;
    deliveryDays?: number;
    postedAt: number;
    cid: string;
  };
}) {
  const { data: builderProfile } = useProfile(proposal.builderAddress);
  const selectMut = useSelectBuilder();
  const navigate = useNavigate();

  const builderName =
    builderProfile?.content?.displayName ?? truncateAddress(proposal.builderAddress);

  async function handleSelect() {
    if (selectMut.isPending) return;
    try {
      await selectMut.mutateAsync({
        jobId,
        builderAddress: proposal.builderAddress,
      });
      // Stay on this page — the cache invalidation will repaint as Selected.
    } catch {
      // useSelectBuilder already shows error toast
    }
  }

  return (
    <div className="flex flex-col gap-3 p-5 border-b border-border last:border-b-0">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() =>
            navigate(`/app/profiles/${encodeURIComponent(proposal.builderAddress)}`)
          }
          className="bg-transparent border-0 p-0"
        >
          {builderProfile?.content?.avatarCid ? (
            <Avatar
              name={(builderName[0] || "?").toUpperCase()}
              src={builderProfile.content.avatarCid}
            />
          ) : (
            <Avatar name={(builderName[0] || "?").toUpperCase()} />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <button
            className="link-name font-medium text-[14px]"
            onClick={() =>
              navigate(`/app/profiles/${encodeURIComponent(proposal.builderAddress)}`)
            }
          >
            {builderName}
          </button>
          <div className="text-[11.5px] text-text-faint font-mono mt-0.5">
            {truncateAddress(proposal.builderAddress)}
          </div>
        </div>
        {proposal.deliveryDays != null && (
          <div className="text-right">
            <div className="text-[11px] text-text-faint">Delivery</div>
            <div className="text-[13px] font-medium">in {proposal.deliveryDays} days</div>
          </div>
        )}
      </div>
      <p className="text-[13px] text-text-dim leading-relaxed m-0 whitespace-pre-line">
        {proposal.message}
      </p>
      <div className="flex items-center gap-2 mt-1">
        <button
          className="btn btn-accent btn-sm"
          onClick={handleSelect}
          disabled={selectMut.isPending}
        >
          {selectMut.isPending ? (
            <>
              <span className="tx-spinner" /> Selecting…
            </>
          ) : (
            <>
              <Icons.check className="w-3.5 h-3.5" /> Select this builder
            </>
          )}
        </button>
        <span className="text-[11px] text-text-faint ml-auto">
          {formatRelative(new Date(proposal.postedAt))}
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// SubmitWorkButton — builder on a Selected job uploads deliverables
// ────────────────────────────────────────────────────────────────────────

function SubmitWorkButton({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [pinning, setPinning] = useState(false);
  const submitMut = useSubmitWork();

  const summaryErr =
    summary.trim().length < 20
      ? "Summarize what you delivered (min 20 chars)"
      : summary.length > 2000
        ? "Max 2000 characters"
        : null;
  const valid = !summaryErr;
  const busy = pinning || submitMut.isPending;

  async function handleSubmit() {
    if (!valid || busy) return;

    setPinning(true);
    let submissionCid: string;
    try {
      const submission: WorkSubmission = {
        summary: summary.trim(),
        attachments: [],
      };
      submissionCid = await pinJson(submission, {
        name: `chaintask-submission-${job.id.slice(0, 12)}`,
        keyvalues: {
          chaintaskType: "submission",
          jobId: job.id,
        },
      });
    } catch (e) {
      setPinning(false);
      pushToast(e instanceof Error ? e.message : "IPFS pin failed", "error");
      return;
    }
    setPinning(false);

    try {
      await submitMut.mutateAsync({ jobId: job.id, submissionCid });
      setOpen(false);
      setSummary("");
    } catch {
      // useSubmitWork already toasts
    }
  }

  return (
    <>
      <button className="btn btn-accent w-full" onClick={() => setOpen(true)}>
        <Icons.send className="w-4 h-4" /> Submit work
      </button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Submit work"
        subtitle={`${job.title} · ₳${job.budget}`}
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button
              className="btn btn-accent"
              onClick={handleSubmit}
              disabled={!valid || busy}
            >
              {pinning ? (
                <>
                  <span className="tx-spinner" /> Pinning…
                </>
              ) : submitMut.isPending ? (
                <>
                  <span className="tx-spinner" /> Submitting tx…
                </>
              ) : (
                <>
                  <Icons.send className="w-3.5 h-3.5" /> Submit work
                </>
              )}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <div>
            <label className="field-label">Delivery summary</label>
            <textarea
              className="textarea mt-1.5"
              rows={8}
              placeholder="Describe what you built. Link to deliverables. Note any caveats."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={2000}
              disabled={busy}
            />
            <div className="flex items-center justify-between text-[11px] text-text-faint mt-1">
              <span>
                {summaryErr ? (
                  <span className="text-danger">{summaryErr}</span>
                ) : (
                  "Pinned to IPFS, then committed on chain"
                )}
              </span>
              <span className="font-mono">{summary.length}/2000</span>
            </div>
          </div>
          <div className="flex items-start gap-2 p-2.5 bg-bg-2 border border-border rounded-md text-[12px] text-text-dim">
            <Icons.lock className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <span>
              Submitting moves the job to Submitted state. The client can then release funds or raise a dispute. Auto-release happens {PROTOCOL_PARAMS.autoReleaseDays} days after this submission if neither party acts.
            </span>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// ReleaseButton — client on a Submitted job approves payout
// ────────────────────────────────────────────────────────────────────────

function ReleaseButton({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const releaseMut = useRelease();

  const cutPercent = PROTOCOL_PARAMS.platformCutPercent;
  const builderPayout = job.budget * (100 - cutPercent) / 100;
  const treasuryCut = job.budget - builderPayout;

  async function handleRelease() {
    if (releaseMut.isPending) return;
    try {
      await releaseMut.mutateAsync({ jobId: job.id });
      setOpen(false);
    } catch {
      // useRelease already toasts
    }
  }

  return (
    <>
      <button className="btn btn-accent w-full" onClick={() => setOpen(true)}>
        <Icons.check className="w-4 h-4" /> Approve & release
      </button>
      <Modal
        open={open}
        onClose={() => !releaseMut.isPending && setOpen(false)}
        title="Release escrow"
        subtitle={`${job.title}`}
        footer={
          <>
            <button
              className="btn"
              onClick={() => setOpen(false)}
              disabled={releaseMut.isPending}
            >
              Cancel
            </button>
            <button
              className="btn btn-accent"
              onClick={handleRelease}
              disabled={releaseMut.isPending}
            >
              {releaseMut.isPending ? (
                <>
                  <span className="tx-spinner" /> Releasing…
                </>
              ) : (
                <>
                  <Icons.check className="w-3.5 h-3.5" /> Confirm release
                </>
              )}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <p className="text-[13px] text-text-dim leading-relaxed m-0">
            Approves the builder's submission and releases the funds from
            escrow. This action is final — once on chain, you can't reverse it.
          </p>
          <div className="card p-4 bg-bg-2">
            <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-3">
              Payout
            </div>
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <div className="text-text-faint text-[11px]">Builder receives</div>
                <div className="font-medium mt-0.5">
                  <Ada amount={builderPayout} big />
                </div>
              </div>
              <div>
                <div className="text-text-faint text-[11px]">Treasury cut</div>
                <div className="font-medium mt-0.5">
                  <Ada amount={treasuryCut} />
                  <span className="text-text-faint text-[11px] ml-1">
                    ({cutPercent}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2 p-2.5 bg-bg-2 border border-border rounded-md text-[12px] text-text-dim">
            <Icons.lock className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <span>
              Both you and the builder sign this transaction. The escrow UTxO is consumed and funds flow out to both addresses.
            </span>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// RefundButton — mutual cancellation (Selected or Submitted)
// ────────────────────────────────────────────────────────────────────────

function RefundButton({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const refundMut = useRefund();

  async function handle() {
    if (refundMut.isPending) return;
    try {
      await refundMut.mutateAsync({ jobId: job.id });
      setOpen(false);
    } catch {
      // toast handled
    }
  }

  return (
    <>
      <button className="btn btn-danger w-full" onClick={() => setOpen(true)}>
        Mutual refund
      </button>
      <Modal
        open={open}
        onClose={() => !refundMut.isPending && setOpen(false)}
        title="Mutual refund"
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)} disabled={refundMut.isPending}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={handle}
              disabled={refundMut.isPending}
            >
              {refundMut.isPending ? (
                <>
                  <span className="tx-spinner" /> Refunding…
                </>
              ) : (
                <>Refund client</>
              )}
            </button>
          </>
        }
      >
        <p className="text-[13px] text-text-dim leading-relaxed m-0">
          Both you and the other party need to sign this tx. The full ₳{job.budget} returns to the client. No platform fee on mutual cancellation, and no reputation change either way.
        </p>
      </Modal>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// WithdrawButton — builder leaves a Selected job
// ────────────────────────────────────────────────────────────────────────

function WithdrawButton({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const mut = useBuilderWithdraw();

  async function handle() {
    if (mut.isPending) return;
    try {
      await mut.mutateAsync({ jobId: job.id });
      setOpen(false);
    } catch { }
  }

  return (
    <>
      <button className="btn w-full" onClick={() => setOpen(true)}>
        Withdraw from job
      </button>
      <Modal
        open={open}
        onClose={() => !mut.isPending && setOpen(false)}
        title="Withdraw from this job"
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)} disabled={mut.isPending}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handle} disabled={mut.isPending}>
              {mut.isPending ? <><span className="tx-spinner" /> Withdrawing…</> : "Withdraw"}
            </button>
          </>
        }
      >
        <p className="text-[13px] text-text-dim leading-relaxed m-0">
          You'll be removed from this job and it returns to Open. The escrow funds stay locked at the script — the client keeps the listing alive and another builder can apply. Your reputation will record a withdrawal.
        </p>
      </Modal>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// DisputeButton — raise a dispute with evidence CID
// ────────────────────────────────────────────────────────────────────────

function DisputeButton({
  job,
  raiserSide,
}: {
  job: Job;
  raiserSide: "client" | "builder";
}) {
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState("");
  const [reason, setReason] = useState("");
  const [pinning, setPinning] = useState(false);
  const disputeMut = useDispute();

  const reasonErr =
    reason.trim().length === 0
      ? "Required"
      : reason.length > 80
        ? "Max 80 chars"
        : null;
  const statementErr =
    statement.trim().length < 40
      ? "Make your case (min 40 chars)"
      : statement.length > 4000
        ? "Max 4000 chars"
        : null;
  const valid = !reasonErr && !statementErr;
  const busy = pinning || disputeMut.isPending;

  async function handle() {
    if (!valid || busy) return;

    setPinning(true);
    let evidenceCid: string;
    try {
      evidenceCid = await pinJson(
        {
          reason: reason.trim(),
          statement: statement.trim(),
          attachments: [],
        },
        {
          name: `chaintask-evidence-${job.id.slice(0, 12)}-${raiserSide}`,
          keyvalues: {
            chaintaskType: "evidence",
            jobId: job.id,
            raiserSide,
          },
        },
      );
    } catch (e) {
      setPinning(false);
      pushToast(e instanceof Error ? e.message : "Evidence pin failed", "error");
      return;
    }
    setPinning(false);

    try {
      await disputeMut.mutateAsync({
        jobId: job.id,
        evidenceCid,
        raiserSide,
      });
      setOpen(false);
      setStatement("");
      setReason("");
    } catch { }
  }

  return (
    <>
      <button className="btn btn-danger w-full" onClick={() => setOpen(true)}>
        <Icons.flag className="w-4 h-4" /> Raise dispute
      </button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Raise a dispute"
        subtitle={`Locks an additional ₳${PROTOCOL_PARAMS.disputeFee} dispute fee · arbitrator decides`}
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={handle}
              disabled={!valid || busy}
            >
              {pinning ? (
                <>
                  <span className="tx-spinner" /> Pinning evidence…
                </>
              ) : disputeMut.isPending ? (
                <>
                  <span className="tx-spinner" /> Submitting…
                </>
              ) : (
                <>
                  <Icons.flag className="w-3.5 h-3.5" /> Raise dispute
                </>
              )}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <div>
            <label className="field-label">Reason (short)</label>
            <input
              className="input mt-1.5"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Work doesn't match scope"
              maxLength={80}
              disabled={busy}
            />
            {reasonErr && <div className="text-[11px] text-danger mt-1">{reasonErr}</div>}
          </div>
          <div>
            <label className="field-label">Your statement</label>
            <textarea
              className="textarea mt-1.5"
              rows={8}
              placeholder="Explain the issue. Cite specific scope items. Link evidence (commits, screenshots, conversations) by IPFS CID if relevant. The arbitrator reads this before deciding."
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              maxLength={4000}
              disabled={busy}
            />
            <div className="flex items-center justify-between text-[11px] text-text-faint mt-1">
              <span>
                {statementErr ? (
                  <span className="text-danger">{statementErr}</span>
                ) : (
                  "Pinned to IPFS, referenced on chain"
                )}
              </span>
              <span className="font-mono">{statement.length}/4000</span>
            </div>
          </div>
          <div className="flex items-start gap-2 p-2.5 bg-bg-2 border border-border rounded-md text-[12px] text-text-dim">
            <Icons.lock className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <span>
              Raising a dispute locks an additional ₳{PROTOCOL_PARAMS.disputeFee} on top of the escrow. The treasury keeps the dispute fee regardless of outcome — it pays for arbitration. If you win, you still don't get it back.
            </span>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// ResolveButton — arbitrator decides
// ────────────────────────────────────────────────────────────────────────

function ResolveButton({
  job,
  releaseToBuilder,
}: {
  job: Job;
  releaseToBuilder: boolean;
}) {
  const [open, setOpen] = useState(false);
  const resolveMut = useResolve();

  const cutPercent = PROTOCOL_PARAMS.platformCutPercent;
  const builderPayout = (job.budget * (100 - cutPercent)) / 100;
  const treasuryCut = job.budget - builderPayout;

  async function handle() {
    if (resolveMut.isPending) return;
    try {
      await resolveMut.mutateAsync({ jobId: job.id, releaseToBuilder });
      setOpen(false);
    } catch { }
  }

  const label = releaseToBuilder ? "Builder wins" : "Client wins";
  const labelLong = releaseToBuilder
    ? "Resolve in favor of builder"
    : "Resolve in favor of client";

  return (
    <>
      <button
        className={releaseToBuilder ? "btn btn-accent w-full" : "btn w-full"}
        onClick={() => setOpen(true)}
      >
        {labelLong}
      </button>
      <Modal
        open={open}
        onClose={() => !resolveMut.isPending && setOpen(false)}
        title={`Resolve dispute — ${label}`}
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)} disabled={resolveMut.isPending}>
              Cancel
            </button>
            <button
              className="btn btn-accent"
              onClick={handle}
              disabled={resolveMut.isPending}
            >
              {resolveMut.isPending ? (
                <>
                  <span className="tx-spinner" /> Resolving…
                </>
              ) : (
                "Confirm resolution"
              )}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <p className="text-[13px] text-text-dim leading-relaxed m-0">
            You're acting as the arbitrator. This action is final once on chain.
            Read both parties' statements and the work submission carefully before signing.
          </p>
          <div className="card p-4 bg-bg-2">
            <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-3">
              Payout
            </div>
            <div className="space-y-2 text-[13px]">
              {releaseToBuilder ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-text-faint">Builder receives</span>
                    <Ada amount={builderPayout} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-faint">Treasury (5% + dispute fee)</span>
                    <Ada amount={treasuryCut + PROTOCOL_PARAMS.disputeFee} />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-text-faint">Client receives</span>
                    <Ada amount={job.budget} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-faint">Treasury (dispute fee)</span>
                    <Ada amount={PROTOCOL_PARAMS.disputeFee} />
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 p-2.5 bg-bg-2 border border-border rounded-md text-[12px] text-text-dim">
            <Icons.lock className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <span>
              You (arbitrator) and the {releaseToBuilder ? "builder" : "client"} both sign this transaction. The escrow UTxO is consumed and funds flow out per the split shown above.
            </span>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// AmendSubmissionButton — builder revises submission before client releases
// ────────────────────────────────────────────────────────────────────────

function AmendSubmissionButton({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [pinning, setPinning] = useState(false);
  const amendMut = useAmendSubmission();

  const summaryErr =
    summary.trim().length < 20
      ? "Explain what changed (min 20 chars)"
      : summary.length > 2000
        ? "Max 2000 characters"
        : null;
  const valid = !summaryErr;
  const busy = pinning || amendMut.isPending;

  async function handle() {
    if (!valid || busy) return;
    setPinning(true);
    let newCid: string;
    try {
      const submission: WorkSubmission = {
        summary: summary.trim(),
        attachments: [],
      };
      newCid = await pinJson(submission, {
        name: `chaintask-submission-amend-${job.id.slice(0, 12)}`,
        keyvalues: {
          chaintaskType: "submission-amend",
          jobId: job.id,
        },
      });
    } catch (e) {
      setPinning(false);
      pushToast(e instanceof Error ? e.message : "IPFS pin failed", "error");
      return;
    }
    setPinning(false);

    try {
      await amendMut.mutateAsync({ jobId: job.id, newSubmissionCid: newCid });
      setOpen(false);
      setSummary("");
    } catch { }
  }

  return (
    <>
      <button className="btn w-full" onClick={() => setOpen(true)}>
        Amend submission
      </button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Amend your submission"
        subtitle="Replaces the current submission — client review window resets"
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button
              className="btn btn-accent"
              onClick={handle}
              disabled={!valid || busy}
            >
              {pinning ? (
                <>
                  <span className="tx-spinner" /> Pinning…
                </>
              ) : amendMut.isPending ? (
                <>
                  <span className="tx-spinner" /> Submitting tx…
                </>
              ) : (
                <>
                  <Icons.send className="w-3.5 h-3.5" /> Amend submission
                </>
              )}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <div>
            <label className="field-label">Revised delivery summary</label>
            <textarea
              className="textarea mt-1.5"
              rows={8}
              placeholder="Describe what changed since your last submission. Link updated deliverables."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={2000}
              disabled={busy}
            />
            <div className="flex items-center justify-between text-[11px] text-text-faint mt-1">
              <span>
                {summaryErr ? (
                  <span className="text-danger">{summaryErr}</span>
                ) : (
                  "Pinned as a new IPFS document; the on-chain submission_cid updates"
                )}
              </span>
              <span className="font-mono">{summary.length}/2000</span>
            </div>
          </div>
          <div className="flex items-start gap-2 p-2.5 bg-bg-2 border border-border rounded-md text-[12px] text-text-dim">
            <Icons.lock className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <span>
              submitted_at advances strictly forward on chain, so the auto-release timer restarts from now. The client keeps the same options: release, dispute, or mutual refund.
            </span>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// EditJobButton — client updates an Open job (title/desc/amount/category)
// ────────────────────────────────────────────────────────────────────────

function EditJobButton({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(job.title);
  const [description, setDescription] = useState(job.description);
  const [category, setCategory] = useState(job.category);
  const [budgetAda, setBudgetAda] = useState(String(job.budget));
  const [pinning, setPinning] = useState(false);
  const updateMut = useUpdateJob();

  const titleErr =
    title.trim().length === 0
      ? "Required"
      : title.length > 80
        ? "Max 80 chars"
        : null;
  const descErr =
    description.trim().length === 0
      ? "Required"
      : description.length > 2000
        ? "Max 2000 chars"
        : null;
  const budgetNum = Number(budgetAda);
  const budgetErr =
    !budgetAda
      ? "Required"
      : Number.isNaN(budgetNum) || budgetNum <= 0
        ? "Must be positive"
        : null;
  const categoryErr =
    category.trim().length === 0
      ? "Required"
      : new TextEncoder().encode(category).length > 16
        ? "Max 16 bytes"
        : null;
  const valid = !titleErr && !descErr && !budgetErr && !categoryErr;
  const busy = pinning || updateMut.isPending;

  async function handle() {
    if (!valid || busy) return;
    setPinning(true);
    let newCid: string;
    try {
      newCid = await pinJson(
        {
          title: title.trim(),
          description: description.trim(),
          category: category.trim(),
          skills: job.skills,
          deadlineDays: job.deadlineDays,
        },
        {
          name: `chaintask-job-edit-${job.id.slice(0, 12)}`,
        },
      );
    } catch (e) {
      setPinning(false);
      pushToast(e instanceof Error ? e.message : "IPFS pin failed", "error");
      return;
    }
    setPinning(false);

    try {
      await updateMut.mutateAsync({
        jobId: job.id,
        newJobCid: newCid,
        newAmountAda: budgetNum,
        newCategory: category.trim(),
      });
      setOpen(false);
    } catch { }
  }

  return (
    <>
      <button className="btn w-full" onClick={() => setOpen(true)}>
        Edit job
      </button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Edit this job"
        subtitle="Available while job is Open (no builder selected)"
        size="lg"
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button
              className="btn btn-accent"
              onClick={handle}
              disabled={!valid || busy}
            >
              {pinning ? (
                <>
                  <span className="tx-spinner" /> Pinning…
                </>
              ) : updateMut.isPending ? (
                <>
                  <span className="tx-spinner" /> Submitting…
                </>
              ) : (
                <>Save changes</>
              )}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <div>
            <label className="field-label">Title</label>
            <input
              className="input mt-1.5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              disabled={busy}
            />
            {titleErr && <div className="text-[11px] text-danger mt-1">{titleErr}</div>}
          </div>
          <div>
            <label className="field-label">Description</label>
            <textarea
              className="textarea mt-1.5"
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              disabled={busy}
            />
            {descErr && <div className="text-[11px] text-danger mt-1">{descErr}</div>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Category</label>
              <input
                className="input mt-1.5"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={busy}
              />
              {categoryErr && <div className="text-[11px] text-danger mt-1">{categoryErr}</div>}
            </div>
            <div>
              <label className="field-label">Budget (ADA)</label>
              <input
                className="input mt-1.5"
                inputMode="decimal"
                value={budgetAda}
                onChange={(e) =>
                  setBudgetAda(e.target.value.replace(/[^0-9.]/g, ""))
                }
                disabled={busy}
              />
              {budgetErr && <div className="text-[11px] text-danger mt-1">{budgetErr}</div>}
            </div>
          </div>
          <div className="flex items-start gap-2 p-2.5 bg-bg-2 border border-border rounded-md text-[12px] text-text-dim">
            <Icons.lock className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <span>
              If you increase the budget, your wallet tops up the escrow. If you decrease it, the difference returns to you in the same tx.
            </span>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Time-based buttons — only enabled after their respective deadlines pass.
//
// The wired tx builders throw a friendly error if invoked pre-deadline,
// but we also gate the button visibly so the user sees a countdown
// rather than trying-and-failing.
// ────────────────────────────────────────────────────────────────────────

function formatCountdown(msRemaining: bigint): string {
  if (msRemaining <= 0n) return "any moment";
  const secs = Number(msRemaining / 1000n);
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function AutoReleaseButton({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const mut = useAutoRelease();

  const deadlineMs = job.autoReleaseAt ? job.autoReleaseAt.getTime() : 0;
  const nowMs = Date.now();
  const passed = deadlineMs > 0 && nowMs > deadlineMs;
  const remaining = BigInt(deadlineMs - nowMs);

  async function handle() {
    if (mut.isPending || !passed) return;
    try {
      await mut.mutateAsync({ jobId: job.id });
      setOpen(false);
    } catch { }
  }

  return (
    <>
      <button
        className="btn w-full"
        onClick={() => setOpen(true)}
        disabled={!passed}
        title={
          passed
            ? "Auto-release the escrow to the builder"
            : `Available in ${formatCountdown(remaining)}`
        }
      >
        {passed ? "Auto-release" : `Auto-release in ${formatCountdown(remaining)}`}
      </button>
      <Modal
        open={open}
        onClose={() => !mut.isPending && setOpen(false)}
        title="Auto-release escrow"
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)} disabled={mut.isPending}>
              Cancel
            </button>
            <button
              className="btn btn-accent"
              onClick={handle}
              disabled={mut.isPending}
            >
              {mut.isPending ? (
                <>
                  <span className="tx-spinner" /> Submitting…
                </>
              ) : (
                "Confirm auto-release"
              )}
            </button>
          </>
        }
      >
        <p className="text-[13px] text-text-dim leading-relaxed m-0">
          The client didn't respond within the deadline. You (the builder) can now claim the payout unilaterally per the auto-release safety net. Same split as a normal release: {100 - PROTOCOL_PARAMS.platformCutPercent}% to you, {PROTOCOL_PARAMS.platformCutPercent}% to treasury.
        </p>
      </Modal>
    </>
  );
}

function AutoRefundButton({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const mut = useAutoRefund();

  const deadlineMs = job.autoRefundAt ? job.autoRefundAt.getTime() : 0;
  const nowMs = Date.now();
  const passed = deadlineMs > 0 && nowMs > deadlineMs;
  const remaining = BigInt(deadlineMs - nowMs);

  async function handle() {
    if (mut.isPending || !passed) return;
    try {
      await mut.mutateAsync({ jobId: job.id });
      setOpen(false);
    } catch { }
  }

  return (
    <>
      <button
        className="btn w-full"
        onClick={() => setOpen(true)}
        disabled={!passed}
        title={
          passed
            ? "Refund the escrow to yourself"
            : `Available in ${formatCountdown(remaining)}`
        }
      >
        {passed ? "Auto-refund" : `Auto-refund in ${formatCountdown(remaining)}`}
      </button>
      <Modal
        open={open}
        onClose={() => !mut.isPending && setOpen(false)}
        title="Auto-refund escrow"
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)} disabled={mut.isPending}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={handle}
              disabled={mut.isPending}
            >
              {mut.isPending ? (
                <>
                  <span className="tx-spinner" /> Refunding…
                </>
              ) : (
                "Confirm auto-refund"
              )}
            </button>
          </>
        }
      >
        <p className="text-[13px] text-text-dim leading-relaxed m-0">
          The builder didn't submit within the deadline. You can now claim the full ₳{job.budget} back unilaterally. No treasury cut on auto-refund. This ends the job.
        </p>
      </Modal>
    </>
  );
}

function ArbitratorTimeoutButton({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const mut = useArbitratorTimeout();

  const deadlineMs = job.arbitratorTimeoutAt
    ? job.arbitratorTimeoutAt.getTime()
    : 0;
  const nowMs = Date.now();
  const passed = deadlineMs > 0 && nowMs > deadlineMs;
  const remaining = BigInt(deadlineMs - nowMs);

  async function handle() {
    if (mut.isPending || !passed) return;
    try {
      await mut.mutateAsync({ jobId: job.id });
      setOpen(false);
    } catch { }
  }

  return (
    <>
      <button
        className="btn btn-accent w-full"
        onClick={() => setOpen(true)}
        disabled={!passed}
      >
        {passed
          ? "Trigger arbitrator timeout"
          : `Arbitrator timeout in ${formatCountdown(remaining)}`}
      </button>
      <Modal
        open={open}
        onClose={() => !mut.isPending && setOpen(false)}
        title="Trigger arbitrator timeout"
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)} disabled={mut.isPending}>
              Cancel
            </button>
            <button
              className="btn btn-accent"
              onClick={handle}
              disabled={mut.isPending}
            >
              {mut.isPending ? (
                <>
                  <span className="tx-spinner" /> Submitting…
                </>
              ) : (
                "Confirm"
              )}
            </button>
          </>
        }
      >
        <p className="text-[13px] text-text-dim leading-relaxed m-0">
          The arbitrator hasn't resolved this dispute within 14 days. The dispute now defaults in favor of whoever raised it (you). The escrow will be distributed and reputation counters updated accordingly.
        </p>
      </Modal>
    </>
  );
}