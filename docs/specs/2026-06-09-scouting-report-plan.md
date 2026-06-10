# Scouting Report — Mobile (Build 17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port web's read-first, position-aware scouting report to `unlock-mobile`: a lean read UI (position rooms → player list → full-screen player detail with both write paths), backed by a verbatim port of web's pure grading/history lib.

**Architecture:** Pure logic ports verbatim from `unlock-web/src/lib` into mirrored mobile `lib/` modules (DRY cross-repo). A lean `loadTeamScouting()` re-authors web's loader against the mobile `supabase` client, reusing every pure helper. Three expo-router screens replace/relocate the old benchmarks flow.

**Tech Stack:** Expo SDK 54 / React Native 0.81, expo-router (Stack), Supabase JS, TypeScript. No test runner — gate is `npx tsc --noEmit` + manual checklist.

**Conventions (non-negotiable):** `ActionModal` not `Alert.alert`; `TouchableOpacity` static-style + `activeOpacity` (Pressable function-style is broken in this SDK); bottom-button clearance `insets.bottom + 60`; surface/skill-group tokens, never hex literals; `playerColorForIndex(colorIndex)` for avatars (no position override); `Section`/`SectionLabel` form wrappers; relative imports (mobile has NO `@/` alias).

**Commit policy:** Per the project's one-commit-per-branch rule, do NOT commit per task. Each task ends with a `npx tsc --noEmit` checkpoint. A single commit on `build-17-scouting-report` lands in the final task (Task 13).

**Precondition:** Branch `build-17-scouting-report` already exists and is checked out, off a clean `main` (`a0280bf`). The two spec docs (`docs/specs/2026-06-09-scouting-report-design.md`, `-plan.md`) are untracked in the tree and will be included in the Task 13 commit.

**Port path map (web → mobile):**

| Web source | Mobile target | Port kind |
|---|---|---|
| `src/lib/benchmarks/metrics.ts` | `lib/benchmarks/metrics.ts` | verbatim (no imports) |
| `src/lib/benchmarks/confidence.ts` | `lib/benchmarks/confidence.ts` | verbatim (no imports) |
| `src/lib/benchmarks/player-history.ts` | `lib/benchmarks/player-history.ts` | verbatim + import rewrite |
| `src/lib/benchmarks/skill-group-trend.ts` | `lib/benchmarks/skill-group-trend.ts` | verbatim + import rewrite |
| `src/lib/scouting/player-grade.ts` | `lib/scouting/player-grade.ts` | verbatim + import rewrite |
| `src/lib/benchmarks/skill-group-maps.ts` | `lib/benchmarks/skill-group-maps.ts` | verbatim + import rewrite |
| `src/lib/dashboard/heat-scale.ts` | `lib/dashboard/heat-scale.ts` | new (reproduced below) |
| `src/lib/drills/skill-groups.ts` (subset) | `constants/skill-groups.ts` (extend) | new exports (reproduced below) |
| `src/lib/dashboard/team-scouting-data.ts` (subset) | `lib/scouting/team-scouting-data.ts` | re-authored lean loader |

**Import-rewrite rule for verbatim ports:** web uses the `@/` alias; mobile uses relative paths. On mobile:
- `@/lib/types/skills` (for `SkillGroup`) → `../../constants/skill-groups`
- `@/lib/drills/skill-groups` → `../../constants/skill-groups`
- `@/lib/dashboard/heat-scale` → `../dashboard/heat-scale`
- `@/lib/benchmarks/metrics` → `./metrics`
- `@supabase/supabase-js` → unchanged (external)

---

### Task 1: Port the zero-dependency pure modules (metrics, confidence)

**Files:**
- Create: `lib/benchmarks/metrics.ts`
- Create: `lib/benchmarks/confidence.ts`

- [ ] **Step 1: Copy `metrics.ts` verbatim.** Read `unlock-web/src/lib/benchmarks/metrics.ts` in full and write its **exact** contents to `lib/benchmarks/metrics.ts`. It has **no imports** — copy byte-for-byte. Exports to confirm present: `type PulseBenchmarkType`, `pulseUnit()`, `isInverse()`, `valueFromBenchmark()`.

- [ ] **Step 2: Copy `confidence.ts` verbatim.** Read `unlock-web/src/lib/benchmarks/confidence.ts` in full and write its exact contents to `lib/benchmarks/confidence.ts`. No imports. Exports to confirm: `RELIABLE_MIN` (=3), `EARLY_MIN`, `type ConfidenceTier`, `confidenceTier()`, `drillsToReliable()`, `tierLabel()`.

