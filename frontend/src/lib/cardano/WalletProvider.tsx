/**
 * Weld wallet provider.
 *
 * Weld handles wallet connection persistence automatically via its
 * `enablePersistence` flag (default true) — it stores the last connected
 * wallet key in localStorage and tries to reconnect on mount. No need
 * for us to manage that.
 *
 * `updateInterval` controls how often Weld polls the wallet for changes
 * (balance, UTxOs). 30 seconds is a sensible default that keeps the UI
 * fresh without hammering the wallet extension.
 */

import { WeldProvider } from "@ada-anvil/weld/react";
import type { PropsWithChildren } from "react";

export function ChainTaskWalletProvider({ children }: PropsWithChildren) {
  return (
    <WeldProvider updateInterval={30_000}>
      {children}
    </WeldProvider>
  );
}
