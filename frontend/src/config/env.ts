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
  /** Hex policy id of the admin NFT. Empty until deploy. */
  adminPolicyId: string;
  /** Hex asset name of the admin NFT. Empty until deploy. */
  adminAssetName: string;
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
  adminPolicyId: readOptional("VITE_ADMIN_POLICY_ID"),
  adminAssetName: readOptional("VITE_ADMIN_ASSET_NAME"),
};
