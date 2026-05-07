import { useEffect, useRef, useState } from "react";
import {
  Alert,
  PanResponder,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Svg, {
  Circle,
  Ellipse,
  G,
  Line,
  Path as SvgPath,
  Polygon,
  Polyline,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import type {
  BallPath,
  Cone,
  DiagramData,
  Path,
  Route,
  RouteSegment,
  RouteWaypoint,
} from "../types/diagram";
import { colors, radius, spacing } from "../constants/design";

type DiagramEditorProps = {
  value: DiagramData | null;
  onChange: (data: DiagramData) => void;
  onDragStateChange?: (dragging: boolean) => void;
};

type Mode = "normal" | "route" | "ballpath";

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
const SNAP_STEP = YARD / 2;
const CONE_R = 4;
const CONE_HIT_R = 10;
const HIT_R = 18;
const PATH_HIT_R = 8;
const MIN_X = 0;
const MAX_X = FIELD_W;
const MIN_Y = 0;
const MAX_Y = FIELD_H;
const ADD_OFFSET_DEPTH = 5 * YARD;
const ADD_OFFSET_LATERAL = 5 * YARD;
const DRAG_THRESHOLD = 2;
const ALIGN_THRESHOLD = 0.5 * YARD;

const ROUTE_COLOR = "#8B5CF6";
const CONE_COLOR = "#D48A30";
const QB_COLOR = "#EAB308";
const FOOTBALL_COLOR = "#5C3A1E";
const FOOTBALL_LACES = "#FFFFFF";
const BALL_PATH_COLOR = "#5C3A1E";
const SELECT_COLOR = "#2563EB";

const CONE_COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: "#D48A30", label: "Orange" },
  { value: "#EF4444", label: "Red" },
  { value: "#3B82F6", label: "Blue" },
  { value: "#22C55E", label: "Green" },
  { value: "#EAB308", label: "Yellow" },
  { value: "#FFFFFF", label: "White" },
];

const FIELD_BG = "#FFFFFF";
const LINE_10 = "#C8C8C8";
const LINE_5 = "#DCDCDC";
const LINE_1 = "#EEEEEE";
const HASH_COLOR = "#E8E8E8";
const NUMBER_COLOR = "rgba(0,0,0,0.45)";
const SIDELINE = "#D0D0D0";
const PATH_LABEL_COLOR = "#555555";

const MOVEMENTS: Path["movement"][] = ["sprint", "backpedal", "shuffle", "jog"];

const SEGMENT_TYPES: { value: RouteSegment["type"]; label: string }[] = [
  { value: "straight", label: "Straight" },
  { value: "zigzag", label: "Cut" },
  { value: "curve", label: "Curve" },
];

const MOVEMENT_STYLES: Record<
  Path["movement"],
  { color: string; strokeWidth: number; dasharray?: string; label: string }
> = {
  sprint: { color: "#D48A30", strokeWidth: 4, label: "Sprint" },
  backpedal: { color: "#2563EB", strokeWidth: 4, dasharray: "10 6", label: "Backpedal" },
  shuffle: { color: "#16A34A", strokeWidth: 4, dasharray: "1 5", label: "Shuffle" },
  jog: { color: "#9CA3AF", strokeWidth: 2.5, label: "Jog" },
};

function emptyDiagram(): DiagramData {
  return { cones: [], paths: [], routes: [], ballPaths: [], gridScale: 1 };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function snap(v: number) {
  return Math.round(v / SNAP_STEP) * SNAP_STEP;
}

function nextConeId(cones: Cone[]): string {
  let n = cones.length + 1;
  const ids = new Set(cones.map((c) => c.id));
  while (ids.has(`c${n}`)) n++;
  return `c${n}`;
}

function nextQBId(cones: Cone[]): string {
  let n = 1;
  const ids = new Set(cones.map((c) => c.id));
  while (ids.has(`qb${n}`)) n++;
  return `qb${n}`;
}

function nextFootballId(cones: Cone[]): string {
  let n = 1;
  const ids = new Set(cones.map((c) => c.id));
  while (ids.has(`fb${n}`)) n++;
  return `fb${n}`;
}

function nextRouteId(routes: Route[]): string {
  let n = routes.length + 1;
  const ids = new Set(routes.map((r) => r.id));
  while (ids.has(`r${n}`)) n++;
  return `r${n}`;
}

function nextWaypointId(waypoints: RouteWaypoint[]): string {
  let n = waypoints.length + 1;
  const ids = new Set(waypoints.map((w) => w.id));
  while (ids.has(`w${n}`)) n++;
  return `w${n}`;
}

function nextBallPathId(items: BallPath[]): string {
  let n = items.length + 1;
  const ids = new Set(items.map((b) => b.id));
  while (ids.has(`bp${n}`)) n++;
  return `bp${n}`;
}

function nextConePosition(cones: Cone[]): { x: number; y: number } {
  const placed = cones.filter((c) => (c.kind ?? "cone") === "cone");
  if (placed.length === 0) {
    return { x: FIELD_W / 2, y: FIELD_H - 5 * YARD };
  }
  const last = placed[placed.length - 1];
  let y = last.y - ADD_OFFSET_DEPTH;
  let x = last.x;
  if (y < MIN_Y) {
    y = FIELD_H - 5 * YARD;
    x = last.x + ADD_OFFSET_LATERAL;
    if (x > MAX_X) x = 5 * YARD;
  }
  return { x: clamp(snap(x), MIN_X, MAX_X), y: clamp(snap(y), MIN_Y, MAX_Y) };
}

function nextQBPosition(cones: Cone[]): { x: number; y: number } {
  const qbs = cones.filter((c) => c.kind === "qb");
  if (qbs.length === 0) {
    return { x: FIELD_W / 2, y: FIELD_H - YARD };
  }
  const last = qbs[qbs.length - 1];
  let x = last.x + ADD_OFFSET_LATERAL;
  if (x > MAX_X) x = 5 * YARD;
  return { x: clamp(snap(x), MIN_X, MAX_X), y: clamp(snap(last.y), MIN_Y, MAX_Y) };
}

function nextFootballPosition(cones: Cone[]): { x: number; y: number } {
  const balls = cones.filter((c) => c.kind === "football");
  if (balls.length === 0) {
    return { x: FIELD_W / 2 + ADD_OFFSET_LATERAL, y: FIELD_H / 2 };
  }
  const last = balls[balls.length - 1];
  let y = last.y + ADD_OFFSET_DEPTH;
  let x = last.x;
  if (y > MAX_Y) {
    y = 5 * YARD;
    x = last.x + ADD_OFFSET_LATERAL;
    if (x > MAX_X) x = 5 * YARD;
  }
  return { x: clamp(snap(x), MIN_X, MAX_X), y: clamp(snap(y), MIN_Y, MAX_Y) };
}

function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

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
  strokeWidth: number
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
    const sw = isTen ? 1 : isFive ? 0.8 : 0.4;
    lines.push(
      <Line key={`yl-${depth}`} x1={0} y1={y} x2={FIELD_W} y2={y} stroke={stroke} strokeWidth={sw} />
    );
  }

  const hashLeft = FIELD_W / 3;
  const hashRight = (2 * FIELD_W) / 3;
  const hashes: React.ReactNode[] = [];
  for (let depth = 1; depth < FIELD_YARDS_Y; depth++) {
    if (depth % 5 === 0) continue;
    const y = FIELD_H - depth * YARD;
    hashes.push(
      <Line key={`hl-${depth}`} x1={hashLeft - 1.5} y1={y} x2={hashLeft + 1.5} y2={y} stroke={HASH_COLOR} strokeWidth={0.5} />,
      <Line key={`hr-${depth}`} x1={hashRight - 1.5} y1={y} x2={hashRight + 1.5} y2={y} stroke={HASH_COLOR} strokeWidth={0.5} />
    );
  }

  const numbers: React.ReactNode[] = [];
  for (let depth = 0; depth <= FIELD_YARDS_Y; depth += 5) {
    const y = FIELD_H - depth * YARD;
    numbers.push(
      <SvgText key={`nl-${depth}`} x={-4} y={y} fontSize={7} fill={NUMBER_COLOR} textAnchor="end" dy={2.5}>
        {String(depth)}
      </SvgText>
    );
  }

  return (
    <G>
      <Rect x={0} y={0} width={FIELD_W} height={FIELD_H} fill={FIELD_BG} />
      {lines}
      {hashes}
      <Line x1={0} y1={0} x2={0} y2={FIELD_H} stroke={SIDELINE} strokeWidth={1} />
      <Line x1={FIELD_W} y1={0} x2={FIELD_W} y2={FIELD_H} stroke={SIDELINE} strokeWidth={1} />
      {numbers}
    </G>
  );
}

