// IPFS via Pinata.

import { env } from "@/config/env";

export interface JobDescription {
  title: string;
  description: string;
  category: string;
  skills: string[];
  /**
   * Off-chain delivery timeline in days, set by the client at post time
   * as a soft commitment to builders. Not enforced on chain - the
   * on-chain auto_release / auto_refund deadlines are protocol-level
   * safety nets unrelated to this field. Client and builder can later
   * renegotiate by pinning amended job descriptions and mutually
   * acknowledging (future earlier feature).
   */
  deadlineDays?: number;
  attachments?: { name: string; cid: string }[];
}

/**
 * Off-chain proposal a builder pins when applying to a job.
 *
 * Storage convention: pinned to Pinata with metadata `keyvalues`
 * `{ chaintaskType: "proposal", jobId, builderAddress }`. Clients list
 * proposals for a job by querying Pinata's /data/pinList endpoint
 * filtered on these keyvalues. Anyone running their own Pinata account
 * (or any IPFS pinning service that exposes a similar listing API) can
 * see the same set of proposals - the chain is not the source of truth
 * for proposals, but the data is fully public.
 *
 * The proposal contains no bid amount: the job budget is set by the
 * client at post time. Proposals are applications, not bids.
 */
export interface Proposal {
  type: "proposal";
  jobId: string;                  // `${txHash}#${outputIndex}`
  builderAddress: string;          // bech32
  /** Cover letter / message. */
  message: string;
  /** Optional builder estimate of delivery in days. */
  deliveryDays?: number;
  /** Off-chain timestamp (ms). The chain is the source of truth for time. */
  postedAt: number;
}

export interface WorkSubmission {
  summary: string;
  attachments: { name: string; cid: string }[];
}

export interface DisputeEvidence {
  reason: string;
  statement: string;
  attachments: { name: string; cid: string }[];
}

const PINATA_API = "https://api.pinata.cloud";

export class IpfsError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "IpfsError";
  }
}

function requireJwt(): string {
  if (!env.pinataJwt) {
    throw new IpfsError(
      "Pinata JWT not configured. Set VITE_PINATA_JWT to upload to IPFS.",
    );
  }
  return env.pinataJwt;
}

/**
 * Pin a JSON object to IPFS. Returns the CID.
 *
 * `opts.name` sets a human-readable name on the pin.
 * `opts.keyvalues` adds searchable metadata for later listing via
 *   /data/pinList. Used by the proposal system to find all proposals
 *   for a given job, and by other off-chain "registries" we may add.
 */
export async function pinJson<T>(
  obj: T,
  opts: {
    name?: string;
    keyvalues?: Record<string, string>;
  } = {},
): Promise<string> {
  const jwt = requireJwt();
  const pinataMetadata =
    opts.name || opts.keyvalues
      ? {
        ...(opts.name ? { name: opts.name } : {}),
        ...(opts.keyvalues ? { keyvalues: opts.keyvalues } : {}),
      }
      : undefined;
  const res = await fetch(`${PINATA_API}/pinning/pinJSONToIPFS`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      pinataContent: obj,
      pinataMetadata,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new IpfsError(`Pin failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { IpfsHash: string };
  return data.IpfsHash;
}

/**
 * Pin a binary file. Returns the CID.
 */
export async function pinFile(file: File): Promise<string> {
  const jwt = requireJwt();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new IpfsError(`Pin file failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { IpfsHash: string };
  return data.IpfsHash;
}

/**
 * Fetch pinned JSON by CID via the gateway.
 *
 * Uses a localStorage cache keyed by CID. Since CIDs are content-hashed,
 * the same CID always resolves to identical bytes, so the cache is safe
 * to keep indefinitely. Cuts down on Pinata rate-limit hits and speeds
 * up marketplace repeat visits from 2-5s to instant.
 *
 * If localStorage isn't available (e.g. Safari private mode with
 * quota=0) we silently fall through to the network path.
 */
export async function fetchJson<T>(cid: string): Promise<T> {
  // Try cache first.
  const cacheKey = `chaintask:ipfs:${cid}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached) as T;
  } catch {
    // Storage disabled or unavailable - fall through.
  }

  const url = `${env.pinataGateway.replace(/\/$/, "")}/${cid}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new IpfsError(`Fetch failed (${res.status}) for CID ${cid}`);
  }
  const raw = await res.text();

  // Write to cache. If storage is full or unavailable, drop silently -
  // the value is still returned to the caller.
  try {
    localStorage.setItem(cacheKey, raw);
  } catch {
    // Ignore.
  }

  return JSON.parse(raw) as T;
}

/** Generic gateway URL for direct browser viewing. */
export function gatewayUrl(cid: string): string {
  return `${env.pinataGateway.replace(/\/$/, "")}/${cid}`;
}

// CID validation

/**
 * Loose-but-useful CID format check.
 *
 * Validates the structural shape - character set, length window - without
 * pulling in a full multihash decoder. Catches the common failure modes
 * (typos, copy-paste with surrounding whitespace, markdown link
 * fragments) before they hit the chain.
 *
 * For production-grade strictness, swap to the `multiformats` library:
 *   `CID.parse(input)` will throw on anything that isn't a real CID.
 * Keeping it dependency-light for now.
 */
export function isValidCid(input: string): boolean {
  if (!input) return false;
  const s = input.trim();
  // CIDv0: starts with "Qm", 46 chars, base58 alphabet.
  // Bitcoin's base58 (no 0/O/I/l) - safe approximation.
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(s)) return true;
  // CIDv1: starts with "b" (base32 multibase prefix) + base32 lowercase.
  // Length varies with hash + codec; window 50–100 catches sane values.
  if (/^b[a-z2-7]{50,100}$/.test(s)) return true;
  // CIDv1 with base36 multibase prefix "k" (less common but valid).
  if (/^k[a-z0-9]{50,120}$/.test(s)) return true;
  return false;
}

