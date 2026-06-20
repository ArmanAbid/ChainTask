/**
 * useTx — bridges the connected Weld wallet to Lucid Evolution and exposes
 * one `useMutation` per tx builder.
 *
 * Each mutation:
 *   - lazily initializes Lucid against the connected wallet's enabled API
 *   - calls the matching builder from `lib/tx/builders.ts`
 *   - shows a "submitting…" toast → success toast with tx hash → error toast
 *   - invalidates relevant query keys on success so the UI refetches
 *
 * The hook returns `null` mutations until a wallet is connected, so
 * components can render disabled buttons cleanly while waiting.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet as useWeldWallet } from "@ada-anvil/weld/react";
import { pushToast } from "@/components/Toasts";
import { getLucid } from "@/lib/tx/lucid";
import {
  postJob,
  release,
  selectBuilder,
  submitWork,
  updateProfile,
  type PostJobInput,
  type ReleaseInput,
  type SelectBuilderInput,
  type SubmitWorkInput,
  type UpdateProfileInput,
} from "@/lib/tx/builders";

function shortTxHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

/** Build a mutation that runs `fn` with a fresh Lucid instance. */
function useTxMutation<TInput>(
  mutationKey: string[],
  fn: (lucid: Awaited<ReturnType<typeof getLucid>>, input: TInput) => Promise<string>,
  invalidateKeys: string[][] = [],
) {
  const queryClient = useQueryClient();
  const handler = useWeldWallet("handler");

  return useMutation<string, Error, TInput>({
    mutationKey,
    mutationFn: async (input: TInput) => {
      if (!handler) {
        throw new Error("No wallet connected. Connect a wallet to submit transactions.");
      }
      const walletApi = handler.enabledApi as Parameters<typeof getLucid>[0];
      const walletKey = handler.info.key;
      const lucid = await getLucid(walletApi, walletKey);
      return fn(lucid, input);
    },
    onSuccess: (txHash) => {
      pushToast(`Tx submitted: ${shortTxHash(txHash)}`, "success");
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      pushToast(msg, "error");
    },
  });
}

// ────────────────────────────────────────────────────────────────────────
// Public hooks — one per tx flow
// ────────────────────────────────────────────────────────────────────────

export function usePostJob() {
  return useTxMutation<PostJobInput>(
    ["tx", "postJob"],
    (lucid, input) => postJob(lucid, input),
    [["jobs"], ["clientJobs"]],
  );
}

export function useSelectBuilder() {
  return useTxMutation<SelectBuilderInput>(
    ["tx", "selectBuilder"],
    (lucid, input) => selectBuilder(lucid, input),
    [["job"], ["jobs"], ["clientJobs"], ["builderJobs"]],
  );
}

export function useSubmitWork() {
  return useTxMutation<SubmitWorkInput>(
    ["tx", "submit"],
    (lucid, input) => submitWork(lucid, input),
    [["job"], ["jobs"], ["builderJobs"]],
  );
}

export function useRelease() {
  return useTxMutation<ReleaseInput>(
    ["tx", "release"],
    (lucid, input) => release(lucid, input),
    [["job"], ["jobs"], ["reputation"]],
  );
}

export function useUpdateProfile() {
  return useTxMutation<UpdateProfileInput>(
    ["tx", "updateProfile"],
    (lucid, input) => updateProfile(lucid, input),
    [["profile"]],
  );
}
