import { supabase } from "./supabase";
import type { Skill, SkillGroup, TaggedSkill } from "./skills";

// Preset drill library data layer — mirrors
// unlock-web/src/lib/drills/preset-library-data.ts. The preset_drills /
// preset_drill_skills tables are global (world-readable); the "already
// cloned?" check is scoped to the current team via team_drills.

export type PresetDrill = {
  id: string;
  slug: string;
  drill_name: string;
  description: string;
  category_type: string;
  default_reps: number | null;
  default_duration_min: number | null;
  benchmark_types: string[];
  source_url: string | null;
  formats: string[]; // ('5v5' | '7v7')
  primary_for_positions: string[];
  display_order: number;
};

// Hydrated shape the browse screen renders: preset + its skill tags +
// whether this team has already cloned it (and the resulting drill id).
export type PresetDrillWithSkills = PresetDrill & {
  skills: TaggedSkill[];
  alreadyCloned: boolean;
  clonedDrillId: string | null;
};

export type LoadedPresetLibrary = {
  presets: PresetDrillWithSkills[];
  skills: Skill[]; // full skill list (for filter facets)
};

const PRESET_COLUMNS =
  "id, slug, drill_name, description, category_type, default_reps, default_duration_min, benchmark_types, source_url, formats, primary_for_positions, display_order, is_active";

const SKILL_COLUMNS =
  "id, slug, skill_name, skill_group, description, display_order, is_benchmarkable, is_ratable";

/**
 * Load the global preset library hydrated with skill tags and this team's
 * clone status. Returns an empty library (never throws) so the screen can
 * show a graceful empty state if the taxonomy migration hasn't landed.
 */
export async function loadPresetLibrary(
  teamId: string
): Promise<LoadedPresetLibrary> {
  if (!teamId) return { presets: [], skills: [] };

  const [presetRes, skillRes, linkRes, clonedRes] = await Promise.all([
    supabase
      .from("preset_drills")
      .select(PRESET_COLUMNS)
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    supabase
      .from("skills")
      .select(SKILL_COLUMNS)
      .order("display_order", { ascending: true }),
    supabase
      .from("preset_drill_skills")
      .select("preset_drill_id, skill_id, weight"),
    // Only this team's clones — another team's clone shouldn't hide the
    // Add button on this team's browse screen.
    supabase
      .from("team_drills")
      .select("id, preset_drill_id")
      .eq("team_id", teamId)
      .not("preset_drill_id", "is", null),
  ]);

  if (presetRes.error) {
    console.warn("[preset-library] load error:", presetRes.error.message);
    return { presets: [], skills: [] };
  }

  const skills: Skill[] = (skillRes.data ?? []).map((r: any) => ({
    id: r.id as string,
    slug: r.slug as string,
    skill_name: r.skill_name as string,
    skill_group: r.skill_group as SkillGroup,
    description: (r.description as string) ?? "",
    display_order: (r.display_order as number) ?? 0,
    is_benchmarkable: r.is_benchmarkable !== false,
    is_ratable: r.is_ratable !== false,
  }));
  const skillById = new Map(skills.map((s) => [s.id, s]));

  // Skill tags grouped per preset, weight 1.0 (primary) before 0.5.
  const skillsByPreset = new Map<string, TaggedSkill[]>();
  for (const link of linkRes.data ?? []) {
    const skill = skillById.get(link.skill_id as string);
    if (!skill) continue;
    const presetId = link.preset_drill_id as string;
    const weight = (Number(link.weight) === 1 ? 1.0 : 0.5) as 1.0 | 0.5;
    const arr = skillsByPreset.get(presetId) ?? [];
    arr.push({ ...skill, weight });
    skillsByPreset.set(presetId, arr);
  }
  for (const arr of skillsByPreset.values()) {
    arr.sort((a, b) =>
      a.weight !== b.weight ? b.weight - a.weight : a.display_order - b.display_order
    );
  }

  // First clone per preset for this team.
  const clonedPresetToDrill = new Map<string, string>();
  for (const r of clonedRes.data ?? []) {
    const presetId = r.preset_drill_id as string | null;
    if (!presetId) continue;
    if (!clonedPresetToDrill.has(presetId)) {
      clonedPresetToDrill.set(presetId, r.id as string);
    }
  }

  const KNOWN_BENCH = ["timed", "rated", "reps", "pct", "flags", "drops"];
  const presets: PresetDrillWithSkills[] = (presetRes.data ?? []).map((r: any) => {
    const clonedDrillId = clonedPresetToDrill.get(r.id as string) ?? null;
    return {
      id: r.id as string,
      slug: r.slug as string,
      drill_name: r.drill_name as string,
      description: (r.description as string) ?? "",
      category_type: (r.category_type as string) ?? "",
      default_reps: (r.default_reps as number | null) ?? null,
      default_duration_min: (r.default_duration_min as number | null) ?? null,
      benchmark_types: ((r.benchmark_types as string[] | null) ?? []).filter(
        (t) => KNOWN_BENCH.includes(t)
      ),
      source_url: (r.source_url as string | null) ?? null,
      formats: (r.formats as string[] | null) ?? [],
      primary_for_positions: (r.primary_for_positions as string[] | null) ?? [],
      display_order: (r.display_order as number) ?? 0,
      skills: skillsByPreset.get(r.id as string) ?? [],
      alreadyCloned: clonedDrillId !== null,
      clonedDrillId,
    };
  });

  return { presets, skills };
}

