import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Eyebrow } from "../../../components/ui/Eyebrow";
import { HeaderIconButton } from "../../../components/ui/HeaderIconButton";
import { SheetContainer, SheetSectionLabel } from "../../../components/ui/Sheet";
import { PhaseChip } from "../../../components/DrillForm";
import { colors, radius, spacing, tracking } from "../../../constants/design";
import { fontStyle, monoStyle } from "../../../constants/typography";
import {
  CategoryType,
  colorForCategory,
  inferCategoryType,
  normalizeCategory,
} from "../../../constants/categories";
import {
  SKILL_GROUP_META,
  skillGroupMeta,
  type SkillGroup,
} from "../../../constants/skill-groups";
import { supabase } from "../../../lib/supabase";
import { loadDrillSkills } from "../../../lib/skills";
import { loadDrillCategories } from "../../../lib/load-categories";
import { useTeam } from "../../../lib/team-context";
import { useAuth } from "../../../lib/auth-context";

const ALL = "__all__";

type Category = {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
};

// Widen to accept both legacy and migration-38 vocabularies. The filter UI
// in this screen only recognises the legacy four; new types still load and
// count as "benchmark drill", they just won't match the chip filters until
// the library filter row is redesigned.
type BenchmarkKind =
  | "timed"
  | "rated"
  | "reps_complete"
  | "percentage"
  | "reps"
  | "pct"
  | "flags"
  | "drops";

type Drill = {
  id: string;
  name: string;
  status: "draft" | "published";
  benchmarkTypes: BenchmarkKind[];
  categoryIds: string[];
  categoryNames: string[];
  // Skill groups the drill develops (from the skill taxonomy), in canonical
  // radar order. Powers the skill-group filter + row chips. Replaces the
  // retired skill-category pills.
  skillGroups: SkillGroup[];
  durationMin: number | null;
  reps: number | null;
  createdAt: string;
};

type StatusFilter = "all" | "draft" | "published";
type BenchmarkFilter =
  | "all"
  | "timed"
  | "rated"
  | "reps_complete"
  | "percentage"
  | "none";
type SortOption = "name_asc" | "recent";

function SkeletonRow() {
  const [opacity] = useState(new Animated.Value(0.3));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{
        height: 64,
        borderRadius: radius.md,
        backgroundColor: colors.surface.raised,
        opacity,
      }}
    />
  );
}

function SquadBar({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <View style={{ alignItems: "flex-end", gap: 2 }}>
      <Text
        style={[
          monoStyle("bold"),
          { fontSize: 18, color, letterSpacing: -0.36, lineHeight: 20 },
        ]}
      >
        {count}
      </Text>
      <Text
        style={[
          monoStyle("bold"),
          {
            fontSize: 9,
            color: colors.text.muted,
            letterSpacing: 1.1,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// Column geometry — kept in sync between TableHeader and DrillRow so
// labels (DUR / REPS) sit directly above their values.
const COL_BENCH_W = 56;
const COL_REPS_W = 48;
const COL_CHEVRON_W = 14;
const COL_GAP = 10;

function PhaseSectionHeader({
  label,
  color,
  count,
}: {
  label: string;
  color: string;
  count: number;
}) {
  const accent = color;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
      }}
    >
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 12,
            letterSpacing: tracking.loose,
            textTransform: "uppercase",
            color: accent,
          },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          monoStyle("medium"),
          {
            fontSize: 11,
            color: colors.text.muted,
            letterSpacing: 0.4,
          },
        ]}
      >
        {count} {count === 1 ? "drill" : "drills"}
      </Text>
    </View>
  );
}

function TableHeader() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: spacing.lg,
        paddingVertical: 10,
        gap: COL_GAP,
        backgroundColor: colors.surface.overlay,
      }}
    >
      <Text
        style={[
          fontStyle("bold"),
          {
            flex: 1,
            fontSize: 9.5,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: colors.text.muted,
          },
        ]}
      >
        Drill
      </Text>
      <Text
        style={[
          monoStyle("bold"),
          {
            width: COL_BENCH_W,
            fontSize: 9.5,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: colors.text.muted,
            textAlign: "right",
          },
        ]}
      >
        Dur
      </Text>
      <Text
        style={[
          monoStyle("bold"),
          {
            width: COL_REPS_W,
            fontSize: 9.5,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: colors.text.muted,
            textAlign: "right",
          },
        ]}
      >
        Reps
      </Text>
      <View style={{ width: COL_CHEVRON_W }} />
    </View>
  );
}