type TouchState =
  | { kind: "cone"; coneId: string; startX: number; startY: number; moved: boolean }
  | { kind: "waypoint"; routeId: string; waypointId: string; startX: number; startY: number; moved: boolean }
  | { kind: "path"; pathIdx: number }
  | { kind: "route"; routeId: string }
  | { kind: "ballpath"; ballPathId: string }
  | { kind: "background"; startX: number; startY: number };

export default function DiagramEditor({
  value,
  onChange,
  onDragStateChange,
}: DiagramEditorProps) {
  const data: DiagramData = value
    ? {
      ...value,
      routes: value.routes ?? [],
      ballPaths: value.ballPaths ?? [],
    }
    : emptyDiagram();

  const [mode, setMode] = useState<Mode>("normal");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [selectedBallPathId, setSelectedBallPathId] = useState<string | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [editingPathIdx, setEditingPathIdx] = useState<number | null>(null);

  const [pendingMovement, setPendingMovement] = useState<Path["movement"]>("sprint");
  const [pendingYards, setPendingYards] = useState<string>("");
  const [pathFormError, setPathFormError] = useState<string | null>(null);

  const [pendingSegmentType, setPendingSegmentType] = useState<RouteSegment["type"]>("straight");
  const [insertAfterIndex, setInsertAfterIndex] = useState<number | null>(null);
  const [insertMode, setInsertMode] = useState<"after" | "before">("after");
  const insertedWaypointIdsRef = useRef<string[]>([]);

  const [pendingBallFromId, setPendingBallFromId] = useState<string | null>(null);

  const [alignGuides, setAlignGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });

  const [layoutSize, setLayoutSize] = useState<{ width: number; height: number } | null>(null);

  // Refs for fresh state inside the PanResponder closure
  const dataRef = useRef(data);
  dataRef.current = data;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const selectedRouteIdRef = useRef(selectedRouteId);
  selectedRouteIdRef.current = selectedRouteId;
  const activeRouteIdRef = useRef(activeRouteId);
  activeRouteIdRef.current = activeRouteId;
  const insertAfterIndexRef = useRef(insertAfterIndex);
  insertAfterIndexRef.current = insertAfterIndex;
  const insertModeRef = useRef(insertMode);
  insertModeRef.current = insertMode;
  const pendingSegmentTypeRef = useRef(pendingSegmentType);
  pendingSegmentTypeRef.current = pendingSegmentType;
  const pendingBallFromIdRef = useRef(pendingBallFromId);
  pendingBallFromIdRef.current = pendingBallFromId;
  const layoutRef = useRef(layoutSize);
  layoutRef.current = layoutSize;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const touchRef = useRef<TouchState | null>(null);

  const update = (next: DiagramData) => onChangeRef.current(next);

  const touchToSvg = (locationX: number, locationY: number) => {
    const l = layoutRef.current;
    if (!l || l.width === 0 || l.height === 0) return { x: 0, y: 0 };
    return {
      x: (locationX / l.width) * VIEW_W - PAD_LEFT,
      y: (locationY / l.height) * VIEW_H - PAD_Y,
    };
  };

  const hitTestCone = (x: number, y: number): Cone | null => {
    const cones = dataRef.current.cones;
    let best: Cone | null = null;
    let bestDist = CONE_HIT_R;
    for (let i = cones.length - 1; i >= 0; i--) {
      const c = cones[i];
      const d = Math.hypot(c.x - x, c.y - y);
      if (d <= bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  };

  const hitTestWaypoint = (
    x: number,
    y: number
  ): { routeId: string; waypointId: string } | null => {
    const routeId = selectedRouteIdRef.current;
    if (!routeId) return null;
    const route = dataRef.current.routes.find((r) => r.id === routeId);
    if (!route) return null;
    let best: { routeId: string; waypointId: string } | null = null;
    let bestDist = HIT_R;
    for (const wp of route.waypoints) {
      const d = Math.hypot(wp.x - x, wp.y - y);
      if (d <= bestDist) {
        bestDist = d;
        best = { routeId, waypointId: wp.id };
      }
    }
    return best;
  };

  const hitTestPath = (x: number, y: number): number | null => {
    const paths = dataRef.current.paths;
    const cones = dataRef.current.cones;
    let bestIdx: number | null = null;
    let bestDist = PATH_HIT_R;
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      const from = cones.find((c) => c.id === p.from);
      const to = cones.find((c) => c.id === p.to);
      if (!from || !to) continue;
      const d = pointToSegmentDistance(x, y, from.x, from.y, to.x, to.y);
      if (d <= bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  const hitTestRoute = (x: number, y: number): string | null => {
    const routes = dataRef.current.routes;
    const activeId = activeRouteIdRef.current;
    let bestId: string | null = null;
    let bestDist = PATH_HIT_R;
    for (const route of routes) {
      if (route.id === activeId) continue;
      for (let i = 0; i < route.segments.length; i++) {
        const from = route.waypoints[i];
        const to = route.waypoints[i + 1];
        if (!from || !to) continue;
        const d = pointToSegmentDistance(x, y, from.x, from.y, to.x, to.y);
        if (d <= bestDist) {
          bestDist = d;
          bestId = route.id;
        }
      }
    }
    return bestId;
  };

  const hitTestBallPath = (x: number, y: number): string | null => {
    const ballPaths = dataRef.current.ballPaths ?? [];
    const cones = dataRef.current.cones;
    let bestId: string | null = null;
    let bestDist = PATH_HIT_R;
    for (const bp of ballPaths) {
      const from = cones.find((c) => c.id === bp.fromConeId);
      if (!from) continue;
      let tx: number | undefined;
      let ty: number | undefined;
      if (bp.toConeId) {
        const to = cones.find((c) => c.id === bp.toConeId);
        if (!to) continue;
        tx = to.x;
        ty = to.y;
      } else if (bp.toX !== undefined && bp.toY !== undefined) {
        tx = bp.toX;
        ty = bp.toY;
      }
      if (tx === undefined || ty === undefined) continue;
      const d = pointToSegmentDistance(x, y, from.x, from.y, tx, ty);
      if (d <= bestDist) {
        bestDist = d;
        bestId = bp.id;
      }
    }
    return bestId;
  };

  const moveConeTo = (coneId: string, svgX: number, svgY: number) => {
    const baseX = clamp(snap(svgX), MIN_X, MAX_X);
    const baseY = clamp(snap(svgY), MIN_Y, MAX_Y);
    let sx = baseX;
    let sy = baseY;

    const dragged = dataRef.current.cones.find((c) => c.id === coneId);
    const skipAlign = dragged?.kind === "qb" || dragged?.kind === "football";
    const others = dataRef.current.cones.filter((c) => c.id !== coneId);
    let alignX: number | null = null;
    let alignY: number | null = null;

    if (!skipAlign) {
      let bestDx = ALIGN_THRESHOLD + 1;
      let bestDy = ALIGN_THRESHOLD + 1;
      for (const o of others) {
        const dx = Math.abs(sx - o.x);
        if (dx <= ALIGN_THRESHOLD && dx < bestDx) {
          bestDx = dx;
          alignX = o.x;
        }
        const dy = Math.abs(sy - o.y);
        if (dy <= ALIGN_THRESHOLD && dy < bestDy) {
          bestDy = dy;
          alignY = o.y;
        }
      }
      if (alignX !== null) sx = alignX;
      if (alignY !== null) sy = alignY;

      if (others.some((o) => o.x === sx && o.y === sy)) {
        if (alignX !== null) {
          sx = baseX;
          alignX = null;
        }
        if (others.some((o) => o.x === sx && o.y === sy) && alignY !== null) {
          sy = baseY;
          alignY = null;
        }
      }
    }

    setAlignGuides({ x: alignX, y: alignY });

    const cones = dataRef.current.cones.map((c) =>
      c.id === coneId ? { ...c, x: sx, y: sy } : c
    );
    update({ ...dataRef.current, cones });
  };

  const moveWaypointTo = (
    routeId: string,
    waypointId: string,
    svgX: number,
    svgY: number
  ) => {
    const sx = clamp(snap(svgX), MIN_X, MAX_X);
    const sy = clamp(snap(svgY), MIN_Y, MAX_Y);
    const routes = dataRef.current.routes.map((r) =>
      r.id === routeId
        ? {
          ...r,
          waypoints: r.waypoints.map((w) =>
            w.id === waypointId ? { ...w, x: sx, y: sy } : w
          ),
        }
        : r
    );
    update({ ...dataRef.current, routes });
  };

  const addRouteWaypoint = (svgX: number, svgY: number) => {
    const activeId = activeRouteIdRef.current;
    if (!activeId) return;
    const route = dataRef.current.routes.find((r) => r.id === activeId);
    if (!route) return;
    const sx = clamp(snap(svgX), MIN_X, MAX_X);
    const sy = clamp(snap(svgY), MIN_Y, MAX_Y);
    const wpId = nextWaypointId(route.waypoints);
    const newWp: RouteWaypoint = { id: wpId, x: sx, y: sy };

    const idx = insertAfterIndexRef.current;
    const segType = pendingSegmentTypeRef.current;
    let waypoints: RouteWaypoint[];
    let segments: RouteSegment[];

    if (route.waypoints.length === 0) {
      waypoints = [newWp];
      segments = [];
    } else if (insertModeRef.current === "before" && idx !== null) {
      waypoints = [
        ...route.waypoints.slice(0, idx),
        newWp,
        ...route.waypoints.slice(idx),
      ];
      segments = [
        ...route.segments.slice(0, idx),
        { type: segType },
        ...route.segments.slice(idx),
      ];
    } else if (idx === null || idx >= route.waypoints.length - 1) {
      waypoints = [...route.waypoints, newWp];
      segments = [...route.segments, { type: segType }];
    } else {
      waypoints = [
        ...route.waypoints.slice(0, idx + 1),
        newWp,
        ...route.waypoints.slice(idx + 1),
      ];
      const outbound = route.segments[idx];
      segments = [
        ...route.segments.slice(0, idx),
        { type: segType },
        outbound,
        ...route.segments.slice(idx + 1),
      ];
    }

    const routes = dataRef.current.routes.map((r) =>
      r.id === activeId ? { ...r, waypoints, segments } : r
    );
    update({ ...dataRef.current, routes });

    insertedWaypointIdsRef.current.push(wpId);
    if (insertModeRef.current === "before" && idx !== null) {
      setInsertAfterIndex(idx);
    } else if (idx === null) {
      setInsertAfterIndex(waypoints.length - 1);
    } else {
      setInsertAfterIndex(idx + 1);
    }
  };

  const placeBallPathTarget = (svgX: number, svgY: number) => {
    const fromId = pendingBallFromIdRef.current;
    if (!fromId) return;
    let nearest: Cone | null = null;
    let nearestDist = CONE_HIT_R;
    for (const c of dataRef.current.cones) {
      if (c.id === fromId) continue;
      const d = Math.hypot(c.x - svgX, c.y - svgY);
      if (d <= nearestDist) {
        nearestDist = d;
        nearest = c;
      }
    }
    const existing = dataRef.current.ballPaths ?? [];
    const id = nextBallPathId(existing);
    const newBp: BallPath = nearest
      ? { id, fromConeId: fromId, toConeId: nearest.id }
      : {
        id,
        fromConeId: fromId,
        toX: clamp(snap(svgX), MIN_X, MAX_X),
        toY: clamp(snap(svgY), MIN_Y, MAX_Y),
      };
    update({ ...dataRef.current, ballPaths: [...existing, newBp] });
    setPendingBallFromId(null);
    setMode("normal");
  };

  // Touch handlers — these are called via handlersRef so they always see fresh state
  const handleTouchStart = (svgX: number, svgY: number) => {
    const m = modeRef.current;
    if (m === "normal") {
      const cone = hitTestCone(svgX, svgY);
      if (cone) {
        touchRef.current = {
          kind: "cone",
          coneId: cone.id,
          startX: svgX,
          startY: svgY,
          moved: false,
        };
        return;
      }
      const wp = hitTestWaypoint(svgX, svgY);
      if (wp) {
        touchRef.current = {
          kind: "waypoint",
          routeId: wp.routeId,
          waypointId: wp.waypointId,
          startX: svgX,
          startY: svgY,
          moved: false,
        };
        return;
      }
      const pathIdx = hitTestPath(svgX, svgY);
      if (pathIdx !== null) {
        touchRef.current = { kind: "path", pathIdx };
        return;
      }
      const routeId = hitTestRoute(svgX, svgY);
      if (routeId) {
        touchRef.current = { kind: "route", routeId };
        return;
      }
      const bpId = hitTestBallPath(svgX, svgY);
      if (bpId) {
        touchRef.current = { kind: "ballpath", ballPathId: bpId };
        return;
      }
    }
    touchRef.current = { kind: "background", startX: svgX, startY: svgY };
  };

  const handleTouchMove = (svgX: number, svgY: number) => {
    const t = touchRef.current;
    if (!t) return;
    if (t.kind === "cone") {
      if (
        !t.moved &&
        Math.abs(svgX - t.startX) < DRAG_THRESHOLD &&
        Math.abs(svgY - t.startY) < DRAG_THRESHOLD
      )
        return;
      t.moved = true;
      moveConeTo(t.coneId, svgX, svgY);
    } else if (t.kind === "waypoint") {
      if (
        !t.moved &&
        Math.abs(svgX - t.startX) < DRAG_THRESHOLD &&
        Math.abs(svgY - t.startY) < DRAG_THRESHOLD
      )
        return;
      t.moved = true;
      moveWaypointTo(t.routeId, t.waypointId, svgX, svgY);
    }
  };

  const handleTouchEnd = (svgX: number, svgY: number) => {
    const t = touchRef.current;
    touchRef.current = null;
    setAlignGuides({ x: null, y: null });
    if (!t) return;

    const m = modeRef.current;

    if (m === "route") {
      addRouteWaypoint(svgX, svgY);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
      return;
    }
    if (m === "ballpath") {
      placeBallPathTarget(svgX, svgY);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
      return;
    }

    if (t.kind === "cone") {
      if (!t.moved) {
        setSelectedId(t.coneId);
        setSelectedRouteId(null);
        setSelectedWaypointId(null);
        setSelectedBallPathId(null);
        setEditingPathIdx(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
      }
    } else if (t.kind === "waypoint") {
      if (!t.moved) {
        setSelectedWaypointId(t.waypointId);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
      }
    } else if (t.kind === "path") {
      const path = dataRef.current.paths[t.pathIdx];
      if (!path) return;
      setSelectedId(null);
      setSelectedRouteId(null);
      setSelectedWaypointId(null);
      setSelectedBallPathId(null);
      setEditingPathIdx(t.pathIdx);
      setPendingMovement(path.movement);
      setPendingYards(String(path.yards));
      setPathFormError(null);
    } else if (t.kind === "route") {
      setSelectedId(null);
      setEditingPathIdx(null);
      setSelectedBallPathId(null);
      if (selectedRouteIdRef.current !== t.routeId) {
        setSelectedWaypointId(null);
      }
      setSelectedRouteId(t.routeId);
    } else if (t.kind === "ballpath") {
      setSelectedBallPathId(t.ballPathId);
      setSelectedId(null);
      setSelectedRouteId(null);
      setSelectedWaypointId(null);
      setEditingPathIdx(null);
    } else {
      setSelectedId(null);
      setSelectedRouteId(null);
      setSelectedWaypointId(null);
      setSelectedBallPathId(null);
      setEditingPathIdx(null);
    }
  };

  const handlersRef = useRef({
    start: handleTouchStart,
    move: handleTouchMove,
    end: handleTouchEnd,
  });
  handlersRef.current = {
    start: handleTouchStart,
    move: handleTouchMove,
    end: handleTouchEnd,
  };

  const onDragStateChangeRef = useRef(onDragStateChange);
  onDragStateChangeRef.current = onDragStateChange;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        onDragStateChangeRef.current?.(true);
        const { locationX, locationY } = e.nativeEvent;
        const { x, y } = touchToSvg(locationX, locationY);
        handlersRef.current.start(x, y);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        const { x, y } = touchToSvg(locationX, locationY);
        handlersRef.current.move(x, y);
      },
      onPanResponderRelease: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        const { x, y } = touchToSvg(locationX, locationY);
        handlersRef.current.end(x, y);
        onDragStateChangeRef.current?.(false);
      },
      onPanResponderTerminate: () => {
        touchRef.current = null;
        setAlignGuides({ x: null, y: null });
        onDragStateChangeRef.current?.(false);
      },
    })
  ).current;

  const resetPathDrawingState = () => {
    setPendingMovement("sprint");
    setPendingYards("");
    setPathFormError(null);
  };

  const handleAddCone = () => {
    if (mode !== "normal") return;
    const id = nextConeId(data.cones);
    const { x, y } = nextConePosition(data.cones);
    const placed = data.cones.filter((c) => (c.kind ?? "cone") === "cone");
    const label = placed.length === 0 ? "Start" : "";
    const newCone: Cone = { id, x, y, label, kind: "cone" };
    update({ ...data, cones: [...data.cones, newCone] });
    setSelectedId(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
  };

  const handleAddQB = () => {
    if (mode !== "normal") return;
    const id = nextQBId(data.cones);
    const { x, y } = nextQBPosition(data.cones);
    const newQB: Cone = { id, x, y, label: "QB", kind: "qb" };
    update({ ...data, cones: [...data.cones, newQB] });
    setSelectedId(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
  };

  const handleAddFootball = () => {
    if (mode !== "normal") return;
    const id = nextFootballId(data.cones);
    const { x, y } = nextFootballPosition(data.cones);
    const newBall: Cone = { id, x, y, label: "Ball", kind: "football" };
    update({ ...data, cones: [...data.cones, newBall] });
    setSelectedId(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
  };

  const handleStartRouteDrawing = () => {
    if (mode === "route") {
      finishActiveRoute();
      return;
    }
    const id = nextRouteId(data.routes);
    const newRoute: Route = { id, waypoints: [], segments: [] };
    update({ ...data, routes: [...data.routes, newRoute] });
    setActiveRouteId(id);
    setSelectedId(null);
    setSelectedRouteId(null);
    setSelectedWaypointId(null);
    setEditingPathIdx(null);
    setSelectedBallPathId(null);
    resetPathDrawingState();
    setPendingSegmentType("straight");
    setInsertAfterIndex(null);
    setInsertMode("after");
    insertedWaypointIdsRef.current = [];
    setMode("route");
  };

  const finishActiveRoute = () => {
    const id = activeRouteId;
    if (!id) {
      setMode("normal");
      return;
    }
    const route = data.routes.find((r) => r.id === id);
    if (!route || route.waypoints.length < 2) {
      const routes = data.routes.filter((r) => r.id !== id);
      update({ ...data, routes });
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    }
    setActiveRouteId(null);
    setInsertAfterIndex(null);
    setInsertMode("after");
    insertedWaypointIdsRef.current = [];
    setMode("normal");
  };

  const handleCancelRoute = () => {
    if (activeRouteId) {
      const routes = data.routes.filter((r) => r.id !== activeRouteId);
      update({ ...data, routes });
    }
    setActiveRouteId(null);
    setInsertAfterIndex(null);
    setInsertMode("after");
    insertedWaypointIdsRef.current = [];
    setMode("normal");
  };

  const handleUndoLastWaypoint = () => {
    if (!activeRouteId) return;
    const route = data.routes.find((r) => r.id === activeRouteId);
    if (!route || route.waypoints.length === 0) return;

    const stack = insertedWaypointIdsRef.current;
    let i: number;
    if (stack.length > 0) {
      const lastId = stack[stack.length - 1];
      const found = route.waypoints.findIndex((w) => w.id === lastId);
      if (found < 0) {
        stack.pop();
        return;
      }
      i = found;
    } else {
      i = route.waypoints.length - 1;
    }

    const waypoints = route.waypoints.filter((_, k) => k !== i);
    let segments: RouteSegment[];
    if (waypoints.length === 0) {
      segments = [];
    } else if (i === 0) {
      segments = route.segments.slice(1);
    } else {
      segments = [...route.segments.slice(0, i - 1), ...route.segments.slice(i)];
    }

    if (waypoints.length === 0) {
      const routes = data.routes.filter((r) => r.id !== activeRouteId);
      update({ ...data, routes });
    } else {
      const routes = data.routes.map((r) =>
        r.id === activeRouteId ? { ...r, waypoints, segments } : r
      );
      update({ ...data, routes });
    }
    if (stack.length > 0) stack.pop();
    if (insertAfterIndex !== null && i <= insertAfterIndex && insertAfterIndex > 0) {
      setInsertAfterIndex(insertAfterIndex - 1);
    }
  };

  const handleContinueRoute = () => {
    if (!selectedRouteId) return;
    const route = data.routes.find((r) => r.id === selectedRouteId);
    if (!route) return;
    let idx = route.waypoints.length - 1;
    let im: "after" | "before" = "after";
    if (selectedWaypointId) {
      const i = route.waypoints.findIndex((w) => w.id === selectedWaypointId);
      if (i === 0 && route.waypoints.length > 1) {
        idx = 0;
        im = "before";
      } else if (i >= 0) {
        idx = i;
      }
    }
    setActiveRouteId(selectedRouteId);
    setSelectedRouteId(null);
    setSelectedWaypointId(null);
    setSelectedId(null);
    setEditingPathIdx(null);
    setPendingSegmentType("straight");
    setInsertAfterIndex(idx);
    setInsertMode(im);
    insertedWaypointIdsRef.current = [];
    setMode("route");
  };

  const handleDeleteWaypoint = () => {
    if (!selectedRouteId || !selectedWaypointId) return;
    const route = data.routes.find((r) => r.id === selectedRouteId);
    if (!route) return;
    const idx = route.waypoints.findIndex((w) => w.id === selectedWaypointId);
    if (idx < 0) return;

    const waypoints = route.waypoints.filter((_, i) => i !== idx);
    const segments =
      idx === 0 ? route.segments.slice(1) : route.segments.filter((_, i) => i !== idx - 1);

    if (waypoints.length < 2) {
      const routes = data.routes.filter((r) => r.id !== selectedRouteId);
      update({ ...data, routes });
      setSelectedRouteId(null);
      setSelectedWaypointId(null);
      return;
    }

    const routes = data.routes.map((r) =>
      r.id === selectedRouteId ? { ...r, waypoints, segments } : r
    );
    update({ ...data, routes });
    setSelectedWaypointId(null);
  };

  const handleDeleteRoute = () => {
    if (!selectedRouteId) return;
    const routes = data.routes.filter((r) => r.id !== selectedRouteId);
    update({ ...data, routes });
    setSelectedRouteId(null);
    setSelectedWaypointId(null);
  };

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    const cones = data.cones.filter((c) => c.id !== selectedId);
    const paths = data.paths.filter((p) => p.from !== selectedId && p.to !== selectedId);
    const ballPaths = (data.ballPaths ?? []).filter(
      (b) => b.fromConeId !== selectedId && b.toConeId !== selectedId
    );
    update({ ...data, cones, paths, ballPaths });
    setSelectedId(null);
  };

  const handleStartBallPath = () => {
    if (!selectedId) return;
    const cone = data.cones.find((c) => c.id === selectedId);
    if (!cone || cone.kind !== "football") return;
    setPendingBallFromId(cone.id);
    setSelectedId(null);
    setSelectedRouteId(null);
    setSelectedWaypointId(null);
    setEditingPathIdx(null);
    setSelectedBallPathId(null);
    setMode("ballpath");
  };

  const handleCancelBallPath = () => {
    setPendingBallFromId(null);
    setMode("normal");
  };

  const handleDeleteBallPath = () => {
    if (!selectedBallPathId) return;
    const ballPaths = (data.ballPaths ?? []).filter((b) => b.id !== selectedBallPathId);
    update({ ...data, ballPaths });
    setSelectedBallPathId(null);
  };

  const handleLabelChange = (label: string) => {
    if (!selectedId) return;
    const cones = data.cones.map((c) => (c.id === selectedId ? { ...c, label } : c));
    update({ ...data, cones });
  };

  const handleColorChange = (color: string) => {
    if (!selectedId) return;
    const cones = data.cones.map((c) =>
      c.id === selectedId ? { ...c, color } : c
    );
    update({ ...data, cones });
  };

  const handleConfirmPath = () => {
    if (editingPathIdx === null) return;
    const existing = data.paths[editingPathIdx];
    if (!existing) return;
    const yards = Number(pendingYards);
    if (!pendingYards.trim() || !Number.isFinite(yards) || yards <= 0) {
      setPathFormError("Enter a yard distance.");
      return;
    }
    const newPath: Path = {
      from: existing.from,
      to: existing.to,
      movement: pendingMovement,
      yards,
    };
    const paths = data.paths.map((p, i) => (i === editingPathIdx ? newPath : p));
    update({ ...data, paths });
    setEditingPathIdx(null);
    resetPathDrawingState();
  };

  const handleDeletePath = () => {
    if (editingPathIdx === null) return;
    const paths = data.paths.filter((_, i) => i !== editingPathIdx);
    update({ ...data, paths });
    setEditingPathIdx(null);
    resetPathDrawingState();
  };

  const handleClearAll = () => {
    Alert.alert(
      "Clear diagram?",
      "This will remove all cones, routes, and paths. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            update({ ...data, cones: [], paths: [], routes: [], ballPaths: [] });
            setSelectedId(null);
            setSelectedRouteId(null);
            setSelectedWaypointId(null);
            setSelectedBallPathId(null);
            setActiveRouteId(null);
            setEditingPathIdx(null);
            setMode("normal");
          },
        },
      ]
    );
  };

  const coneById = new Map(data.cones.map((c) => [c.id, c]));
  const selectedCone = selectedId
    ? data.cones.find((c) => c.id === selectedId) ?? null
    : null;
  const selectedRoute = selectedRouteId
    ? data.routes.find((r) => r.id === selectedRouteId) ?? null
    : null;
  const activeRoute = activeRouteId
    ? data.routes.find((r) => r.id === activeRouteId) ?? null
    : null;
  const canFinishRoute = !!activeRoute && activeRoute.waypoints.length >= 2;

  return (
    <View style={{ width: "100%" }}>
      <View
        onLayout={(e) =>
          setLayoutSize({
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          })
        }
        style={{
          width: "100%",
          aspectRatio: VIEW_W / VIEW_H,
          borderRadius: radius.lg,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: colors.border.card,
          backgroundColor: "#FFFFFF",
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 12,
          elevation: 6,
        }}
        {...panResponder.panHandlers}
      >
        <Svg
          viewBox={VIEWBOX}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", height: "100%" }}
        >
          <FootballField />

          {alignGuides.x !== null && (
            <Line
              x1={alignGuides.x}
              y1={0}
              x2={alignGuides.x}
              y2={FIELD_H}
              stroke="#D48A30"
              strokeWidth={0.8}
              strokeDasharray="3 3"
              opacity={0.7}
            />
          )}
          {alignGuides.y !== null && (
            <Line
              x1={0}
              y1={alignGuides.y}
              x2={FIELD_W}
              y2={alignGuides.y}
              stroke="#D48A30"
              strokeWidth={0.8}
              strokeDasharray="3 3"
              opacity={0.7}
            />
          )}

          {data.paths.map((path, idx) => {
            const from = coneById.get(path.from);
            const to = coneById.get(path.to);
            if (!from || !to) return null;
            const style = MOVEMENT_STYLES[path.movement];
            const isSel = editingPathIdx === idx;
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
                  strokeWidth={isSel ? style.strokeWidth + 2 : style.strokeWidth}
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
                  {`${path.yards}yd`}
                </SvgText>
              </G>
            );
          })}

          {(data.ballPaths ?? []).map((bp) => {
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
            const isSel = selectedBallPathId === bp.id;
            return (
              <Line
                key={`bp-${bp.id}`}
                x1={from.x}
                y1={from.y}
                x2={tx}
                y2={ty}
                stroke={BALL_PATH_COLOR}
                strokeWidth={isSel ? 3 : 2}
                strokeDasharray="4 3"
                strokeLinecap="round"
              />
            );
          })}

          {data.routes.map((route) => {
            const isSel = route.id === selectedRouteId;
            const isActive = route.id === activeRouteId;
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
            const segWidth = isSel ? 4 : 3;
            return (
              <G key={route.id}>
                {route.segments.map((seg, i) => {
                  const from = wps[i];
                  const to = wps[i + 1];
                  if (!from || !to) return null;
                  return renderRouteSegment(from, to, seg, i, segWidth);
                })}
                {arrowPoints && <Polygon points={arrowPoints} fill={ROUTE_COLOR} />}
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
                {isActive &&
                  wps.map((wp, i) =>
                    i > 0 && i < wps.length - 1 ? (
                      <Circle
                        key={wp.id}
                        cx={wp.x}
                        cy={wp.y}
                        r={2}
                        fill={ROUTE_COLOR}
                        opacity={0.6}
                      />
                    ) : null
                  )}
                {isActive &&
                  insertAfterIndex !== null &&
                  (insertMode === "before" || insertAfterIndex < wps.length - 1) &&
                  wps[insertAfterIndex] && (
                    <Circle
                      cx={wps[insertAfterIndex].x}
                      cy={wps[insertAfterIndex].y}
                      r={7}
                      fill="none"
                      stroke={SELECT_COLOR}
                      strokeWidth={1.5}
                      strokeDasharray="2 2"
                    />
                  )}
                {isSel &&
                  wps.map((wp) => {
                    const isWpSel = wp.id === selectedWaypointId;
                    return (
                      <Circle
                        key={`wph-${wp.id}`}
                        cx={wp.x}
                        cy={wp.y}
                        r={4}
                        fill={isWpSel ? SELECT_COLOR : CONE_COLOR}
                        stroke="#FFFFFF"
                        strokeWidth={1.5}
                      />
                    );
                  })}
              </G>
            );
          })}

          {data.cones.map((cone) => {
            const isSel = cone.id === selectedId;
            const isQB = cone.kind === "qb";
            const isFootball = cone.kind === "football";
            if (isFootball) {
              const fillColor = isSel ? SELECT_COLOR : FOOTBALL_COLOR;
              const ringColor = isSel ? SELECT_COLOR : FOOTBALL_COLOR;
              return (
                <G key={cone.id}>
                  <Ellipse
                    cx={cone.x}
                    cy={cone.y}
                    rx={6}
                    ry={3.5}
                    fill={fillColor}
                    stroke={ringColor}
                    strokeWidth={1.2}
                  />
                  <Line x1={cone.x - 2.5} y1={cone.y} x2={cone.x + 2.5} y2={cone.y} stroke={FOOTBALL_LACES} strokeWidth={0.8} />
                  <Line x1={cone.x - 1.5} y1={cone.y - 1} x2={cone.x - 1.5} y2={cone.y + 1} stroke={FOOTBALL_LACES} strokeWidth={0.6} />
                  <Line x1={cone.x} y1={cone.y - 1} x2={cone.x} y2={cone.y + 1} stroke={FOOTBALL_LACES} strokeWidth={0.6} />
                  <Line x1={cone.x + 1.5} y1={cone.y - 1} x2={cone.x + 1.5} y2={cone.y + 1} stroke={FOOTBALL_LACES} strokeWidth={0.6} />
                </G>
              );
            }
            const baseColor = isQB
              ? cone.color ?? QB_COLOR
              : cone.color ?? CONE_COLOR;
            const fillColor = isSel ? SELECT_COLOR : baseColor;
            const ringColor = isSel ? SELECT_COLOR : baseColor;
            const r = isQB ? CONE_R + 1 : CONE_R;
            const labelText = cone.label?.trim() ?? "";
            const showLabel = labelText.length > 0;
            const trianglePoints = `${cone.x},${cone.y - r} ${cone.x - r * 0.85},${cone.y + r * 0.85} ${cone.x + r * 0.85},${cone.y + r * 0.85}`;
            return (
              <G key={cone.id}>
                {isQB ? (
                  <Circle
                    cx={cone.x}
                    cy={cone.y}
                    r={r}
                    fill={fillColor}
                    stroke={ringColor}
                    strokeWidth={1.5}
                  />
                ) : (
                  <Polygon
                    points={trianglePoints}
                    fill={fillColor}
                    stroke={ringColor}
                    strokeWidth={1.2}
                    strokeLinejoin="round"
                  />
                )}
                {showLabel &&
                  (isQB ? (
                    <SvgText
                      x={cone.x}
                      y={cone.y}
                      fontSize={5}
                      fontWeight="500"
                      fill="#1F1A05"
                      textAnchor="middle"
                      dy={1.8}
                    >
                      {labelText.slice(0, 4)}
                    </SvgText>
                  ) : (
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
                  ))}
              </G>
            );
          })}
        </Svg>
        {data.cones.length === 0 && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: colors.text.muted,
                fontWeight: "500",
                backgroundColor: "rgba(255,255,255,0.85)",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: radius.md,
              }}
            >
              Place cones to define your setup
            </Text>
          </View>
        )}
      </View>

      {(data.cones.length > 0 || data.routes.length > 0) && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: spacing.sm,
            right: spacing.sm,
          }}
        >
          <Pressable
            onPress={handleClearAll}
            accessibilityLabel="Clear all"
            hitSlop={8}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.92)",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(0,0,0,0.08)",
              shadowColor: "#000",
              shadowOpacity: 0.18,
              shadowOffset: { width: 0, height: 2 },
              shadowRadius: 4,
              elevation: 3,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Ionicons
              name="trash"
              size={18}
              color="rgba(0,0,0,0.65)"
            />
          </Pressable>
        </View>
      )}

      <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
        {mode === "normal" &&
          !selectedCone &&
          !selectedRoute &&
          !selectedBallPathId &&
          editingPathIdx === null && (
            <Toolbar
              onAddCone={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleAddCone();
              }}
              onAddQB={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleAddQB();
              }}
              onAddFootball={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleAddFootball();
              }}
              onToggleRoute={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleStartRouteDrawing();
              }}
            />
          )}

        {mode === "route" && (
          <View style={{ gap: spacing.md }}>
            <ContextLabel>Next Segment</ContextLabel>
            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
              {SEGMENT_TYPES.map((t) => (
                <PillButton
                  key={t.value}
                  label={t.label}
                  selected={pendingSegmentType === t.value}
                  onPress={() => setPendingSegmentType(t.value)}
                />
              ))}
            </View>
            <Text style={{ fontSize: 13, color: colors.text.secondary }}>
              Tap the field to place route points.
            </Text>
            <View
              style={{
                flexDirection: "row",
                gap: spacing.sm,
                alignItems: "center",
              }}
            >
              <PrimaryAction
                label="Finish"
                onPress={finishActiveRoute}
                disabled={!canFinishRoute}
              />
              <SecondaryAction
                label="Undo"
                onPress={handleUndoLastWaypoint}
                disabled={!activeRoute || activeRoute.waypoints.length === 0}
              />
              <View style={{ flex: 1 }} />
              <TextAction label="Cancel" onPress={handleCancelRoute} />
            </View>
          </View>
        )}

        {mode === "ballpath" && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              flexWrap: "wrap",
            }}
          >
            <Text style={{ fontSize: 13, color: colors.text.secondary, flex: 1 }}>
              Tap a player or any point to draw the pass line.
            </Text>
            <TextAction label="Cancel" onPress={handleCancelBallPath} />
          </View>
        )}

        {selectedBallPathId && mode === "normal" && (
          <View style={{ gap: spacing.sm }}>
            <ContextLabel>Selected Pass Line</ContextLabel>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TextAction
                label="Delete"
                onPress={handleDeleteBallPath}
                color={colors.error}
              />
              <View style={{ flex: 1 }} />
              <TextAction
                label="Done"
                onPress={() => setSelectedBallPathId(null)}
              />
            </View>
          </View>
        )}

        {selectedRoute && mode === "normal" && (
          <View style={{ gap: spacing.sm }}>
            <ContextLabel>Selected Route</ContextLabel>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.sm,
                alignItems: "center",
              }}
            >
              <PrimaryAction label="Continue" onPress={handleContinueRoute} />
              {selectedWaypointId && (
                <SecondaryAction
                  label="Delete Point"
                  onPress={handleDeleteWaypoint}
                  textColor={colors.error}
                />
              )}
              <TextAction
                label="Delete Route"
                onPress={handleDeleteRoute}
                color={colors.error}
              />
              <View style={{ flex: 1 }} />
              <TextAction
                label="Done"
                onPress={() => {
                  setSelectedRouteId(null);
                  setSelectedWaypointId(null);
                }}
              />
            </View>
          </View>
        )}

        {editingPathIdx !== null && (
          <View style={{ gap: spacing.sm }}>
            <ContextLabel>Edit Path</ContextLabel>
            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
              {MOVEMENTS.map((m) => (
                <PillButton
                  key={m}
                  label={MOVEMENT_STYLES[m].label}
                  selected={pendingMovement === m}
                  onPress={() => setPendingMovement(m)}
                />
              ))}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <TextInput
                value={pendingYards}
                onChangeText={setPendingYards}
                placeholder="0"
                placeholderTextColor={colors.text.muted}
                keyboardType="decimal-pad"
                style={{
                  width: 80,
                  height: 44,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border.card,
                  backgroundColor: colors.surface.base,
                  color: colors.text.primary,
                  fontSize: 15,
                }}
              />
              <Text style={{ fontSize: 13, color: colors.text.secondary }}>
                yards
              </Text>
            </View>
            {pathFormError && (
              <Text style={{ fontSize: 13, color: colors.errorLight }}>
                {pathFormError}
              </Text>
            )}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.lg,
                marginTop: spacing.xs,
              }}
            >
              <PrimaryAction label="Update" onPress={handleConfirmPath} />
              <TextAction
                label="Delete Path"
                onPress={handleDeletePath}
                color={colors.error}
              />
              <View style={{ flex: 1 }} />
              <TextAction
                label="Cancel"
                onPress={() => {
                  setEditingPathIdx(null);
                  resetPathDrawingState();
                }}
              />
            </View>
          </View>
        )}

        {selectedCone && editingPathIdx === null && (
          <View style={{ gap: spacing.md }}>
            <ContextLabel>
              {selectedCone.kind === "qb"
                ? "Selected QB"
                : selectedCone.kind === "football"
                  ? "Selected Football"
                  : "Selected Cone"}
            </ContextLabel>
            <TextInput
              value={selectedCone.label}
              onChangeText={handleLabelChange}
              placeholder="Label (optional)"
              placeholderTextColor={colors.text.muted}
              maxLength={4}
              style={{
                minHeight: 44,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border.card,
                backgroundColor: colors.surface.input,
                color: colors.text.primary,
                fontSize: 15,
              }}
            />
            {selectedCone.kind !== "football" && (
              <View style={{ gap: spacing.xs }}>
                <Text
                  style={{
                    fontSize: 11,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    color: colors.text.label,
                    fontWeight: "500",
                  }}
                >
                  Color
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    gap: spacing.sm,
                    flexWrap: "wrap",
                    minHeight: 44,
                    alignItems: "center",
                  }}
                >
                  {CONE_COLOR_OPTIONS.map((opt) => {
                    const fallback =
                      selectedCone.kind === "qb" ? QB_COLOR : CONE_COLOR;
                    const current = selectedCone.color ?? fallback;
                    return (
                      <ColorSwatch
                        key={opt.value}
                        color={opt.value}
                        label={opt.label}
                        selected={current === opt.value}
                        onPress={() => handleColorChange(opt.value)}
                      />
                    );
                  })}
                </View>
              </View>
            )}
            {selectedCone.kind === "football" && (
              <SecondaryAction
                label="+ Add Pass Line"
                onPress={handleStartBallPath}
              />
            )}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <TextAction
                label="Delete"
                onPress={handleDeleteSelected}
                color={colors.error}
              />
              <View style={{ flex: 1 }} />
              <TextAction
                label="Done"
                onPress={() => setSelectedId(null)}
              />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

