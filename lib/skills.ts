import { supabase } from "./supabase";
import type { SkillGroup } from "../constants/skill-groups";

// Skill taxonomy data layer — mirrors unlock-web/src/lib/drills/skills-data.ts.
// All skill/skill_tag rows are global (world-readable to any authenticated
// user); drill_skills is team-scoped via the team_drills RLS. There are no
// auto-generated Supabase types in this project, so these hand-written shapes
// are the source of truth.

export type { SkillGroup };

export type Skill = {
  id: string;
  slug: string;
  skill_name: string;
  skill_group: SkillGroup;
  description: string;
  display_order: number;
  is_benchmarkable: boolean; // IQ skills are false (coach-rated only)
  is_ratable: boolean;
};

export type SkillTag = {
  id: string;
  skill_id: string;
  label: string;
  display_order: number;
  is_active: boolean;
};

// 1.0 = primary, 0.5 = secondary. Matches the drill_skills.weight CHECK.
export type DrillSkillWeight = 1.0 | 0.5;

export type DrillSkillLink = { skill_id: string; weight: DrillSkillWeight };

export type TaggedSkill = Skill & { weight: DrillSkillWeight };

export type SkillsCatalog = {
  skills: Skill[];
  tagsBySkillId: Record<string, SkillTag[]>;
};

const SKILL_COLUMNS =
  "id, slug, skill_name, skill_group, description, display_order, is_benchmarkable, is_ratable";

function mapSkill(row: any): Skill {
  return {
    id: row.id as string,
    slug: row.slug as string,
    skill_name: row.skill_name as string,
    skill_group: row.skill_group as SkillGroup,
    description: (row.description as string) ?? "",
    display_order: (row.display_order as number) ?? 0,
    is_benchmarkable: row.is_benchmarkable !== false,
    is_ratable: row.is_ratable !== false,
  };
}

/**
 * Load the full global skill catalog plus the active quick-tap chips grouped
 * by skill id. ~25 skills, ~120 active chips. Returns an empty catalog (never
 * throws) so callers can render a graceful "no skills" state if the taxonomy
 * migration hasn't landed.
 */
export async function loadAllSkills(): Promise<SkillsCatalog> {
  const [skillsRes, tagsRes] = await Promise.all([
    supabase
      .from("skills")
      .select(SKILL_COLUMNS)
      .order("display_order", { ascending: true }),
    supabase
      .from("skill_tags")
      .select("id, skill_id, label, display_order, is_active")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
  ]);

  if (skillsRes.error) {
    console.warn("[skills] load error:", skillsRes.error.message);
    return { skills: [], tagsBySkillId: {} };
  }

  const skills = (skillsRes.data ?? []).map(mapSkill);

  const tagsBySkillId: Record<string, SkillTag[]> = {};
  if (tagsRes.error) {
    console.warn("[skill_tags] load error:", tagsRes.error.message);
  } else {
    for (const row of tagsRes.data ?? []) {
      const tag: SkillTag = {
        id: row.id as string,
        skill_id: row.skill_id as string,
        label: row.label as string,
        display_order: (row.display_order as number) ?? 0,
        is_active: row.is_active !== false,
      };
      (tagsBySkillId[tag.skill_id] ??= []).push(tag);
    }
  }

  return { skills, tagsBySkillId };
}

/**
 * Load the skill tags on a set of team drills, hydrated with the full skill
 * row, keyed by drill_id. Primaries (weight 1.0) sort first, then by skill
 * display_order — matching the web ordering so chips read identically.
 */
export async function loadDrillSkills(
  drillIds: string[]
): Promise<Record<string, TaggedSkill[]>> {
  if (drillIds.length === 0) return {};

  const linkRes = await supabase
    .from("drill_skills")
    .select("drill_id, skill_id, weight")
    .in("drill_id", drillIds);

  if (linkRes.error) {
    console.warn("[drill_skills] load error:", linkRes.error.message);
    return {};
  }

  const links = linkRes.data ?? [];
  const skillIds = Array.from(new Set(links.map((l: any) => l.skill_id as string)));
  if (skillIds.length === 0) return {};

  const skillsRes = await supabase
    .from("skills")
    .select(SKILL_COLUMNS)
    .in("id", skillIds);

  if (skillsRes.error) {
    console.warn("[skills] hydrate error:", skillsRes.error.message);
    return {};
  }

  const skillById = new Map<string, Skill>();
  for (const row of skillsRes.data ?? []) {
    const s = mapSkill(row);
    skillById.set(s.id, s);
  }

  const byDrill: Record<string, TaggedSkill[]> = {};
  for (const link of links) {
    const skill = skillById.get(link.skill_id as string);
    if (!skill) continue;
    const weight = (Number(link.weight) === 1 ? 1.0 : 0.5) as DrillSkillWeight;
    (byDrill[link.drill_id as string] ??= []).push({ ...skill, weight });
  }

  for (const drillId of Object.keys(byDrill)) {
    byDrill[drillId].sort(
      (a, b) => b.weight - a.weight || a.display_order - b.display_order
    );
  }

  return byDrill;
}

/** Convert hydrated tags into the picker's value map (skillId → weight). */
export function toPickerInitial(
  tagged: TaggedSkill[]
): Map<string, DrillSkillWeight> {
  const map = new Map<string, DrillSkillWeight>();
  for (const t of tagged) map.set(t.id, t.weight);
  return map;
}
