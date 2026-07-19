// Intended protocol parameters, displayed on the landing page.

export const PROTOCOL_PARAMS = {
  /** Min job amount in ADA. Matches min_job_amount_lovelace=20_000_000. */
  minJob: 20,
  /** Treasury cut on Release, as a whole percent. */
  platformCutPercent: 4,
  /** Fixed dispute fee in ADA. Matches dispute_fee_lovelace=15_000_000. */
  disputeFee: 15,
  /** Auto-release deadline in days. Matches default_auto_release_seconds=1_209_600. */
  autoReleaseDays: 14,
  /** Auto-refund deadline in days. Matches default_auto_refund_seconds=1_209_600. */
  autoRefundDays: 14,
  /** Arbitrator timeout in days. Matches arbitrator_timeout_seconds=1_209_600. */
  arbitratorTimeoutDays: 14,
} as const;
