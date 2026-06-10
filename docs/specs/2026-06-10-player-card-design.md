# Player Card — Mobile (Spec + Design)

> **Date:** 2026-06-10
> **Feature:** Task #2 of the Mobile Parity Roadmap (`2026-06-09-mobile-parity-roadmap.md`)
> **Status:** Approved (scope locked 2026-06-10). Build branch: `build-18-player-card`.
> **Depends on:** Build 17 (Scouting Report) — landed `player-grade.ts`, `heat-scale.ts`,
> `benchmarks/{player-history,skill-group-trend,skill-group-maps,confidence,metrics}.ts`,
> `GradeBadge`, `PlayerSkillProfileCard`. **No new SQL** (migration 101 already live).

## Problem Statement

The mobile roster detail (`app/(tabs)/roster/[id]/index.tsx`) is a flat read page —
identity, position, notes, a skill-profile card, and a raw benchmark-history list.
It has **no sense of how good the player is**: no grade, no relative standing, no
photo, no physicals. Web's Build-9 Player Card already answers "who is this player
and how good are they at a glance," and the grade math (`player-grade.ts`) was ported
to mobile in Build 17 but is only wired into the scouting screen. The roster page —
the screen a captain opens to *understand one player* — is the weakest surface in the app.

## Goals

1. The roster detail reads like a **player card**: photo/physicals identity + a headline
   grade verdict a captain can absorb in under 3 seconds.
2. **Zero grade drift** — the card's overall grade, per-group grades, and relative
   standing come from the same shared pure helpers (`gradePlayerGroups`,
   `relativeStandingFor`) the scouting report and team grid use.
3. A player feels like a **person**: optional photo + height/weight, editable in-app.
4. **No duplicated UI** between the roster card and the Build-17 scouting detail —
   overlapping pieces (group-grade chips, standing line) become shared components.

## Non-Goals

- **No deep evidence on the card.** Per-drill history, skill-group trend, benchmark
  sessions, and inline result-correction stay on the scouting detail
  (`benchmarks/player/[id]`). The card links to it ("View full scouting"). Rationale:
  that surface already exists and renders all of it — duplicating it makes two heavy,
  near-identical screens.
- **No new grade logic.** Imports the mobile `player-grade.ts` from Build 17.
- **No new SQL / migration.** Migration 101 (`photo_url`, `height_in`, `weight_lb`,
  `player-photos` bucket + team-gated write RLS) is already on the shared project.
- **No photo on the *new-player* form.** The Storage path is `{teamId}/{playerId}.{ext}`
  and needs a player id; photos are added on the edit screen after the player exists.
- **No retiring of the scouting detail screen.** Both screens stay; they divide labor
  (card = person + headline + manage; scouting = assess + correct).

## User Stories

- As a **captain**, I want to open a player and immediately see their overall grade and
  where they rank in their position room, so I know how to use them without digging.
- As a **captain**, I want each position-relevant skill area shown as a letter grade on
  the card, so I can spot strengths and gaps at a glance.
- As a **captain**, I want to add a player's photo and height/weight, so the roster
  feels like a real team sheet and players are recognizable.
- As a **captain**, I want a one-tap path from the card into the full scouting detail,
  so the card stays uncluttered but the depth is one tap away.
- As a **view-only member**, I want to read the card (grade, standing, profile) but see
  no edit/injury/deactivate controls.
- As any user opening an **un-benchmarked or inactive** player, I want a graceful
  "not benchmarked yet" hero instead of a broken or empty grade block.

## Requirements

### Must-Have (P0)

**P0-1 — Grade hero.** New `components/roster/PlayerCardHero.tsx`. Renders:
photo (88px, rounded) OR initials-on-`playerColorForIndex` avatar (dimmed when
`status==='inactive'`); name; `#jersey · primary(orange) · secondary`; physicals line
(`formatPhysicals`); added-by `Byline`; **overall grade badge** (large, `gradeColor`)
with `gradeLabel` beneath and an "OVERALL" eyebrow; **per-group grade chips**
(measured groups only); **relative-standing line** (when a standing exists);
status/captain/injured/joined badge row; injury-note callout (when injured + note);
**mini-stats** row — Benchmarks / PBs / Drills.
- *Given* a player with ≥1 benchmark, *then* the overall badge shows their letter grade
  and `gradeLabel`; *given* zero benchmarks, *then* the badge shows "–" and "Not
  benchmarked", and standing/mini-stats collapse gracefully.

