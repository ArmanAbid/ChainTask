import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import wasm from "vite-plugin-wasm";
import path from "node:path";

/**
 * Vite config.
 *
 * ── The CJS interop problem ──
 * The Cardano stack (Lucid + SDK + harmoniclabs + crypto libs) ships as
 * CommonJS. Vite's dev-server serves raw CJS to browsers, which reject
 * with:
 *
 *   Uncaught SyntaxError: The requested module '...' does not provide
 *   an export named 'default' | 'bech32' | 'generateMnemonic' | ...
 *
 * ── The fix ──
 * Enumerate every CJS package in the transitive dep tree of
 * @lucid-evolution/lucid and force pre-bundling via `optimizeDeps.include`.
 * esbuild transforms them to ESM chunks with proper interop shims so
 * browsers only see clean ESM.
 *
 * ── Why not just pre-bundle Lucid itself ──
 * @lucid-evolution/lucid imports @anastasia-labs/cardano-multiplatform-lib-browser
 * which loads WASM via top-level await. esbuild pre-bundling doesn't play
 * nice with WASM imports — keep Lucid in `exclude` and let Vite serve
 * its ESM entry directly (via vite-plugin-wasm for the .wasm files).
 */
export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ["buffer"],
      globals: { Buffer: true },
    }),
    wasm(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      // lodash → lodash-es for guaranteed ESM default exports.
      { find: /^lodash\/(.+)$/, replacement: "lodash-es/$1" },
      { find: /^lodash$/, replacement: "lodash-es" },
    ],
  },
  server: { port: 5173, open: false },
  optimizeDeps: {
    exclude: ["@lucid-evolution/lucid"],

    include: [
      // Core JS libs
      "lodash-es",
      "bech32",
      "bip39",
      "cbor-x",
      "@sinclair/typebox",
      "@ada-anvil/weld",
      "@tanstack/react-query",

      // Effect framework (used by Lucid provider)
      "effect",
      "@effect/schema",

      // Cardano SDK
      "@cardano-sdk/core",
      "@cardano-sdk/util",
      "@cardano-sdk/crypto",

      // All @harmoniclabs packages Lucid pulls in
      "@harmoniclabs/uplc",
      "@harmoniclabs/cbor",
      "@harmoniclabs/plutus-data",
      "@harmoniclabs/crypto",
      "@harmoniclabs/pair",
      "@harmoniclabs/bytestring",
      "@harmoniclabs/biguint",
      "@harmoniclabs/bigint-utils",
      "@harmoniclabs/bitstream",
      "@harmoniclabs/uint8array-utils",
      "@harmoniclabs/obj-utils",
    ],

    esbuildOptions: {
      mainFields: ["module", "main"],
      define: { global: "globalThis" },
    },
  },
});