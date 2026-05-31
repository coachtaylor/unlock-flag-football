import { View, Text } from "react-native";
import { colors, spacing } from "../../constants/design";
import { fontStyle } from "../../constants/typography";
import { Eyebrow } from "./Eyebrow";

type Pad = {
  top?: number;
  horizontal?: number;
  bottom?: number;
};

const DEFAULT_PAD: Required<Pad> = {
  top: spacing["2xl"],
  horizontal: spacing.lg + 2,
  bottom: spacing.md,
};

export function SectionHead({
  label,
  sub,
  pad,
}: {
  label: string;
  sub?: string;
  pad?: Pad;
}) {
  const p = { ...DEFAULT_PAD, ...pad };
  return (
    <View
      style={{
        paddingTop: p.top,
        paddingHorizontal: p.horizontal,
        paddingBottom: p.bottom,
      }}
    >
      <Eyebrow tick>{label}</Eyebrow>
      {sub && (
        <Text
          style={[
            fontStyle("regular"),
            {
              fontSize: 13,
              lineHeight: 19,
              color: colors.text.secondary,
              marginTop: 4,
              marginLeft: 11,
            },
          ]}
        >
          {sub}
        </Text>
      )}
    </View>
  );
}
