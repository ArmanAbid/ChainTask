/**
 * MyProfile — your own profile view + edit form.
 *
 * Reuses PublicProfile's "view" sections for the connected wallet, plus
 * an edit panel that:
 *   - Lets you set display name, bio, avatar
 *   - Pins to IPFS via Pinata
 *   - Stores the new CID as a draft in localStorage (Week 6) — will become
 *     a real Cardano tx in Week 7
 *
 * The draft fallback means the entire profile UX works end-to-end NOW,
 * before the profile validator is deployed. When Week 7 lands and the
 * validator is on testnet, `saveDraftProfile` is replaced with `submitProfileTx`
 * and the rest of the UI stays put.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@/hooks/useWallet";
import { useProfile, useReputation } from "@/hooks/useQueries";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/atoms";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/Icons";
import { formatAda, formatRelative, truncateAddress } from "@/lib/format";
import {
  cidByteLength,
  gatewayUrl,
  IpfsError,
  pinFile,
  pinJson,
} from "@/lib/ipfs";
import { saveDraftProfile } from "@/lib/data/profile";
import { pushToast } from "@/components/Toasts";
import { env } from "@/config/env";
import { useUpdateProfile } from "@/hooks/useTx";
import type { ProfileContent } from "@/types/domain";

export default function MyProfile() {
  const w = useWallet();
  if (w.status !== "connected") {
    return (
      <div className="max-w-[720px] mx-auto px-8 py-12">
        <EmptyState
          icon={<Icons.wallet className="w-5 h-5" />}
          title="Connect a wallet"
          description="Connect your Cardano wallet to view and edit your profile."
        />
      </div>
    );
  }
  return <MyProfileContent address={w.address} />;
}

function MyProfileContent({ address }: { address: string }) {
  const { data: profile, isLoading } = useProfile(address);
  const { data: rep } = useReputation(address);

  const [editing, setEditing] = useState(false);

  return (
    <div className="max-w-[1180px] mx-auto px-8 py-8 pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
          <div className="text-text-dim text-[13.5px]">
            Self-attested name + bio. Visible to anyone who views your address.
          </div>
        </div>
        {!editing && (
          <button className="btn" onClick={() => setEditing(true)}>
            <Icons.settings className="w-4 h-4" />{" "}
            {profile?.content ? "Edit profile" : "Set up profile"}
          </button>
        )}
      </div>

      {editing ? (
        <EditPanel
          address={address}
          initial={profile?.content ?? null}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <ViewPanel
          address={address}
          profile={profile}
          isLoading={isLoading}
          rep={rep}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// View
// ────────────────────────────────────────────────────────────────────────

function ViewPanel({
  address,
  profile,
  isLoading,
  rep,
}: {
  address: string;
  profile: ReturnType<typeof useProfile>["data"];
  isLoading: boolean;
  rep: ReturnType<typeof useReputation>["data"];
}) {
  const name = profile?.content?.displayName?.trim();
  const avatarSrc = profile?.content?.avatarCid
    ? gatewayUrl(profile.content.avatarCid)
    : undefined;
  const isDraftOnly = profile && profile.profileCid && profile.content && !rep;
  // (heuristic: if we have profile content but no on-chain rep yet,
  //  AND contracts aren't deployed, it's likely from localStorage)

  return (
    <>
      {isDraftOnly && <DraftBanner />}
      <div className="card p-8 mb-6">
        <div className="flex items-start gap-6">
          <Avatar name={name || address} src={avatarSrc} size="xl" />
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="text-[13px] text-text-faint">Loading profile…</div>
            ) : name ? (
              <>
                <div className="text-2xl font-semibold tracking-tight">{name}</div>
                <div className="text-[12.5px] text-text-faint font-mono mt-1 break-all">
                  {address}
                </div>
              </>
            ) : (
              <>
                <div className="text-xl font-mono tracking-tight break-all">
                  {truncateAddress(address, 14, 8)}
                </div>
                <div className="text-[12px] text-text-faint mt-2">
                  You haven't set a profile yet. Set one up so clients and
                  builders see a recognizable name next to your address.
                </div>
              </>
            )}
            {profile?.content?.bio && (
              <p className="text-[13.5px] text-text-dim mt-4 leading-relaxed max-w-[640px] whitespace-pre-line">
                {profile.content.bio}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="card p-5">
          <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-3">
            Public link
          </div>
          <div className="flex items-center justify-between gap-3 text-[12.5px]">
            <span className="text-text-dim">Anyone with your address can view:</span>
            <Link
              to={`/app/profiles/${address}`}
              className="btn btn-sm"
            >
              View as public <Icons.ext className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
        <div className="card p-5">
          <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-3">
            Reputation
          </div>
          {rep ? (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Completed" value={String(rep.completedJobs)} />
              <Stat label="Volume" value={`₳${formatAda(rep.totalVolume)}`} />
              <Stat label="Withdrawals" value={String(rep.withdrawals)} />
              <Stat
                label="Disputes"
                value={`${rep.disputesWon}W · ${rep.disputesLost}L`}
              />
              {rep.firstActiveAt && (
                <div className="col-span-2 pt-2 border-t border-border">
                  <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-0.5">
                    Member since
                  </div>
                  <div className="text-[12.5px] text-text">
                    {formatRelative(rep.firstActiveAt)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[12.5px] text-text-faint">
              No reputation yet. Your reputation UTxO is created
              automatically when your first paid job releases.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DraftBanner() {
  return (
    <div className="card p-4 mb-6 border-accent-line">
      <div className="flex items-start gap-3">
        <Icons.clock className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-[13px] font-medium text-accent mb-0.5">
            Saved as draft
          </div>
          <div className="text-[12.5px] text-text-dim">
            Your profile is pinned to IPFS and visible locally. It will be
            written on-chain when the profile validator deploys (Week 7),
            making it visible to everyone.
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-0.5">
        {label}
      </div>
      <div className="text-[15px] font-mono font-medium">{value}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Edit
// ────────────────────────────────────────────────────────────────────────

const MAX_NAME = 40;
const MAX_BIO = 280;

function EditPanel({
  address,
  initial,
  onCancel,
  onSaved,
}: {
  address: string;
  initial: ProfileContent | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [avatarCid, setAvatarCid] = useState<string | undefined>(
    initial?.avatarCid,
  );
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const updateProfileMut = useUpdateProfile();

  const nameError =
    displayName.length === 0
      ? "Required"
      : displayName.length > MAX_NAME
      ? `Max ${MAX_NAME} characters`
      : null;
  const bioError = bio.length > MAX_BIO ? `Max ${MAX_BIO} characters` : null;

  async function handleAvatar(file: File) {
    if (!file.type.startsWith("image/")) {
      pushToast("Avatar must be an image", "error");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      pushToast("Avatar must be under 2 MB", "error");
      return;
    }
    setAvatarUploading(true);
    try {
      const cid = await pinFile(file);
      setAvatarCid(cid);
      pushToast("Avatar uploaded", "success");
    } catch (e) {
      const msg = e instanceof IpfsError ? e.message : "Upload failed";
      pushToast(msg, "error");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSave() {
    if (nameError || bioError) return;
    setSaving(true);
    try {
      const content: ProfileContent = {
        displayName: displayName.trim(),
        ...(bio.trim() ? { bio: bio.trim() } : {}),
        ...(avatarCid ? { avatarCid } : {}),
      };
      const cid = await pinJson(content, { name: `chaintask-profile-${address}` });
      const cidLen = cidByteLength(cid);
      if (cidLen > 64) {
        throw new IpfsError(
          `CID is ${cidLen} bytes — too long for the on-chain field (max 64). This usually means the IPFS pinning service returned an unusual format.`,
        );
      }

      if (env.contractsDeployed) {
        // On-chain path: submit the UpdateProfile tx (or lazy-create the
        // profile UTxO if none exists yet). The mutation's onSuccess
        // invalidates the profile query; we just need to wait for the
        // tx to be submitted before closing the form.
        await updateProfileMut.mutateAsync({
          ownerAddress: address,
          profileCid: cid,
        });
      } else {
        // Pre-deploy: fall back to localStorage draft.
        saveDraftProfile(address, cid, content);
        queryClient.invalidateQueries({ queryKey: ["profile", address] });
        pushToast("Profile saved as draft", "success");
      }
      onSaved();
    } catch (e) {
      const msg = e instanceof IpfsError ? e.message : e instanceof Error ? e.message : "Save failed";
      pushToast(msg, "error");
    } finally {
      setSaving(false);
    }
  }

  const avatarSrc = avatarCid ? gatewayUrl(avatarCid) : undefined;

  return (
    <div className="card p-6 max-w-[640px]">
      <h2 className="text-[15px] font-medium mb-1">Edit profile</h2>
      <p className="text-[12px] text-text-dim mb-6">
        Saved as a draft until contracts deploy. The display name and bio you
        enter here are visible to anyone who looks up your address.
      </p>

      <div className="flex flex-col gap-5">
        {/* Avatar */}
        <div>
          <div className="field-label mb-2">Avatar</div>
          <div className="flex items-center gap-4">
            <Avatar
              name={displayName || address}
              src={avatarSrc}
              size="lg"
            />
            <label className="btn btn-sm cursor-pointer">
              {avatarUploading ? (
                <>
                  <span className="tx-spinner" /> Uploading…
                </>
              ) : (
                <>
                  <Icons.plus className="w-3.5 h-3.5" />{" "}
                  {avatarCid ? "Replace" : "Upload"}
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={avatarUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAvatar(f);
                  e.target.value = "";
                }}
              />
            </label>
            {avatarCid && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setAvatarCid(undefined)}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Name */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="field-label">Display name</label>
            <span className="text-[11px] text-text-faint font-mono">
              {displayName.length} / {MAX_NAME}
            </span>
          </div>
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Alice Builder"
          />
          {nameError && (
            <div className="text-[11.5px] text-danger mt-1.5">{nameError}</div>
          )}
        </div>

        {/* Bio */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="field-label">Bio</label>
            <span className="text-[11px] text-text-faint font-mono">
              {bio.length} / {MAX_BIO}
            </span>
          </div>
          <textarea
            className="textarea"
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short description. Skills, focus areas, anything that helps clients pick you."
          />
          {bioError && (
            <div className="text-[11.5px] text-danger mt-1.5">{bioError}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
          <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-accent"
            onClick={handleSave}
            disabled={saving || !!nameError || !!bioError || avatarUploading}
          >
            {saving ? (
              <>
                <span className="tx-spinner" /> Saving…
              </>
            ) : (
              <>
                <Icons.check className="w-4 h-4" /> Save profile
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
