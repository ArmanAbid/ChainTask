/**
 * Settings — account preferences, notifications, on-chain config.
 *
 * Sections:
 *   1. Account — display name + bio (inline edit, calls updateProfile on chain)
 *   2. Wallet — current wallet info + disconnect
 *   3. Notifications — local-storage-backed toggle preferences (off-chain UI state)
 *   4. On-chain config — read-only display of GlobalConfig from env + protocol constants
 *   5. Danger zone — disconnect wallet
 *
 * Nothing in this page reads mock data. Profile writes go through the
 * existing useUpdateProfile mutation which submits the tx on chain.
 */

import { useEffect, useState } from "react";
import { PROTOCOL_PARAMS } from "@/config/protocol";
import { env } from "@/config/env";
import { useWallet } from "@/hooks/useWallet";
import { useProfile } from "@/hooks/useQueries";
import { useUpdateProfile } from "@/hooks/useTx";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/Icons";
import { pushToast } from "@/components/Toasts";
import { truncateAddress } from "@/lib/format";
import { pinJson } from "@/lib/ipfs";

const LS_NOTIF_PREFIX = "chaintask:notif:";

const NOTIF_ITEMS: Array<{ id: string; label: string; defaultOn: boolean }> = [
  { id: "new-proposal", label: "New proposals on your jobs", defaultOn: true },
  { id: "work-submitted", label: "Builder submitted work", defaultOn: true },
  { id: "auto-release-soon", label: "Approaching auto-release deadline", defaultOn: true },
  { id: "dispute-raised", label: "Dispute raised", defaultOn: true },
  { id: "tx-confirmed", label: "On-chain tx confirmed", defaultOn: true },
];

export default function Settings() {
  const w = useWallet();

  if (w.status !== "connected") {
    return (
      <div className="max-w-[720px] mx-auto px-8 py-12">
        <EmptyState
          icon={<Icons.wallet className="w-5 h-5" />}
          title="Connect a wallet"
          description="Connect your Cardano wallet to see and edit settings."
        />
      </div>
    );
  }
  return <SettingsBody address={w.address} />;
}