- [ ] **Step 3: Checkpoint.** Run `npx tsc --noEmit`. Expected: PASS (no new errors from these two files).

---

### Task 2: Create mobile `heat-scale.ts` (new — port target for grading)

**Files:**
- Create: `lib/dashboard/heat-scale.ts`

- [ ] **Step 1: Write the file.** Create `lib/dashboard/heat-scale.ts` with this exact content (verbatim from web; no imports, so no rewrites):

```typescript
// Heat-map grading for the Team Scouting Report (Build 8.7).
//
// Single source of truth for how a 0..1 skill composite becomes a letter grade
// and a cell color. Every heat cell ALWAYS shows its letter grade — color only
// reinforces — so the surface is colorblind-safe and never relies on hue alone.
//
// PALETTE ISOLATION: these five hexes are a purpose-built diverging scale. They
// deliberately do NOT reuse the team/player/skill-group identity colors. On the
// scouting page the heat scale is a DATA encoding; identity colors are IDENTITY
// encodings. Mixing them would make "green = strong" collide with "green =
// player 3". This module never imports identity palettes.

export type Grade = "A" | "B" | "C" | "D" | "F";

export type HeatMode = "absolute" | "relative";
export const SCOUTING_HEAT_MODE: HeatMode = "absolute";

const HEAT_COLORS: Record<Grade, string> = {
  F: "#C2433A",
  D: "#C76B2E",
  C: "#B59331",
  B: "#5B9E54",
  A: "#3E9D6E",
};

export const HEAT_LOCKED_COLOR = "rgba(255,255,255,0.05)";

export function scoreToGrade(score: number | null): Grade | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 0.85) return "A";
  if (score >= 0.7) return "B";
  if (score >= 0.55) return "C";
  if (score >= 0.4) return "D";
  return "F";
}

export function gradeColor(grade: Grade | null): string {
  if (grade == null) return HEAT_LOCKED_COLOR;
  return HEAT_COLORS[grade];
}

export function scoreToHeatColor(score: number | null): string {
  return gradeColor(scoreToGrade(score));
}

export function gradeLabel(grade: Grade): string {
  switch (grade) {
    case "A":
      return "Reliable under pressure";
    case "B":
      return "Solid, minor refinements";
    case "C":
      return "Gets it done, inconsistent";
    case "D":
      return "Struggles, needs work";
    case "F":
      return "Can't execute yet";
  }
}

export function relativeScore(
  value: number | null,
  min: number,
  max: number
): number | null {
  if (value == null) return null;
  if (max <= min) return null;
  return (value - min) / (max - min);
}
```

- [ ] **Step 2: Verify against web.** Diff your file against `unlock-web/src/lib/dashboard/heat-scale.ts`. The only allowed differences are comment wording. The `scoreToGrade` thresholds (0.85/0.7/0.55/0.4) and `HEAT_COLORS` hexes MUST match exactly — these drive grades and must not drift.

- [ ] **Step 3: Checkpoint.** Run `npx tsc --noEmit`. Expected: PASS.

---

### Task 3: Extend `constants/skill-groups.ts` with the position-room helpers

**Files:**
- Modify: `constants/skill-groups.ts`

The mobile file already exports `SkillGroup`, `SkillGroupMeta`, `SKILL_GROUP_META`, `skillGroupMeta()`, `PHASE_TO_SKILL_GROUPS`, `colorForSkillGroup()`, `tintForSkillGroup()`. Add the position-room layer ported from `unlock-web/src/lib/drills/skill-groups.ts`.

- [ ] **Step 1: Read the web source.** Open `unlock-web/src/lib/drills/skill-groups.ts`. Locate `PositionRoom` type, `POSITION_ROOMS`, `sideForPosition()`, `SKILL_AREA_LABEL` constant, `roomForPrimaryPosition()`, `skillGroupsForPositions()`, `skillAreaLabel()`, `roomIdForSkillGroup()`.

- [ ] **Step 2: Append the new exports to `constants/skill-groups.ts`.** Add the following. If web's `skillGroupsForPositions` calls a `sideForPosition()` helper, port that helper too (copy it verbatim from the web file). The `SKILL_AREA_LABEL` constant must be copied from the web file (it maps each `SkillGroup` → its area label string).

