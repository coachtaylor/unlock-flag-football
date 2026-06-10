// Lean mobile scouting loader (Build 17). Re-authors the slice of web's
// team-scouting-data.ts that the lean mobile UI needs: position rooms + player
// cards (each pre-loading its own detail evidence). Movers, drill leaderboards,
// and headline team-decisions are intentionally NOT computed here — they are a
// follow-up build. Reuses every pure helper so grades never drift from web.

import { supabase } from "../supabase";
import { initialsFromName, playerColorForIndex } from "../athlete";
import {
  type SkillGroup,
  roomForPrimaryPosition,
  skillAreaLabel,
  POSITION_ROOMS,
} from "../../constants/skill-groups";
import { scoreToGrade, scoreToHeatColor, type Grade } from "../dashboard/heat-scale";
import { confidenceTier } from "../benchmarks/confidence";
import {
  gradePlayerGroups,
  groupCompositesFromProfile,
  relativeStandingFor,
  type GroupScore,
  type RelativeStanding,
} from "./player-grade";
import {
  buildPlayerHistory,
  type PlayerHistoryDrill,
  type PlayerHistoryLocked,
  type BenchHistoryRow,
} from "../benchmarks/player-history";
import {
  buildSkillGroupTrend,
  type SkillGroupTrend,
} from "../benchmarks/skill-group-trend";
import { loadSkillGroupMaps } from "../benchmarks/skill-group-maps";

// Min assessed members before a room's grade is treated as reliable (vs provisional).
const ROOM_RELIABLE_MIN = 3;

export type PlayerSkill = {
  skillId: string;
  skillName: string;
  skillGroup: SkillGroup;
  composite: number; // 0..1
  sampleSize: number;
};

export type ObservationRowData = {
  id: string;
  noteText: string;
  createdAt: string;
  practiceTitle: string | null;
  practiceDate: string | null;
};

export type EditableResult = {
  id: string;
  drillId: string;
  drillName: string;
  benchmarkType: string;
  assessmentDate: string;
  setNumber: number;
  timeSeconds: number | null;
  rating: number | null;
  madeCount: number | null;
  attemptsCount: number | null;
};

export type BenchmarkSession = {
  date: string; // assessment_date (YYYY-MM-DD) — the session proxy
  label: string; // matched practice title, else "Benchmark session"
  practiceId: string | null;
  resultCount: number;
  drills: { drillName: string; results: EditableResult[] }[];
};

export type PlayerVerdict = {
  dataState: "none" | "measurement" | "direction" | "verdict";
  roleRead: string;
  headline: string;
  gapSkillId: string | null;
  gapSkillLabel: string | null;
  gapScore: number | null;
  ctaLabel: string;
};

export type RoomCell = {
  id: "qb" | "offense" | "defense";
  label: string;
  players: number;
  assessed: number;
  score: number | null;
  grade: Grade | null;
  color: string;
  weakestSkillLabel: string | null;
  weakestGroup: SkillGroup | null;
  ctaFocusSkillId: string | null;
  locked: boolean;
  gradeReliable: boolean;
};

export type PlayerReportCard = {
  playerId: string;
  name: string;
  color: string;
  initials: string;
  positions: string[];
  primaryPosition: string | null;
  roomLabel: string | null;
  overallScore: number | null;
  overallGrade: Grade | null;
  groupScores: GroupScore[];
  weakestGroupLabel: string | null;
  verdict: PlayerVerdict;
  relativeStanding: RelativeStanding | null;
  benchmarkCount: number;
  noteCount: number;
  historyDrills: PlayerHistoryDrill[];
  historyLocked: PlayerHistoryLocked[];
  skillGroupTrend: SkillGroupTrend;
  skillProfile: PlayerSkill[];
  observations: ObservationRowData[];
  recentTags: { tag: string; count: number }[];
  editableResults: EditableResult[];
  sessions: BenchmarkSession[];
};

export type TeamScoutingData = {
  rooms: RoomCell[];
  playerCards: PlayerReportCard[];
  rosterSize: number;
  assessedPlayers: number;
  anyData: boolean;
};

// ── Raw row shapes (subset of the select() columns we read) ──────────────────
type ProfileRow = {
  player_id: string;
  skill_id: string;
  skill_name: string;
  skill_group: SkillGroup;
  composite_score: number | null;
  drill_sample_size: number | null;
};

type DrillJoin = {
  id?: string;
  drill_name: string;
  benchmark_type: string | null;
  benchmark_types: string[] | null;
};

type BenchRow = {
  id: string;
  player_id: string;
  drill_id: string;
  assessment_date: string;
  set_number: number | null;
  time_seconds: number | null;
  rating: number | null;
  made_count: number | null;
  attempts_count: number | null;
  benchmark_type: string | null;
  tags: string[] | null;
  team_drills: DrillJoin | DrillJoin[] | null;
};