function DrillRow({
  drill,
  byId,
  onPress,
}: {
  drill: Drill;
  byId: Map<string, Category>;
  onPress: () => void;
}) {
  // Phases live in the section header — the row's left-edge accent bar
  // mirrors that phase color so a glance down the list reinforces which
  // section the row belongs to. Skill / sub-skill pills still render inside
  // the card. Drills with no phase tagged fall back to violet (a hue we
  // don't use elsewhere) so "no phase yet" reads as its own distinct state.
  const phase = drill.categoryIds
    .map((id) => byId.get(id))
    .find((c): c is Category => !!c && c.type === "phase");
  const accentColor = phase?.color ?? colors.team.violet;

  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "stretch",
            borderTopWidth: 1,
            borderTopColor: colors.border.subtle,
            opacity: pressed ? 0.85 : 1,
          }}
        >
          {/* Left divider in skill color — short bar centered vertically */}
          <View
            style={{
              width: spacing.lg,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: spacing.md,
            }}
          >
            <View
              style={{
                width: 3,
                flex: 1,
                borderRadius: 2,
                backgroundColor: accentColor,
              }}
            />
          </View>

          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              paddingRight: spacing.lg,
              paddingVertical: spacing.lg,
              gap: COL_GAP,
            }}
          >
            {/* Name + pill row + sub-skill row */}
            <View style={{ flex: 1, minWidth: 0, gap: spacing.sm }}>
              {/* Title row */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Text
                  style={[
                    fontStyle("bold"),
                    {
                      fontSize: 14,
                      color: colors.text.primary,
                      flexShrink: 1,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {drill.name}
                </Text>
                {drill.status === "draft" && (
                  <View
                    style={{
                      paddingHorizontal: 5,
                      paddingVertical: 1,
                      borderRadius: 3,
                      borderWidth: 1,
                      borderColor: colors.border.dashed,
                      borderStyle: "dashed",
                    }}
                  >
                    <Text
                      style={[
                        fontStyle("bold"),
                        {
                          fontSize: 9,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          color: colors.text.secondary,
                        },
                      ]}
                    >
                      Draft
                    </Text>
                  </View>
                )}
                {drill.benchmarkTypes.length > 0 && (
                  <View
                    accessibilityLabel="Benchmark drill"
                    style={{
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 4,
                      backgroundColor: "rgba(255, 77, 77, 0.14)",
                    }}
                  >
                    <Text
                      style={[
                        fontStyle("bold"),
                        {
                          fontSize: 9.5,
                          letterSpacing: 0.6,
                          textTransform: "uppercase",
                          color: colors.red.semantic,
                        },
                      ]}
                    >
                      Bench
                    </Text>
                  </View>
                )}
              </View>

              {/* Skill groups — the taxonomy axis. Each renders as a filled
                  tinted pill colored by its group. Wraps to the next line
                  when there are enough to push the right-hand columns. */}
              {drill.skillGroups.length > 0 && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 5,
                  }}
                >
                  {drill.skillGroups.map((g) => {
                    const meta = skillGroupMeta(g);
                    return (
                      <View
                        key={g}
                        style={{
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                          borderRadius: 4,
                          backgroundColor: meta.tint,
                        }}
                      >
                        <Text
                          style={[
                            fontStyle("bold"),
                            {
                              fontSize: 9.5,
                              letterSpacing: 0.6,
                              textTransform: "uppercase",
                              color: meta.color,
                            },
                          ]}
                        >
                          {meta.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* DURATION column */}
            <View style={{ width: COL_BENCH_W, alignItems: "flex-end" }}>
              {drill.durationMin != null && drill.durationMin > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    gap: 2,
                  }}
                >
                  <Text
                    style={[
                      monoStyle("bold"),
                      {
                        fontSize: 13,
                        color: colors.text.primary,
                        letterSpacing: -0.2,
                      },
                    ]}
                  >
                    {drill.durationMin}
                  </Text>
                  <Text
                    style={[
                      monoStyle("medium"),
                      {
                        fontSize: 10,
                        color: colors.text.muted,
                        letterSpacing: 0.4,
                      },
                    ]}
                  >
                    m
                  </Text>
                </View>
              ) : (
                <Text
                  style={[
                    monoStyle("medium"),
                    {
                      fontSize: 11,
                      color: colors.text.muted,
                      letterSpacing: 0.4,
                    },
                  ]}
                >
                  —
                </Text>
              )}
            </View>

            {/* REPS column */}
            <View
              style={{ width: COL_REPS_W, alignItems: "flex-end" }}
            >
              {drill.reps != null && drill.reps > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    gap: 2,
                  }}
                >
                  <Text
                    style={[
                      monoStyle("bold"),
                      {
                        fontSize: 13,
                        color: colors.text.primary,
                        letterSpacing: -0.2,
                      },
                    ]}
                  >
                    {drill.reps}
                  </Text>
                  <Text
                    style={[
                      monoStyle("medium"),
                      {
                        fontSize: 10,
                        color: colors.text.muted,
                        letterSpacing: 0.4,
                      },
                    ]}
                  >
                    ×
                  </Text>
                </View>
              ) : (
                <Text
                  style={[
                    monoStyle("medium"),
                    {
                      fontSize: 11,
                      color: colors.text.muted,
                      letterSpacing: 0.4,
                    },
                  ]}
                >
                  —
                </Text>
              )}
            </View>

            {/* Chevron */}
            <Ionicons
              name="chevron-forward"
              size={COL_CHEVRON_W}
              color={colors.text.muted}
            />
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function DrillListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { teamId, teamName, teamFormat } = useTeam();
  const { user } = useAuth();
  const userId = user?.id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [activeSkillGroup, setActiveSkillGroup] = useState<
    SkillGroup | typeof ALL
  >(ALL);
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("all");
  const [activeBenchmark, setActiveBenchmark] = useState<BenchmarkFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name_asc");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!teamId) return;
    const [categoryRowsRaw, drillsRes] = await Promise.all([
      loadDrillCategories(teamId),
      (async (): Promise<{ data: any[] | null; error: { message: string } | null }> => {
        let res: { data: any[] | null; error: { message: string } | null } =
          await supabase
            .from("team_drills")
            .select(
              "id, drill_name, status, benchmark_type, benchmark_types, default_reps, default_duration_min, created_by, created_at, team_drill_categories(category_id)"
            )
            .eq("team_id", teamId)
            .order("drill_name", { ascending: true });
        if (res.error && /benchmark_types/i.test(res.error.message)) {
          res = await supabase
            .from("team_drills")
            .select(
              "id, drill_name, status, benchmark_type, default_reps, default_duration_min, created_by, created_at, team_drill_categories(category_id)"
            )
            .eq("team_id", teamId)
            .order("drill_name", { ascending: true });
        }
        return res;
      })(),
    ]);

    if (drillsRes.error) {
      console.warn("[drills] load error:", drillsRes.error.message);
    }

    const categoryRows: Category[] = categoryRowsRaw.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type ?? inferCategoryType(c.name),
      color: colorForCategory(c.name),
    }));
    const byId = new Map(categoryRows.map((c) => [c.id, c]));

    // Skill taxonomy links for the visible drills — drives the skill-group
    // filter + row chips. One extra round-trip; the catalog is small.
    const visibleIds = (drillsRes.data ?? [])
      .filter((d) => d.status === "published" || d.created_by === userId)
      .map((d) => d.id as string);
    const skillsByDrill = await loadDrillSkills(visibleIds);

    const drillRows: Drill[] = (drillsRes.data ?? [])
      .filter((d) => {
        if (d.status === "published") return true;
        if (d.status === "draft") return d.created_by === userId;
        return false;
      })
      .map((d) => {
        const links =
          (d.team_drill_categories as { category_id: string }[] | null) ?? [];
        const ids = links.map((l) => l.category_id);
        const names = ids
          .map((id) => byId.get(id)?.name)
          .filter((n): n is string => !!n);
        const tagged = skillsByDrill[d.id as string] ?? [];
        const skillGroups: SkillGroup[] = SKILL_GROUP_META.filter((m) =>
          tagged.some((t) => t.skill_group === m.id)
        ).map((m) => m.id);
        return {
          id: d.id as string,
          name: d.drill_name as string,
          status: d.status as "draft" | "published",
          benchmarkTypes:
            (d.benchmark_types as BenchmarkKind[] | null) ??
            (d.benchmark_type
              ? [d.benchmark_type as BenchmarkKind]
              : []),
          categoryIds: ids,
          categoryNames: names,
          skillGroups,
          durationMin:
            typeof d.default_duration_min === "number"
              ? (d.default_duration_min as number)
              : null,
          reps:
            typeof d.default_reps === "number"
              ? (d.default_reps as number)
              : null,
          createdAt: (d.created_at as string) ?? "",
        };
      });

    setCategories(categoryRows);
    setDrills(drillRows);
  }, [teamId, userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const byId = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const phases = useMemo(
    () => categories.filter((c) => c.type === "phase"),
    [categories]
  );

  const publishedDrills = useMemo(
    () => drills.filter((d) => d.status === "published"),
    [drills]
  );
  const draftCount = drills.length - publishedDrills.length;

  const countsBySkillGroup = useMemo(() => {
    const map = {} as Record<SkillGroup, number>;
    for (const m of SKILL_GROUP_META) map[m.id] = 0;
    for (const d of publishedDrills) {
      for (const g of d.skillGroups) map[g] = (map[g] ?? 0) + 1;
    }
    return map;
  }, [publishedDrills]);

  const phaseCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of phases) map[p.name] = 0;
    for (const d of publishedDrills) {
      for (const id of d.categoryIds) {
        const cat = byId.get(id);
        if (cat?.type === "phase") map[cat.name] = (map[cat.name] ?? 0) + 1;
      }
    }
    return map;
  }, [publishedDrills, phases, byId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = drills.filter((d) => {
      const skillMatch =
        activeSkillGroup === ALL || d.skillGroups.includes(activeSkillGroup);
      const searchMatch = q.length === 0 || d.name.toLowerCase().includes(q);
      const statusMatch =
        activeStatus === "all" || d.status === activeStatus;
      const benchmarkMatch =
        activeBenchmark === "all"
          ? true
          : activeBenchmark === "none"
          ? d.benchmarkTypes.length === 0
          : d.benchmarkTypes.includes(activeBenchmark);
      return skillMatch && searchMatch && statusMatch && benchmarkMatch;
    });
    if (sortBy === "recent") {
      return [...matched].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return [...matched].sort((a, b) => a.name.localeCompare(b.name));
  }, [drills, activeSkillGroup, activeStatus, activeBenchmark, search, sortBy]);

  // Group the filtered drills by their primary phase (first phase-type
  // category linked on each drill). Section order is fixed: Warm Up first,
  // then Agilities, then every other phase in natural display_order, then
  // Conditioning at the bottom. Drills with no phase tag fall into an
  // "Unsorted" group below Conditioning.
  const sectionedDrills = useMemo(() => {
    type Section = {
      key: string;
      label: string;
      color: string;
      drills: Drill[];
    };
    const byPhaseId = new Map<string, Drill[]>();
    const unsorted: Drill[] = [];
    for (const d of filtered) {
      const phaseId = d.categoryIds.find(
        (id) => byId.get(id)?.type === "phase"
      );
      if (phaseId) {
        const list = byPhaseId.get(phaseId) ?? [];
        list.push(d);
        byPhaseId.set(phaseId, list);
      } else {
        unsorted.push(d);
      }
    }

    // Pinned positions: top-of-list (in order) and bottom-of-list (in order).
    const PINNED_TOP_KEYS: ReadonlyArray<string> = ["warmup", "agilities"];
    const PINNED_BOTTOM_KEYS: ReadonlyArray<string> = ["conditioning"];

    const phaseByNormalizedKey = (key: string) =>
      phases.find((p) => normalizeCategory(p.name) === key);

    const topPinned = PINNED_TOP_KEYS.map(phaseByNormalizedKey).filter(
      (p): p is Category => !!p
    );
    const bottomPinned = PINNED_BOTTOM_KEYS.map(phaseByNormalizedKey).filter(
      (p): p is Category => !!p
    );
    const pinnedIds = new Set(
      [...topPinned, ...bottomPinned].map((p) => p.id)
    );

    const pushPhase = (sections: Section[], p: Category) => {
      const list = byPhaseId.get(p.id) ?? [];
      if (list.length === 0) return;
      sections.push({ key: p.id, label: p.name, color: p.color, drills: list });
    };

    const sections: Section[] = [];

    // Top-pinned phases.
    for (const p of topPinned) pushPhase(sections, p);

    // Middle: remaining phases in natural display_order.
    for (const p of phases) {
      if (pinnedIds.has(p.id)) continue;
      pushPhase(sections, p);
    }

    // Bottom-pinned phases.
    for (const p of bottomPinned) pushPhase(sections, p);

    if (unsorted.length > 0) {
      sections.push({
        key: "unsorted",
        label: "Unsorted",
        color: colors.text.muted,
        drills: unsorted,
      });
    }

    return sections;
  }, [filtered, phases, byId]);

  const activeFilterCount =
    (activeSkillGroup !== ALL ? 1 : 0) +
    (activeStatus !== "all" ? 1 : 0) +
    (activeBenchmark !== "all" ? 1 : 0);

  const sortLabel = sortBy === "recent" ? "Recent" : "A–Z";

  const goToDrill = (id: string) => {
    router.push(`/drills/${id}` as never);
  };

  const goToNew = () => {
    router.push("/drills/new" as never);
  };

  const goToLibrary = () => {
    router.push("/drills/library" as never);
  };

  const headerPaddingTop = insets.top + spacing.md;
  const formatLabel = (teamFormat ?? "5V5").toUpperCase();
  const eyebrowLeft = teamName
    ? teamName.toUpperCase()
    : "PLAYBOOK";

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          paddingHorizontal: spacing.lg,
          paddingTop: headerPaddingTop,
        }}
      >
        <Eyebrow variant="brand">{eyebrowLeft} · {formatLabel}</Eyebrow>
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 22,
              letterSpacing: tracking.tight,
              color: colors.text.primary,
              marginTop: 2,
            },
          ]}
        >
          Drills
        </Text>
        <View style={{ marginTop: spacing["2xl"], gap: spacing.sm }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 60 + insets.bottom + spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.orange[500]}
          />
        }
      >
        {/* Top header */}
        <View
          style={{
            paddingTop: headerPaddingTop,
            paddingHorizontal: spacing.lg,
            paddingBottom: 2,
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <View style={{ gap: 2, flexShrink: 1 }}>
            <Eyebrow variant="brand">{eyebrowLeft} · {formatLabel}</Eyebrow>
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 22,
                  letterSpacing: tracking.tight,
                  color: colors.text.primary,
                },
              ]}
            >
              Drills
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <HeaderIconButton
              icon="search"
              variant="solid"
              onPress={() => {
                setSearchOpen((v) => !v);
                if (searchOpen) setSearch("");
              }}
              accessibilityLabel="Search drills"
            />
            <HeaderIconButton
              icon="albums-outline"
              variant="solid"
              onPress={goToLibrary}
              accessibilityLabel="Browse preset library"
            />
            <HeaderIconButton
              icon="add"
              variant="primary"
              onPress={goToNew}
              accessibilityLabel="Create drill"
            />
          </View>
        </View>

        {/* Search row (toggle) */}
        {searchOpen && (
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.surface.raised,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border.card,
                paddingHorizontal: spacing.md,
                minHeight: 40,
              }}
            >
              <Ionicons
                name="search"
                size={16}
                color={colors.text.muted}
                style={{ marginRight: spacing.sm }}
              />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search drills..."
                placeholderTextColor={colors.text.muted}
                style={[
                  fontStyle("medium"),
                  {
                    flex: 1,
                    fontSize: 14,
                    color: colors.text.primary,
                    paddingVertical: spacing.sm,
                  },
                ]}
                autoFocus
                returnKeyType="search"
                autoCorrect={false}
              />
              {search.length > 0 && (
                <Pressable
                  onPress={() => setSearch("")}
                  hitSlop={8}
                  accessibilityLabel="Clear search"
                >
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={colors.text.muted}
                  />
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* Scoreboard hero — canonical UFF accent card */}
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <Card variant="accent" accentColor="orange" pad={14}>
            {/* Yard-line backdrop */}
            <View
              style={{
                position: "absolute",
                top: 8,
                left: 16,
                right: 16,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
              pointerEvents="none"
            >
              {["10", "20", "30", "40", "50"].map((n) => (
                <Text
                  key={n}
                  style={[
                    monoStyle("bold"),
                    {
                      fontSize: 8,
                      color: colors.text.faint,
                      letterSpacing: 0.8,
                    },
                  ]}
                >
                  {n}
                </Text>
              ))}
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginTop: 8,
              }}
            >
              <View style={{ gap: 4 }}>
                <Text
                  style={[
                    fontStyle("bold"),
                    {
                      fontSize: 9.5,
                      letterSpacing: 1.4,
                      color: colors.text.secondary,
                      textTransform: "uppercase",
                    },
                  ]}
                >
                  Drills
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    gap: 4,
                  }}
                >
                  <Text
                    style={[
                      monoStyle("bold"),
                      {
                        fontSize: 38,
                        color: colors.text.primary,
                        letterSpacing: -0.76,
                        lineHeight: 40,
                      },
                    ]}
                  >
                    {publishedDrills.length}
                  </Text>
                  <Text
                    style={[
                      monoStyle("medium"),
                      {
                        fontSize: 14,
                        color: colors.text.secondary,
                        letterSpacing: -0.28,
                      },
                    ]}
                  >
                    published
                  </Text>
                </View>
                {draftCount > 0 && (
                  <View
                    style={{
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 4,
                      borderWidth: 1,
                      borderColor: colors.border.dashed,
                      borderStyle: "dashed",
                      alignSelf: "flex-start",
                    }}
                  >
                    <Text
                      style={[
                        fontStyle("bold"),
                        {
                          fontSize: 10,
                          letterSpacing: 0.8,
                          color: colors.text.secondary,
                          textTransform: "uppercase",
                        },
                      ]}
                    >
                      {draftCount} drafts
                    </Text>
                  </View>
                )}
              </View>

              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  alignItems: "flex-end",
                  flexWrap: "wrap",
                  gap: 14,
                  paddingLeft: spacing.md,
                }}
              >
                {phases
                  .filter((p) => (phaseCounts[p.name] ?? 0) > 0)
                  .map((p) => (
                    <SquadBar
                      key={p.id}
                      label={p.name.slice(0, 3).toUpperCase()}
                      count={phaseCounts[p.name] ?? 0}
                      color={p.color}
                    />
                  ))}
                {SKILL_GROUP_META.filter(
                  (m) => (countsBySkillGroup[m.id] ?? 0) > 0
                ).map((m) => (
                  <SquadBar
                    key={m.id}
                    label={m.label.slice(0, 3).toUpperCase()}
                    count={countsBySkillGroup[m.id] ?? 0}
                    color={m.color}
                  />
                ))}
              </View>
            </View>
          </Card>
        </View>


        {/* Filter / sort bar */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.md,
            gap: spacing.sm,
          }}
        >
          <FilterButton
            label="Filter"
            badge={activeFilterCount > 0 ? activeFilterCount : undefined}
            active={activeFilterCount > 0}
            onPress={() => setFilterOpen(true)}
          />
          <FilterButton
            label={`Sort: ${sortLabel}`}
            active={sortBy !== "name_asc"}
            onPress={() => setSortOpen(true)}
          />
        </View>

        {/* Tables — one per phase, plus an "Unsorted" group at the bottom for
            drills with no phase tag. Empty phases stay hidden. */}
        {sectionedDrills.length === 0 ? (
          <View
            style={{
              marginHorizontal: spacing.lg,
              padding: spacing["2xl"],
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.border.default,
              borderStyle: "dashed",
              alignItems: "center",
            }}
          >
            <Text
              style={[
                fontStyle("medium"),
                {
                  fontSize: 14,
                  color: colors.text.secondary,
                  textAlign: "center",
                },
              ]}
            >
              {drills.length === 0
                ? "No drills yet. Create your first drill to get started."
                : "No drills match your filters."}
            </Text>
          </View>
        ) : (
          sectionedDrills.map((section) => (
            <View key={section.key} style={{ marginBottom: spacing.lg }}>
              <PhaseSectionHeader
                label={section.label}
                color={section.color}
                count={section.drills.length}
              />
              <View style={{ marginHorizontal: spacing.lg }}>
                <Card variant="filled" pad={0} style={{ overflow: "hidden" }}>
                  <TableHeader />
                  {section.drills.map((d) => (
                    <DrillRow
                      key={d.id}
                      drill={d}
                      byId={byId}
                      onPress={() => goToDrill(d.id)}
                    />
                  ))}
                </Card>
              </View>
            </View>
          ))
        )}

        {/* Add row (footer) */}
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
          }}
        >
          <Pressable onPress={goToNew}>
            {({ pressed }) => (
              <View
                style={{
                  padding: 12,
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderColor: colors.orange.tintBorder,
                  borderStyle: "dashed",
                  borderRadius: radius.card,
                  backgroundColor: colors.orange.tint,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  opacity: pressed ? 0.85 : 1,
                }}
              >
                <Ionicons name="add" size={14} color={colors.orange[500]} />
                <Text
                  style={[
                    fontStyle("semibold"),
                    {
                      fontSize: 13,
                      color: colors.orange[500],
                    },
                  ]}
                >
                  Add a drill
                </Text>
                <View style={{ flex: 1 }} />
                <Text
                  style={[
                    monoStyle("medium"),
                    {
                      fontSize: 10,
                      color: colors.text.muted,
                      letterSpacing: 0.6,
                    },
                  ]}
                >
                  {drills.length} TOTAL
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </ScrollView>

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        activeSkillGroup={activeSkillGroup}
        setActiveSkillGroup={setActiveSkillGroup}
        activeStatus={activeStatus}
        setActiveStatus={setActiveStatus}
        activeBenchmark={activeBenchmark}
        setActiveBenchmark={setActiveBenchmark}
        onClear={() => {
          setActiveSkillGroup(ALL);
          setActiveStatus("all");
          setActiveBenchmark("all");
        }}
      />
      <SortSheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        sortBy={sortBy}
        setSortBy={setSortBy}
      />
    </View>
  );
}

