/**
 * IPFS via Pinata.
 *
 * Pin: uploads to Pinata's pinning service, returns the CID.
 * Fetch: reads from a public IPFS gateway (default: Pinata's).
 *
 * The Pinata JWT is exposed to the browser bundle, which is a known
 * trade-off for hackathon-scale apps. For production, route pins through
 * a serverless function that holds the JWT.
 */

import { env } from "@/config/env";

export interface JobDescription {
  title: string;
  description: string;
  category: string;
  skills: string[];
  attachments?: { name: string; cid: string }[];
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
 */
export async function pinJson<T>(
  obj: T,
  opts: { name?: string } = {},
): Promise<string> {
  const jwt = requireJwt();
  const res = await fetch(`${PINATA_API}/pinning/pinJSONToIPFS`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      pinataContent: obj,
      pinataMetadata: opts.name ? { name: opts.name } : undefined,
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
 */
export async function fetchJson<T>(cid: string): Promise<T> {
  const url = `${env.pinataGateway.replace(/\/$/, "")}/${cid}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new IpfsError(`Fetch failed (${res.status}) for CID ${cid}`);
  }
  return (await res.json()) as T;
}

/** Generic gateway URL for direct browser viewing. */
export function gatewayUrl(cid: string): string {
  return `${env.pinataGateway.replace(/\/$/, "")}/${cid}`;
}

// ────────────────────────────────────────────────────────────────────────
// CID validation
// ────────────────────────────────────────────────────────────────────────

/**
 * Loose-but-useful CID format check.
 *
 * Validates the structural shape — character set, length window — without
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
  // Bitcoin's base58 (no 0/O/I/l) — safe approximation.
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

// ────────────────────────────────────────────────────────────────────────
// Pin-by-CID (for client-side persistence of submissions)
// ────────────────────────────────────────────────────────────────────────

/**
 * Pin an existing CID by reference (not file upload). Used when a client
 * wants to ensure a builder's submission stays available — they pin the
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

// ────────────────────────────────────────────────────────────────────────
// Folder listings (for multi-file submissions)
// ────────────────────────────────────────────────────────────────────────

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
