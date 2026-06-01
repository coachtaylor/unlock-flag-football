import { useCallback, useState } from "react";
import { Text, TouchableOpacity, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, radius, spacing } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";
import { countNeedsReview } from "../../lib/benchmarks";

// Shared entry point to the needs-review queue (Build 14f). Self-loads the
// flagged count for the team and refreshes on focus; renders NOTHING when the
// count is 0 so it never shows an empty nag. Dropped into both the dashboard
// and the benchmarks hub so the two stay identical (one source of truth).
export function NeedsReviewLink({
  teamId,
  style,
}: {
  teamId: string | null;
  style?: ViewStyle;
}) {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!teamId) {
        setCount(0);
        return;
      }
      countNeedsReview(teamId).then((n) => {
        if (!cancelled) setCount(n);
      });
      return () => {
        cancelled = true;
      };
    }, [teamId])
  );

  if (count <= 0) return null;

  return (
    <TouchableOpacity
      onPress={() => router.push("/benchmarks/review" as never)}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: 14,
        borderRadius: radius.xl,
        backgroundColor: colors.orange.tint,
        borderWidth: 1,
        borderColor: colors.orange.tintBorder,
        ...style,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: colors.orange[500],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="flag" size={16} color={colors.text.onBrand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            fontStyle("bold"),
            { fontSize: 14, color: colors.text.primary },
          ]}
        >
          Needs review
        </Text>
        <Text
          style={[
            fontStyle("regular"),
            { fontSize: 12, color: colors.text.secondary, marginTop: 1 },
          ]}
        >
          {count} flagged assessment{count === 1 ? "" : "s"} to revisit
        </Text>
      </View>
      <MonoText weight="bold" style={{ fontSize: 18, color: colors.orange[400] }}>
        {count}
      </MonoText>
      <Ionicons name="chevron-forward" size={16} color={colors.orange[400]} />
    </TouchableOpacity>
  );
}
