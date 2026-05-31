import { View, Text } from "react-native";
import { colors, tracking } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";

export function AttendBar({
  label,
  value,
  color = colors.orange[500],
  width = 120,
}: {
  label: string;
  value: number;
  color?: string;
  width?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        width,
      }}
    >
      <Text
        style={[
          fontStyle("medium"),
          {
            fontSize: 10,
            color: colors.text.secondary,
            width: 56,
            textTransform: "uppercase",
            letterSpacing: tracking.loose * 0.6,
          },
        ]}
      >
        {label}
      </Text>
      <View
        style={{
          flex: 1,
          height: 5,
          borderRadius: 3,
          backgroundColor: colors.border.strong,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 3,
            backgroundColor: color,
          }}
        />
      </View>
      <MonoText
        weight="medium"
        style={{
          fontSize: 11,
          color: colors.text.primary,
          width: 30,
          textAlign: "right",
        }}
      >
        {pct}%
      </MonoText>
    </View>
  );
}
