// Shared loader for the two lookups skill-group analytics need: a team's
// drill→skills+weights map (drill_skills, RLS-scoped via a team_drills inner
// join) and the global skill→group map (skills). One source so the roster
// player page and the Team Scouting Report can't drift on how they scope or
// shape these. Mirrors the drill_skills/skills fetch in team-home-data.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkillGroup } from "../../constants/skill-groups";

export type SkillGroupMaps = {
  drillSkills: Map<string, { skillId: string; weight: number }[]>;
  skillGroupById: Map<string, SkillGroup>;
};

export async function loadSkillGroupMaps(
  supabase: SupabaseClient,
  teamId: string,
): Promise<SkillGroupMaps> {
  const [drillSkillsRes, skillsRes] = await Promise.all([
    supabase
      .from("drill_skills")
      .select("drill_id, skill_id, weight, team_drills!inner(team_id)")
      .eq("team_drills.team_id", teamId),
    supabase.from("skills").select("id, skill_group"),
  ]);

  const drillSkills = new Map<string, { skillId: string; weight: number }[]>();
  for (const r of (drillSkillsRes.data ?? []) as {
    drill_id: string;
    skill_id: string;
    weight: number;
  }[]) {
    const arr = drillSkills.get(r.drill_id) ?? [];
    arr.push({ skillId: r.skill_id, weight: Number(r.weight) });
    drillSkills.set(r.drill_id, arr);
  }

  const skillGroupById = new Map<string, SkillGroup>(
    ((skillsRes.data ?? []) as { id: string; skill_group: SkillGroup }[]).map((s) => [
      s.id,
      s.skill_group,
    ]),
  );

  return { drillSkills, skillGroupById };
}
