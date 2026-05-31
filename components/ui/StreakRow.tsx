import { View, Text } from "react-native";
import { colors, fontWeight } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";

export function StreakRow({
  initials,
  name,
  color,
  streak,
  max = 8,
  top = false,
}: {
  initials: string;
  name: string;
  color?: string | null;
  streak: number;
  max?: number;
  top?: boolean;
}) {
  const fill = top ? colors.lime[400] : colors.orange[500];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: color ?? colors.orange[500],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 10,
              fontWeight: fontWeight.bold,
              color: colors.surface.base,
            },
          ]}
        >
          {initials}
        </Text>
      </View>
      <Text
        style={[
          fontStyle("medium"),
          {
            flex: 1,
            fontSize: 12,
            color: colors.text.primary,
          },
        ]}
        numberOfLines={1}
      >
        {name}
      </Text>
      <View style={{ flexDirection: "row", gap: 3 }}>
        {Array.from({ length: max }).map((_, i) => (
          <View
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor:
                i < Math.min(streak, max) ? fill : colors.border.strong,
            }}
          />
        ))}
      </View>
      <MonoText
        weight="medium"
        style={{
          fontSize: 11,
          color: colors.text.secondary,
          width: 22,
          textAlign: "right",
        }}
      >
        {streak}
      </MonoText>
    </View>
  );
}
