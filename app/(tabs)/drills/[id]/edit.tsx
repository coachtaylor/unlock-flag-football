import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DrillForm,
  formatEquipment,
  type DrillFormInitial,
} from "../../../../components/DrillForm";
import { colors } from "../../../../constants/design";
import { supabase } from "../../../../lib/supabase";
import { useTeam } from "../../../../lib/team-context";
import type { DiagramData } from "../../../../types/diagram";

type Category = { id: string; name: string };

export default function EditDrillScreen() {
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [initial, setInitial] = useState<DrillFormInitial | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!teamId || !id) return;
    (async () => {
      const [drillRes, categoriesRes] = await Promise.all([
        supabase
          .from("team_drills")
          .select(
            "id, drill_name, description, source_url, benchmark_type, status, equipment, team_id, setup_diagram, setup_instructions, team_drill_categories(category_id)"
          )
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("drill_categories")
          .select("id, category_name, display_order")
          .or(`team_id.is.null,team_id.eq.${teamId}`)
          .order("display_order", { ascending: true })
          .order("category_name", { ascending: true }),
      ]);

      if (cancelled) return;

      setCategories(
        (categoriesRes.data ?? []).map((c) => ({
          id: c.id as string,
          name: c.category_name as string,
        }))
      );

      if (drillRes.data && drillRes.data.team_id === teamId) {
        const d = drillRes.data;
        const eq = d.equipment as
          | { cones?: number; other?: unknown }
          | null;
        const cones = typeof eq?.cones === "number" ? eq.cones : null;
        const other = Array.isArray(eq?.other)
          ? (eq!.other as unknown[]).filter(
              (x): x is string => typeof x === "string"
            )
          : [];
        const rawDiagram = d.setup_diagram as DiagramData | null;
        const setupDiagram =
          rawDiagram && Array.isArray(rawDiagram.cones) ? rawDiagram : null;
        const links =
          (d.team_drill_categories as { category_id: string }[] | null) ?? [];
        setInitial({
          id: d.id as string,
          drillName: (d.drill_name as string) ?? "",
          categoryIds: links.map((l) => l.category_id),
          description: (d.description as string | null) ?? "",
          sourceUrl: (d.source_url as string | null) ?? "",
          benchmarkType:
            (d.benchmark_type as "timed" | "rated" | null) ?? null,
          status: (d.status as "draft" | "published") ?? "draft",
          equipment: formatEquipment(cones, other),
          setupDiagram,
          setupInstructions: (d.setup_instructions as string | null) ?? null,
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
    <DrillForm
      teamId={teamId}
      categories={categories}
      initial={initial}
      topInset={insets.top}
      bottomInset={insets.bottom + 60}
    />
  );
}
