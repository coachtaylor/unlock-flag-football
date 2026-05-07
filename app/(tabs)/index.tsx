import { useCallback, useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { colors, radius } from "../../constants/design";
import { supabase } from "../../lib/supabase";
import { useTeam } from "../../lib/team-context";

type StrengthRow = {
  category_name: string;
  avg_rating: number | null;
  avg_time: number | null;
  players_assessed: number | null;
  drills_in_category: number | null;
  total_assessments: number | null;
};

type RecentBenchmarkRow = {
  id: string;
  assessment_date: string;
  created_at: string;
  time_seconds: number | null;
  rating: number | null;
  team_players:
    | { id: string; player_name: string }
    | { id: string; player_name: string }[]
    | null;
  team_drills:
    | { drill_name: string; benchmark_type: string | null }
    | { drill_name: string; benchmark_type: string | null }[]
    | null;
};

type PracticeHistoryRow = {
  practice_plan_id: string;
  practice_date: string;
  title: string | null;
  drills_planned: number | null;
  drills_completed_count: number | null;
  drills_skipped_count: number | null;
  attendance_count: number | null;
  energy_level: number | null;
  highlights: string | null;
  areas_to_improve: string | null;
};

function formatShortDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function SectionHeader({
  label,
  subtitle,
}: {
  label: string;
  subtitle?: string;
}) {
  return (
    <View style={{ marginTop: 32, marginBottom: 14 }}>
      <View
        className="flex-row items-center"
        style={{ gap: 8 }}
      >
        <View
          style={{
            width: 3,
            height: 12,
            borderRadius: 2,
            backgroundColor: colors.orange[500],
          }}
        />
        <Text
          style={{
            color: "rgba(255,255,255,0.82)",
            fontSize: 11,
            fontWeight: "500",
            letterSpacing: 0.8,
            textTransform: "uppercase",
          }}
        >
          {label}
        </Text>
      </View>
      {subtitle ? (
        <Text
          style={{
            color: "rgba(255,255,255,0.62)",
            fontSize: 13,
            marginTop: 4,
            marginLeft: 11,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function SkeletonBlock({
  height,
  width,
}: {
  height: number;
  width?: number | `${number}%`;
}) {
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
        height,
        width: width ?? "100%",
        borderRadius: radius.lg,
        backgroundColor: "#161C24",
        opacity,
      }}
    />
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { teamId, teamName } = useTeam();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [strengths, setStrengths] = useState<StrengthRow[]>([]);
  const [recentBenchmarks, setRecentBenchmarks] = useState<RecentBenchmarkRow[]>([]);
  const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryRow[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [drillCount, setDrillCount] = useState(0);
  const [benchmarkCount, setBenchmarkCount] = useState(0);
  const [practiceCount, setPracticeCount] = useState(0);

  const load = useCallback(async () => {
    if (!teamId) return;

    const [s, rb, ph, pc, dc, bc, prc] = await Promise.all([
      supabase.from("vw_team_strength_weakness").select("*").eq("team_id", teamId),
      supabase
        .from("benchmark_results")
        .select(
          "id, assessment_date, created_at, time_seconds, rating, team_players(id, player_name), team_drills(drill_name, benchmark_type)"
        )
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("vw_practice_history")
        .select("*")
        .eq("team_id", teamId)
        .order("practice_date", { ascending: false })
        .limit(3),
      supabase
        .from("team_players")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("status", "active"),
      supabase
        .from("team_drills")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("status", "published"),
      supabase
        .from("benchmark_results")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId),
      supabase
        .from("practice_plans")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId),
    ]);

    setStrengths((s.data ?? []) as StrengthRow[]);
    setRecentBenchmarks((rb.data ?? []) as RecentBenchmarkRow[]);
    setPracticeHistory((ph.data ?? []) as PracticeHistoryRow[]);
    setPlayerCount(pc.count ?? 0);
    setDrillCount(dc.count ?? 0);
    setBenchmarkCount(bc.count ?? 0);
    setPracticeCount(prc.count ?? 0);
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const navigate = (path: string) => {
    lightHaptic();
    router.push(path as never);
  };

  const isEmptyTeam =
    playerCount === 0 &&
    drillCount === 0 &&
    benchmarkCount === 0 &&
    practiceCount === 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0D1117" }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: insets.top + 12,
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
      {/* Settings gear row */}
      <View
        className="flex-row justify-end"
        style={{
          paddingBottom: 16,
        }}
      >
        <Pressable
          onPress={() => router.push("/settings" as never)}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={12}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: pressed
              ? "rgba(255,255,255,0.08)"
              : "rgba(255,255,255,0.04)",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Ionicons
            name="settings-outline"
            size={20}
            color="rgba(255,255,255,0.72)"
          />
        </Pressable>
      </View>

      {/* Hero card */}
      <HeroCard
        teamName={teamName}
        isEmptyTeam={isEmptyTeam}
        loading={loading}
        playerCount={playerCount}
        drillCount={drillCount}
        benchmarkCount={benchmarkCount}
      />

      {loading ? (
        <LoadingSkeleton />
      ) : isEmptyTeam ? (
        <EmptyState onNavigate={navigate} />
      ) : (
        <FullDashboard
          recentBenchmarks={recentBenchmarks}
          practiceHistory={practiceHistory}
          playerCount={playerCount}
          drillCount={drillCount}
          benchmarkCount={benchmarkCount}
          practiceCount={practiceCount}
          onNavigate={navigate}
        />
      )}
    </ScrollView>
  );
}

function HeroCard({
  teamName,
  isEmptyTeam,
  loading,
  playerCount,
  drillCount,
  benchmarkCount,
}: {
  teamName: string | null;
  isEmptyTeam: boolean;
  loading: boolean;
  playerCount: number;
  drillCount: number;
  benchmarkCount: number;
}) {
  const subtitle =
    loading || !isEmptyTeam
      ? "Team Dashboard"
      : "Let's get your dashboard set up.";

  const stepsComplete =
    (playerCount > 0 ? 1 : 0) +
    (drillCount > 0 ? 1 : 0) +
    (benchmarkCount > 0 ? 1 : 0);
  const showProgress = isEmptyTeam || stepsComplete < 3;
  const progressPct = (stepsComplete / 3) * 100;

  const [cardSize, setCardSize] = useState({ w: 0, h: 0 });

  return (
    <View
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== cardSize.w || height !== cardSize.h) {
          setCardSize({ w: width, h: height });
        }
      }}
      style={{
        backgroundColor: colors.surface.raised,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        padding: 24,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Top-right corner radial gradient.
          Pixel-precise positioning via onLayout + userSpaceOnUse so the
          brightest point lands exactly on the top-right pixel of the card. */}
      {cardSize.w > 0 ? (
        <Svg
          width={cardSize.w}
          height={cardSize.h}
          style={{ position: "absolute", top: 0, left: 0 }}
          pointerEvents="none"
        >
          <Defs>
            <RadialGradient
              id="heroGlow"
              cx={cardSize.w}
              cy={0}
              rx={cardSize.w * 0.5}
              ry={cardSize.h}
              fx={cardSize.w}
              fy={0}
              gradientUnits="userSpaceOnUse"
            >
              <Stop
                offset={0}
                stopColor={colors.orange[500]}
                stopOpacity={0.5}
              />
              <Stop
                offset={0.45}
                stopColor={colors.orange[500]}
                stopOpacity={0.18}
              />
              <Stop
                offset={1}
                stopColor={colors.orange[500]}
                stopOpacity={0}
              />
            </RadialGradient>
          </Defs>
          <Rect
            width={cardSize.w}
            height={cardSize.h}
            fill="url(#heroGlow)"
          />
        </Svg>
      ) : null}
      <Text
        style={{
          color: "#D48A30",
          fontSize: 11,
          fontWeight: "500",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        YOUR TEAM
      </Text>
      <Text
        style={{
          color: "rgba(255,255,255,0.95)",
          fontSize: 22,
          fontWeight: "500",
          marginTop: 6,
        }}
        numberOfLines={1}
      >
        {teamName ?? "Your team"}
      </Text>
      <Text
        style={{
          color: "rgba(255,255,255,0.72)",
          fontSize: 13,
          marginTop: 4,
        }}
      >
        {subtitle}
      </Text>

      {!loading && showProgress ? (
        <View style={{ marginTop: 20 }}>
          <View
            className="flex-row items-center justify-between"
            style={{ marginBottom: 8 }}
          >
            <Text
              style={{
                color: "rgba(255,255,255,0.82)",
                fontSize: 12,
                fontWeight: "500",
                letterSpacing: 0.4,
              }}
            >
              {stepsComplete} of 3 steps
            </Text>
            <Text
              style={{
                color: "rgba(212,138,48,0.90)",
                fontSize: 12,
                fontWeight: "500",
              }}
            >
              {stepsComplete === 0
                ? "Start with players"
                : stepsComplete === 3
                ? "Setup complete"
                : "Keep going"}
            </Text>
          </View>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: "rgba(255,255,255,0.06)",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${progressPct}%`,
                height: "100%",
                backgroundColor: "#D48A30",
                borderRadius: 3,
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={{ marginTop: 32, gap: 16 }}>
      <SkeletonBlock height={120} />
      <View
        className="flex-row flex-wrap"
        style={{ gap: 12 }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={{ flex: 1, minWidth: "45%" }}>
            <SkeletonBlock height={92} />
          </View>
        ))}
      </View>
      <SkeletonBlock height={180} />
      <SkeletonBlock height={140} />
    </View>
  );
}

function EmptyState({ onNavigate }: { onNavigate: (path: string) => void }) {
  const steps: {
    n: number;
    title: string;
    subtitle: string;
    href: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    {
      n: 1,
      title: "Add your players",
      subtitle: "Build the roster you'll be coaching.",
      href: "/roster/new",
      icon: "people-outline",
    },
    {
      n: 2,
      title: "Create your drills",
      subtitle: "Seed the library with what you already run.",
      href: "/drills/new",
      icon: "football-outline",
    },
    {
      n: 3,
      title: "Run your first assessment",
      subtitle: "Benchmark a drill to start collecting data.",
      href: "/benchmarks",
      icon: "timer-outline",
    },
  ];

  return (
    <View>
      <SectionHeader
        label="Get Started"
        subtitle="Three steps to get your dashboard running."
      />
      <View style={{ gap: 20 }}>
        {steps.map((step) => (
          <Pressable
            key={step.n}
            onPress={() => onNavigate(step.href)}
            className="flex-row flex-nowrap items-center"
            style={({ pressed }) => ({
              backgroundColor: pressed ? "#1A2028" : "#161C24",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
              borderLeftWidth: 4,
              borderLeftColor: "#D48A30",
              padding: 20,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            {/* Number circle — fixed width, never shrinks */}
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "rgba(212,138,48,0.12)",
                borderWidth: 1,
                borderColor: "rgba(212,138,48,0.25)",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginRight: 14,
              }}
            >
              <Text
                style={{
                  color: "#D48A30",
                  fontSize: 15,
                  fontWeight: "500",
                }}
              >
                {step.n}
              </Text>
            </View>

            {/* Text column — takes all remaining space */}
            <View style={{ flex: 1, flexShrink: 1 }}>
              <Text
                style={{
                  color: "rgba(255,255,255,0.92)",
                  fontSize: 15,
                  fontWeight: "500",
                }}
              >
                {step.title}
              </Text>
              <Text
                style={{
                  color: "rgba(255,255,255,0.72)",
                  fontSize: 13,
                  marginTop: 2,
                }}
              >
                {step.subtitle}
              </Text>
            </View>

            {/* Right side icons — fixed width row, never shrinks */}
            <View
              className="flex-row items-center"
              style={{
                flexShrink: 0,
                marginLeft: 12,
                gap: 8,
              }}
            >
              <Ionicons
                name={step.icon}
                size={20}
                color="rgba(255,255,255,0.72)"
              />
              <Ionicons
                name="chevron-forward"
                size={16}
                color="rgba(255,255,255,0.95)"
              />
            </View>
          </Pressable>
        ))}
      </View>

      <View
        className="flex-row items-center justify-center"
        style={{
          marginTop: 24,
          gap: 8,
        }}
      >
        <Ionicons
          name="analytics-outline"
          size={14}
          color="rgba(255,255,255,0.50)"
        />
        <Text
          style={{
            color: "rgba(255,255,255,0.58)",
            fontSize: 12,
          }}
        >
          Your dashboard fills in as you go.
        </Text>
      </View>
    </View>
  );
}

function FullDashboard({
  recentBenchmarks,
  practiceHistory,
  playerCount,
  drillCount,
  benchmarkCount,
  practiceCount,
  onNavigate,
}: {
  recentBenchmarks: RecentBenchmarkRow[];
  practiceHistory: PracticeHistoryRow[];
  playerCount: number;
  drillCount: number;
  benchmarkCount: number;
  practiceCount: number;
  onNavigate: (path: string) => void;
}) {
  const stats: {
    label: string;
    value: number;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    { label: "Active players", value: playerCount, icon: "people-outline" },
    { label: "Published drills", value: drillCount, icon: "football-outline" },
    {
      label: "Benchmarks logged",
      value: benchmarkCount,
      icon: "stopwatch-outline",
    },
    { label: "Practices planned", value: practiceCount, icon: "clipboard-outline" },
  ];



  return (
    <View>
      <SectionHeader
        label="Team Overview"
        subtitle="Where you stand right now."
      />
      <View
        className="flex-row flex-wrap"
        style={{
          gap: 12,
        }}
      >
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={{
              flex: 1,
              minWidth: "45%",
              backgroundColor: "#161C24",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
              overflow: "hidden",
            }}
          >
            {/* Top accent bar */}
            <View
              style={{
                height: 3,
                backgroundColor: colors.orange[500],
              }}
            />
            <View style={{ padding: 16 }}>
              <View className="flex-row justify-between items-center">
                <Text
                  style={{
                    color: "rgba(255,255,255,0.95)",
                    fontSize: 28,
                    fontWeight: "500",
                  }}
                >
                  {stat.value}
                </Text>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: "rgba(255,255,255,0.04)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={stat.icon}
                    size={18}
                    color="rgba(255,255,255,0.95)"
                  />
                </View>
              </View>
              <Text
                style={{
                  color: "rgba(255,255,255,0.72)",
                  fontSize: 13,
                  marginTop: 6,
                }}
              >
                {stat.label}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <SectionHeader
        label="Recent Assessments"
        subtitle="Latest benchmark results across your roster."
      />
      <RecentAssessments rows={recentBenchmarks} onNavigate={onNavigate} />

      <SectionHeader
        label="Recent Practices"
        subtitle="What your team has been working on."
      />
      <RecentPractices rows={practiceHistory} onNavigate={onNavigate} />

    </View>
  );
}

function LockedInsight({
  message,
  ctaLabel,
  onPress,
}: {
  message: string;
  ctaLabel?: string;
  onPress?: () => void;
}) {
  return (
    <View
      style={{
        padding: 20,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        borderStyle: "dashed",
        backgroundColor: "rgba(22,28,36,0.6)",
        alignItems: "center",
      }}
    >
      <Ionicons
        name="lock-closed-outline"
        size={24}
        color="rgba(255,255,255,0.95)"
        style={{ marginBottom: 8 }}
      />
      <Text
        style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.50)",
          textAlign: "center",
          lineHeight: 20,
        }}
      >
        {message}
      </Text>
      {ctaLabel && onPress ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => ({
            marginTop: 12,
            paddingVertical: 8,
            paddingHorizontal: 16,
            borderRadius: 20,
            backgroundColor: "rgba(212,138,48,0.12)",
            borderWidth: 1,
            borderColor: "rgba(212,138,48,0.25)",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "500",
              color: "#D48A30",
            }}
          >
            {ctaLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function pickRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function RecentAssessments({
  rows,
  onNavigate,
}: {
  rows: RecentBenchmarkRow[];
  onNavigate: (path: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <LockedInsight
        message="No assessments yet. Run your first benchmark to track player performance."
        ctaLabel="Run a benchmark"
        onPress={() => onNavigate("/benchmarks")}
      />
    );
  }

  return (
    <View
      style={{
        backgroundColor: "#161C24",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        overflow: "hidden",
      }}
    >
      {rows.map((row, idx) => {
        const player = pickRelation(row.team_players);
        const drill = pickRelation(row.team_drills);
        const playerId = player?.id ?? null;
        const playerName = player?.player_name ?? "Unknown player";
        const drillName = drill?.drill_name ?? "Unknown drill";
        const benchmarkType = drill?.benchmark_type ?? null;
        const result =
          benchmarkType === "timed" && row.time_seconds !== null
            ? `${Number(row.time_seconds).toFixed(2)}s`
            : row.rating !== null
            ? `${row.rating}/5`
            : "—";

        return (
          <View key={row.id}>
            {idx > 0 ? (
              <View
                style={{
                  height: 1,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  marginHorizontal: 16,
                }}
              />
            ) : null}
            <Pressable
              onPress={() => playerId && onNavigate(`/roster/${playerId}`)}
              disabled={!playerId}
              className="flex-row items-center"
              style={({ pressed }) => ({
                paddingVertical: 12,
                paddingHorizontal: 16,
                opacity: pressed && playerId ? 0.85 : 1,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: "rgba(255,255,255,0.92)",
                    fontSize: 15,
                    fontWeight: "500",
                  }}
                  numberOfLines={1}
                >
                  {playerName}
                </Text>
                <Text
                  style={{
                    color: "rgba(255,255,255,0.60)",
                    fontSize: 13,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {drillName} · {result} · {formatShortDate(row.assessment_date)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color="rgba(255,255,255,0.95)"
              />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function RecentPractices({
  rows,
  onNavigate,
}: {
  rows: PracticeHistoryRow[];
  onNavigate: (path: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <LockedInsight
        message="No practices logged yet."
        ctaLabel="Plan a practice"
        onPress={() => onNavigate("/practice/new")}
      />
    );
  }

  return (
    <View
      style={{
        backgroundColor: "#161C24",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        overflow: "hidden",
      }}
    >
      {rows.map((row, idx) => {
        const planned = row.drills_planned ?? 0;
        const completed = row.drills_completed_count ?? 0;
        const attendance =
          row.attendance_count !== null
            ? `${row.attendance_count} players`
            : "Attendance —";

        return (
          <View key={row.practice_plan_id}>
            {idx > 0 ? (
              <View
                style={{
                  height: 1,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  marginHorizontal: 16,
                }}
              />
            ) : null}
            <Pressable
              onPress={() => onNavigate(`/practice/${row.practice_plan_id}`)}
              className="flex-row items-center"
              style={({ pressed }) => ({
                paddingVertical: 12,
                paddingHorizontal: 16,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: "rgba(255,255,255,0.92)",
                    fontSize: 15,
                    fontWeight: "500",
                  }}
                  numberOfLines={1}
                >
                  {formatShortDate(row.practice_date)}
                  {row.title ? ` · ${row.title}` : ""}
                </Text>
                <Text
                  style={{
                    color: "rgba(255,255,255,0.60)",
                    fontSize: 13,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {completed}/{planned} drills · {attendance}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color="rgba(255,255,255,0.95)"
              />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
