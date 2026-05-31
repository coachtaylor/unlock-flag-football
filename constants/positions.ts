import { colors } from "./design";

export type Side = "offense" | "defense";

export type PositionDef = {
  id: string;
  label: string;
  full: string;
};

export const POSITIONS: Record<Side, PositionDef[]> = {
  offense: [
    { id: "QB", label: "QB", full: "Quarterback" },
    { id: "WR", label: "WR", full: "Wide Receiver" },
    { id: "RB", label: "RB", full: "Running Back" },
    { id: "C", label: "C", full: "Center" },
  ],
  defense: [
    { id: "CB", label: "CB", full: "Cornerback" },
    { id: "S", label: "S", full: "Safety" },
    { id: "LB", label: "LB", full: "Linebacker" },
    { id: "DE", label: "DE", full: "Defensive End" },
    { id: "Rusher", label: "Rusher", full: "Pass Rusher" },
  ],
};

export const POSITION_SIDE: Record<string, Side> = (() => {
  const map: Record<string, Side> = {};
  (Object.keys(POSITIONS) as Side[]).forEach((side) => {
    POSITIONS[side].forEach((p) => {
      map[p.id] = side;
    });
  });
  return map;
})();

export function sideForPositions(positions: string[] | null | undefined): Side | null {
  if (!positions || positions.length === 0) return null;
  return POSITION_SIDE[positions[0]] ?? null;
}

export function sideAccent(side: Side | null): string {
  // Offense matches the offense phase color (lime); defense matches red.
  if (side === "offense") return colors.lime[400];
  if (side === "defense") return colors.red.semantic;
  return colors.text.muted;
}

// Avatar fill is now per-player identity color via `color_index` — see
// `playerColorForIndex` in lib/athlete.ts. The position/side-based
// avatarAccentForPositions and avatarAccentForPrimary helpers used to
// live here and were removed when the codebase consolidated on a single
// avatar-color source (migration 45).

// Tinted background for primary-position pill / hero side pill.
export function sideTint(side: Side | null): string {
  if (side === "offense") return "rgba(194, 255, 61, 0.18)";
  if (side === "defense") return "rgba(255, 77, 77, 0.18)";
  return "rgba(255, 255, 255, 0.06)";
}

// Per-position accent colors — every position reads as its own tag.
// Deliberately avoids the offense (lime) and defense (red) side colors so
// position tags never collide with the side coloring.
export const POSITION_COLOR: Record<string, string> = {
  QB: colors.team.orange,
  WR: colors.teal[400],
  RB: colors.team.gold,
  C: colors.team.cyan,
  CB: colors.team.blue,
  S: colors.team.violet,
  LB: colors.team.pink,
  DE: colors.green[400],
  Rusher: colors.fuchsia[400],
};

export function positionColor(id: string | null | undefined): string {
  if (!id) return colors.text.muted;
  return POSITION_COLOR[id] ?? colors.text.muted;
}

// ~18% alpha tint of the position color (hex8) for pill backgrounds.
export function positionTint(id: string | null | undefined): string {
  return `${positionColor(id)}2E`;
}
