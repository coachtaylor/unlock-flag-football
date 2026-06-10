import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../../constants/design";
import { fontStyle } from "../../constants/typography";

// Dashboard entry into the Team Scouting Report (Build 17). Deliberately NOT a
// numbered "move" / to-do: scouting is a persistent intelligence surface you
// consult, not a weekly chore that gets ticked off. So this is a plain
// jump-in card — icon + label + chevron, full-card tappable — distinct from the
// MoveCard to-do styling (no index token, no done/strike-through state).
export function ScoutingEntryCard({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 14,
        backgroundColor: colors.surface.raised,
        borderWidth: 1,
        borderColor: colors.border.card,
        borderRadius: radius.xl,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: colors.orange.tint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="stats-chart" size={19} color={colors.orange[400]} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[fontStyle("semibold"), { fontSize: 15, color: colors.text.primary }]}>
          View scouting report
        </Text>
        <Text
          style={[
            fontStyle("regular"),
            { fontSize: 12, lineHeight: 16, color: colors.text.muted },
          ]}
        >
          Team strengths, gaps & player grades.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
    </TouchableOpacity>
  );
}
