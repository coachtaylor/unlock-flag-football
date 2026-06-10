# Scouting Report — Mobile (Build 17)

> **Date:** 2026-06-09
> **Status:** Design approved. Next: implementation plan.
> **Roadmap:** Task #1 of `docs/specs/2026-06-09-mobile-parity-roadmap.md`.
> **Branch:** `build-17-scouting-report` (single commit per one-commit-per-branch rule).

## Purpose

Bring web's read-first, position-aware **scouting hub** to `unlock-mobile`.
Web's `benchmarks` route is now a scouting report graded on position-relevant
skill groups (3 rooms: QB / Receivers / Defense). Mobile's `app/benchmarks/*` is
still the old **write-first** flow (pick drill + players → log). This build makes
the read-first scouting view the landing surface and demotes the old hub to a
"Run benchmark" action.

**Why first in the roadmap:** it lands the shared grade lib
(`player-grade.ts`) + skill-group maps on mobile, which **task #2 (Player Card)
reuses verbatim**. The pure logic is the real dependency payload.

## Scope

**In (v1):**
- Pure lib port (full) — the grading/ranking/history math.
- Lean read UI: position rooms + player list + full-screen player detail.
- Full player-detail write parity: inline result-correction + add-observation.
- Entry restructure: scouting replaces `app/benchmarks/index.tsx`; old hub → `/benchmarks/run`.

**Deferred to a follow-up build:**
- §0 headline team-decisions card.
- Movement strips (risers / stalled / regressed).
- Drill leaderboards.

**Out (cross-cutting roadmap rule):** no new SQL. Backend (tables, views, RPCs)
is already shared and live. Parity = mobile UI + a mobile `lib/` port of web
pure-logic.

## Architecture

### 1. Lib port — the DRY payload

Web keeps canonical logic in `unlock-web/src/lib`. These port to mirrored mobile
`lib/` modules and join the cross-repo keep-in-sync list (alongside the existing
`PHASE_TO_SKILL_GROUPS` / `SkillChip` dups). No logic reinvented in components.

**Copied verbatim (pure, no IO):**
| Mobile path | Web source |
|---|---|
| `lib/benchmarks/metrics.ts` | `src/lib/benchmarks/metrics.ts` |
| `lib/benchmarks/confidence.ts` | `src/lib/benchmarks/confidence.ts` |
| `lib/benchmarks/player-history.ts` | `src/lib/benchmarks/player-history.ts` |
| `lib/benchmarks/skill-group-trend.ts` | `src/lib/benchmarks/skill-group-trend.ts` |
| `lib/scouting/player-grade.ts` | `src/lib/scouting/player-grade.ts` |

`player-grade.ts` exports `gradePlayerGroups()` + `relativeStandingFor()` — the
single source of truth task #2 reuses. It must not drift from web.

**New on mobile (dependencies the port needs — currently absent):**
- `lib/dashboard/heat-scale.ts` — `Grade`, `scoreToGrade`, `scoreToHeatColor`,
  `gradeLabel`. `player-grade.ts` imports these. Mirror web's
  `src/lib/dashboard/heat-scale.ts`.
- Extend `constants/skill-groups.ts` — add `POSITION_ROOMS`,
  `roomForPrimaryPosition()`, `skillGroupsForPositions()`, `skillAreaLabel()`,
  `roomIdForSkillGroup()` to match web's `src/lib/drills/skill-groups.ts`.
  (Mobile's file already has `SkillGroup`, `SKILL_GROUP_META`,
  `PHASE_TO_SKILL_GROUPS`, `colorForSkillGroup`, `tintForSkillGroup`.)

**Re-authored against mobile `supabase` client (fetch shape identical to web):**
- `lib/benchmarks/skill-group-maps.ts` — `loadSkillGroupMaps(supabase, teamId)`
  → `{ drillSkills, skillGroupById }`.

### 2. Lean loader — `lib/scouting/team-scouting-data.ts`

One entry point: `loadTeamScouting(supabase, teamId)` →
`{ rooms, playerCards, rosterSize, assessedPlayers, anyData }`.

- Fetches the queries the lean UI needs: active `team_players`,
  `v_player_skill_profile`, `benchmark_results` (+ `team_drills` join),
  `player_notes`, and `loadSkillGroupMaps()`. (`loadTeamFocus` is optional and
  may be skipped since the headline section is deferred.)
- Aggregates in JS at MVP roster size, **reusing the pure helpers** —
  `gradePlayerGroups()`, `relativeStandingFor()`, `buildPlayerHistory()`,
  `buildSkillGroupTrend()`, and a ported `buildVerdict()` helper.
- **Pre-loads each card's detail evidence** so the detail screen never refetches:
  `historyDrills`, `historyLocked`, `skillGroupTrend`, `skillProfile`,
  `observations`, `recentTags`, `verdict`, `relativeStanding`, `editableResults`.

