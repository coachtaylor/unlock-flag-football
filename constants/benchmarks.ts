import { Ionicons } from "@expo/vector-icons";

export type BenchmarkType =
  | "timed"
  | "reps"
  | "pct"
  | "flags"
  | "rated"
  | "drops";

export type BenchmarkScope = "whole" | "qb" | "nonqb" | "both";

export const BENCHMARK_TYPE_ORDER: BenchmarkType[] = [
  "timed",
  "reps",
  "pct",
  "flags",
  "rated",
  "drops",
];

type IoniconName = keyof typeof Ionicons.glyphMap;

export const BENCHMARK_TYPE_META: Record<
  BenchmarkType,
  {
    label: string;
    sub: string;
    icon: IoniconName;
    unit: string;
    defaultInverse?: boolean;
    hasInverseToggle?: boolean;
    hasAttempts?: boolean;
    hasLabel?: boolean;
  }
> = {
  timed: {
    label: "Timed",
    sub: "sec, lower = better",
    icon: "stopwatch-outline",
    unit: "s",
  },
  reps: {
    label: "Reps complete",
    sub: "count, higher = better",
    icon: "add-outline",
    unit: "×",
  },
  pct: {
    label: "Completion %",
    sub: "made out of attempted",
    icon: "pie-chart-outline",
    unit: "%",
    hasAttempts: true,
  },
  flags: {
    label: "Flags pulled",
    sub: "count, higher = better",
    icon: "flag-outline",
    unit: "×",
    hasInverseToggle: true,
  },
  rated: {
    label: "Rated 1–5",
    sub: "coach scores form",
    icon: "star-outline",
    unit: "/5",
    hasLabel: true,
  },
  drops: {
    label: "Drops",
    sub: "count, lower = better",
    icon: "trending-down-outline",
    unit: "×",
    defaultInverse: true,
    hasInverseToggle: true,
  },
};

export const BENCHMARK_SCOPE_OPTIONS: {
  id: BenchmarkScope;
  label: string;
  sub: string;
}[] = [
  { id: "whole", label: "Whole team", sub: "one config" },
  { id: "qb", label: "QBs only", sub: "positions filtered" },
  { id: "nonqb", label: "Non-QBs", sub: "positions filtered" },
  { id: "both", label: "Both", sub: "separate configs" },
];

export const BENCHMARK_SCOPE_LABELS: Record<BenchmarkScope, string> = {
  whole: "Whole team",
  qb: "QBs only",
  nonqb: "Non-QBs",
  both: "Both",
};

// Sets-per-player is intentionally NOT stored here — coaches add sets on
// the fly inside the active benchmark capture flow, same value across all
// positions and types.
export type PerTypeConfig = {
  attemptsPerSet?: number;
  label?: string;
  inverse?: boolean;
  // Pass-mark threshold authored on web (e.g. "4.6"). Mobile doesn't surface
  // a target editor yet, but parses + round-trips it so a web-authored
  // benchmark keeps its pass mark when viewed/edited on mobile. See TD-1.
  target?: string;
};

export type GroupConfig = {
  types: BenchmarkType[];
  perType: Partial<Record<BenchmarkType, PerTypeConfig>>;
};

export type BenchmarkConfig = {
  scope: BenchmarkScope;
  matchConfigs?: boolean;
  whole?: GroupConfig;
  qb?: GroupConfig;
  nonqb?: GroupConfig;
};

export const DEFAULT_ATTEMPTS_PER_SET = 3;

export const emptyGroup = (): GroupConfig => ({ types: [], perType: {} });

const isBenchmarkType = (v: unknown): v is BenchmarkType =>
  typeof v === "string" &&
  (BENCHMARK_TYPE_ORDER as readonly string[]).includes(v);

export const defaultPerType = (t: BenchmarkType): PerTypeConfig => {
  const meta = BENCHMARK_TYPE_META[t];
  const cfg: PerTypeConfig = {};
  if (meta.hasAttempts) cfg.attemptsPerSet = DEFAULT_ATTEMPTS_PER_SET;
  if (meta.hasLabel) cfg.label = "";
  if (meta.defaultInverse) cfg.inverse = true;
  return cfg;
};

// Whether this type renders any extra knobs in the drill build/config UI.
// Timed and Reps don't — they only need a "yes, capture this" confirmation
// chip.
export const hasPerTypeKnobs = (t: BenchmarkType): boolean => {
  const meta = BENCHMARK_TYPE_META[t];
  return !!(meta.hasAttempts || meta.hasLabel || meta.hasInverseToggle);
};

export const toggleTypeInGroup = (
  group: GroupConfig,
  t: BenchmarkType
): GroupConfig => {
  if (group.types.includes(t)) {
    const { [t]: _drop, ...rest } = group.perType;
    return {
      types: group.types.filter((x) => x !== t),
      perType: rest as GroupConfig["perType"],
    };
  }
  return {
    types: [...group.types, t],
    perType: { ...group.perType, [t]: defaultPerType(t) },
  };
};

