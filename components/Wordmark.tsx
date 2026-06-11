import Svg, { Text as SvgText, Rect } from "react-native-svg";
import { colors, fontFamily } from "../constants/design";

// Brand wordmark — "UNLOCK" (Anton) with the lime slash. Vector twin of
// /brand/unlock-wordmark.svg on web; coordinates match the source SVG's
// 668.4×280 viewBox so the slash lands identically. Anton is registered in
// app/_layout.tsx useFonts, so it renders crisp at any size.

const VB_W = 668.4;
const VB_H = 280;

export default function Wordmark({ height = 40 }: { height?: number }) {
  const width = (height * VB_W) / VB_H;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <SvgText
        x={334.2}
        y={212}
        textAnchor="middle"
        fontFamily={fontFamily.display}
        fontSize={200}
        letterSpacing={-2}
        fill={colors.text.primary}
      >
        UNLOCK
      </SvgText>
      <Rect
        x={50}
        y={132.8}
        width={568.4}
        height={14.4}
        fill={colors.lime[400]}
        rotation={-9}
        originX={334.2}
        originY={140}
      />
    </Svg>
  );
}
