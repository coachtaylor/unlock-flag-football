import { colors } from "./design";

export type CategoryType = "phase" | "skill" | "sub_skill";

export const CATEGORY_KEYS = [
  "offense",
  "defense",
  "scrimmage",
  "footwork",
  "routes",
  "conditioning",
  "warmup",
  "agilities",
  "flagpulling",
  "pursuit",
  "throwing",
  "catching",
  "rushing",
  "blocking",
  "other",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/**
 * Hex color per canonical category. The four canonical phases/skills
 * (offense, defense, footwork, routes) stay locked to the migration-kit
 * tokens. The remaining categories each get their own distinct hue from
 * the team palette so a coach scanning a list can tell them apart at a
 * glance.
 */
export const CATEGORY_COLORS: Record<CategoryKey, string> = {
  offense: colors.category.footwork, // #C2FF3D — lime (swapped with footwork)
  defense: colors.category.defense, // #FF4D4D — red
  scrimmage: colors.team.violet, // #B89BFF — full-team game-speed reps
  footwork: colors.category.offense, // #FF6A1A — brand orange (swapped with offense)
  routes: colors.category.routes, // #6EA8FF — blue
  conditioning: colors.team.pink, // #FF6A8B — warm effort, distinct from offense
  warmup: colors.team.gold, // #FFB347 — sunrise warm-up
  agilities: colors.team.cyan, // #7DDFD2 — agility ladders / cone work block
  flagpulling: colors.indigo[400], // #818CF8 — cool, distinct from defense red
  pursuit: colors.green[400], // #4ADE80 — emerald, "chase / intercept"
  throwing: colors.amber[400], // #FBBF24 — amber, "release / snap"
  catching: colors.teal[400], // #14B8A6 — teal, "secure hands"
  rushing: colors.fuchsia[400], // #D946EF — fuchsia, "rush / pressure"
  blocking: colors.slate[400], // #94A3B8 — slate, "wall / hold the line"
  other: colors.text.muted, // #5A5A62 — neutral grey
};

const ALIASES: Record<string, CategoryKey> = {
  offense: "offense",
  offensive: "offense",
  defense: "defense",
  defensive: "defense",
  scrimmage: "scrimmage",
  scrimmages: "scrimmage",
  footwork: "footwork",
  routes: "routes",
  route: "routes",
  routerunning: "routes",
  passing: "routes",
  conditioning: "conditioning",
  warmup: "warmup",
  agilities: "agilities",
  cooldown: "agilities", // legacy alias — drills previously tagged "Cooldown" still resolve
  flagpulling: "flagpulling",
  flagpull: "flagpulling",
  pursuit: "pursuit",
  pursuitangles: "pursuit",
  throwing: "throwing",
  throw: "throwing",
  catching: "catching",
  catch: "catching",
  receiving: "catching",
  rushing: "rushing",
  rush: "rushing",
  blocking: "blocking",
  block: "blocking",
  other: "other",
};

export function normalizeCategory(
  name: string | null | undefined
): CategoryKey | null {
  if (!name) return null;
  const key = name.toLowerCase().replace(/[\s_-]+/g, "");
  return ALIASES[key] ?? null;
}

export function colorForCategory(name: string | null | undefined): string {
  const key = normalizeCategory(name);
  return key ? CATEGORY_COLORS[key] : colors.category.neutral;
}

/**
 * 14% alpha background for category pills, matching the kit's
 * --uff-orange-soft pattern. Falls back to the neutral surface tint
 * for unknown categories so the pill still has shape.
 */
export function tintForCategory(name: string | null | undefined): string {
  const key = normalizeCategory(name);
  if (!key) return colors.category.neutral;
  switch (key) {
    case "offense":
      return "rgba(194, 255, 61, 0.14)"; // #C2FF3D — lime (swapped with footwork)
    case "defense":
      return "rgba(255, 77, 77, 0.14)"; // #FF4D4D
    case "scrimmage":
      return "rgba(184, 155, 255, 0.14)"; // #B89BFF — team.violet
    case "footwork":
      return "rgba(255, 106, 26, 0.14)"; // #FF6A1A — orange (swapped with offense)
    case "routes":
      return "rgba(110, 168, 255, 0.14)"; // #6EA8FF
    case "conditioning":
      return "rgba(255, 106, 139, 0.14)"; // #FF6A8B — team.pink
    case "warmup":
      return "rgba(255, 179, 71, 0.14)"; // #FFB347 — team.gold
    case "agilities":
      return "rgba(125, 223, 210, 0.14)"; // #7DDFD2 — team.cyan
    case "flagpulling":
      return "rgba(129, 140, 248, 0.14)"; // #818CF8 — indigo.400
    case "pursuit":
      return "rgba(74, 222, 128, 0.14)"; // #4ADE80 — green.400
    case "throwing":
      return "rgba(251, 191, 36, 0.14)"; // #FBBF24 — amber.400
    case "catching":
      return "rgba(20, 184, 166, 0.14)"; // #14B8A6 — teal.400
    case "rushing":
      return "rgba(217, 70, 239, 0.14)"; // #D946EF — fuchsia.400
    case "blocking":
      return "rgba(148, 163, 184, 0.14)"; // #94A3B8 — slate.400
    case "other":
      return "rgba(255, 255, 255, 0.06)";
  }
}

/**
 * Heuristic fallback when a category row has no `category_type` in the DB
 * (e.g. running an old build before migration 17 lands). Offense/Defense
 * are phases; routes/footwork/etc. are skills; anything else defaults to
 * skill.
 */
export function inferCategoryType(name: string | null | undefined): CategoryType {
  const key = normalizeCategory(name);
  if (
    key === "offense" ||
    key === "defense" ||
    key === "scrimmage" ||
    key === "warmup" ||
    key === "agilities" ||
    key === "conditioning"
  ) {
    return "phase";
  }
  return "skill";
}
