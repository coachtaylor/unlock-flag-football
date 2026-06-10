// Heat-map grading for the Team Scouting Report (Build 8.7).
//
// Single source of truth for how a 0..1 skill composite becomes a letter grade
// and a cell color. Every heat cell ALWAYS shows its letter grade — color only
// reinforces — so the surface is colorblind-safe and never relies on hue alone.
//
// PALETTE ISOLATION: these five hexes are a purpose-built diverging scale. They
// deliberately do NOT reuse the 8 team swatches or the 20 player swatches
// (team-colors.ts) or the 5 skill-group colors (skill-groups.ts). On the
// scouting page the heat scale is a DATA encoding; player/team/group colors are
// IDENTITY encodings. Mixing them would make "green = strong" collide with
// "green = player 3". This module never imports team-colors.

export type Grade = "A" | "B" | "C" | "D" | "F";

// Absolute vs cohort-relative framing. ABSOLUTE grades a 0..1 composite against
// fixed bands tied to the 1–5 rating anchors (honest — a strong team reads
// green). RELATIVE expects the caller to pass a score already normalized to the
// team's own min/max (always surfaces a "worst"). The bands below are applied
// identically either way; the MODE only changes what the loader feeds in. Flip
// this one constant to change the whole page's framing.
export type HeatMode = "absolute" | "relative";
export const SCOUTING_HEAT_MODE: HeatMode = "absolute";

// Diverging scale, weakest → strongest. Letter grade is always rendered on top.
const HEAT_COLORS: Record<Grade, string> = {
  F: "#C2433A", // muted red
  D: "#C76B2E", // amber-orange
  C: "#B59331", // amber
  B: "#5B9E54", // green
  A: "#3E9D6E", // teal-green
};

// No-data / locked cell — neutral, never on the strength scale.
export const HEAT_LOCKED_COLOR = "rgba(255,255,255,0.05)";

// 1–5 anchor semantics (from CLAUDE.md benchmark scale): 5/5=1.0 … 1/5=0.2.
// Bands sit at the midpoints so a clean "3/5 = gets it done" lands at C.
export function scoreToGrade(score: number | null): Grade | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 0.85) return "A";
  if (score >= 0.7) return "B";
  if (score >= 0.55) return "C";
  if (score >= 0.4) return "D";
  return "F";
}

export function gradeColor(grade: Grade | null): string {
  if (grade == null) return HEAT_LOCKED_COLOR;
  return HEAT_COLORS[grade];
}

export function scoreToHeatColor(score: number | null): string {
  return gradeColor(scoreToGrade(score));
}

// Anchored grade descriptions — reused for cell tooltips so three captains read
// the same meaning behind a letter. Mirrors the 1–5 anchors.
export function gradeLabel(grade: Grade): string {
  switch (grade) {
    case "A":
      return "Reliable under pressure";
    case "B":
      return "Solid, minor refinements";
    case "C":
      return "Gets it done, inconsistent";
    case "D":
      return "Struggles, needs work";
    case "F":
      return "Can't execute yet";
  }
}

// Cohort-relative normalization for RELATIVE mode: map a raw value into 0..1
// across the team's own range. Returns null when the range is degenerate
// (every player identical → no meaningful spread).
export function relativeScore(
  value: number | null,
  min: number,
  max: number
): number | null {
  if (value == null) return null;
  if (max <= min) return null;
  return (value - min) / (max - min);
}
