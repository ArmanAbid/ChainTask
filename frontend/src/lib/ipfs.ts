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
