import { View, Text } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { colors, fontWeight } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";
import { CATEGORY_COLORS, type CategoryKey } from "../../constants/categories";

export function CategoryDonut({
  mix,
  size = 80,
  stroke = 8,
  centerLabel = "drills",
  centerValue,
}: {
  mix: Partial<Record<CategoryKey, number>>;
  size?: number;
  stroke?: number;
  centerLabel?: string;
  // Override the big number in the middle. Defaults to the sum of category
  // hits, but the dashboard passes the distinct drill-completion count so a
  // multi-tag drill doesn't inflate the "33 DRILLS" headline.
  centerValue?: number;
}) {
  const entries = (Object.entries(mix) as [CategoryKey, number][]).filter(
    ([, n]) => n > 0
  );
  const sum = entries.reduce((acc, [, n]) => acc + n, 0);
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;

  if (sum === 0) {
    return (
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.border.strong}
            strokeWidth={stroke}
            fill="none"
          />
        </Svg>
      </View>
    );
  }

  let acc = 0;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.border.strong}
            strokeWidth={stroke}
            fill="none"
          />
          {entries.map(([k, n]) => {
            const frac = n / sum;
            const len = C * frac;
            const off = -C * acc;
            acc += frac;
            return (
              <Circle
                key={k}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={CATEGORY_COLORS[k]}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={off}
              />
            );
          })}
        </G>
      </Svg>
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        <MonoText
          weight="bold"
          style={{
            fontSize: 18,
            fontWeight: fontWeight.bold,
            lineHeight: 18,
            color: colors.text.primary,
          }}
        >
          {centerValue ?? sum}
        </MonoText>
        <Text
          style={[
            fontStyle("medium"),
            {
              fontSize: 9,
              color: colors.text.secondary,
              textTransform: "uppercase",
              letterSpacing: 1.0,
              marginTop: 2,
            },
          ]}
        >
          {centerLabel}
        </Text>
      </View>
    </View>
  );
}