export const updatePerType = (
  group: GroupConfig,
  t: BenchmarkType,
  patch: Partial<PerTypeConfig>
): GroupConfig => ({
  types: group.types,
  perType: {
    ...group.perType,
    [t]: { ...(group.perType[t] ?? defaultPerType(t)), ...patch },
  },
});

export const flattenBenchmarkTypes = (
  cfg: BenchmarkConfig
): BenchmarkType[] => {
  const out = new Set<BenchmarkType>();
  const collect = (g?: GroupConfig) => g?.types.forEach((t) => out.add(t));
  if (cfg.scope === "whole") collect(cfg.whole);
  else if (cfg.scope === "qb") collect(cfg.qb);
  else if (cfg.scope === "nonqb") collect(cfg.nonqb);
  else if (cfg.scope === "both") {
    collect(cfg.qb);
    collect(cfg.nonqb);
  }
  return BENCHMARK_TYPE_ORDER.filter((t) => out.has(t));
};

export const buildBenchmarkConfig = (input: {
  scope: BenchmarkScope;
  whole: GroupConfig;
  qb: GroupConfig;
  nonqb: GroupConfig;
  matchConfigs: boolean;
}): BenchmarkConfig => {
  const { scope, whole, qb, nonqb, matchConfigs } = input;
  const cfg: BenchmarkConfig = { scope };
  if (scope === "whole") cfg.whole = whole;
  else if (scope === "qb") cfg.qb = qb;
  else if (scope === "nonqb") cfg.nonqb = nonqb;
  else if (scope === "both") {
    cfg.matchConfigs = matchConfigs;
    cfg.nonqb = nonqb;
    cfg.qb = matchConfigs ? nonqb : qb;
  }
  return cfg;
};

const parseGroup = (raw: unknown): GroupConfig => {
  if (!raw || typeof raw !== "object") return emptyGroup();
  const r = raw as Record<string, unknown>;
  const types = Array.isArray(r.types)
    ? r.types.filter(isBenchmarkType)
    : [];
  const perType: GroupConfig["perType"] = {};
  const rawPerType =
    r.perType && typeof r.perType === "object"
      ? (r.perType as Record<string, unknown>)
      : {};
  for (const t of types) {
    const cfg = rawPerType[t];
    const base = defaultPerType(t);
    if (cfg && typeof cfg === "object") {
      const c = cfg as Record<string, unknown>;
      const next: PerTypeConfig = { ...base };
      if (typeof c.attemptsPerSet === "number")
        next.attemptsPerSet = c.attemptsPerSet;
      if (typeof c.label === "string") next.label = c.label;
      if (typeof c.inverse === "boolean") next.inverse = c.inverse;
      if (typeof c.target === "string" && c.target.trim() !== "")
        next.target = c.target.trim();
      perType[t] = next;
    } else {
      perType[t] = base;
    }
  }
  return { types, perType };
};

export const parseBenchmarkConfig = (
  raw: unknown
): BenchmarkConfig | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const scope = (r.scope as BenchmarkScope) ?? null;
  if (scope !== "whole" && scope !== "qb" && scope !== "nonqb" && scope !== "both")
    return null;
  const cfg: BenchmarkConfig = { scope };
  if (typeof r.matchConfigs === "boolean") cfg.matchConfigs = r.matchConfigs;
  if (r.whole) cfg.whole = parseGroup(r.whole);
  if (r.qb) cfg.qb = parseGroup(r.qb);
  if (r.nonqb) cfg.nonqb = parseGroup(r.nonqb);
  return cfg;
};

// Legacy single-value types from the pre-migration-38 column.
const LEGACY_TYPE_MAP: Record<string, BenchmarkType> = {
  timed: "timed",
  rated: "rated",
  reps_complete: "reps",
  percentage: "pct",
};

export const benchmarkConfigFromLegacy = (
  legacyType: string | null | undefined,
  legacyTypes: string[] | null | undefined
): BenchmarkConfig | null => {
  const fromArray = (legacyTypes ?? [])
    .map((t) => LEGACY_TYPE_MAP[t] ?? (isBenchmarkType(t) ? t : null))
    .filter((t): t is BenchmarkType => t != null);
  const single = legacyType ? LEGACY_TYPE_MAP[legacyType] : null;
  const types = fromArray.length > 0 ? fromArray : single ? [single] : [];
  if (types.length === 0) return null;
  const perType: GroupConfig["perType"] = {};
  for (const t of types) perType[t] = defaultPerType(t);
  return { scope: "whole", whole: { types, perType } };
};

export const isBenchmarkConfigured = (cfg: BenchmarkConfig | null): boolean => {
  if (!cfg) return false;
  if (cfg.scope === "both")
    return (
      (cfg.qb?.types.length ?? 0) > 0 || (cfg.nonqb?.types.length ?? 0) > 0
    );
  const g =
    cfg.scope === "whole" ? cfg.whole : cfg.scope === "qb" ? cfg.qb : cfg.nonqb;
  return (g?.types.length ?? 0) > 0;
};
