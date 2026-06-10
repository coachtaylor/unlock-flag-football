// Height/weight formatting for the player card (Build 18). Ported verbatim from
// unlock-web/src/lib/format/physicals.ts — KEEP IN SYNC across repos. One source
// so the edit form and the hero render physicals identically. Height stored as
// total inches.

export function formatHeight(totalInches: number | null | undefined): string | null {
  if (totalInches == null || Number.isNaN(totalInches)) return null;
  const ft = Math.floor(totalInches / 12);
  const inch = totalInches % 12;
  return `${ft}'${inch}"`;
}

export function feetInchesToInches(
  feet: number | null,
  inches: number | null
): number | null {
  if ((feet == null || Number.isNaN(feet)) && (inches == null || Number.isNaN(inches))) {
    return null;
  }
  return (feet ?? 0) * 12 + (inches ?? 0);
}

export function inchesToFeetInches(totalInches: number | null | undefined): {
  feet: number | null;
  inches: number | null;
} {
  if (totalInches == null || Number.isNaN(totalInches)) return { feet: null, inches: null };
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export function formatWeight(lb: number | null | undefined): string | null {
  if (lb == null || Number.isNaN(lb)) return null;
  return `${lb} lb`;
}

// "6'1" · 190 lb" — omits missing parts, returns null when nothing to show.
export function formatPhysicals(
  heightIn: number | null | undefined,
  weightLb: number | null | undefined
): string | null {
  const parts = [formatHeight(heightIn), formatWeight(weightLb)].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
