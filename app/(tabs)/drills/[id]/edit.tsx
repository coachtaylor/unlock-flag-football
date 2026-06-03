import { withManageGuard } from "../../../../components/RequireManage";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DrillForm,
  formatEquipment,
  type DrillFormInitial,
} from "../../../../components/DrillForm";
import { colors, spacing } from "../../../../constants/design";
import { supabase } from "../../../../lib/supabase";
import { loadDrillCategories } from "../../../../lib/load-categories";
import {
  loadAllSkills,
  loadDrillSkills,
  type Skill,
} from "../../../../lib/skills";
import { useTeam } from "../../../../lib/team-context";
import type { DiagramData } from "../../../../types/diagram";
import type { CategoryType } from "../../../../constants/categories";
import {
  benchmarkConfigFromLegacy,
  parseBenchmarkConfig,
} from "../../../../constants/benchmarks";

type Category = { id: string; name: string; type: CategoryType | null };

function EditDrillScreen() {
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [initial, setInitial] = useState<DrillFormInitial | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!teamId || !id) return;
    (async () => {
      // Try the full select first. If migration 38 hasn't landed, fall back
      // through the previously-shipped column sets so older environments
      // still load.
      const FULL_SELECT =
        "id, drill_name, description, source_url, benchmark_type, benchmark_types, benchmark_scope, benchmark_config, status, equipment, team_id, setup_diagram, setup_instructions, default_reps, default_duration_min, team_drill_categories(category_id)";
      const MIG_18_SELECT =
        "id, drill_name, description, source_url, benchmark_type, benchmark_types, status, equipment, team_id, setup_diagram, setup_instructions, default_reps, default_duration_min, team_drill_categories(category_id)";
      const LEGACY_SELECT =
        "id, drill_name, description, source_url, benchmark_type, status, equipment, team_id, setup_diagram, setup_instructions, default_reps, default_duration_min, team_drill_categories(category_id)";

      let drillRes = await supabase
        .from("team_drills")
        .select(FULL_SELECT)
        .eq("id", id)
        .maybeSingle();

      if (
        drillRes.error &&
        /benchmark_(scope|config)/i.test(drillRes.error.message)
      ) {
        drillRes = await supabase
          .from("team_drills")
          .select(MIG_18_SELECT)
          .eq("id", id)
          .maybeSingle();
      }
      if (
        drillRes.error &&
        /benchmark_types/i.test(drillRes.error.message)
      ) {
        drillRes = await supabase
          .from("team_drills")
          .select(LEGACY_SELECT)
          .eq("id", id)
          .maybeSingle();
      }

      const [categoryRowsRaw, catalog, drillSkillsByDrill] = await Promise.all([
        loadDrillCategories(teamId),
        loadAllSkills(),
        loadDrillSkills([id]),
      ]);

      if (cancelled) return;

      setSkills(catalog.skills);
      const taggedSkills = drillSkillsByDrill[id] ?? [];

      // Surface query errors so the page doesn't silently spin if the
      // schema is out of date (e.g. migration not yet applied).
      if (drillRes.error) {
        console.warn("[edit drill] query error:", drillRes.error.message);
        setLoadError(drillRes.error.message);
        setLoading(false);
        return;
      }

      setCategories(
        categoryRowsRaw.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
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
        const fromStored = parseBenchmarkConfig(
          (d as Record<string, unknown>).benchmark_config
        );
        const fromLegacy = benchmarkConfigFromLegacy(
          (d as Record<string, unknown>).benchmark_type as
            | string
            | null
            | undefined,
          (d as Record<string, unknown>).benchmark_types as
            | string[]
            | null
            | undefined
        );
        setInitial({
          id: d.id as string,
          drillName: (d.drill_name as string) ?? "",
          categoryIds: links.map((l) => l.category_id),
          skills: taggedSkills.map((t) => ({
            skill_id: t.id,
            weight: t.weight,
          })),
          description: (d.description as string | null) ?? "",
          sourceUrl: (d.source_url as string | null) ?? "",
          benchmarkConfig: fromStored ?? fromLegacy,
          status: (d.status as "draft" | "published") ?? "draft",
          equipment: formatEquipment(cones, other),
          setupDiagram,
          setupInstructions: (d.setup_instructions as string | null) ?? null,
          defaultReps:
            typeof d.default_reps === "number" ? d.default_reps : null,
          defaultDurationMin:
            typeof d.default_duration_min === "number"
              ? d.default_duration_min
              : null,
        });
      }

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, id]);

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

  if (loadError || !initial) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          alignItems: "center",
          justifyContent: "center",
          padding: spacing.xl,
        }}
      >
        <Text
          style={{
            color: colors.errorLight,
            fontSize: 14,
            textAlign: "center",
            marginBottom: spacing.sm,
          }}
        >
          Couldn't load drill
        </Text>
        <Text
          style={{
            color: colors.text.secondary,
            fontSize: 12,
            textAlign: "center",
          }}
        >
          {loadError ?? "Drill not found."}
        </Text>
      </View>
    );
  }

  return (
    <DrillForm
      teamId={teamId}
      categories={categories}
      skills={skills}
      initial={initial}
      topInset={insets.top}
      bottomInset={insets.bottom + 60}
    />
  );
}

export default withManageGuard(EditDrillScreen, "/drills");
