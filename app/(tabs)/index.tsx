import { useCallback, useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { colors, fontWeight, radius, spacing, tracking } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";
import { teamColorHex } from "../../constants/team-colors";
import { playerColorForIndex } from "../../lib/athlete";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { useTeam } from "../../lib/team-context";
import {
  type Activity,
  type Attendance,
  type DrillMix,
  type Move,
  type NextPractice,
  type PinnedPulse,
  deriveMoves,
  fetchActivity,
  fetchAttendance,
  fetchDrillMix,
  fetchNextPractice,
  fetchPrsThisWeek,
  fetchTeamPulse,
} from "../../lib/dashboard";
import { AttendanceRing } from "../../components/ui/AttendanceRing";
import { AttendBar } from "../../components/ui/AttendBar";
import { ActivityRow } from "../../components/ui/ActivityRow";
import { AvatarStack } from "../../components/ui/AvatarStack";
import { CategoryDonut } from "../../components/ui/CategoryDonut";
import { CategoryWeeklyMini } from "../../components/ui/CategoryWeeklyMini";
import { Move as MoveCard } from "../../components/ui/Move";
import { Pill } from "../../components/ui/Pill";
import { Spark } from "../../components/ui/Spark";
import { StreakRow } from "../../components/ui/StreakRow";
import { CATEGORY_COLORS, type CategoryKey } from "../../constants/categories";
import { CaptainViewToggle } from "../../components/dashboard/CaptainViewToggle";
import { NeedsReviewLink } from "../../components/benchmark/NeedsReviewLink";

// ─────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────

function formatShortDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Friendlier copy for upcoming practice dates. Within 7 days: "this Sunday".
// 8–13 days out: bare weekday ("next Sunday" reads ambiguous, so we keep it
// short). Beyond two weeks: full short date so the coach has the absolute
// reference. Kept here (not in a shared util) because this phrasing is
// specific to the attendance subtitle copy.
function formatRelativeDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, (m ?? 1) - 1, d ?? 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  const weekday = target.toLocaleDateString("en-US", { weekday: "long" });
  if (diffDays >= 0 && diffDays <= 6) return `this ${weekday}`;
  if (diffDays >= 7 && diffDays <= 13) return weekday;
  return target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// Sort key for SUN ROLL avatars: in → pending → out. Tri-state RSVP maps
// to 0 / 1 / 2 so a single Array#sort puts confirmed attendees at the
// front of the row.
function rsvpRank(rsvp: boolean | null): number {
  if (rsvp === true) return 0;
  if (rsvp === null) return 1;
  return 2;
}

// "2026-05-21" + "17:30:00" → { day: "THU", time: "5:30", suffix: "PM" }
function splitPracticeTime(
  dateStr: string,
  startTime: string | null
): { day: string; time: string; suffix: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const day = date
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();
  if (!startTime) return { day, time: "TBD", suffix: "" };
  // start_time is stored as "HH:MM:SS" UTC-ish; parse the hours/min directly.
  const [hStr, mnStr] = startTime.split(":");
  let h = Number(hStr);
  const mn = Number(mnStr);
  const suffix = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return {
    day,
    time: `${h}:${String(mn).padStart(2, "0")}`,
    suffix,
  };
}

// Relative day label for the activity feed: Today / Mon / Tue / 03·14
function relativeDayLabel(createdAt: string): string {
  const created = new Date(createdAt);
  const today = new Date();
  const diffDays = Math.floor(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(created.getFullYear(), created.getMonth(), created.getDate())) /
      86_400_000
  );
  if (diffDays <= 0) return "TODAY";
  if (diffDays <= 6) {
    return created
      .toLocaleDateString("en-US", { weekday: "short" })
      .toUpperCase();
  }
  return created
    .toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
    .replace("/", "·");
}

function weekTagFor(date: Date): string {
  // "WEEK NN · DAY" for the app header eyebrow. ISO-week number.
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((+target - +yearStart) / 86_400_000) + 1) / 7);
  const dayLabel = date
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();
  return `WEEK ${String(weekNum).padStart(2, "0")} · ${dayLabel}`;
}

function activityIcon(kind: Activity["kind"]): keyof typeof Ionicons.glyphMap {
  if (kind === "benchmark") return "flash-outline";
  if (kind === "drill") return "football-outline";
  return "flag-outline";
}

// ─────────────────────────────────────────────────────────────────────
// Skeleton block (reused in loading state)
// ─────────────────────────────────────────────────────────────────────

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
        backgroundColor: colors.surface.raised,
        opacity,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section card shell — every populated-dashboard card lives in this
// container so spacing/borders stay consistent in one place.
// ─────────────────────────────────────────────────────────────────────

