//// Smoke tests — confirm types compile and constants are sensible.
//// Real validator tests come in Week 2-3 alongside the logic.

use chaintask/types.{
  arbitrator_timeout_seconds, default_auto_refund_seconds,
  default_auto_release_seconds,
}

test auto_release_is_14_days() {
  default_auto_release_seconds == 14 * 24 * 60 * 60
}

test auto_refund_is_14_days() {
  default_auto_refund_seconds == 14 * 24 * 60 * 60
}

test arbitrator_timeout_is_14_days() {
  arbitrator_timeout_seconds == 14 * 24 * 60 * 60
}
