import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  Easing,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PlayerCard, type PlayerCardData } from "../../../components/ui/PlayerCard";
import { colors, fontWeight, radius, tracking } from "../../../constants/design";
import { POSITION_SIDE } from "../../../constants/positions";
import { fontStyle, MonoText } from "../../../constants/typography";
import { supabase } from "../../../lib/supabase";
import { useTeam } from "../../../lib/team-context";
import { CoachingStaffSection } from "../../../components/teams/CoachingStaffSection";

type RawPlayer = {
  id: string;
  player_name: string;
  positions: string[] | null;
  jersey_number: string | null;
  status: "active" | "inactive";
  is_captain: boolean;
  // Optional — migration 43 may not be applied yet.
  is_injured?: boolean | null;
  // Optional — migration 45 may not be applied yet.
  color_index?: number | null;
};

type RawBenchmark = {
  player_id: string;
  time_seconds: number | null;
  rating: number | null;
  created_at: string;
  team_drills:
    | { drill_name: string; benchmark_type: string | null }
    | { drill_name: string; benchmark_type: string | null }[]
    | null;
};

type Filter = "all" | "offense" | "defense" | "bench" | "prs";

const ROSTER_CAP = 15;

function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function pickRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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
        height: 78,
        borderRadius: 16,
        backgroundColor: colors.surface.raised,
        opacity,
      }}
    />
  );
}

