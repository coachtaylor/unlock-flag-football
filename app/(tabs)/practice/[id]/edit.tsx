import { withManageGuard } from "../../../../components/RequireManage";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  PracticePlanForm,
  type BenchmarkKind,
  type LibraryCategory,
  type LibraryDrill,
  type PlanBlock,
  type PlanBreak,
  type PracticePlanFormInitial,
  type RosterPlayer,
} from "../../../../components/PracticePlanForm";
import { colors } from "../../../../constants/design";
import {
  colorForCategory,
  inferCategoryType,
} from "../../../../constants/categories";
import { loadDrillCategories } from "../../../../lib/load-categories";
import { supabase } from "../../../../lib/supabase";
import { useTeam } from "../../../../lib/team-context";
import {
  playerColorForIndex,
  initialsFromName,
  splitFirstLast,
} from "../../../../lib/athlete";

function normalizeStatus(raw: string): PracticePlanFormInitial["status"] {
  if (raw === "finalized") return "scheduled"; // pre-migration rows
  if (raw === "scheduled" || raw === "live" || raw === "completed") return raw;
  return "draft";
}

type PlanRow = {
  id: string;
  practice_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string | null;
  notes: string | null;
  status: string;
  practice_plan_drills:
    | {
        drill_id: string | null;
        drill_order: number;
        duration_minutes: number | null;
        reps_count: number | null;
        is_water_break: boolean | null;
        notes: string | null;
        log_note: string | null;
        parallel_group: number | null;
        plan_block_id: string | null;
      }[]
    | null;
  practice_plan_blocks:
    | {
        id: string;
        template_id: string | null;
        name: string;
        block_order: number;
        target_minutes: number | null;
      }[]
    | null;
  practice_plan_breaks:
    | {
        id: string;
        after_block_order: number;
        break_order: number;
        duration_minutes: number;
      }[]
    | null;
};

