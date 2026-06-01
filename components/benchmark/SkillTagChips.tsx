import { Text, TouchableOpacity, View } from "react-native";
import { colors, fontFamily, radius, spacing } from "../../constants/design";
import { skillGroupMeta } from "../../constants/skill-groups";
import { FALLBACK_SKILL_TAGS, type SkillTagGroup } from "../../lib/skills";

// Toggle chip for a skill tag. Selected = orange (the app's universal
// "selected tag" treatment — tags are never color-coded by skill group; the
// group's hue lives on the header dot only).
function TagChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: radius.pill,
        backgroundColor: selected ? colors.orange.tint : colors.surface.raised,
        borderWidth: 1,
        borderColor: selected ? colors.orange.tintBorder : colors.border.card,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontFamily: fontFamily.sansSemibold,
          color: selected ? colors.orange[400] : colors.text.secondary,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function MicroLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 10,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: colors.text.subtle,
        fontFamily: fontFamily.sansBold,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * The skill-tag chip block shared by the benchmark log and the mid-practice
 * quick-rate sheet. Renders one labelled group per skill (primary skills
 * first, marked with a star), or a single generic "Quick tags" group when the
 * drill has no skills wired up. `selected` holds the chosen tag LABELS (what
 * benchmark_results.tags[] stores); `onToggle` flips one label.
 */
export function SkillTagChips({
  groups,
  selected,
  onToggle,
}: {
  groups: SkillTagGroup[];
  selected: Set<string>;
  onToggle: (label: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <View style={{ gap: spacing.xs }}>
        <MicroLabel>Quick tags</MicroLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {FALLBACK_SKILL_TAGS.map((label) => (
            <TagChip
              key={label}
              label={label}
              selected={selected.has(label)}
              onPress={() => onToggle(label)}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {groups.map((group) => {
        const meta = skillGroupMeta(group.skillGroup);
        const isPrimary = group.weight === 1.0;
        return (
          <View key={group.skillId} style={{ gap: spacing.xs }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: meta.color,
                  opacity: isPrimary ? 1 : 0.5,
                }}
              />
              <MicroLabel>{group.skillName}</MicroLabel>
              {isPrimary && (
                <Text
                  style={{
                    fontSize: 10,
                    letterSpacing: 0.5,
                    color: meta.color,
                    fontFamily: fontFamily.sansBold,
                  }}
                >
                  ★ PRIMARY
                </Text>
              )}
            </View>
            <View
              style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
            >
              {group.tags.map((t) => (
                <TagChip
                  key={t.id}
                  label={t.label}
                  selected={selected.has(t.label)}
                  onPress={() => onToggle(t.label)}
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
