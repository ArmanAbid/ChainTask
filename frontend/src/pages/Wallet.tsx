// Wallet - balance, locked positions, activity.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ada, Pill } from "@/components/atoms";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { useJobs } from "@/hooks/useQueries";
import { useWallet } from "@/hooks/useWallet";
import { env } from "@/config/env";
import { formatRelative } from "@/lib/format";
import { pushToast } from "@/components/Toasts";

type Activity = {
  id: string;
  jobId: string;
  jobTitle: string;
  kind: "post" | "select" | "submit" | "release" | "dispute";
  when: Date;
  amount: number | null;
};

export default function Wallet() {
  const w = useWallet();
  const { data: allJobs = [], isLoading } = useJobs();
  const navigate = useNavigate();
  const [receiveOpen, setReceiveOpen] = useState(false);

  // All hooks run on every render. When disconnected, `myAddress` is
  // undefined and the memoized filters just return empty arrays.
  const myAddress = w.status === "connected" ? w.address : undefined;
  const balanceAda = w.status === "connected" ? w.balanceAda : 0;

  const myJobs = useMemo(
    () =>
      myAddress
        ? allJobs.filter(
          (j) =>
            j.clientAddress === myAddress ||
            j.builderAddress === myAddress,
        )
        : [],
    [allJobs, myAddress],
  );

  const locked = useMemo(
    () =>
      myJobs.filter(
        (j) =>
          j.status === "Selected" ||
          j.status === "Submitted" ||
          j.status === "Disputed",
      ),
    [myJobs],
  );

  const lockedTotal = locked.reduce(
    (s, j) => s + (j.clientAddress === myAddress ? j.budget : 0),
    0,
  );

  const activity: Activity[] = useMemo(() => {
    if (!myAddress) return [];
    const acts: Activity[] = [];
    for (const j of myJobs) {
      if (j.clientAddress === myAddress) {
        acts.push({
          id: `${j.id}-post`,
          jobId: j.id,
          jobTitle: j.title,
          kind: "post",
          when: j.createdAt,
          amount: null,
        });
      }
      if (j.selectedAt && (j.clientAddress === myAddress || j.builderAddress === myAddress)) {
        acts.push({
          id: `${j.id}-select`,
          jobId: j.id,
          jobTitle: j.title,
          kind: "select",
          when: j.selectedAt,
          amount: null,
        });
      }
      if (j.submittedAt && (j.clientAddress === myAddress || j.builderAddress === myAddress)) {
        acts.push({
          id: `${j.id}-submit`,
          jobId: j.id,
          jobTitle: j.title,
          kind: "submit",
          when: j.submittedAt,
          amount: null,
        });
      }
      if (j.disputeRaisedAt && (j.clientAddress === myAddress || j.builderAddress === myAddress)) {
        acts.push({
          id: `${j.id}-dispute`,
          jobId: j.id,
          jobTitle: j.title,
          kind: "dispute",
          when: j.disputeRaisedAt,
          amount: null,
        });
      }
    }
    return acts.sort((a, b) => b.when.getTime() - a.when.getTime()).slice(0, 20);
  }, [myJobs, myAddress]);

  if (w.status !== "connected" || !myAddress) {
    return (
      <div className="max-w-[720px] mx-auto px-8 py-12">
        <EmptyState
          icon={<Icons.wallet className="w-5 h-5" />}
          title="Connect a wallet"
          description="Connect your Cardano wallet to see your balance and activity."
        />
      </div>
    );
  }

  async function copyAddress() {
    if (!myAddress) return;
    try {
      await navigator.clipboard.writeText(myAddress);
      pushToast("Address copied", "success");
    } catch {
      pushToast("Copy failed — long-press to select", "error");
    }
  }

  return (
    <div className="max-w-[1180px] mx-auto px-8 py-8 pb-20">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">
            Wallet
          </h1>
          <div className="text-text-dim text-[13.5px]">
            {env.network} · connected via wallet extension
          </div>
        </div>
        <button className="btn" onClick={() => setReceiveOpen(true)}>
          <Icons.copy className="w-3.5 h-3.5" /> Receive
        </button>
      </div>

      {/* Balance card */}
      <div className="card p-0 overflow-hidden">
        <div className="card-pad bg-[radial-gradient(800px_300px_at_0%_0%,oklch(0.78_0.13_215/0.14),transparent_60%)]">
          <div className="text-[11.5px] uppercase tracking-wider text-text-faint">
            Total balance
          </div>
          <div className="text-[42px] font-semibold tracking-tight mt-1 font-mono tabular-nums">
            <span className="text-accent mr-1">₳</span>
            {balanceAda.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="text-[13px] text-text-dim mt-0.5">
            {env.network === "Mainnet"
              ? "Mainnet ADA · real value"
              : "Preview testnet ADA · use faucet to top up"}
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-border">
          <Cell
            label="Available"
            val={<Ada amount={balanceAda} big={false} />}
            sub="spendable now"
          />
          <Cell
            label="Locked in escrow"
            val={<Ada amount={lockedTotal} big={false} />}
            sub={`across ${locked.filter((j) => j.clientAddress === myAddress).length
              } job${locked.length === 1 ? "" : "s"}`}
            accent
          />
          <Cell
            label="Network"
            val={env.network}
            sub="Cardano"
            last
          />
        </div>
      </div>

      {/* Receive address card */}
      <div className="card card-pad mt-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] uppercase tracking-wider text-text-faint mb-1.5">
              Receive address
            </div>
            <div className="font-mono text-[13px] text-text-dim break-all">
              {myAddress}
            </div>
          </div>
          <button className="btn btn-sm" onClick={copyAddress}>
            <Icons.copy className="w-3.5 h-3.5" /> Copy
          </button>
        </div>
      </div>

      {/* Locked positions */}
      <h3 className="text-[14px] uppercase tracking-wider text-text-faint font-medium mt-8 mb-3">
        Locked positions
      </h3>
      <div className="card p-0">
        {isLoading ? (
          <div className="text-center py-10 text-[13px] text-text-faint">
            Reading from chain…
          </div>
        ) : locked.length === 0 ? (
          <div className="text-center py-10 px-6">
            <div className="text-[14px] text-text mb-1">
              No locked positions
            </div>
            <div className="text-[13px] text-text-dim">
              When you post a job or a builder is selected on your job, the
              escrow shows up here.
            </div>
          </div>
        ) : (
          locked.map((j) => (
            <div
              key={j.id}
              className="flex items-center gap-3 p-5 border-b border-border last:border-b-0 hover:bg-surface cursor-pointer"
              onClick={() =>
                navigate(`/app/jobs/${encodeURIComponent(j.id)}`)
              }
            >
              <span className="w-7 h-7 rounded-md bg-accent-soft border border-accent-line text-accent inline-flex items-center justify-center flex-shrink-0">
                <Icons.lock className="w-3.5 h-3.5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium truncate">
                  {j.title || "Untitled"}
                </div>
                <div className="flex items-center gap-2 text-[11.5px] text-text-faint mt-0.5">
                  <span className="font-mono truncate">
                    {j.id.slice(0, 16)}…
                  </span>
                  <span>·</span>
                  <Pill status={j.status} />
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <Ada amount={j.budget} />
                <div className="text-[11px] text-text-faint mt-0.5">
                  {j.clientAddress === myAddress ? "as client" : "as builder"}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Activity */}
      <h3 className="text-[14px] uppercase tracking-wider text-text-faint font-medium mt-8 mb-3">
        On-chain activity
      </h3>
      <div className="card p-0">
        {isLoading ? (
          <div className="text-center py-10 text-[13px] text-text-faint">
            Reading from chain…
          </div>
        ) : activity.length === 0 ? (
          <div className="text-center py-10 px-6">
            <div className="text-[14px] text-text mb-1">No activity yet</div>
            <div className="text-[13px] text-text-dim">
              Post a job or apply to one — your on-chain events land here.
            </div>
          </div>
        ) : (
          activity.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 p-5 border-b border-border last:border-b-0 hover:bg-surface cursor-pointer"
              onClick={() =>
                navigate(`/app/jobs/${encodeURIComponent(t.jobId)}`)
              }
            >
              <ActivityIcon kind={t.kind} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px]">
                  <span className="text-text-dim">You</span>{" "}
                  <span className="text-text">
                    {t.kind === "post"
                      ? "posted a job"
                      : t.kind === "select"
                        ? "selected a builder"
                        : t.kind === "submit"
                          ? "submitted work"
                          : t.kind === "release"
                            ? "released funds"
                            : "raised a dispute"}
                  </span>
                </div>
                <div className="text-[11.5px] text-text-faint mt-0.5 truncate">
                  {t.jobTitle}
                </div>
              </div>
              <span className="text-[11.5px] text-text-faint font-mono min-w-[80px] text-right">
                {formatRelative(t.when)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Receive modal */}
      <Modal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="Receive ADA"
        subtitle={
          env.network === "Mainnet"
            ? "Share this address to receive ADA"
            : "Share this address to receive tADA on Preview testnet"
        }
        footer={
          <>
            <button className="btn" onClick={() => setReceiveOpen(false)}>
              Close
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                copyAddress();
                setReceiveOpen(false);
              }}
            >
              <Icons.copy className="w-3.5 h-3.5" /> Copy address
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <div className="card p-4 bg-bg-2">
            <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-2">
              Your address
            </div>
            <div className="font-mono text-[12px] break-all leading-relaxed">
              {myAddress}
            </div>
          </div>
          <div className="flex items-start gap-2 p-2.5 bg-bg-2 border border-border rounded-md text-[12px] text-text-dim">
            <Icons.lock className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <span>
              Need Preview tADA? Get some from the{" "}
              <a
                href="https://docs.cardano.org/cardano-testnets/tools/faucet"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Cardano faucet
              </a>
              . Send to the address above.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Cell({
  label,
  val,
  sub,
  accent,
  last,
}: {
  label: string;
  val: React.ReactNode;
  sub?: string;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`p-3.5 ${last ? "" : "border-r border-border"}`}>
      <div className="text-[11.5px] uppercase tracking-wider text-text-faint">
        {label}
      </div>
      <div
        className={`text-base font-semibold mt-1 ${accent ? "text-accent" : ""}`}
      >
        {val}
      </div>
      {sub && (
        <div className="text-[11.5px] mt-0.5 text-text-faint">{sub}</div>
      )}
    </div>
  );
}

function ActivityIcon({ kind }: { kind: Activity["kind"] }) {
  const cls = "w-[26px] h-[26px] rounded-full inline-flex items-center justify-center font-mono text-[10px] font-bold flex-shrink-0";
  if (kind === "release") {
    return (
      <span
        className={`${cls} bg-success-soft border border-[oklch(0.80_0.14_155/0.4)] text-success`}
      >
        ↑
      </span>
    );
  }
  if (kind === "dispute") {
    return (
      <span
        className={`${cls} bg-danger-soft border border-[oklch(0.72_0.17_25/0.4)] text-danger`}
      >
        !
      </span>
    );
  }
  return (
    <span className={`${cls} bg-surface-2 border border-border text-text-faint`}>
      {kind === "post" ? "+" : kind === "submit" ? "✓" : "·"}
    </span>
  );
}