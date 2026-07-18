// Weld wallet provider.

import { WeldProvider } from "@ada-anvil/weld/react";
import type { PropsWithChildren } from "react";

export function ChainTaskWalletProvider({ children }: PropsWithChildren) {
  return (
    <WeldProvider updateInterval={30_000}>
      {children}
    </WeldProvider>
  );
}
