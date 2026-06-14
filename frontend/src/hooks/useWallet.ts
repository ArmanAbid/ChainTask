/**
 * useWallet — convenience hook exposing the wallet state ChainTask uses.
 *
 * Wraps Weld's reactive store and adds a network-correctness check. The
 * return value is memoized: when nothing changed since the last render,
 * the same object reference comes back. This keeps consumers safe from
 * accidental useEffect re-fires when they include the wallet object in
 * a dependency array.
 */

import { useMemo } from "react";
import { useWallet as useWeldWallet } from "@ada-anvil/weld/react";
import { env } from "@/config/env";
import { addressMatchesNetwork } from "@/lib/cardano/addresses";

export type ConnectionState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | {
      status: "connected";
      wallet: string;
      address: string;
      balanceAda: number;
      isCorrectNetwork: boolean;
    };

export function useWallet(): ConnectionState {
  const w = useWeldWallet(
    "isConnected",
    "isConnecting",
    "displayName",
    "changeAddressBech32",
    "balanceAda",
  );

  const isConnected = w.isConnected;
  const isConnecting = w.isConnecting;
  const displayName = w.displayName;
  const address = w.changeAddressBech32;
  const balanceAda = w.balanceAda;

  return useMemo<ConnectionState>(() => {
    if (isConnecting) return { status: "connecting" };
    if (!isConnected || !address) return { status: "disconnected" };
    return {
      status: "connected",
      wallet: displayName ?? "Unknown",
      address,
      balanceAda: balanceAda ?? 0,
      isCorrectNetwork: addressMatchesNetwork(address, env.network),
    };
  }, [isConnected, isConnecting, displayName, address, balanceAda]);
}
