import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PracticePlanForm } from "../../../components/PracticePlanForm";
import { colors } from "../../../constants/design";
import { supabase } from "../../../lib/supabase";
import { useTeam } from "../../../lib/team-context";

type LibraryDrill = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
};
type Category = { id: string; name: string };

export default function NewPracticePlanScreen() {
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();

  const [loading, setLoading] = useState(true);
  const [drills, setDrills] = useState<LibraryDrill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!teamId) return;
    (async () => {
      const [drillsRes, categoriesRes] = await Promise.all([
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
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  if (!teamId || loading) {
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
      topInset={insets.top}
      bottomInset={insets.bottom}
    />
  );
}