function timeForInput(t: string | null): string {
  if (!t) return "";
  const m = t.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

function EditPracticePlanScreen() {
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [drills, setDrills] = useState<LibraryDrill[]>([]);
  const [categories, setCategories] = useState<LibraryCategory[]>([]);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [initial, setInitial] = useState<PracticePlanFormInitial | null>(null);

  // Plan row is fetched once — refetching on focus would clobber the
  // coach's in-progress edits.
  useEffect(() => {
    let cancelled = false;
    if (!teamId || !id) return;
    (async () => {
      // Try the richest projection first; degrade if newer columns / tables
      // aren't deployed yet so an old DB still loads the editor.
      const planSelect = (
        withBlocks: boolean,
        withParallel: boolean,
        withBreaks: boolean
      ) => {
        const drillCols = `drill_id, drill_order, duration_minutes, reps_count, is_water_break, notes${
          withParallel ? ", parallel_group, log_note" : ""
        }${withBlocks ? ", plan_block_id" : ""}`;
        const blockJoin = withBlocks
          ? ", practice_plan_blocks(id, template_id, name, block_order, target_minutes)"
          : "";
        const breakJoin = withBreaks
          ? ", practice_plan_breaks(id, after_block_order, break_order, duration_minutes)"
          : "";
        return supabase
          .from("practice_plans")
          .select(
            `id, practice_date, start_time, end_time, title, notes, status, practice_plan_drills(${drillCols})${blockJoin}${breakJoin}`
          )
          .eq("id", id)
          .maybeSingle();
      };
      let planRes = await planSelect(true, true, true);
      if (
        planRes.error &&
        /practice_plan_breaks/i.test(planRes.error.message)
      ) {
        // Migration 44 not applied — drop breaks join.
        planRes = await planSelect(true, true, false);
      }
      if (
        planRes.error &&
        /practice_plan_blocks|plan_block_id/i.test(planRes.error.message)
      ) {
        // Migration 42 not applied — drop blocks join.
        planRes = await planSelect(false, true, false);
      }
      if (
        planRes.error &&
        /parallel_group|log_note/i.test(planRes.error.message)
      ) {
        planRes = await planSelect(false, false, false);
      }
      if (planRes.error) {
        console.warn("[practice/[id]/edit] load error", planRes.error);
      }
      // RSVP rows — `rsvp` flag ships in migration 38; tolerate it not being
      // applied. The editor only deals with RSVP intent, never check-in.
      const attendeesRes = await supabase
        .from("practice_plan_attendees")
        .select("player_id, rsvp")
        .eq("practice_plan_id", id);
      if (attendeesRes.error) {
        console.warn(
          "[practice/[id]/edit] attendees load error",
          attendeesRes.error
        );
      }
      if (cancelled) return;
      if (planRes.data) {
        // Cast through unknown — the dynamic Supabase select string defeats
        // the typed-select parser, so PostgREST/PG-TS infers the column set
        // as an error type. The runtime shape matches PlanRow.
        const row = planRes.data as unknown as PlanRow;

        // Build the practice-block list. If the DB returned blocks, use
        // them in block_order order. Otherwise (legacy / pre-migration-42
        // database), synthesize a single fallback "Skill Block" so the
        // form has somewhere to render existing drills.
        const blockRows = (row.practice_plan_blocks ?? [])
          .slice()
          .sort((a, b) => a.block_order - b.block_order);
        const fallbackBlockId = "init-fallback-block";
        const blockIdToLocal = new Map<string, string>();
        let planBlocks: PlanBlock[];
        if (blockRows.length > 0) {
          planBlocks = blockRows.map((b, i) => {
            const local = `init-block-${i}-${b.id}`;
            blockIdToLocal.set(b.id, local);
            return {
              localId: local,
              templateId: b.template_id,
              name: b.name,
              targetMinutes: b.target_minutes ?? null,
            };
          });
        } else {
          planBlocks = [
            {
              localId: fallbackBlockId,
              templateId: null,
              name: "Skill Block",
              targetMinutes: null,
            },
          ];
        }

        // Drills get routed to their block via plan_block_id when available;
        // otherwise everything falls into the synthetic fallback block.
        const rawDrills = (row.practice_plan_drills ?? [])
          .slice()
          .sort((a, b) => a.drill_order - b.drill_order);
        const planDrills = rawDrills.map((d, idx) => {
          const blockLocal =
            (d.plan_block_id && blockIdToLocal.get(d.plan_block_id)) ||
            planBlocks[0].localId;
          return {
            localId: `init-${idx}-${d.drill_id ?? "wb"}`,
            planBlockLocalId: blockLocal,
            drillId: d.drill_id,
            durationMinutes: d.duration_minutes ?? 0,
            reps: d.reps_count ?? 0,
            isWaterBreak: d.is_water_break === true,
            notes: d.notes ?? "",
            logNote: d.log_note ?? "",
            parallelGroup: d.parallel_group ?? null,
          };
        });

        const attendingIds = (
          (attendeesRes.data ?? []) as {
            player_id: string;
            rsvp?: boolean;
          }[]
        )
          .filter((a) => a.rsvp !== false)
          .map((a) => a.player_id);
        // Top-level water breaks (migration 44). When the join is absent
        // (older DB) the row simply has no breaks key — treat as empty.
        const planBreaks: PlanBreak[] = (row.practice_plan_breaks ?? [])
          .slice()
          .sort(
            (a, b) =>
              a.after_block_order - b.after_block_order ||
              a.break_order - b.break_order
          )
          .map((br, i) => ({
            localId: `init-break-${i}-${br.id}`,
            afterBlockOrder: br.after_block_order,
            breakOrder: br.break_order,
            durationMinutes: br.duration_minutes,
          }));

        setInitial({
          id: row.id,
          practiceDate: row.practice_date,
          startTime: timeForInput(row.start_time),
          endTime: timeForInput(row.end_time),
          title: row.title ?? "",
          notes: row.notes ?? "",
          status: normalizeStatus(row.status),
          blocks: planBlocks,
          drills: planDrills,
          breaks: planBreaks,
          attendingIds,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, id]);

  // Drills + categories are refetched on every focus so a drill created via
  // the "+ New" picker flow appears in the list on return from /drills/new.
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
      players={players}
      initial={initial}
      topInset={insets.top}
      bottomInset={insets.bottom}
    />
  );
}

export default withManageGuard(EditPracticePlanScreen, "/practice");
