import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { colors, radius, spacing } from "../../constants/design";
import { supabase } from "../../lib/supabase";
import { useTeam } from "../../lib/team-context";

type Drill = {
  id: string;
  name: string;
  benchmarkType: "timed" | "rated";
  categoryName: string | null;
};

type Player = {
  id: string;
  name: string;
  positions: string[];
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
        height: 64,
        borderRadius: radius.lg,
        backgroundColor: colors.surface.raised,
        opacity,
      }}
    />
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        lineHeight: 14,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        color: colors.text.secondary,
        fontWeight: "500",
      }}
    >
      {children}
    </Text>
  );
}

function BenchmarkBadge({ type }: { type: "timed" | "rated" }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: colors.orange[600],
        borderWidth: 1,
        borderColor: colors.orange[500],
      }}
    >
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.orange[400],
          fontWeight: "500",
        }}
      >
        {type}
      </Text>
    </View>
  );
}

function PositionPill({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: colors.surface.muted,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.text.subtle,
        }}
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
        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
      ) : null}
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
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedDrillId, setSelectedDrillId] = useState<string | null>(null);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    let cancelled = false;
    if (!teamId) return;

    (async () => {
      setLoading(true);
      const [drillsRes, playersRes, categoriesRes] = await Promise.all([
        supabase
          .from("team_drills")
          .select("id, drill_name, benchmark_type, category_id")
          .eq("team_id", teamId)
          .eq("status", "published")
          .not("benchmark_type", "is", null)
          .order("drill_name", { ascending: true }),
        supabase
          .from("team_players")
          .select("id, player_name, positions")
          .eq("team_id", teamId)
          .eq("status", "active")
          .order("player_name", { ascending: true }),
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

      const drillRows: Drill[] = (drillsRes.data ?? []).map((d) => ({
        id: d.id as string,
        name: d.drill_name as string,
        benchmarkType: d.benchmark_type as "timed" | "rated",
        categoryName:
          (d.category_id ? categoryNameById.get(d.category_id as string) : null) ??
          null,
      }));

      const playerRows: Player[] = (playersRes.data ?? []).map((p) => ({
        id: p.id as string,
        name: p.player_name as string,
        positions: (p.positions as string[] | null) ?? [],
      }));

      setDrills(drillRows);
      setPlayers(playerRows);

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

  const allSelected =
    players.length > 0 && selectedPlayerIds.size === players.length;

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
      if (prev.size === players.length) return new Set();
      return new Set(players.map((p) => p.id));
    });
  }, [players]);

  const selectDrill = useCallback((id: string) => {
    lightHaptic();
    setSelectedDrillId(id);
  }, []);

  const start = () => {
    if (!selectedDrillId || selectedPlayerIds.size === 0) return;
    const ids = Array.from(selectedPlayerIds).join(",");
    router.push(
      `/benchmarks/log?drill=${selectedDrillId}&players=${ids}` as never
    );
  };

  const canStart = !!selectedDrillId && selectedPlayerIds.size > 0;

  const headerPaddingTop = insets.top + spacing.lg;

  const sortedPlayers = useMemo(() => players, [players]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      {/* Header */}
      <View
        className="flex-row items-center"
        style={{
          paddingTop: headerPaddingTop,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          gap: spacing.md,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back"
          hitSlop={10}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: pressed
              ? colors.surface.pressed
              : colors.surface.muted,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={colors.text.secondary}
          />
        </Pressable>
        <Text
          style={{
            fontSize: 20,
            lineHeight: 28,
            fontWeight: "500",
            color: colors.text.primary,
          }}
        >
          Run Assessment
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing["3xl"] + 96,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step 1: Drills */}
        <SectionLabel>1. Pick a drill</SectionLabel>

        {loading ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </View>
        ) : drills.length === 0 ? (
          <View
            style={{
              marginTop: spacing.md,
              padding: spacing["2xl"],
              borderRadius: radius.lg,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: colors.border.default,
              alignItems: "center",
              gap: spacing.lg,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                lineHeight: 18,
                color: colors.text.secondary,
                textAlign: "center",
              }}
            >
              No benchmark drills yet. Flag a drill as timed or rated from the
              drill library.
            </Text>
            <Button
              label="Go to Drills"
              onPress={() => router.push("/drills" as never)}
              fullWidth={false}
            />
          </View>
        ) : (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {drills.map((d) => {
              const selected = d.id === selectedDrillId;
              return (
                <Pressable
                  key={d.id}
                  onPress={() => selectDrill(d.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className="flex-row items-center"
                  style={({ pressed }) => ({
                    backgroundColor: selected
                      ? colors.orange.tint
                      : colors.surface.raised,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: selected
                      ? colors.orange[500]
                      : colors.border.card,
                    borderLeftWidth: selected ? 4 : 1,
                    borderLeftColor: selected
                      ? colors.orange[500]
                      : colors.border.card,
                    padding: spacing.lg,
                    minHeight: 44,
                    gap: spacing.md,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View
                      className="flex-row items-start"
                      style={{ gap: spacing.sm }}
                    >
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 15,
                          lineHeight: 22,
                          fontWeight: "500",
                          color: selected
                            ? colors.orange[400]
                            : colors.text.primary,
                        }}
                        numberOfLines={2}
                      >
                        {d.name}
                      </Text>
                      <BenchmarkBadge type={d.benchmarkType} />
                    </View>
                    {d.categoryName ? (
                      <Text
                        style={{
                          fontSize: 13,
                          color: colors.text.secondary,
                          marginTop: spacing.xs,
                        }}
                      >
                        {d.categoryName}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name={
                      selected
                        ? "checkmark-circle"
                        : "chevron-forward"
                    }
                    size={selected ? 20 : 16}
                    color={
                      selected ? colors.orange[500] : colors.text.muted
                    }
                  />
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Step 2: Players (only after drill selected) */}
        {selectedDrillId ? (
          <View style={{ marginTop: spacing["3xl"] }}>
            <View
              className="flex-row items-center justify-between"
              style={{ marginBottom: spacing.md }}
            >
              <SectionLabel>
                {`2. Pick players (${selectedPlayerIds.size} of ${players.length})`}
              </SectionLabel>
              {players.length > 0 ? (
                <Pressable
                  onPress={toggleAll}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "500",
                      color: colors.orange[400],
                    }}
                  >
                    {allSelected ? "Clear all" : "Select all"}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {players.length === 0 ? (
              <View
                style={{
                  padding: spacing["2xl"],
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: colors.border.default,
                  alignItems: "center",
                  gap: spacing.lg,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    lineHeight: 18,
                    color: colors.text.secondary,
                    textAlign: "center",
                  }}
                >
                  No active players on the roster.
                </Text>
                <Button
                  label="Add Player"
                  onPress={() => router.push("/roster/new" as never)}
                  fullWidth={false}
                />
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {sortedPlayers.map((p) => {
                  const selected = selectedPlayerIds.has(p.id);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => togglePlayer(p.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      className="flex-row items-center"
                      style={({ pressed }) => ({
                        backgroundColor: selected
                          ? colors.orange.tint
                          : colors.surface.raised,
                        borderRadius: radius.lg,
                        borderWidth: 1,
                        borderColor: selected
                          ? colors.orange[500]
                          : colors.border.card,
                        padding: spacing.lg,
                        minHeight: 44,
                        gap: spacing.md,
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Checkbox checked={selected} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            fontSize: 15,
                            lineHeight: 22,
                            fontWeight: "500",
                            color: selected
                              ? colors.orange[400]
                              : colors.text.primary,
                          }}
                          numberOfLines={1}
                        >
                          {p.name}
                        </Text>
                        {p.positions.length > 0 ? (
                          <View
                            className="flex-row flex-wrap items-center"
                            style={{
                              gap: spacing.xs,
                              marginTop: spacing.xs,
                            }}
                          >
                            {p.positions.map((pos) => (
                              <PositionPill key={pos} label={pos} />
                            ))}
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
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
              : `Start Assessment · ${selectedPlayerIds.size} ${
                  selectedPlayerIds.size === 1 ? "player" : "players"
                }`
          }
          onPress={start}
          disabled={!canStart}
        />
      </View>
    </View>
  );
}
