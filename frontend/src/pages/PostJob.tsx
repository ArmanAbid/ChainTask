// PostJob - pin the description to IPFS then submit the postJob tx.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@/hooks/useWallet";
import { Ada } from "@/components/atoms";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/Icons";
import { Avatar } from "@/components/atoms";
import { PROTOCOL_PARAMS } from "@/config/protocol";
import { pinJson, IpfsError } from "@/lib/ipfs";
import { usePostJob } from "@/hooks/useTx";
import { useProfile } from "@/hooks/useQueries";
import { pushToast } from "@/components/Toasts";
import { env } from "@/config/env";
import { truncateAddress } from "@/lib/format";
import type { JobDescription } from "@/lib/ipfs";

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 2000;
const MAX_CATEGORY = 16; // matches max_category_bytes on chain
const MAX_SKILLS = 10;
const MAX_SKILL_LEN = 24;

export default function PostJob() {
  const w = useWallet();
  if (w.status !== "connected") {
    return (
      <div className="max-w-[720px] mx-auto px-8 py-12">
        <EmptyState
          icon={<Icons.wallet className="w-5 h-5" />}
          title="Connect a wallet"
          description="Connect your Cardano wallet to post a job."
        />
      </div>
    );
  }
  return <PostJobForm clientAddress={w.address} />;
}

