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
