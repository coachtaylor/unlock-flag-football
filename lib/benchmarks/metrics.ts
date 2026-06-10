// Canonical benchmark value-semantics — the ONE place that defines what a
// benchmark measurement *means* for each type. Shared by the team dashboard
// loader (team-home-data.ts) and the Team Scouting Report loader
// (team-scouting-data.ts) so the two surfaces can never disagree on how a
// timed/rated/pct/reps result is read, ranked, or unit-labelled.
//
// Extracted from team-home-data.ts (Build 8.7). Pure functions, no I/O.

export type PulseBenchmarkType =
  | "timed"
  | "rated"
  | "reps"
  | "pct"
  | "flags"
  | "drops";

// Unit suffix for a benchmark type ("4.52s", "3.2/5", "78%"). `verbose`
// spells out the count types for detail surfaces (history cards) where a
// bare number reads ambiguously; the compact default (dashboard pulses,
// scouting deltas) keeps them blank. timed/rated/pct are identical in both
// modes, so this stays the single source of truth for benchmark units.
export function pulseUnit(t: PulseBenchmarkType, verbose = false): string {
  switch (t) {
    case "timed":
      return "s";
    case "rated":
      return "/5";
    case "pct":
      return "%";
    case "reps":
      return verbose ? " reps" : "";
    case "flags":
      return verbose ? " pulls" : "";
    case "drops":
      return verbose ? " drops" : "";
  }
}

// Whether lower-is-better for a benchmark type. timed + drops invert
// (a faster time / fewer drops is an improvement).
export function isInverse(t: PulseBenchmarkType): boolean {
  return t === "timed" || t === "drops";
}

// The single comparable number extracted from a raw benchmark row for a given
// type. Returns null when the row lacks the fields that type needs.
export function valueFromBenchmark(
  row: {
    time_seconds: number | null;
    rating: number | null;
    made_count: number | null;
    attempts_count: number | null;
  },
  t: PulseBenchmarkType
): number | null {
  switch (t) {
    case "timed":
      return row.time_seconds;
    case "rated":
      return row.rating;
    case "reps":
    case "flags":
    case "drops":
      return row.made_count ?? row.rating; // reps lives in made_count for newer types
    case "pct":
      if (row.made_count == null || !row.attempts_count) return null;
      return (row.made_count / row.attempts_count) * 100;
  }
}
