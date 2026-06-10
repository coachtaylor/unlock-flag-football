// lib/dashboard.ts — coach dashboard data layer.
//
// Every fetch returns a typed shape (never `undefined`/`null`) so the view
// can render locked-insight cards without optional-chaining noise. Each fetch
// is also independently catchable so one failing query doesn't take down the
// whole dashboard.

import { supabase } from "./supabase";
import { localDateString } from "./date";
import { loadTeamActivity, type ActivityFeedItem } from "./activity";
import { playerColorForIndex } from "./athlete";
import { sideForPositions } from "../constants/positions";
import { normalizeCategory, type CategoryKey } from "../constants/categories";

// ─── Types ─────────────────────────────────────────────────────────────

export type NextPracticeAttendee = {
  player_id: string;
  player_name: string;
  initials: string;
  // Primary-first position list. Still selected from the DB for future
  // position-aware sorts/labels even though avatar color no longer
  // derives from it (color comes from color_index now).
  positions: string[];
  // Per-player avatar color slot (migration 45). Null only when the DB
  // hasn't been migrated yet — render code falls back to muted.
  color_index: number | null;
  rsvp: boolean | null;
  attended: boolean | null;
};

export type NextPractice = {
  practice_plan_id: string;
  practice_date: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  status: "scheduled" | "live" | "completed";
  duration_min: number | null;
  attendees: NextPracticeAttendee[];
  committed: number;
  total: number;
} | null;

export type PinnedPulse = {
  drill_id: string;
  drill_name: string;
  benchmark_type: "timed" | "rated";
  current_avg: number | null; // seconds for timed, 1-5 for rated
  delta: number | null; // negative is better for timed, positive for rated
  spark: number[]; // 6 ISO-weekly team averages
};

export type DrillMix = {
  // Per-category hit counts. A drill tagged Offense+Routes contributes 1 to
  // each. Sum of `totals` can exceed `total` (drill completions) when drills
  // are multi-tagged — that's intentional: the donut shows the mix of what
  // those completed drills targeted.
  totals: Record<CategoryKey, number>;
  weekly: {
    week: string;
    label: string;
    counts: Record<CategoryKey, number>;
    isNow: boolean;
  }[];
  underweighted: { key: CategoryKey; pct: number; count: number } | null;
  // Distinct drill completions across the window (sum of run_status='done'
  // rows in completed practices, excluding water breaks). This is what the
  // donut center displays, not the sum of category hits.
  total: number;
  // Number of completed practices that contributed to the mix. Drives the
  // subhead copy ("Drills completed across N practice(s).").
  completedPracticeCount: number;
};

export type AttendanceStreak = {
  player_id: string;
  player_name: string;
  initials: string;
  color: string | null;
  streak: number;
};

export type Attendance = {
  rate: number; // 0–100
  deltaPct: number; // pp vs prior 4 weeks
  spark: number[]; // last 7 practices, each 0-100
  // Per-side show-rates over the recent 4-week window. Each is the
  // share of expected attendances (one row per player per practice in
  // the window) that were actually attended, partitioned by the
  // player's side from `sideForPositions(positions)`. Players with no
  // position tagged are excluded from both buckets.
  offenseRate: number; // 0-100
  defenseRate: number; // 0-100
  // Composition of the attended-slots pool by side. Together they sum
  // to 100 (when at least one slot was attended). Tells the coach
  // which side is showing up more relative to the other — distinct
  // from the show-rates above, which measure each side independently.
  offenseShare: number; // 0-100
  defenseShare: number; // 0-100
  streaks: AttendanceStreak[];
};

export type ActivityKind =
  | "benchmark"
  | "drill"
  | "practice"
  | "player"
  | "note";

export type Activity = {
  kind: ActivityKind;
  created_at: string;
  title: string;
  detail: string;
  href: string;
};

export type Move = {
  key: "benchmark" | "practice" | "roster";
  index: string;
  title: string;
  desc: string;
  cta: string;
  href: string;
  done: boolean;
};

