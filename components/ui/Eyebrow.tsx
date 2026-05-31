import { View, Text, type ViewStyle } from "react-native";
import { colors, fontWeight, tracking } from "../../constants/design";
import { fontStyle } from "../../constants/typography";

type Variant = "default" | "dim" | "brand";

const COLOR: Record<Variant, string> = {
  default: colors.text.primary,
  dim: colors.text.secondary,
  brand: colors.orange[500],
};

export function Eyebrow({
  children,
  variant = "default",
  tick = false,
  style,
}: {
  children: React.ReactNode;
  variant?: Variant;
  tick?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center" }, style]}>
      {tick && (
        <View
          style={{
            width: 3,
            height: 14,
            borderRadius: 2,
            backgroundColor: colors.orange[500],
            marginRight: 8,
          }}
        />
      )}
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 11,
            fontWeight: fontWeight.bold,
            letterSpacing: tracking.loose,
            textTransform: "uppercase",
            color: COLOR[variant],
          },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}
