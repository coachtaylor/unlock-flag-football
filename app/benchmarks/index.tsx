// Read-first Team Scouting Report — the benchmarks landing (Build 17). Replaces
// the old write-first hub, which now lives at /benchmarks/run. Lean cut: 3
// position rooms + a weakest-first player list. Tapping a player opens the
// full-screen detail. Movers / leaderboards / headline decisions are a
// follow-up build.
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing } from "../../constants/design";
import { fontStyle, monoStyle } from "../../constants/typography";
import { positionColor, positionTint } from "../../constants/positions";
import { useTeam } from "../../lib/team-context";
import {
  loadTeamScouting,
  type PlayerReportCard,
  type RoomCell,
  type TeamScoutingData,
} from "../../lib/scouting/team-scouting-data";
import { GradeBadge } from "../../components/scouting/GradeBadge";

function SectionEyebrow({ label, sub }: { label: string; sub?: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text
        style={[
          fontStyle("bold"),
          { fontSize: 11, color: colors.text.label, letterSpacing: 1.5, textTransform: "uppercase" },
        ]}
      >
        {label}
      </Text>
      {sub ? (
        <Text style={[fontStyle(), { fontSize: 12, color: colors.text.secondary, marginTop: 2 }]}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function PositionPill({ pos }: { pos: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: positionTint(pos),
      }}
    >
      <Text style={[monoStyle("medium"), { fontSize: 10, color: positionColor(pos), letterSpacing: 0.3 }]}>
        {pos}
      </Text>
    </View>
  );
}

function RoomCard({ room }: { room: RoomCell }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface.raised,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border.card,
        padding: spacing.lg,
        opacity: room.locked ? 0.6 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text style={[fontStyle("bold"), { fontSize: 15, color: colors.text.primary }]}>
            {room.label}
          </Text>
          <Text style={[fontStyle(), { fontSize: 12, color: colors.text.secondary, marginTop: 2 }]}>
            {room.assessed}/{room.players} assessed
            {!room.gradeReliable && room.assessed > 0 ? " · provisional" : ""}
          </Text>
        </View>
        <GradeBadge grade={room.grade} />
      </View>
      {room.locked ? (
        <Text style={[fontStyle(), { fontSize: 12, color: colors.text.muted, marginTop: spacing.sm }]}>
          No benchmarks yet — run a drill to grade this room.
        </Text>
      ) : room.weakestSkillLabel ? (
        <Text style={[fontStyle(), { fontSize: 12, color: colors.text.secondary, marginTop: spacing.sm }]}>
          Weakest: <Text style={fontStyle("medium")}>{room.weakestSkillLabel}</Text>
        </Text>
      ) : null}
    </View>
  );
}

function ScoutPlayerRow({ card, onPress }: { card: PlayerReportCard; onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        backgroundColor: colors.surface.raised,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border.card,
        padding: spacing.md,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          backgroundColor: card.color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={[monoStyle("bold"), { fontSize: 13, color: colors.text.onBrand }]}>
          {card.initials}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[fontStyle("medium"), { fontSize: 14, color: colors.text.primary }]} numberOfLines={1}>
          {card.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
          {card.positions.slice(0, 3).map((p) => (
            <PositionPill key={p} pos={p} />
          ))}
        </View>
        {card.relativeStanding ? (
          <Text style={[fontStyle(), { fontSize: 11, color: colors.text.muted, marginTop: 3 }]}>
            {card.relativeStanding.line} · {card.relativeStanding.detail}
          </Text>
        ) : null}
      </View>
      <GradeBadge grade={card.overallGrade} size="sm" />
      <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
    </TouchableOpacity>
  );
}

function ColdStart({ onRun }: { onRun: () => void }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: spacing.xl,
        gap: spacing.lg,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 999,
          backgroundColor: colors.orange.tint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="clipboard-outline" size={28} color={colors.orange[400]} />
      </View>
      <Text style={[fontStyle("bold"), { fontSize: 18, color: colors.text.primary, textAlign: "center" }]}>
        No benchmarks yet
      </Text>
      <Text
        style={[
          fontStyle(),
          { fontSize: 13, color: colors.text.secondary, textAlign: "center", lineHeight: 19 },
        ]}
      >
        Run your first benchmark to start grading the roster and see team strengths and gaps.
      </Text>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onRun}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: spacing.xl,
          paddingVertical: 12,
          borderRadius: radius.pill,
          backgroundColor: colors.orange[500],
        }}
      >
        <Ionicons name="stopwatch-outline" size={16} color={colors.text.onBrand} />
        <Text style={[fontStyle("medium"), { fontSize: 14, color: colors.text.onBrand }]}>
          Run your first benchmark
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ScoutingLandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();
  const [data, setData] = useState<TeamScoutingData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const d = await loadTeamScouting(teamId);
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={colors.text.secondary} />
          </TouchableOpacity>
          <View>
            <Text
              style={[monoStyle("bold"), { fontSize: 11, color: colors.orange[500], letterSpacing: 0.4 }]}
            >
              SCOUTING
            </Text>
            <Text style={[fontStyle("bold"), { fontSize: 20, color: colors.text.primary }]}>
              Team Report
            </Text>
          </View>
        </View>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push("/benchmarks/run" as never)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: spacing.md,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: colors.orange.tint,
            borderWidth: 1,
            borderColor: colors.orange.tintBorder,
          }}
        >
          <Ionicons name="stopwatch-outline" size={14} color={colors.orange[400]} />
          <Text style={[fontStyle("medium"), { fontSize: 12.5, color: colors.orange[400] }]}>
            Run benchmark
          </Text>
        </TouchableOpacity>
      </View>

      {loading && !data ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.orange[400]} />
        </View>
      ) : !data || !data.anyData ? (
        <ColdStart onRun={() => router.push("/benchmarks/run" as never)} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + 60,
            gap: spacing.lg,
          }}
        >
          <View>
            <SectionEyebrow label="Position rooms" sub="Grades on position-relevant skills." />
            <View style={{ gap: spacing.md }}>
              {data.rooms.map((r) => (
                <RoomCard key={r.id} room={r} />
              ))}
            </View>
          </View>

          <View>
            <SectionEyebrow label="Players" sub="Weakest reads first." />
            <View style={{ gap: spacing.sm }}>
              {data.playerCards.map((c) => (
                <ScoutPlayerRow
                  key={c.playerId}
                  card={c}
                  onPress={() => router.push(`/benchmarks/player/${c.playerId}` as never)}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
