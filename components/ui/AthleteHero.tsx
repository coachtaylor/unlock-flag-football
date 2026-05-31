import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fontWeight, radius, tracking } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";
import {
  sideAccent,
  sideTint,
  positionColor,
  positionTint,
  type Side,
} from "../../constants/positions";

const AVATAR_SIZE = 78;

type Props = {
  initials: string;
  fullName: string;
  jersey: string;
  accent: string;
  side: Side | null;
  primary: string | null;
  secondary: string[];
  /**
   * Eyebrow text + dot color. `"live"` shows "LIVE PREVIEW" with the lime dot
   * (used by the Add/Edit Player form). `"status"` shows the player's
   * active/inactive status (used by the read-only detail view).
   */
  eyebrow: { label: string; color: string };
};

export function AthleteHero({
  initials,
  fullName,
  jersey,
  accent,
  side,
  primary,
  secondary,
  eyebrow,
}: Props) {
  return (
    <View
      style={{
        borderRadius: radius.hero,
        borderWidth: 1,
        borderColor: colors.orange.tintBorder,
        backgroundColor: colors.surface.raised,
        padding: 18,
        paddingTop: 14,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Top orange bloom */}
      <LinearGradient
        colors={[
          "rgba(255,106,26,0.18)",
          "rgba(255,106,26,0.04)",
          "rgba(255,106,26,0)",
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "55%",
        }}
        pointerEvents="none"
      />

      {/* Yard markers */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: 4,
          marginBottom: 12,
        }}
      >
        {["10", "20", "30", "40", "50"].map((y) => (
          <MonoText
            key={y}
            weight="bold"
            style={{
              fontSize: 9,
              color: "rgba(244,244,242,0.16)",
              letterSpacing: 1,
            }}
          >
            {y}
          </MonoText>
        ))}
      </View>

      {/* Eyebrow */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          marginBottom: 14,
        }}
      >
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: eyebrow.color,
          }}
        />
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 10,
              fontWeight: fontWeight.bold,
              color: eyebrow.color,
              letterSpacing: tracking.loose,
              textTransform: "uppercase",
            },
          ]}
        >
          {eyebrow.label}
        </Text>
      </View>

      {/* Avatar + jersey + name */}
      <View
        style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}
      >
        {/* Avatar with jersey badge */}
        <View style={{ position: "relative" }}>
          <LinearGradient
            colors={[accent, accent + "cc"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: AVATAR_SIZE / 2,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MonoText
              weight="bold"
              style={{
                fontSize: 26,
                fontWeight: fontWeight.bold,
                color: colors.surface.base,
                letterSpacing: -0.6,
              }}
            >
              {initials}
            </MonoText>
          </LinearGradient>
          {/* Inner ring shine */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 3,
              top: 3,
              width: AVATAR_SIZE - 6,
              height: AVATAR_SIZE - 6,
              borderRadius: (AVATAR_SIZE - 6) / 2,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.18)",
            }}
          />
          {/* Jersey badge */}
          <View
            style={{
              position: "absolute",
              bottom: -4,
              right: -6,
              minWidth: 32,
              height: 26,
              paddingHorizontal: 7,
              borderRadius: 8,
              backgroundColor: colors.surface.base,
              borderWidth: 2,
              borderColor: accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MonoText
              weight="bold"
              style={{
                fontSize: 13,
                fontWeight: fontWeight.bold,
                color: colors.text.primary,
              }}
            >
              {jersey ? `#${jersey}` : "#—"}
            </MonoText>
          </View>
        </View>

        {/* Name + pills */}
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 10,
                fontWeight: fontWeight.bold,
                color: colors.text.muted,
                letterSpacing: tracking.loose,
                textTransform: "uppercase",
              },
            ]}
          >
            Player
          </Text>
          <Text
            numberOfLines={1}
            style={[
              fontStyle("bold"),
              {
                fontSize: 22,
                fontWeight: fontWeight.bold,
                color: colors.text.primary,
                letterSpacing: -0.4,
                lineHeight: 26,
              },
            ]}
          >
            {fullName}
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 2,
            }}
          >
            {side ? (
              <HeroPill
                label={side.toUpperCase()}
                color={sideAccent(side)}
                tint={sideTint(side)}
              />
            ) : null}
            {primary ? (
              <HeroPill
                label={primary}
                color={positionColor(primary)}
                tint={positionTint(primary)}
              />
            ) : null}
            {secondary.map((s) => (
              <HeroPill
                key={s}
                label={s}
                color={positionColor(s)}
                tint="transparent"
                outline
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function HeroPill({
  label,
  color,
  tint,
  outline,
}: {
  label: string;
  color: string;
  tint: string;
  outline?: boolean;
}) {
  return (
    <View
      style={{
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: tint,
        borderWidth: outline ? 1 : 0,
        borderColor: outline ? colors.border.default : "transparent",
      }}
    >
      <Text
        style={{
          fontFamily: "JetBrainsMono_700Bold",
          fontSize: 10,
          fontWeight: fontWeight.bold,
          color,
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
