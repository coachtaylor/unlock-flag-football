import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { NumberedEyebrow } from "../../components/DrillForm";
import { Section } from "../../components/ui/FormSection";
import { colors, fontWeight, radius, spacing } from "../../constants/design";
import { fontStyle, monoStyle } from "../../constants/typography";
import {
  BENCHMARK_SCOPE_LABELS,
  BENCHMARK_TYPE_META,
  type BenchmarkConfig,
  type BenchmarkType,
} from "../../constants/benchmarks";
import {
  positionColor,
  positionTint,
} from "../../constants/positions";
import { initialsFromName, playerColorForIndex } from "../../lib/athlete";
import { supabase } from "../../lib/supabase";
import { useTeam } from "../../lib/team-context";
import {
  DEFAULT_SETS_PER_PLAYER,
  filterPlayersByGroup,
  groupsForScope,
  resolveConfig,
  type GroupName,
  type SessionPlayer,
  typesForGroup,
} from "../../lib/benchmark-session";

type Drill = {
  id: string;
  name: string;
  categoryName: string | null;
  config: BenchmarkConfig;
};

function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function SkeletonCard() {
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
        height: 72,
        borderRadius: radius.lg,
        backgroundColor: colors.surface.overlay,
        opacity,
      }}
    />
  );
}

function TypeChip({
  type,
  tone,
}: {
  type: BenchmarkType;
  tone: "orange" | "blue";
}) {
  const meta = BENCHMARK_TYPE_META[type];
  const accent = tone === "blue" ? colors.blue[400] : colors.orange[400];
  const bg = tone === "blue" ? colors.blue.tint : colors.orange.tint;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: bg,
      }}
    >
      <Ionicons name={meta.icon} size={11} color={accent} />
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 10.5,
            color: accent,
            letterSpacing: 0.4,
          },
        ]}
      >
        {meta.label}
      </Text>
    </View>
  );
}

function ScopeBadge({ scope }: { scope: BenchmarkConfig["scope"] }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: colors.surface.overlay,
        borderWidth: 1,
        borderColor: colors.border.card,
      }}
    >
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 10,
            color: colors.text.muted,
            letterSpacing: 1,
            textTransform: "uppercase",
          },
        ]}
      >
        {BENCHMARK_SCOPE_LABELS[scope]}
      </Text>
    </View>
  );
}

function PositionPill({ label, primary }: { label: string; primary?: boolean }) {
  const accent = positionColor(label);
  if (primary) {
    return (
      <View
        style={{
          paddingHorizontal: 7,
          paddingVertical: 2,
          borderRadius: 4,
          backgroundColor: positionTint(label),
        }}
      >
        <Text
          style={[
            fontStyle("bold"),
            { fontSize: 10, color: accent, letterSpacing: 0.4 },
          ]}
        >
          {label}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: accent,
      }}
    >
      <Text
        style={[
          fontStyle("bold"),
          { fontSize: 10, color: accent, letterSpacing: 0.4 },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: checked ? colors.orange[500] : colors.border.strong,
        backgroundColor: checked ? colors.orange[500] : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked ? (
        <Ionicons name="checkmark" size={14} color={colors.text.onBrand} />
      ) : null}
    </View>
  );
}

function Stepper({
  value,
  onChange,
  min = 1,
  max = 10,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  // One pill, three segments. Side buttons are neutral so the stepper
  // doesn't outshout the primary CTA at the bottom of the screen.
  const buttonStyle = {
    width: 36,
    height: 36,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.surface.base,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border.card,
        overflow: "hidden",
      }}
    >
      <TouchableOpacity
        onPress={() => {
          if (value <= min) return;
          lightHaptic();
          onChange(value - 1);
        }}
        hitSlop={6}
        accessibilityLabel="Decrement sets"
        activeOpacity={0.6}
        disabled={value <= min}
        style={{ ...buttonStyle, opacity: value <= min ? 0.35 : 1 }}
      >
        <Ionicons name="remove" size={18} color={colors.text.primary} />
      </TouchableOpacity>
      <View
        style={{
          minWidth: 36,
          paddingHorizontal: 6,
          alignItems: "center",
        }}
      >
        <Text
          style={[
            monoStyle("bold"),
            { fontSize: 16, color: colors.text.primary },
          ]}
        >
          {value}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => {
          if (value >= max) return;
          lightHaptic();
          onChange(value + 1);
        }}
        hitSlop={6}
        accessibilityLabel="Increment sets"
        activeOpacity={0.6}
        disabled={value >= max}
        style={{ ...buttonStyle, opacity: value >= max ? 0.35 : 1 }}
      >
        <Ionicons name="add" size={18} color={colors.orange[500]} />
      </TouchableOpacity>
    </View>
  );
}

