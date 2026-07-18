// Address conversions.

import { credentialToAddress, getAddressDetails } from "@lucid-evolution/lucid";
import type { Network } from "@lucid-evolution/lucid";
import type { AddressT } from "./schemas";

/**
 * Convert a bech32 address to a Plutus Address record. Throws if the
 * input isn't a valid Cardano address.
 */
export function bech32ToAddress(bech32: string): AddressT {
  const details = getAddressDetails(bech32);
  if (!details.paymentCredential) {
    throw new Error(
      `Address has no payment credential: ${bech32}. Only base or enterprise addresses are supported.`,
    );
  }

  const payment_credential: AddressT["payment_credential"] =
    details.paymentCredential.type === "Key"
      ? { VerificationKey: [details.paymentCredential.hash] }
      : { Script: [details.paymentCredential.hash] };

  if (!details.stakeCredential) {
    return { payment_credential, stake_credential: null };
  }

  const inner: AddressT["payment_credential"] =
    details.stakeCredential.type === "Key"
      ? { VerificationKey: [details.stakeCredential.hash] }
      : { Script: [details.stakeCredential.hash] };

  return {
    payment_credential,
    stake_credential: { Inline: [inner] },
  };
}

/**
 * Convert a Plutus Address record back to bech32. Network must match
 * the address's network ID; pass "Preview" or "Mainnet" as appropriate.
 *
 * Returns null for Pointer addresses, which we never produce but might
 * encounter when reading old/exotic UTxOs at the script address.
 */
export function addressToBech32(addr: AddressT, network: Network): string | null {
  const payment =
    "VerificationKey" in addr.payment_credential
      ? { type: "Key" as const, hash: addr.payment_credential.VerificationKey[0] }
      : { type: "Script" as const, hash: addr.payment_credential.Script[0] };

  if (!addr.stake_credential) {
    return credentialToAddress(network, payment);
  }

  if ("Inline" in addr.stake_credential) {
    const inner = addr.stake_credential.Inline[0];
    const stake =
      "VerificationKey" in inner
        ? { type: "Key" as const, hash: inner.VerificationKey[0] }
        : { type: "Script" as const, hash: inner.Script[0] };
    return credentialToAddress(network, payment, stake);
  }

  // Pointer - give up.
  return null;
}
