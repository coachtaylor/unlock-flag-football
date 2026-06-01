import { supabase } from "./supabase";
import { BENCHMARK_TYPE_META, type BenchmarkType } from "../constants/benchmarks";
import { localDateString } from "./date";

// Shared write path for benchmark_results. Single source of truth — both the
// formal benchmark-log flow (app/benchmarks/log.tsx) and the mid-practice
// quick-rate sheet (components/practice/QuickRateSheet.tsx) go through here so
// the natural-key dedupe + upsert behaviour can never drift between them.

// How a result was captured. 'benchmark' = the deliberate assessment flow;
// 'practice_quick' = a fast 1-5 tap during a live practice drill. Both stamp
// captured_on='mobile'. Mirrors the web `entry_mode` enum.
export type BenchmarkEntryMode = "benchmark" | "practice_quick";

// One benchmark_results row. Optional metric columns stay undefined for the
// types they don't apply to (a rated row carries no time_seconds, etc.).
export type BenchmarkResultInput = {
  team_id: string;
  drill_id: string;
  player_id: string;
  assessed_by: string;
  assessment_date: string; // local YYYY-MM-DD
  benchmark_type: BenchmarkType;
  set_number: number;
  time_seconds?: number | null;
  rating?: number | null;
  made_count?: number | null;
  attempts_count?: number | null;
  inverse?: boolean | null;
  rated_label?: string | null;
  group_name?: string | null;
  tags?: string[];
  notes?: string | null;
  entry_mode: BenchmarkEntryMode;
  needs_review?: boolean;
};

// The columns that uniquely identify a result (one row per assessor, per
// player, per drill, per type, per set, per day). Used to decide update vs
// insert so re-saving a stop never duplicates rows.
const NATURAL_KEY = [
  "team_id",
  "drill_id",
  "player_id",
  "assessed_by",
  "assessment_date",
  "benchmark_type",
  "set_number",
] as const;

/**
 * Upsert a single benchmark_results row by its natural key: look up an
 * existing row (same assessor/player/drill/type/set/date), then update it or
 * insert a fresh one. Always stamps captured_on='mobile'. Returns the write
 * error (or null) — callers surface it; this never throws.
 */
export async function upsertBenchmarkResult(
  input: BenchmarkResultInput
): Promise<{ error: { message: string } | null }> {
  const row = {
    team_id: input.team_id,
    drill_id: input.drill_id,
    player_id: input.player_id,
    assessed_by: input.assessed_by,
    assessment_date: input.assessment_date,
    benchmark_type: input.benchmark_type,
    set_number: input.set_number,
    time_seconds: input.time_seconds ?? null,
    rating: input.rating ?? null,
    made_count: input.made_count ?? null,
    attempts_count: input.attempts_count ?? null,
    inverse: input.inverse ?? null,
    rated_label: input.rated_label ?? null,
    group_name: input.group_name ?? null,
    tags: input.tags ?? [],
    notes: input.notes ?? null,
    entry_mode: input.entry_mode,
    captured_on: "mobile" as const,
    needs_review: input.needs_review ?? false,
  };

  let lookup = supabase.from("benchmark_results").select("id");
  for (const k of NATURAL_KEY) {
    lookup = lookup.eq(k, row[k]);
  }
  const { data: existing, error: lookupErr } = await lookup.maybeSingle();
  if (lookupErr) return { error: lookupErr };

  if (existing?.id) {
    const { error } = await supabase
      .from("benchmark_results")
      .update(row)
      .eq("id", existing.id);
    return { error };
  }
  const { error } = await supabase.from("benchmark_results").insert(row);
  return { error };
}

// ─────────────────────────────────────────────────────────────────────────
// Needs-review queue (Build 14f — mobile port of web Build 11's queue half).
// Captains flag an assessment as "needs more detail" while logging (14c) or
// mid-practice (14d, default on); this is the backlog they revisit. Capped to
// the last 30 days so it stays scannable (matches the web badge logic).
// ─────────────────────────────────────────────────────────────────────────

// One flagged benchmark_results row, hydrated with drill + player names and a
// display-ready value, for the review queue screen.
export type NeedsReviewEntry = {
  id: string;
  drillId: string;
  drillName: string;
  playerName: string;
  benchmarkType: BenchmarkType | null;
  value: string;
  assessmentDate: string;
  capturedOn: string; // 'mobile' | 'desktop'
  entryMode: string; // 'benchmark' | 'practice_quick' | 'self_report'
  tags: string[];
  notes: string | null;
};

