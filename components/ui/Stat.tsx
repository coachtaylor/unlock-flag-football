import { View, Text } from "react-native";
import { colors, fontWeight, tracking } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";
import { Spark } from "./Spark";

type Size = "md" | "lg";

export function Stat({
  value,
  unit,
  label,
  delta,
  deltaColor = colors.lime[400],
  spark,
  size = "lg",
}: {
  value: string | number;
  unit?: string;
  label?: string;
  delta?: string;
  deltaColor?: string;
  spark?: number[];
  size?: Size;
}) {
  const numSize = size === "lg" ? 32 : 22;
  return (
    <View style={{ flexDirection: "column", gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
        <MonoText
          weight="bold"
          style={{
            fontSize: numSize,
            fontWeight: fontWeight.bold,
            letterSpacing: tracking.tight,
            lineHeight: numSize,
            color: colors.text.primary,
          }}
        >
          {value}
        </MonoText>
        {unit && (
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 14,
                color: colors.text.secondary,
                marginLeft: 2,
              },
            ]}
          >
            {unit}
          </Text>
        )}
        {delta && (
          <MonoText
            weight="medium"
            style={{
              fontSize: 11,
              fontWeight: fontWeight.semibold,
              color: deltaColor,
              marginLeft: 6,
            }}
          >
            {delta}
          </MonoText>
        )}
      </View>
      {label && (
        <Text
          style={[
            fontStyle("medium"),
            {
              fontSize: 11,
              color: colors.text.secondary,
              textTransform: "uppercase",
              letterSpacing: 1.1,
            },
          ]}
        >
          {label}
        </Text>
      )}
      {spark && <Spark data={spark} color={deltaColor} />}
    </View>
  );
}
