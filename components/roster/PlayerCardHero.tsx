// Player Card hero (Build 18) — the headline block of the roster detail. Answers
// "who is this player + how good are they" in one glance: photo/initials avatar,
// identity + physicals, the overall grade badge (shared GradeBadge, lg), the
// position-relevant per-group grade chips (shared GroupGradesRow), relative
// standing in their room, status badges, and 3 mini-stats. Purely presentational
// — the page runs the shared graders and passes the results in, so the card can
// never disagree with the scouting report.
import { Image, Text, View } from "react-native";
import type { Grade } from "../../lib/dashboard/heat-scale";
import { gradeLabel } from "../../lib/dashboard/heat-scale";
import type { GroupScore, RelativeStanding } from "../../lib/scouting/player-grade";
import { GradeBadge } from "../scouting/GradeBadge";
import { GroupGradesRow } from "../scouting/GroupGradesRow";
import { RelativeStandingLine } from "../scouting/RelativeStandingLine";
import { Byline } from "../ui/Byline";
import { formatPhysicals } from "../../lib/format/physicals";
import { colors, fontWeight, radius, tracking } from "../../constants/design";
import { fontStyle, MonoText, monoStyle } from "../../constants/typography";

export type PlayerCardHeroProps = {
  name: string;
  initials: string;
  jerseyNumber: string | null;
  positions: string[]; // primary first
  status: "active" | "inactive";
  isCaptain: boolean;
  injured: boolean;
  injuryNote: string | null;
  accent: string; // playerColorForIndex result
  photoUrl: string | null;
  heightIn: number | null;
  weightLb: number | null;
  addedByName: string | null;
  addedAt: string | null;
  joinedLabel: string | null;
  overallGrade: Grade | null;
  groupScores: GroupScore[];
  standing: RelativeStanding | null;
  benchmarkCount: number;
  pbCount: number;
  drillCount: number;
};

const AVATAR = 72;