function Toolbar({
  onAddCone,
  onAddQB,
  onAddFootball,
  onToggleRoute,
}: {
  onAddCone: () => void;
  onAddQB: () => void;
  onAddFootball: () => void;
  onToggleRoute: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      <ToolbarButton
        label="Cone"
        icon="triangle"
        iconColor={colors.orange[500]}
        onPress={onAddCone}
      />
      <ToolbarButton
        label="QB"
        icon="person"
        iconColor={QB_COLOR}
        onPress={onAddQB}
      />
      <ToolbarButton
        label="Football"
        icon="american-football"
        iconColor={FOOTBALL_COLOR}
        onPress={onAddFootball}
      />
      <ToolbarButton
        label="Route"
        icon="git-branch"
        iconColor={ROUTE_COLOR}
        onPress={onToggleRoute}
      />
    </View>
  );
}

function ContextLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: colors.text.label,
        fontWeight: "500",
      }}
    >
      {children}
    </Text>
  );
}

function ColorSwatch({
  color,
  label,
  selected,
  onPress,
}: {
  color: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => ({
        padding: 2,
        borderRadius: 22,
        borderWidth: selected ? 2 : 0,
        borderColor: colors.orange[500],
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: color,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.25)",
        }}
      />
    </Pressable>
  );
}