function PostJobForm({ clientAddress }: { clientAddress: string }) {
  const navigate = useNavigate();
  const postJobMut = usePostJob();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [budgetAda, setBudgetAda] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [arbitratorAddress, setArbitratorAddress] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("14");
  const [pinning, setPinning] = useState(false);

  // ── Validation ──
  const titleError =
    title.length === 0
      ? "Required"
      : title.length > MAX_TITLE
        ? `Max ${MAX_TITLE} characters`
        : null;
  const descError =
    description.length === 0
      ? "Required"
      : description.length > MAX_DESCRIPTION
        ? `Max ${MAX_DESCRIPTION} characters`
        : null;
  const categoryError =
    category.length === 0
      ? "Required"
      : new TextEncoder().encode(category).length > MAX_CATEGORY
        ? `Max ${MAX_CATEGORY} bytes (on-chain field)`
        : null;
  const budgetNum = Number(budgetAda);
  const budgetError = !budgetAda
    ? "Required"
    : Number.isNaN(budgetNum) || budgetNum <= 0
      ? "Must be a positive number"
      : budgetNum < PROTOCOL_PARAMS.minJob
        ? `Minimum is ₳${PROTOCOL_PARAMS.minJob}`
        : null;
  const arbitratorError = validateArbitrator(arbitratorAddress, clientAddress);

  const deadlineNum = Number(deadlineDays);
  const deadlineError = !deadlineDays
    ? "Required"
    : !Number.isInteger(deadlineNum) || deadlineNum <= 0
      ? "Must be a positive whole number"
      : deadlineNum > 365
        ? "Must be 365 days or fewer"
        : null;

  const formValid =
    !titleError &&
    !descError &&
    !categoryError &&
    !budgetError &&
    !arbitratorError &&
    !deadlineError;

  const submitting = pinning || postJobMut.isPending;

  function addSkill() {
    const s = skillInput.trim();
    if (!s) return;
    if (s.length > MAX_SKILL_LEN) return;
    if (skills.includes(s)) return;
    if (skills.length >= MAX_SKILLS) return;
    setSkills([...skills, s]);
    setSkillInput("");
  }
  function removeSkill(s: string) {
    setSkills(skills.filter((x) => x !== s));
  }

  async function handleSubmit() {
    if (!formValid || submitting) return;

    // 1. Pin to IPFS first. Wallet won't see the tx until this succeeds.
    setPinning(true);
    let jobCid: string;
    try {
      const desc: JobDescription = {
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        skills,
        deadlineDays: deadlineNum,
      };
      jobCid = await pinJson(desc, {
        name: `chaintask-job-${title.trim().slice(0, 40)}`,
      });
    } catch (e) {
      setPinning(false);
      const msg =
        e instanceof IpfsError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Failed to pin job description to IPFS";
      pushToast(msg, "error");
      return;
    }
    setPinning(false);

    // 2. Submit the tx.
    try {
      await postJobMut.mutateAsync({
        clientAddress,
        arbitratorAddress: arbitratorAddress.trim(),
        jobCid,
        category: category.trim(),
        budgetAda: budgetNum,
      });
      // 3. Navigate to marketplace where the new job will appear after
      //    the tx confirms (~30s). useTx already pushed the success toast.
      navigate("/app/marketplace");
    } catch {
      // useTx already shows an error toast; keep the form filled so the
      // user can adjust and retry without re-entering everything.
    }
  }

  return (
    <div className="max-w-[720px] mx-auto px-8 py-8 pb-20">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-[12px] text-text-dim hover:text-text mb-6"
      >
        <Icons.arrR className="w-3.5 h-3.5 rotate-180" /> Back
      </button>

      <h1 className="text-2xl font-semibold tracking-tight mb-1">Post a job</h1>
      <p className="text-text-dim text-[13.5px] mb-8">
        Describe the work, set a budget, and lock the ADA in escrow. Funds
        release to the builder only when you approve, refund automatically
        if no submission, or resolve via arbitrator if disputed.
      </p>

      <div className="space-y-5">
        {/* Title */}
        <Field
          label="Title"
          hint={`${title.length} / ${MAX_TITLE}`}
          error={titleError}
        >
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Build a Vue dashboard for our DAO"
            disabled={submitting}
          />
        </Field>

        {/* Description */}
        <Field
          label="Description"
          hint={`${description.length} / ${MAX_DESCRIPTION}`}
          error={descError}
        >
          <textarea
            className="textarea"
            rows={8}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Scope, deliverables, timeline, acceptance criteria. The more specific, the better the proposals."
            disabled={submitting}
          />
        </Field>

        {/* Category + Budget + Timeline */}
        <div className="grid sm:grid-cols-3 gap-4">
          <Field
            label="Category"
            hint={`max ${MAX_CATEGORY} bytes`}
            error={categoryError}
          >
            <input
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="web, design…"
              maxLength={MAX_CATEGORY * 2}
              disabled={submitting}
            />
          </Field>
          <Field
            label="Budget (ADA)"
            hint={`min ₳${PROTOCOL_PARAMS.minJob}`}
            error={budgetError}
          >
            <input
              className="input"
              type="text"
              inputMode="decimal"
              value={budgetAda}
              onChange={(e) =>
                setBudgetAda(e.target.value.replace(/[^0-9.]/g, ""))
              }
              placeholder="100"
              disabled={submitting}
            />
            {budgetNum > 100 && env.network === "Mainnet" && (
              <div className="mt-2 flex items-start gap-2 p-2 bg-danger-soft border border-[oklch(0.72_0.17_25/0.35)] rounded-md text-[11.5px] text-danger leading-relaxed">
                <Icons.lock className="w-3 h-3 flex-shrink-0 mt-0.5" />
                <span>
                  Large amount on mainnet: ₳{budgetNum.toLocaleString()}. Double-check the number before posting — funds lock immediately in escrow.
                </span>
              </div>
            )}
          </Field>
          <Field
            label="Delivery (days)"
            hint="renegotiable later"
            error={deadlineError}
          >
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={deadlineDays}
              onChange={(e) =>
                setDeadlineDays(e.target.value.replace(/[^0-9]/g, ""))
              }
              placeholder="14"
              disabled={submitting}
            />
          </Field>
        </div>

        {/* Skills */}
        <Field label="Skills" hint={`${skills.length} / ${MAX_SKILLS}`}>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {skills.map((s) => (
              <span key={s} className="tag flex items-center gap-1 pr-1.5">
                {s}
                <button
                  onClick={() => removeSkill(s)}
                  className="text-text-faint hover:text-text"
                  aria-label={`Remove ${s}`}
                  disabled={submitting}
                >
                  <Icons.x className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="input"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSkill();
                }
              }}
              placeholder="Add a skill, press Enter"
              maxLength={MAX_SKILL_LEN}
              disabled={skills.length >= MAX_SKILLS || submitting}
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={addSkill}
              disabled={
                !skillInput.trim() || skills.length >= MAX_SKILLS || submitting
              }
            >
              Add
            </button>
          </div>
        </Field>

        {/* Arbitrator - team-only, no free entry */}
        <Field label="Arbitrator" error={arbitratorError}>
          {env.arbitratorAddresses.length === 0 ? (
            <div className="p-3 bg-bg-2 border border-border rounded-md text-[12px] text-danger leading-relaxed">
              No arbitrators configured. Set VITE_ARBITRATOR_ADDRESSES in
              the environment (comma-separated bech32 addresses of ChainTask
              team members) before posting jobs.
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                {env.arbitratorAddresses.map((addr) => (
                  <label
                    key={addr}
                    className={`flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${arbitratorAddress === addr
                      ? "border-accent bg-bg-2"
                      : "border-border hover:bg-bg-2"
                      }`}
                  >
                    <input
                      type="radio"
                      name="arbitrator"
                      checked={arbitratorAddress === addr}
                      onChange={() => setArbitratorAddress(addr)}
                      disabled={submitting}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <ArbitratorRow address={addr} />
                    </div>
                  </label>
                ))}
              </div>
              <div className="mt-2 text-[11.5px] text-text-faint leading-relaxed">
                Arbitrators are ChainTask team members vetted to resolve
                disputes. They only act if a dispute is raised. They cannot
                move funds otherwise.
              </div>
            </>
          )}
        </Field>

        {/* Summary card showing the on-chain cost preview */}
        <div className="card p-5 bg-bg-2">
          <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-3">
            On-chain summary
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12.5px]">
            <Summary
              label="You lock"
              value={budgetNum > 0 ? <Ada amount={budgetNum} big /> : "—"}
            />
            <Summary
              label="Builder receives on release"
              value={
                budgetNum > 0 ? (
                  <Ada
                    amount={
                      (budgetNum *
                        (100 - PROTOCOL_PARAMS.platformCutPercent)) /
                      100
                    }
                  />
                ) : (
                  "—"
                )
              }
            />
            <Summary
              label="Treasury cut"
              value={`${PROTOCOL_PARAMS.platformCutPercent}%`}
            />
            <Summary
              label="Auto-release"
              value={`${PROTOCOL_PARAMS.autoReleaseDays} days after submit`}
            />
          </div>
        </div>

        {/* Action */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate(-1)}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-accent btn-lg"
            onClick={handleSubmit}
            disabled={!formValid || submitting}
          >
            {pinning ? (
              <>
                <span className="tx-spinner" /> Pinning to IPFS…
              </>
            ) : postJobMut.isPending ? (
              <>
                <span className="tx-spinner" /> Submitting tx…
              </>
            ) : (
              <>
                <Icons.send className="w-4 h-4" /> Post job
              </>
            )}
          </button>
        </div>

        {submitting && (
          <div className="text-[11.5px] text-text-faint text-center">
            {pinning
              ? "Storing description on IPFS via Pinata…"
              : "Open your wallet to approve the transaction. The ADA is locked at the escrow script address until release or refund."}
          </div>
        )}
      </div>
    </div>
  );
}

