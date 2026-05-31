import { TouchableOpacity, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontWeight, radius, tracking } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";

export function ActivityRow({
  time,
  icon,
  title,
  detail,
  onPress,
}: {
  time: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.85}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.subtle,
      }}
    >
      <MonoText
        weight="medium"
        style={{
          fontSize: 11,
          fontWeight: fontWeight.semibold,
          color: colors.text.muted,
          width: 36,
          letterSpacing: tracking.loose * 0.3,
          textTransform: "uppercase",
        }}
      >
        {time}
      </MonoText>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.md,
          backgroundColor: colors.surface.overlay,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={14} color={colors.orange[500]} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text
          style={[
            fontStyle("medium"),
            {
              fontSize: 13,
              fontWeight: fontWeight.medium,
              color: colors.text.primary,
            },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {detail ? (
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 11,
                color: colors.text.secondary,
              },
            ]}
            numberOfLines={1}
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
