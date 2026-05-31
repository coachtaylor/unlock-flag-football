import { supabase } from "./supabase";
import type { CategoryType } from "../constants/categories";

export type LoadedCategory = {
  id: string;
  name: string;
  type: CategoryType | null;
  display_order: number | null;
};

/**
 * Load drill_categories visible to a team (globals + team-scoped). Tries the
 * post-migration-17 schema first (with `category_type`) and falls back to the
 * legacy select if the column doesn't exist yet — so the app keeps working
 * during the schema rollout.
 */
export async function loadDrillCategories(
  teamId: string
): Promise<LoadedCategory[]> {
  const filter = `team_id.is.null,team_id.eq.${teamId}`;

  let res: { data: any[] | null; error: { message: string } | null } =
    await supabase
      .from("drill_categories")
      .select("id, category_name, category_type, display_order")
      .or(filter)
      .order("display_order", { ascending: true })
      .order("category_name", { ascending: true });

  if (res.error && /category_type/i.test(res.error.message)) {
    res = await supabase
      .from("drill_categories")
      .select("id, category_name, display_order")
      .or(filter)
      .order("display_order", { ascending: true })
      .order("category_name", { ascending: true });
  }

  if (res.error) {
    console.warn("[drill_categories] load error:", res.error.message);
    return [];
  }

  return (res.data ?? []).map((c: any) => ({
    id: c.id as string,
    name: c.category_name as string,
    type: (c.category_type as CategoryType | null) ?? null,
    display_order: (c.display_order as number | null) ?? null,
  }));
}