function ToolbarButton({
  label,
  icon,
  iconColor: iconColorProp,
  onPress,
  disabled,
  active,
  destructive,
}: {
  label: string;
  icon?: IoniconName;
  iconColor?: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  destructive?: boolean;
}) {
  const isDefault = !active && !destructive;
  const borderColor = active
    ? colors.orange[500]
    : destructive
      ? colors.error
      : colors.border.strong;
  const textColor = active
    ? colors.orange[400]
    : destructive
      ? colors.error
      : colors.text.primary;
  const iconColor = active
    ? colors.orange[400]
    : destructive
      ? colors.error
      : (iconColorProp ?? colors.text.primary);
  const bgColor = active
    ? "rgba(212,138,48,0.22)"
    : destructive
      ? "rgba(239,68,68,0.18)"
      : colors.surface.raised;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={{ flex: 1 }}
    >
      {({ pressed }) => (
        <View
          style={{
            minHeight: 64,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.sm,
            borderRadius: radius.xl,
            borderWidth: active ? 1.5 : 1,
            borderColor,
            borderTopColor: isDefault
              ? "rgba(255,255,255,0.18)"
              : borderColor,
            backgroundColor:
              pressed && isDefault ? colors.surface.overlay : bgColor,
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            shadowColor: active ? colors.orange[500] : "#000",
            shadowOpacity: active ? 0.3 : isDefault ? 0.35 : 0,
            shadowOffset: { width: 0, height: active ? 0 : 3 },
            shadowRadius: active ? 8 : 8,
            elevation: isDefault || active ? 4 : 0,
            opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          }}
        >
          {icon && <Ionicons name={icon} size={22} color={iconColor} />}
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: textColor,
              textAlign: "center",
              letterSpacing: 0.3,
            }}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function PillButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      {({ pressed }) => (
        <View
          style={{
            minHeight: 36,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: radius.pill,
            borderWidth: selected ? 1.5 : 1,
            backgroundColor: selected
              ? "rgba(212,138,48,0.22)"
              : colors.surface.elevated,
            borderColor: selected ? colors.orange[500] : colors.border.card,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: selected ? 0 : 0.18,
            shadowOffset: { width: 0, height: 1 },
            shadowRadius: 3,
            elevation: selected ? 0 : 2,
            opacity: pressed ? 0.88 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "500",
              color: selected ? colors.orange[400] : colors.text.primary,
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function PrimaryAction({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.xl,
        backgroundColor: colors.orange[500],
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 14, fontWeight: "500", color: "#FFFFFF" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SecondaryAction({
  label,
  onPress,
  disabled,
  textColor,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  textColor?: string;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.xl,
        backgroundColor: colors.surface.raised,
        borderWidth: 1,
        borderColor: colors.border.card,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "flex-start",
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: "500",
          color: textColor ?? colors.text.primary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TextAction({
  label,
  onPress,
  color,
}: {
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.xs }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "500",
          color: color ?? colors.text.secondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

