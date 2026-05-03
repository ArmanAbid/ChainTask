/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BLOCKFROST_API_KEY: string
  readonly VITE_PINATA_JWT: string
  readonly VITE_CARDANO_NETWORK: 'Preview' | 'Preprod' | 'Mainnet'
  readonly VITE_ESCROW_SCRIPT_ADDRESS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// window.cardano is declared globally by @lucid-evolution/core-types,
// so we don't need to redeclare it here.
