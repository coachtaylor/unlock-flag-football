import { View, Text, type ViewStyle } from "react-native";
import { colors, fontWeight, radius } from "../../constants/design";
import { fontStyle, monoStyle } from "../../constants/typography";

type Variant = "default" | "orange" | "lime" | "ghost";

const VARIANT_STYLE: Record<
  Variant,
  { bg: string; color: string; borderColor?: string }
> = {
  default: {
    bg: "rgba(255, 255, 255, 0.06)",
    color: colors.text.primary,
  },
  orange: {
    bg: colors.orange.tint,
    color: colors.orange[500],
  },
  lime: {
    bg: colors.lime.tint,
    color: colors.lime[400],
  },
  ghost: {
    bg: "transparent",
    color: colors.text.secondary,
    borderColor: colors.border.strong,
  },
};

export function Pill({
  children,
  variant = "default",
  mono = false,
  style,
}: {
  children: React.ReactNode;
  variant?: Variant;
  mono?: boolean;
  style?: ViewStyle;
}) {
  const v = VARIANT_STYLE[variant];
  return (
    <View
      style={[
        {
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: radius.pill,
          backgroundColor: v.bg,
          borderWidth: v.borderColor ? 1 : 0,
          borderColor: v.borderColor,
        },
        style,
      ]}
    >
      <Text
        style={[
          mono ? monoStyle("medium") : fontStyle("semibold"),
          {
            fontSize: 11,
            fontWeight: fontWeight.semibold,
            letterSpacing: 0.4,
            color: v.color,
          },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}