/**
 * Length the CID will occupy on-chain (UTF-8 bytes, same as Aiken
 * ByteArray length). All our validators bound CIDs at 64 bytes.
 */
export function cidByteLength(cid: string): number {
  return new TextEncoder().encode(cid).length;
}

// Pin-by-CID (for client-side persistence of submissions)

/**
 * Pin an existing CID by reference (not file upload). Used when a client
 * wants to ensure a builder's submission stays available - they pin the
 * builder's CID under their own Pinata account so it doesn't depend on
 * the builder's pin staying alive.
 *
 * This is the "production-grade persistence" pattern: don't trust any
 * one party's pinning to keep content available.
 *
 * Returns true on success; pinByHash is idempotent on Pinata so calling
 * it multiple times is safe.
 */
export async function pinByHash(cid: string): Promise<boolean> {
  const jwt = requireJwt();
  const res = await fetch(`${PINATA_API}/pinning/pinByHash`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ hashToPin: cid }),
  });
  // Pinata returns 200 on accept-into-queue, even for already-pinned CIDs.
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new IpfsError(`Pin-by-hash failed (${res.status}): ${text}`);
  }
  return true;
}

// Folder listings (for multi-file submissions)

export interface IpfsDirEntry {
  name: string;
  cid: string;
  size: number;
  type: "file" | "dir";
}

/**
 * Probe whether a CID points to a folder. If yes, return the entries;
 * if no (it's a single file), return null.
 *
 * Uses the IPFS gateway's `?format=dag-json` query, which returns the
 * UnixFS structure. Most public gateways (including Pinata's) support this.
 *
 * Returns null on any error so callers can fall back to "treat as file."
 */
export async function listFolder(cid: string): Promise<IpfsDirEntry[] | null> {
  try {
    const base = env.pinataGateway.replace(/\/$/, "");
    const res = await fetch(`${base}/${cid}?format=dag-json`, {
      headers: { Accept: "application/vnd.ipld.dag-json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      Data?: { "/": { bytes: string } };
      Links?: { Name: string; Tsize: number; Hash: { "/": string } }[];
    };
    if (!data.Links || data.Links.length === 0) return null;
    return data.Links.map((l) => ({
      name: l.Name,
      cid: l.Hash["/"],
      size: l.Tsize,
      // Heuristic: directories typically have a trailing slash or
      // multiple sub-entries. The gateway doesn't tell us explicitly
      // without a HEAD per entry. Default to "file"; UI can show a
      // chevron and resolve on click.
      type: "file" as const,
    }));
  } catch {
    return null;
  }
}

// Off-chain proposals

const PROPOSAL_TYPE = "proposal";

/**
 * Pin a Proposal to IPFS. The Pinata metadata makes it queryable later
 * via listProposals(jobId) - that's how clients see who applied.
 */
export async function pinProposal(p: Proposal): Promise<string> {
  return pinJson(p, {
    name: `chaintask-proposal-${p.jobId.slice(0, 12)}-${p.builderAddress.slice(-8)}`,
    keyvalues: {
      chaintaskType: PROPOSAL_TYPE,
      jobId: p.jobId,
      builderAddress: p.builderAddress,
    },
  });
}

/**
 * List all proposals for a job. Queries Pinata's pinList endpoint
 * filtered on the metadata keyvalues set by pinProposal.
 *
 * Returns Proposal objects (fetched from each pin's CID) along with
 * their CIDs so the UI can link to them.
 *
 * Trust note: this implementation lists only pins on the connected
 * Pinata account's JWT. For a fully decentralized "anyone can see all
 * proposals" property you'd query multiple pinning services or run
 * your own IPFS node. Acceptable trade-off for now - bidder
 * spam is bounded by Pinata's free-tier quotas.
 */
export async function listProposals(
  jobId: string,
): Promise<Array<Proposal & { cid: string }>> {
  const jwt = requireJwt();
  // Query Pinata pinList with metadata filter. The filters JSON has to
  // be URL-encoded.
  const filters = {
    chaintaskType: { value: PROPOSAL_TYPE, op: "eq" },
    jobId: { value: jobId, op: "eq" },
  };
  const url = `${PINATA_API}/data/pinList?status=pinned&pageLimit=1000&metadata[keyvalues]=${encodeURIComponent(
    JSON.stringify(filters),
  )}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new IpfsError(`List proposals failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    rows: Array<{ ipfs_pin_hash: string }>;
  };

  // Fetch each proposal JSON in parallel. Skip ones that fail to
  // fetch / parse (might be partial pins or corruption).
  const results = await Promise.all(
    data.rows.map(async (row) => {
      try {
        const p = await fetchJson<Proposal>(row.ipfs_pin_hash);
        if (
          p.type !== PROPOSAL_TYPE ||
          p.jobId !== jobId ||
          !p.builderAddress ||
          !p.message
        ) {
          return null;
        }
        return { ...p, cid: row.ipfs_pin_hash };
      } catch {
        return null;
      }
    }),
  );

  // Drop nulls and dedupe by builder (keep most recent if a builder
  // applied twice).
  const byBuilder = new Map<string, Proposal & { cid: string }>();
  for (const p of results) {
    if (!p) continue;
    const existing = byBuilder.get(p.builderAddress);
    if (!existing || p.postedAt > existing.postedAt) {
      byBuilder.set(p.builderAddress, p);
    }
  }
  // Newest first.
  return Array.from(byBuilder.values()).sort((a, b) => b.postedAt - a.postedAt);
}