import { colors } from "./design";

// Each practice block in the team library gets a stable color so the same
// block reads the same way across every practice. The four seeded defaults
// are pinned by name; custom blocks hash their name into a fixed palette
// so the same string always lands on the same color.

const DEFAULTS: Record<string, { fill: string; tint: string }> = {
  "warm up": { fill: colors.team.gold, tint: "rgba(255, 179, 71, 0.16)" },
  "skill block": { fill: colors.team.lime, tint: "rgba(194, 255, 61, 0.14)" },
  "team / situational": {
    fill: colors.team.violet,
    tint: "rgba(184, 155, 255, 0.16)",
  },
  "cool down": { fill: colors.team.blue, tint: "rgba(110, 168, 255, 0.16)" },
};

const PALETTE: { fill: string; tint: string }[] = [
  { fill: colors.team.orange, tint: "rgba(255, 106, 26, 0.16)" },
  { fill: colors.team.cyan, tint: "rgba(125, 223, 210, 0.16)" },
  { fill: colors.team.pink, tint: "rgba(255, 106, 139, 0.16)" },
  { fill: colors.team.red, tint: "rgba(255, 77, 77, 0.14)" },
  { fill: colors.amber[400], tint: "rgba(251, 191, 36, 0.14)" },
  { fill: colors.indigo[400], tint: "rgba(129, 140, 248, 0.16)" },
  { fill: colors.teal[400], tint: "rgba(20, 184, 166, 0.16)" },
  { fill: colors.fuchsia[400], tint: "rgba(217, 70, 239, 0.16)" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function blockFillColor(name: string | null | undefined): string {
  if (!name) return colors.text.muted;
  const key = name.trim().toLowerCase();
  const fixed = DEFAULTS[key];
  if (fixed) return fixed.fill;
  return PALETTE[hashString(key) % PALETTE.length].fill;
}

export function blockTintColor(name: string | null | undefined): string {
  if (!name) return colors.surface.elevated;
  const key = name.trim().toLowerCase();
  const fixed = DEFAULTS[key];
  if (fixed) return fixed.tint;
  return PALETTE[hashString(key) % PALETTE.length].tint;
}
