import { View, Text } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path as SvgPath,
  Polygon,
  Polyline,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import type {
  DiagramData,
  Path,
  RouteSegment,
  RouteWaypoint,
} from "../types/diagram";
import { colors } from "../constants/design";

type DiagramRendererProps = {
  data: DiagramData;
};

const MOVEMENT_STYLES: Record<
  Path["movement"],
  { color: string; strokeWidth: number; dasharray?: string; label: string }
> = {
  sprint: { color: "#D48A30", strokeWidth: 4, label: "Sprint" },
  backpedal: {
    color: "#2563EB",
    strokeWidth: 4,
    dasharray: "10 6",
    label: "Backpedal",
  },
  shuffle: {
    color: "#16A34A",
    strokeWidth: 4,
    dasharray: "1 5",
    label: "Shuffle",
  },
  jog: { color: "#9CA3AF", strokeWidth: 2.5, label: "Jog" },
};

const ROUTE_COLOR = "#8B5CF6";
const PASS_COLOR = "#5C3A1E";

const YARD = 10;
const FIELD_YARDS_X = 20;
const FIELD_YARDS_Y = 25;
const FIELD_W = FIELD_YARDS_X * YARD;
const FIELD_H = FIELD_YARDS_Y * YARD;
const PAD_LEFT = 14;
const PAD_RIGHT = 4;
const PAD_Y = 4;
const VIEW_W = FIELD_W + PAD_LEFT + PAD_RIGHT;
const VIEW_H = FIELD_H + PAD_Y * 2;
const VIEWBOX = `${-PAD_LEFT} ${-PAD_Y} ${VIEW_W} ${VIEW_H}`;
const CONE_R = 4;

// Black-turf field — mirrors the UFF Mobile design (variant-a-newdrill).
const FIELD_BG = "#0A0E0B";
const FIELD_BG_TOP = "#0E1410";
const LINE_10 = "rgba(244,244,242,0.22)";
const LINE_5 = "rgba(244,244,242,0.12)";
const LINE_1 = "rgba(244,244,242,0.05)";
const HASH_COLOR = "rgba(244,244,242,0.08)";
const NUMBER_COLOR = "rgba(244,244,242,0.55)";
const SIDELINE = "rgba(244,244,242,0.18)";
const PATH_LABEL_COLOR = "rgba(244,244,242,0.7)";
const WATERMARK_COLOR = "rgba(244,244,242,0.25)";

function zigzagPoints(from: RouteWaypoint, to: RouteWaypoint) {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const offset = 8;
  return { cx: mx + px * offset, cy: my + py * offset };
}

function curveControlPoint(from: RouteWaypoint, to: RouteWaypoint) {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const offset = 16;
  return { cx: mx + px * offset, cy: my + py * offset };
}

function lastSegmentArrowDirection(
  prevWp: RouteWaypoint,
  lastWp: RouteWaypoint,
  lastSeg: RouteSegment | undefined
) {
  if (lastSeg?.type === "curve") {
    const { cx, cy } = curveControlPoint(prevWp, lastWp);
    return { dx: lastWp.x - cx, dy: lastWp.y - cy };
  }
  if (lastSeg?.type === "zigzag") {
    const { cx, cy } = zigzagPoints(prevWp, lastWp);
    return { dx: lastWp.x - cx, dy: lastWp.y - cy };
  }
  return { dx: lastWp.x - prevWp.x, dy: lastWp.y - prevWp.y };
}

