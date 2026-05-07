import { useCallback, useEffect, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../../components/ui/Button";
import { colors, radius, spacing } from "../../../constants/design";
import { supabase } from "../../../lib/supabase";
import { useTeam } from "../../../lib/team-context";

type PlanStatus = "draft" | "finalized" | "completed";

type Plan = {
  id: string;
  practiceDate: string;
  title: string | null;
  status: PlanStatus;
  drillCount: number;
  totalDuration: number;
};

function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function formatLongDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
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
        height: 88,
        borderRadius: radius.lg,
        backgroundColor: colors.surface.raised,
        opacity,
      }}
    />
  );
}

function StatusBadge({ status }: { status: PlanStatus }) {
  if (status === "draft") {
    return (
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: radius.pill,
          backgroundColor: colors.surface.muted,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: colors.border.strong,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: "500",
            color: colors.text.muted,
            letterSpacing: 0.3,
          }}
        >
          Draft
        </Text>
      </View>
    );
  }
  if (status === "finalized") {
    return (
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: radius.pill,
          backgroundColor: colors.green[800],
          borderWidth: 1,
          borderColor: colors.green[600],
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: "500",
            color: colors.green[400],
            letterSpacing: 0.3,
          }}
        >
          Finalized
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: colors.surface.muted,
        borderWidth: 1,
        borderColor: colors.border.subtle,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "500",
          color: colors.text.muted,
          letterSpacing: 0.3,
        }}
      >
        Completed
      </Text>
    </View>
  );
}

function PlanCard({ plan, onPress }: { plan: Plan; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center"
      style={({ pressed }) => ({
        backgroundColor: colors.surface.raised,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border.card,
        borderLeftWidth: 3,
        borderLeftColor: colors.orange[500],
        padding: spacing.lg,
        minHeight: 44,
        gap: spacing.md,
        opacity:
          plan.status === "completed"
            ? pressed
              ? 0.55
              : 0.7
            : pressed
            ? 0.85
            : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          className="flex-row items-start justify-between"
          style={{ gap: spacing.sm }}
        >
          <Text
            style={{
              flex: 1,
              fontSize: 17,
              lineHeight: 24,
              fontWeight: "500",
              color: colors.text.primary,
            }}
            numberOfLines={1}
          >
            {formatLongDate(plan.practiceDate)}
          </Text>
          <StatusBadge status={plan.status} />
        </View>
        {plan.title ? (
          <Text
            style={{
              fontSize: 13,
              lineHeight: 18,
              color: colors.text.secondary,
              marginTop: spacing.xs,
            }}
            numberOfLines={1}
          >
            {plan.title}
          </Text>
        ) : null}
        <View
          className="flex-row items-center"
          style={{ gap: spacing.md, marginTop: spacing.sm }}
        >
          <Text
            style={{
              fontSize: 13,
              color: colors.text.secondary,
            }}
          >
            {plan.drillCount} {plan.drillCount === 1 ? "drill" : "drills"}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.text.secondary,
              fontVariant: ["tabular-nums"],
            }}
          >
            {plan.totalDuration} min
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
    </Pressable>
  );
}

export default function PracticeListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);

  const load = useCallback(async () => {
    if (!teamId) return;
    const { data } = await supabase
      .from("practice_plans")
      .select(
        "id, practice_date, title, status, practice_plan_drills(id, duration_minutes)"
      )
      .eq("team_id", teamId)
      .order("practice_date", { ascending: false });

    type Row = {
      id: string;
      practice_date: string;
      title: string | null;
      status: PlanStatus;
      practice_plan_drills:
        | { id: string; duration_minutes: number | null }[]
        | null;
    };

    setPlans(
      ((data ?? []) as Row[]).map((p) => {
        const drills = p.practice_plan_drills ?? [];
        return {
          id: p.id,
          practiceDate: p.practice_date,
          title: p.title,
          status: p.status,
          drillCount: drills.length,
          totalDuration: drills.reduce(
            (sum, d) => sum + (d.duration_minutes ?? 0),
            0
          ),
        };
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
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const goToPlan = (id: string) => {
    lightHaptic();
    router.push(`/practice/${id}` as never);
  };

  const goToNew = () => {
    lightHaptic();
    router.push("/practice/new" as never);
  };

  const headerPaddingTop = insets.top + spacing.lg;

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          paddingHorizontal: spacing.xl,
          paddingTop: headerPaddingTop,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            lineHeight: 28,
            fontWeight: "500",
            color: colors.text.primary,
          }}
        >
          Practice
        </Text>
        <View style={{ marginTop: spacing["2xl"], gap: spacing.sm }}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      </View>
    );
  }

  if (plans.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          paddingHorizontal: spacing.xl,
          paddingTop: headerPaddingTop,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            lineHeight: 28,
            fontWeight: "500",
            color: colors.text.primary,
          }}
        >
          Practice
        </Text>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.lg,
            paddingBottom: 80,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.surface.muted,
              borderWidth: 1,
              borderColor: colors.border.subtle,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="calendar-outline"
              size={28}
              color={colors.text.muted}
            />
          </View>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: colors.text.secondary,
              textAlign: "center",
              maxWidth: 280,
            }}
          >
            No practice plans yet. Plan your first practice to keep the team on
            track.
          </Text>
          <Button label="Plan a Practice" onPress={goToNew} fullWidth={false} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <View
        style={{
          paddingTop: headerPaddingTop,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            lineHeight: 28,
            fontWeight: "500",
            color: colors.text.primary,
          }}
        >
          Practice
        </Text>
      </View>

      <FlatList
        data={plans}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PlanCard plan={item} onPress={() => goToPlan(item.id)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.sm,
          paddingBottom: spacing["3xl"] + 72,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.orange[500]}
          />
        }
      />

      <Pressable
        onPress={goToNew}
        accessibilityLabel="Plan a practice"
        style={{
          position: "absolute",
          right: spacing.xl,
          bottom: 60 + insets.bottom + spacing.lg,
          width: 56,
          height: 56,
        }}
      >
        {({ pressed }) => (
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.orange[500],
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35,
              shadowRadius: 10,
              elevation: 8,
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            }}
          >
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </View>
        )}
      </Pressable>
    </View>
  );
}
