import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontWeight, radius, spacing } from "../../constants/design";
import { fontStyle, monoStyle } from "../../constants/typography";

export function Move({
  index,
  title,
  desc,
  cta,
  done = false,
  onCta,
}: {
  index?: string;
  title: string;
  desc?: string;
  cta?: string;
  done?: boolean;
  onCta?: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 14,
        padding: 14,
        backgroundColor: colors.surface.raised,
        borderWidth: 1,
        borderColor: colors.border.card,
        borderRadius: radius.xl,
        alignItems: "flex-start",
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          backgroundColor: done ? colors.lime[400] : colors.orange.tint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {done ? (
          <Ionicons name="checkmark" size={16} color={colors.surface.base} />
        ) : (
          <Text
            style={[
              monoStyle("bold"),
              {
                fontSize: 11,
                fontWeight: fontWeight.bold,
                color: colors.orange[500],
              },
            ]}
          >
            {index ?? ""}
          </Text>
        )}
      </View>
      <View style={{ flex: 1, flexDirection: "column", gap: 2 }}>
        <Text
          style={[
            fontStyle("semibold"),
            {
              fontSize: 14,
              fontWeight: fontWeight.semibold,
              color: done ? colors.text.secondary : colors.text.primary,
              textDecorationLine: done ? "line-through" : "none",
            },
          ]}
        >
          {title}
        </Text>
        {desc && (
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 12,
                lineHeight: 17,
                color: colors.text.muted,
              },
            ]}
          >
            {desc}
          </Text>
        )}
        {!done && cta && (
          <TouchableOpacity
            onPress={onCta}
            hitSlop={6}
            activeOpacity={0.7}
            style={{
              marginTop: spacing.sm,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              alignSelf: "flex-start",
            }}
          >
            <Text
              style={[
                fontStyle("semibold"),
                {
                  fontSize: 13,
                  fontWeight: fontWeight.semibold,
                  color: colors.orange[500],
                },
              ]}
            >
              {cta}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={13}
              color={colors.orange[500]}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
