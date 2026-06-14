/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK: string;
  readonly VITE_BLOCKFROST_PROJECT_ID: string;
  readonly VITE_BLOCKFROST_URL?: string;
  readonly VITE_PINATA_JWT?: string;
  readonly VITE_PINATA_GATEWAY?: string;
  readonly VITE_ESCROW_SCRIPT_ADDRESS?: string;
  readonly VITE_REPUTATION_SCRIPT_ADDRESS?: string;
  readonly VITE_PROFILE_SCRIPT_ADDRESS?: string;
  readonly VITE_ADMIN_POLICY_ID?: string;
  readonly VITE_ADMIN_ASSET_NAME?: string;
  readonly VITE_TREASURY_ADDRESS?: string;
  readonly VITE_GLOBAL_CONFIG_OUTREF?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
