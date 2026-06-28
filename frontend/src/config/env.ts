/**
 * Typed environment configuration.
 *
 * All env vars MUST be prefixed with VITE_ so Vite exposes them to the
 * browser. We validate at module load and fail loudly if anything required
 * is missing — better to crash at boot than to silently hit production
 * with a missing API key.
 */

import type { CardanoNetwork } from "@/types/domain";

interface AppEnv {
  network: CardanoNetwork;
  blockfrostProjectId: string;
  blockfrostUrl: string;
  /** Pinata JWT for IPFS pinning. Optional in some build configs. */
  pinataJwt: string | undefined;
  pinataGateway: string;
  /** When set, contract artifacts (script hashes etc.) are populated. */
  contractsDeployed: boolean;
  /** Bech32 of the escrow validator script address. Empty until deploy. */
  escrowScriptAddress: string;
  /** Bech32 of the reputation validator script address. Empty until deploy. */
  reputationScriptAddress: string;
  /** Bech32 of the profile validator script address. Empty until deploy. */
  profileScriptAddress: string;
  /** Hex policy id of the admin NFT. Empty until deploy. */
  adminPolicyId: string;
  /** Hex asset name of the admin NFT. Empty until deploy. */
  adminAssetName: string;
  /** Bech32 of the protocol treasury. Receives the platform cut on Release. */
  treasuryAddress: string;
  /**
   * `<txHash>#<outputIndex>` of the GlobalConfig reference UTxO. The
   * Release / Refund / Resolve redeemers read from this to know the
   * treasury address, min job amount, platform cut, and dispute fee.
   */
  globalConfigOutRef: string;
  /**
   * Comma-separated bech32 addresses of ChainTask team members who are
   * approved arbitrators. Clients pick one of these when posting a job;
   * arbitrators can't be self-nominated. Configured via
   * VITE_ARBITRATOR_ADDRESSES.
   */
  arbitratorAddresses: string[];
}

function readNetwork(): CardanoNetwork {
  const raw = (import.meta.env.VITE_NETWORK ?? "Preview").toString();
  if (raw === "Mainnet" || raw === "Preview" || raw === "Preprod") return raw;
  throw new Error(
    `VITE_NETWORK must be Mainnet | Preview | Preprod, got "${raw}"`,
  );
}

function readRequired(name: string): string {
  const v = import.meta.env[name];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(
      `Missing required env var: ${name}. Set it in .env.local before running.`,
    );
  }
  return v;
}

function readOptional(name: string, fallback = ""): string {
  const v = import.meta.env[name];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

const network = readNetwork();

// Default Blockfrost URL per network. Can be overridden by VITE_BLOCKFROST_URL.
const defaultBlockfrostUrl: Record<CardanoNetwork, string> = {
  Mainnet: "https://cardano-mainnet.blockfrost.io/api/v0",
  Preview: "https://cardano-preview.blockfrost.io/api/v0",
  Preprod: "https://cardano-preprod.blockfrost.io/api/v0",
};

const escrowScriptAddress = readOptional("VITE_ESCROW_SCRIPT_ADDRESS");

export const env: AppEnv = {
  network,
  blockfrostProjectId: readRequired("VITE_BLOCKFROST_PROJECT_ID"),
  blockfrostUrl: readOptional("VITE_BLOCKFROST_URL", defaultBlockfrostUrl[network]),
  pinataJwt: import.meta.env.VITE_PINATA_JWT as string | undefined,
  pinataGateway: readOptional(
    "VITE_PINATA_GATEWAY",
    "https://gateway.pinata.cloud/ipfs",
  ),
  contractsDeployed: escrowScriptAddress.length > 0,
  escrowScriptAddress,
  reputationScriptAddress: readOptional("VITE_REPUTATION_SCRIPT_ADDRESS"),
  profileScriptAddress: readOptional("VITE_PROFILE_SCRIPT_ADDRESS"),
  adminPolicyId: readOptional("VITE_ADMIN_POLICY_ID"),
  adminAssetName: readOptional("VITE_ADMIN_ASSET_NAME"),
  treasuryAddress: readOptional("VITE_TREASURY_ADDRESS"),
  globalConfigOutRef: readOptional("VITE_GLOBAL_CONFIG_OUTREF"),
  arbitratorAddresses: readOptional("VITE_ARBITRATOR_ADDRESSES")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
};
