import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { colors, fontFamily, radius, spacing } from "../../constants/design";
import { supabase } from "../../lib/supabase";

export default function BenchmarkCompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    drill?: string;
    players?: string;
    sets?: string;
    // legacy
    count?: string;
  }>();
  const drillId = params.drill ?? null;
  const playersRaw = Number(params.players ?? params.count ?? "0");
  const playerCount =
    Number.isFinite(playersRaw) && playersRaw > 0 ? Math.floor(playersRaw) : 0;
  const setsRaw = Number(params.sets ?? "0");
  const setsPerPlayer =
    Number.isFinite(setsRaw) && setsRaw > 0 ? Math.floor(setsRaw) : 0;

  const [drillName, setDrillName] = useState<string>("the drill");

  useEffect(() => {
    let cancelled = false;
    if (!drillId) return;
    (async () => {
      const { data } = await supabase
        .from("team_drills")
        .select("drill_name")
        .eq("id", drillId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.drill_name) setDrillName(data.drill_name as string);
    })();
    return () => {
      cancelled = true;
    };
  }, [drillId]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface.base,
        paddingTop: insets.top + spacing["3xl"],
        paddingBottom: insets.bottom + spacing.xl,
        paddingHorizontal: spacing.xl,
      }}
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: colors.green.tint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="checkmark-circle"
            size={56}
            color={colors.green[400]}
          />
        </View>

        <Text
          style={{
            fontSize: 24,
            lineHeight: 30,
            fontWeight: "500",
            color: colors.text.primary,
            textAlign: "center",
            marginTop: spacing["2xl"],
          }}
        >
          Assessment Complete
        </Text>

        <Text
          style={{
            fontSize: 15,
            lineHeight: 22,
            color: colors.text.secondary,
            textAlign: "center",
            marginTop: spacing.md,
            maxWidth: 280,
          }}
        >
          Logged{" "}
          {playerCount} {playerCount === 1 ? "player" : "players"}
          {setsPerPlayer > 0
            ? ` × ${setsPerPlayer} ${setsPerPlayer === 1 ? "set" : "sets"}`
            : ""}{" "}
          on {drillName}.
        </Text>

        {setsPerPlayer > 0 && playerCount > 0 ? (
          <View
            style={{
              marginTop: spacing.xl,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              borderRadius: radius.lg,
              backgroundColor: colors.surface.raised,
              borderWidth: 1,
              borderColor: colors.border.card,
            }}
          >
            <Text
              style={{
                fontFamily: fontFamily.monoBold,
                fontSize: 18,
                color: colors.text.primary,
                textAlign: "center",
              }}
            >
              {playerCount * setsPerPlayer}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.sansBold,
                fontSize: 10,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: colors.text.subtle,
                textAlign: "center",
                marginTop: 2,
              }}
            >
              sets captured
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ gap: spacing.md }}>
        <Button
          label="Run Another Assessment"
          onPress={() => router.replace("/benchmarks" as never)}
        />
        <Button
          label="Back to Dashboard"
          onPress={() => router.replace("/(tabs)" as never)}
          variant="secondary"
        />
      </View>
    </View>
  );
}
