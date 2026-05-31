import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, fontWeight, tracking } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";

export function AttendanceRing({
  committed,
  total,
  size = 80,
  stroke = 6,
}: {
  committed: number;
  total: number;
  size?: number;
  stroke?: number;
}) {
  const safeTotal = Math.max(0, total);
  const safeCommitted = Math.max(0, Math.min(committed, safeTotal));
  const pct = safeTotal === 0 ? 0 : safeCommitted / safeTotal;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.border.strong}
          strokeWidth={stroke}
          fill="none"
        />
        {pct > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.orange[500]}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            strokeLinecap="round"
          />
        )}
      </Svg>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MonoText
          weight="bold"
          style={{
            fontSize: 18,
            fontWeight: fontWeight.bold,
            lineHeight: 18,
            color: colors.text.primary,
          }}
        >
          {safeCommitted}/{safeTotal}
        </MonoText>
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 9,
              fontWeight: fontWeight.bold,
              color: colors.text.secondary,
              textTransform: "uppercase",
              letterSpacing: tracking.loose,
              marginTop: 2,
            },
          ]}
        >
          IN
        </Text>
      </View>
    </View>
  );
}
