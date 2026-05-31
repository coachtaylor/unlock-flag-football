import { colors } from "./design";

/**
 * Team color palette for the Create Team flow. The 8 ids here are mirrored
 * by the `teams_team_color_chk` constraint in `13_team_setup_fields.sql`,
 * so any change to ids here must be matched in SQL.
 */
export const TEAM_COLOR_KEYS = [
  "orange",
  "lime",
  "blue",
  "red",
  "violet",
  "cyan",
  "pink",
  "gold",
] as const;

export type TeamColorKey = (typeof TEAM_COLOR_KEYS)[number];

export type TeamColor = {
  id: TeamColorKey;
  hex: string;
  label: string;
};

export const TEAM_COLORS: TeamColor[] = [
  { id: "orange", hex: colors.team.orange, label: "Orange" },
  { id: "lime", hex: colors.team.lime, label: "Lime" },
  { id: "blue", hex: colors.team.blue, label: "Blue" },
  { id: "red", hex: colors.team.red, label: "Red" },
  { id: "violet", hex: colors.team.violet, label: "Violet" },
  { id: "cyan", hex: colors.team.cyan, label: "Cyan" },
  { id: "pink", hex: colors.team.pink, label: "Pink" },
  { id: "gold", hex: colors.team.gold, label: "Gold" },
];

export function teamColorHex(id: TeamColorKey | string | null | undefined): string {
  if (!id) return colors.team.orange;
  const match = TEAM_COLORS.find((c) => c.id === id);
  return match ? match.hex : colors.team.orange;
}

export function isTeamColorKey(value: unknown): value is TeamColorKey {
  return (
    typeof value === "string" &&
    (TEAM_COLOR_KEYS as readonly string[]).includes(value)
  );
}
