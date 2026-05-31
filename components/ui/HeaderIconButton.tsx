import React from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../../constants/design";

// Square icon button used in screen headers (search / add / browse).
// `primary` is the orange filled CTA; `solid` is the raised neutral
// surface variant. Extracted from drills/index.tsx for reuse by the
// preset-library screen.
export function HeaderIconButton({
  icon,
  variant,
  onPress,
  accessibilityLabel,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  variant: "solid" | "primary";
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
    >
      {({ pressed }) => (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.lg,
            backgroundColor: isPrimary
              ? colors.orange[500]
              : colors.surface.raised,
            borderWidth: 1,
            borderColor: isPrimary ? colors.orange[500] : colors.border.card,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          }}
        >
          <Ionicons
            name={icon}
            size={16}
            color={isPrimary ? colors.text.onBrand : colors.text.primary}
          />
        </View>
      )}
    </Pressable>
  );
}
