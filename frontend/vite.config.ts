import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import wasm from "vite-plugin-wasm";
import path from "node:path";

/**
 * Vite config.
 *
 * Lucid Evolution depends on three WASM modules (cardano-multiplatform-lib,
 * cardano-message-signing, uplc). `vite-plugin-wasm` lets Rolldown bundle
 * those .wasm imports. Top-level await is supported natively by the
 * ES2022 build target Vite 8 uses by default — no plugin needed.
 *
 * `vite-plugin-node-polyfills` shims `Buffer` for Lucid's CBOR encoder,
 * which uses Node Buffer internally.
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
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: { port: 5173, open: false },
  optimizeDeps: {
    // Let Vite handle Lucid lazily — pre-bundling fights with the WASM imports.
    exclude: ["@lucid-evolution/lucid"],
  },
});