type NoteRow = {
  id: string;
  player_id: string;
  note_text: string;
  created_at: string;
  practice_plan_id: string | null;
  practice_plans:
    | { id: string; title: string | null; practice_date: string | null }
    | { id: string; title: string | null; practice_date: string | null }[]
    | null;
};

type PlayerRow = {
  id: string;
  player_name: string;
  positions: string[] | null;
  color_index: number | null;
  status: string;
};

function drillRowOf(b: BenchRow): DrillJoin | undefined {
  return Array.isArray(b.team_drills) ? b.team_drills[0] : b.team_drills ?? undefined;
}

function practiceOf(n: NoteRow) {
  return Array.isArray(n.practice_plans) ? n.practice_plans[0] : n.practice_plans ?? null;
}

// ── Verdict (volume-aware claim ladder — ported verbatim from web loader) ─────

export function roleReadFromGrade(grade: Grade | null): string {
  switch (grade) {
    case "A":
      return "Anchor";
    case "B":
      return "Reliable starter";
    case "C":
      return "Contributor · inconsistent";
    case "D":
      return "Development project";
    case "F":
      return "Major project";
    default:
      return "Early read";
  }
}

function buildVerdict(args: {
  firstName: string;
  overallGrade: Grade | null;
  skillProfile: PlayerSkill[];
  recentTags: { tag: string; count: number }[];
  historyDrills: { samples: unknown[] }[];
  benchmarkCount: number;
}): PlayerVerdict {
  const { firstName, overallGrade, skillProfile, recentTags, historyDrills, benchmarkCount } = args;

  if (benchmarkCount === 0) {
    return {
      dataState: "none",
      roleRead: "Not benchmarked",
      headline: `No benchmarks yet — run a drill to start ${firstName}'s read.`,
      gapSkillId: null,
      gapSkillLabel: null,
      gapScore: null,
      ctaLabel: "Plan a practice",
    };
  }

  const reliable = skillProfile
    .filter((s) => confidenceTier(s.sampleSize) === "reliable")
    .sort((a, b) => a.composite - b.composite); // weakest first
  const topTag = recentTags[0] ?? null;

  if (reliable.length > 0) {
    const gap = reliable[0];
    const tagPart = topTag ? ` · ${topTag.count}× "${topTag.tag}"` : "";
    return {
      dataState: "verdict",
      roleRead: roleReadFromGrade(overallGrade),
      headline: `Biggest reliable gap: ${gap.skillName} (${(gap.composite * 5).toFixed(1)}/5)${tagPart}.`,
      gapSkillId: gap.skillId,
      gapSkillLabel: gap.skillName,
      gapScore: gap.composite,
      ctaLabel: `Plan ${gap.skillName} work`,
    };
  }

  const measured = skillProfile.length;
  const hasMovement = historyDrills.some((d) => d.samples.length >= 2);
  const top = [...skillProfile].sort((a, b) => b.composite - a.composite)[0] ?? null;
  const topPart = top
    ? ` Strongest so far: ${top.skillName} ${(top.composite * 5).toFixed(1)}/5 (early).`
    : "";
  return {
    dataState: hasMovement ? "direction" : "measurement",
    roleRead: "Early read",
    headline: `Measured ${measured} skill${measured === 1 ? "" : "s"} across ${benchmarkCount} benchmark${benchmarkCount === 1 ? "" : "s"}.${topPart} Reads lock in at 3 drills each.`,
    gapSkillId: null,
    gapSkillLabel: null,
    gapScore: null,
    ctaLabel: "Plan a practice",
  };
}

// ── Main loader ──────────────────────────────────────────────────────────────