export default function BenchmarksHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();
  const params = useLocalSearchParams<{ drill?: string }>();
  const preselectedDrillId = (params.drill as string | undefined) ?? null;

  const [loading, setLoading] = useState(true);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [allPlayers, setAllPlayers] = useState<SessionPlayer[]>([]);
  const [selectedDrillId, setSelectedDrillId] = useState<string | null>(null);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(
    new Set()
  );
  const [setsPerPlayer, setSetsPerPlayer] = useState<number>(
    DEFAULT_SETS_PER_PLAYER
  );

  useEffect(() => {
    let cancelled = false;
    if (!teamId) return;

    (async () => {
      setLoading(true);
      const [drillsRes, playersRes, categoriesRes] = await Promise.all([
        supabase
          .from("team_drills")
          .select(
            "id, drill_name, benchmark_type, benchmark_types, benchmark_config, benchmark_scope, category_id"
          )
          .eq("team_id", teamId)
          .eq("status", "published")
          .order("drill_name", { ascending: true }),
        (async (): Promise<{
          data: any[] | null;
          error: { message: string } | null;
        }> => {
          // Try with color_index (migration 45); fall back without it.
          const sel = (withColor: boolean) =>
            supabase
              .from("team_players")
              .select(
                `id, player_name, positions${withColor ? ", color_index" : ""}`
              )
              .eq("team_id", teamId)
              .eq("status", "active")
              .order("player_name", { ascending: true });
          let res = await sel(true);
          if (res.error && /color_index/i.test(res.error.message)) {
            res = await sel(false);
          }
          return res;
        })(),
        supabase
          .from("drill_categories")
          .select("id, category_name")
          .or(`team_id.is.null,team_id.eq.${teamId}`),
      ]);

      if (cancelled) return;

      const categoryNameById = new Map<string, string>();
      for (const c of categoriesRes.data ?? []) {
        categoryNameById.set(c.id as string, c.category_name as string);
      }

      const drillRows: Drill[] = [];
      for (const d of drillsRes.data ?? []) {
        const cfg = resolveConfig(
          (d as { benchmark_config?: unknown }).benchmark_config ?? null,
          ((d as { benchmark_type?: string }).benchmark_type ?? null) as
            | string
            | null,
          ((d as { benchmark_types?: string[] }).benchmark_types ?? null) as
            | string[]
            | null
        );
        if (!cfg) continue;
        drillRows.push({
          id: d.id as string,
          name: d.drill_name as string,
          config: cfg,
          categoryName:
            (d.category_id
              ? categoryNameById.get(d.category_id as string)
              : null) ?? null,
        });
      }

      const playerRows: SessionPlayer[] = (playersRes.data ?? []).map((p) => {
        const id = p.id as string;
        const name = p.player_name as string;
        return {
          id,
          name,
          positions: (p.positions as string[] | null) ?? [],
          initials: initialsFromName(name),
          // Resolve color from the player's stable slot (migration 45),
          // not from a hash. Same hue this player wears on every screen.
          color: playerColorForIndex(p.color_index as number | null),
        };
      });

      setDrills(drillRows);
      setAllPlayers(playerRows);

      if (
        preselectedDrillId &&
        drillRows.some((d) => d.id === preselectedDrillId)
      ) {
        setSelectedDrillId(preselectedDrillId);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, preselectedDrillId]);

  const selectedDrill = useMemo(
    () => drills.find((d) => d.id === selectedDrillId) ?? null,
    [drills, selectedDrillId]
  );

  const scopedPlayers = useMemo(() => {
    if (!selectedDrill) return allPlayers;
    const scope = selectedDrill.config.scope;
    if (scope === "whole") return allPlayers;
    if (scope === "qb") return filterPlayersByGroup(allPlayers, "qb");
    if (scope === "nonqb") return filterPlayersByGroup(allPlayers, "nonqb");
    return allPlayers;
  }, [selectedDrill, allPlayers]);

  useEffect(() => {
    if (!selectedDrill) return;
    setSelectedPlayerIds(new Set(scopedPlayers.map((p) => p.id)));
  }, [selectedDrill, scopedPlayers]);

  const allSelected =
    scopedPlayers.length > 0 &&
    selectedPlayerIds.size === scopedPlayers.length;

  const togglePlayer = useCallback((id: string) => {
    lightHaptic();
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedPlayerIds((prev) => {
      if (prev.size === scopedPlayers.length) return new Set();
      return new Set(scopedPlayers.map((p) => p.id));
    });
  }, [scopedPlayers]);

  const selectDrill = useCallback((id: string) => {
    lightHaptic();
    setSelectedDrillId(id);
  }, []);

  const start = () => {
    if (!selectedDrillId || selectedPlayerIds.size === 0) return;
    const ids = Array.from(selectedPlayerIds).join(",");
    router.push(
      `/benchmarks/log?drill=${selectedDrillId}&players=${ids}&sets=${setsPerPlayer}` as never
    );
  };

  const canStart =
    !!selectedDrillId && selectedPlayerIds.size > 0 && setsPerPlayer > 0;

  const groupPreview = useMemo(() => {
    if (!selectedDrill)
      return [] as {
        group: GroupName;
        types: BenchmarkType[];
        label: string;
        tone: "orange" | "blue";
      }[];
    const groups = groupsForScope(selectedDrill.config.scope);
    return groups.map((g) => ({
      group: g,
      types: typesForGroup(selectedDrill.config, g),
      label:
        g === "qb"
          ? "QBs"
          : g === "nonqb"
          ? "Receivers / Non-QBs"
          : "Whole team",
      tone: g === "qb" ? ("blue" as const) : ("orange" as const),
    }));
  }, [selectedDrill]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      {/* Header — matches DrillForm pattern */}
      <View
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.sm,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: spacing.md,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityLabel="Back"
            hitSlop={10}
            activeOpacity={0.85}
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.lg,
              backgroundColor: colors.surface.raised,
              borderWidth: 1,
              borderColor: colors.border.card,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="chevron-back"
              size={18}
              color={colors.text.primary}
            />
          </TouchableOpacity>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
            }}
          >
            <Text
              style={[
                monoStyle("medium"),
                { fontSize: 11, color: colors.text.secondary },
              ]}
            >
              {selectedDrillId ? "READY" : "SETUP"}
            </Text>
            <View
              style={{
                width: 1,
                height: 10,
                backgroundColor: colors.border.strong,
              }}
            />
            <Text
              style={[
                fontStyle("medium"),
                {
                  fontSize: 11,
                  color: colors.text.muted,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                },
              ]}
            >
              Benchmark
            </Text>
          </View>
        </View>

        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 11,
              color: colors.orange[500],
              letterSpacing: 1.5,
              marginBottom: spacing.xs,
            },
          ]}
        >
          NEW ASSESSMENT
        </Text>
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 26,
              lineHeight: 30,
              color: colors.text.primary,
              letterSpacing: -0.6,
            },
          ]}
        >
          Run an assessment.
        </Text>
        <Text
          style={[
            fontStyle("regular"),
            {
              fontSize: 13,
              lineHeight: 18,
              color: colors.text.secondary,
              marginTop: spacing.xs,
            },
          ]}
        >
          Pick a drill, dial sets, choose players, then start the clock.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing["3xl"] + 96 + insets.bottom,
          gap: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 01 · DRILL */}
        <Section>
          <NumberedEyebrow index="01" label="Drill" />
          <View style={{ marginTop: spacing.sm }}>
            {loading ? (
              <View style={{ gap: spacing.sm }}>
                {[0, 1, 2].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </View>
            ) : drills.length === 0 ? (
              <View
                style={{
                  padding: spacing.xl,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: colors.border.dashed,
                  alignItems: "center",
                  gap: spacing.lg,
                  marginTop: spacing.sm,
                }}
              >
                <Text
                  style={[
                    fontStyle("regular"),
                    {
                      fontSize: 13,
                      color: colors.text.secondary,
                      textAlign: "center",
                    },
                  ]}
                >
                  No benchmark drills yet. Flag a drill as benchmark in the
                  drill library.
                </Text>
                <Button
                  label="Go to Drills"
                  onPress={() => router.push("/drills" as never)}
                  fullWidth={false}
                />
              </View>
            ) : (
              drills.map((d, idx) => {
                const selected = d.id === selectedDrillId;
                const allTypes = (() => {
                  const groups = groupsForScope(d.config.scope);
                  const out = new Set<BenchmarkType>();
                  for (const g of groups) {
                    for (const t of typesForGroup(d.config, g)) out.add(t);
                  }
                  return Array.from(out);
                })();
                return (
                  <TouchableOpacity
                    key={d.id}
                    onPress={() => selectDrill(d.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    activeOpacity={0.7}
                    style={{
                      paddingVertical: spacing.md,
                      borderTopWidth: idx === 0 ? 0 : 1,
                      borderTopColor: colors.border.subtle,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.md,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: spacing.sm,
                        }}
                      >
                        <Text
                          style={[
                            fontStyle("bold"),
                            {
                              flex: 1,
                              fontSize: 15,
                              lineHeight: 20,
                              color: colors.text.primary,
                              letterSpacing: -0.2,
                            },
                          ]}
                          numberOfLines={2}
                        >
                          {d.name}
                        </Text>
                        <ScopeBadge scope={d.config.scope} />
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 4,
                        }}
                      >
                        {allTypes.map((t) => (
                          <TypeChip key={t} type={t} tone="orange" />
                        ))}
                      </View>
                    </View>
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={colors.orange[500]}
                      />
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.text.muted}
                      />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </Section>

        {/* 02 · WHAT GETS CAPTURED */}
        {selectedDrill ? (
          <Section>
            <NumberedEyebrow index="02" label="Metrics" />
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {groupPreview.map((g) => (
                <View
                  key={g.group}
                  style={{
                    padding: spacing.md,
                    borderRadius: radius.lg,
                    backgroundColor:
                      g.tone === "blue"
                        ? "rgba(110, 168, 255, 0.04)"
                        : colors.surface.overlay,
                    borderWidth: 1,
                    borderColor:
                      g.tone === "blue"
                        ? colors.blue.tintBorder
                        : colors.border.card,
                    gap: spacing.sm,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor:
                          g.tone === "blue"
                            ? colors.blue[400]
                            : colors.orange[500],
                      }}
                    />
                    <Text
                      style={[
                        fontStyle("bold"),
                        {
                          fontSize: 11,
                          letterSpacing: 1.2,
                          textTransform: "uppercase",
                          color:
                            g.tone === "blue"
                              ? colors.blue[400]
                              : colors.orange[500],
                        },
                      ]}
                    >
                      {g.label}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    {g.types.length === 0 ? (
                      <Text
                        style={[
                          fontStyle("regular"),
                          {
                            fontSize: 12,
                            color: colors.text.muted,
                            fontStyle: "italic",
                          },
                        ]}
                      >
                        No types configured
                      </Text>
                    ) : (
                      g.types.map((t) => (
                        <TypeChip key={t} type={t} tone={g.tone} />
                      ))
                    )}
                  </View>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {/* 03 · SETS PER PLAYER */}
        {selectedDrill ? (
          <Section>
            <NumberedEyebrow index="03" label="Sets" />
            <View
              style={{
                marginTop: spacing.md,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing.md,
              }}
            >
              <Text
                style={[
                  fontStyle("medium"),
                  { flex: 1, fontSize: 13, color: colors.text.secondary },
                ]}
              >
                Same across all metrics
              </Text>
              <Stepper value={setsPerPlayer} onChange={setSetsPerPlayer} />
            </View>
          </Section>
        ) : null}

        {/* 04 · PICK PLAYERS */}
        {selectedDrill ? (
          <Section>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <NumberedEyebrow
                index="04"
                label={`Players · ${selectedPlayerIds.size}/${scopedPlayers.length}`}
              />
              {scopedPlayers.length > 0 ? (
                <TouchableOpacity
                  onPress={toggleAll}
                  hitSlop={8}
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      fontStyle("bold"),
                      {
                        fontSize: 12,
                        color: colors.orange[400],
                      },
                    ]}
                  >
                    {allSelected ? "Clear all" : "Select all"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={{ marginTop: spacing.sm }}>
              {scopedPlayers.length === 0 ? (
                <View
                  style={{
                    padding: spacing.xl,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: colors.border.dashed,
                    alignItems: "center",
                    gap: spacing.lg,
                    marginTop: spacing.sm,
                  }}
                >
                  <Text
                    style={[
                      fontStyle("regular"),
                      {
                        fontSize: 13,
                        color: colors.text.secondary,
                        textAlign: "center",
                      },
                    ]}
                  >
                    {selectedDrill.config.scope === "qb"
                      ? "No QBs on the active roster."
                      : selectedDrill.config.scope === "nonqb"
                      ? "No non-QBs on the active roster."
                      : "No active players on the roster."}
                  </Text>
                  <Button
                    label="Add Player"
                    onPress={() => router.push("/roster/new" as never)}
                    fullWidth={false}
                  />
                </View>
              ) : (
                scopedPlayers.map((p, idx) => {
                  const selected = selectedPlayerIds.has(p.id);
                  // Per-player identity color from the player's stable
                  // color slot. Same hue across every screen in the app.
                  // `p` here is a SessionPlayer with `.color` already
                  // resolved upstream, so use that directly.
                  const accent = p.color;
                  const initials = initialsFromName(p.name);
                  const primary = p.positions[0] ?? null;
                  const secondaries = p.positions.slice(1, 3);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => togglePlayer(p.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: spacing.md,
                        gap: spacing.md,
                        borderTopWidth: idx === 0 ? 0 : 1,
                        borderTopColor: colors.border.subtle,
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: accent,
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Text
                          style={[
                            monoStyle("bold"),
                            {
                              fontSize: 13,
                              color: colors.surface.base,
                              letterSpacing: -0.3,
                              fontWeight: fontWeight.bold,
                            },
                          ]}
                        >
                          {initials}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                        <Text
                          numberOfLines={1}
                          style={[
                            fontStyle("bold"),
                            {
                              fontSize: 15,
                              color: colors.text.primary,
                              letterSpacing: -0.2,
                            },
                          ]}
                        >
                          {p.name}
                        </Text>
                        {primary || secondaries.length > 0 ? (
                          <View
                            style={{
                              flexDirection: "row",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            {primary ? (
                              <PositionPill label={primary} primary />
                            ) : null}
                            {secondaries.map((pos) => (
                              <PositionPill key={pos} label={pos} />
                            ))}
                          </View>
                        ) : null}
                      </View>
                      <Checkbox checked={selected} />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </Section>
        ) : null}
      </ScrollView>

      {/* Sticky start button */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.lg,
          backgroundColor: colors.surface.base,
          borderTopWidth: 1,
          borderTopColor: colors.border.subtle,
        }}
      >
        <Button
          label={
            !selectedDrillId
              ? "Pick a drill"
              : selectedPlayerIds.size === 0
              ? "Pick players"
              : `Start · ${selectedPlayerIds.size} ${
                  selectedPlayerIds.size === 1 ? "player" : "players"
                } × ${setsPerPlayer} ${setsPerPlayer === 1 ? "set" : "sets"}`
          }
          onPress={start}
          disabled={!canStart}
        />
      </View>
    </View>
  );
}