function SettingsBody({
  address,
}: {
  address: string;
}) {
  const { data: profile } = useProfile(address);
  const updateMut = useUpdateProfile();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarCid, setAvatarCid] = useState<string | undefined>(undefined);
  const [pinning, setPinning] = useState(false);

  // Sync form with fetched profile whenever it loads/changes.
  useEffect(() => {
    if (profile?.content) {
      setName(profile.content.displayName ?? "");
      setBio(profile.content.bio ?? "");
      setAvatarCid(profile.content.avatarCid);
    }
  }, [profile]);

  const nameErr =
    name.trim().length === 0
      ? "Required"
      : name.length > 60
        ? "Max 60 chars"
        : null;
  const bioErr = bio.length > 400 ? "Max 400 chars" : null;
  const valid = !nameErr && !bioErr;
  const busy = pinning || updateMut.isPending;

  async function saveProfile() {
    if (!valid || busy) return;

    // 1. Pin the profile JSON to IPFS.
    setPinning(true);
    let profileCid: string;
    try {
      profileCid = await pinJson(
        {
          displayName: name.trim(),
          bio: bio.trim() || undefined,
          avatarCid,
        },
        { name: `chaintask-profile-${address.slice(-8)}` },
      );
    } catch (e) {
      setPinning(false);
      pushToast(
        e instanceof Error ? e.message : "IPFS pin failed",
        "error",
      );
      return;
    }
    setPinning(false);

    // 2. Submit the updateProfile tx with the CID.
    try {
      await updateMut.mutateAsync({
        ownerAddress: address,
        profileCid,
      });
    } catch {
      // useUpdateProfile already pushes error toast
    }
  }

  return (
    <div className="max-w-[880px] mx-auto px-8 py-8 pb-20">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">
          Settings
        </h1>
        <div className="text-text-dim text-[13.5px]">
          Account · notifications · on-chain config
        </div>
      </div>

      <div className="grid lg:grid-cols-[200px_1fr] gap-6 items-start">
        {/* Sidebar nav */}
        <nav className="flex flex-col gap-0.5 lg:sticky lg:top-4">
          {[
            { id: "account", t: "Account" },
            { id: "wallet", t: "Wallet" },
            { id: "notifs", t: "Notifications" },
            { id: "contract", t: "On-chain config" },
            { id: "danger", t: "Danger zone", danger: true },
          ].map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className={`block px-3 py-2 rounded-md text-[13px] no-underline transition-colors ${n.danger
                  ? "text-danger mt-3.5 hover:bg-surface"
                  : "text-text-dim hover:bg-surface hover:text-text"
                }`}
            >
              {n.t}
            </a>
          ))}
        </nav>

        <div className="flex flex-col gap-5">
          {/* Account */}
          <Section
            id="account"
            title="Account"
            sub="Public profile. Written to your Profile UTxO on chain when you save."
          >
            <div className="grid sm:grid-cols-2 gap-3.5">
              <Field label="Display name" error={nameErr}>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  maxLength={60}
                />
              </Field>
              <Field label="Address">
                <div className="input flex items-center font-mono text-[12.5px] text-text-dim bg-bg-2">
                  {truncateAddress(address)}
                </div>
              </Field>
              <Field label="Bio" className="sm:col-span-2" error={bioErr}>
                <textarea
                  className="textarea"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Short bio for your profile."
                  disabled={busy}
                  maxLength={400}
                />
                <div className="text-[11px] text-text-faint text-right mt-1">
                  {bio.length}/400
                </div>
              </Field>
            </div>
            <div className="flex justify-end mt-3.5">
              <button
                className="btn btn-primary"
                onClick={saveProfile}
                disabled={!valid || busy}
              >
                {pinning ? (
                  <>
                    <span className="tx-spinner" /> Pinning…
                  </>
                ) : updateMut.isPending ? (
                  <>
                    <span className="tx-spinner" /> Saving…
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </Section>

          {/* Wallet */}
          <Section
            id="wallet"
            title="Wallet"
            sub="Cardano wallet currently connected via CIP-30."
          >
            <div className="flex items-center gap-3.5 py-3.5">
              <span className="w-9 h-9 rounded-md bg-surface-2 border border-border inline-flex items-center justify-center font-mono font-semibold">
                W
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  Connected{" "}
                  <span className="inline-flex items-center gap-1.5 ml-2 text-[11.5px] text-success">
                    <span className="w-[7px] h-[7px] rounded-full bg-success" />{" "}
                    {env.network}
                  </span>
                </div>
                <div className="font-mono text-[11.5px] text-text-faint mt-0.5 break-all">
                  {address}
                </div>
              </div>
            </div>
          </Section>

          {/* Notifications */}
          <Section
            id="notifs"
            title="Notifications"
            sub="In-app alerts. Preferences saved locally to this browser."
          >
            <div className="border-t border-border">
              {NOTIF_ITEMS.map((item) => (
                <NotifRow key={item.id} item={item} />
              ))}
            </div>
          </Section>

          {/* On-chain config */}
          <Section
            id="contract"
            title="On-chain config"
            sub="Read-only. Values are enforced by the escrow validator and read from GlobalConfig at tx time."
          >
            <dl className="grid grid-cols-[max-content_1fr] gap-y-2.5 gap-x-6 text-[12.5px]">
              <dt className="text-text-faint">Network</dt>
              <dd className="m-0 text-text font-mono">{env.network}</dd>
              <dt className="text-text-faint">Escrow script</dt>
              <dd className="m-0 text-text font-mono break-all">
                {env.escrowScriptAddress || "—"}
              </dd>
              <dt className="text-text-faint">Reputation script</dt>
              <dd className="m-0 text-text font-mono break-all">
                {env.reputationScriptAddress || "—"}
              </dd>
              <dt className="text-text-faint">Profile script</dt>
              <dd className="m-0 text-text font-mono break-all">
                {env.profileScriptAddress || "—"}
              </dd>
              <dt className="text-text-faint">GlobalConfig ref</dt>
              <dd className="m-0 text-text font-mono break-all">
                {env.globalConfigOutRef || "—"}
              </dd>
              <dt className="text-text-faint">Platform cut</dt>
              <dd className="m-0 text-text font-mono">
                {PROTOCOL_PARAMS.platformCutPercent}%
              </dd>
              <dt className="text-text-faint">Dispute fee</dt>
              <dd className="m-0 text-text font-mono">
                ₳{PROTOCOL_PARAMS.disputeFee}
              </dd>
              <dt className="text-text-faint">Auto-release</dt>
              <dd className="m-0 text-text font-mono">
                {PROTOCOL_PARAMS.autoReleaseDays} days
              </dd>
              <dt className="text-text-faint">Auto-refund</dt>
              <dd className="m-0 text-text font-mono">
                {PROTOCOL_PARAMS.autoRefundDays} days
              </dd>
              <dt className="text-text-faint">Treasury</dt>
              <dd className="m-0 text-text font-mono break-all">
                {env.treasuryAddress || "—"}
              </dd>
              <dt className="text-text-faint">Arbitrators</dt>
              <dd className="m-0 text-text font-mono break-all">
                {env.arbitratorAddresses.length === 0
                  ? "—"
                  : env.arbitratorAddresses
                    .map((a) => truncateAddress(a))
                    .join(", ")}
              </dd>
            </dl>
          </Section>

          {/* Danger zone */}
          <Section
            id="danger"
            title="Danger zone"
            sub="Account-level destructive actions."
            dangerBorder
          >
            <div className="flex items-center gap-4 py-3.5">
              <div className="flex-1">
                <div className="font-medium text-[13.5px]">
                  Disconnect wallet
                </div>
                <div className="text-[12px] text-text-faint">
                  Disconnect this app from your Cardano wallet using the wallet extension (Eternl, Lace, Nami, Yoroi). Your on-chain data (profile, jobs, reputation) is unaffected — reconnect any time.
                </div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  sub,
  dangerBorder,
  children,
}: {
  id: string;
  title: string;
  sub: string;
  dangerBorder?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={`card card-pad ${dangerBorder ? "border-[oklch(0.72_0.17_25/0.35)]" : ""
        }`}
    >
      <div className="pb-3 mb-4 border-b border-border">
        <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
        <div className="text-[12.5px] text-text-dim mt-1">{sub}</div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className,
  error,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  error?: string | null;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className || ""}`}>
      <label className="field-label">{label}</label>
      {children}
      {error && <div className="text-[11px] text-danger">{error}</div>}
    </div>
  );
}

function NotifRow({
  item,
}: {
  item: { id: string; label: string; defaultOn: boolean };
}) {
  const storageKey = `${LS_NOTIF_PREFIX}${item.id}`;
  const [on, setOn] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return item.defaultOn;
      return raw === "true";
    } catch {
      return item.defaultOn;
    }
  });

  function toggle() {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {
      pushToast("Preference not saved (storage disabled)", "error");
    }
  }

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-6 py-2.5 border-b border-border last:border-b-0 text-[13px]">
      <span className="text-text-dim">{item.label}</span>
      <label className="inline-flex items-center gap-2 cursor-pointer text-text-dim text-[12px]">
        <input
          type="checkbox"
          checked={on}
          onChange={toggle}
          className="accent-accent w-3.5 h-3.5"
        />
        <span>{on ? "On" : "Off"}</span>
      </label>
    </div>
  );
}