// ─── Helpers ────────────────────────────────────────────────────────────

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function isoWeekKey(d: Date): string {
  // ISO week label suitable for grouping; format: YYYY-Www
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum =
    Math.ceil((((+target - +yearStart) / 86_400_000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function startOfIsoWeek(d: Date): Date {
  // Monday at 00:00 UTC for the ISO week containing d.
  const day = (d.getUTCDay() + 6) % 7; // 0 = Mon
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  m.setUTCDate(m.getUTCDate() - day);
  return m;
}

/**
 * Sunday at 00:00 UTC for the week containing d. Used by the drill-mix
 * trend chart and the team's "Wk N" counter, both of which are Sunday-anchored
 * per the product convention ("Sunday being the beginning of the week").
 */
function startOfSundayWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sun
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  m.setUTCDate(m.getUTCDate() - day);
  return m;
}

function sundayWeekKey(d: Date): string {
  const s = startOfSundayWeek(d);
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, "0")}-${String(s.getUTCDate()).padStart(2, "0")}`;
}

function emptyCategoryCounts(): Record<CategoryKey, number> {
  // Init all canonical category keys to zero so the donut renders correctly
  // even when only one category has been used.
  return {
    offense: 0,
    defense: 0,
    scrimmage: 0,
    footwork: 0,
    routes: 0,
    conditioning: 0,
    warmup: 0,
    agilities: 0,
    flagpulling: 0,
    pursuit: 0,
    throwing: 0,
    catching: 0,
    rushing: 0,
    blocking: 0,
    other: 0,
  };
}

// ─── Fetchers ──────────────────────────────────────────────────────────

export async function fetchNextPractice(teamId: string): Promise<NextPractice> {
  const today = localDateString();

  const { data: planRow, error } = await supabase
    .from("practice_plans")
    .select("id, practice_date, title, status, start_time, end_time")
    .eq("team_id", teamId)
    .in("status", ["scheduled", "live"])
    .gte("practice_date", today)
    .order("practice_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[dashboard] next practice:", error.message);
    return null;
  }
  if (!planRow) return null;

  // Sum drill durations for the practice total (skips water-break rows).
  const { data: drillRows } = await supabase
    .from("practice_plan_drills")
    .select("duration_minutes, is_water_break")
    .eq("practice_plan_id", planRow.id);

  const duration =
    drillRows && drillRows.length > 0
      ? drillRows
          .filter((r) => !r.is_water_break)
          .reduce((acc, r) => acc + (r.duration_minutes ?? 0), 0)
      : null;

  // Try the richer projection first (includes color_index from
  // migration 45); fall back to the legacy join shape so the dashboard
  // still renders on a DB without 45 applied.
  const attendeesSelect = (withColor: boolean) =>
    supabase
      .from("practice_plan_attendees")
      .select(
        `player_id, rsvp, attended, team_players(player_name, positions${
          withColor ? ", color_index" : ""
        })`
      )
      .eq("practice_plan_id", planRow.id);
  let attendeeRes = await attendeesSelect(true);
  if (attendeeRes.error && /color_index/i.test(attendeeRes.error.message)) {
    attendeeRes = await attendeesSelect(false);
  }
  const attendeeRows = attendeeRes.data;

  const attendees: NextPracticeAttendee[] = (attendeeRows ?? []).map((r) => {
    const tp = r.team_players as
      | {
          player_name: string;
          positions: string[] | null;
          color_index?: number | null;
        }
      | {
          player_name: string;
          positions: string[] | null;
          color_index?: number | null;
        }[]
      | null;
    const p = Array.isArray(tp) ? tp[0] : tp;
    const name = p?.player_name ?? "Unknown";
    return {
      player_id: r.player_id,
      player_name: name,
      initials: initialsFromName(name),
      positions: p?.positions ?? [],
      color_index: p?.color_index ?? null,
      rsvp: r.rsvp,
      attended: r.attended,
    };
  });

  const committed = attendees.filter((a) => a.rsvp === true).length;
  const total = attendees.length;

  return {
    practice_plan_id: planRow.id,
    practice_date: planRow.practice_date,
    title: planRow.title,
    start_time: planRow.start_time,
    end_time: planRow.end_time,
    status: planRow.status as "scheduled" | "live" | "completed",
    duration_min: duration,
    attendees,
    committed,
    total,
  };
}

export async function fetchTeamPulse(teamId: string): Promise<PinnedPulse[]> {
  const { data: pinnedDrills, error } = await supabase
    .from("team_drills")
    .select("id, drill_name, benchmark_type, dashboard_pinned_at")
    .eq("team_id", teamId)
    .eq("is_dashboard_pinned", true)
    .order("dashboard_pinned_at", { ascending: false })
    .limit(4);

  if (error) {
    // pgrst unknown column → migration not applied yet. Don't spam console.
    if (!/dashboard_pinned|is_dashboard_pinned/.test(error.message)) {
      console.warn("[dashboard] team pulse pins:", error.message);
    }
    return [];
  }
  if (!pinnedDrills || pinnedDrills.length === 0) return [];

  // For each pinned drill, pull all benchmark_results in the last ~12 weeks
  // and bucket into 6 ISO weeks for the sparkline + compute overall avg/delta.
  const sinceISO = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 84); // 12 weeks
    return d.toISOString();
  })();

  const drillIds = pinnedDrills.map((d) => d.id);
  const { data: results } = await supabase
    .from("benchmark_results")
    .select("drill_id, time_seconds, rating, benchmark_type, assessment_date, created_at")
    .eq("team_id", teamId)
    .in("drill_id", drillIds)
    .gte("created_at", sinceISO);

  const byDrill = new Map<string, typeof results>();
  for (const r of results ?? []) {
    const list = byDrill.get(r.drill_id) ?? [];
    list.push(r);
    byDrill.set(r.drill_id, list);
  }

  // Build 6 week buckets, oldest → newest, anchored to "this week".
  const weekAnchors: Date[] = [];
  const thisWeek = startOfIsoWeek(new Date());
  for (let i = 5; i >= 0; i--) {
    const w = new Date(thisWeek);
    w.setUTCDate(w.getUTCDate() - i * 7);
    weekAnchors.push(w);
  }
  const weekKeys = weekAnchors.map(isoWeekKey);

  return pinnedDrills.map((drill) => {
    const rows = byDrill.get(drill.id) ?? [];
    const benchmarkType =
      (drill.benchmark_type as "timed" | "rated" | null) ?? "rated";

    // Per-week avg
    const buckets: number[][] = weekKeys.map(() => []);
    for (const r of rows) {
      if (!r.assessment_date) continue;
      const wk = isoWeekKey(new Date(r.assessment_date));
      const idx = weekKeys.indexOf(wk);
      if (idx === -1) continue;
      const value = benchmarkType === "timed" ? r.time_seconds : r.rating;
      if (typeof value === "number") buckets[idx].push(value);
    }
    const spark: number[] = buckets.map((b) =>
      b.length === 0 ? NaN : b.reduce((a, n) => a + n, 0) / b.length
    );
    // Replace leading NaNs by carrying the first real value backward so the
    // line still draws; if everything is NaN, return an empty array.
    let firstReal = spark.findIndex((n) => !Number.isNaN(n));
    if (firstReal === -1) {
      return {
        drill_id: drill.id,
        drill_name: drill.drill_name,
        benchmark_type: benchmarkType,
        current_avg: null,
        delta: null,
        spark: [],
      };
    }
    for (let i = 0; i < firstReal; i++) spark[i] = spark[firstReal];
    // Carry forward any internal NaNs.
    for (let i = firstReal + 1; i < spark.length; i++) {
      if (Number.isNaN(spark[i])) spark[i] = spark[i - 1];
    }

    const current_avg = spark[spark.length - 1];
    const baseline = spark[0];
    const delta = current_avg - baseline;

    return {
      drill_id: drill.id,
      drill_name: drill.drill_name,
      benchmark_type: benchmarkType,
      current_avg,
      delta,
      spark,
    };
  });
}

export async function fetchDrillMix(teamId: string): Promise<DrillMix> {
  const empty: DrillMix = {
    totals: emptyCategoryCounts(),
    weekly: [],
    underweighted: null,
    total: 0,
    completedPracticeCount: 0,
  };

  // Anchor the week labels to the team's earliest COMPLETED practice
  // (Sunday-aligned). Until a practice is logged, the card stays empty and
  // the locked-insight CTA shows. We deliberately exclude scheduled / live
  // plans here — the card represents drills the team actually ran.
  const { data: firstPracticeRow } = await supabase
    .from("practice_plans")
    .select("practice_date")
    .eq("team_id", teamId)
    .eq("status", "completed")
    .order("practice_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstPracticeRow) return empty;

  const todaySunday = startOfSundayWeek(new Date());
  const firstDate = parseDateOnly(firstPracticeRow.practice_date);
  const firstSunday = startOfSundayWeek(firstDate);

  // Team's current week number (1-based), Sunday-anchored.
  const teamWeekNow =
    Math.floor((+todaySunday - +firstSunday) / (7 * 86_400_000)) + 1;

  // Visible weeks: the most recent min(6, teamWeekNow) Sundays, oldest→newest.
  // A team in its 3rd week sees 3 bars; a 6+ week team sees a rolling 6.
  const visibleCount = Math.max(1, Math.min(6, teamWeekNow));
  const weekAnchors: { date: Date; key: string; weekNumber: number }[] = [];
  for (let i = visibleCount - 1; i >= 0; i--) {
    const d = new Date(todaySunday);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weekAnchors.push({
      date: d,
      key: sundayWeekKey(d),
      weekNumber: teamWeekNow - i,
    });
  }
  const earliestVisibleISO = weekAnchors[0].key;

  // Step 1: pull every drill row that was actually run-completed in a
  // completed practice within the visible window. Three filters together:
  //   • practice_plans.status = 'completed' — the practice happened
  //   • practice_plan_drills.run_status = 'done' — captain advanced past it
  //   • is_water_break = false — water breaks aren't drills
  // Categories come from a separate query (more reliable than a deep nested
  // PostgREST select where the FK is on team_drills, not the plan-drill).
  const { data: rows, error } = await supabase
    .from("practice_plan_drills")
    .select(
      `drill_id,
       is_water_break,
       run_status,
       practice_plans!inner(id, team_id, practice_date, status)`
    )
    .eq("practice_plans.team_id", teamId)
    .eq("practice_plans.status", "completed")
    .gte("practice_plans.practice_date", earliestVisibleISO)
    .eq("run_status", "done")
    .eq("is_water_break", false)
    .not("drill_id", "is", null);

  if (error) {
    console.warn("[dashboard] drill mix:", error.message);
    return empty;
  }
  if (!rows || rows.length === 0) {
    // Visible weeks exist (first completed practice anchors them) but every
    // completed practice in-window had zero drills marked done. Render the
    // chart skeleton with empty bars rather than the locked-insight card.
    return {
      ...empty,
      weekly: weekAnchors.map((w, i) => ({
        week: w.key,
        label: `Wk ${w.weekNumber}`,
        counts: emptyCategoryCounts(),
        isNow: i === weekAnchors.length - 1,
      })),
    };
  }

  // Step 2: look up categories for the distinct drill IDs that appeared.
  type Row = {
    drill_id: string;
    is_water_break: boolean | null;
    run_status: string | null;
    practice_plans:
      | { id: string; practice_date: string; team_id: string; status: string }
      | { id: string; practice_date: string; team_id: string; status: string }[]
      | null;
  };
  const typedRows = rows as Row[];
  const drillIds = Array.from(
    new Set(typedRows.map((r) => r.drill_id).filter((id): id is string => !!id))
  );

  const categoriesByDrill = new Map<string, CategoryKey[]>();
  if (drillIds.length > 0) {
    const { data: catRows, error: catErr } = await supabase
      .from("team_drill_categories")
      .select("drill_id, drill_categories(category_name)")
      .in("drill_id", drillIds);
    if (catErr) {
      console.warn("[dashboard] drill categories:", catErr.message);
    }
    for (const cr of (catRows ?? []) as Array<{
      drill_id: string;
      drill_categories:
        | { category_name: string }
        | { category_name: string }[]
        | null;
    }>) {
      const dc = Array.isArray(cr.drill_categories)
        ? cr.drill_categories[0]
        : cr.drill_categories;
      const key = normalizeCategory(dc?.category_name);
      if (!key) continue;
      const list = categoriesByDrill.get(cr.drill_id) ?? [];
      if (!list.includes(key)) list.push(key);
      categoriesByDrill.set(cr.drill_id, list);
    }
  }

  // Step 3: bucket counts by week + category. We track two distinct totals:
  //   • totalCompletions — unique drill completion rows (donut center)
  //   • totals (per-category) — multi-tag drills contribute to each tag
  //     (donut segment proportions, category list breakdown)
  const totals = emptyCategoryCounts();
  const weeklyMap = new Map<string, Record<CategoryKey, number>>();
  for (const w of weekAnchors) weeklyMap.set(w.key, emptyCategoryCounts());
  let totalCompletions = 0;
  const completedPracticeIds = new Set<string>();

  for (const r of typedRows) {
    const pp = Array.isArray(r.practice_plans)
      ? r.practice_plans[0]
      : r.practice_plans;
    if (!pp?.practice_date) continue;
    completedPracticeIds.add(pp.id);
    totalCompletions += 1;
    const wkKey = sundayWeekKey(parseDateOnly(pp.practice_date));
    const wkBucket = weeklyMap.get(wkKey);

    const cats = r.drill_id ? categoriesByDrill.get(r.drill_id) ?? [] : [];
    if (cats.length === 0) {
      totals.other += 1;
      if (wkBucket) wkBucket.other += 1;
      continue;
    }
    for (const k of cats) {
      totals[k] += 1;
      if (wkBucket) wkBucket[k] += 1;
    }
  }

  const weekly = weekAnchors.map((w, i) => ({
    week: w.key,
    label: `Wk ${w.weekNumber}`,
    counts: weeklyMap.get(w.key)!,
    isNow: i === weekAnchors.length - 1,
  }));

  // Underweighted = the lowest non-zero category share, flagged only when
  // there's enough sample to call it (≥ 6 completed drills in window).
  // Pct denominator is the sum of category hits (not completions) so a
  // multi-tag drill is weighted across the tags it touches.
  const categoryHitSum = Object.values(totals).reduce((a, n) => a + n, 0);
  let underweighted: DrillMix["underweighted"] = null;
  if (totalCompletions >= 6 && categoryHitSum > 0) {
    const entries = (Object.entries(totals) as [CategoryKey, number][])
      .filter(([k, n]) => k !== "other" && n > 0)
      .sort(([, a], [, b]) => a - b);
    if (entries.length > 0) {
      const [key, count] = entries[0];
      const pct = Math.round((count / categoryHitSum) * 100);
      if (pct < 15) underweighted = { key, pct, count };
    }
  }

  return {
    totals,
    weekly,
    underweighted,
    total: totalCompletions,
    completedPracticeCount: completedPracticeIds.size,
  };
}

function parseDateOnly(s: string): Date {
  // "YYYY-MM-DD" → midnight UTC of that calendar date. Matches how
  // practice_date is stored (date, no time component).
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export async function fetchAttendance(teamId: string): Promise<Attendance> {
  const empty: Attendance = {
    rate: 0,
    deltaPct: 0,
    spark: [],
    offenseRate: 0,
    defenseRate: 0,
    offenseShare: 0,
    defenseShare: 0,
    streaks: [],
  };

  const now = new Date();
  const fourWeeksAgo = new Date(now);
  fourWeeksAgo.setUTCDate(now.getUTCDate() - 28);
  const eightWeeksAgo = new Date(now);
  eightWeeksAgo.setUTCDate(now.getUTCDate() - 56);

  const fourWeeksISO = fourWeeksAgo.toISOString().slice(0, 10);
  const eightWeeksISO = eightWeeksAgo.toISOString().slice(0, 10);

  // Multi-rung fallback: full projection (color_index + check_in_late),
  // then drop color_index (pre-migration 45), then drop check_in_late
  // (pre-migration 41). Whichever rung succeeds feeds computeAttendance.
  const attendanceSelect = (withColor: boolean, withLate: boolean) =>
    supabase
      .from("practice_plans")
      .select(
        `id,
         practice_date,
         status,
         practice_plan_attendees(player_id, attended${
           withLate ? ", check_in_late" : ""
         }, team_players(player_name, positions${
          withColor ? ", color_index" : ""
        }))`
      )
      .eq("team_id", teamId)
      .eq("status", "completed")
      .gte("practice_date", eightWeeksISO)
      .order("practice_date", { ascending: true });

  let res = await attendanceSelect(true, true);
  if (res.error && /color_index/.test(res.error.message)) {
    res = await attendanceSelect(false, true);
  }
  if (res.error && /check_in_late/.test(res.error.message)) {
    res = await attendanceSelect(false, false);
  }

  if (res.error) {
    console.warn("[dashboard] attendance:", res.error.message);
    return empty;
  }

  return computeAttendance(res.data ?? [], fourWeeksISO);
}

type AttendanceRow = {
  id: string;
  practice_date: string;
  practice_plan_attendees:
    | Array<{
        player_id: string;
        attended: boolean | null;
        check_in_late?: boolean | null;
        team_players:
          | {
              player_name: string;
              positions: string[] | null;
              color_index?: number | null;
            }
          | {
              player_name: string;
              positions: string[] | null;
              color_index?: number | null;
            }[]
          | null;
      }>
    | null;
};

function computeAttendance(rows: AttendanceRow[], cutoffISO: string): Attendance {
  if (rows.length === 0) {
    return {
      rate: 0,
      deltaPct: 0,
      spark: [],
      offenseRate: 0,
      defenseRate: 0,
      offenseShare: 0,
      defenseShare: 0,
      streaks: [],
    };
  }

  // Split into recent (last 4 weeks) and prior (4-8 weeks ago) for the delta.
  const recent = rows.filter((r) => r.practice_date >= cutoffISO);
  const prior = rows.filter((r) => r.practice_date < cutoffISO);

  const rateOf = (xs: AttendanceRow[]) => {
    let total = 0;
    let present = 0;
    for (const r of xs) {
      for (const a of r.practice_plan_attendees ?? []) {
        total += 1;
        if (a.attended) present += 1;
      }
    }
    return total === 0 ? 0 : Math.round((present / total) * 100);
  };

  const rate = rateOf(recent);
  const priorRate = rateOf(prior);
  const deltaPct = rate - priorRate;

  // Per-side show-rates over the recent window. Each player-practice
  // row (one attendance record) is bucketed by the player's side via
  // sideForPositions(positions). The rate for each side is the share
  // of expected attendances that were actually attended. Players with
  // no position tagged fall into neither bucket — counting them under
  // a "side" they don't have would muddy the signal.
  let offTotal = 0,
    offShow = 0,
    defTotal = 0,
    defShow = 0;
  for (const r of recent) {
    for (const a of r.practice_plan_attendees ?? []) {
      const tp = a.team_players as
        | {
            player_name: string;
            positions: string[] | null;
            color_index?: number | null;
          }
        | {
            player_name: string;
            positions: string[] | null;
            color_index?: number | null;
          }[]
        | null;
      const p = Array.isArray(tp) ? tp[0] : tp;
      const side = sideForPositions(p?.positions ?? null);
      if (side === "offense") {
        offTotal += 1;
        if (a.attended) offShow += 1;
      } else if (side === "defense") {
        defTotal += 1;
        if (a.attended) defShow += 1;
      }
    }
  }
  const sideRate = (show: number, total: number) =>
    total === 0 ? 0 : Math.round((show / total) * 100);

  // Composition of the attended pool. Uses Math.floor + remainder
  // assignment so the two shares sum to exactly 100 (avoids rounding
  // both up and showing 101%).
  const totalAttended = offShow + defShow;
  let offenseShare = 0;
  let defenseShare = 0;
  if (totalAttended > 0) {
    offenseShare = Math.round((offShow / totalAttended) * 100);
    defenseShare = 100 - offenseShare;
  }

  // Sparkline = per-practice attendance rate (last 7 practices)
  const last7 = recent.slice(-7);
  const spark = last7.map((r) => {
    const att = r.practice_plan_attendees ?? [];
    if (att.length === 0) return 0;
    const presentN = att.filter((a) => a.attended).length;
    return Math.round((presentN / att.length) * 100);
  });

  // Streaks — consecutive attended=true per player from most recent backward.
  // Build per-player attendance list ordered desc by practice_date.
  const byPlayer = new Map<
    string,
    {
      name: string;
      positions: string[];
      colorIndex: number | null;
      events: { date: string; attended: boolean }[];
    }
  >();
  for (const r of recent) {
    for (const a of r.practice_plan_attendees ?? []) {
      const tp = a.team_players as
        | {
            player_name: string;
            positions: string[] | null;
            color_index?: number | null;
          }
        | {
            player_name: string;
            positions: string[] | null;
            color_index?: number | null;
          }[]
        | null;
      const p = Array.isArray(tp) ? tp[0] : tp;
      const name = p?.player_name ?? "Unknown";
      const positions = p?.positions ?? [];
      const colorIndex = p?.color_index ?? null;
      const existing =
        byPlayer.get(a.player_id) ??
        { name, positions, colorIndex, events: [] };
      // Refresh positions / colorIndex if a later row carries fresher
      // data — first practice may predate roster updates or migration.
      if (positions.length > 0) existing.positions = positions;
      if (colorIndex != null) existing.colorIndex = colorIndex;
      existing.events.push({
        date: r.practice_date,
        attended: !!a.attended,
      });
      byPlayer.set(a.player_id, existing);
    }
  }
  const streaks: AttendanceStreak[] = [];
  for (const [player_id, entry] of byPlayer.entries()) {
    entry.events.sort((a, b) => (a.date < b.date ? 1 : -1));
    let s = 0;
    for (const ev of entry.events) {
      if (ev.attended) s += 1;
      else break;
    }
    if (s > 0) {
      streaks.push({
        player_id,
        player_name: entry.name,
        initials: initialsFromName(entry.name),
        // Per-player identity color from migration 45's color_index.
        // Same hue this player wears everywhere else in the app.
        color: playerColorForIndex(entry.colorIndex),
        streak: s,
      });
    }
  }
  streaks.sort((a, b) => b.streak - a.streak);

  return {
    rate,
    deltaPct,
    spark,
    offenseRate: sideRate(offShow, offTotal),
    defenseRate: sideRate(defShow, defTotal),
    offenseShare,
    defenseShare,
    streaks: streaks.slice(0, 3),
  };
}

// entity_type → the feed's icon kind.
function activityKindFor(entityType: ActivityFeedItem["entityType"]): ActivityKind {
  switch (entityType) {
    case "drill":
      return "drill";
    case "practice_plan":
    case "practice_log":
      return "practice";
    case "player":
      return "player";
    case "note":
      return "note";
    default:
      return "benchmark";
  }
}

// Deep link for a feed row. Benchmarks/notes point at the player they're about
// (their profile shows the history); practice_logs use the plan id from meta.
function activityHrefFor(ev: ActivityFeedItem): string {
  switch (ev.entityType) {
    case "drill":
      return `/drills/${ev.entityId}`;
    case "player":
      return `/roster/${ev.entityId}`;
    case "benchmark":
      return ev.subjectPlayerId ? `/roster/${ev.subjectPlayerId}` : `/benchmarks`;
    case "practice_plan":
      return `/practice/${ev.entityId}`;
    case "practice_log": {
      const pid = ev.meta?.practice_plan_id as string | undefined;
      return pid ? `/practice/${pid}` : `/practice`;
    }
    case "note":
      if (ev.subjectPlayerId) return `/roster/${ev.subjectPlayerId}`;
      return `/practice`;
    default:
      return `/`;
  }
}

export async function fetchActivity(
  teamId: string,
  limit: number = 3
): Promise<Activity[]> {
  // Read the canonical attribution log (Build 14.5) instead of merging per
  // source. The actor leads the title — the old version never showed WHO did
  // it (benchmark "detail" was the assessed player, not the assessor).
  const events = await loadTeamActivity(teamId, { limit, sinceDays: 28 });
  return events.map((ev) => ({
    kind: activityKindFor(ev.entityType),
    created_at: ev.createdAt,
    title: `${ev.who} ${ev.verbLabel} ${ev.what}`.trim(),
    detail: "",
    href: activityHrefFor(ev),
  }));
}

export async function fetchPrsThisWeek(
  teamId: string
): Promise<{
  count: number;
  players: { id: string; name: string; colorIndex: number | null }[];
}> {
  // PR = a benchmark_result this ISO week that beats the player's prior best
  // on the same drill. "Better" depends on benchmark_type:
  //   timed → lower time
  //   rated → higher rating
  const weekStart = startOfIsoWeek(new Date());
  const weekStartISO = weekStart.toISOString();

  // Same fallback rung as fetchAttendanceSummary: prefer color_index, drop
  // it gracefully if migration 45 isn't applied to this project.
  const prsSelect = (withColor: boolean) =>
    supabase
      .from("benchmark_results")
      .select(
        `id, drill_id, player_id, time_seconds, rating, benchmark_type, created_at, team_players(player_name${
          withColor ? ", color_index" : ""
        })`
      )
      .eq("team_id", teamId)
      .gte("created_at", weekStartISO);

  let res = await prsSelect(true);
  if (res.error && /color_index/.test(res.error.message)) {
    res = await prsSelect(false);
  }
  const { data: thisWeek, error } = res;

  if (error || !thisWeek || thisWeek.length === 0) {
    if (error) console.warn("[dashboard] PRs this week:", error.message);
    return { count: 0, players: [] };
  }

  // Pull all prior results in one shot for the same (drill, player) pairs.
  const pairs = Array.from(
    new Set(thisWeek.map((r) => `${r.drill_id}:${r.player_id}`))
  );
  const drillIds = Array.from(new Set(thisWeek.map((r) => r.drill_id)));
  const playerIds = Array.from(new Set(thisWeek.map((r) => r.player_id)));

  const { data: prior } = await supabase
    .from("benchmark_results")
    .select("drill_id, player_id, time_seconds, rating, benchmark_type, created_at")
    .eq("team_id", teamId)
    .in("drill_id", drillIds)
    .in("player_id", playerIds)
    .lt("created_at", weekStartISO);

  // Index prior bests by (drill, player).
  const bestTime = new Map<string, number>();
  const bestRating = new Map<string, number>();
  for (const r of prior ?? []) {
    const k = `${r.drill_id}:${r.player_id}`;
    if (r.benchmark_type === "timed" && typeof r.time_seconds === "number") {
      const cur = bestTime.get(k);
      if (cur === undefined || r.time_seconds < cur) bestTime.set(k, r.time_seconds);
    } else if (r.benchmark_type === "rated" && typeof r.rating === "number") {
      const cur = bestRating.get(k);
      if (cur === undefined || r.rating > cur) bestRating.set(k, r.rating);
    }
  }

  const pr = new Map<string, { name: string; colorIndex: number | null }>();
  for (const r of thisWeek) {
    const k = `${r.drill_id}:${r.player_id}`;
    let isPR = false;
    if (r.benchmark_type === "timed" && typeof r.time_seconds === "number") {
      const baseline = bestTime.get(k);
      isPR = baseline === undefined || r.time_seconds < baseline;
    } else if (r.benchmark_type === "rated" && typeof r.rating === "number") {
      const baseline = bestRating.get(k);
      isPR = baseline === undefined || r.rating > baseline;
    }
    if (isPR) {
      const tp = r.team_players as
        | { player_name: string; color_index?: number | null }
        | { player_name: string; color_index?: number | null }[]
        | null;
      const p = Array.isArray(tp) ? tp[0] : tp;
      pr.set(r.player_id, {
        name: p?.player_name ?? "Unknown",
        colorIndex: p?.color_index ?? null,
      });
    }
    void pairs; // referenced for ESLint
  }

  return {
    count: pr.size,
    players: Array.from(pr.entries()).map(([id, v]) => ({
      id,
      name: v.name,
      colorIndex: v.colorIndex,
    })),
  };
}

export function deriveMoves(input: {
  nextPractice: NextPractice;
  practicesCompletedCount: number;
}): Move[] {
  const { nextPractice, practicesCompletedCount } = input;

  const nextExists = !!nextPractice;
  // 03: roster confirmed = every attendee has rsvp = true on the next practice
  const rosterConfirmed =
    !!nextPractice && nextPractice.total > 0 && nextPractice.committed === nextPractice.total;
  const rosterCounts =
    nextPractice
      ? `${nextPractice.committed} of ${nextPractice.total} confirmed`
      : "No upcoming practice";

  // Scouting/benchmarking is NOT a weekly chore — it's a persistent intelligence
  // surface, so it lives in its own dashboard entry (ScoutingEntryCard), not in
  // this to-do list. These moves are genuine time-boxed tasks for the next
  // practice only.
  return [
    {
      key: "practice",
      index: "01",
      title: nextExists ? `Lock in ${nextPractice!.title ?? "your next practice"}` : "Plan your next practice",
      desc: nextExists
        ? "Drills, time blocks, and notes."
        : "Pick a date and drop in a few drills.",
      cta: nextExists ? "Open plan" : "Plan a practice",
      href: nextExists ? `/practice/${nextPractice!.practice_plan_id}` : `/practice/new`,
      done: nextExists && practicesCompletedCount > 0 && rosterConfirmed,
    },
    {
      key: "roster",
      index: "02",
      title: "Confirm roster",
      desc: rosterCounts,
      cta: "Nudge pending",
      href: nextExists ? `/practice/${nextPractice!.practice_plan_id}` : `/roster`,
      done: rosterConfirmed,
    },
  ];
}

