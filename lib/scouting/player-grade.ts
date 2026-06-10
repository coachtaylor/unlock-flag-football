// Single source of truth for a player's per-group + overall grade. The scouting
// report and the player-card hero MUST agree, so the math lives here and both
// import it (a previous inline copy on the player page drifted C→D — exactly the
// duplication this consolidates away).
//
// A player is graded ONLY on the skill groups relevant to their position(s).
// The group composite is the v_player_skill_profile composite per group (last
// row per group wins — matches how the team loader built `profileByPlayer`).
// Overall = mean of the measured relevant groups, then letter-graded.

import type { SkillGroup } from "../../constants/skill-groups";
import { scoreToGrade, type Grade } from "../dashboard/heat-scale";
import {
  skillGroupsForPositions,
  skillAreaLabel,
  roomForPrimaryPosition,
} from "../../constants/skill-groups";

export type GroupScore = {
  group: SkillGroup;
  label: string;
  score: number | null; // 0..1
  grade: Grade | null;
};

export type PlayerGroupGrades = {
  groupScores: GroupScore[]; // position-relevant groups, canonical order
  overallScore: number | null; // 0..1 mean of measured relevant groups
  overallGrade: Grade | null;
};

// group → composite (0..1). Last row per group wins, matching the team loader.
export function groupCompositesFromProfile(
  rows: { skill_group: SkillGroup; composite_score: number | null }[],
): Map<SkillGroup, number | null> {
  const m = new Map<SkillGroup, number | null>();
  for (const r of rows) m.set(r.skill_group, r.composite_score);
  return m;
}

export function gradePlayerGroups(
  groupComposites: Map<SkillGroup, number | null>,
  positions: string[] | null | undefined,
): PlayerGroupGrades {
  const relevant = skillGroupsForPositions(positions ?? []);
  const groupScores: GroupScore[] = relevant.map((id) => {
    const score = groupComposites.get(id) ?? null;
    return { group: id, label: skillAreaLabel(id), score, grade: scoreToGrade(score) };
  });
  const measured = groupScores.filter((g) => g.score != null);
  const overallScore = measured.length
    ? measured.reduce((a, g) => a + (g.score as number), 0) / measured.length
    : null;
  return { groupScores, overallScore, overallGrade: scoreToGrade(overallScore) };
}

// ── Relative standing (cohort rank within a position room) ───────────────────
// Shared with the scouting report (§3) so the hero and the grid can't disagree.

export type RelativeStanding = {
  roomLabel: string; // "Receivers", "QB room", "Defense"
  cohortSize: number; // assessed members in the room
  rank: number; // 1 = best in room
  tier: "top" | "upper" | "middle" | "lower" | "bottom";
  line: string; // "Bottom of the Receivers"
  detail: string; // "5th of 5 assessed"
};

export type StandingMember = {
  playerId: string;
  positions: string[];
  overallScore: number | null;
};

// A rank only means something with a real cohort — you can't rank one player.
export const STANDING_MIN = 3;

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function standingTier(rank: number, size: number): RelativeStanding["tier"] {
  if (rank === 1) return "top";
  if (rank === size) return "bottom";
  const frac = (rank - 1) / (size - 1); // 0 = best … 1 = worst
  if (frac <= 0.34) return "upper";
  if (frac >= 0.66) return "lower";
  return "middle";
}

const TIER_PREFIX: Record<RelativeStanding["tier"], string> = {
  top: "Top of",
  upper: "Upper half of",
  middle: "Middle of",
  lower: "Lower half of",
  bottom: "Bottom of",
};

// Rank one player within their position-room cohort. null when the room is too
// thin (< STANDING_MIN assessed) or the target itself has no score.
export function relativeStandingFor(
  target: { playerId: string; positions: string[] },
  cohort: StandingMember[],
): RelativeStanding | null {
  const room = roomForPrimaryPosition(target.positions);
  if (!room) return null;
  const members = cohort.filter(
    (m) => m.overallScore != null && roomForPrimaryPosition(m.positions)?.id === room.id,
  );
  if (members.length < STANDING_MIN) return null;
  const ranked = [...members].sort(
    (a, b) => (b.overallScore as number) - (a.overallScore as number),
  ); // best → worst
  const idx = ranked.findIndex((m) => m.playerId === target.playerId);
  if (idx < 0) return null;
  const rank = idx + 1;
  const size = ranked.length;
  const tier = standingTier(rank, size);
  return {
    roomLabel: room.label,
    cohortSize: size,
    rank,
    tier,
    line: `${TIER_PREFIX[tier]} the ${room.label}`,
    detail: `${ordinal(rank)} of ${size} assessed`,
  };
}
