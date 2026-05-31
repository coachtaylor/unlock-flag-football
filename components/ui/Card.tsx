import { View, type ViewProps, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, spacing } from "../../constants/design";

type Variant = "surface" | "outlined" | "filled" | "accent";
type AccentColor = "orange" | "green" | "blue";

type CardProps = ViewProps & {
  variant?: Variant;
  accentColor?: AccentColor;
  pad?: number;
};

const ACCENT_TINTS: Record<AccentColor, { from: string; to: string; border: string }> = {
  orange: {
    from: "rgba(255, 106, 26, 0.18)",
    to: "rgba(255, 106, 26, 0.0)",
    border: "rgba(255, 106, 26, 0.22)",
  },
  green: {
    from: "rgba(74, 222, 128, 0.18)",
    to: "rgba(74, 222, 128, 0.0)",
    border: "rgba(74, 222, 128, 0.22)",
  },
  blue: {
    from: "rgba(110, 168, 255, 0.18)",
    to: "rgba(110, 168, 255, 0.0)",
    border: "rgba(110, 168, 255, 0.22)",
  },
};

export function Card({
  variant = "surface",
  accentColor = "orange",
  pad = spacing.lg,
  style,
  children,
  ...rest
}: CardProps) {
  if (variant === "outlined") {
    // Canonical UFF card: orange top border + faint orange bloom from the top.
    return (
      <View
        style={[
          {
            backgroundColor: colors.surface.raised,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border.strong,
            borderTopWidth: 2,
            borderTopColor: colors.orange[500],
            overflow: "hidden",
          },
          style,
        ]}
        {...rest}
      >
        <LinearGradient
          colors={["rgba(255, 106, 26, 0.05)", "rgba(255, 106, 26, 0)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.28 }}
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
        <View style={{ padding: pad }}>{children}</View>
      </View>
    );
  }

  if (variant === "accent") {
    // Hero treatment: radial-ish bloom from top-right corner using a diagonal gradient.
    const tint = ACCENT_TINTS[accentColor];
    return (
      <View
        style={[
          {
            backgroundColor: colors.surface.raised,
            borderRadius: radius.hero,
            borderWidth: 1,
            borderColor: tint.border,
            overflow: "hidden",
          },
          style,
        ]}
        {...rest}
      >
        <LinearGradient
          colors={[tint.from, tint.to]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.2, y: 0.6 }}
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
        <View style={{ padding: pad }}>{children}</View>
      </View>
    );
  }

  if (variant === "filled") {
    return (
      <View
        style={[
          {
            backgroundColor: colors.surface.overlay,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border.card,
            padding: pad,
          },
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    );
  }

  // surface: default neutral card, most-used baseline
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface.raised,
          borderRadius: radius.card,
          padding: pad,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
