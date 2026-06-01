import { Text, View } from "react-native";
import { colors, fontFamily } from "../../constants/design";
import { playerColorForIndex } from "../../lib/athlete";
import { initialsFor } from "../../lib/benchmark-session";

// A player's identity avatar: a colored circle with their initials. Color is
// resolved from the player's color_index slot (playerColorForIndex), so a
// player keeps the same hue across every screen. Single source of truth for
// the name+colorIndex avatar shape — pass a size and it scales (radius =
// size/2, font ≈ 38% of size).
export function PlayerAvatar({
  name,
  colorIndex,
  size = 40,
}: {
  name: string;
  colorIndex: number | null | undefined;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: playerColorForIndex(colorIndex),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: fontFamily.sansBold,
          fontSize: Math.round(size * 0.38),
          color: colors.text.onBrand,
        }}
      >
        {initialsFor(name)}
      </Text>
    </View>
  );
}
