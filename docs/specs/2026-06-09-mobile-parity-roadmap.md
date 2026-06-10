# Mobile Parity Roadmap

> **Date:** 2026-06-09
> **Status:** Approved (sequencing + scope). Each feature below is its own
> spec → plan → build cycle and ships independently.

## Purpose

`unlock-mobile` is current through **Build 16.5** (coach roles, attribution,
captain model, drill lifecycle, league-aware practice). Web `main` has since
pulled ahead with four features that have **no mobile equivalent**. This doc
sequences bringing them to mobile.

The order below is a **dependency order**, not just preference: #1 lands the
shared grading lib that #2 reuses; #4 is last because its web source is not yet
on `main`.

## Source-of-truth snapshot (2026-06-09)

| # | Feature | Web source of truth | Mobile surface today |
|---|---|---|---|
| 1 | Scouting Report | `main` (`517c099`, `1ecd331`) | `app/benchmarks/*` — old **write-first** flow |
| 2 | Player Card | `main` (`7eb315f`) | `app/(tabs)/roster/[id]/index.tsx` — basic detail |
| 3 | AI Drill Drafter | `main` (`5aba6c7`) | `app/(tabs)/drills/new.tsx` + `[id]/edit.tsx` — no AI |
| 4 | AI Practice Plan Gen | **branch only** `build-12-ai-practice-plan-generator` (`b26e75a`) ⚠️ | `app/(tabs)/practice/new.tsx` |

## Cross-cutting rules (all four)

- **Backend is already shared.** Same Supabase project, tables, RPCs, views,
  edge function. Parity = **mobile UI + a mobile `lib/` port of web pure-logic**,
  not new SQL.
- **DRY across repos.** Web keeps canonical logic in `src/lib/`
  (`scouting/player-grade.ts`, `benchmarks/*`, `dashboard/team-scouting-data.ts`).
  Port these as mirrored mobile `lib/` modules and add them to the cross-repo
  keep-in-sync list (alongside existing `PHASE_TO_SKILL_GROUPS` / `SkillChip`
  dups). No logic reinvented inside components.
- **Mobile conventions hold.** `ActionModal` (never `Alert.alert`);
  `TouchableOpacity` with static style + `activeOpacity` (Pressable
  function-style is broken in this Expo SDK); bottom-button clearance
  (`insets.bottom + 60`); surface tokens, never hex literals.

---

## 1. Scouting Report *(first — lays the grading foundation)*

> **✅ SHIPPED 2026-06-09** — branch `build-17-scouting-report`. Read-first
> landing (`app/benchmarks/index.tsx`) + full-screen detail
> (`app/benchmarks/player/[id].tsx`) with result-correction + add-note; old hub
> → `app/benchmarks/run.tsx`. Pure lib ported verbatim
> (`lib/benchmarks/{metrics,confidence,player-history,skill-group-trend,skill-group-maps}.ts`,
> `lib/scouting/player-grade.ts`) + new `lib/dashboard/heat-scale.ts` + extended
> `constants/skill-groups.ts` (position-room helpers). `tsc --noEmit` clean;
> device smoke still pending. **`lib/scouting/player-grade.ts` is the dependency
> #2 (Player Card) reuses.**

**Web.** `benchmarks` is now a read-first, position-aware scouting hub
(3 rooms: QB / Receivers / Defense), graded on position-relevant skill groups.
- Components: `src/components/dashboard/scouting/{ScoutingPlayers,ScoutingSections,PlayerScoutSheet}.tsx`
- Logic: `src/lib/dashboard/team-scouting-data.ts`, `src/lib/scouting/player-grade.ts`,
  `src/lib/benchmarks/{skill-group-maps,confidence,metrics,player-history}.ts`

**Mobile delta.** `app/benchmarks/*` today is the old write-first flow
(`index`/`log`/`review`/`complete`). Add the read-first scouting view as the
landing surface; the existing logging flow becomes the "Run benchmark" action it
launches into. Port grade/skill-group/confidence/metrics logic to mobile
`lib/scouting/` + `lib/benchmarks/`.

**Why first.** Establishes `player-grade.ts` + skill-group maps on mobile —
reused verbatim by #2.

## 2. Player Card *(reuses #1's grade lib)*

> **✅ SHIPPED 2026-06-10** — branch `build-18-player-card`. Redesigned the roster
> detail (`app/(tabs)/roster/[id]/index.tsx`) into a Player Card: new
> `components/roster/PlayerCardHero.tsx` (photo/physicals identity + overall grade
> badge + per-group chips + relative standing + mini-stats), driven by the SHARED
> graders run on a per-player + cohort fetch (mirrors web's roster page — not
> `loadTeamScouting` — so it works for inactive players and never drifts). Deep
> evidence (per-drill history/trend/sessions/corrections) stays on the scouting
> detail, reached via a "View full scouting" bridge. DRY extractions:
> `components/scouting/{GroupGradesRow,RelativeStandingLine}.tsx` (scouting screen
> refactored onto `GroupGradesRow`) + `GradeBadge` gained an `lg` solid variant.
> Photo + physicals: new `lib/photo-upload.ts` (Storage `player-photos`,
> `fetch().arrayBuffer()` upload) + `lib/format/physicals.ts` (verbatim web port,
> keep-in-sync) + `expo-image-picker` wired into the edit form (photo on edit only;
> height/weight on new+edit). Spec: `docs/specs/2026-06-10-player-card-design.md`.
> `tsc --noEmit` clean; device smoke (photo pick) still pending. **No new SQL.**

**Web.** Player detail → Player Card: photo/physicals hero, headline grade +
relative-standing verdict, collapsible sections, trend rows.
`gradePlayerGroups` + `relativeStandingFor` in `src/lib/scouting/player-grade.ts`
are the single source of truth (killed a C→D drift).

**Mobile delta.** Redesign `app/(tabs)/roster/[id]/index.tsx` (already uses
`AthleteHero`). Photo upload via the Storage bucket from migration 101. No new
grade logic — imports the mobile `player-grade.ts` landed in #1.

## 3. AI Drill Drafter *(backend already live)*

**Web.** Paste TikTok/IG/YT link in the drill form → Gemini edge fn drafts
description/cues/equipment; async job + Realtime; Pro-gated "Transcribe drill"
button; single create entry for all users.

**Mobile delta.** Edge fn (`draft-drill`), scraper, Files API, `ai_drill_jobs`
table — **all shared and live, zero backend work**. Add the paste-link + Pro
"Transcribe drill" affordance to `app/(tabs)/drills/new.tsx` + `[id]/edit.tsx`,
the `requestDrillDraft` invocation, and an RN Realtime subscription to the job
row. Pro gating mirrors web (`teams.plan`).

## 4. AI Practice Plan Generator *(last — web not merged)*

**Web.** Guided wizard, **lives only on `build-12-ai-practice-plan-generator`,
not on `main`.** Still being iterated (v2 redesign).

**Mobile delta.** Port the wizard into `app/(tabs)/practice/new.tsx`.
**Deliberately last** — porting an unmerged, moving target invites drift. Start
only once web Build 12 lands on `main`.

---

## Per-feature lifecycle

Each feature, when started, gets:
1. Its own design spec → `docs/specs/YYYY-MM-DD-<feature>-design.md`
2. Its own implementation plan
3. Its own `build-N-<slug>` branch, single commit per the one-commit-per-branch rule
