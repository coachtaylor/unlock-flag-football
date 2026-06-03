// Player/person name helpers. team_players stores first_name + last_name
// (structured) plus player_name (canonical display). For rows that predate
// the split or were created by an RPC (first/last null), splitName() derives
// first/last from the display string the same way migration 83's backfill
// does — split on the LAST whitespace.

export function splitName(full: string | null | undefined): {
  first: string;
  last: string;
} {
  const t = (full ?? "").trim();
  const m = t.match(/^(.*\S)\s+(\S+)$/);
  if (m) return { first: m[1], last: m[2] };
  return { first: t, last: "" };
}

// Auto-capitalize a name as it's typed: uppercase the first letter of each
// whitespace-separated word, leaving the rest of each word as entered (so
// "mcdonald" → "Mcdonald", but a deliberate "McDonald" is preserved).
// Length-preserving, so it's safe to apply on every keystroke without
// disturbing the caret.
export function capitalizeName(value: string): string {
  return value.replace(/(^|\s)([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

// Compose a display name from parts — last name is optional.
export function fullName(
  first: string | null | undefined,
  last: string | null | undefined
): string {
  return [first?.trim(), last?.trim()].filter(Boolean).join(" ");
}

// Sort key for last-name ordering, with sensible fallbacks: explicit
// last_name → split of the display name's last token → the whole display
// name (mononyms). Lowercased for case-insensitive compare.
export function lastNameSortKey(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  displayName: string | null | undefined
): string {
  const last = (lastName ?? "").trim() || splitName(displayName).last;
  return (last || (displayName ?? "").trim()).toLowerCase();
}