export default function RosterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { teamId, teamName, canManage } = useTeam();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [players, setPlayers] = useState<PlayerCardData[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    if (!teamId) return;

    // Try the richer projection first; degrade if is_injured (migration 43)
    // or color_index (migration 45) isn't deployed yet so the screen still
    // renders. Each newer column gets its own fallback rung.
    const playersSelect = (withInjured: boolean, withColorIndex: boolean) =>
      supabase
        .from("team_players")
        .select(
          `id, player_name, positions, jersey_number, status, is_captain${
            withInjured ? ", is_injured" : ""
          }${withColorIndex ? ", color_index" : ""}`
        )
        .eq("team_id", teamId)
        .order("player_name", { ascending: true });
    const [playersResRaw, timedRes, ratedRes] = await Promise.all([
      (async () => {
        let res = await playersSelect(true, true);
        if (res.error && /color_index/i.test(res.error.message)) {
          res = await playersSelect(true, false);
        }
        if (res.error && /is_injured/i.test(res.error.message)) {
          res = await playersSelect(false, false);
        }
        return res;
      })(),
      supabase
        .from("benchmark_results")
        .select(
          "player_id, time_seconds, created_at, team_drills!inner(drill_name, benchmark_type)"
        )
        .eq("team_id", teamId)
        .eq("team_drills.benchmark_type", "timed")
        .not("time_seconds", "is", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("benchmark_results")
        .select(
          "player_id, rating, created_at, team_drills!inner(drill_name, benchmark_type)"
        )
        .eq("team_id", teamId)
        .eq("team_drills.benchmark_type", "rated")
        .not("rating", "is", null)
        .order("created_at", { ascending: false }),
    ]);

    const playersRes = playersResRaw;
    if (playersRes.error)
      console.warn("[roster] players:", playersRes.error.message);
    if (timedRes.error)
      console.warn("[roster] timed benchmarks:", timedRes.error.message);
    if (ratedRes.error)
      console.warn("[roster] rated benchmarks:", ratedRes.error.message);

    // Reduce to most recent timed / rated per player.
    const latestTimed = new Map<
      string,
      { seconds: number; drill: string }
    >();
    ((timedRes.data ?? []) as RawBenchmark[]).forEach((row) => {
      if (latestTimed.has(row.player_id)) return; // ordered desc, first wins
      const drill = pickRelation(row.team_drills);
      if (row.time_seconds === null) return;
      latestTimed.set(row.player_id, {
        seconds: Number(row.time_seconds),
        drill: drill?.drill_name ?? "Timed drill",
      });
    });

    const latestRated = new Map<
      string,
      { rating: number; drill: string }
    >();
    ((ratedRes.data ?? []) as RawBenchmark[]).forEach((row) => {
      if (latestRated.has(row.player_id)) return;
      const drill = pickRelation(row.team_drills);
      if (row.rating === null) return;
      latestRated.set(row.player_id, {
        rating: row.rating,
        drill: drill?.drill_name ?? "Rated drill",
      });
    });

    const rows = ((playersRes.data ?? []) as unknown as RawPlayer[])
      // Roster excludes captain-only auto-inserted rows from the bold dashboard's
      // milestone count, but the roster list shows everyone. Keep all rows here.
      .map<PlayerCardData>((p) => {
        const t = latestTimed.get(p.id);
        const r = latestRated.get(p.id);
        return {
          id: p.id,
          name: p.player_name,
          jerseyNumber: p.jersey_number,
          positions: p.positions ?? [],
          status: p.status,
          colorIndex: p.color_index ?? null,
          injured: p.is_injured === true,
          isCaptain: p.is_captain === true,
          timedSeconds: t ? t.seconds : null,
          timedDrill: t ? t.drill : null,
          rating: r ? r.rating : null,
          ratedDrill: r ? r.drill : null,
          // Streak + PR remain inert until per-player attendance + history pass
          // are wired up (see plan: Phase 5 known gaps).
          pr: false,
          streak: 0,
        };
      });

    setPlayers(rows);
  }, [teamId]);

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

  const goToPlayer = (id: string) => {
    lightHaptic();
    router.push(`/roster/${id}` as never);
  };

  const goToNew = () => {
    lightHaptic();
    router.push("/roster/new" as never);
  };

  // Group + filter
  const { offense, defense, bench, active, avgTimed, prCount } = useMemo(() => {
    const off: PlayerCardData[] = [];
    const def: PlayerCardData[] = [];
    const bn: PlayerCardData[] = [];
    let prs = 0;
    const timedValues: number[] = [];
    players.forEach((p) => {
      if (p.status === "inactive") {
        bn.push(p);
        return;
      }
      const primary = p.positions[0];
      const side = primary ? POSITION_SIDE[primary] : null;
      if (side === "defense") def.push(p);
      else off.push(p); // unset side falls back to offense bucket
      if (p.pr) prs += 1;
      if (p.timedSeconds !== null) timedValues.push(p.timedSeconds);
    });
    // QBs pin to the top of the offense bucket — they run the offense, so
    // a coach scanning the list should see them first. Stable sort keeps
    // existing alphabetical order intact otherwise (the upstream query
    // already orders by player_name).
    off.sort((a, b) => {
      const aQb = a.positions[0] === "QB" ? 0 : 1;
      const bQb = b.positions[0] === "QB" ? 0 : 1;
      return aQb - bQb;
    });
    const avg =
      timedValues.length > 0
        ? timedValues.reduce((s, v) => s + v, 0) / timedValues.length
        : null;
    return {
      offense: off,
      defense: def,
      bench: bn,
      active: off.length + def.length,
      avgTimed: avg,
      prCount: prs,
    };
  }, [players]);

  // Active players render as ONE unified list — not split into offense /
  // defense sections (the position-side buckets above are kept only to power
  // the filter chips + counts). Order mirrors the web roster: captains first,
  // then jersey number ascending (un-numbered last), name as the tiebreak.
  const visibleMain = useMemo(() => {
    const pool =
      filter === "offense"
        ? offense
        : filter === "defense"
        ? defense
        : filter === "prs"
        ? [...offense, ...defense].filter((p) => p.pr)
        : filter === "bench"
        ? []
        : [...offense, ...defense]; // "all"
    const jn = (raw: string | null): number | null => {
      const n = parseInt(String(raw ?? "").trim(), 10);
      return Number.isFinite(n) ? n : null;
    };
    return [...pool].sort((a, b) => {
      const ac = a.isCaptain ? 0 : 1;
      const bc = b.isCaptain ? 0 : 1;
      if (ac !== bc) return ac - bc;
      const an = jn(a.jerseyNumber);
      const bn = jn(b.jerseyNumber);
      if (an !== bn) {
        if (an == null) return 1;
        if (bn == null) return -1;
        return an - bn;
      }
      return a.name.localeCompare(b.name);
    });
  }, [filter, offense, defense]);

  const visibleBench =
    filter === "all" || filter === "bench"
      ? bench
      : filter === "prs"
      ? bench.filter((p) => p.pr)
      : [];

  const openSlots = Math.max(0, ROSTER_CAP - active);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          paddingHorizontal: 16,
          paddingTop: insets.top + 18,
        }}
      >
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 24,
              fontWeight: fontWeight.bold,
              color: colors.text.primary,
              letterSpacing: -0.4,
            },
          ]}
        >
          Roster
        </Text>
        <View style={{ marginTop: 24, gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      contentContainerStyle={{
        paddingTop: insets.top + 14,
        paddingBottom: insets.bottom + 80,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.orange[500]}
        />
      }
    >
      {/* Top header row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 18,
          paddingBottom: 2,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text
            numberOfLines={1}
            style={[
              fontStyle("bold"),
              {
                fontSize: 11,
                fontWeight: fontWeight.bold,
                color: colors.orange[500],
                letterSpacing: tracking.loose,
                textTransform: "uppercase",
              },
            ]}
          >
            {teamName ?? "Your team"}
          </Text>
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 24,
                fontWeight: fontWeight.bold,
                color: colors.text.primary,
                letterSpacing: -0.4,
              },
            ]}
          >
            Roster
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            accessibilityLabel="Search"
            activeOpacity={0.85}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: colors.surface.raised,
              borderWidth: 1,
              borderColor: colors.border.default,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="search" size={16} color={colors.text.primary} />
          </TouchableOpacity>
          {canManage && (
            <TouchableOpacity
              onPress={goToNew}
              accessibilityLabel="Add player"
              activeOpacity={0.85}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                backgroundColor: colors.orange[500],
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="add" size={18} color={colors.text.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Coaching staff — taps through to coach profiles. Self-hides when
          the team has no staff yet. */}
      {teamId ? <CoachingStaffSection teamId={teamId} /> : null}

      {/* Squad summary strip */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View
          style={{
            padding: 14,
            backgroundColor: colors.surface.raised,
            borderWidth: 1,
            borderColor: colors.border.subtle,
            borderRadius: radius.xl,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1.4, gap: 2 }}>
            <View
              style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}
            >
              <MonoText
                weight="bold"
                style={{
                  fontSize: 24,
                  fontWeight: fontWeight.bold,
                  color: colors.text.primary,
                  letterSpacing: -0.5,
                  lineHeight: 26,
                }}
              >
                {active}
              </MonoText>
              <MonoText
                weight="medium"
                style={{ fontSize: 12, color: colors.text.secondary }}
              >
                /{ROSTER_CAP}
              </MonoText>
            </View>
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 9.5,
                  fontWeight: fontWeight.bold,
                  color: colors.text.muted,
                  letterSpacing: tracking.loose,
                  textTransform: "uppercase",
                },
              ]}
            >
              Active
            </Text>
          </View>
          <SummaryCell
            big={offense.length}
            label="OFF"
            color={colors.orange[500]}
          />
          <SummaryCell
            big={defense.length}
            label="DEF"
            color={colors.red.semantic}
          />
          <SummaryCell
            big={avgTimed !== null ? avgTimed.toFixed(1) : "—"}
            unit={avgTimed !== null ? "s" : undefined}
            label="AVG"
            color={avgTimed !== null ? colors.lime[400] : colors.text.muted}
          />
        </View>
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 4,
          gap: 6,
        }}
      >
        <FilterPill
          label="All"
          count={active + bench.length}
          active={filter === "all"}
          onPress={() => setFilter("all")}
        />
        <FilterPill
          label="Offense"
          count={offense.length}
          active={filter === "offense"}
          color={colors.orange[500]}
          onPress={() => setFilter("offense")}
        />
        <FilterPill
          label="Defense"
          count={defense.length}
          active={filter === "defense"}
          color={colors.red.semantic}
          onPress={() => setFilter("defense")}
        />
        <FilterPill
          label="Bench"
          count={bench.length}
          active={filter === "bench"}
          onPress={() => setFilter("bench")}
        />
        <FilterPill
          label="PRs"
          count={prCount}
          active={filter === "prs"}
          icon="flash"
          onPress={() => setFilter("prs")}
        />
      </ScrollView>

      {/* Empty state — no players at all */}
      {players.length === 0 ? (
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 40,
            alignItems: "center",
            gap: 16,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.surface.raised,
              borderWidth: 1,
              borderColor: colors.border.subtle,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="people-outline" size={28} color={colors.text.muted} />
          </View>
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 14,
                color: colors.text.secondary,
                textAlign: "center",
                maxWidth: 260,
                lineHeight: 20,
              },
            ]}
          >
            No players yet. Add your first player to start building the squad.
          </Text>
          {canManage && (
            <TouchableOpacity
              onPress={goToNew}
              activeOpacity={0.9}
              style={{
                paddingHorizontal: 18,
                height: 44,
                borderRadius: 12,
                backgroundColor: colors.orange[500],
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ionicons name="add" size={16} color={colors.text.primary} />
              <Text
                style={[
                  fontStyle("bold"),
                  {
                    fontSize: 14,
                    fontWeight: fontWeight.bold,
                    color: colors.text.primary,
                    letterSpacing: 0.2,
                  },
                ]}
              >
                Add player
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          {/* Players eyebrow — sits below the filters, labeling the list and
              marking where players begin (vs the coaching staff above). */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 11,
                  fontWeight: fontWeight.bold,
                  color: colors.text.secondary,
                  letterSpacing: tracking.loose,
                  textTransform: "uppercase",
                },
              ]}
            >
              Players
            </Text>
            <MonoText weight="medium" style={{ fontSize: 11, color: colors.text.muted }}>
              {players.length}
            </MonoText>
          </View>

          {/* One unified player list (no position split). */}
          {visibleMain.length > 0 ? (
            <View style={{ paddingHorizontal: 16, gap: 10, paddingTop: 10 }}>
              {visibleMain.map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  onPress={() => goToPlayer(p.id)}
                />
              ))}
            </View>
          ) : null}

          {visibleBench.length > 0 ? (
            <>
              {filter === "all" || filter === "bench" ? (
                <GroupHeader
                  label="BENCH"
                  count={visibleBench.length}
                  color={colors.text.muted}
                />
              ) : null}
              <View style={{ paddingHorizontal: 16, gap: 10 }}>
                {visibleBench.map((p) => (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    onPress={() => goToPlayer(p.id)}
                    dim
                  />
                ))}
              </View>
            </>
          ) : null}

          {/* Ghost add row */}
          {canManage && (
          <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <TouchableOpacity
              onPress={goToNew}
              activeOpacity={0.85}
              accessibilityLabel="Add player"
              style={{
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: colors.orange.tintBorder,
                backgroundColor: "rgba(255,106,26,0.04)",
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.orange.tint,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="add" size={16} color={colors.orange[500]} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={[
                    fontStyle("semibold"),
                    {
                      fontSize: 13,
                      fontWeight: fontWeight.semibold,
                      color: colors.text.primary,
                    },
                  ]}
                >
                  Add player
                </Text>
                <Text
                  style={[
                    fontStyle("regular"),
                    { fontSize: 11, color: colors.text.muted },
                  ]}
                >
                  {openSlots > 0
                    ? `${openSlots} open slot${openSlots === 1 ? "" : "s"} · roster cap ${ROSTER_CAP}`
                    : `Roster full at ${ROSTER_CAP}`}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={colors.text.muted}
              />
            </TouchableOpacity>
          </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ──────────────────────────────────────────────────────────────────────

function SummaryCell({
  big,
  unit,
  label,
  color,
}: {
  big: number | string;
  unit?: string;
  label: string;
  color: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: "flex-start", gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
        <MonoText
          weight="bold"
          style={{
            fontSize: 22,
            fontWeight: fontWeight.bold,
            color,
            letterSpacing: -0.5,
            lineHeight: 24,
          }}
        >
          {big}
        </MonoText>
        {unit ? (
          <MonoText
            weight="medium"
            style={{ fontSize: 11, color: colors.text.secondary }}
          >
            {unit}
          </MonoText>
        ) : null}
      </View>
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 9.5,
            fontWeight: fontWeight.bold,
            color: colors.text.muted,
            letterSpacing: tracking.loose,
            textTransform: "uppercase",
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function FilterPill({
  label,
  count,
  active,
  color,
  icon,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  color?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const textColor = active
    ? colors.surface.base
    : color ?? colors.text.primary;
  return (
    <TouchableOpacity
      onPress={() => {
        lightHaptic();
        onPress();
      }}
      activeOpacity={0.85}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: active ? colors.text.primary : colors.surface.raised,
        borderWidth: active ? 0 : 1,
        borderColor: colors.border.default,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={11}
          color={active ? colors.surface.base : colors.lime[400]}
        />
      ) : null}
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 12,
            fontWeight: fontWeight.bold,
            color: textColor,
            letterSpacing: 0.1,
          },
        ]}
      >
        {label}
      </Text>
      <MonoText
        weight="medium"
        style={{
          fontSize: 10,
          color: active ? "rgba(8,9,11,0.55)" : colors.text.muted,
        }}
      >
        {count}
      </MonoText>
    </TouchableOpacity>
  );
}

function GroupHeader({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 18,
        paddingTop: 20,
        paddingBottom: 10,
      }}
    >
      <View
        style={{
          width: 4,
          height: 12,
          borderRadius: 2,
          backgroundColor: color,
        }}
      />
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 11,
            fontWeight: fontWeight.bold,
            color: colors.text.primary,
            letterSpacing: tracking.loose,
            textTransform: "uppercase",
          },
        ]}
      >
        {label}
      </Text>
      <MonoText
        weight="medium"
        style={{ fontSize: 11, color: colors.text.muted }}
      >
        {count}
      </MonoText>
      <View
        style={{
          flex: 1,
          height: 1,
          backgroundColor: colors.border.subtle,
          marginLeft: 4,
        }}
      />
    </View>
  );
}