// Field helpers

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="field-label">{label}</label>
        {hint && (
          <span className="text-[11px] text-text-faint font-mono">{hint}</span>
        )}
      </div>
      {children}
      {error && (
        <div className="text-[11.5px] text-danger mt-1.5">{error}</div>
      )}
    </div>
  );
}

function Summary({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-0.5">
        {label}
      </div>
      <div className="text-[13.5px] font-medium">{value}</div>
    </div>
  );
}

// Team-only arbitrator. Also enforces client != arbitrator client-side
// so the user gets a clear error instead of a Plutus failure.
function validateArbitrator(
  arbitrator: string,
  client: string,
): string | null {
  if (!arbitrator) return "Pick an arbitrator";
  if (!env.arbitratorAddresses.includes(arbitrator)) {
    return "Must be one of the listed arbitrators";
  }
  if (arbitrator === client) {
    return "Arbitrator must be different from your own address";
  }
  return null;
}

/**
 * Row inside the arbitrator radio list. Fetches each arbitrator's profile
 * UTxO on-chain so the client sees a real name + avatar, not just an
 * address. Falls back to truncated address if no profile is found.
 */
function ArbitratorRow({ address }: { address: string }) {
  const { data: profile } = useProfile(address);
  const displayName =
    profile?.content?.displayName ?? truncateAddress(address);
  const initial = (displayName[0] || "?").toUpperCase();
  return (
    <div className="flex items-center gap-2.5">
      {profile?.content?.avatarCid ? (
        <Avatar name={initial} src={profile.content.avatarCid} />
      ) : (
        <Avatar name={initial} />
      )}
      <div className="min-w-0">
        <div className="text-[13px] font-medium truncate">{displayName}</div>
        <div className="text-[11px] text-text-faint font-mono truncate">
          {truncateAddress(address)}
        </div>
      </div>
    </div>
  );
}