function CardShell({
  children,
  pad = spacing.lg,
  noPad = false,
}: {
  children: React.ReactNode;
  pad?: number;
  noPad?: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.surface.raised,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border.card,
        padding: noPad ? 0 : pad,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}

function SectionEyebrow({
  label,
  sub,
  trailing,
}: {
  label: string;
  sub?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 28, marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 3,
            height: 14,
            borderRadius: 2,
            backgroundColor: colors.orange[500],
          }}
        />
        <Text
          style={[
            fontStyle("bold"),
            {
              flex: 1,
              fontSize: 11,
              fontWeight: fontWeight.bold,
              color: colors.text.primary,
              textTransform: "uppercase",
              letterSpacing: tracking.loose,
            },
          ]}
        >
          {label}
        </Text>
        {trailing}
      </View>
      {sub ? (
        <Text
          style={[
            fontStyle("regular"),
            {
              fontSize: 13,
              color: colors.text.secondary,
              marginTop: 4,
              marginLeft: 11,
            },
          ]}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { teamId, teamName, teamFormat, teamColor, userRole } = useTeam();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Onboarding milestone counters (kept from old build — drive Bold Empty branch).
  const [playerCount, setPlayerCount] = useState(0);
  const [drillCount, setDrillCount] = useState(0);
  const [benchmarkCount, setBenchmarkCount] = useState(0);
  const [practiceCount, setPracticeCount] = useState(0);

  // Populated-dashboard data.
  const [nextPractice, setNextPractice] = useState<NextPractice>(null);
  const [pulse, setPulse] = useState<PinnedPulse[]>([]);
  const [drillMix, setDrillMix] = useState<DrillMix | null>(null);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [prsThisWeek, setPrsThisWeek] = useState<{
    count: number;
    players: { id: string; name: string; colorIndex: number | null }[];
  }>({ count: 0, players: [] });
  const [moves, setMoves] = useState<Move[]>([]);
  const [completedPractices, setCompletedPractices] = useState(0);

  const load = useCallback(async () => {
    if (!teamId) return;

    // Milestone counts (only NON-captain players for the roster milestone — see
    // commentary in the old build).
    const [pc, dc, bc, prc, completedRes, lastBenchRes] = await Promise.all([
      supabase
        .from("team_players")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("status", "active")
        .eq("is_captain", false),
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
      supabase
        .from("practice_plans")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("status", "completed"),
      supabase
        .from("benchmark_results")
        .select("created_at")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (pc.error) console.warn("[dashboard] players:", pc.error.message);
    if (dc.error) console.warn("[dashboard] drills:", dc.error.message);
    if (bc.error) console.warn("[dashboard] benchmarks:", bc.error.message);
    if (prc.error) console.warn("[dashboard] practices:", prc.error.message);

    setPlayerCount(pc.count ?? 0);
    setDrillCount(dc.count ?? 0);
    setBenchmarkCount(bc.count ?? 0);
    setPracticeCount(prc.count ?? 0);
    setCompletedPractices(completedRes.count ?? 0);

    // Fan out the populated-dashboard fetches.
    const [npRes, pulseRes, mixRes, attRes, actRes, prsRes] = await Promise.all([
      fetchNextPractice(teamId),
      fetchTeamPulse(teamId),
      fetchDrillMix(teamId),
      fetchAttendance(teamId),
      fetchActivity(teamId, 4),
      fetchPrsThisWeek(teamId),
    ]);

    setNextPractice(npRes);
    setPulse(pulseRes);
    setDrillMix(mixRes);
    setAttendance(attRes);
    setActivity(actRes);
    setPrsThisWeek(prsRes);

    setMoves(
      deriveMoves({
        nextPractice: npRes,
        lastBenchmarkAt: lastBenchRes.data?.created_at ?? null,
        practicesCompletedCount: completedRes.count ?? 0,
      })
    );
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
      load().catch(() => {});
      return () => {};
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const navigate = (path: string) => {
    lightHaptic();
    router.push(path as never);
  };

  // Onboarding milestones — same as before.
  const rosterDone = playerCount > 0;
  const drillsDone = drillCount > 0;
  const practiceDone = practiceCount > 0;
  const onboardingDone = rosterDone && drillsDone && practiceDone;

  if (!loading && !onboardingDone) {
    return (
      <BoldEmptyDashboard
        teamName={teamName}
        teamFormat={teamFormat}
        teamColor={teamColor}
        coachLabel={user?.email ?? null}
        rosterDone={rosterDone}
        drillsDone={drillsDone}
        practiceDone={practiceDone}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onNavigate={navigate}
        onSettings={() => router.push("/settings" as never)}
        onEditTeam={
          teamId
            ? () =>
                router.push(
                  `/team-setup?editTeamId=${teamId}` as never,
                )
            : null
        }
        topInset={insets.top}
        bottomInset={insets.bottom}
      />
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      contentContainerStyle={{
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
      {/* App header */}
      <View
        style={{
          paddingHorizontal: 18,
          paddingBottom: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.replace("/dashboard")}
          accessibilityRole="button"
          accessibilityLabel="Account home"
          hitSlop={8}
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: "rgba(255,255,255,0.05)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="chevron-back"
            size={16}
            color={colors.text.primary}
          />
        </TouchableOpacity>
        <View style={{ gap: 2, flex: 1, minWidth: 0 }}>
          <Text
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
            numberOfLines={1}
          >
            {teamName ?? weekTagFor(new Date())}
          </Text>
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 22,
                fontWeight: fontWeight.bold,
                color: colors.text.primary,
                letterSpacing: tracking.tight,
              },
            ]}
            numberOfLines={1}
          >
            Hey, Coach.
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/settings" as never)}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: pressed
              ? colors.surface.pressed
              : "rgba(255,255,255,0.05)",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Ionicons
            name="settings-outline"
            size={16}
            color={colors.text.primary}
          />
        </Pressable>
      </View>

      {/* Captain toggle — renders only when the current user is a
          captain on this team AND has a linked team_players row
          (created post-migration-56). Hidden otherwise. */}
      {teamId && user ? (
        <CaptainViewToggle
          teamId={teamId}
          userId={user.id}
          userRole={userRole}
        />
      ) : null}

      {loading ? (
        <PopulatedSkeleton />
      ) : (
        <View style={{ paddingHorizontal: 16 }}>
          <NextPracticeHero
            np={nextPractice}
            teamFormat={teamFormat}
            // The prep page (practice detail) is where attendance is marked
            // and a scheduled practice is flipped to "live". The run screen
            // only opens once it's live. So "Prepare Practice" / "Review
            // Practice Prep" route to the detail page; "Live Practice" jumps
            // straight to the run timer.
            onLive={() =>
              nextPractice &&
              navigate(`/practice/${nextPractice.practice_plan_id}/run`)
            }
            onAdd={() => navigate("/practice/new")}
            onOpen={() =>
              nextPractice && navigate(`/practice/${nextPractice.practice_plan_id}`)
            }
          />

          {/* Needs-review backlog (Build 14f) — only renders when > 0. */}
          <NeedsReviewLink teamId={teamId} style={{ marginTop: 12 }} />

          <SectionEyebrow
            label="Team Pulse"
            sub="Averages on your pinned benchmark drills."
          />
          <TeamPulseCard
            pinned={pulse}
            prs={prsThisWeek}
            onPickDrills={() => navigate("/drills")}
            onOpenDrill={(id) => navigate(`/drills/${id}`)}
            onOpenCombine={() => navigate("/benchmarks")}
          />

          <SectionEyebrow
            label="Drills by category"
            sub={
              drillMix && drillMix.completedPracticeCount > 0
                ? `${drillMix.total} drill${
                    drillMix.total === 1 ? "" : "s"
                  } completed across ${drillMix.completedPracticeCount} practice${
                    drillMix.completedPracticeCount === 1 ? "" : "s"
                  }.`
                : "Mix from completed practices."
            }
          />
          <DrillMixCard
            mix={drillMix}
            onAdd={() => navigate("/drills/new")}
            onOpenLibrary={() => navigate("/drills")}
            onPlanPractice={() => navigate("/practice/new")}
          />

          <SectionEyebrow
            label="Attendance"
            sub={
              nextPractice
                ? `Rolling 4 weeks + ${formatRelativeDay(nextPractice.practice_date)}.`
                : "Rolling 4 weeks."
            }
          />
          <AttendanceCard
            attendance={attendance}
            np={nextPractice}
            onOpenPractice={() =>
              nextPractice && navigate(`/practice/${nextPractice.practice_plan_id}`)
            }
            onLogPractice={() => navigate("/practice/new")}
          />

          <SectionEyebrow
            label="This week's moves"
            sub={
              nextPractice
                ? `Three things to lock in before ${formatShortDate(
                    nextPractice.practice_date
                  )}.`
                : "Three things to keep you moving."
            }
          />
          <View style={{ gap: 10 }}>
            {moves.map((m) => (
              <MoveCard
                key={m.key}
                index={m.index}
                title={m.title}
                desc={m.desc}
                cta={m.cta}
                done={m.done}
                onCta={() => navigate(m.href)}
              />
            ))}
          </View>

          <SectionEyebrow
            label="Activity"
            sub="What the team has been working on."
          />
          <ActivityFeed activity={activity} onOpen={(href) => navigate(href)} />
        </View>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HERO — Next practice
// ─────────────────────────────────────────────────────────────────────

function NextPracticeHero({
  np,
  teamFormat,
  onLive,
  onAdd,
  onOpen,
}: {
  np: NextPractice;
  teamFormat: string | null;
  onLive: () => void;
  onAdd: () => void;
  onOpen: () => void;
}) {
  if (!np) {
    // Empty hero — onboarding cleared but no practice scheduled.
    return (
      <View
        style={{
          borderRadius: radius.hero,
          backgroundColor: colors.surface.raised,
          borderWidth: 1,
          borderColor: colors.border.card,
          padding: 18,
          overflow: "hidden",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.text.muted,
            }}
          />
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
            Next up
          </Text>
        </View>
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 22,
              fontWeight: fontWeight.bold,
              color: colors.text.primary,
              marginTop: 12,
              letterSpacing: tracking.tight,
            },
          ]}
        >
          No practice scheduled.
        </Text>
        <Text
          style={[
            fontStyle("regular"),
            {
              fontSize: 13,
              color: colors.text.secondary,
              marginTop: 6,
              lineHeight: 19,
            },
          ]}
        >
          Plan your next session — pick a date, drop in a few drills, and the
          dashboard fills out from there.
        </Text>
        <TouchableOpacity
          onPress={onAdd}
          activeOpacity={0.92}
          accessibilityRole="button"
          accessibilityLabel="Plan a practice"
          style={{
            marginTop: 18,
            height: 48,
            borderRadius: 12,
            backgroundColor: colors.orange[500],
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Ionicons name="add" size={16} color={colors.surface.base} />
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 15,
                fontWeight: fontWeight.bold,
                color: colors.surface.base,
              },
            ]}
          >
            Plan a practice
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { day, time, suffix } = splitPracticeTime(np.practice_date, np.start_time);
  const isLive = np.status === "live";
  const liveColor = isLive ? colors.lime[400] : colors.lime[400];

  return (
    <View
      style={{
        borderRadius: radius.hero,
        backgroundColor: colors.surface.raised,
        borderWidth: 1,
        borderColor: colors.orange.tintBorder,
        padding: 18,
        overflow: "hidden",
      }}
    >
      {/* Top-right orange bloom — same RadialGradient trick the old HeroCard used. */}
      <HeroBloom />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: liveColor,
            }}
          />
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 11,
                fontWeight: fontWeight.bold,
                color: liveColor,
                letterSpacing: tracking.loose,
                textTransform: "uppercase",
              },
            ]}
          >
            {isLive ? "Live now" : "Next up"}
          </Text>
        </View>
        {teamFormat ? (
          <Pill variant="ghost" mono>
            {teamFormat.toUpperCase()}
          </Pill>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 13,
                color: colors.text.secondary,
              },
            ]}
            numberOfLines={1}
          >
            {np.title ?? "Practice"}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "baseline",
              flexWrap: "wrap",
            }}
          >
            <MonoText
              weight="bold"
              style={{
                fontSize: 32,
                fontWeight: fontWeight.bold,
                color: colors.text.primary,
                letterSpacing: tracking.tight,
                lineHeight: 36,
              }}
            >
              {day}{" "}
            </MonoText>
            <MonoText
              weight="bold"
              style={{
                fontSize: 32,
                fontWeight: fontWeight.bold,
                color: colors.orange[500],
                letterSpacing: tracking.tight,
                lineHeight: 36,
              }}
            >
              {time}
            </MonoText>
            {suffix ? (
              <MonoText
                weight="medium"
                style={{
                  fontSize: 18,
                  color: colors.text.secondary,
                  marginLeft: 4,
                }}
              >
                {suffix}
              </MonoText>
            ) : null}
          </View>
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              marginTop: 10,
              alignItems: "center",
            }}
          >
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 12, color: colors.text.secondary },
              ]}
            >
              {formatShortDate(np.practice_date)}
            </Text>
            {np.duration_min ? (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Ionicons
                  name="time-outline"
                  size={12}
                  color={colors.text.secondary}
                />
                <Text
                  style={[
                    fontStyle("regular"),
                    { fontSize: 12, color: colors.text.secondary },
                  ]}
                >
                  {np.duration_min} min
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable onPress={onOpen} hitSlop={4}>
          <AttendanceRing committed={np.committed} total={np.total} size={80} />
        </Pressable>
      </View>

      {isLive ? (
        // Live: enter the run timer (primary) or jump back to the prep page
        // to review attendance / the plan (secondary).
        <View style={{ gap: 8, marginTop: 16 }}>
          <TouchableOpacity
            onPress={onLive}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel="Live practice"
            style={{
              height: 44,
              borderRadius: 12,
              backgroundColor: colors.orange[500],
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Ionicons name="play-sharp" size={12} color={colors.surface.base} />
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 14,
                  fontWeight: fontWeight.bold,
                  color: colors.surface.base,
                },
              ]}
            >
              Live Practice
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onOpen}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Review practice prep"
            style={{
              height: 44,
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.04)",
              borderWidth: 1,
              borderColor: colors.border.strong,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Ionicons
              name="clipboard-outline"
              size={14}
              color={colors.text.primary}
            />
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 14,
                  fontWeight: fontWeight.bold,
                  color: colors.text.primary,
                },
              ]}
            >
              Review Practice Prep
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        // Scheduled: open the prep page (attendance + go-live happen there).
        <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          <TouchableOpacity
            onPress={onOpen}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel="Prepare practice"
            style={{
              flex: 1,
              height: 44,
              borderRadius: 12,
              backgroundColor: colors.orange[500],
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Ionicons
              name="clipboard-outline"
              size={14}
              color={colors.surface.base}
            />
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 14,
                  fontWeight: fontWeight.bold,
                  color: colors.surface.base,
                },
              ]}
            >
              Prepare Practice
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onAdd}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Add a practice"
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.04)",
              borderWidth: 1,
              borderColor: colors.border.strong,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="add" size={16} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function HeroBloom() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
      }}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <SvgLinearGradient
              id="heroBloom"
              x1={size.w}
              y1={0}
              x2={size.w * 0.2}
              y2={size.h * 0.7}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset={0} stopColor={colors.orange[500]} stopOpacity={0.22} />
              <Stop offset={0.6} stopColor={colors.orange[500]} stopOpacity={0.05} />
              <Stop offset={1} stopColor={colors.orange[500]} stopOpacity={0} />
            </SvgLinearGradient>
          </Defs>
          <Rect width={size.w} height={size.h} fill="url(#heroBloom)" />
        </Svg>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TEAM PULSE — 2×2 stat grid of pinned drills + PR footer
