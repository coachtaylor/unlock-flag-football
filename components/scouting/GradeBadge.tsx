// Letter-grade badge for the scouting surfaces. The letter is ALWAYS shown —
// color only reinforces — so the badge stays colorblind-safe (mirrors web's
// heat-cell rule). Color comes from the canonical heat scale, never a literal.
import { Text, View } from "react-native";
import { gradeColor, type Grade } from "../../lib/dashboard/heat-scale";
import { colors, radius } from "../../constants/design";
import { monoStyle } from "../../constants/typography";

export function GradeBadge({
  grade,
  size = "md",
}: {
  grade: Grade | null;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? 24 : 32;
  const font = size === "sm" ? 12 : 15;

  if (grade == null) {
    return (
      <View
        style={{
          width: box,
          height: box,
          borderRadius: radius.sm,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface.muted,
          borderWidth: 1,
          borderColor: colors.border.default,
        }}
      >
        <Text style={[monoStyle("bold"), { fontSize: font, color: colors.text.muted }]}>
          —
        </Text>
      </View>
    );
  }

  const hex = gradeColor(grade); // 6-digit hex from the heat scale
  return (
    <View
      style={{
        width: box,
        height: box,
        borderRadius: radius.sm,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: `${hex}26`, // ~15% tint
        borderWidth: 1,
        borderColor: `${hex}66`,
      }}
    >
      <Text style={[monoStyle("bold"), { fontSize: font, color: hex }]}>{grade}</Text>
    </View>
  );
}
