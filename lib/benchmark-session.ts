import { colors } from "../constants/design";
import {
  BENCHMARK_TYPE_META,
  BENCHMARK_TYPE_ORDER,
  benchmarkConfigFromLegacy,
  defaultPerType,
  parseBenchmarkConfig,
  type BenchmarkConfig,
  type BenchmarkScope,
  type BenchmarkType,
  type GroupConfig,
  type PerTypeConfig,
} from "../constants/benchmarks";
import { POSITION_SIDE } from "../constants/positions";

export type GroupName = "whole" | "qb" | "nonqb";

export type SessionPlayer = {
  id: string;
  name: string;
  positions: string[];
  initials: string;
  color: string;
};

export type CapturedSet = {
  // Numeric value the type stores; meaning depends on type.
  timeSeconds?: number | null;
  rating?: number | null;
  madeCount?: number | null;
  attemptsCount?: number | null;
  inverse?: boolean;
  savedAt?: number; // local timestamp for "done" badges
};

// Keyed by `${playerId}|${type}|${setNumber}`
export type CaptureMap = Record<string, CapturedSet>;

export const setKey = (
  playerId: string,
  type: BenchmarkType,
  setNumber: number
): string => `${playerId}|${type}|${setNumber}`;

export const DEFAULT_SETS_PER_PLAYER = 3;

// ── Group resolution ────────────────────────────────────────────────
export const isQb = (positions: string[] | null | undefined): boolean => {
  if (!positions) return false;
  return positions.includes("QB");
};

export const filterPlayersByGroup = (
  players: SessionPlayer[],
  group: GroupName
): SessionPlayer[] => {
  if (group === "whole") return players;
  if (group === "qb") return players.filter((p) => isQb(p.positions));
  return players.filter((p) => !isQb(p.positions));
};

export const groupsForScope = (scope: BenchmarkScope): GroupName[] => {
  if (scope === "whole") return ["whole"];
  if (scope === "qb") return ["qb"];
  if (scope === "nonqb") return ["nonqb"];
  return ["nonqb", "qb"];
};

export const groupForPlayer = (
  scope: BenchmarkScope,
  player: SessionPlayer
): GroupName => {
  if (scope === "whole") return "whole";
  if (scope === "qb") return "qb";
  if (scope === "nonqb") return "nonqb";
  return isQb(player.positions) ? "qb" : "nonqb";
};

// ── Config resolution ───────────────────────────────────────────────
export const resolveConfig = (
  benchmarkConfig: unknown,
  legacyType: string | null,
  legacyTypes: string[] | null
): BenchmarkConfig | null => {
  const parsed = parseBenchmarkConfig(benchmarkConfig);
  if (parsed) return parsed;
  return benchmarkConfigFromLegacy(legacyType, legacyTypes);
};

export const groupConfigForGroup = (
  cfg: BenchmarkConfig,
  group: GroupName
): GroupConfig | null => {
  if (group === "whole") return cfg.whole ?? null;
  if (group === "qb") return cfg.qb ?? null;
  return cfg.nonqb ?? null;
};

export const typesForGroup = (
  cfg: BenchmarkConfig,
  group: GroupName
): BenchmarkType[] => {
  const g = groupConfigForGroup(cfg, group);
  if (!g) return [];
  // Preserve the canonical order so the capture flow is deterministic.
  return BENCHMARK_TYPE_ORDER.filter((t) => g.types.includes(t));
};

export const perTypeFor = (
  cfg: BenchmarkConfig,
  group: GroupName,
  type: BenchmarkType
): PerTypeConfig => {
  const g = groupConfigForGroup(cfg, group);
  return g?.perType[type] ?? defaultPerType(type);
};

// ── Display helpers ─────────────────────────────────────────────────
export const initialsFor = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Avatar color now lives entirely in lib/athlete.ts. Import
// `playerColorForIndex` (preferred) or `playerColorForId` (legacy
// hash) directly from there — this file used to re-export under the
// `playerAvatarColor` alias, which was removed when the codebase
// switched to color_index slots in migration 45.