// ─────────────────────────────────────────────────────────────────────

function TeamPulseCard({
  pinned,
  prs,
  onPickDrills,
  onOpenDrill,
  onOpenCombine,
}: {
  pinned: PinnedPulse[];
  prs: {
    count: number;
    players: { id: string; name: string; colorIndex: number | null }[];
  };
  onPickDrills: () => void;
  onOpenDrill: (id: string) => void;
  onOpenCombine: () => void;
}) {
  if (pinned.length === 0) {
    return (
      <LockedInsight
        icon="pin-outline"
        message="Pin up to 4 drills to track team averages here."
        ctaLabel="Pick drills"
        onPress={onPickDrills}
      />
    );
  }

  const canPinMore = pinned.length < 4;

  return (
    <CardShell>
      {canPinMore ? (
        <TouchableOpacity
          onPress={onPickDrills}
          activeOpacity={0.7}
          hitSlop={12}
          accessibilityLabel="Pin another drill"
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            zIndex: 10,
          }}
        >
          <Ionicons name="add" size={22} color={colors.orange[500]} />
        </TouchableOpacity>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        {pinned.map((slot) => (
          <View key={slot.drill_id} style={{ width: "47%" }}>
            <PulseTile pulse={slot} onPress={() => onOpenDrill(slot.drill_id)} />
          </View>
        ))}
      </View>

      <View
        style={{
          height: 1,
          backgroundColor: colors.border.strong,
          marginVertical: 14,
        }}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
        >
          {prs.count > 0 ? (
            <AvatarStack
              players={prs.players.slice(0, 5).map((p) => ({
                initials: initialsOf(p.name),
                color: playerColorForIndex(p.colorIndex),
                name: p.name,
              }))}
              size={26}
              max={5}
            />
          ) : (
            <Ionicons
              name="trophy-outline"
              size={18}
              color={colors.text.secondary}
            />
          )}
          <Text
            style={[
              fontStyle("regular"),
              { fontSize: 12, color: colors.text.secondary },
            ]}
            numberOfLines={1}
          >
            {prs.count > 0
              ? `${prs.count} PR${prs.count === 1 ? "" : "s"} set this week`
              : "No PRs logged this week."}
          </Text>
        </View>
        <Pressable
          onPress={onOpenCombine}
          hitSlop={6}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={[
              fontStyle("semibold"),
              {
                fontSize: 12,
                fontWeight: fontWeight.semibold,
                color: colors.orange[500],
              },
            ]}
          >
            Combine
          </Text>
          <Ionicons
            name="arrow-forward"
            size={11}
            color={colors.orange[500]}
          />
        </Pressable>
      </View>
    </CardShell>
  );
}

