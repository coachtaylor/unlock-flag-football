import { View, Text } from "react-native";
import { colors, radius, spacing } from "../constants/design";
import { fontStyle, MonoText } from "../constants/typography";
import { skillGroupMeta } from "../constants/skill-groups";
import type { SkillGroup } from "../lib/skills";

// Player Skill Profile (Build 14e — mobile port of web Build 13). The
// per-player payoff of the assessment engine: "is Marcus actually good at
// coverage?" Consumes v_player_skill_profile WHERE player_id = X and surfaces
// the player's top skills + the ones that need work, each on the anchored 1–5
// scale with a sample-size badge so a 1-rating average isn't mistaken for a
// trustworthy score.
//
// Position bias is handled by the view itself: it only returns rows for skills
// the player has at least one signal on, so a DB never shows up scored 0 on
// QB-only skills — those skills simply aren't rows.

export type PlayerSkill = {
  skillId: string;
  skillName: string;
  skillGroup: SkillGroup;
  // composite_score from the view, 0..1 (rating/5 or made/attempts).
  composite: number;
  // count of distinct drills that fed this skill's composite.
  sampleSize: number;
};

// Below this many measured skills the strengths/weaknesses split is noise, so
// the card shows a locked-insight state instead.
const MIN_SKILLS = 3;

export function PlayerSkillProfileCard({
  skills,
  playerName,
}: {
  skills: PlayerSkill[];
  playerName: string;
}) {
  const first = playerName.trim().split(/\s+/)[0] || "this player";

  if (skills.length < MIN_SKILLS) {
    const need = MIN_SKILLS - skills.length;
    return (
      <View
        style={{
          padding: 20,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: colors.border.default,
        }}
      >
        <Text
          style={[
            fontStyle("regular"),
            {
              fontSize: 13,
              lineHeight: 19,
              color: colors.text.secondary,
              textAlign: "center",
            },
          ]}
        >
          {skills.length === 0
            ? `No skill signals yet. Run rated benchmarks on ${MIN_SKILLS}+ skills to unlock ${first}'s strengths and weaknesses — each rated drill feeds the skills it's tagged with.`
            : `${first} has ${skills.length} skill${
                skills.length === 1 ? "" : "s"
              } measured. Benchmark ${need} more to unlock the strengths / weaknesses breakdown.`}
        </Text>
      </View>
    );
  }

  // Sort strongest → weakest. Strengths = top 3; weaknesses = the lowest 3
  // among everything below rank 3 (weakest first), so a skill never appears in
  // both lists even for players with only 4–5 measured skills.
  const sorted = [...skills].sort((a, b) => b.composite - a.composite);
  const strengths = sorted.slice(0, 3);
  const weaknesses = sorted.slice(3).slice(-3).reverse();

  return (
    <View
      style={{
        padding: 16,
        borderRadius: radius.xl,
        backgroundColor: colors.surface.raised,
        borderWidth: 1,
        borderColor: colors.border.subtle,
        gap: spacing.lg,
      }}
    >
      <SkillGroupBlock label="Top skills" accent={colors.lime[400]} rows={strengths} />

      {weaknesses.length > 0 && (
        <SkillGroupBlock
          label="Needs work"
          accent={colors.red.semantic}
          rows={weaknesses}
        />
      )}

      {/* Anchored 1–5 reference scale (matches the benchmark rating anchors in
          CLAUDE.md) so a coach reads each bar against a fixed meaning. */}
      <View
        style={{
          paddingTop: spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.border.subtle,
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        {[
          "1 Can't execute",
          "3 Inconsistent",
          "5 Reliable",
        ].map((t) => (
          <MonoText
            key={t}
            weight="medium"
            style={{ fontSize: 9.5, color: colors.text.muted }}
          >
            {t}
          </MonoText>
        ))}
      </View>
    </View>
  );
}

function SkillGroupBlock({
  label,
  accent,
  rows,
}: {
  label: string;
  accent: string;
  rows: PlayerSkill[];
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: accent,
          }}
        />
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 10,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: colors.text.muted,
            },
          ]}
        >
          {label}
        </Text>
      </View>
      <View style={{ gap: spacing.sm }}>
        {rows.map((r) => (
          <SkillRow key={r.skillId} skill={r} />
        ))}
      </View>
    </View>
  );
}

function SkillRow({ skill }: { skill: PlayerSkill }) {
  const meta = skillGroupMeta(skill.skillGroup);
  const score = skill.composite * 5; // 0..1 → 1..5 scale
  const pct = Math.max(0, Math.min(100, (score / 5) * 100));

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            backgroundColor: meta.color,
          }}
        />
        <Text
          numberOfLines={1}
          style={[
            fontStyle("regular"),
            { flex: 1, fontSize: 13, color: colors.text.primary },
          ]}
        >
          {skill.skillName}
        </Text>
        <SampleBadge n={skill.sampleSize} />
        <MonoText weight="medium" style={{ fontSize: 13, color: colors.text.primary }}>
          {score.toFixed(1)}
          <Text style={{ fontSize: 9.5, color: colors.text.muted }}>/5</Text>
        </MonoText>
      </View>
      {/* Composite bar tinted to the skill's group color. */}
      <View
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: meta.color,
            borderRadius: 2,
          }}
        />
      </View>
    </View>
  );
}

// Sample-size badge — non-negotiable per Build 13 spec so coaches don't trust a
// composite built from a single rating. Tinted red when n<2.
function SampleBadge({ n }: { n: number }) {
  const thin = n < 2;
  return (
    <View
      style={{
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 4,
        backgroundColor: thin ? "rgba(255,77,77,0.12)" : "rgba(255,255,255,0.05)",
      }}
    >
      <MonoText
        weight="bold"
        style={{
          fontSize: 9.5,
          color: thin ? colors.red.semantic : colors.text.muted,
        }}
      >
        n{n}
      </MonoText>
    </View>
  );
}
