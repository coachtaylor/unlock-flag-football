// Shared date helpers. Single source of truth — don't re-inline date
// formatting at call sites.

/**
 * Today as a local-time `YYYY-MM-DD` string. Matches how date-only columns
 * (practice_date, assessment_date, …) are stored — local, not UTC, so a
 * late-evening session doesn't roll to "tomorrow". Pass a Date to format an
 * arbitrary day.
 */
export function localDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const ACTOR_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const SEVEN_DAYS_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * Canonical relative/absolute timestamp for coach-attribution bylines + the
 * activity feed (Build 14.5). MUST stay identical to the web helper
 * (unlock-web/src/lib/time.ts `formatActorTime`):
 *   < 1 min   -> "just now"
 *   < 1 hour  -> "Nm ago"
 *   < 1 day   -> "Nh ago"
 *   < 7 days  -> "Nd ago" (1 -> "yesterday")
 *   >= 7 days -> "Jun 1" (+ ", 2025" when not the current year)
 * Returns "" for missing/invalid input so callers can render nothing.
 */
export function formatActorTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso);
  const t = then.getTime();
  if (Number.isNaN(t)) return "";

  const now = Date.now();
  const diff = now - t;

  if (diff < SEVEN_DAYS_MS) {
    if (diff < 60_000) return "just now";
    const m = Math.floor(diff / 60_000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? "yesterday" : `${d}d ago`;
  }

  const label = `${ACTOR_MONTHS[then.getMonth()]} ${then.getDate()}`;
  const thisYear = new Date(now).getFullYear();
  return then.getFullYear() === thisYear ? label : `${label}, ${then.getFullYear()}`;
}