**P0-2 — Data via shared pure helpers (mirror web's roster page, not `loadTeamScouting`).**
The page fetches, in one `Promise.all`:
1. resilient `team_players` select incl. **`photo_url, height_in, weight_lb`** (degrade
   if columns absent, matching the existing injury/color_index drift fallbacks);
2. this player's `v_player_skill_profile` rows → `groupCompositesFromProfile` →
   `gradePlayerGroups(positions)` → overall + per-group grades + skill profile;
3. this player's `benchmark_results` → `buildPlayerHistory` → `benchmarkCount`,
   `pbCount`, `drills.length`;
4. cohort: all team `team_players (id, positions)` + team `v_player_skill_profile
   (player_id, skill_group, composite_score)` → per-member overall via the *same*
   grader → `relativeStandingFor`;
5. `player_notes` (observations).
- Works for inactive players (no active-only filter). `teamId` comes from `useTeam()`
  (route-scoped), never a first-team lookup.

**P0-3 — Shared component extraction (DRY).**
`components/scouting/GroupGradesRow.tsx` (the GradeBadge + label chips) and
`components/scouting/RelativeStandingLine.tsx`. The Build-17 scouting screen's inline
group-chip block is refactored to import `GroupGradesRow`.

**P0-4 — `lib/format/physicals.ts`.** Ported verbatim from
`unlock-web/src/lib/format/physicals.ts` (`formatHeight`, `formatWeight`,
`formatPhysicals`, `feetInchesToInches`, `inchesToFeetInches`). Added to the cross-repo
keep-in-sync list in memory.

**P0-5 — Sections + bridge.** Replace the numbered 01–06 read-sections with shared
`Section`/`SectionLabel` (from `FormSection`): Skill profile (`PlayerSkillProfileCard`),
Notes (free-text, when present), Observations (dated, read-only), and a **"View full
scouting →"** row routing to `/benchmarks/player/[id]`. Bottom actions (Edit / Mark
injured / Deactivate) unchanged and `canManage`-gated.

**P0-6 — Photo + physicals editing (`components/PlayerForm.tsx`, edit screen).**
Tap avatar → `expo-image-picker` (library) → upload to `player-photos` at
`{teamId}/{playerId}.{ext}` via new `lib/photo-upload.ts` → save public URL to
`photo_url`. Height = feet + inches number fields → `feetInchesToInches` → `height_in`;
weight = lb number field → `weight_lb`. iOS photo-library permission string in
`app.json` + runtime request; deny → app-styled error via `ActionModal`.

### Nice-to-Have (P1)

- Camera capture (in addition to library) in the photo picker.
- Image downscale/compression before upload (cap dimension/quality) to keep the bucket lean.
- Remove-photo affordance on the edit screen.

### Future Considerations (P2)

- Photo on the new-player form (upload-after-insert).
- Sharing/merging the card hero with the scouting `AthleteHero` if the two converge.

## Architecture / File Changes

**New**
- `lib/format/physicals.ts` — physicals formatting (web port).
- `lib/photo-upload.ts` — `uploadPlayerPhoto(teamId, playerId, uri)` → public URL.
- `components/roster/PlayerCardHero.tsx` — bespoke hero (P0-1).
- `components/scouting/GroupGradesRow.tsx` — shared group-grade chips.
- `components/scouting/RelativeStandingLine.tsx` — shared standing line.

**Changed**
- `app/(tabs)/roster/[id]/index.tsx` — rewrite to the Player Card layout + dual-source
  fetch running pure helpers (P0-2, P0-5).
- `components/PlayerForm.tsx` (+ `roster/[id]/edit` / `roster/new` wiring) — photo
  picker + physicals fields (P0-6).
- `app/benchmarks/player/[id].tsx` — group-chip block → `GroupGradesRow` (P0-3).
- `app.json` — `NSPhotoLibraryUsageDescription` (and camera string if P1 camera lands).
- `package.json` — `expo-image-picker` (via `npx expo install`).

**No backend changes.** Migration 101 already applied to the shared project.

## Acceptance Criteria

- [ ] Card hero shows overall grade + `gradeLabel` + per-group chips + standing for a
      benchmarked player; collapses gracefully for an un-benchmarked or inactive one.
- [ ] Overall grade, per-group grades, and standing match the scouting detail for the
      same player (shared helpers — no drift).
- [ ] Photo uploads to `player-photos/{teamId}/{playerId}.ext` and renders in the hero;
      height/weight persist and render as `6'1" · 190 lb`.
- [ ] Group-grade chips render identically on the roster card and the scouting detail
      (one component).
- [ ] View-only members see the card with no edit/injury/deactivate/photo controls.
- [ ] "View full scouting →" routes to `/benchmarks/player/[id]`.
- [ ] `npx tsc --noEmit` clean; iOS device smoke: photo pick + grade hero render.

## Open Questions

- **[design]** Camera capture in v1, or library-only? (Leaning library-only; camera is P1.)
- **[eng]** Downscale before upload in v1 or P1? (Leaning P1 unless trivial with the
  picker's built-in `quality`/`allowsEditing`.)

## Timeline / Phasing

Single build, single commit on `build-18-player-card`. No external dependency or deadline.
The two open questions are non-blocking (both default to deferring to P1).