function renderRouteSegment(
  from: RouteWaypoint,
  to: RouteWaypoint,
  segment: RouteSegment,
  index: number,
  strokeWidth: number = 3
) {
  switch (segment.type) {
    case "zigzag": {
      const { cx, cy } = zigzagPoints(from, to);
      return (
        <Polyline
          key={`rs-${index}`}
          points={`${from.x},${from.y} ${cx},${cy} ${to.x},${to.y}`}
          fill="none"
          stroke={ROUTE_COLOR}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }
    case "curve": {
      const { cx, cy } = curveControlPoint(from, to);
      return (
        <SvgPath
          key={`rs-${index}`}
          d={`M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`}
          fill="none"
          stroke={ROUTE_COLOR}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      );
    }
    default:
      return (
        <Line
          key={`rs-${index}`}
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke={ROUTE_COLOR}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      );
  }
}

function FootballField() {
  const lines: React.ReactNode[] = [];
  for (let depth = 0; depth <= FIELD_YARDS_Y; depth++) {
    const y = FIELD_H - depth * YARD;
    const isTen = depth % 10 === 0;
    const isFive = depth % 5 === 0;
    const stroke = isTen ? LINE_10 : isFive ? LINE_5 : LINE_1;
    const strokeWidth = isTen ? 1 : isFive ? 0.8 : 0.4;
    lines.push(
      <Line
        key={`yl-${depth}`}
        x1={0}
        y1={y}
        x2={FIELD_W}
        y2={y}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }

  const hashLeft = FIELD_W / 3;
  const hashRight = (2 * FIELD_W) / 3;
  const hashes: React.ReactNode[] = [];
  for (let depth = 1; depth < FIELD_YARDS_Y; depth++) {
    if (depth % 5 === 0) continue;
    const y = FIELD_H - depth * YARD;
    hashes.push(
      <Line
        key={`hl-${depth}`}
        x1={hashLeft - 1.5}
        y1={y}
        x2={hashLeft + 1.5}
        y2={y}
        stroke={HASH_COLOR}
        strokeWidth={0.5}
      />,
      <Line
        key={`hr-${depth}`}
        x1={hashRight - 1.5}
        y1={y}
        x2={hashRight + 1.5}
        y2={y}
        stroke={HASH_COLOR}
        strokeWidth={0.5}
      />
    );
  }

  const numbers: React.ReactNode[] = [];
  for (let depth = 0; depth <= FIELD_YARDS_Y; depth += 5) {
    const y = FIELD_H - depth * YARD;
    numbers.push(
      <SvgText
        key={`nl-${depth}`}
        x={-4}
        y={y}
        fontSize={7}
        fill={NUMBER_COLOR}
        textAnchor="end"
        dy={2.5}
      >
        {String(depth)}
      </SvgText>
    );
  }

  return (
    <G>
      <Defs>
        <LinearGradient id="turf-ro" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={FIELD_BG_TOP} />
          <Stop offset="1" stopColor={FIELD_BG} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={FIELD_W} height={FIELD_H} fill="url(#turf-ro)" />
      {lines}
      {hashes}
      <Line x1={0} y1={0} x2={0} y2={FIELD_H} stroke={SIDELINE} strokeWidth={1} />
      <Line
        x1={FIELD_W}
        y1={0}
        x2={FIELD_W}
        y2={FIELD_H}
        stroke={SIDELINE}
        strokeWidth={1}
      />
      {numbers}
      <SvgText
        x={FIELD_W - 2}
        y={8}
        fontSize={5}
        fill={WATERMARK_COLOR}
        textAnchor="end"
        letterSpacing={0.6}
        fontWeight="700"
      >
        WIDTH 20 YDS
      </SvgText>
    </G>
  );
}

export default function DiagramRenderer({ data }: DiagramRendererProps) {
  const coneById = new Map(data.cones.map((c) => [c.id, c]));
  const routes = data.routes ?? [];
  const ballPaths = data.ballPaths ?? [];

  const usedMovements = Array.from(
    new Set(data.paths.map((p) => p.movement))
  ) as Path["movement"][];

  const showLegend =
    usedMovements.length > 0 || routes.length > 0 || ballPaths.length > 0;

  return (
    <View style={{ width: "100%" }}>
      <View
        style={{
          width: "100%",
          borderRadius: 12,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: colors.border.default,
          backgroundColor: FIELD_BG,
        }}
      >
        <Svg
          viewBox={VIEWBOX}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", aspectRatio: VIEW_W / VIEW_H }}
        >
          <FootballField />

          {data.paths.map((path, idx) => {
            const from = coneById.get(path.from);
            const to = coneById.get(path.to);
            if (!from || !to) return null;
            const style = MOVEMENT_STYLES[path.movement];
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;

            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const offset = 9;
            const nx = -dy / len;
            const ny = dx / len;
            const labelX = mx + nx * offset;
            const labelY = my + ny * offset;

            return (
              <G key={`p-${idx}`}>
                <Line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={style.color}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.dasharray}
                  strokeLinecap="round"
                />
                <SvgText
                  x={labelX}
                  y={labelY}
                  fontSize={9}
                  fill={PATH_LABEL_COLOR}
                  textAnchor="middle"
                  dy={3}
                >
                  {`${path.yards}yd ${path.movement}`}
                </SvgText>
              </G>
            );
          })}

          {ballPaths.map((bp) => {
            const from = coneById.get(bp.fromConeId);
            if (!from) return null;
            let tx: number | undefined;
            let ty: number | undefined;
            if (bp.toConeId) {
              const to = coneById.get(bp.toConeId);
              if (!to) return null;
              tx = to.x;
              ty = to.y;
            } else if (bp.toX !== undefined && bp.toY !== undefined) {
              tx = bp.toX;
              ty = bp.toY;
            }
            if (tx === undefined || ty === undefined) return null;
            return (
              <Line
                key={`bp-${bp.id}`}
                x1={from.x}
                y1={from.y}
                x2={tx}
                y2={ty}
                stroke={PASS_COLOR}
                strokeWidth={2}
                strokeDasharray="4 3"
                strokeLinecap="round"
              />
            );
          })}

          {routes.map((route) => {
            const wps = route.waypoints;
            const last = wps[wps.length - 1];
            const prev = wps[wps.length - 2];
            const lastSeg = route.segments[route.segments.length - 1];
            const arrowPoints = (() => {
              if (wps.length < 2 || !last || !prev) return null;
              const { dx, dy } = lastSegmentArrowDirection(prev, last, lastSeg);
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              const arrowSize = 6;
              const p1x = last.x - ux * arrowSize + uy * (arrowSize / 2);
              const p1y = last.y - uy * arrowSize - ux * (arrowSize / 2);
              const p2x = last.x - ux * arrowSize - uy * (arrowSize / 2);
              const p2y = last.y - uy * arrowSize + ux * (arrowSize / 2);
              return `${last.x},${last.y} ${p1x},${p1y} ${p2x},${p2y}`;
            })();
            return (
              <G key={route.id}>
                {route.segments.map((seg, i) => {
                  const from = wps[i];
                  const to = wps[i + 1];
                  if (!from || !to) return null;
                  return renderRouteSegment(from, to, seg, i, 3);
                })}
                {arrowPoints && (
                  <Polygon points={arrowPoints} fill={ROUTE_COLOR} />
                )}
                {wps.length > 0 && (
                  <Circle
                    cx={wps[0].x}
                    cy={wps[0].y}
                    r={5}
                    fill="none"
                    stroke={ROUTE_COLOR}
                    strokeWidth={2}
                  />
                )}
              </G>
            );
          })}

          {data.cones.map((cone) => {
            const isQB = cone.kind === "qb";
            const isFootball = cone.kind === "football";
            if (isFootball) {
              return (
                <G key={cone.id}>
                  <Ellipse
                    cx={cone.x}
                    cy={cone.y}
                    rx={6}
                    ry={3.5}
                    fill={PASS_COLOR}
                    stroke={PASS_COLOR}
                    strokeWidth={1.2}
                  />
                  <Line
                    x1={cone.x - 2.5}
                    y1={cone.y}
                    x2={cone.x + 2.5}
                    y2={cone.y}
                    stroke="#FFFFFF"
                    strokeWidth={0.8}
                  />
                  <Line
                    x1={cone.x - 1.5}
                    y1={cone.y - 1}
                    x2={cone.x - 1.5}
                    y2={cone.y + 1}
                    stroke="#FFFFFF"
                    strokeWidth={0.6}
                  />
                  <Line
                    x1={cone.x}
                    y1={cone.y - 1}
                    x2={cone.x}
                    y2={cone.y + 1}
                    stroke="#FFFFFF"
                    strokeWidth={0.6}
                  />
                  <Line
                    x1={cone.x + 1.5}
                    y1={cone.y - 1}
                    x2={cone.x + 1.5}
                    y2={cone.y + 1}
                    stroke="#FFFFFF"
                    strokeWidth={0.6}
                  />
                </G>
              );
            }
            const defaultColor = isQB ? "#EAB308" : "#D48A30";
            const color = cone.color ?? defaultColor;
            const r = isQB ? CONE_R + 1 : CONE_R;
            const labelText = cone.label?.trim() ?? "";
            // Triangle pointing up — matches the editor (and the cone glyph
            // in the toolbar). QBs stay circular.
            const trianglePoints = `${cone.x},${cone.y - r} ${cone.x - r * 0.85},${cone.y + r * 0.85} ${cone.x + r * 0.85},${cone.y + r * 0.85}`;
            return (
              <G key={cone.id}>
                {isQB ? (
                  <Circle
                    cx={cone.x}
                    cy={cone.y}
                    r={r}
                    fill={color}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                ) : (
                  <Polygon
                    points={trianglePoints}
                    fill={color}
                    stroke={color}
                    strokeWidth={1.2}
                    strokeLinejoin="round"
                  />
                )}
                {isQB ? (
                  <SvgText
                    x={cone.x}
                    y={cone.y}
                    fontSize={5}
                    fontWeight="500"
                    fill="#1F1A05"
                    textAnchor="middle"
                    dy={1.8}
                  >
                    {labelText.slice(0, 4) || "QB"}
                  </SvgText>
                ) : labelText.length > 0 ? (
                  <SvgText
                    x={cone.x}
                    y={cone.y + r + 3.5}
                    fontSize={4}
                    fontWeight="500"
                    fill="#1F1A05"
                    textAnchor="middle"
                  >
                    {labelText.slice(0, 4)}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
      </View>

      {showLegend && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            marginTop: 12,
          }}
        >
          {usedMovements.map((m) => {
            const style = MOVEMENT_STYLES[m];
            return (
              <View
                key={m}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Svg width={20} height={6}>
                  <Line
                    x1={0}
                    y1={3}
                    x2={20}
                    y2={3}
                    stroke={style.color}
                    strokeWidth={style.strokeWidth}
                    strokeDasharray={style.dasharray}
                    strokeLinecap="round"
                  />
                </Svg>
                <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                  {style.label}
                </Text>
              </View>
            );
          })}
          {routes.length > 0 && (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Svg width={20} height={6}>
                <Line
                  x1={0}
                  y1={3}
                  x2={20}
                  y2={3}
                  stroke={ROUTE_COLOR}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              </Svg>
              <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                Route
              </Text>
            </View>
          )}
          {ballPaths.length > 0 && (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Svg width={20} height={6}>
                <Line
                  x1={0}
                  y1={3}
                  x2={20}
                  y2={3}
                  stroke={PASS_COLOR}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  strokeLinecap="round"
                />
              </Svg>
              <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                Pass
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
