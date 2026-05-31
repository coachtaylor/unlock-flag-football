import Svg, { Path } from "react-native-svg";
import { colors } from "../../constants/design";

export function Spark({
  data,
  color = colors.orange[500],
  width = 80,
  height = 28,
  fill = true,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  fill?: boolean;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(1, max - min);
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * width,
    height - ((v - min) / span) * (height - 4) - 2,
  ]);
  const d = pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const fillPath = `${d} L${width} ${height} L0 ${height} Z`;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {fill && <Path d={fillPath} fill={color} opacity={0.14} />}
      <Path
        d={d}
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