export async function loadTeamScouting(teamId: string): Promise<TeamScoutingData> {
  const [playersRes, profileRes, benchRes, notesRes, practicesRes, maps] = await Promise.all([
    supabase
      .from("team_players")
      .select("id, player_name, positions, color_index, status")
      .eq("team_id", teamId)
      .eq("status", "active"),
    supabase
      .from("v_player_skill_profile")
      .select("player_id, skill_id, skill_name, skill_group, composite_score, drill_sample_size")
      .eq("team_id", teamId),
    supabase
      .from("benchmark_results")
      .select(
        "id, player_id, drill_id, assessment_date, set_number, time_seconds, rating, made_count, attempts_count, benchmark_type, tags, team_drills(id, drill_name, benchmark_type, benchmark_types)"
      )
      .eq("team_id", teamId),
    supabase
      .from("player_notes")
      .select(
        "id, player_id, note_text, created_at, practice_plan_id, practice_plans(id, title, practice_date)"
      )
      .eq("team_id", teamId),
    supabase
      .from("practice_plans")
      .select("id, title, practice_date")
      .eq("team_id", teamId),
    loadSkillGroupMaps(supabase, teamId),
  ]);

  const players = (playersRes.data ?? []) as PlayerRow[];
  const profiles = (profileRes.data ?? []) as ProfileRow[];
  const benchmarks = (benchRes.data ?? []) as BenchRow[];
  const notes = (notesRes.data ?? []) as NoteRow[];
  const practiceByDate = new Map<string, { id: string; title: string | null }>();
  for (const pp of (practicesRes.data ?? []) as {
    id: string;
    title: string | null;
    practice_date: string;
  }[]) {
    if (!practiceByDate.has(pp.practice_date))
      practiceByDate.set(pp.practice_date, { id: pp.id, title: pp.title });
  }

  // Group raw rows by player once.
  const profileByPlayer = new Map<string, ProfileRow[]>();
  for (const r of profiles) {
    const arr = profileByPlayer.get(r.player_id) ?? [];
    arr.push(r);
    profileByPlayer.set(r.player_id, arr);
  }
  const benchByPlayer = new Map<string, BenchRow[]>();
  for (const b of benchmarks) {
    const arr = benchByPlayer.get(b.player_id) ?? [];
    arr.push(b);
    benchByPlayer.set(b.player_id, arr);
  }
  const notesByPlayer = new Map<string, NoteRow[]>();
  for (const n of notes) {
    const arr = notesByPlayer.get(n.player_id) ?? [];
    arr.push(n);
    notesByPlayer.set(n.player_id, arr);
  }

  const now = new Date();

  const playerCards: PlayerReportCard[] = players.map((p) => {
    const positions = p.positions ?? [];
    const firstName = p.player_name.split(" ")[0] || p.player_name;
    const profileRows = profileByPlayer.get(p.id) ?? [];
    const benchRows = benchByPlayer.get(p.id) ?? [];
    const playerNotes = notesByPlayer.get(p.id) ?? [];

    // Grade on position-relevant groups (last-row-per-group, matching web).
    const groupComposites = groupCompositesFromProfile(
      profileRows.map((r) => ({ skill_group: r.skill_group, composite_score: r.composite_score }))
    );
    const { groupScores, overallScore, overallGrade } = gradePlayerGroups(groupComposites, positions);

    // Per-skill profile (measured skills only) — drives the verdict.
    const skillProfile: PlayerSkill[] = profileRows
      .filter((r) => r.composite_score != null)
      .map((r) => ({
        skillId: r.skill_id,
        skillName: r.skill_name,
        skillGroup: r.skill_group,
        composite: Number(r.composite_score),
        sampleSize: r.drill_sample_size ?? 0,
      }));

    // Per-drill history + locked tails.
    const historyRows: BenchHistoryRow[] = benchRows.map((b) => ({
      id: b.id,
      assessment_date: b.assessment_date,
      time_seconds: b.time_seconds,
      rating: b.rating,
      made_count: b.made_count,
      attempts_count: b.attempts_count,
      benchmark_type: b.benchmark_type,
      drill_id: b.drill_id,
      team_drills: b.team_drills,
    }));
    const history = buildPlayerHistory(historyRows);

    // Skill-group trend.
    const skillGroupTrend = buildSkillGroupTrend({
      rows: benchRows.map((b) => ({
        drill_id: b.drill_id,
        assessment_date: b.assessment_date,
        rating: b.rating,
        made_count: b.made_count,
        attempts_count: b.attempts_count,
      })),
      drillSkills: maps.drillSkills,
      skillGroupById: maps.skillGroupById,
      positions,
      now,
    });

    // Recent tags (frequency desc).
    const tagCounts = new Map<string, number>();
    for (const b of benchRows) for (const t of b.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const recentTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    // Editable results (raw rows for inline correction).
    const editableResults: EditableResult[] = benchRows.map((b) => {
      const d = drillRowOf(b);
      return {
        id: b.id,
        drillId: b.drill_id,
        drillName: d?.drill_name ?? "Drill",
        benchmarkType: b.benchmark_type ?? d?.benchmark_type ?? "rated",
        assessmentDate: b.assessment_date,
        setNumber: b.set_number ?? 1,
        timeSeconds: b.time_seconds,
        rating: b.rating,
        madeCount: b.made_count,
        attemptsCount: b.attempts_count,
      };
    });

    // Sessions — group this player's results by assessment date (the session
    // proxy; benchmark_results has no practice FK), newest first; each session's
    // results grouped by drill. label = matched practice title for that date.
    const resultsByDate = new Map<string, EditableResult[]>();
    for (const r of editableResults) {
      const arr = resultsByDate.get(r.assessmentDate) ?? [];
      arr.push(r);
      resultsByDate.set(r.assessmentDate, arr);
    }
    const sessions: BenchmarkSession[] = Array.from(resultsByDate.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, results]) => {
        const pr = practiceByDate.get(date) ?? null;
        const byDrill = new Map<string, EditableResult[]>();
        for (const r of results) {
          const arr = byDrill.get(r.drillName) ?? [];
          arr.push(r);
          byDrill.set(r.drillName, arr);
        }
        return {
          date,
          label: pr?.title ?? "Benchmark session",
          practiceId: pr?.id ?? null,
          resultCount: results.length,
          drills: Array.from(byDrill.entries()).map(([drillName, rs]) => ({
            drillName,
            results: rs.slice().sort((a, b) => a.setNumber - b.setNumber),
          })),
        };
      });

    // Observations.
    const observations: ObservationRowData[] = playerNotes
      .map((n) => {
        const pp = practiceOf(n);
        return {
          id: n.id,
          noteText: n.note_text,
          createdAt: n.created_at,
          practiceTitle: pp?.title ?? null,
          practiceDate: pp?.practice_date ?? null,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const verdict = buildVerdict({
      firstName,
      overallGrade,
      skillProfile,
      recentTags,
      historyDrills: history.drills,
      benchmarkCount: history.benchmarkCount,
    });

    const measuredGroups = groupScores.filter((g) => g.score != null);
    const weakestGroupLabel = measuredGroups.length
      ? [...measuredGroups].sort((a, b) => (a.score as number) - (b.score as number))[0].label
      : null;

    return {
      playerId: p.id,
      name: p.player_name,
      color: playerColorForIndex(p.color_index),
      initials: initialsFromName(p.player_name),
      positions,
      primaryPosition: positions[0] ?? null,
      roomLabel: roomForPrimaryPosition(positions)?.label ?? null,
      overallScore,
      overallGrade,
      groupScores,
      weakestGroupLabel,
      verdict,
      relativeStanding: null, // filled in post-pass below
      benchmarkCount: history.benchmarkCount,
      noteCount: observations.length,
      historyDrills: history.drills,
      historyLocked: history.locked,
      skillGroupTrend,
      skillProfile,
      observations,
      recentTags,
      editableResults,
      sessions,
    };
  });

  // Sort: assessed weakest-first, unassessed last.
  playerCards.sort((a, b) => {
    if (a.overallScore == null && b.overallScore == null) return a.name.localeCompare(b.name);
    if (a.overallScore == null) return 1;
    if (b.overallScore == null) return -1;
    return a.overallScore - b.overallScore;
  });

  // Relative standing post-pass (needs the full cohort).
  const cohort = playerCards.map((c) => ({
    playerId: c.playerId,
    positions: c.positions,
    overallScore: c.overallScore,
  }));
  for (const c of playerCards) {
    c.relativeStanding = relativeStandingFor({ playerId: c.playerId, positions: c.positions }, cohort);
  }

  // Rooms.
  const rooms: RoomCell[] = POSITION_ROOMS.map((room) => {
    const roomCards = playerCards.filter(
      (c) => roomForPrimaryPosition(c.positions)?.id === room.id
    );
    const assessedCards = roomCards.filter((c) => c.overallScore != null);
    const assessed = assessedCards.length;
    const score = assessed
      ? assessedCards.reduce((a, c) => a + (c.overallScore as number), 0) / assessed
      : null;

    // Weakest group across the room's assessed members.
    const groupSums = new Map<SkillGroup, { sum: number; n: number }>();
    for (const c of assessedCards) {
      for (const g of c.groupScores) {
        if (g.score == null) continue;
        const acc = groupSums.get(g.group) ?? { sum: 0, n: 0 };
        acc.sum += g.score;
        acc.n += 1;
        groupSums.set(g.group, acc);
      }
    }
    let weakestGroup: SkillGroup | null = null;
    let weakestAvg = Infinity;
    for (const [g, acc] of groupSums.entries()) {
      const avg = acc.sum / acc.n;
      if (avg < weakestAvg) {
        weakestAvg = avg;
        weakestGroup = g;
      }
    }

    return {
      id: room.id,
      label: room.label,
      players: roomCards.length,
      assessed,
      score,
      grade: scoreToGrade(score),
      color: scoreToHeatColor(score),
      weakestSkillLabel: weakestGroup ? skillAreaLabel(weakestGroup) : null,
      weakestGroup,
      ctaFocusSkillId: null,
      locked: assessed === 0,
      gradeReliable: assessed >= ROOM_RELIABLE_MIN,
    };
  });

  const assessedPlayers = playerCards.filter((c) => c.overallScore != null).length;

  return {
    rooms,
    playerCards,
    rosterSize: players.length,
    assessedPlayers,
    anyData: assessedPlayers > 0 || benchmarks.length > 0,
  };
}
