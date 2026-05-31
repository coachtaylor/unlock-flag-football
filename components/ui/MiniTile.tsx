import { TouchableOpacity, Text, type StyleProp, type ViewStyle } from "react-native";
import { colors, fontWeight, radius, tracking } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";

export function MiniTile({
  value,
  label,
  accent = false,
  onPress,
  style,
}: {
  value: string | number;
  label: string;
  accent?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.85}
      style={[
        {
          flex: 1,
          paddingVertical: 12,
          paddingHorizontal: 10,
          borderRadius: radius.lg,
          borderWidth: 1,
          backgroundColor: accent
            ? "rgba(255,106,26,0.08)"
            : colors.surface.raised,
          borderColor: accent
            ? colors.orange.tintBorder
            : colors.border.card,
        },
        style,
      ]}
    >
      <MonoText
        weight="bold"
        style={{
          fontSize: 22,
          fontWeight: fontWeight.bold,
          color: accent ? colors.orange[500] : colors.text.primary,
        }}
      >
        {value}
      </MonoText>
      <Text
        style={[
          fontStyle("medium"),
          {
            fontSize: 10,
            color: colors.text.secondary,
            textTransform: "uppercase",
            letterSpacing: tracking.loose,
            marginTop: 2,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