function PulseTile({
  pulse,
  onPress,
}: {
  pulse: PinnedPulse;
  onPress: () => void;
}) {
  const { value, unit, delta, deltaGood } = formatPulse(pulse);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        gap: 6,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <MonoText
          weight="bold"
          style={{
            fontSize: 28,
            fontWeight: fontWeight.bold,
            color: colors.text.primary,
            letterSpacing: tracking.tight,
            lineHeight: 28,
          }}
        >
          {value}
        </MonoText>
        {unit ? (
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 13,
                color: colors.text.secondary,
                marginLeft: 1,
              },
            ]}
          >
            {unit}
          </Text>
        ) : null}
        {delta ? (
          <MonoText
            weight="medium"
            style={{
              fontSize: 11,
              fontWeight: fontWeight.semibold,
              color: deltaGood ? colors.lime[400] : colors.red.semantic,
              marginLeft: 4,
            }}
          >
            {delta}
          </MonoText>
        ) : null}
      </View>
      <Text
        style={[
          fontStyle("medium"),
          {
            fontSize: 11,
            color: colors.text.secondary,
            textTransform: "uppercase",
            letterSpacing: 1,
          },
        ]}
        numberOfLines={1}
      >
        {pulse.drill_name}
      </Text>
      {pulse.spark.length > 1 ? (
        <Spark
          data={pulse.spark}
          color={deltaGood ? colors.lime[400] : colors.orange[500]}
          width={120}
          height={26}
        />
      ) : (
        <Text
          style={[
            fontStyle("regular"),
            { fontSize: 10, color: colors.text.muted, marginTop: 6 },
          ]}
        >
          Log a benchmark to see the trend.
        </Text>
      )}
    </Pressable>
  );
}

