// Confidence tiering for skill reads (Build 8.7 Slice 1 — coaching-lens redesign).
//
// The credibility keystone: a skill composite built from ONE drill is not the
// same claim as one built from three, even if that one drill ran 50 times. This
// turns `drill_sample_size` (distinct drills feeding a skill's composite, from
// v_player_skill_profile) into a tier the UI can gate on — so the scouting page
// stops rendering a 1-drill read with the full authority of a finished verdict.
//
// Mirrors the AI Insight Engine's per-category activation thresholds (product
// doc): no claim until the data earns it; an "early read" is shown honestly
// rather than dressed up as a conclusion. Pure, no I/O.

// Distinct drills feeding a skill before it can carry a strength/weakness
// verdict. 3 matches the product's "3 entries" activation discipline. EARLY is
// anything measured at all but below that bar.
export const RELIABLE_MIN = 3;
export const EARLY_MIN = 1;

export type ConfidenceTier = "reliable" | "early" | "none";

export function confidenceTier(sampleSize: number): ConfidenceTier {
  if (sampleSize >= RELIABLE_MIN) return "reliable";
  if (sampleSize >= EARLY_MIN) return "early";
  return "none";
}

export function tierLabel(t: ConfidenceTier): string {
  switch (t) {
    case "reliable":
      return "Reliable read";
    case "early":
      return "Early read";
    case "none":
      return "No data";
  }
}

// How many more distinct drills until this skill is a reliable read (0 once it
// already is). Feeds the "run N more drills to trust this" locked-insight copy.
export function drillsToReliable(sampleSize: number): number {
  return Math.max(0, RELIABLE_MIN - sampleSize);
}