```typescript
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

// Copy SKILL_AREA_LABEL and sideForPosition VERBATIM from
// unlock-web/src/lib/drills/skill-groups.ts (lines ~80–86 and the
// sideForPosition helper). Do not invent the label strings — match web.

export function roomForPrimaryPosition(
  positions: string[] | null | undefined
): PositionRoom | null {
  const primary = positions?.[0];
  if (!primary) return null;
  return POSITION_ROOMS.find((r) => r.positions.includes(primary)) ?? null;
}

export function skillGroupsForPositions(
  positions: string[] | null | undefined
): SkillGroup[] {
  const set = new Set<SkillGroup>(["athletic", "iq"]);
  for (const p of positions ?? []) {
    if (p === "QB") set.add("qb");
    else if (sideForPosition(p) === "offense") set.add("offense");
    else if (sideForPosition(p) === "defense") set.add("defense");
  }
  return SKILL_GROUP_META.filter((m) => set.has(m.id)).map((m) => m.id);
}

export function skillAreaLabel(id: SkillGroup): string {
  return SKILL_AREA_LABEL[id];
}

export function roomIdForSkillGroup(
  group: SkillGroup
): PositionRoom["id"] | null {
  const room = POSITION_ROOMS.find((r) => r.signature === group);
  return room ? room.id : null;
}
```

- [ ] **Step 3: Confirm `SkillGroup` union matches web.** Mobile `SkillGroup` must be `"athletic" | "offense" | "qb" | "defense" | "iq"` (it is). `skillGroupsForPositions` seeds `["athletic","iq"]` and adds position-relevant groups — same as web.

- [ ] **Step 4: Checkpoint.** Run `npx tsc --noEmit`. Expected: PASS.

---

### Task 4: Port `player-history.ts` and `skill-group-trend.ts` (verbatim + import rewrites)

**Files:**
- Create: `lib/benchmarks/player-history.ts`
- Create: `lib/benchmarks/skill-group-trend.ts`

- [ ] **Step 1: Port `player-history.ts`.** Read `unlock-web/src/lib/benchmarks/player-history.ts` in full. Write it to `lib/benchmarks/player-history.ts` verbatim, EXCEPT rewrite the import header:

  Web:
  ```typescript
  import { valueFromBenchmark, isInverse, pulseUnit, type PulseBenchmarkType } from "@/lib/benchmarks/metrics";
  ```
  Mobile:
  ```typescript
  import { valueFromBenchmark, isInverse, pulseUnit, type PulseBenchmarkType } from "./metrics";
  ```
  Exports to confirm: `type BenchHistoryRow`, `type Sample`, `type PlayerHistoryDrill`, `type PlayerHistoryLocked`, `buildPlayerHistory()`, `unitFor()`, `betterFor()`, `accentFor()`, `formatValue()`.

- [ ] **Step 2: Port `skill-group-trend.ts`.** Read `unlock-web/src/lib/benchmarks/skill-group-trend.ts` in full. Write it to `lib/benchmarks/skill-group-trend.ts` verbatim, EXCEPT rewrite the import header:

  Web:
  ```typescript
  import type { SkillGroup } from "@/lib/types/skills";
  import { SKILL_GROUP_META, skillAreaLabel, skillGroupsForPositions } from "@/lib/drills/skill-groups";
  ```
  Mobile:
  ```typescript
  import type { SkillGroup } from "../../constants/skill-groups";
  import { SKILL_GROUP_META, skillAreaLabel, skillGroupsForPositions } from "../../constants/skill-groups";
  ```
  Exports to confirm: `type SkillGroupTrendRow`, `type SkillGroupTrendSeries`, `type SkillGroupTrend`, `WEEKS_WINDOW` (=4), `buildSkillGroupTrend()`, `absScore()`.

  **Note:** web's `SKILL_GROUP_META` items have `{id,label,longLabel,color,blurb}`. Mobile's also has `tint`. `skill-group-trend` reads `.color` and `.label`/`.id` only — compatible. If it reads `.longLabel`, confirm mobile's meta has it (it does).

- [ ] **Step 3: Checkpoint.** Run `npx tsc --noEmit`. Expected: PASS (resolves `./metrics` and `../../constants/skill-groups`).

---

### Task 5: Port `player-grade.ts` (the task-#2 dependency — verbatim + import rewrites)

**Files:**
- Create: `lib/scouting/player-grade.ts`

