// Relative-standing line for the player card (Build 18). Renders a
// RelativeStanding (from the shared grader) as a single quiet row: a tier-tinted
// dot + the plain-language line ("Bottom of the Receivers") + the rank detail
// ("5th of 5 assessed"). One source so any surface showing standing reads the
// same. Tier color is a sense-of-place signal, NOT a grade — it deliberately
// does not reuse the heat scale.
import { Text, View } from "react-native";
import type { RelativeStanding } from "../../lib/scouting/player-grade";
import { colors, radius, spacing } from "../../constants/design";
import { fontStyle, monoStyle } from "../../constants/typography";

const TIER_COLOR: Record<RelativeStanding["tier"], string> = {
  top: colors.lime[400],
  upper: colors.green[400],
  middle: colors.text.secondary,
  lower: colors.amber[400],
  bottom: colors.red.semantic,
};

export function RelativeStandingLine({ standing }: { standing: RelativeStanding }) {
  const dot = TIER_COLOR[standing.tier];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        paddingVertical: 9,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surface.overlay,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
      <Text style={[fontStyle("medium"), { fontSize: 13, color: colors.text.primary }]}>
        {standing.line}
      </Text>
      <Text
        style={[
          monoStyle("medium"),
          { fontSize: 11.5, color: colors.text.muted, marginLeft: "auto" },
        ]}
      >
        {standing.detail}
      </Text>
    </View>
  );
}
