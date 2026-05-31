import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontWeight, tracking } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";
import {
  positionColor,
  positionTint,
} from "../../constants/positions";
import { initialsFromName, playerColorForIndex } from "../../lib/athlete";
import { StreakDots } from "./StreakDots";

export type PlayerCardData = {
  id: string;
  name: string;
  jerseyNumber: string | null;
  positions: string[];
  status: "active" | "inactive";
  // Per-player color slot (migration 45). Indexes into the 20-swatch
  // palette in `colors.player.palette` so every player on a team
  // shows a unique avatar color. Null only on legacy data loaded
  // before migration 45 is applied — the helper falls back to muted
  // grey in that case.
  colorIndex: number | null;
  // Roster injury flag (migration 43). When true, the player stays on the
  // active roster but is flagged unavailable. Drives the red INJURED pill
  // and the dimmed avatar treatment.
  injured: boolean;
  isCaptain: boolean;
  // Most recent timed benchmark (if any)
  timedSeconds: number | null;
  timedDrill: string | null;
  // Most recent rated benchmark (if any)
  rating: number | null;
  ratedDrill: string | null;
  // Computed flags
  pr: boolean;
  streak: number;
};

type Props = {
  player: PlayerCardData;
  onPress: () => void;
  dim?: boolean;
};

