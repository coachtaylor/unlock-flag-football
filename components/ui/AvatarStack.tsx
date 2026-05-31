import { View, Text } from "react-native";
import { colors, fontWeight } from "../../constants/design";
import { fontStyle } from "../../constants/typography";

export type Avatar = { initials: string; color: string; name?: string };

export function AvatarStack({
  players,
  size = 24,
  max = 5,
}: {
  players: Avatar[];
  size?: number;
  max?: number;
}) {
  const show = players.slice(0, max);
  const rest = players.length - show.length;
  const overlap = size * 0.3;
  return (
    <View style={{ flexDirection: "row" }}>
      {show.map((p, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: p.color,
            alignItems: "center",
            justifyContent: "center",
            marginLeft: i ? -overlap : 0,
            borderWidth: 2,
            borderColor: colors.surface.base,
          }}
        >
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: size * 0.42,
                fontWeight: fontWeight.bold,
                color: colors.surface.base,
              },
            ]}
          >
            {p.initials}
          </Text>
        </View>
      ))}
      {rest > 0 && (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.surface.overlay,
            alignItems: "center",
            justifyContent: "center",
            marginLeft: -overlap,
            borderWidth: 2,
            borderColor: colors.surface.base,
          }}
        >
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: size * 0.36,
                fontWeight: fontWeight.bold,
                color: colors.text.secondary,
              },
            ]}
          >
            +{rest}
          </Text>
        </View>
      )}
    </View>
  );
}