`RoomCell` and `PlayerReportCard` types mirror the web shapes (minus the
deferred-section fields). Movers / leaderboards / team-decisions are **not**
computed — they are out of v1 scope, keeping the loader small.

### 3. Screens (expo-router Stack, no header — existing benchmarks pattern)

**`app/benchmarks/index.tsx` — rewritten as read-first landing.**
- `useTeam()` → `teamId`, `canManage`. `useFocusEffect` refresh.
- 3 position rooms: each = label + `GradeBadge` + assessed count + weakest-skill
  label + CTA. Provisional styling when `< ROOM_RELIABLE_MIN` assessed.
- Player list grouped by room: avatar (`playerColorForIndex`), name, position
  pills, overall `GradeBadge`, relative-standing line. Tap → push detail.
- Top-right **"Run benchmark"** button → `/benchmarks/run`.
- Cold-start empty state when `!anyData`.

**`app/benchmarks/player/[id].tsx` — new full-screen detail.**
- `useLocalSearchParams<{ id }>`; resolves its card by running
  `loadTeamScouting(supabase, teamId)` and selecting `playerCards` by `id` (the
  card already carries all pre-loaded detail evidence — no extra fetch, no large
  object serialized through router params). `AthleteHero` at top.
- Sections (numbered eyebrows, `Section`/`SectionLabel` wrappers):
  1. Verdict header — role chip + headline + CTA (canManage).
  2. Position-relevant group pills.
  3. Most-tagged (tag cloud sized by frequency).
  4. `PlayerSkillProfileCard` (reused).
  5. Skill-group trend card.
  6. Per-drill history sparklines (from `buildPlayerHistory`).
  7. **(canManage)** inline result-correction rows — per-type inputs: rated 1–5
     pills, pct made/attempts, timed seconds, reps counter → `correctBenchmarkResult`.
  8. Observations feed (read) + add-note form (canManage) → `addPlayerNote`.
- Bottom-button clearance `insets.bottom + 60`.

**`app/benchmarks/run.tsx` — old hub relocated.**
- Former `index.tsx` content (select drill + players → log) moved here verbatim.
- `app/benchmarks/log.tsx`, `review.tsx`, `complete.tsx` unchanged.

### 4. Entry-point re-pointing

Drill detail "Run Benchmark", dashboard "Run Assessment", and the new landing's
"Run benchmark" button all → `/benchmarks/run`.

### 5. Write paths

- `correctBenchmarkResult(...)` and `addPlayerNote(...)` as mobile mutations in
  `lib/benchmarks.ts` (and a notes helper), following the existing
  `upsertBenchmarkResult` natural-key pattern.
- Confirms via `ActionModal` (never `Alert.alert`).
- After a write, refresh via re-running `loadTeamScouting` / re-fetching the card.

## Conventions (mobile, non-negotiable)

- `ActionModal`, not `Alert.alert`.
- `TouchableOpacity` with static style + `activeOpacity` — Pressable
  function-style is broken in this Expo SDK.
- Bottom-button clearance `insets.bottom + 60`.
- Surface / skill-group tokens, never hex literals.
- `playerColorForIndex(colorIndex)` for avatars — no position-based override.
- `Section` / `SectionLabel` form wrappers for every form block.
- DRY: ported lib is the one source of truth; no grade/history math inside
  components.

## Testing

Mobile has **no test runner** today (no vitest/jest, no test scripts). Standing
one up on Expo SDK 54 is out of scope for this build, and the ported pure modules
are **verbatim copies of web code that is already unit-tested there** — they
inherit that correctness. So the gates here are:

- **Automated:** `npx tsc --noEmit` must pass. This catches the real risk surface
  — import-path rewrites on the verbatim ports and type mismatches in the
  re-authored loader/screens.
- **Manual checklist:** cold-start empty state; single-player room (below
  `STANDING_MIN`); reliable room (≥3 assessed); a player detail renders grade +
  verdict + history + observations; result-correction round-trips; add-note
  round-trips; the three "Run benchmark" entry points all reach `/benchmarks/run`.

A `jest-expo` harness for the re-authored logic (`buildVerdict`, loader
aggregation) is a reasonable **follow-up**, not a blocker for this build.

## Risks

1. **Lib drift across repos.** The ported pure modules must stay byte-aligned
   with web or grades diverge (web already killed a C→D drift here). Mitigation:
   add to the keep-in-sync list; port verbatim; smoke-test parity.
2. **Loader divergence.** The lean loader re-implements a slice of web's
   monolithic loader. Mitigation: reuse every pure helper; only the orchestration
   is new.
3. **Detail evidence freshness.** Pre-loading on the landing means the detail can
   be stale after a write. Mitigation: re-fetch the card (or re-run
   `loadTeamScouting`) after any correction/note.

## Out of scope / follow-up

A later build adds the deferred sections (headline team-decisions, movement
strips, drill leaderboards) on top of the same loader + lib.
