// useTx - bridges the connected Weld wallet to Lucid Evolution and exposes

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet as useWeldWallet } from "@ada-anvil/weld/react";
import { pushToast } from "@/components/Toasts";
import { getLucid } from "@/lib/tx/lucid";
import {
  amendSubmission,
  arbitratorTimeout,
  autoRefund,
  autoRelease,
  builderWithdraw,
  cancelOpen,
  dispute,
  postJob,
  refund,
  release,
  resolve,
  selectBuilder,
  submitCosignedTx,
  submitWork,
  updateJob,
  updateProfile,
  type AmendSubmissionInput,
  type ArbitratorTimeoutInput,
  type AutoRefundInput,
  type AutoReleaseInput,
  type BuilderWithdrawInput,
  type CancelOpenInput,
  type DisputeInput,
  type PostJobInput,
  type RefundInput,
  type ReleaseInput,
  type ResolveInput,
  type SelectBuilderInput,
  type SubmitWorkInput,
  type UpdateJobInput,
  type UpdateProfileInput,
} from "@/lib/tx/builders";
import { pinProposal, type Proposal } from "@/lib/ipfs";

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
    onSuccess: (result) => {
      // Tx hash is 32 bytes = 64 hex chars. Anything much longer is a
      // CBOR-encoded partial tx returned by a cosignMode call - different
      // toast, no query invalidation (nothing hit chain yet).
      if (result.length <= 80) {
        pushToast(`Tx submitted: ${shortTxHash(result)}`, "success");
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      } else {
        pushToast(
          "Ready to co-sign — share the hex with the other party",
          "success",
        );
      }
    },
    onError: (e) => {
      const raw = e instanceof Error ? e.message : "Transaction failed";
      // Humanize common chain errors so users don't see raw Plutus /
      // Blockfrost noise.
      let msg = raw;
      if (/input.*already.*spent|BadInputsUTxO/i.test(raw)) {
        msg =
          "One of the inputs was already spent by a concurrent tx. Refresh the page and try again.";
      } else if (/insufficient.*balance|InsufficientCollateralBalance|not enough Ada/i.test(raw)) {
        msg =
          "Not enough ADA in your wallet to cover the tx (escrow + fees). Top up and try again.";
      } else if (/ValueNotConservedUTxO/i.test(raw)) {
        msg =
          "Tx value mismatch — the amount going in doesn't equal what's going out. Please refresh and try again.";
      } else if (/OutsideValidityInterval/i.test(raw)) {
        msg =
          "Tx expired before submit. Please refresh and try again.";
      } else if (/ScriptWitnessNotValidating|ExecutionCostsTooBig|EvaluationFailure/i.test(raw)) {
        msg =
          "The on-chain contract rejected this tx. Common causes: stale UTxO, wallet on wrong network, or a state mismatch. Refresh and try again.";
      }
      pushToast(msg, "error");
    },
  });
}

// Public hooks - one per tx flow

export function usePostJob() {
  return useTxMutation<PostJobInput>(
    ["tx", "postJob"],
    (lucid, input) => postJob(lucid, input),
    [["jobs"]],
  );
}

export function useSelectBuilder() {
  return useTxMutation<SelectBuilderInput>(
    ["tx", "selectBuilder"],
    (lucid, input) => selectBuilder(lucid, input),
    [["job"], ["jobs"]],
  );
}

export function useSubmitWork() {
  return useTxMutation<SubmitWorkInput>(
    ["tx", "submit"],
    (lucid, input) => submitWork(lucid, input),
    [["job"], ["jobs"]],
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

export function useRefund() {
  return useTxMutation<RefundInput>(
    ["tx", "refund"],
    (lucid, input) => refund(lucid, input),
    [["job"], ["jobs"]],
  );
}

export function useBuilderWithdraw() {
  return useTxMutation<BuilderWithdrawInput>(
    ["tx", "builderWithdraw"],
    (lucid, input) => builderWithdraw(lucid, input),
    [["job"], ["jobs"]],
  );
}

export function useDispute() {
  return useTxMutation<DisputeInput>(
    ["tx", "dispute"],
    (lucid, input) => dispute(lucid, input),
    [["job"], ["jobs"]],
  );
}

export function useResolve() {
  return useTxMutation<ResolveInput>(
    ["tx", "resolve"],
    (lucid, input) => resolve(lucid, input),
    [["job"], ["jobs"], ["reputation"]],
  );
}

export function useAmendSubmission() {
  return useTxMutation<AmendSubmissionInput>(
    ["tx", "amendSubmission"],
    (lucid, input) => amendSubmission(lucid, input),
    [["job"], ["jobs"]],
  );
}

export function useUpdateJob() {
  return useTxMutation<UpdateJobInput>(
    ["tx", "updateJob"],
    (lucid, input) => updateJob(lucid, input),
    [["job"], ["jobs"]],
  );
}

export function useAutoRelease() {
  return useTxMutation<AutoReleaseInput>(
    ["tx", "autoRelease"],
    (lucid, input) => autoRelease(lucid, input),
    [["job"], ["jobs"], ["reputation"]],
  );
}

export function useAutoRefund() {
  return useTxMutation<AutoRefundInput>(
    ["tx", "autoRefund"],
    (lucid, input) => autoRefund(lucid, input),
    [["job"], ["jobs"]],
  );
}

export function useArbitratorTimeout() {
  return useTxMutation<ArbitratorTimeoutInput>(
    ["tx", "arbitratorTimeout"],
    (lucid, input) => arbitratorTimeout(lucid, input),
    [["job"], ["jobs"], ["reputation"]],
  );
}

export function useCancelOpen() {
  return useTxMutation<CancelOpenInput>(
    ["tx", "cancelOpen"],
    (lucid, input) => cancelOpen(lucid, input),
    [["job"], ["jobs"]],
  );
}

// useSubmitCosignedTx - second signer submits a partial-signed CBOR
//
// Takes the CBOR hex the first signer produced (via release/refund/resolve
// with cosignMode=true), signs with the connected wallet, submits on chain.

export function useSubmitCosignedTx() {
  return useTxMutation<{ cborHex: string }>(
    ["tx", "cosignSubmit"],
    (lucid, input) => submitCosignedTx(lucid, input.cborHex),
    [["job"], ["jobs"], ["reputation"]],
  );
}

// Off-chain proposal pin
//
// Not a tx - just an IPFS write - but lives here for parity with other
// write mutations and uniform toast/invalidation UX.

export function usePinProposal() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, Proposal>({
    mutationKey: ["pin", "proposal"],
    mutationFn: (p) => pinProposal(p),
    onSuccess: (_cid, variables) => {
      pushToast("Proposal submitted", "success");
      queryClient.invalidateQueries({
        queryKey: ["proposals", variables.jobId],
      });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Failed to submit proposal";
      pushToast(msg, "error");
    },
  });
}