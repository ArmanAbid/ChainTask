/**
 * Cardano address helpers.
 *
 * Bech32 addresses encode their network in the human-readable prefix:
 *   addr1...        → Mainnet
 *   addr_test1...   → Preview or Preprod (both testnets share the prefix)
 *
 * The wallet itself reports the network independently via CIP-30
 * `getNetworkId()`, which returns 0 for testnet, 1 for mainnet. We
 * cross-check both so a user can't accidentally hit a Preview UI with
 * their mainnet wallet (which would just fail transactions).
 */

import type { CardanoNetwork } from "@/types/domain";

export function isMainnetAddress(addr: string): boolean {
  return addr.startsWith("addr1");
}

export function isTestnetAddress(addr: string): boolean {
  return addr.startsWith("addr_test1");
}

/** Returns true iff the address matches the configured network. */
export function addressMatchesNetwork(
  addr: string,
  network: CardanoNetwork,
): boolean {
  if (network === "Mainnet") return isMainnetAddress(addr);
  return isTestnetAddress(addr);
}

/** Map CIP-30 networkId (0 or 1) to our CardanoNetwork strings. */
export function networkIdToName(
  networkId: number,
  preferTestnet: CardanoNetwork = "Preview",
): CardanoNetwork {
  if (networkId === 1) return "Mainnet";
  return preferTestnet;
}
