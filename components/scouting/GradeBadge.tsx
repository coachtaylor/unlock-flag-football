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
  // "lg" = the player-card hero's overall badge (Build 18) — bigger and solid-
  // filled so the headline grade reads as the first thing on the card.
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "sm" ? 24 : size === "lg" ? 54 : 32;
  const font = size === "sm" ? 12 : size === "lg" ? 27 : 15;
  const rad = size === "lg" ? radius.md : radius.sm;

  if (grade == null) {
    return (
      <View
        style={{
          width: box,
          height: box,
          borderRadius: rad,
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
  const solid = size === "lg";
  return (
    <View
      style={{
        width: box,
        height: box,
        borderRadius: rad,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: solid ? hex : `${hex}26`, // solid for hero, ~15% tint otherwise
        borderWidth: solid ? 0 : 1,
        borderColor: `${hex}66`,
      }}
    >
      <Text
        style={[monoStyle("bold"), { fontSize: font, color: solid ? colors.text.onBrand : hex }]}
      >
        {grade}
      </Text>
    </View>
  );
}
