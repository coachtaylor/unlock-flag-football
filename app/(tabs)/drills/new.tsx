import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DrillForm } from "../../../components/DrillForm";
import { colors } from "../../../constants/design";
import { supabase } from "../../../lib/supabase";
import { useTeam } from "../../../lib/team-context";

type Category = { id: string; name: string };

export default function NewDrillScreen() {
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!teamId) return;
    (async () => {
      const { data } = await supabase
        .from("drill_categories")
        .select("id, category_name, display_order")
        .or(`team_id.is.null,team_id.eq.${teamId}`)
        .order("display_order", { ascending: true })
        .order("category_name", { ascending: true });

      if (cancelled) return;
      setCategories(
        (data ?? []).map((c) => ({
          id: c.id as string,
          name: c.category_name as string,
        }))
      );
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
    <DrillForm
      teamId={teamId}
      categories={categories}
      topInset={insets.top}
      bottomInset={insets.bottom + 60}
    />
  );
}