function formatPulse(p: PinnedPulse): {
  value: string;
  unit: string | null;
  delta: string | null;
  deltaGood: boolean;
} {
  if (p.current_avg === null || Number.isNaN(p.current_avg)) {
    return { value: "—", unit: null, delta: null, deltaGood: true };
  }
  const isTimed = p.benchmark_type === "timed";
  const value = isTimed ? p.current_avg.toFixed(2) : p.current_avg.toFixed(1);
  const unit = isTimed ? "s" : "/5";
  let delta: string | null = null;
  let deltaGood = true;
  if (p.delta !== null && !Number.isNaN(p.delta) && Math.abs(p.delta) >= 0.05) {
    const sign = p.delta > 0 ? "+" : "−";
    const mag = Math.abs(p.delta);
    delta = `${sign}${isTimed ? mag.toFixed(2) : mag.toFixed(1)}${isTimed ? "s" : ""}`;
    deltaGood = isTimed ? p.delta < 0 : p.delta > 0;
  }
  return { value, unit, delta, deltaGood };
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

// ─────────────────────────────────────────────────────────────────────
// DRILLS BY CATEGORY
// ─────────────────────────────────────────────────────────────────────

function DrillMixCard({
  mix,
  onAdd,
  onOpenLibrary,
  onPlanPractice,
}: {
  mix: DrillMix | null;
  onAdd: () => void;
  onOpenLibrary: () => void;
  onPlanPractice: () => void;
}) {
  if (!mix || mix.completedPracticeCount === 0) {
    // No completed practices yet — donut shows nothing because there's
    // nothing the team has actually run. Different ask than "add drills".
    return (
      <LockedInsight
        icon="grid-outline"
        message="Complete a practice to see your drill mix."
        ctaLabel="Plan a practice"
        onPress={onPlanPractice}
      />
    );
  }

  if (mix.total === 0) {
    // Completed practices exist but every drill was skipped (or run_status
    // never advanced). Rare in normal flow.
    return (
      <LockedInsight
        icon="grid-outline"
        message="No drills were marked done in your completed practices."
        ctaLabel="Open library"
        onPress={onOpenLibrary}
      />
    );
  }

  // Top categories to list under the donut (max 5 lines for legibility).
  const topCats = (Object.entries(mix.totals) as [CategoryKey, number][])
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <CardShell>
      <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
        <CategoryDonut
          mix={mix.totals}
          size={84}
          stroke={9}
          centerValue={mix.total}
        />
        <View style={{ flex: 1, gap: 8 }}>
          {topCats.map(([k, n]) => (
            <View
              key={k}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: CATEGORY_COLORS[k],
                }}
              />
              <Text
                style={[
                  fontStyle("medium"),
                  {
                    flex: 1,
                    fontSize: 12,
                    color: colors.text.primary,
                    textTransform: "capitalize",
                  },
                ]}
              >
                {k}
              </Text>
              <MonoText
                weight="medium"
                style={{ fontSize: 12, color: colors.text.secondary }}
              >
                {n}
              </MonoText>
            </View>
          ))}
        </View>
      </View>

      <View
        style={{
          height: 1,
          backgroundColor: colors.border.strong,
          marginVertical: 14,
        }}
      />

      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 10,
            fontWeight: fontWeight.bold,
            color: colors.text.secondary,
            textTransform: "uppercase",
            letterSpacing: tracking.loose,
            marginBottom: 8,
          },
        ]}
      >
        {mix.weekly.length === 1
          ? "This week"
          : `Last ${mix.weekly.length} week${mix.weekly.length === 1 ? "" : "s"}`}
      </Text>
      <CategoryWeeklyMini weeks={mix.weekly} />

      {mix.underweighted ? (
        <View
          style={{
            marginTop: 14,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: radius.lg,
            backgroundColor: "rgba(255,77,77,0.07)",
            borderWidth: 1,
            borderColor: "rgba(255,77,77,0.22)",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Text
            style={[
              fontStyle("bold"),
              { color: colors.red.semantic, fontSize: 14 },
            ]}
          >
            !
          </Text>
          <Text
            style={[
              fontStyle("regular"),
              {
                flex: 1,
                fontSize: 11.5,
                color: colors.text.primary,
                lineHeight: 16,
              },
            ]}
          >
            <Text style={{ textTransform: "capitalize" }}>{mix.underweighted.key}</Text>
            {` at ${mix.underweighted.pct}% of the mix — only ${
              mix.underweighted.count
            } drill${mix.underweighted.count === 1 ? "" : "s"} across ${
              mix.completedPracticeCount
            } practice${mix.completedPracticeCount === 1 ? "" : "s"}.`}
          </Text>
          <Pressable onPress={onAdd} hitSlop={6}>
            <Text
              style={[
                fontStyle("semibold"),
                {
                  fontSize: 11,
                  fontWeight: fontWeight.semibold,
                  color: colors.orange[500],
                },
              ]}
            >
              Add
            </Text>
          </Pressable>
        </View>
      ) : null}
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ATTENDANCE
// ─────────────────────────────────────────────────────────────────────

// Small bullet + percentage chip used in the attendance hero card to
// show the offense/defense composition of attended slots. Two of these
// sit on the third row under the show-rate bars and together sum to
// 100%. Color matches the side-coded scheme (lime offense, red defense).
function ShareDot({ color, value }: { color: string; value: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
      <MonoText
        weight="medium"
        style={{
          fontSize: 11,
          color: colors.text.primary,
          fontVariant: ["tabular-nums"],
        }}
      >
        {Math.max(0, Math.min(100, value))}%
      </MonoText>
    </View>
  );
}

function AttendanceCard({
  attendance,
  np,
  onOpenPractice,
  onLogPractice,
}: {
  attendance: Attendance | null;
  np: NextPractice;
  onOpenPractice: () => void;
  onLogPractice: () => void;
}) {
  if (!attendance || attendance.spark.length === 0) {
    return (
      <LockedInsight
        icon="people-outline"
        message="Log a practice to start tracking attendance."
        ctaLabel="Plan a practice"
        onPress={onLogPractice}
      />
    );
  }

  return (
    <CardShell>
      {/* Top: big % + spark, 3-bar breakdown */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "baseline",
              gap: 4,
              flexWrap: "wrap",
            }}
          >
            <MonoText
              weight="bold"
              style={{
                fontSize: 32,
                fontWeight: fontWeight.bold,
                color: colors.text.primary,
                letterSpacing: tracking.tight,
                lineHeight: 32,
              }}
            >
              {attendance.rate}
            </MonoText>
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 14, color: colors.text.secondary },
              ]}
            >
              %
            </Text>
            {attendance.deltaPct !== 0 ? (
              <MonoText
                weight="medium"
                style={{
                  fontSize: 11,
                  fontWeight: fontWeight.semibold,
                  color:
                    attendance.deltaPct > 0
                      ? colors.lime[400]
                      : colors.red.semantic,
                  marginLeft: 6,
                }}
              >
                {attendance.deltaPct > 0 ? "+" : ""}
                {attendance.deltaPct}
              </MonoText>
            ) : null}
          </View>
          <Text
            style={[
              fontStyle("medium"),
              {
                fontSize: 11,
                color: colors.text.secondary,
                textTransform: "uppercase",
                letterSpacing: 1,
              },
            ]}
          >
            Avg show-rate
          </Text>
          {attendance.spark.length > 1 ? (
            <Spark
              data={attendance.spark}
              color={colors.orange[500]}
              width={120}
              height={26}
            />
          ) : null}
        </View>
        <View style={{ gap: 8, alignItems: "flex-end" }}>
          {/* Per-side show-rate: lime for offense, red for defense.
              Matches the side-coded colors used elsewhere in the app
              (sideAccent in constants/positions.ts) so a coach sees
              consistent meaning across surfaces. */}
          <AttendBar
            label="Offense"
            value={attendance.offenseRate}
            color={colors.lime[400]}
          />
          <AttendBar
            label="Defense"
            value={attendance.defenseRate}
            color={colors.red.semantic}
          />
          {/* Composition of attended slots by side — sums to 100%.
              Two colored bullets (lime=offense, red=defense) followed
              by their share. Distinct metric from the show-rates above:
              tells the coach which side is showing up more relative
              to the other. Label width + alignment mirror AttendBar so
              the three rows stay visually rhythmed. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              width: 120,
            }}
          >
            <Text
              style={[
                fontStyle("medium"),
                {
                  fontSize: 10,
                  color: colors.text.secondary,
                  width: 56,
                  textTransform: "uppercase",
                  letterSpacing: tracking.loose * 0.6,
                },
              ]}
            >
              Total
            </Text>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <ShareDot
                color={colors.lime[400]}
                value={attendance.offenseShare}
              />
              <ShareDot
                color={colors.red.semantic}
                value={attendance.defenseShare}
              />
            </View>
          </View>
        </View>
      </View>

      {attendance.streaks.length > 0 ? (
        <>
          <View
            style={{
              height: 1,
              backgroundColor: colors.border.strong,
              marginVertical: 14,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 10,
                  fontWeight: fontWeight.bold,
                  color: colors.text.secondary,
                  textTransform: "uppercase",
                  letterSpacing: tracking.loose,
                },
              ]}
            >
              Streaks
            </Text>
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 10.5, color: colors.text.muted },
              ]}
            >
              Consecutive practices
            </Text>
          </View>
          <View style={{ gap: 8 }}>
            {attendance.streaks.map((s, idx) => (
              <StreakRow
                key={s.player_id}
                initials={s.initials}
                name={s.player_name}
                // Plumb the resolved per-player identity color through —
                // computeAttendance() already mapped color_index to a
                // palette swatch. Without this prop StreakRow falls back
                // to brand orange and every row reads as the same color.
                color={s.color}
                streak={s.streak}
                top={idx === 0}
              />
            ))}
          </View>
        </>
      ) : null}

      {np && np.attendees.length > 0 ? (
        <>
          <View
            style={{
              height: 1,
              backgroundColor: colors.border.strong,
              marginVertical: 14,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 10,
                  fontWeight: fontWeight.bold,
                  color: colors.text.secondary,
                  textTransform: "uppercase",
                  letterSpacing: tracking.loose,
                },
              ]}
            >
              {splitPracticeTime(np.practice_date, np.start_time).day} roll
            </Text>
            <MonoText
              weight="medium"
              style={{ fontSize: 10.5, color: colors.text.muted }}
            >
              {np.attendees.filter((a) => a.rsvp === true).length} IN ·{" "}
              {np.attendees.filter((a) => a.rsvp === null).length} PEND ·{" "}
              {np.attendees.filter((a) => a.rsvp === false).length} OUT
            </MonoText>
          </View>
          {/* TouchableOpacity, not Pressable: Pressable's style-as-function
              silently drops styles in this Expo SDK, which caused the row
              of avatars to fall back to block layout and stack vertically. */}
          <TouchableOpacity
            onPress={onOpenPractice}
            activeOpacity={0.85}
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {[...np.attendees]
              // Push attending players to the front so the IN cluster reads
              // first; pending in the middle; OUT trails. Stable inside each
              // bucket so the underlying order from the server is preserved.
              .sort((a, b) => rsvpRank(a.rsvp) - rsvpRank(b.rsvp))
              .slice(0, 16)
              .map((a) => {
              // Per-player identity color via color_index (migration 45),
              // indexed into the 20-swatch player palette so every player
              // on the team gets a unique hue. Rings are gone entirely;
              // IN / PENDING / OUT differ only by opacity (1 / 0.7 / 0.4)
              // and sort position.
              const fillColor = playerColorForIndex(a.color_index);
              const opacity =
                a.rsvp === true ? 1 : a.rsvp === false ? 0.4 : 0.7;
              return (
                <View
                  key={a.player_id}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: fillColor,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity,
                  }}
                >
                  <Text
                    style={[
                      fontStyle("bold"),
                      {
                        fontSize: 10,
                        fontWeight: fontWeight.bold,
                        color: colors.surface.base,
                      },
                    ]}
                  >
                    {a.initials}
                  </Text>
                </View>
              );
            })}
          </TouchableOpacity>
          {np.attendees.some((a) => a.rsvp === null) ? (
            // Legend dots dropped — rings are gone, so IN/PENDING/OUT now
            // differ only by opacity (1 / 0.7 / 0.4). The count in the
            // eyebrow already gives the exact numbers; the fade gradient
            // along the row tells the rest. Only the action CTA remains.
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                marginTop: 10,
              }}
            >
              <TouchableOpacity
                onPress={onOpenPractice}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel="Nudge pending players"
              >
                <Text
                  style={[
                    fontStyle("medium"),
                    {
                      fontSize: 11,
                      color: colors.orange[500],
                    },
                  ]}
                >
                  Nudge pending →
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : null}
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ACTIVITY feed
// ─────────────────────────────────────────────────────────────────────