function FilterButton({
  label,
  badge,
  active,
  onPress,
}: {
  label: string;
  badge?: number;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.xs,
            minHeight: 32,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: radius.pill,
            borderWidth: active ? 1.5 : 1,
            backgroundColor: active
              ? colors.orange.tint
              : colors.surface.raised,
            borderColor: active ? colors.orange[500] : colors.border.card,
            opacity: pressed ? 0.88 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          }}
        >
          <Text
            style={[
              fontStyle("medium"),
              {
                fontSize: 12,
                color: active ? colors.orange[400] : colors.text.primary,
              },
            ]}
          >
            {label}
            {badge !== undefined ? ` (${badge})` : ""}
          </Text>
          <Ionicons
            name="chevron-down"
            size={12}
            color={active ? colors.orange[400] : colors.text.secondary}
          />
        </View>
      )}
    </Pressable>
  );
}

function FilterSheet({
  open,
  onClose,
  activeSkillGroup,
  setActiveSkillGroup,
  activeStatus,
  setActiveStatus,
  activeBenchmark,
  setActiveBenchmark,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  activeSkillGroup: SkillGroup | typeof ALL;
  setActiveSkillGroup: (v: SkillGroup | typeof ALL) => void;
  activeStatus: StatusFilter;
  setActiveStatus: (v: StatusFilter) => void;
  activeBenchmark: BenchmarkFilter;
  setActiveBenchmark: (v: BenchmarkFilter) => void;
  onClear: () => void;
}) {
  return (
    <SheetContainer open={open} onClose={onClose}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={[
            fontStyle("bold"),
            { fontSize: 18, color: colors.text.primary },
          ]}
        >
          Filter
        </Text>
        <Pressable onPress={onClear} hitSlop={8}>
          <Text
            style={[
              fontStyle("medium"),
              { fontSize: 13, color: colors.orange[400] },
            ]}
          >
            Clear
          </Text>
        </Pressable>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SheetSectionLabel>Skill group</SheetSectionLabel>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
        >
          <PhaseChip
            label="All"
            selected={activeSkillGroup === ALL}
            onPress={() => setActiveSkillGroup(ALL)}
          />
          {SKILL_GROUP_META.map((m) => (
            <PhaseChip
              key={m.id}
              label={m.label}
              color={m.color}
              selected={activeSkillGroup === m.id}
              onPress={() => setActiveSkillGroup(m.id)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SheetSectionLabel>Status</SheetSectionLabel>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
        >
          <PhaseChip
            label="All"
            selected={activeStatus === "all"}
            onPress={() => setActiveStatus("all")}
          />
          <PhaseChip
            label="Published"
            color={colors.green[400]}
            selected={activeStatus === "published"}
            onPress={() => setActiveStatus("published")}
          />
          <PhaseChip
            label="Draft"
            color={colors.text.subtle}
            selected={activeStatus === "draft"}
            onPress={() => setActiveStatus("draft")}
          />
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SheetSectionLabel>Benchmark Type</SheetSectionLabel>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
        >
          <PhaseChip
            label="All"
            selected={activeBenchmark === "all"}
            onPress={() => setActiveBenchmark("all")}
          />
          <PhaseChip
            label="Timed"
            color={colors.orange[500]}
            selected={activeBenchmark === "timed"}
            onPress={() => setActiveBenchmark("timed")}
          />
          <PhaseChip
            label="Rated"
            color={colors.blue[400]}
            selected={activeBenchmark === "rated"}
            onPress={() => setActiveBenchmark("rated")}
          />
          <PhaseChip
            label="Reps Complete"
            color={colors.lime[400]}
            selected={activeBenchmark === "reps_complete"}
            onPress={() => setActiveBenchmark("reps_complete")}
          />
          <PhaseChip
            label="Percentage"
            color={colors.amber[400]}
            selected={activeBenchmark === "percentage"}
            onPress={() => setActiveBenchmark("percentage")}
          />
          <PhaseChip
            label="None"
            selected={activeBenchmark === "none"}
            onPress={() => setActiveBenchmark("none")}
          />
        </View>
      </View>

      <Button label="Done" onPress={onClose} />
    </SheetContainer>
  );
}

function SortSheet({
  open,
  onClose,
  sortBy,
  setSortBy,
}: {
  open: boolean;
  onClose: () => void;
  sortBy: SortOption;
  setSortBy: (v: SortOption) => void;
}) {
  const options: { value: SortOption; label: string }[] = [
    { value: "name_asc", label: "Name (A–Z)" },
    { value: "recent", label: "Recently added" },
  ];
  return (
    <SheetContainer open={open} onClose={onClose}>
      <Text
        style={[
          fontStyle("bold"),
          { fontSize: 18, color: colors.text.primary },
        ]}
      >
        Sort
      </Text>
      <View style={{ gap: spacing.xs }}>
        {options.map((o) => {
          const selected = sortBy === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                setSortBy(o.value);
                onClose();
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: pressed
                  ? colors.surface.pressed
                  : "transparent",
              })}
            >
              <Text
                style={[
                  fontStyle("medium"),
                  {
                    fontSize: 15,
                    color: selected ? colors.orange[400] : colors.text.primary,
                  },
                ]}
              >
                {o.label}
              </Text>
              {selected ? (
                <Ionicons
                  name="checkmark"
                  size={18}
                  color={colors.orange[400]}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </SheetContainer>
  );
}
