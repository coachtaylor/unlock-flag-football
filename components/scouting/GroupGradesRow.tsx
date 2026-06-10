// Shared per-skill-group grade chips (Build 18). Extracted from the scouting
// detail's inline block so the roster Player Card and the scouting screen render
// the same chips — one source of truth (DRY). Each chip = a GradeBadge + the
// skill-area label; the letter is always shown so the row stays colorblind-safe.
import { Text, View } from "react-native";
import { GradeBadge } from "./GradeBadge";
import type { GroupScore } from "../../lib/scouting/player-grade";
import { colors, radius, spacing } from "../../constants/design";
import { fontStyle } from "../../constants/typography";

export function GroupGradesRow({
  groups,
  measuredOnly = false,
}: {
  groups: GroupScore[];
  // Player Card hero shows only measured groups; the scouting screen shows all
  // (unmeasured render as a "—" badge).
  measuredOnly?: boolean;
}) {
  const shown = measuredOnly ? groups.filter((g) => g.score != null) : groups;
  if (!shown.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {shown.map((g) => (
        <View
          key={g.group}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: spacing.md,
            paddingVertical: 8,
            borderRadius: radius.md,
            backgroundColor: colors.surface.overlay,
          }}
        >
          <GradeBadge grade={g.grade} size="sm" />
          <Text style={[fontStyle("medium"), { fontSize: 12.5, color: colors.text.secondary }]}>
            {g.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
