// Skill-group metadata — the single source of truth for how the five
// skill groups render across the mobile app (the DrillForm SkillPicker,
// the benchmark-log skill chips, and the player skill-profile card all
// consume this). Mirrors unlock-web/src/lib/drills/skill-groups.ts so the
// two apps color the taxonomy identically.
//
// Colors are hex LITERALS matching the UFF palette. Skills are colored by
// GROUP (not by skill name), so unlike constants/categories.ts there is no
// name-keyed fallback to grey — every skill_group resolves to a real hue.

import { POSITION_SIDE } from "./positions";

export type SkillGroup = "athletic" | "offense" | "qb" | "defense" | "iq";

export type SkillGroupMeta = {
  id: SkillGroup;
  // Short label for tight UI (chips, legend rows).
  label: string;
  // Verbose label for roomier UI (the DrillForm picker group headers).
  longLabel: string;
  color: string; // hex
  // 14% alpha background for selected/tinted chips (mirrors tintForCategory).
  tint: string;
  blurb: string;
};

// Display order = canonical group order (athletic → offense → qb → defense → iq).
export const SKILL_GROUP_META: SkillGroupMeta[] = [
  {
    id: "athletic",
    label: "Athletic",
    longLabel: "Athletic",
    color: "#C2FF3D",
    tint: "rgba(194, 255, 61, 0.14)",
    blurb: "Physical attributes — applies to every position.",
  },
  {
    id: "offense",
    label: "Offense",
    longLabel: "Offense — Skill Position",
    color: "#FF6A1A",
    tint: "rgba(255, 106, 26, 0.14)",
    blurb: "Catching, routes, separation, YAC.",
  },
  {
    id: "qb",
    label: "QB",
    longLabel: "QB",
    color: "#6EA8FF",
    tint: "rgba(110, 168, 255, 0.14)",
    blurb: "Throwing accuracy at distance + off-platform.",
  },
  {
    id: "defense",
    label: "Defense",
    longLabel: "Defense",
    color: "#B89BFF",
    tint: "rgba(184, 155, 255, 0.14)",
    blurb: "Flag pull, coverage, pursuit, rush.",
  },
  {
    id: "iq",
    label: "IQ",
    longLabel: "Football IQ",
    color: "#FFB347",
    tint: "rgba(255, 179, 71, 0.14)",
    blurb: "Coach-rated cognitive skills — no objective drill captures them.",
  },
];

const BY_ID: Record<SkillGroup, SkillGroupMeta> = SKILL_GROUP_META.reduce(
  (acc, g) => {
    acc[g.id] = g;
    return acc;
  },
  {} as Record<SkillGroup, SkillGroupMeta>
);

// Falls back to the IQ group's metadata for unknown ids — the DB CHECK
// constraint guarantees one of the five, so this only guards against drift.
export function skillGroupMeta(id: string): SkillGroupMeta {
  return BY_ID[id as SkillGroup] ?? BY_ID.iq;
}

// Guided-tagging map: which skill groups a drill can tag, given its
// practice phase. Keyed by the normalized category key (see
// constants/categories.ts normalizeCategory). Athletic is offered in every
// phase (position-agnostic); IQ surfaces wherever reads/decisions happen.
// Used by the DrillForm so an Offense-phase drill can't carry Defense skills.
export const PHASE_TO_SKILL_GROUPS: Record<string, SkillGroup[]> = {
  warmup: ["athletic"],
  agilities: ["athletic"],
  conditioning: ["athletic"],
  offense: ["athletic", "offense", "qb", "iq"],
  defense: ["athletic", "defense", "iq"],
  scrimmage: ["athletic", "offense", "qb", "defense", "iq"],
};

// Union of allowed skill groups across a set of normalized phase keys.
export function allowedSkillGroupsForPhases(
  phaseKeys: (string | null | undefined)[]
): SkillGroup[] {
  const set = new Set<SkillGroup>();
  for (const key of phaseKeys) {
    const groups = key ? PHASE_TO_SKILL_GROUPS[key] : undefined;
    if (groups) for (const g of groups) set.add(g);
  }
  // Return in canonical SKILL_GROUP_META order.
  return SKILL_GROUP_META.filter((m) => set.has(m.id)).map((m) => m.id);
}

export function colorForSkillGroup(id: string): string {
  return skillGroupMeta(id).color;
}

export function tintForSkillGroup(id: string): string {
  return skillGroupMeta(id).tint;
}

// ── Position ↔ skill-group relevance + rooms (Build 17 scouting report) ───────
// Ported from unlock-web/src/lib/drills/skill-groups.ts — keep the two in sync.

// Unambiguous skill-AREA labels for the scouting surface. The short `label`s
// ("Offense"/"Defense"/"QB") collide with the position-room names ("Receivers"/
// "Defense"/"QB room"); these spell the skill area out so a captain reading
// "Receivers · Weakest: Defense" can tell a skill area from a position group.
const SKILL_AREA_LABEL: Record<SkillGroup, string> = {
  athletic: "Athleticism",
  offense: "Offensive skills",
  qb: "QB skills",
  defense: "Defensive skills",
  iq: "Football IQ",
};

export function skillAreaLabel(id: SkillGroup): string {
  return SKILL_AREA_LABEL[id];
}

// Which skill groups actually matter for a player's position(s). athletic + iq
// cut across every position; the side-specific group is added per listed
// position. A two-way player gets the union of their positions' groups.
export function skillGroupsForPositions(
  positions: string[] | null | undefined
): SkillGroup[] {
  const set = new Set<SkillGroup>(["athletic", "iq"]);
  for (const p of positions ?? []) {
    if (p === "QB") set.add("qb");
    else if (POSITION_SIDE[p] === "offense") set.add("offense");
    else if (POSITION_SIDE[p] === "defense") set.add("defense");
  }
  return SKILL_GROUP_META.filter((m) => set.has(m.id)).map((m) => m.id);
}

// Position "rooms" — how captains think about the roster. A player belongs to a
// room by PRIMARY position (positions[0]); `signature` is the room's defining
// skill group beyond the universal athletic/iq.
export type PositionRoom = {
  id: "qb" | "offense" | "defense";
  label: string;
  positions: string[];
  signature: SkillGroup;
};

export const POSITION_ROOMS: PositionRoom[] = [
  { id: "qb", label: "QB room", positions: ["QB"], signature: "qb" },
  { id: "offense", label: "Receivers", positions: ["WR", "RB", "C"], signature: "offense" },
  { id: "defense", label: "Defense", positions: ["CB", "S", "LB", "DE", "Rusher"], signature: "defense" },
];

export function roomForPrimaryPosition(
  positions: string[] | null | undefined
): PositionRoom | null {
  const primary = positions?.[0];
  if (!primary) return null;
  return POSITION_ROOMS.find((r) => r.positions.includes(primary)) ?? null;
}

// The position room a skill group "belongs" to. athletic + iq are universal
// (cut across every room) → null.
export function roomIdForSkillGroup(
  group: SkillGroup
): PositionRoom["id"] | null {
  const room = POSITION_ROOMS.find((r) => r.signature === group);
  return room ? room.id : null;
}