function ActivityFeed({
  activity,
  onOpen,
}: {
  activity: Activity[];
  onOpen: (href: string) => void;
}) {
  if (activity.length === 0) {
    return (
      <LockedInsight
        icon="time-outline"
        message="Recent activity will show up here."
      />
    );
  }
  return (
    <CardShell pad={spacing.md}>
      {activity.map((row, i) => (
        <ActivityRow
          // Multi-type benchmark logs insert several rows with an identical
          // created_at, so kind+created_at+title can collide. The feed is
          // render-only, so the array index disambiguates safely.
          key={`${row.kind}-${row.created_at}-${row.title}-${i}`}
          time={relativeDayLabel(row.created_at)}
          icon={activityIcon(row.kind)}
          title={row.title}
          detail={row.detail}
          onPress={() => onOpen(row.href)}
        />
      ))}
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// LockedInsight — empty/sparse state used by several cards
// ─────────────────────────────────────────────────────────────────────

function LockedInsight({
  icon,
  message,
  ctaLabel,
  onPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  message: string;
  ctaLabel?: string;
  onPress?: () => void;
}) {
  return (
    <View
      style={{
        padding: 20,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border.dashed,
        borderStyle: "dashed",
        backgroundColor: "rgba(22,28,36,0.6)",
        alignItems: "center",
      }}
    >
      <Ionicons
        name={icon ?? "lock-closed-outline"}
        size={22}
        color={colors.text.secondary}
        style={{ marginBottom: 8 }}
      />
      <Text
        style={[
          fontStyle("regular"),
          {
            fontSize: 13,
            color: colors.text.secondary,
            textAlign: "center",
            lineHeight: 19,
          },
        ]}
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
            borderRadius: radius.pill,
            backgroundColor: colors.orange.tint,
            borderWidth: 1,
            borderColor: colors.orange.tintBorder,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={[
              fontStyle("semibold"),
              {
                fontSize: 13,
                fontWeight: fontWeight.semibold,
                color: colors.orange[500],
              },
            ]}
          >
            {ctaLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Loading skeleton — rough match for the populated layout silhouette
// ─────────────────────────────────────────────────────────────────────

function PopulatedSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16, gap: 16 }}>
      <SkeletonBlock height={170} />
      <SkeletonBlock height={210} />
      <SkeletonBlock height={220} />
      <SkeletonBlock height={260} />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
// BELOW: Bold Empty Dashboard — UNCHANGED from previous build. Stays up
// until all three onboarding milestones are met.
// ═════════════════════════════════════════════════════════════════════

type OnboardingStepKey = "roster" | "drills" | "practice";

const ONBOARDING_STEPS: {
  key: OnboardingStepKey;
  index: string;
  label: string;
  shortLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
  title: string;
  body: string;
  cta: string;
  eta: string;
}[] = [
  {
    key: "roster",
    index: "01",
    label: "Roster",
    shortLabel: "ROSTER",
    icon: "people-outline",
    href: "/roster/new",
    title: "Bring in your players.",
    body: "Drop in names or import a CSV. The whole flow opens up once your roster is live.",
    cta: "Add players",
    eta: "~2 MIN",
  },
  {
    key: "drills",
    index: "02",
    label: "Drills",
    shortLabel: "DRILLS",
    icon: "football-outline",
    href: "/drills/new",
    title: "Seed your drill library.",
    body: "Add a few drills you already run. Categorise them so the dashboard shows your mix.",
    cta: "Create a drill",
    eta: "~2 MIN",
  },
  {
    key: "practice",
    index: "03",
    label: "Practice",
    shortLabel: "PRACTICE",
    icon: "clipboard-outline",
    href: "/practice/new",
    title: "Plan your first practice.",
    body: "Pick a date, drop in a few drills, and set time blocks. The dashboard fills out once your first plan is saved.",
    cta: "Plan a practice",
    eta: "~3 MIN",
  },
];

function BoldEmptyDashboard({
  teamName,
  teamFormat,
  teamColor,
  coachLabel,
  rosterDone,
  drillsDone,
  practiceDone,
  refreshing,
  onRefresh,
  onNavigate,
  onSettings,
  onEditTeam,
  topInset,
  bottomInset,
}: {
  teamName: string | null;
  teamFormat: string | null;
  teamColor: string | null;
  coachLabel: string | null;
  rosterDone: boolean;
  drillsDone: boolean;
  practiceDone: boolean;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onNavigate: (path: string) => void;
  onSettings: () => void;
  onEditTeam: (() => void) | null;
  topInset: number;
  bottomInset: number;
}) {
  const accent = colors.orange[500];
  const accentSoft = colors.orange.tint;
  const teamHex = teamColor ? teamColorHex(teamColor) : accent;

  const stepDoneMap: Record<OnboardingStepKey, boolean> = {
    roster: rosterDone,
    drills: drillsDone,
    practice: practiceDone,
  };
  const doneCount =
    (rosterDone ? 1 : 0) + (drillsDone ? 1 : 0) + (practiceDone ? 1 : 0);
  const remainCount = 3 - doneCount;
  const onDeck =
    ONBOARDING_STEPS.find((s) => !stepDoneMap[s.key]) ?? ONBOARDING_STEPS[0];
  const etaMinutes = remainCount * 2;
  const router = useRouter();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      contentContainerStyle={{
        paddingTop: topInset + 12,
        paddingBottom: bottomInset + 80,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={accent}
        />
      }
    >
      <View
        style={{
          paddingHorizontal: 18,
          paddingBottom: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.replace("/dashboard")}
          accessibilityRole="button"
          accessibilityLabel="Account home"
          hitSlop={8}
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: "rgba(255,255,255,0.05)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="chevron-back"
            size={16}
            color={colors.text.primary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={onEditTeam ? 0.7 : 1}
          onPress={onEditTeam ?? undefined}
          disabled={!onEditTeam}
          accessibilityRole={onEditTeam ? "button" : undefined}
          accessibilityLabel={onEditTeam ? "Edit team info" : undefined}
          style={{ gap: 2, flex: 1, minWidth: 0 }}
        >
          {coachLabel && (
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 10,
                  fontWeight: fontWeight.bold,
                  color: colors.text.secondary,
                  letterSpacing: tracking.loose,
                  textTransform: "uppercase",
                },
              ]}
              numberOfLines={1}
            >
              {coachLabel}
            </Text>
          )}
          <View
            style={{
              flexDirection: "row",
              alignItems: "baseline",
              gap: 8,
              marginTop: 2,
            }}
          >
            <Text
              numberOfLines={1}
              style={[
                fontStyle("bold"),
                {
                  fontSize: 20,
                  fontWeight: fontWeight.bold,
                  color: colors.text.primary,
                  letterSpacing: tracking.tight,
                },
              ]}
            >
              {teamName ?? "Your team"}
            </Text>
            {teamFormat && (
              <MonoText
                weight="medium"
                style={{
                  fontSize: 11,
                  color: colors.text.secondary,
                  fontWeight: fontWeight.semibold,
                }}
              >
                {teamFormat}
              </MonoText>
            )}
          </View>
        </TouchableOpacity>
        {onEditTeam && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onEditTeam}
            accessibilityRole="button"
            accessibilityLabel="Edit team info"
            hitSlop={8}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.05)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="create-outline"
              size={16}
              color={colors.text.primary}
            />
          </TouchableOpacity>
        )}
        <Pressable
          onPress={onSettings}
          accessibilityLabel="Settings"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: pressed
              ? colors.surface.pressed
              : "rgba(255,255,255,0.05)",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Ionicons
            name="settings-outline"
            size={16}
            color={colors.text.primary}
          />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <ScoreboardCard
          accent={accent}
          accentSoft={accentSoft}
          doneCount={doneCount}
          remainCount={remainCount}
          etaMinutes={etaMinutes}
          stepDoneMap={stepDoneMap}
        />
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <View
            style={{
              width: 3,
              height: 14,
              borderRadius: 2,
              backgroundColor: accent,
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
            Your first play
          </Text>
        </View>
        <FieldDiagram
          accent={accent}
          teamHex={teamHex}
          stepDoneMap={stepDoneMap}
          onDeckKey={onDeck.key}
        />
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
        <View
          style={{
            borderRadius: 18,
            backgroundColor: colors.surface.raised,
            borderWidth: 1,
            borderColor: colors.border.strong,
            borderLeftWidth: 3,
            borderLeftColor: accent,
            padding: 18,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 11,
                  fontWeight: fontWeight.bold,
                  color: accent,
                  letterSpacing: tracking.loose,
                  textTransform: "uppercase",
                },
              ]}
            >
              Step {onDeck.index} · On deck
            </Text>
            <MonoText
              weight="medium"
              style={{
                fontSize: 11,
                color: colors.text.secondary,
                fontWeight: fontWeight.semibold,
              }}
            >
              {onDeck.eta}
            </MonoText>
          </View>
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 22,
                fontWeight: fontWeight.bold,
                color: colors.text.primary,
                letterSpacing: tracking.tight,
                lineHeight: 26,
              },
            ]}
          >
            {onDeck.title}
          </Text>
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 13.5,
                lineHeight: 19,
                color: colors.text.secondary,
                marginTop: 8,
              },
            ]}
          >
            {onDeck.body}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
            <TouchableOpacity
              onPress={() => onNavigate(onDeck.href)}
              accessibilityLabel={onDeck.cta}
              accessibilityRole="button"
              activeOpacity={0.92}
              style={{
                flex: 1,
                height: 50,
                borderRadius: 12,
                backgroundColor: accent,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
                shadowColor: accent,
                shadowOpacity: 0.35,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
              }}
            >
              <Ionicons
                name="play-sharp"
                size={12}
                color={colors.text.primary}
              />
              <Text
                style={[
                  fontStyle("bold"),
                  {
                    fontSize: 15,
                    fontWeight: fontWeight.bold,
                    color: colors.text.primary,
                    letterSpacing: 0.2,
                  },
                ]}
              >
                {onDeck.cta}
              </Text>
            </TouchableOpacity>
            {onDeck.key === "roster" && (
              <TouchableOpacity
                onPress={() => onNavigate("/roster/new")}
                accessibilityLabel="Import CSV"
                accessibilityRole="button"
                activeOpacity={0.85}
                style={{
                  height: 50,
                  paddingHorizontal: 18,
                  borderRadius: 12,
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderWidth: 1,
                  borderColor: colors.border.strong,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 6,
                }}
              >
                <Ionicons
                  name="cloud-upload-outline"
                  size={14}
                  color={colors.text.secondary}
                />
                <Text
                  style={[
                    fontStyle("semibold"),
                    {
                      fontSize: 13,
                      fontWeight: fontWeight.semibold,
                      color: colors.text.primary,
                      letterSpacing: 0.3,
                    },
                  ]}
                >
                  CSV
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 16,
          flexDirection: "row",
          gap: 10,
        }}
      >
        {ONBOARDING_STEPS.filter((s) => s.key !== onDeck.key).map((s) => (
          <StepChip
            key={s.key}
            n={s.index}
            label={s.label}
            icon={s.icon}
            done={stepDoneMap[s.key]}
            onPress={() => onNavigate(s.href)}
          />
        ))}
      </View>

      <View style={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 12 }}>
        <Text
          style={[
            fontStyle("regular"),
            {
              fontSize: 13.5,
              lineHeight: 21,
              color: colors.text.secondary,
              fontStyle: "italic",
            },
          ]}
        >
          {`"Three reps to get the field set. `}
          <Text
            style={[
              fontStyle("regular"),
              { color: colors.text.primary, fontStyle: "italic" },
            ]}
          >
            Your dashboard lights up after benchmark one.
          </Text>
          {`"`}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 8,
          }}
        >
          <View
            style={{
              width: 14,
              height: 1,
              backgroundColor: colors.text.muted,
            }}
          />
          <Text
            style={[
              fontStyle("regular"),
              { fontSize: 11, color: colors.text.muted },
            ]}
          >
            UFF onboarding · Coach playbook
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function ScoreboardCard({
  accent,
  accentSoft,
  doneCount,
  remainCount,
  etaMinutes,
  stepDoneMap,
}: {
  accent: string;
  accentSoft: string;
  doneCount: number;
  remainCount: number;
  etaMinutes: number;
  stepDoneMap: Record<OnboardingStepKey, boolean>;
}) {
  const segments: OnboardingStepKey[] = ["roster", "drills", "practice"];
  let nextTinted = false;
  return (
    <View
      style={{
        borderRadius: 22,
        backgroundColor: colors.surface.raised,
        borderWidth: 1,
        borderColor: "rgba(255,106,26,0.22)",
        padding: 18,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {(["tl", "tr", "bl", "br"] as const).map((c) => (
        <View
          key={c}
          style={{
            position: "absolute",
            width: 5,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: "rgba(255,106,26,0.35)",
            top: c.startsWith("t") ? 8 : undefined,
            bottom: c.startsWith("b") ? 8 : undefined,
            left: c.endsWith("l") ? 8 : undefined,
            right: c.endsWith("r") ? 8 : undefined,
          }}
        />
      ))}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.lime[400],
            }}
          />
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 10,
                fontWeight: fontWeight.bold,
                color: colors.lime[400],
                letterSpacing: tracking.loose,
                textTransform: "uppercase",
              },
            ]}
          >
            Setup in progress
          </Text>
        </View>
        <MonoText
          weight="medium"
          style={{
            fontSize: 10.5,
            color: colors.text.secondary,
            letterSpacing: 1.2,
          }}
        >
          SE / 01 · DAY 01
        </MonoText>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <ScoreColumn
          label="DONE"
          value={String(doneCount)}
          sub="of 3"
          color={colors.text.primary}
        />
        <View
          style={{
            width: 1,
            height: 80,
            backgroundColor: "rgba(255,106,26,0.18)",
          }}
        />
        <ScoreColumn
          label="REMAIN"
          value={String(remainCount)}
          sub={remainCount === 1 ? "step" : "steps"}
          color={accent}
        />
        <View
          style={{
            width: 1,
            height: 80,
            backgroundColor: "rgba(255,106,26,0.18)",
          }}
        />
        <ScoreColumn
          label="ETA"
          value={String(etaMinutes)}
          sub={etaMinutes === 1 ? "min" : "min"}
          color={colors.text.secondary}
        />
      </View>

      <View style={{ marginTop: 18 }}>
        <View style={{ flexDirection: "row", gap: 4, height: 6 }}>
          {segments.map((key) => {
            const done = stepDoneMap[key];
            let bg: string;
            if (done) bg = accent;
            else if (!nextTinted) {
              bg = accentSoft;
              nextTinted = true;
            } else bg = colors.border.strong;
            return (
              <View
                key={key}
                style={{ flex: 1, borderRadius: 3, backgroundColor: bg }}
              />
            );
          })}
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 8,
          }}
        >
          {ONBOARDING_STEPS.map((s) => (
            <Text
              key={s.key}
              style={[
                fontStyle("medium"),
                {
                  fontSize: 10.5,
                  color: stepDoneMap[s.key]
                    ? colors.lime[400]
                    : colors.text.muted,
                  letterSpacing: 0.6,
                },
              ]}
            >
              {s.shortLabel}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function ScoreColumn({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <View style={{ alignItems: "center", gap: 4, flex: 1 }}>
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 9.5,
            fontWeight: fontWeight.bold,
            color: colors.text.secondary,
            letterSpacing: tracking.loose,
            textTransform: "uppercase",
          },
        ]}
      >
        {label}
      </Text>
      <MonoText
        weight="bold"
        style={{
          fontSize: 58,
          fontWeight: fontWeight.bold,
          lineHeight: 58,
          letterSpacing: -2.3,
          color,
        }}
      >
        {value}
      </MonoText>
      <MonoText
        weight="medium"
        style={{
          fontSize: 10,
          color: colors.text.muted,
          letterSpacing: 0.8,
        }}
      >
        {sub}
      </MonoText>
    </View>
  );
}

