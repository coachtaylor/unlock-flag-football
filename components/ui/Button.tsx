import { Pressable, Text, View, type PressableProps, type ViewStyle, type TextStyle } from "react-native";
import { colors, radius, spacing } from "../../constants/design";

type Variant = "primary" | "secondary" | "destructive";

type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  label: string;
  variant?: Variant;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  variant = "primary",
  disabled,
  fullWidth = true,
  style,
  ...rest
}: ButtonProps) {
  const containerByVariant: Record<Variant, ViewStyle> = {
    primary: {
      backgroundColor: colors.orange[500],
    },
    secondary: {
      backgroundColor: colors.surface.raised,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    destructive: {
      backgroundColor: "transparent",
    },
  };

  const textByVariant: Record<Variant, TextStyle> = {
    primary: { color: "#FFFFFF" },
    secondary: { color: colors.text.primary },
    destructive: { color: colors.error },
  };

  const containerStyle: ViewStyle = {
    minHeight: 52,
    width: fullWidth ? "100%" : undefined,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    opacity: disabled ? 0.5 : 1,
    ...containerByVariant[variant],
    ...(style ?? {}),
  };

  return (
    <Pressable accessibilityRole="button" disabled={disabled} {...rest}>
      <View style={containerStyle}>
        <Text
          style={{
            fontSize: 15,
            lineHeight: 22,
            fontWeight: "500",
            letterSpacing: 0.3,
            ...textByVariant[variant],
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
