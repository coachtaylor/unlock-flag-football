// Canonical "raw benchmark_results rows → per-drill history" transform.
//
// One source of truth shared by the roster player-detail page and the Team
// Scouting Report side sheet. Both surfaces render a per-(drill, type)
// sparkline + delta; without this they'd each re-derive value-semantics and
// drift the first time a benchmark type's meaning changes. Value/inverse come
// from the canonical lib/benchmarks/metrics; only the detail-surface
// presentation (verbose unit, per-type accent, decimal formatting) lives here.
//
// Pure, no I/O. Extracted from roster/[playerId]/page.tsx (Build 8.7 Phase 3).

import {
  valueFromBenchmark,
  isInverse,
  pulseUnit,
  type PulseBenchmarkType,
} from "./metrics";

export type Sample = {
  date: string;
  value: number;
  label: string;
  // id of the underlying benchmark_results row — carried so the scouting
  // sheet can target the latest sample for an inline correction. Optional so
  // the roster history chart (which never edits) is unaffected.
  id?: string;
};

export type PlayerHistoryDrill = {
  key: string;
  drillId: string;
  drillName: string;
  benchmarkType: string | null;
  unit: string;
  better: "higher" | "lower";
  accent: string;
  samples: Sample[]; // chronological (oldest → newest)
};

export type PlayerHistoryLocked = {
  key: string;
  drillId: string;
  drillName: string;
  benchmarkType: string;
  accent: string;
};

type DrillJoin = {
  id?: string;
  drill_name: string;
  benchmark_type: string | null;
  benchmark_types: string[] | null;
};

// The raw benchmark_results shape this transform consumes. A superset is fine
// (extra columns ignored); these are the ones it reads.
export type BenchHistoryRow = {
  id: string;
  assessment_date: string;
  time_seconds: number | null;
  rating: number | null;
  made_count: number | null;
  attempts_count: number | null;
  benchmark_type: string | null;
  drill_id: string;
  team_drills: DrillJoin | DrillJoin[] | null;
};

// Resolve a row to a numeric sample. Defers to the canonical
// valueFromBenchmark for known types; falls back to the legacy
// one-column-per-row read when the type is unknown (older rows).
function sampleValue(b: BenchHistoryRow, type: string | null): number | null {
  if (type == null) {
    if (b.time_seconds != null) return Number(b.time_seconds);
    if (b.rating != null) return Number(b.rating);
    return null;
  }
  return valueFromBenchmark(b, type as PulseBenchmarkType);
}

export function unitFor(type: string | null): string {
  return type ? pulseUnit(type as PulseBenchmarkType, true) : "";
}

export function betterFor(type: string | null): "higher" | "lower" {
  return type && isInverse(type as PulseBenchmarkType) ? "lower" : "higher";
}

// Per-type accent for the history sparkline. Presentation-only, so it lives
// with the history transform rather than in value-semantics.
export function accentFor(type: string | null): string {
  switch (type) {
    case "timed":
      return "#FF6A1A";
    case "rated":
      return "#6EA8FF";
    case "pct":
      return "#FFB347";
    case "flags":
      return "#B89BFF";
    case "drops":
      return "#FF4D4D";
    case "reps":
      return "#C2FF3D";
    default:
      return "#F4F4F2";
  }
}

export function formatValue(v: number, type: string | null): string {
  switch (type) {
    case "timed":
      return v.toFixed(2);
    case "rated":
      return v.toFixed(1);
    case "pct":
      return v.toFixed(0);
    default:
      return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }
}

function drillRowOf(b: BenchHistoryRow): DrillJoin | undefined {
  return Array.isArray(b.team_drills) ? b.team_drills[0] : b.team_drills ?? undefined;
}

export type PlayerHistory = {
  drills: PlayerHistoryDrill[];
  locked: PlayerHistoryLocked[];
  benchmarkCount: number;
  pbCount: number; // count of samples that beat all prior in their drill
};

// Group a player's benchmark rows into per-(drill, type) histories, plus the
// (drill, type) combos the drill *supports* but the player hasn't been
// measured on yet (locked-insight tail). Mirrors the original inline logic
// from the roster page byte-for-byte so neither surface's numbers shift.
export function buildPlayerHistory(rows: BenchHistoryRow[]): PlayerHistory {
  const groups = new Map<string, PlayerHistoryDrill>();
  const drillSupport = new Map<
    string,
    { drillName: string; supportedTypes: Set<string> }
  >();

  for (const b of rows) {
    const drillRow = drillRowOf(b);
    const drillName = drillRow?.drill_name ?? "Drill";
    const type = b.benchmark_type ?? drillRow?.benchmark_type ?? null;

    if (b.drill_id && !drillSupport.has(b.drill_id)) {
      const supported = new Set<string>();
      const arr = drillRow?.benchmark_types ?? null;
      if (arr) for (const t of arr) if (t) supported.add(t);
      if (supported.size === 0 && drillRow?.benchmark_type) {
        supported.add(drillRow.benchmark_type);
      }
      drillSupport.set(b.drill_id, { drillName, supportedTypes: supported });
    }

    const value = sampleValue(b, type);
    if (value == null) continue;
    const key = `${b.drill_id}::${type ?? ""}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        drillId: b.drill_id,
        drillName,
        benchmarkType: type,
        unit: unitFor(type),
        better: betterFor(type),
        accent: accentFor(type),
        samples: [],
      });
    }
    groups.get(key)!.samples.push({
      date: b.assessment_date,
      value,
      label: formatValue(value, type),
      id: b.id,
    });
  }

  const drills = Array.from(groups.values()).sort((a, b) => {
    const aLast = a.samples[a.samples.length - 1]?.date ?? "";
    const bLast = b.samples[b.samples.length - 1]?.date ?? "";
    return bLast.localeCompare(aLast);
  });

  const measuredKeys = new Set(
    drills.map((d) => `${d.drillId}::${d.benchmarkType ?? ""}`)
  );
  const locked: PlayerHistoryLocked[] = [];
  for (const [drillId, info] of drillSupport.entries()) {
    for (const t of info.supportedTypes) {
      if (measuredKeys.has(`${drillId}::${t}`)) continue;
      locked.push({
        key: `locked::${drillId}::${t}`,
        drillId,
        drillName: info.drillName,
        benchmarkType: t,
        accent: accentFor(t),
      });
    }
  }
  locked.sort((a, b) => a.drillName.localeCompare(b.drillName));

  // Personal bests: samples that beat all prior samples in their drill.
  let pbCount = 0;
  for (const g of drills) {
    let best = g.better === "lower" ? Infinity : -Infinity;
    for (const s of g.samples) {
      const beats = g.better === "lower" ? s.value < best : s.value > best;
      if (beats) {
        if (best !== Infinity && best !== -Infinity) pbCount += 1;
        best = s.value;
      }
    }
  }

  return { drills, locked, benchmarkCount: rows.length, pbCount };
}
