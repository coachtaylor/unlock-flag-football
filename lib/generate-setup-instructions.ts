import type { Cone, DiagramData } from "../types/diagram";

const YARD = 10;

function fmtYards(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  if (rounded === 1) return "1 yard";
  return `${rounded} yards`;
}

function describeSpacing(gaps: number[]): string {
  if (gaps.length === 0) return "";
  const allEqual = gaps.every((g) => Math.abs(g - gaps[0]) < 0.05);
  if (allEqual) return `evenly spaced ${fmtYards(gaps[0])} apart`;
  return `spaced ${gaps.map(fmtYards).join(", ")} apart`;
}

function groupCones(cones: Cone[]) {
  const byY = new Map<number, Cone[]>();
  for (const c of cones) {
    const arr = byY.get(c.y) ?? [];
    arr.push(c);
    byY.set(c.y, arr);
  }
  const horizontalLines: Cone[][] = [];
  const claimed = new Set<string>();
  for (const group of byY.values()) {
    if (group.length >= 2) {
      const sorted = group.slice().sort((a, b) => a.x - b.x);
      horizontalLines.push(sorted);
      for (const c of sorted) claimed.add(c.id);
    }
  }

  const remaining = cones.filter((c) => !claimed.has(c.id));
  const byX = new Map<number, Cone[]>();
  for (const c of remaining) {
    const arr = byX.get(c.x) ?? [];
    arr.push(c);
    byX.set(c.x, arr);
  }
  const verticalLines: Cone[][] = [];
  const isolated: Cone[] = [];
  for (const group of byX.values()) {
    if (group.length >= 2) {
      const sorted = group.slice().sort((a, b) => a.y - b.y);
      verticalLines.push(sorted);
    } else {
      isolated.push(...group);
    }
  }

  return { horizontalLines, verticalLines, isolated };
}

function describeLine(
  line: Cone[],
  orientation: "horizontal" | "vertical",
  isFirst: boolean
): string {
  const n = line.length;
  const noun = isFirst
    ? `${n} cone${n === 1 ? "" : "s"}`
    : `${n} more cone${n === 1 ? "" : "s"}`;
  const where = orientation === "horizontal" ? "in a row" : "going downfield";
  const gaps =
    orientation === "horizontal"
      ? line.slice(1).map((c, i) => (c.x - line[i].x) / YARD)
      : line.slice(1).map((c, i) => Math.abs(c.y - line[i].y) / YARD);
  const spacing = describeSpacing(gaps);
  return spacing ? `${noun} ${where}, ${spacing}` : `${noun} ${where}`;
}

export function generateSetupInstructions(data: DiagramData): string {
  const cones = data.cones.filter((c) => (c.kind ?? "cone") === "cone");
  const routes = data.routes ?? [];

  const routeNote =
    routes.length > 0
      ? ` ${routes.length} player route${routes.length === 1 ? "" : "s"} drawn.`
      : "";

  if (cones.length === 0) {
    return routeNote ? routeNote.trim() : "";
  }

  const total = `${cones.length} cone${cones.length === 1 ? "" : "s"}.`;

  const { horizontalLines, verticalLines, isolated } = groupCones(cones);

  const phrases: string[] = [];
  let isFirst = true;
  for (const line of horizontalLines) {
    phrases.push(describeLine(line, "horizontal", isFirst));
    isFirst = false;
  }
  for (const line of verticalLines) {
    phrases.push(describeLine(line, "vertical", isFirst));
    isFirst = false;
  }

  let body = "";
  if (phrases.length === 1) {
    body = `${phrases[0]}.`;
  } else if (phrases.length === 2) {
    body = `${phrases[0]} and ${phrases[1]}.`;
  } else if (phrases.length > 2) {
    body = `${phrases.slice(0, -1).join(", ")}, and ${phrases[phrases.length - 1]}.`;
  }

  if (isolated.length > 0 && phrases.length > 0) {
    const extras = `${isolated.length} extra cone${isolated.length === 1 ? "" : "s"}.`;
    body = body ? `${body} ${extras}` : extras;
  }

  return `${total}${body ? ` ${body}` : ""}${routeNote}`.trim();
}