function FieldDiagram({
  accent,
  teamHex,
  stepDoneMap,
  onDeckKey,
}: {
  accent: string;
  teamHex: string;
  stepDoneMap: Record<OnboardingStepKey, boolean>;
  onDeckKey: OnboardingStepKey;
}) {
  const tokenState = (key: OnboardingStepKey) =>
    stepDoneMap[key] ? "done" : key === onDeckKey ? "active" : "muted";
  const routeColor = (a: OnboardingStepKey, b: OnboardingStepKey) => {
    if (stepDoneMap[a] && stepDoneMap[b]) return colors.lime[400];
    if (stepDoneMap[a] || a === onDeckKey || b === onDeckKey) return accent;
    return "rgba(244,244,242,0.18)";
  };
  return (
    <View
      style={{
        borderRadius: 18,
        backgroundColor: colors.surface.raised,
        borderWidth: 1,
        borderColor: colors.border.subtle,
        padding: 18,
      }}
    >
      <Svg viewBox="0 0 360 180" width="100%" height={180}>
        <Defs>
          <SvgLinearGradient id="endLeft" x1="0" x2="1">
            <Stop offset="0" stopColor={accent} stopOpacity="0.16" />
            <Stop offset="1" stopColor={accent} stopOpacity="0" />
          </SvgLinearGradient>
          <SvgLinearGradient id="endRight" x1="1" x2="0">
            <Stop offset="0" stopColor={teamHex} stopOpacity="0.10" />
            <Stop offset="1" stopColor={teamHex} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>

        <Rect x="0" y="0" width="48" height="180" fill="url(#endLeft)" />
        <Rect x="312" y="0" width="48" height="180" fill="url(#endRight)" />

        <Line
          x1="0"
          y1="6"
          x2="360"
          y2="6"
          stroke="rgba(244,244,242,0.18)"
          strokeWidth="1"
        />
        <Line
          x1="0"
          y1="174"
          x2="360"
          y2="174"
          stroke="rgba(244,244,242,0.18)"
          strokeWidth="1"
        />

        {[48, 96, 144, 192, 240, 288, 312].map((x, i) => (
          <G key={x}>
            <Line
              x1={x}
              y1="10"
              x2={x}
              y2="170"
              stroke="rgba(244,244,242,0.10)"
              strokeWidth="1"
            />
            <SvgText
              x={x}
              y="170"
              textAnchor="middle"
              fontSize="8"
              fill="rgba(244,244,242,0.22)"
              fontWeight="600"
            >
              {[10, 20, 30, "50", 30, 20, 10][i]}
            </SvgText>
          </G>
        ))}

        {Array.from({ length: 14 }).map((_, i) => {
          const x = 24 + i * 24;
          return (
            <G key={`h-${i}`}>
              <Line
                x1={x}
                y1="60"
                x2={x}
                y2="66"
                stroke="rgba(244,244,242,0.18)"
                strokeWidth="1"
              />
              <Line
                x1={x}
                y1="114"
                x2={x}
                y2="120"
                stroke="rgba(244,244,242,0.18)"
                strokeWidth="1"
              />
            </G>
          );
        })}

        <Path
          d="M 88 90 L 164 90"
          stroke={routeColor("roster", "drills")}
          strokeWidth="1.4"
          strokeDasharray="2 4"
          opacity={stepDoneMap.roster && stepDoneMap.drills ? 0.85 : 0.55}
          fill="none"
        />
        <Path
          d="M 196 90 L 272 90"
          stroke={routeColor("drills", "practice")}
          strokeWidth="1.4"
          strokeDasharray="2 4"
          opacity={stepDoneMap.drills && stepDoneMap.practice ? 0.85 : 0.55}
          fill="none"
        />

        <StepToken
          cx={72}
          cy={90}
          n="1"
          label="ROSTER"
          color={accent}
          state={tokenState("roster")}
        />
        <StepToken
          cx={180}
          cy={90}
          n="2"
          label="DRILLS"
          color={accent}
          state={tokenState("drills")}
        />
        <StepToken
          cx={288}
          cy={90}
          n="3"
          label="PRACTICE"
          color={accent}
          state={tokenState("practice")}
        />
      </Svg>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: accent,
            }}
          />
          <Text
            style={[
              fontStyle("regular"),
              { fontSize: 11, color: colors.text.secondary },
            ]}
          >
            On deck ·{" "}
            <MonoText
              weight="medium"
              style={{
                fontSize: 11,
                color: colors.text.primary,
                fontWeight: fontWeight.semibold,
              }}
            >
              {ONBOARDING_STEPS.find((s) => s.key === onDeckKey)?.index ?? "01"}
            </MonoText>
          </Text>
        </View>
        <Text
          style={[
            fontStyle("regular"),
            { fontSize: 11, color: colors.text.muted },
          ]}
        >
          Tap any position to jump in
        </Text>
      </View>
    </View>
  );
}

