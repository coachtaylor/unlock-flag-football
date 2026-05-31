import { Text, type TextProps, type TextStyle } from "react-native";
import { colors, fontFamily } from "./design";

type Weight = "regular" | "medium" | "semibold" | "bold";

const SANS_FAMILY: Record<Weight, string> = {
  regular: fontFamily.sans,
  medium: fontFamily.sansMedium,
  semibold: fontFamily.sansSemibold,
  bold: fontFamily.sansBold,
};

export function fontStyle(weight: Weight = "regular"): TextStyle {
  return { fontFamily: SANS_FAMILY[weight] };
}

export function monoStyle(weight: "medium" | "bold" = "medium"): TextStyle {
  return {
    fontFamily: weight === "bold" ? fontFamily.monoBold : fontFamily.mono,
    fontVariant: ["tabular-nums"],
  };
}

type MonoTextProps = TextProps & {
  weight?: "medium" | "bold";
};

export function MonoText({ weight = "medium", style, ...rest }: MonoTextProps) {
  return <Text {...rest} style={[monoStyle(weight), style]} />;
}

/**
 * Apply Inter as the default font for any unstyled <Text>. Called once at
 * the root layout after fonts have loaded. RN doesn't have a CSS-equivalent
 * "body font" mechanism — this is the standard escape hatch.
 */
export function applyDefaultTextFont() {
  // @ts-expect-error — RN does not type defaultProps but it is the
  // documented way to set a global font default.
  const existing = Text.defaultProps ?? {};
  // @ts-expect-error — see above
  Text.defaultProps = {
    ...existing,
    style: [
      { fontFamily: fontFamily.sans, color: colors.text.primary },
      existing.style,
    ],
  };
}
