import { View, Text } from "react-native";
import { fontStyle } from "../../constants/typography";
import { colors } from "../../constants/design";
import { skillGroupMeta } from "../../constants/skill-groups";
import type { TaggedSkill } from "../../lib/skills";

// Named skill chip — a dot + the skill's name, colored by its skill group and
// weighted primary (filled) vs secondary (muted). Shared by the preset library
// cards and the team drill library cards so a tagged skill reads identically
// wherever it appears (mirrors the web SkillChip).
export function SkillChip({ skill }: { skill: TaggedSkill }) {
  const isPrimary = skill.weight === 1.0;
  const meta = skillGroupMeta(skill.skill_group);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: isPrimary ? meta.tint : colors.surface.overlay,
        borderWidth: 1,
        borderColor: isPrimary ? meta.color : "transparent",
      }}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: meta.color,
          opacity: isPrimary ? 1 : 0.6,
        }}
      />
      <Text
        style={[
          isPrimary ? fontStyle("bold") : fontStyle("medium"),
          {
            fontSize: 10.5,
            color: isPrimary ? colors.text.primary : colors.text.muted,
          },
        ]}
      >
        {skill.skill_name}
      </Text>
    </View>
  );
}
