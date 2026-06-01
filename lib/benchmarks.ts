import { supabase } from "./supabase";
import type { BenchmarkType } from "../constants/benchmarks";

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
