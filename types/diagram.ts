export interface Cone {
  id: string;
  x: number;
  y: number;
  label: string;
  kind?: "cone" | "qb" | "football";
  color?: string;
}

export interface Path {
  from: string;
  to: string;
  movement: "sprint" | "backpedal" | "shuffle" | "jog";
  yards: number;
}

export interface RouteWaypoint {
  id: string;
  x: number;
  y: number;
}

export interface RouteSegment {
  type: "straight" | "zigzag" | "curve";
}

export interface Route {
  id: string;
  waypoints: RouteWaypoint[];
  segments: RouteSegment[];
}

export interface BallPath {
  id: string;
  fromConeId: string;
  toConeId?: string;
  toX?: number;
  toY?: number;
}

export interface DiagramData {
  cones: Cone[];
  paths: Path[];
  routes: Route[];
  ballPaths?: BallPath[];
  gridScale: number;
}