// Local YYYY-MM-DD cutoff, `days` ago — the queue + badge both window here.
function reviewCutoff(days = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDateString(d);
}

// Format a result row's metric the way the queue shows it. Mirrors the web
// formatValue (units come from BENCHMARK_TYPE_META so the two stay in step).
function formatReviewValue(row: {
  benchmark_type: string | null;
  time_seconds: number | null;
  rating: number | null;
  made_count: number | null;
  attempts_count: number | null;
}): string {
  const type = (row.benchmark_type as BenchmarkType | null) ?? null;
  if (!type) return "—";
  const unit = BENCHMARK_TYPE_META[type]?.unit ?? "";
  if (type === "timed") {
    return row.time_seconds != null ? `${Number(row.time_seconds).toFixed(2)}${unit}` : "—";
  }
  if (type === "rated") {
    return row.rating != null ? `${row.rating}${unit}` : "—";
  }
  if (type === "pct") {
    if (row.made_count == null || row.attempts_count == null) return "—";
    const pct = row.attempts_count
      ? Math.round((row.made_count / row.attempts_count) * 100)
      : 0;
    return `${row.made_count}/${row.attempts_count} (${pct}%)`;
  }
  return row.made_count != null ? `${row.made_count}${unit}` : "—";
}

/**
 * Count flagged entries for the team in the last 30 days — the badge number on
 * the dashboard + benchmarks hub. Lightweight (head + exact count, no rows).
 * Returns 0 on error so the badge just hides.
 */
export async function countNeedsReview(teamId: string): Promise<number> {
  if (!teamId) return 0;
  const { count, error } = await supabase
    .from("benchmark_results")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("needs_review", true)
    .gte("assessment_date", reviewCutoff());
  if (error) {
    console.warn("[needs-review] count error:", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Load the flagged-entries queue (last 30 days), newest first, hydrated with
 * drill + player names via two small lookups (keeps RLS simple). Returns []
 * (never throws) so the screen renders its empty state on any failure.
 */
export async function loadNeedsReviewQueue(
  teamId: string
): Promise<NeedsReviewEntry[]> {
  if (!teamId) return [];
  const { data, error } = await supabase
    .from("benchmark_results")
    .select(
      "id, drill_id, player_id, benchmark_type, rating, time_seconds, made_count, attempts_count, tags, notes, assessment_date, created_at, captured_on, entry_mode"
    )
    .eq("team_id", teamId)
    .eq("needs_review", true)
    .gte("assessment_date", reviewCutoff())
    .order("assessment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[needs-review] queue error:", error.message);
    return [];
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const drillIds = Array.from(new Set(rows.map((r) => r.drill_id as string)));
  const playerIds = Array.from(new Set(rows.map((r) => r.player_id as string)));
  const [drillsRes, playersRes] = await Promise.all([
    supabase.from("team_drills").select("id, drill_name").in("id", drillIds),
    supabase.from("team_players").select("id, player_name").in("id", playerIds),
  ]);
  const drillNameById = new Map(
    (drillsRes.data ?? []).map((d) => [d.id as string, d.drill_name as string])
  );
  const playerNameById = new Map(
    (playersRes.data ?? []).map((p) => [p.id as string, p.player_name as string])
  );

  return rows.map((r) => ({
    id: r.id as string,
    drillId: r.drill_id as string,
    drillName: drillNameById.get(r.drill_id as string) ?? "Drill",
    playerName: playerNameById.get(r.player_id as string) ?? "Player",
    benchmarkType: (r.benchmark_type as BenchmarkType | null) ?? null,
    value: formatReviewValue(r),
    assessmentDate: r.assessment_date as string,
    capturedOn: (r.captured_on as string | null) ?? "mobile",
    entryMode: (r.entry_mode as string | null) ?? "benchmark",
    tags: ((r.tags as string[] | null) ?? []) as string[],
    notes: (r.notes as string | null) ?? null,
  }));
}

export type ClearReviewResult = { ok: true } | { ok: false; error: string };

/**
 * Clear the needs_review flag on one row. RLS already scopes writes to the
 * user's team(s); the team_id filter is a belt-and-suspenders guard.
 */
export async function clearNeedsReview(
  resultId: string,
  teamId: string
): Promise<ClearReviewResult> {
  if (!resultId || !teamId) return { ok: false, error: "Missing id." };
  const { error } = await supabase
    .from("benchmark_results")
    .update({ needs_review: false })
    .eq("id", resultId)
    .eq("team_id", teamId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
