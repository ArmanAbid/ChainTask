/**
 * Profile data access.
 *
 * Source of truth: profile validator UTxOs on chain. The on-chain datum
 * carries only the IPFS CID; actual content (display name, bio, avatar)
 * is fetched from IPFS.
 *
 * STATUS (Week 6): The chain read returns null because contracts aren't
 * deployed yet. The IPFS read works against any pinned content. The
 * "save profile" flow has two paths:
 *
 *   - **Production** (contracts deployed): pin to IPFS → build a tx that
 *     either creates or updates the Profile UTxO → user signs → tx
 *     submits → on confirm, refetch.
 *   - **Draft mode** (contracts not deployed yet): pin to IPFS, store
 *     the resulting CID + content in localStorage. The Profile screen
 *     reads from localStorage. This lets you build and test the full
 *     UX end-to-end before Week 7's deploy.
 *
 * Either path leaves us in the same state at the end (CID points at the
 * latest profile JSON on IPFS); the only difference is whether the CID
 * is recorded on-chain or in localStorage.
 */

import { env } from "@/config/env";
import { blockfrost } from "@/lib/cardano/blockfrost";
import { toProfileUtxo } from "@/lib/cardano/decoders";
import { fetchJson } from "@/lib/ipfs";
import type { Profile, ProfileContent } from "@/types/domain";
import type { ProfileUtxo } from "@/types/onchain";

// ────────────────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────────────────

/**
 * Fetch a profile by owner address. Returns null if the address has no
 * profile UTxO yet (the common case — profiles are lazily created).
 *
 * When contracts aren't deployed, falls back to localStorage so the
 * editing flow works end-to-end during the hackathon.
 */
export async function getProfileByOwner(
  ownerAddress: string,
): Promise<Profile | null> {
  if (env.contractsDeployed && env.profileScriptAddress) {
    const utxos = await blockfrost.utxosAtAddress(env.profileScriptAddress);
    const profiles = utxos
      .map(toProfileUtxo)
      .filter((u): u is ProfileUtxo => u !== null);
    // If multiple UTxOs exist for the same owner, pick the most recent.
    // Convention: the latest tx_hash wins. (The validator doesn't enforce
    // uniqueness; a future cleanup tx can collapse duplicates.)
    const match = profiles
      .filter((p) => p.datum.ownerAddress === ownerAddress)
      .pop();
    if (match) return resolveProfile(match);
  }
  return readDraftProfile(ownerAddress);
}

/**
 * Hydrate a profile UTxO with its off-chain content.
 *
 * If the IPFS fetch fails (gateway down, content not pinned anymore, etc.)
 * we still return a Profile with `content: null` rather than throwing —
 * the UI can fall back to showing just the address.
 */
async function resolveProfile(p: ProfileUtxo): Promise<Profile> {
  const content = await fetchJson<ProfileContent>(p.datum.profileCid).catch(
    () => null,
  );
  return {
    ownerAddress: p.datum.ownerAddress,
    profileCid: p.datum.profileCid,
    content,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Draft storage (Week 6 only — replaced by real tx flow in Week 7)
// ────────────────────────────────────────────────────────────────────────

const DRAFT_KEY_PREFIX = "chaintask:profile-draft:";

interface DraftProfile {
  profileCid: string;
  content: ProfileContent;
}

function draftKey(owner: string): string {
  return `${DRAFT_KEY_PREFIX}${owner}`;
}

/**
 * Read a locally-saved draft profile if one exists for this owner.
 * Used as a fallback when contracts aren't deployed.
 */
function readDraftProfile(ownerAddress: string): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(ownerAddress));
    if (!raw) return null;
    const draft = JSON.parse(raw) as DraftProfile;
    return {
      ownerAddress,
      profileCid: draft.profileCid,
      content: draft.content,
    };
  } catch {
    return null;
  }
}

/**
 * Save a draft profile to localStorage.
 *
 * In production (Week 7+), this becomes a tx submission instead. For now
 * it lets users edit their profile and see the result reflected
 * everywhere across the UI.
 */
export function saveDraftProfile(
  ownerAddress: string,
  profileCid: string,
  content: ProfileContent,
): void {
  if (typeof window === "undefined") return;
  try {
    const draft: DraftProfile = { profileCid, content };
    window.localStorage.setItem(draftKey(ownerAddress), JSON.stringify(draft));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Discard the local draft. Useful in tests, or once a profile is
 * successfully written to chain (the chain copy becomes the source of
 * truth and the draft is redundant).
 */
export function clearDraftProfile(ownerAddress: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(draftKey(ownerAddress));
  } catch {
    /* ignore */
  }
}