export function PlayerCard({ player, onPress, dim }: Props) {
  // Per-player identity color, slot assigned by migration 45. Same hue
  // this player wears on the dashboard, practice RSVP, benchmark queue,
  // and attendance check-in.
  const accent = playerColorForIndex(player.colorIndex);
  const initials = initialsFromName(player.name);

  // primary = positions[0]; secondaries = up to 2 more
  const primary = player.positions[0] ?? null;
  const secondaries = player.positions.slice(1, 3);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${player.name}, ${primary ?? "no position"}`}
      style={{
        padding: 14,
        backgroundColor: colors.surface.raised,
        borderWidth: 1,
        borderColor: colors.border.subtle,
        borderRadius: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        opacity: dim ? 0.55 : 1,
        overflow: "hidden",
      }}
    >
      {/* Avatar + jersey/PR pip */}
      <View style={{ position: "relative", flexShrink: 0 }}>
        <View
          style={{
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MonoText
            weight="bold"
            style={{
              fontSize: 17,
              fontWeight: fontWeight.bold,
              color: colors.surface.base,
              letterSpacing: -0.4,
            }}
          >
            {initials}
          </MonoText>
        </View>
        {player.pr ? (
          <View
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: colors.lime[400],
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: colors.surface.raised,
            }}
          >
            <Ionicons name="flash" size={9} color={colors.surface.base} />
          </View>
        ) : null}
        {player.injured ? (
          <View
            style={{
              position: "absolute",
              bottom: -2,
              right: -2,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: colors.red.semantic,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: colors.surface.raised,
            }}
          >
            <Ionicons name="medkit" size={9} color={colors.surface.base} />
          </View>
        ) : null}
      </View>

      {/* Middle column */}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View
          style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}
        >
          <Text
            numberOfLines={1}
            style={[
              fontStyle("bold"),
              {
                fontSize: 15,
                fontWeight: fontWeight.bold,
                color: colors.text.primary,
                letterSpacing: -0.2,
                flexShrink: 1,
              },
            ]}
          >
            {player.name}
          </Text>
          {player.jerseyNumber ? (
            <MonoText
              weight="medium"
              style={{
                fontSize: 12,
                color: colors.text.secondary,
              }}
            >
              #{player.jerseyNumber}
            </MonoText>
          ) : null}
        </View>

        {primary || secondaries.length > 0 || player.injured || player.isCaptain ? (
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {player.isCaptain ? <CaptainPill /> : null}
            {player.injured ? <InjuredPill /> : null}
            {primary ? (
              <PositionPill label={primary} primary />
            ) : null}
            {secondaries.map((p) => (
              <PositionPill key={p} label={p} />
            ))}
          </View>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
          }}
        >
          <StreakDots streak={player.streak} max={6} top={player.streak >= 6} />
          <MonoText
            weight="medium"
            style={{
              fontSize: 10.5,
              color: colors.text.muted,
            }}
          >
            {player.streak}w
          </MonoText>
        </View>
      </View>

      {/* Right benchmark column */}
      <View style={{ alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
        {player.timedSeconds !== null ? (
          <>
            <View
              style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}
            >
              <MonoText
                weight="bold"
                style={{
                  fontSize: 20,
                  fontWeight: fontWeight.bold,
                  color: colors.text.primary,
                  letterSpacing: -0.4,
                  lineHeight: 22,
                }}
              >
                {player.timedSeconds.toFixed(2)}
              </MonoText>
              <MonoText
                weight="medium"
                style={{
                  fontSize: 10,
                  color: colors.text.secondary,
                }}
              >
                s
              </MonoText>
            </View>
            <Text
              numberOfLines={1}
              style={[
                fontStyle("bold"),
                {
                  fontSize: 9,
                  fontWeight: fontWeight.bold,
                  color: colors.text.muted,
                  letterSpacing: tracking.loose,
                  textTransform: "uppercase",
                  maxWidth: 110,
                },
              ]}
            >
              {(player.timedDrill ?? "Timed").slice(0, 14)}
            </Text>
          </>
        ) : player.rating !== null ? (
          <>
            <View
              style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}
            >
              <MonoText
                weight="bold"
                style={{
                  fontSize: 20,
                  fontWeight: fontWeight.bold,
                  color: colors.text.primary,
                  letterSpacing: -0.4,
                  lineHeight: 22,
                }}
              >
                {player.rating}
              </MonoText>
              <MonoText
                weight="medium"
                style={{ fontSize: 10, color: colors.text.secondary }}
              >
                /5
              </MonoText>
            </View>
            <Text
              numberOfLines={1}
              style={[
                fontStyle("bold"),
                {
                  fontSize: 9,
                  fontWeight: fontWeight.bold,
                  color: colors.text.muted,
                  letterSpacing: tracking.loose,
                  textTransform: "uppercase",
                  maxWidth: 110,
                },
              ]}
            >
              {(player.ratedDrill ?? "Rated").slice(0, 14)}
            </Text>
          </>
        ) : (
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 9,
                fontWeight: fontWeight.bold,
                color: colors.text.muted,
                letterSpacing: tracking.loose,
                textTransform: "uppercase",
              },
            ]}
          >
            No benchmarks
          </Text>
        )}
        {player.timedSeconds !== null && player.rating !== null ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginTop: 2,
            }}
          >
            <MonoText
              weight="medium"
              style={{ fontSize: 10, color: colors.text.secondary }}
            >
              {player.rating}/5
            </MonoText>
            <Text
              numberOfLines={1}
              style={[
                fontStyle("regular"),
                {
                  fontSize: 9,
                  color: colors.text.muted,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  maxWidth: 80,
                },
              ]}
            >
              · {(player.ratedDrill ?? "Rated").slice(0, 8)}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function CaptainPill() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: colors.orange.tint,
      }}
    >
      <Ionicons name="star" size={9} color={colors.orange[500]} />
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 10,
            fontWeight: fontWeight.bold,
            color: colors.orange[500],
            letterSpacing: 0.4,
          },
        ]}
      >
        CAPTAIN
      </Text>
    </View>
  );
}

function InjuredPill() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: "rgba(255, 77, 77, 0.14)",
      }}
    >
      <Ionicons name="medkit" size={9} color={colors.red.semantic} />
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 10,
            fontWeight: fontWeight.bold,
            color: colors.red.semantic,
            letterSpacing: 0.4,
          },
        ]}
      >
        INJURED
      </Text>
    </View>
  );
}

function PositionPill({
  label,
  primary,
}: {
  label: string;
  primary?: boolean;
}) {
  const accent = positionColor(label);
  if (primary) {
    return (
      <View
        style={{
          paddingHorizontal: 7,
          paddingVertical: 2,
          borderRadius: 4,
          backgroundColor: positionTint(label),
        }}
      >
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 10,
              fontWeight: fontWeight.bold,
              color: accent,
              letterSpacing: 0.4,
            },
          ]}
        >
          {label}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: accent,
        backgroundColor: "transparent",
      }}
    >
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 10,
            fontWeight: fontWeight.bold,
            color: accent,
            letterSpacing: 0.4,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