- [ ] **Step 1: Port the file.** Read `unlock-web/src/lib/scouting/player-grade.ts` in full. Write it to `lib/scouting/player-grade.ts` verbatim, EXCEPT rewrite the import header:

  Web:
  ```typescript
  import type { SkillGroup } from "@/lib/types/skills";
  import { scoreToGrade, type Grade } from "@/lib/dashboard/heat-scale";
  import { skillGroupsForPositions, skillAreaLabel, roomForPrimaryPosition } from "@/lib/drills/skill-groups";
  ```
  Mobile:
  ```typescript
  import type { SkillGroup } from "../../constants/skill-groups";
  import { scoreToGrade, type Grade } from "../dashboard/heat-scale";
  import { skillGroupsForPositions, skillAreaLabel, roomForPrimaryPosition } from "../../constants/skill-groups";
  ```
  Exports to confirm: `type GroupScore`, `type PlayerGroupGrades`, `gradePlayerGroups()`, `type RelativeStanding`, `STANDING_MIN` (=3), `relativeStandingFor()`.

- [ ] **Step 2: Checkpoint.** Run `npx tsc --noEmit`. Expected: PASS. This module is the single source of truth reused by Build 17 (here) and Build #2 (Player Card) — it must compile clean against the mobile heat-scale + skill-groups.

---

### Task 6: Port `skill-group-maps.ts` (Supabase fetch — verbatim + import rewrite)

**Files:**
- Create: `lib/benchmarks/skill-group-maps.ts`

- [ ] **Step 1: Port the file.** Read `unlock-web/src/lib/benchmarks/skill-group-maps.ts` in full. Write it to `lib/benchmarks/skill-group-maps.ts` verbatim, EXCEPT rewrite the import header:

  Web:
  ```typescript
  import type { SupabaseClient } from "@supabase/supabase-js";
  import type { SkillGroup } from "@/lib/types/skills";
  ```
  Mobile:
  ```typescript
  import type { SupabaseClient } from "@supabase/supabase-js";
  import type { SkillGroup } from "../../constants/skill-groups";
  ```
  Keep the function signature `loadSkillGroupMaps(supabase: SupabaseClient, teamId: string)` — the mobile loader passes the shared `supabase` client in. Copy the `.from(...).select(...)` queries byte-for-byte so RLS scoping matches web. Exports to confirm: `type SkillGroupMaps`, `loadSkillGroupMaps()`.

- [ ] **Step 2: Checkpoint.** Run `npx tsc --noEmit`. Expected: PASS.

---

### Task 7: Lean loader `lib/scouting/team-scouting-data.ts`

**Files:**
- Create: `lib/scouting/team-scouting-data.ts`

This re-authors web's monolithic loader as a lean version: it computes **rooms** and **player cards** only (no movers / leaderboards / headline decisions). It reuses every pure helper.