// ── Tone ────────────────────────────────────────────────────────────
// QB group gets blue, everything else orange. Inverse counters override
// to red inside their own card but the top-bar / banner tone stays group-based.
export type Tone = "orange" | "blue" | "red";

export const toneForGroup = (group: GroupName): Tone =>
  group === "qb" ? "blue" : "orange";

export const toneColor = (tone: Tone): string => {
  if (tone === "blue") return colors.blue[400];
  if (tone === "red") return colors.red.semantic;
  return colors.orange[500];
};

export const toneTint = (tone: Tone): string => {
  if (tone === "blue") return colors.blue.tint;
  if (tone === "red") return "rgba(255, 77, 77, 0.14)";
  return colors.orange.tint;
};

export const toneBorder = (tone: Tone): string => {
  if (tone === "blue") return colors.blue.tintBorder;
  if (tone === "red") return "rgba(255, 77, 77, 0.32)";
  return colors.orange.tintBorder;
};

// ── Effective inverse ────────────────────────────────────────────────
// "drops" defaults inverse=true; "flags" is inverse only if config flagged
// it. Other types are never inverse.
export const effectiveInverse = (
  type: BenchmarkType,
  perType: PerTypeConfig
): boolean => {
  const meta = BENCHMARK_TYPE_META[type];
  if (perType.inverse !== undefined) return perType.inverse;
  return !!meta.defaultInverse;
};

// ── Persistence payload builder ─────────────────────────────────────
// Maps captured state for one (player, type, set) into the columns
// benchmark_results expects. Returns null if the set was never filled.
export type SavePayload = {
  benchmark_type: BenchmarkType;
  set_number: number;
  group_name: GroupName;
  time_seconds: number | null;
  rating: number | null;
  made_count: number | null;
  attempts_count: number | null;
  inverse: boolean;
  rated_label: string | null;
};

export const buildSavePayload = (
  type: BenchmarkType,
  setNumber: number,
  group: GroupName,
  set: CapturedSet,
  perType: PerTypeConfig
): SavePayload | null => {
  const inverse = effectiveInverse(type, perType);
  const base: SavePayload = {
    benchmark_type: type,
    set_number: setNumber,
    group_name: group,
    time_seconds: null,
    rating: null,
    made_count: null,
    attempts_count: null,
    inverse,
    rated_label: perType.label?.trim() || null,
  };

  switch (type) {
    case "timed":
      if (set.timeSeconds == null || !Number.isFinite(set.timeSeconds))
        return null;
      return { ...base, time_seconds: set.timeSeconds };
    case "rated":
      if (set.rating == null) return null;
      return { ...base, rating: set.rating };
    case "reps":
    case "flags":
    case "drops":
      if (set.madeCount == null) return null;
      return { ...base, made_count: set.madeCount };
    case "pct":
      if (set.madeCount == null || set.attemptsCount == null) return null;
      return {
        ...base,
        made_count: set.madeCount,
        attempts_count: set.attemptsCount,
      };
  }
};

// ── Iteration cursor ────────────────────────────────────────────────
// One stop per (group, player, set). All metrics configured for that
// group are captured on the same screen, so a non-QB benchmarked on
// Timed + Completion % sees both widgets stacked for the same set.
export type Stop = {
  group: GroupName;
  playerId: string;
  setNumber: number; // 1-indexed
};

export const buildStops = (
  cfg: BenchmarkConfig,
  groups: GroupName[],
  playersByGroup: Record<GroupName, SessionPlayer[]>,
  setsPerPlayer: number
): Stop[] => {
  const stops: Stop[] = [];
  for (const group of groups) {
    const types = typesForGroup(cfg, group);
    const players = playersByGroup[group] ?? [];
    if (types.length === 0 || players.length === 0) continue;
    for (const player of players) {
      for (let s = 1; s <= setsPerPlayer; s++) {
        stops.push({ group, playerId: player.id, setNumber: s });
      }
    }
  }
  return stops;
};

// QB-detection sanity helper for consumers that don't want to import
// constants/positions.
export const sideOf = (positions: string[]): "offense" | "defense" | null => {
  if (positions.length === 0) return null;
  return POSITION_SIDE[positions[0]] ?? null;
};
