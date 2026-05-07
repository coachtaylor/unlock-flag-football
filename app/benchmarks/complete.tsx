import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { colors, spacing } from "../../constants/design";
import { supabase } from "../../lib/supabase";

export default function BenchmarkCompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ drill?: string; count?: string }>();
  const drillId = params.drill ?? null;
  const rawCount = Number(params.count ?? "0");
  const count = Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 0;

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
          Logged results for {count} {count === 1 ? "player" : "players"} on{" "}
          {drillName}.
        </Text>
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
