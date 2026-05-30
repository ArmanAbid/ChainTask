/**
 * Display formatting helpers. Pure functions, no React.
 */

import type { Ada } from "@/types/domain";

// ────────────────────────────────────────────────────────────────────────
// Money
// ────────────────────────────────────────────────────────────────────────

const LOVELACE_PER_ADA = 1_000_000n;

export function lovelaceToAda(lovelace: bigint): Ada {
  // Use rational division then convert. Safe up to 9 trillion ADA before
  // JS number precision degrades.
  const whole = Number(lovelace / LOVELACE_PER_ADA);
  const rem = Number(lovelace % LOVELACE_PER_ADA) / 1_000_000;
  return whole + rem;
}

export function adaToLovelace(ada: Ada): bigint {
  // Round to the nearest lovelace.
  return BigInt(Math.round(ada * 1_000_000));
}

/**
 * Render an ADA amount for display.
 *   formatAda(47.5)            -> "47.50 ₳"
 *   formatAda(47.5, { sign: false }) -> "47.50"
 *   formatAda(1234567.89)      -> "1,234,567.89 ₳"
 */
export function formatAda(
  ada: Ada,
  opts: { sign?: boolean; decimals?: number } = {},
): string {
  const { sign = true, decimals = 2 } = opts;
  const str = ada.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return sign ? `${str} ₳` : str;
}

export function formatLovelaceAsAda(
  lovelace: bigint,
  opts?: { sign?: boolean; decimals?: number },
): string {
  return formatAda(lovelaceToAda(lovelace), opts);
}

// ────────────────────────────────────────────────────────────────────────
// Addresses
// ────────────────────────────────────────────────────────────────────────

/**
 * Truncate a bech32 address for compact display.
 *   truncateAddress("addr1qx...4n8m") -> "addr1qx…4n8m"
 *   truncateAddress("addr1qx...4n8m", 12, 6) -> "addr1qxabcdef…ab4n8m"
 */
export function truncateAddress(addr: string, head = 8, tail = 6): string {
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

// ────────────────────────────────────────────────────────────────────────
// Dates
// ────────────────────────────────────────────────────────────────────────

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Relative time like "3 hours ago", "in 2 days", "just now".
 * Uses Intl.RelativeTimeFormat for natural-language localization.
 */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < MIN) return rtf.format(Math.round(diff / SEC), "second");
  if (abs < HOUR) return rtf.format(Math.round(diff / MIN), "minute");
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
  if (abs < 30 * DAY) return rtf.format(Math.round(diff / DAY), "day");
  if (abs < 365 * DAY)
    return rtf.format(Math.round(diff / (30 * DAY)), "month");
  return rtf.format(Math.round(diff / (365 * DAY)), "year");
}

/**
 * Absolute date for tooltips and detail views.
 *   formatAbsolute(d) -> "Jan 14, 2026"
 */
export function formatAbsolute(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Render a remaining duration like "2d 4h", "12h", "47m" for deadline pills.
 * Negative durations render as "00:00" (deadline passed).
 */
export function formatRemaining(target: Date, now: Date = new Date()): string {
  const remaining = target.getTime() - now.getTime();
  if (remaining <= 0) return "expired";
  const days = Math.floor(remaining / DAY);
  const hours = Math.floor((remaining % DAY) / HOUR);
  const mins = Math.floor((remaining % HOUR) / MIN);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
