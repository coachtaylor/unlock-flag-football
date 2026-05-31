import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  PracticePlanForm,
  type BenchmarkKind,
  type LibraryCategory,
  type LibraryDrill,
  type RosterPlayer,
} from "../../../components/PracticePlanForm";
import { colors } from "../../../constants/design";
import {
  colorForCategory,
  inferCategoryType,
} from "../../../constants/categories";
import { supabase } from "../../../lib/supabase";
import { loadDrillCategories } from "../../../lib/load-categories";
import { useTeam } from "../../../lib/team-context";
import {
  playerColorForIndex,
  initialsFromName,
  splitFirstLast,
} from "../../../lib/athlete";

export default function NewPracticePlanScreen() {
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();

  const [loading, setLoading] = useState(true);
  const [drills, setDrills] = useState<LibraryDrill[]>([]);
  const [categories, setCategories] = useState<LibraryCategory[]>([]);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);

  // Refetch on every focus so a drill created via the "+ New" picker flow
  // appears in the list as soon as the user returns from /drills/new.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!teamId) return;
      (async () => {
        const [categoryRowsRaw, drillsRes, playersRes] = await Promise.all([
          loadDrillCategories(teamId),
          (async (): Promise<{ data: any[] | null; error: { message: string } | null }> => {
            let res: { data: any[] | null; error: { message: string } | null } =
              await supabase
                .from("team_drills")
                .select(
                  "id, drill_name, description, status, benchmark_type, benchmark_types, default_reps, default_duration_min, team_drill_categories(category_id)"
                )
                .eq("team_id", teamId)
                .eq("status", "published")
                .order("drill_name", { ascending: true });
            if (res.error && /benchmark_types/i.test(res.error.message)) {
              res = await supabase
                .from("team_drills")
                .select(
                  "id, drill_name, description, status, benchmark_type, default_reps, default_duration_min, team_drill_categories(category_id)"
                )
                .eq("team_id", teamId)
                .eq("status", "published")
                .order("drill_name", { ascending: true });
            }
            return res;
          })(),
          (async (): Promise<{
            data: any[] | null;
            error: { message: string } | null;
          }> => {
            // Try with color_index (migration 45); fall back without it.
            const sel = (withColor: boolean) =>
              supabase
                .from("team_players")
                .select(
                  `id, player_name, positions, jersey_number, status${
                    withColor ? ", color_index" : ""
                  }`
                )
                .eq("team_id", teamId)
                .eq("status", "active")
                .order("player_name", { ascending: true });
            let res = await sel(true);
            if (res.error && /color_index/i.test(res.error.message)) {
              res = await sel(false);
            }
            return res;
          })(),
        ]);

        if (cancelled) return;

        const cats: LibraryCategory[] = categoryRowsRaw.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type ?? inferCategoryType(c.name),
          color: colorForCategory(c.name),
        }));
        const nameById = new Map(cats.map((c) => [c.id, c.name]));

        const lib: LibraryDrill[] = (drillsRes.data ?? []).map((d) => {
          const links =
            (d.team_drill_categories as { category_id: string }[] | null) ?? [];
          const categoryIds = links.map((l) => l.category_id);
          const categoryNames = categoryIds
            .map((id) => nameById.get(id))
            .filter((n): n is string => !!n);
          return {
            id: d.id as string,
            name: d.drill_name as string,
            description:
              typeof d.description === "string" ? d.description : null,
            categoryIds,
            categoryNames,
            durationMin:
              typeof d.default_duration_min === "number"
                ? (d.default_duration_min as number)
                : null,
            reps:
              typeof d.default_reps === "number"
                ? (d.default_reps as number)
                : null,
            benchmarkTypes:
              (d.benchmark_types as BenchmarkKind[] | null) ??
              (d.benchmark_type
                ? [d.benchmark_type as BenchmarkKind]
                : []),
          };
        });

        const roster: RosterPlayer[] = (playersRes.data ?? []).map((p) => {
          const name = p.player_name as string;
          const positions = (p.positions as string[] | null) ?? [];
          const { first, last } = splitFirstLast(name);
          return {
            id: p.id as string,
            name,
            firstName: first,
            lastName: last,
            initials: initialsFromName(name),
            color: playerColorForIndex(p.color_index as number | null),
            jersey: (p.jersey_number as string | null) ?? null,
            positions,
          };
        });

        setCategories(cats);
        setDrills(lib);
        setPlayers(roster);
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [teamId])
  );

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
      players={players}
      topInset={insets.top}
      bottomInset={insets.bottom}
    />
  );
}