export function PlayerCardHero(p: PlayerCardHeroProps) {
  const primary = p.positions[0] ?? null;
  const secondary = p.positions.slice(1);
  const physicals = formatPhysicals(p.heightIn, p.weightLb);
  const dim = p.status === "inactive" ? 0.55 : 1;
  const benchmarked = p.benchmarkCount > 0;

  return (
    <View
      style={{
        backgroundColor: colors.surface.raised,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border.subtle,
        padding: 18,
        gap: 16,
      }}
    >
      {/* Identity + overall grade */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        {p.photoUrl ? (
          <Image
            source={{ uri: p.photoUrl }}
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border.card,
              opacity: dim,
            }}
          />
        ) : (
          <View
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: 16,
              backgroundColor: p.accent,
              alignItems: "center",
              justifyContent: "center",
              opacity: dim,
            }}
          >
            <MonoText
              weight="bold"
              style={{ fontSize: 26, color: colors.text.onBrand, letterSpacing: -1 }}
            >
              {p.initials}
            </MonoText>
          </View>
        )}

        <View style={{ flex: 1, minWidth: 0 }}>
          {/* meta eyebrow: #jersey · PRIMARY · secondary */}
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 11,
                color: colors.text.secondary,
                letterSpacing: tracking.loose,
                textTransform: "uppercase",
                marginBottom: 3,
              },
            ]}
          >
            {p.jerseyNumber ? `#${p.jerseyNumber} · ` : ""}
            {primary ? (
              <Text style={{ color: colors.orange[500] }}>{primary}</Text>
            ) : (
              "No position"
            )}
            {secondary.length ? (
              <Text style={{ color: colors.text.muted }}> · {secondary.join(" / ")}</Text>
            ) : null}
          </Text>

          <Text
            style={[
              fontStyle("bold"),
              { fontSize: 20, fontWeight: fontWeight.bold, color: colors.text.primary, letterSpacing: -0.3 },
            ]}
            numberOfLines={2}
          >
            {p.name}
          </Text>

          {physicals ? (
            <Text style={[monoStyle("medium"), { fontSize: 12.5, color: colors.text.muted, marginTop: 3 }]}>
              {physicals}
            </Text>
          ) : null}

          {p.addedByName ? (
            <View style={{ marginTop: 5 }}>
              <Byline who={p.addedByName} verb="Added" at={p.addedAt} />
            </View>
          ) : null}
        </View>

        {/* Overall grade */}
        <View style={{ alignItems: "center", gap: 4, width: 88 }}>
          <Text
            style={[
              monoStyle("bold"),
              { fontSize: 9, color: colors.text.muted, letterSpacing: tracking.loose },
            ]}
          >
            OVERALL
          </Text>
          <GradeBadge grade={p.overallGrade} size="lg" />
          <Text
            style={[
              fontStyle("regular"),
              { fontSize: 10.5, color: colors.text.secondary, textAlign: "center", lineHeight: 14 },
            ]}
          >
            {p.overallGrade ? gradeLabel(p.overallGrade) : "Not benchmarked"}
          </Text>
        </View>
      </View>

      {/* Per-group grade chips (measured only) */}
      {benchmarked ? <GroupGradesRow groups={p.groupScores} measuredOnly /> : null}

      {/* Relative standing */}
      {p.standing ? <RelativeStandingLine standing={p.standing} /> : null}

      {/* Status badges */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {p.isCaptain ? <Badge label="Captain" color={colors.orange[500]} /> : null}
        {p.status === "active" ? (
          <Badge label="Active" color={colors.green[400]} />
        ) : (
          <Badge label="Inactive" color={colors.text.muted} />
        )}
        {p.injured ? <Badge label="Injured" color={colors.red.semantic} /> : null}
        {p.joinedLabel ? <Badge label={p.joinedLabel} color={colors.text.muted} muted /> : null}
      </View>

      {/* Injury note */}
      {p.injured && p.injuryNote ? (
        <View
          style={{
            padding: 12,
            borderRadius: radius.md,
            backgroundColor: "rgba(255,77,77,0.08)",
            borderWidth: 1,
            borderColor: "rgba(255,77,77,0.30)",
          }}
        >
          <Text style={[fontStyle("regular"), { fontSize: 12.5, lineHeight: 18, color: colors.text.primary }]}>
            <Text style={{ color: colors.red.semantic, fontWeight: fontWeight.bold }}>Injury note: </Text>
            {p.injuryNote}
          </Text>
        </View>
      ) : null}

      {/* Mini-stats */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <MiniStat
          label="Benchmarks"
          value={String(p.benchmarkCount)}
          sub={p.benchmarkCount === 0 ? "none yet" : "all time"}
        />
        <MiniStat
          label="PBs"
          value={String(p.pbCount)}
          sub={p.pbCount === 0 ? "—" : "all time"}
          accent={colors.orange[400]}
        />
        <MiniStat label="Drills" value={String(p.drillCount)} sub="tracked" />
      </View>
    </View>
  );
}

function Badge({ label, color, muted }: { label: string; color: string; muted?: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 4,
        backgroundColor: muted ? colors.surface.muted : `${color}22`,
      }}
    >
      <Text
        style={[
          fontStyle("bold"),
          { fontSize: 10, color, letterSpacing: tracking.loose, textTransform: "uppercase" },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function MiniStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        padding: 12,
        borderRadius: radius.md,
        backgroundColor: colors.surface.overlay,
      }}
    >
      <Text
        style={[
          fontStyle("bold"),
          { fontSize: 9.5, color: colors.text.muted, letterSpacing: tracking.loose, textTransform: "uppercase" },
        ]}
      >
        {label}
      </Text>
      <MonoText
        weight="bold"
        style={{ fontSize: 22, color: accent ?? colors.text.primary, marginTop: 4, letterSpacing: -0.4 }}
      >
        {value}
      </MonoText>
      {sub ? (
        <Text style={[fontStyle("regular"), { fontSize: 10.5, color: colors.text.muted, marginTop: 3 }]}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}
