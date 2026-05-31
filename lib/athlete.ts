import { colors } from "../constants/design";

export function initialsFromName(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) {
    const word = parts[0];
    return (word[0] ?? "—").toUpperCase();
  }
  const first = parts[0][0] ?? "";
  const last = parts[parts.length - 1][0] ?? "";
  return `${first}${last}`.toUpperCase() || "—";
}

export function splitFirstLast(name: string | null | undefined): {
  first: string;
  last: string;
} {
  if (!name) return { first: "", last: "" };
  const trimmed = name.trim();
  if (!trimmed) return { first: "", last: "" };
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { first: trimmed, last: "" };
  return {
    first: trimmed.slice(0, idx),
    last: trimmed.slice(idx + 1).trim(),
  };
}

export function joinFirstLast(first: string, last: string): string {
  return `${first.trim()} ${last.trim()}`.trim();
}

// Per-player avatar color, indexed by `team_players.color_index`.
//
// `playerColorForIndex(idx)` is the canonical helper — every player on a
// team has a stable slot (0..N) assigned by the DB trigger in
// migration 45, and the slot maps directly into the 20-swatch palette
// in `constants/design.ts` (`colors.player.palette`). Guaranteed unique
// up to palette size; wraps via modulo for larger rosters.
//
// Surfaces using this: dashboard SUN ROLL, streak rows, roster list /
// detail, practice RSVP, benchmark queue, attendance check-in, player
// form preview. Previous position/side-based helpers
// (avatarColorForPlayer / avatarColorForSide /
// avatarAccentForPositions / avatarAccentForPrimary) were removed in
// favor of per-player identity color so a player keeps the same hue
// across every screen.
export function playerColorForIndex(
  colorIndex: number | null | undefined
): string {
  const palette = colors.player.palette;
  if (colorIndex == null || colorIndex < 0) {
    // No slot yet (e.g. a brand-new player previewing in the form
    // before save). Fall back to muted so the avatar is visibly inert.
    return colors.text.muted;
  }
  return palette[colorIndex % palette.length];
}

// Legacy hash-based helper kept for any call site that lacks a
// color_index in scope (the player-form preview, or transitional
// loads against a DB without migration 45 applied). Prefer
// `playerColorForIndex` — this one has birthday-paradox collisions
// for rosters larger than ~3–4 players against an 8-color palette,
// which is why we moved to index-based slots.
//
// @deprecated Use `playerColorForIndex(player.colorIndex)` instead.
export function playerColorForId(id: string | null | undefined): string {
  if (!id) return colors.text.muted;
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  const palette = colors.player.palette;
  return palette[h % palette.length];
}
