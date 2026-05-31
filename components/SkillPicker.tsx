import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../constants/design";
import { fontStyle, monoStyle } from "../constants/typography";
import { SKILL_GROUP_META, skillGroupMeta } from "../constants/skill-groups";
import type { DrillSkillWeight, Skill, SkillGroup } from "../lib/skills";

// Skill picker — mirrors unlock-web SkillPicker. Each chip cycles through
// three states on tap: off → secondary (0.5) → primary (1.0) → off. The
// value is a Map<skillId, weight>; absence from the map = off. Chips are
// grouped by skill_group, colored by the group palette.

type Props = {
  skills: Skill[];
  value: Map<string, DrillSkillWeight>;
  onChange: (next: Map<string, DrillSkillWeight>) => void;
  // When provided, only these skill groups render (in canonical order). Used
  // by the DrillForm to scope the picker to the drill's chosen phase.
  groups?: SkillGroup[];
};

export function SkillPicker({ skills, value, onChange, groups }: Props) {
  const groupFilter = groups ? new Set(groups) : null;
  const cycle = (skillId: string) => {
    const next = new Map(value);
    const current = next.get(skillId);
    if (current === undefined) {
      next.set(skillId, 0.5); // off → secondary
    } else if (current === 0.5) {
      next.set(skillId, 1.0); // secondary → primary
    } else {
      next.delete(skillId); // primary → off
    }
    onChange(next);
  };

  let primaryCount = 0;
  let secondaryCount = 0;
  for (const w of value.values()) {
    if (w === 1.0) primaryCount += 1;
    else secondaryCount += 1;
  }

  if (skills.length === 0) {
    return (
      <Text
        style={[
          fontStyle("regular"),
          { fontSize: 12, lineHeight: 16, color: colors.text.muted },
        ]}
      >
        No skills available yet.
      </Text>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <SkillPickerLegend
        primaryCount={primaryCount}
        secondaryCount={secondaryCount}
      />

      {SKILL_GROUP_META.map((group) => {
        if (groupFilter && !groupFilter.has(group.id)) return null;
        const groupSkills = skills.filter((s) => s.skill_group === group.id);
        if (groupSkills.length === 0) return null;
        const selectedInGroup = groupSkills.filter((s) =>
          value.has(s.id)
        ).length;
        return (
          <View key={group.id} style={{ gap: spacing.sm }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: group.color,
                }}
              />
              <Text
                style={[
                  fontStyle("bold"),
                  {
                    fontSize: 10.5,
                    color: group.color,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                  },
                ]}
              >
                {group.longLabel}
              </Text>
              {selectedInGroup > 0 ? (
                <Text
                  style={[
                    monoStyle("bold"),
                    { fontSize: 10.5, color: colors.text.muted },
                  ]}
                >
                  {selectedInGroup}
                </Text>
              ) : null}
            </View>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.sm,
              }}
            >
              {groupSkills.map((s) => (
                <SkillChip
                  key={s.id}
                  label={s.skill_name}
                  color={group.color}
                  tint={group.tint}
                  weight={value.get(s.id)}
                  onPress={() => cycle(s.id)}
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SkillPickerLegend({
  primaryCount,
  secondaryCount,
}: {
  primaryCount: number;
  secondaryCount: number;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text
        style={[
          fontStyle("regular"),
          { fontSize: 11.5, lineHeight: 16, color: colors.text.muted },
        ]}
      >
        Tap once for secondary, twice for primary, again to clear.
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="star" size={11} color={colors.text.label} />
        <Text
          style={[
            fontStyle("medium"),
            { fontSize: 11, color: colors.text.label },
          ]}
        >
          {primaryCount} primary
        </Text>
        <Text style={{ color: colors.border.strong }}>·</Text>
        <Ionicons name="star-outline" size={11} color={colors.text.muted} />
        <Text
          style={[
            fontStyle("medium"),
            { fontSize: 11, color: colors.text.muted },
          ]}
        >
          {secondaryCount} secondary
        </Text>
      </View>
    </View>
  );
}

function SkillChip({
  label,
  color,
  tint,
  weight,
  onPress,
}: {
  label: string;
  color: string;
  tint: string;
  weight: DrillSkillWeight | undefined;
  onPress: () => void;
}) {
  const isPrimary = weight === 1.0;
  const isSecondary = weight === 0.5;
  const isOn = isPrimary || isSecondary;

  const bg = isPrimary ? tint : "transparent";
  const borderColor = isOn ? color : colors.border.default;
  const textColor = isOn ? color : colors.text.primary;
  const state = isPrimary ? "primary" : isSecondary ? "secondary" : "off";

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isOn }}
      accessibilityLabel={`${label}, ${state}`}
      activeOpacity={0.85}
      hitSlop={6}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        backgroundColor: bg,
        borderColor,
      }}
    >
      {isPrimary ? (
        <Ionicons name="star" size={12} color={color} />
      ) : isSecondary ? (
        <Ionicons name="star-outline" size={12} color={color} />
      ) : null}
      <Text
        style={[
          fontStyle(isPrimary ? "bold" : "medium"),
          { fontSize: 12.5, color: textColor, letterSpacing: 0.1 },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
