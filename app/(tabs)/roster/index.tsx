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

type Player = {
  id: string;
  name: string;
  positions: string[];
  jerseyNumber: string | null;
  status: "active" | "inactive";
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
        backgroundColor: colors.surface.raised,
        opacity,
      }}
    />
  );
}

function PositionPill({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: "rgba(255,255,255,0.04)",
      }}
    >
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function PlayerRow({
  player,
  onPress,
  inactive,
}: {
  player: Player;
  onPress: () => void;
  inactive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center"
      style={({ pressed }) => ({
        backgroundColor: colors.surface.raised,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        padding: spacing.lg,
        minHeight: 44,
        gap: spacing.md,
        opacity: inactive ? (pressed ? 0.5 : 0.6) : pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 15,
            lineHeight: 22,
            fontWeight: "500",
            color: colors.text.primary,
          }}
        >
          {player.name}
        </Text>
        {player.positions.length > 0 ? (
          <View
            className="flex-row flex-wrap items-center"
            style={{ gap: spacing.xs, marginTop: spacing.xs }}
          >
            {player.positions.map((p) => (
              <PositionPill key={p} label={p} />
            ))}
          </View>
        ) : null}
      </View>
      {player.jerseyNumber ? (
        <Text
          style={{
            fontSize: 13,
            color: colors.text.secondary,
            fontVariant: ["tabular-nums"],
          }}
        >
          #{player.jerseyNumber}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
    </Pressable>
  );
}

export default function RosterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);

  const load = useCallback(async () => {
    if (!teamId) return;
    const { data } = await supabase
      .from("team_players")
      .select("id, player_name, positions, jersey_number, status")
      .eq("team_id", teamId)
      .order("player_name", { ascending: true });

    setPlayers(
      (data ?? []).map((p) => ({
        id: p.id as string,
        name: p.player_name as string,
        positions: (p.positions as string[] | null) ?? [],
        jerseyNumber: (p.jersey_number as string | null) ?? null,
        status: p.status as "active" | "inactive",
      }))
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

  const goToPlayer = (id: string) => {
    lightHaptic();
    router.push(`/roster/${id}` as never);
  };

  const goToNew = () => {
    lightHaptic();
    router.push("/roster/new" as never);
  };

  const headerPaddingTop = insets.top + spacing.lg;

  const active = players.filter((p) => p.status === "active");
  const inactive = players.filter((p) => p.status === "inactive");

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
          Roster
        </Text>
        <View style={{ marginTop: spacing["2xl"], gap: spacing.sm }}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      </View>
    );
  }

  if (players.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          paddingHorizontal: spacing.xl,
          paddingTop: headerPaddingTop,
        }}
      >
        <View
          className="flex-row items-center justify-between"
          style={{ marginBottom: spacing.xl }}
        >
          <Text
            style={{
              fontSize: 20,
              lineHeight: 28,
              fontWeight: "500",
              color: colors.text.primary,
            }}
          >
            Roster
          </Text>
        </View>
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
              backgroundColor: "rgba(255,255,255,0.03)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="people-outline"
              size={28}
              color="rgba(255,255,255,0.30)"
            />
          </View>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: colors.text.secondary,
              textAlign: "center",
              maxWidth: 260,
            }}
          >
            No players yet. Add your first player to get started.
          </Text>
          <Button label="Add Player" onPress={goToNew} fullWidth={false} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <View
        className="flex-row items-center justify-between"
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
          Roster
        </Text>
        <Pressable
          onPress={goToNew}
          accessibilityLabel="Add player"
          hitSlop={10}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: pressed
              ? "rgba(212,138,48,0.20)"
              : "rgba(212,138,48,0.12)",
            borderWidth: 1,
            borderColor: "rgba(212,138,48,0.30)",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Ionicons name="add" size={20} color={colors.orange[500]} />
        </Pressable>
      </View>

      <FlatList
        data={[]}
        keyExtractor={() => "noop"}
        renderItem={null as never}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing["3xl"] + 72,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.orange[500]}
          />
        }
        ListHeaderComponent={
          <View>
            <Text
              style={{
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: colors.text.secondary,
                fontWeight: "500",
                marginBottom: spacing.md,
              }}
            >
              Active ({active.length})
            </Text>
            <View style={{ gap: spacing.sm }}>
              {active.map((p) => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  onPress={() => goToPlayer(p.id)}
                />
              ))}
            </View>

            {inactive.length > 0 ? (
              <View style={{ marginTop: spacing["2xl"] }}>
                <Text
                  style={{
                    fontSize: 11,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    color: colors.text.secondary,
                    fontWeight: "500",
                    marginBottom: spacing.md,
                  }}
                >
                  Inactive ({inactive.length})
                </Text>
                <View style={{ gap: spacing.sm }}>
                  {inactive.map((p) => (
                    <PlayerRow
                      key={p.id}
                      player={p}
                      onPress={() => goToPlayer(p.id)}
                      inactive
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        }
      />
    </View>
  );
}