- [ ] **Step 1: Define the module skeleton, types, and `roleReadFromGrade` + `buildVerdict`.** Write the file header, imports, and the verdict logic (ported verbatim from web's loader):

```typescript
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
  timeSeconds: number | null;
  rating: number | null;
  madeCount: number | null;
  attemptsCount: number | null;
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
};

export type TeamScoutingData = {
  rooms: RoomCell[];
  playerCards: PlayerReportCard[];
  rosterSize: number;
  assessedPlayers: number;
  anyData: boolean;
};

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
    .sort((a, b) => a.composite - b.composite);
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
```

- [ ] **Step 2: Write the fetch layer of `loadTeamScouting`.** Mirror web's exact `select()` strings so RLS + shape match:

```typescript
export async function loadTeamScouting(teamId: string): Promise<TeamScoutingData> {
  const [playersRes, profileRes, benchRes, notesRes, maps] = await Promise.all([
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
        "id, player_id, drill_id, assessment_date, time_seconds, rating, made_count, attempts_count, benchmark_type, tags, team_drills(id, drill_name, benchmark_type, benchmark_types)"
      )
      .eq("team_id", teamId),
    supabase
      .from("player_notes")
      .select("id, player_id, note_text, created_at, practice_plan_id, practice_plans(id, title, practice_date)")
      .eq("team_id", teamId),
    loadSkillGroupMaps(supabase, teamId),
  ]);

  const players = playersRes.data ?? [];
  const profiles = profileRes.data ?? [];
  const benchmarks = benchRes.data ?? [];
  const notes = notesRes.data ?? [];
  // ... aggregation in Step 3
```

  **Note on `benchmark_type` vs `benchmark_types`:** the `team_drills` join returns both; `buildPlayerHistory` consumes the joined `team_drills` shape directly — pass rows through as `BenchHistoryRow`. Reference web's `evidenceFor()` for the exact row mapping.

- [ ] **Step 3: Write the aggregation,** mirroring web's `loadTeamScoutingData` player loop (web lines ~640–780). For each player, in this order:
  1. Group `profiles` by `player_id` → `PlayerSkill[]` (`composite = composite_score`, `sampleSize = drill_sample_size`).
  2. Build `groupComposites: Map<SkillGroup, number|null>` by averaging composites within each group, then `gradePlayerGroups(groupComposites, positions)` → `{ groupScores, overallScore, overallGrade }`.
  3. Group this player's `benchmarks` rows → `BenchHistoryRow[]`; `buildPlayerHistory(rows)` → `{ drills, locked, benchmarkCount }` (→ `historyDrills`, `historyLocked`, `benchmarkCount`).
  4. `buildSkillGroupTrend({ rows, drillSkills: maps.drillSkills, skillGroupById: maps.skillGroupById, positions, now: new Date() })` → `skillGroupTrend`.
  5. Compute `recentTags` from benchmark `tags` arrays (count frequency, desc), `editableResults` from the raw rows, `observations` from `notes` for this player (`noteCount = observations.length`).
  6. `buildVerdict({ firstName, overallGrade, skillProfile, recentTags, historyDrills, benchmarkCount })`.
  7. `initials = initialsFromName(player_name)`, `color = playerColorForIndex(color_index)`, `primaryPosition = positions?.[0] ?? null`, `roomLabel = roomForPrimaryPosition(positions)?.label ?? null`.
  8. `weakestGroupLabel` = label of the lowest-scored measured group (from `groupScores`).
  Assemble the `PlayerReportCard`.

  Then **sort** cards: assessed players by `overallScore` ascending (weakest first), unassessed (`overallScore == null`) last. (Matches web.)

- [ ] **Step 4: Compute rooms.** For each of `POSITION_ROOMS`: gather cards whose `roomForPrimaryPosition(positions)?.id === room.id`. `players` = count; `assessed` = count with `overallScore != null`; `score` = mean of assessed `overallScore` (or null); `grade = scoreToGrade(score)`; `color = scoreToHeatColor(score)`; `gradeReliable = assessed >= ROOM_RELIABLE_MIN`; `locked = assessed === 0`. `weakestGroup`/`weakestSkillLabel`: the lowest-scored group across the room's assessed cards, label via `skillAreaLabel`; `ctaFocusSkillId` = that group's weakest skill id if available else null.

- [ ] **Step 5: Compute relative standing** (post-pass, mirrors web lines ~777): for each card, `relativeStandingFor({ playerId, positions }, cohort)` where `cohort` = all cards in the same room with `{ playerId, positions, overallScore }`. Attach to `card.relativeStanding`.

- [ ] **Step 6: Return** `{ rooms, playerCards, rosterSize: players.length, assessedPlayers: count overallScore!=null, anyData: assessedPlayers > 0 || benchmarks.length > 0 }`.

- [ ] **Step 7: Checkpoint.** Run `npx tsc --noEmit`. Expected: PASS. Cross-check every helper call signature against the ported modules' exported signatures (Tasks 4–6).

---

### Task 8: Write mutation helpers (`correctBenchmarkResult`, `addPlayerNote`)

**Files:**
- Modify: `lib/benchmarks.ts` (add `correctBenchmarkResult`)
- Create: `lib/player-notes.ts` (add `addPlayerNote`) — or add to an existing notes module if one exists; check first with `grep -rn "player_notes" lib/`.

- [ ] **Step 1: Inspect web write paths.** Read web's `correctBenchmarkResult` and `addPlayerNote` server actions (search `unlock-web/src` for those names). Note the exact columns each updates/inserts and any attribution fields (`assessed_by`, `created_by`, `updated_by`) — mobile must stamp the same per the attribution model.

- [ ] **Step 2: Add `correctBenchmarkResult`** to `lib/benchmarks.ts`. Follow the existing `upsertBenchmarkResult` pattern in that file (natural-key update). Signature:
```typescript
export async function correctBenchmarkResult(input: {
  resultId: string;
  teamId: string;
  benchmarkType: string;
  timeSeconds?: number | null;
  rating?: number | null;
  madeCount?: number | null;
  attemptsCount?: number | null;
}): Promise<{ ok: boolean; error?: string }>;
```
Update only the metric column(s) relevant to `benchmarkType` on the `benchmark_results` row by `id` + `team_id`. Stamp `updated_by` with the current `auth.uid()` if web does (confirm in Step 1). Return `{ ok }` or `{ ok:false, error }`.

- [ ] **Step 3: Add `addPlayerNote`.** Signature:
```typescript
export async function addPlayerNote(input: {
  teamId: string;
  playerId: string;
  noteText: string;
}): Promise<{ ok: boolean; error?: string }>;
```
Insert into `player_notes` (`team_id`, `player_id`, `note_text`, and `created_by` if web stamps it). Return `{ ok }`.

- [ ] **Step 4: Checkpoint.** Run `npx tsc --noEmit`. Expected: PASS.

---

### Task 9: Relocate the old hub → `app/benchmarks/run.tsx`; re-point entry points

**Files:**
- Create: `app/benchmarks/run.tsx` (moved content)
- Modify: drill detail screen + dashboard quick-action (re-point routes)

- [ ] **Step 1: Capture current `index.tsx`.** Read the current `app/benchmarks/index.tsx` (the write-first hub: select drill + players → log). NOTE: this file was modified by the WIP commit on `build-16.6` — on `build-17` (off clean `main`) it is the `main` version. Confirm with `git show main:app/benchmarks/index.tsx | head`.

- [ ] **Step 2: Create `run.tsx`.** Copy the entire current `index.tsx` content into `app/benchmarks/run.tsx` **verbatim**. This becomes the hub. Its internal `router.push("/benchmarks/log?...")` calls stay as-is (log/review/complete unchanged).

- [ ] **Step 3: Re-point external entry points.** Grep for navigations into the hub: `grep -rn "/benchmarks\"" app/ components/` and `grep -rn "benchmarks')" app/ components/` and look at the drill detail "Run Benchmark" button + dashboard "Run Assessment" quick action. Change each that meant "open the hub" from `/benchmarks` → `/benchmarks/run`. (Do NOT change links that should land on the new scouting landing — e.g. a bottom-nav/tab entry that means "scouting" stays `/benchmarks`.)

- [ ] **Step 4: Checkpoint.** Run `npx tsc --noEmit`. Expected: PASS. (`index.tsx` still contains the old hub here — replaced in Task 10. Both routes valid meanwhile.)

---

### Task 10: New read-first landing `app/benchmarks/index.tsx`

**Files:**
- Overwrite: `app/benchmarks/index.tsx`
- Create (optional): `components/scouting/RoomCard.tsx`, `components/scouting/ScoutPlayerRow.tsx`, `components/scouting/GradeBadge.tsx` (extract reused atoms here for DRY; the detail screen reuses `GradeBadge`).

- [ ] **Step 1: Build `GradeBadge` atom.** `components/scouting/GradeBadge.tsx`: props `{ grade: Grade | null; size?: "sm" | "md" }`. Renders the letter in a box colored via `gradeColor(grade)` from `lib/dashboard/heat-scale`; null → muted "—". Use `colors`/`radius` tokens, `fontStyle` mono. No hex literals beyond what `gradeColor` returns.

- [ ] **Step 2: Build the landing screen.** Overwrite `app/benchmarks/index.tsx`:
  - `useTeam()` → `{ teamId, canManage }`; `useRouter()`; `useSafeAreaInsets()`; `useState` for `data: TeamScoutingData | null` + `loading`.
  - `useFocusEffect(useCallback(() => { load() }, [teamId]))` calling `loadTeamScouting(teamId)`.
  - Header: back/title + top-right **"Run benchmark"** `TouchableOpacity` (static style, `activeOpacity={0.8}`) → `router.push("/benchmarks/run")`.
  - If `loading` → skeleton (reuse existing `SkeletonCard` from the old hub if present).
  - If `!data?.anyData` → cold-start empty state: short copy + primary "Run your first benchmark" button → `/benchmarks/run`.
  - Else, a `ScrollView` (contentContainerStyle paddingBottom `insets.bottom + 60`):
    - **Rooms section:** 3 `RoomCard`s from `data.rooms`. Each: `room.label`, `GradeBadge` (`room.grade`), `assessed/players` count, `weakestSkillLabel` (if any), provisional styling when `!room.gradeReliable`, `locked` style when `room.locked`.
    - **Players section:** `data.playerCards` rendered as `ScoutPlayerRow`s, grouped by `roomLabel` (or one flat list ordered weakest-first as the loader sorted them). Each row tappable → `router.push(\`/benchmarks/player/${card.playerId}\`)`.

- [ ] **Step 3: Build `ScoutPlayerRow`.** `components/scouting/ScoutPlayerRow.tsx`: props `{ card: PlayerReportCard; onPress: () => void }`. `TouchableOpacity` (static style, `activeOpacity`). Left: avatar circle (bg `card.color` via `playerColorForIndex`, `card.initials`). Middle: `card.name`, position pills, `card.relativeStanding?.line` (if present). Right: `GradeBadge` (`card.overallGrade`). Tokens only.

- [ ] **Step 4: Checkpoint.** Run `npx tsc --noEmit`. Expected: PASS.

---

### Task 11: New full-screen detail `app/benchmarks/player/[id].tsx` (read sections)

**Files:**
- Create: `app/benchmarks/player/[id].tsx`

- [ ] **Step 1: Scaffold + data.** Create the screen:
  - `useLocalSearchParams<{ id: string }>()`; `useTeam()`; `useSafeAreaInsets()`; `useRouter()`.
  - State `card: PlayerReportCard | null` + `loading`. On focus, run `loadTeamScouting(teamId)` and `setCard(data.playerCards.find(c => c.playerId === id) ?? null)`. (Per spec: re-resolve via loader; the card carries all pre-loaded evidence — no extra fetch.)
  - Loading skeleton; not-found fallback if `!card`.

- [ ] **Step 2: Render read sections** in a `ScrollView` (paddingBottom `insets.bottom + 60`), using `Section`/`SectionLabel` wrappers and numbered eyebrows:
  1. `AthleteHero` — `initials={card.initials}`, `fullName={card.name}`, `accent={card.color}`, `side`/`primary`/`secondary` from `card.positions`, `eyebrow={{ label: card.verdict.roleRead, color: <token> }}`.
  2. **Verdict** — role chip + `card.verdict.headline`; if `canManage` and `card.verdict.gapSkillId`, a CTA button labeled `card.verdict.ctaLabel` (→ practice planner route; reuse mobile's existing planner entry, passing focus skill if the route supports it — otherwise plain push).
  3. **Group pills** — map `card.groupScores` to small `GradeBadge` + group label (`skillAreaLabel(group)`).
  4. **Most-tagged** — `card.recentTags` as chips sized/ordered by count (cap at ~6).
  5. `PlayerSkillProfileCard` — reuse the existing component (`components/PlayerSkillProfileCard`). Feed it `card.skillProfile` (map to its expected props; check its signature).
  6. **Skill-group trend** — render `card.skillGroupTrend`. If a mobile trend chart exists, reuse it; else a compact per-series rows view (week count + latest score). Keep it tokenized; do not pull in a charting lib for this build unless one is already present.
  7. **Per-drill history** — `card.historyDrills` as rows (drill name, latest formatted value via `formatValue`, direction arrow from `betterFor`); `card.historyLocked` as muted "locked" tails.
  8. **Observations** — `card.observations` feed (note text + practice title/date).

- [ ] **Step 3: Checkpoint.** Run `npx tsc --noEmit`. Expected: PASS.

---

### Task 12: Detail write paths (result-correction + add-note)

**Files:**
- Modify: `app/benchmarks/player/[id].tsx`
- (Optional) Create: `components/scouting/CorrectResultRow.tsx`, `components/scouting/AddNoteForm.tsx`

- [ ] **Step 1: Result-correction rows (canManage only).** Add a section listing `card.editableResults`. Each row shows drill name + current value + an "Edit" `TouchableOpacity`. Tapping reveals per-type inputs:
  - `rated` → 1–5 pill row (reuse `RatingRow` from `components/benchmark/CaptureWidgets` if compatible).
  - `pct` → made / attempts number inputs.
  - `timed` → seconds number input (reuse `ManualTimeInput` if compatible).
  - `reps`/`flags`/`drops` → count input.
  Save → `correctBenchmarkResult({ resultId, teamId, benchmarkType, ...metric })`. On success, confirm via `ActionModal` (`useActionModal().show`) and re-run the loader to refresh `card`. On error, `showError`.

- [ ] **Step 2: Add-note form (canManage only).** Below observations: a text input + "Add note" `TouchableOpacity`. Submit → `addPlayerNote({ teamId, playerId: card.playerId, noteText })`. On success, clear input + re-run loader to refresh observations. Use `ActionModal` for errors. NEVER `Alert.alert`.

- [ ] **Step 3: Freshness.** Confirm both writes call the same `load()` used on focus so the detail reflects the change immediately (spec risk #3).

- [ ] **Step 4: Checkpoint.** Run `npx tsc --noEmit`. Expected: PASS.

---

### Task 13: Verify, document, single commit

**Files:**
- Modify: `CLAUDE.md` (Build Status → Shipped: add Build 17 line)
- Commit: all scouting paths + the two spec docs

- [ ] **Step 1: Full typecheck.** Run `npx tsc --noEmit`. Expected: PASS, zero errors.

- [ ] **Step 2: Manual smoke (per spec checklist).** Start the app (`npx expo start`), and verify: cold-start empty state; a room with ≥3 assessed shows a reliable grade; a 1-player room shows provisional; tapping a player opens the detail with grade + verdict + history + observations; correct a result → value updates; add a note → appears; all three "Run benchmark" entry points reach `/benchmarks/run`. Fix any breakage, re-typecheck.

- [ ] **Step 3: Update `CLAUDE.md` Build Status.** Under "### Shipped", add a `Build 17 — Scouting Report (mobile)` line summarizing: read-first scouting landing (rooms + player list), full-screen player detail with result-correction + add-note, pure lib ported from web (`player-grade`, `metrics`, `confidence`, `player-history`, `skill-group-trend`, `skill-group-maps`) + new mobile `heat-scale.ts` + extended `skill-groups.ts`, old hub → `/benchmarks/run`. Branch `build-17-scouting-report`.

- [ ] **Step 4: Update memory + cross-repo keep-in-sync list.** In `feedback_dry_everywhere.md` (or wherever the cross-repo dup list lives), add the newly-mirrored modules (`player-grade.ts`, `metrics.ts`, `confidence.ts`, `player-history.ts`, `skill-group-trend.ts`, `skill-group-maps.ts`, `heat-scale.ts`, skill-groups position helpers) to the keep-in-sync list alongside `PHASE_TO_SKILL_GROUPS` / `SkillChip`. Add/refresh a `project_*` memory for Build 17.

- [ ] **Step 5: Single commit on `build-17-scouting-report`.** Per the one-commit-per-branch rule, stage explicit scouting paths only (the in-flight practice WIP is already committed on `build-16.6` and must NOT reappear here). Force-checkout the target branch inside the commit command to avoid the env's branch-bounce:

```bash
git checkout build-17-scouting-report
git add \
  lib/benchmarks/metrics.ts lib/benchmarks/confidence.ts \
  lib/benchmarks/player-history.ts lib/benchmarks/skill-group-trend.ts \
  lib/benchmarks/skill-group-maps.ts lib/scouting/player-grade.ts \
  lib/scouting/team-scouting-data.ts lib/dashboard/heat-scale.ts \
  constants/skill-groups.ts lib/benchmarks.ts lib/player-notes.ts \
  "app/benchmarks/index.tsx" "app/benchmarks/run.tsx" \
  "app/benchmarks/player/[id].tsx" \
  components/scouting/ \
  docs/specs/2026-06-09-scouting-report-design.md \
  docs/specs/2026-06-09-scouting-report-plan.md \
  docs/specs/2026-06-09-mobile-parity-roadmap.md \
  CLAUDE.md
# include any entry-point files changed in Task 9 (drill detail / dashboard)
git commit -m "feat(scouting): read-first scouting report + player detail (Build 17 mobile parity)"
git status --short   # verify clean; no practice-WIP files staged
```

- [ ] **Step 6: Verify isolation.** Run `git show --stat HEAD | head -40` and confirm only scouting paths + docs + CLAUDE.md are in the commit — zero practice/check-in/coach-assign files (those belong to `build-16.6`).

---

## Self-Review

**Spec coverage:**
- Lib port (full) → Tasks 1–6. ✓
- New `heat-scale.ts` → Task 2. ✓
- Extend `skill-groups.ts` → Task 3. ✓
- Lean loader → Task 7. ✓
- Landing (rooms + player list) → Task 10. ✓
- Full-screen detail (read) → Task 11. ✓
- Both write paths → Tasks 8 + 12. ✓
- Entry restructure (index→landing, hub→run, re-point) → Tasks 9–10. ✓
- Conventions (ActionModal/TouchableOpacity/clearance/tokens/playerColorForIndex) → enforced per task. ✓
- Deferred sections (decisions/movers/leaderboards) → explicitly NOT in loader (Task 7) or UI. ✓
- Testing (tsc + manual) → checkpoints every task + Task 13. ✓
- Single commit, WIP isolation → Task 13. ✓

**Type consistency:** `loadTeamScouting(teamId)` (Task 7) is the single loader called by Tasks 10/11/12. `PlayerReportCard`, `RoomCell`, `PlayerVerdict`, `GroupScore`, `TeamScoutingData` defined once in Task 7 and consumed unchanged downstream. `GradeBadge` defined in Task 10, reused in Task 11. `correctBenchmarkResult`/`addPlayerNote` signatures (Task 8) match their call sites (Task 12).

**Open verification points the executor must confirm against web (flagged inline):** exact `select()` for `loadSkillGroupMaps` (Task 6); `sideForPosition` + `SKILL_AREA_LABEL` existence/contents (Task 3); attribution stamps on the two mutations (Task 8); `PlayerSkillProfileCard` prop shape (Task 11). None are placeholders — each names the source file to read.