export type ClonePresetResult =
  | { ok: true; drillId: string }
  | { ok: false; error: string };

/**
 * Clone a preset into the current team via the clone_preset_drill_to_team
 * RPC (copies preset_drills → team_drills + preset_drill_skills →
 * drill_skills atomically). Returns the new team_drills.id.
 */
export async function clonePresetDrill(
  presetDrillId: string,
  teamId: string
): Promise<ClonePresetResult> {
  if (!presetDrillId || !teamId) {
    return { ok: false, error: "Missing preset or team." };
  }
  const { data, error } = await supabase.rpc("clone_preset_drill_to_team", {
    p_preset_drill_id: presetDrillId,
    p_team_id: teamId,
  });
  if (error) return { ok: false, error: error.message };
  const drillId = data as string | null;
  if (!drillId) return { ok: false, error: "Clone returned no drill id." };
  return { ok: true, drillId };
}

export type RemoveCloneResult = { ok: true } | { ok: false; error: string };

// Turn a Postgres FK-violation (23503) on team_drills delete into a friendly,
// actionable message. The data tables (benchmark_results, practice_plan_drills)
// keep their no-cascade FKs on purpose, so deleting a drill that has real data
// is blocked — tell the coach why instead of leaking the raw constraint text.
// Kept in sync verbatim with the web copy (unlock-web lib/drills/lifecycle-actions.ts).
export function friendlyRemoveCloneError(error: {
  code?: string;
  message?: string;
  details?: string;
}): string {
  const haystack = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (error.code === "23503" || haystack.includes("foreign key")) {
    if (haystack.includes("benchmark_results")) {
      return "This drill has benchmark results logged. Archive it instead of deleting it.";
    }
    if (haystack.includes("practice_plan_drills")) {
      return "This drill is used in a practice plan. Remove it from the plan first, then delete it.";
    }
    return "This drill has linked data and can't be deleted.";
  }
  return error.message ?? "Couldn't delete the drill.";
}

/**
 * Hard-delete a team_drills row. Used both for the preset "Remove from
 * library" flow and the custom-drill permanent delete (only reachable from
 * the archive, behind a type-the-name confirm). Only ever touches the team's
 * COPY; a global preset_drills row is never affected. RLS enforces team
 * membership.
 */
export async function deleteTeamDrill(
  drillId: string
): Promise<RemoveCloneResult> {
  if (!drillId) return { ok: false, error: "Missing drill id." };
  const { error } = await supabase.from("team_drills").delete().eq("id", drillId);
  if (error) return { ok: false, error: friendlyRemoveCloneError(error) };
  return { ok: true };
}

/**
 * Remove this team's clone of a preset from the team library. Thin alias over
 * deleteTeamDrill so the preset remove and the custom-drill permanent delete
 * share one source of truth. The global preset_drills row stays re-addable.
 */
export async function removeClonedDrill(
  drillId: string
): Promise<RemoveCloneResult> {
  return deleteTeamDrill(drillId);
}

/**
 * Soft-delete a custom drill: it drops out of the active library + every
 * status='published' picker (practice planner, benchmark hub). All linked
 * data (benchmark_results, etc.) is kept. Mirrors the practice archive.
 */
export async function archiveTeamDrill(
  drillId: string
): Promise<RemoveCloneResult> {
  if (!drillId) return { ok: false, error: "Missing drill id." };
  const { error } = await supabase
    .from("team_drills")
    .update({ status: "archived" })
    .eq("id", drillId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Restore an archived drill. Returns to 'draft' (never auto-republishes) so a
 * coach re-reviews before it re-enters the shared library + pickers.
 */
export async function unarchiveTeamDrill(
  drillId: string
): Promise<RemoveCloneResult> {
  if (!drillId) return { ok: false, error: "Missing drill id." };
  const { error } = await supabase
    .from("team_drills")
    .update({ status: "draft" })
    .eq("id", drillId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
