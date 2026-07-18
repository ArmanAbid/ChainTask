//// Smoke tests - confirm types compile and constants are sensible.
//// Real validator branch tests live in escrow_tests.ak.

use chaintask/types.{
  arbitrator_timeout_seconds, default_auto_refund_seconds,
  default_auto_release_seconds, max_category_bytes, max_datum_bytes,
  max_recent_jobs,
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

test max_datum_is_512() {
  max_datum_bytes == 512
}

test max_category_is_16() {
  max_category_bytes == 16
}

test max_recent_jobs_is_10() {
  max_recent_jobs == 10
}