function StepToken({
  cx,
  cy,
  n,
  label,
  color,
  state,
}: {
  cx: number;
  cy: number;
  n: string;
  label: string;
  color: string;
  state: "active" | "done" | "muted";
}) {
  const lime = colors.lime[400];
  const fill =
    state === "done"
      ? lime
      : state === "active"
      ? color
      : "rgba(244,244,242,0.06)";
  const textFill =
    state === "done" || state === "active"
      ? colors.surface.base
      : "rgba(244,244,242,0.4)";
  const stroke =
    state === "done"
      ? lime
      : state === "active"
      ? color
      : "rgba(244,244,242,0.18)";
  const labelFill =
    state === "done"
      ? lime
      : state === "active"
      ? color
      : "rgba(244,244,242,0.45)";
  return (
    <G>
      {(state === "active" || state === "done") && (
        <Circle
          cx={cx}
          cy={cy}
          r="22"
          fill={state === "done" ? lime : color}
          opacity="0.15"
        />
      )}
      <Circle
        cx={cx}
        cy={cy}
        r="16"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.5"
      />
      {state === "done" ? (
        <SvgText
          x={cx}
          y={cy + 5}
          textAnchor="middle"
          fontSize="16"
          fontWeight="700"
          fill={textFill}
        >
          ✓
        </SvgText>
      ) : (
        <SvgText
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill={textFill}
        >
          {n}
        </SvgText>
      )}
      <SvgText
        x={cx}
        y={cy + 36}
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill={labelFill}
      >
        {label}
      </SvgText>
    </G>
  );
}

function StepChip({
  n,
  label,
  icon,
  done,
  onPress,
}: {
  n: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  done: boolean;
  onPress: () => void;
}) {
  const lime = colors.lime[400];
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={done ? `${label} done — open` : `${label} locked`}
      activeOpacity={0.85}
      style={{
        flex: 1,
        minHeight: 64,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: done ? lime : "rgba(244,244,242,0.15)",
        borderStyle: done ? "solid" : "dashed",
        backgroundColor: done ? colors.lime.tint : colors.surface.raised,
        paddingVertical: 12,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          backgroundColor: done ? lime : "rgba(255,255,255,0.06)",
          borderWidth: done ? 0 : 1,
          borderColor: "rgba(255,255,255,0.05)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={done ? "checkmark" : icon}
          size={16}
          color={done ? colors.surface.base : colors.text.secondary}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <MonoText
          weight="bold"
          style={{
            fontSize: 10,
            color: done ? lime : colors.text.muted,
            fontWeight: fontWeight.bold,
            letterSpacing: 1.2,
          }}
        >
          STEP {n}
        </MonoText>
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 14,
              fontWeight: fontWeight.bold,
              color: colors.text.primary,
              letterSpacing: -0.1,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <Ionicons
        name={done ? "chevron-forward" : "lock-closed"}
        size={14}
        color={done ? lime : colors.text.muted}
      />
    </TouchableOpacity>
  );
}
