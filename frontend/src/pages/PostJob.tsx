/**
 * PostJob — form to create a new escrow.
 *
 * Form-only this week. The "Post job" button is disabled with a tooltip
 * explaining it ships in Week 7 when the contract deploys. All other
 * mechanics (validation, character counts, skill chips, IPFS pin
 * preview) work today so the form can be road-tested before going live.
 *
 * We don't pin to IPFS yet either — even though pinning is independent
 * of contracts. Reasoning: tying the pin to the tx submission keeps
 * Pinata billing tight (no orphan pins from abandoned drafts), and lets
 * us atomically attach the CID to the on-chain post.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@/hooks/useWallet";
import { Ada } from "@/components/atoms";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/Icons";
import { PROTOCOL_PARAMS } from "@/config/protocol";

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
  return <PostJobForm />;
}

function PostJobForm() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [budgetAda, setBudgetAda] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");

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

  const formValid = !titleError && !descError && !categoryError && !budgetError;

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
          />
        </Field>

        {/* Category + Budget on one row */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label="Category"
            hint={`max ${MAX_CATEGORY} bytes`}
            error={categoryError}
          >
            <input
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="web, design, ops…"
              maxLength={MAX_CATEGORY * 2}
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
            />
          </Field>
        </div>

        {/* Skills */}
        <Field
          label="Skills"
          hint={`${skills.length} / ${MAX_SKILLS}`}
        >
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {skills.map((s) => (
              <span
                key={s}
                className="tag flex items-center gap-1 pr-1.5"
              >
                {s}
                <button
                  onClick={() => removeSkill(s)}
                  className="text-text-faint hover:text-text"
                  aria-label={`Remove ${s}`}
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
              disabled={skills.length >= MAX_SKILLS}
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={addSkill}
              disabled={!skillInput.trim() || skills.length >= MAX_SKILLS}
            >
              Add
            </button>
          </div>
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
                      (budgetNum * (100 - PROTOCOL_PARAMS.platformCutPercent)) /
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
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-accent btn-lg"
            disabled
            title="Posting jobs will work when smart contracts deploy in Week 7"
          >
            <Icons.lock className="w-4 h-4" />{" "}
            {formValid ? "Post job (Week 7)" : "Post job"}
          </button>
        </div>

        <div className="text-[11.5px] text-text-faint text-center">
          Form mechanics are working. The on-chain post wires up when
          contracts deploy in Week 7.
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Field helpers
// ────────────────────────────────────────────────────────────────────────

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
