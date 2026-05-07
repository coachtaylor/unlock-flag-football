import { View, type ViewProps, type ViewStyle } from "react-native";
import { colors, radius, spacing } from "../../constants/design";

type Variant = "surface" | "outlined" | "accent";
type AccentColor = "green" | "blue" | "orange";

type CardProps = ViewProps & {
  variant?: Variant;
  accentColor?: AccentColor;
};

export function Card({ variant = "surface", accentColor = "green", style, children, ...rest }: CardProps) {
  const accentMap = {
    green: { bg: colors.green[800], border: colors.green[600] },
    blue: { bg: colors.blue[800], border: colors.blue[600] },
    orange: { bg: colors.orange[600], border: colors.orange[500] },
  } as const;

  const variantStyle: ViewStyle =
    variant === "surface"
      ? { backgroundColor: colors.surface.raised }
      : variant === "outlined"
      ? {
          backgroundColor: colors.surface.base,
          borderWidth: 1,
          borderColor: colors.border.subtle,
        }
      : {
          backgroundColor: accentMap[accentColor].bg,
          borderWidth: 1,
          borderColor: accentMap[accentColor].border,
        };

  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          padding: spacing.lg,
        },
        variantStyle,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
