import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  PracticePlanForm,
  type PracticePlanFormInitial,
} from "../../../../components/PracticePlanForm";
import { colors } from "../../../../constants/design";
import { supabase } from "../../../../lib/supabase";
import { useTeam } from "../../../../lib/team-context";

type LibraryDrill = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
};
type Category = { id: string; name: string };

type PlanRow = {
  id: string;
  practice_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string | null;
  notes: string | null;
  status: "draft" | "finalized" | "completed";
  practice_plan_drills:
    | {
        drill_id: string;
        drill_order: number;
        duration_minutes: number | null;
      }[]
    | null;
};

function timeForInput(t: string | null): string {
  if (!t) return "";
  const m = t.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

export default function EditPracticePlanScreen() {
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [drills, setDrills] = useState<LibraryDrill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [initial, setInitial] = useState<PracticePlanFormInitial | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!teamId || !id) return;
    (async () => {
      const [planRes, drillsRes, categoriesRes] = await Promise.all([
        supabase
          .from("practice_plans")
          .select(
            "id, practice_date, start_time, end_time, title, notes, status, practice_plan_drills(drill_id, drill_order, duration_minutes)"
          )
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("team_drills")
          .select("id, drill_name, category_id")
          .eq("team_id", teamId)
          .eq("status", "published")
          .order("drill_name", { ascending: true }),
        supabase
          .from("drill_categories")
          .select("id, category_name, display_order")
          .or(`team_id.is.null,team_id.eq.${teamId}`)
          .order("display_order", { ascending: true })
          .order("category_name", { ascending: true }),
      ]);

      if (cancelled) return;

      const cats: Category[] = (categoriesRes.data ?? []).map((c) => ({
        id: c.id as string,
        name: c.category_name as string,
      }));
      const nameById = new Map(cats.map((c) => [c.id, c.name]));

      const lib: LibraryDrill[] = (drillsRes.data ?? []).map((d) => ({
        id: d.id as string,
        name: d.drill_name as string,
        categoryId: (d.category_id as string | null) ?? null,
        categoryName:
          (d.category_id ? nameById.get(d.category_id as string) : null) ??
          null,
      }));

      setCategories(cats);
      setDrills(lib);

      if (planRes.data) {
        const row = planRes.data as PlanRow;
        const planDrills = (row.practice_plan_drills ?? [])
          .slice()
          .sort((a, b) => a.drill_order - b.drill_order)
          .map((d) => ({
            drillId: d.drill_id,
            durationMinutes: d.duration_minutes ?? 0,
          }));
        setInitial({
          id: row.id,
          practiceDate: row.practice_date,
          startTime: timeForInput(row.start_time),
          endTime: timeForInput(row.end_time),
          title: row.title ?? "",
          notes: row.notes ?? "",
          status: row.status,
          drills: planDrills,
        });
      }

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, id]);

  if (!teamId || loading || !initial) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.orange[500]} />
      </View>
    );
  }

  return (
    <PracticePlanForm
      teamId={teamId}
      drills={drills}
      categories={categories}
      initial={initial}
      topInset={insets.top}
      bottomInset={insets.bottom}
    />
  );
}
