import { Fragment, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";

// Android needs an opt-in for LayoutAnimation; iOS supports it by default.
// Guarded so we only call it once.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../../../components/ui/Button";
import { Eyebrow } from "../../../../components/ui/Eyebrow";
import { PastDueModal } from "../../../../components/ui/PastDueModal";
import { DeleteConfirmModal } from "../../../../components/ui/DeleteConfirmModal";
import { ActionModal, useActionModal } from "../../../../components/ui/ActionModal";
import {
  PracticeAttendanceSheet,
  type AttendancePlayer,
} from "../../../../components/PracticeAttendanceSheet";
import { colors, radius, spacing } from "../../../../constants/design";
import {
  colorForCategory,
  normalizeCategory,
  tintForCategory,
} from "../../../../constants/categories";
import { blockFillColor } from "../../../../constants/block-colors";
import { initialsFromName } from "../../../../lib/athlete";
import { positionColor } from "../../../../constants/positions";
import { fontStyle, monoStyle } from "../../../../constants/typography";
import { supabase } from "../../../../lib/supabase";

type PlanStatus = "draft" | "scheduled" | "live" | "completed";

function normalizeStatus(raw: string): PlanStatus {
  if (raw === "finalized") return "scheduled"; // pre-migration rows
  if (
    raw === "draft" ||
    raw === "scheduled" ||
    raw === "live" ||
    raw === "completed"
  ) {
    return raw;
  }
  return "draft";
}

type PlanDrill = {
  id: string;
  drillId: string | null;
  drillOrder: number;
  durationMinutes: number | null;
  drillName: string;
  categoryName: string | null;
  isWaterBreak: boolean;
  parallelGroup: number | null;
  logNote: string | null;
  // Which practice block this drill lives under, when migration 42 has
  // been applied. Null on legacy plans — those render under a synthetic
  // "Skill Block" header.
  planBlockId: string | null;
  // Prep info pulled from the underlying team_drills row. Optional — older
  // drills may not have any of these populated.
  description: string | null;
  equipmentLabel: string | null;
};

type PlanBlockSummary = {
  id: string;
  name: string;
  blockOrder: number;
  targetMinutes: number | null;
};

// Top-level water break (migration 44) — a structural pause between
// blocks. afterBlockOrder = -1 above first block, N = after block N.
type PlanBreakSummary = {
  id: string;
  afterBlockOrder: number;
  breakOrder: number;
  durationMinutes: number;
};

type Plan = {
  id: string;
  teamId: string;
  practiceDate: string;
  startTime: string | null;
  endTime: string | null;
  title: string | null;
  status: PlanStatus;
  notes: string | null;
  archived: boolean;
  drills: PlanDrill[];
  blocks: PlanBlockSummary[];
  breaks: PlanBreakSummary[];
};

type PracticeLog = {
  drillsCompleted: string[];
  drillsSkipped: string[];
  attendanceCount: number | null;
  energyLevel: number | null;
  teamPerformanceNotes: string | null;
  highlights: string | null;
  areasToImprove: string | null;
};

const ENERGY_ANCHORS: Record<number, string> = {
  1: "Low energy",
  2: "Sluggish",
  3: "Average",
  4: "Good energy",
  5: "Fired up",
};

function formatLongDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(t: string | null): string | null {
  if (!t) return null;
  const match = t.match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const mm = match[2];
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm === "00" ? `${h12} ${period}` : `${h12}:${mm} ${period}`;
}

function diffMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const s = start.match(/^(\d{2}):(\d{2})/);
  const e = end.match(/^(\d{2}):(\d{2})/);
  if (!s || !e) return null;
  const diff =
    Number(e[1]) * 60 + Number(e[2]) - (Number(s[1]) * 60 + Number(s[2]));
  return diff > 0 ? diff : null;
}

const STATUS_META: Record<
  PlanStatus,
  { label: string; color: string; bg: string; dashed?: boolean }
> = {
  draft: {
    label: "Draft",
    color: colors.text.muted,
    bg: colors.surface.muted,
    dashed: true,
  },
  scheduled: {
    label: "Scheduled",
    color: colors.orange[500],
    bg: colors.orange.tint,
  },
  live: { label: "Live", color: colors.lime[400], bg: colors.lime.tint },
  completed: {
    label: "Completed",
    color: colors.blue[400],
    bg: "rgba(110,168,255,0.10)",
  },
};

function StatusBadge({ status }: { status: PlanStatus }) {
  const m = STATUS_META[status];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: m.bg,
        borderWidth: 1,
        borderStyle: m.dashed ? "dashed" : "solid",
        borderColor: m.dashed ? colors.border.strong : `${m.color}33`,
      }}
    >
      {status === "live" && (
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: m.color,
          }}
        />
      )}
      <Text
        style={{
          fontSize: 11,
          fontWeight: "500",
          color: m.color,
          letterSpacing: 0.3,
        }}
      >
        {m.label}
      </Text>
    </View>
  );
}

// Dashboard-style stat card: orange top accent bar, faint orange bloom, a
// circular icon badge, and a large number. Tappable when `onPress` is given —
// then a chevron trails the caption.
function StatCard({
  label,
  icon,
  value,
  caption,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  value: string;
  caption: string;
  onPress?: () => void;
}) {
  const cardStyle = {
    flex: 1,
    backgroundColor: colors.surface.raised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.card,
    overflow: "hidden" as const,
  };
  const body = (
    <>
      <View style={{ height: 3, backgroundColor: colors.orange[500] }} />
      <LinearGradient
        colors={["rgba(255, 106, 26, 0.06)", "rgba(255, 106, 26, 0)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View style={{ padding: spacing.lg }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Eyebrow variant="dim">{label}</Eyebrow>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: colors.surface.muted,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={icon} size={17} color={colors.text.label} />
          </View>
        </View>
        <Text
          style={{
            fontSize: 28,
            lineHeight: 34,
            fontWeight: "500",
            color: colors.text.primary,
            fontVariant: ["tabular-nums"],
            marginTop: spacing.sm,
          }}
        >
          {value}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            marginTop: 2,
          }}
        >
          <Text style={{ fontSize: 13, color: colors.text.secondary }}>
            {caption}
          </Text>
          {onPress ? (
            <Ionicons
              name="chevron-forward"
              size={13}
              color={colors.text.muted}
            />
          ) : null}
        </View>
      </View>
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        style={cardStyle}
      >
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={cardStyle}>{body}</View>;
}

// A debrief note card (team performance / went well / needs work). Mirrors the
// drill-card shape — surface + colored left accent bar — with a sentiment color
// and icon so the three read as a set without being flat text walls.
function DebriefCard({
  label,
  icon,
  accent,
  body,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  accent: string;
  body: string;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.surface.raised,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border.card,
        borderLeftWidth: 3,
        borderLeftColor: accent,
        padding: spacing.lg,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          marginBottom: spacing.sm,
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: `${accent}22`,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={13} color={accent} />
        </View>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: accent,
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        style={{ fontSize: 15, lineHeight: 22, color: colors.text.primary }}
      >
        {body}
      </Text>
    </View>
  );
}

function CategoryTag({ name }: { name: string }) {
  const known = normalizeCategory(name);
  const accent = colorForCategory(name);
  const bg = known ? tintForCategory(name) : colors.surface.muted;
  const fg = known ? accent : colors.text.subtle;
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: bg,
        borderWidth: known ? 1 : 0,
        borderColor: known ? accent : "transparent",
      }}
    >
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: fg,
        }}
      >
        {name}
      </Text>
    </View>
  );
}

// Small icon+label chip used in the collapsed drill state to signal that
// prep content (coaching notes / equipment) is available behind the tap.
function PrepSignal({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: radius.pill,
        backgroundColor: colors.surface.input,
        borderWidth: 1,
        borderColor: colors.border.strong,
      }}
    >
      <Ionicons name={icon} size={11} color={colors.text.primary} />
      <Text
        style={{
          fontSize: 10.5,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          fontWeight: "700",
          color: colors.text.primary,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// Marks a drill that was skipped during the practice. Completed drills get no
// marker — only the exception is flagged, to keep the schedule calm.
function SkippedPill() {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: colors.orange.tint,
        borderWidth: 1,
        borderColor: colors.orange.tintBorder,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.orange[400],
        }}
      >
        Skipped
      </Text>
    </View>
  );
}

export default function PracticePlanDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, pastdue } = useLocalSearchParams<{
    id: string;
    pastdue?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  // Shown when arriving from a "Needs Attention" card (?pastdue=1). Lets the
  // coach reschedule, log, or delete the stale practice.
  const [pastDueOpen, setPastDueOpen] = useState(pastdue === "1");
  // Permanent-delete confirm (archived plans only) — type-the-name gate.
  const [deleteOpen, setDeleteOpen] = useState(false);
  // App-styled modal (replaces native Alert.alert) for confirms + errors.
  const { show: showModal, showError, modalProps } = useActionModal();
  const [log, setLog] = useState<PracticeLog | null>(null);
  const [busy, setBusy] = useState(false);
  const [attendancePlayers, setAttendancePlayers] = useState<
    AttendancePlayer[]
  >([]);
  // True only when roster + attendee data both loaded — gates the ratio
  // display and the tappable attendance sheet.
  const [attendanceAvailable, setAttendanceAvailable] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  // Tracks which drills' prep panels are open. Keyed by practice_plan_drills.id
  // so parallel drills can expand independently.
  const [expandedDrillIds, setExpandedDrillIds] = useState<Set<string>>(
    new Set()
  );
  const toggleDrillExpanded = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedDrillIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const load = useCallback(async () => {
    if (!id) return;

    const planSelect = (
      withExtras: boolean,
      withBlocks: boolean,
      withBreaks: boolean
    ) => {
      const drillCols = `id, drill_id, drill_order, duration_minutes, is_water_break${
        withExtras ? ", parallel_group, log_note" : ""
      }${withBlocks ? ", plan_block_id" : ""}, team_drills(id, drill_name, description, equipment, team_drill_categories(drill_categories(category_name)))`;
      const blockJoin = withBlocks
        ? ", practice_plan_blocks(id, name, block_order, target_minutes)"
        : "";
      const breakJoin = withBreaks
        ? ", practice_plan_breaks(id, after_block_order, break_order, duration_minutes)"
        : "";
      return supabase
        .from("practice_plans")
        .select(
          `id, team_id, practice_date, start_time, end_time, title, status, notes, practice_plan_drills(${drillCols})${blockJoin}${breakJoin}`
        )
        .eq("id", id)
        .maybeSingle();
    };
    // Degrade gracefully if newer schema bits aren't deployed yet.
    let planRes = await planSelect(true, true, true);
    if (
      planRes.error &&
      /practice_plan_breaks/i.test(planRes.error.message)
    ) {
      planRes = await planSelect(true, true, false);
    }
    if (
      planRes.error &&
      /practice_plan_blocks|plan_block_id/i.test(planRes.error.message)
    ) {
      planRes = await planSelect(true, false, false);
    }
    if (
      planRes.error &&
      /parallel_group|log_note/i.test(planRes.error.message)
    ) {
      planRes = await planSelect(false, false, false);
    }

    if (planRes.error) {
      console.warn("[practice/[id]] load error", planRes.error);
    }
    if (!planRes.data) {
      setPlan(null);
      return;
    }
    // The dynamic Supabase select strings defeat the typed-select parser,
    // so we cast through unknown for downstream property access.
    const planData = planRes.data as unknown as Record<string, unknown>;

    type CategoryRel = {
      drill_categories:
        | { category_name: string }
        | { category_name: string }[]
        | null;
    };
    type EquipmentJson = {
      cones?: number | null;
      other?: unknown;
    } | null;
    type DrillRow = {
      id: string;
      drill_id: string | null;
      drill_order: number;
      duration_minutes: number | null;
      is_water_break: boolean | null;
      parallel_group: number | null;
      log_note?: string | null;
      plan_block_id?: string | null;
      team_drills:
        | {
            drill_name: string;
            description: string | null;
            equipment: EquipmentJson;
            team_drill_categories: CategoryRel[] | null;
          }
        | {
            drill_name: string;
            description: string | null;
            equipment: EquipmentJson;
            team_drill_categories: CategoryRel[] | null;
          }[]
        | null;
    };

    const formatEquipment = (eq: EquipmentJson): string | null => {
      if (!eq) return null;
      const parts: string[] = [];
      if (typeof eq.cones === "number" && eq.cones > 0) {
        parts.push(`${eq.cones} cone${eq.cones === 1 ? "" : "s"}`);
      }
      if (Array.isArray(eq.other)) {
        for (const x of eq.other) {
          if (typeof x === "string" && x.trim()) parts.push(x.trim());
        }
      }
      return parts.length > 0 ? parts.join(", ") : null;
    };

    const drillRows = (
      (planData.practice_plan_drills as DrillRow[] | null) ?? []
    )
      .slice()
      .sort((a, b) => a.drill_order - b.drill_order)
      .map((d): PlanDrill => {
        const drill = Array.isArray(d.team_drills)
          ? d.team_drills[0]
          : d.team_drills;
        const cats = drill?.team_drill_categories ?? [];
        let categoryName: string | null = null;
        for (const rel of cats) {
          const dc = rel.drill_categories;
          const name = Array.isArray(dc)
            ? dc[0]?.category_name ?? null
            : dc?.category_name ?? null;
          if (name) {
            categoryName = name;
            break;
          }
        }
        const isWaterBreak = d.is_water_break === true;
        return {
          id: d.id,
          drillId: d.drill_id,
          drillOrder: d.drill_order,
          durationMinutes: d.duration_minutes,
          drillName: isWaterBreak
            ? "Water Break"
            : drill?.drill_name ?? "Unknown drill",
          categoryName: isWaterBreak ? null : categoryName,
          isWaterBreak,
          parallelGroup: d.parallel_group ?? null,
          logNote: (d.log_note ?? null) as string | null,
          planBlockId: (d.plan_block_id ?? null) as string | null,
          description:
            !isWaterBreak && drill?.description?.trim()
              ? drill.description.trim()
              : null,
          equipmentLabel: !isWaterBreak ? formatEquipment(drill?.equipment ?? null) : null,
        };
      });

    const status = normalizeStatus(planData.status as string);

    // archived_at fetched separately + guarded so a pre-migration-70 schema
    // (column missing) degrades to "not archived" instead of failing the
    // whole detail load.
    let archived = false;
    const archRes = await supabase
      .from("practice_plans")
      .select("archived_at")
      .eq("id", id)
      .maybeSingle();
    if (!archRes.error) {
      archived = !!(archRes.data?.archived_at as string | null);
    }

    const blockRowsRaw = (planData as { practice_plan_blocks?: unknown })
      .practice_plan_blocks as
      | {
          id: string;
          name: string;
          block_order: number;
          target_minutes: number | null;
        }[]
      | null
      | undefined;
    const blockSummaries: PlanBlockSummary[] = (blockRowsRaw ?? [])
      .slice()
      .sort((a, b) => a.block_order - b.block_order)
      .map((b) => ({
        id: b.id,
        name: b.name,
        blockOrder: b.block_order,
        targetMinutes: b.target_minutes ?? null,
      }));

    const breakRowsRaw = (planData as { practice_plan_breaks?: unknown })
      .practice_plan_breaks as
      | {
          id: string;
          after_block_order: number;
          break_order: number;
          duration_minutes: number;
        }[]
      | null
      | undefined;
    const breakSummaries: PlanBreakSummary[] = (breakRowsRaw ?? [])
      .slice()
      .sort(
        (a, b) =>
          a.after_block_order - b.after_block_order ||
          a.break_order - b.break_order
      )
      .map((br) => ({
        id: br.id,
        afterBlockOrder: br.after_block_order,
        breakOrder: br.break_order,
        durationMinutes: br.duration_minutes,
      }));

    setPlan({
      id: planData.id as string,
      teamId: planData.team_id as string,
      practiceDate: planData.practice_date as string,
      startTime: (planData.start_time as string | null) ?? null,
      endTime: (planData.end_time as string | null) ?? null,
      title: (planData.title as string | null) ?? null,
      status,
      notes: (planData.notes as string | null) ?? null,
      archived,
      drills: drillRows,
      blocks: blockSummaries,
      breaks: breakSummaries,
    });

    // Roster + attendance load for ALL statuses (was previously gated to
    // 'completed' only for the post-practice modal). The detail page now
    // hosts the live CHECK-IN card too, so the data must be available
    // pre-Prep + during 'live'.
    const teamId = planData.team_id as string;
    const rosterAttendance = await Promise.all([
      (async (): Promise<{
        data: any[] | null;
        error: { message: string } | null;
      }> => {
        // Try with color_index (migration 45); fall back without it.
        const sel = (withColor: boolean) =>
          supabase
            .from("team_players")
            .select(
              `id, player_name, positions${withColor ? ", color_index" : ""}`
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
      supabase
        .from("practice_plan_attendees")
        .select("player_id, attended, check_in_late")
        .eq("practice_plan_id", id),
    ]);
    let [rosterRes, attRes] = rosterAttendance;

    // Migration-41 fallback: drop the late column if it isn't shipped yet.
    // The two queries' inferred row types differ — cast to a shared shape so
    // the assignment back into attRes type-checks.
    if (attRes.error && /check_in_late/i.test(attRes.error.message)) {
      const fallback = await supabase
        .from("practice_plan_attendees")
        .select("player_id, attended")
        .eq("practice_plan_id", id);
      attRes = fallback as unknown as typeof attRes;
    }

    // "Who showed up" = the `attended` flag (migration 38). A row missing the
    // column (pre-migration) still counts as present.
    const attendeeRows =
      (attRes.data as
        | { player_id: string; attended?: boolean; check_in_late?: boolean }[]
        | null) ?? [];
    const attendingSet = new Set(
      attendeeRows.filter((r) => r.attended !== false).map((r) => r.player_id)
    );
    const lateSet = new Set(
      attendeeRows.filter((r) => r.check_in_late === true).map((r) => r.player_id)
    );

    if (status === "completed") {
      const [logRes, notesRes] = await Promise.all([
        supabase
          .from("practice_logs")
          .select(
            "drills_completed, drills_skipped, team_performance_notes, highlights, areas_to_improve, attendance_count, energy_level"
          )
          .eq("practice_plan_id", id)
          .maybeSingle(),
        supabase
          .from("player_notes")
          .select("player_id, note_text, created_at")
          .eq("practice_plan_id", id)
          .order("created_at", { ascending: true }),
      ]);

      const logData = logRes.data;
      if (logData) {
        setLog({
          drillsCompleted: (logData.drills_completed as string[] | null) ?? [],
          drillsSkipped: (logData.drills_skipped as string[] | null) ?? [],
          teamPerformanceNotes:
            (logData.team_performance_notes as string | null) ?? null,
          highlights: (logData.highlights as string | null) ?? null,
          areasToImprove: (logData.areas_to_improve as string | null) ?? null,
          attendanceCount:
            (logData.attendance_count as number | null) ?? null,
          energyLevel: (logData.energy_level as number | null) ?? null,
        });
      } else {
        setLog(null);
      }

      const notesByPlayer: Record<string, string[]> = {};
      for (const n of (notesRes.data as
        | { player_id: string; note_text: string | null }[]
        | null) ?? []) {
        const text = (n.note_text ?? "").trim();
        if (!text) continue;
        (notesByPlayer[n.player_id] ??= []).push(text);
      }
      const players: AttendancePlayer[] = (
        (rosterRes.data as
          | {
              id: string;
              player_name: string | null;
              positions: string[] | null;
              color_index?: number | null;
            }[]
          | null) ?? []
      ).map((p) => {
        const name = p.player_name ?? "Unknown";
        return {
          id: p.id,
          name,
          initials: initialsFromName(name),
          positions: p.positions ?? [],
          colorIndex: p.color_index ?? null,
          attended: attendingSet.has(p.id),
          checkInLate: lateSet.has(p.id),
          notes: notesByPlayer[p.id] ?? [],
        };
      });
      setAttendancePlayers(players);
      setAttendanceAvailable(
        !rosterRes.error && !attRes.error && players.length > 0
      );
    } else {
      setLog(null);
      // Pre-practice / live: same roster + attendance, no log notes.
      const players: AttendancePlayer[] = (
        (rosterRes.data as
          | {
              id: string;
              player_name: string | null;
              positions: string[] | null;
              color_index?: number | null;
            }[]
          | null) ?? []
      ).map((p) => {
        const name = p.player_name ?? "Unknown";
        return {
          id: p.id,
          name,
          initials: initialsFromName(name),
          positions: p.positions ?? [],
          colorIndex: p.color_index ?? null,
          attended: attendingSet.has(p.id),
          checkInLate: lateSet.has(p.id),
          notes: [],
        };
      });
      setAttendancePlayers(players);
      setAttendanceAvailable(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const finalize = () => {
    if (!plan) return;
    showModal({
      title: "Finalize plan?",
      message:
        "Finalizing schedules the practice and unlocks Prep Practice on practice day.",
      actions: [
        {
          label: "Finalize",
          variant: "primary",
          onPress: async () => {
            setBusy(true);
            const { error } = await supabase
              .from("practice_plans")
              .update({ status: "scheduled" })
              .eq("id", plan.id);
            setBusy(false);
            if (error) {
              showError("Couldn't finalize", error.message);
              return;
            }
            await load();
          },
        },
      ],
    });
  };

  // --- Check-in handlers (lifted from run.tsx so coaches can mark players
  //     present from the detail page during prep / pre-Begin practice) ----
  //
  // Tap = toggle attended on/off. Toggling OFF also clears the late flag —
  // "absent and late" is meaningless.
  // Long-press a checked-in player = toggle the late flag (orange clock badge).
  const upsertAttendee = async (
    planId: string,
    playerId: string,
    fields: { attended?: boolean; check_in_late?: boolean }
  ) => {
    let { error } = await supabase
      .from("practice_plan_attendees")
      .upsert(
        { practice_plan_id: planId, player_id: playerId, ...fields },
        { onConflict: "practice_plan_id,player_id" }
      );
    if (error && /check_in_late/i.test(error.message)) {
      // Migration 41 not applied — fall back to attended-only.
      const { check_in_late: _ignore, ...rest } = fields;
      void _ignore;
      await supabase
        .from("practice_plan_attendees")
        .upsert(
          { practice_plan_id: planId, player_id: playerId, ...rest },
          { onConflict: "practice_plan_id,player_id" }
        );
    }
  };

  const togglePlayer = async (playerId: string) => {
    if (!plan) return;
    const current = attendancePlayers.find((p) => p.id === playerId);
    const next = !(current?.attended ?? false);
    setAttendancePlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, attended: next, checkInLate: next ? p.checkInLate : false }
          : p
      )
    );
    await upsertAttendee(plan.id, playerId, {
      attended: next,
      check_in_late: next ? !!current?.checkInLate : false,
    });
  };

  const toggleLate = async (playerId: string) => {
    if (!plan) return;
    const current = attendancePlayers.find((p) => p.id === playerId);
    if (!current?.attended) return; // Late only meaningful when present.
    const next = !current.checkInLate;
    setAttendancePlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, checkInLate: next } : p))
    );
    await upsertAttendee(plan.id, playerId, {
      attended: true,
      check_in_late: next,
    });
  };

  const markAllPresent = async () => {
    if (!plan) return;
    if (attendancePlayers.every((p) => p.attended)) return;
    setAttendancePlayers((prev) =>
      prev.map((p) => ({ ...p, attended: true }))
    );
    let { error } = await supabase.from("practice_plan_attendees").upsert(
      attendancePlayers.map((p) => ({
        practice_plan_id: plan.id,
        player_id: p.id,
        attended: true,
        check_in_late: !!p.checkInLate,
      })),
      { onConflict: "practice_plan_id,player_id" }
    );
    if (error && /check_in_late/i.test(error.message)) {
      await supabase.from("practice_plan_attendees").upsert(
        attendancePlayers.map((p) => ({
          practice_plan_id: plan.id,
          player_id: p.id,
          attended: true,
        })),
        { onConflict: "practice_plan_id,player_id" }
      );
    }
  };

  const sendLiveToScheduled = () => {
    if (!plan) return;
    showModal({
      title: "Move back to scheduled?",
      message:
        "The practice will no longer show as live. Per-drill timing is preserved — re-starting will reset it for a fresh run.",
      actions: [
        {
          label: "Move",
          onPress: async () => {
            setBusy(true);
            const { error } = await supabase
              .from("practice_plans")
              .update({ status: "scheduled", started_at: null })
              .eq("id", plan.id);
            setBusy(false);
            if (error) {
              showError("Couldn't move practice", error.message);
              return;
            }
            await load();
          },
        },
      ],
    });
  };

  const startPractice = () => {
    if (!plan) return;
    showModal({
      title: "Start Practice?",
      message:
        "This marks the practice as live so the team knows it's underway. Per-drill timing resets for a fresh run; tap Live Practice when you're ready to start the timer.",
      actions: [
        {
          label: "Start",
          variant: "primary",
          onPress: async () => {
            setBusy(true);
            // Prep Practice marks the plan live but does NOT start the
            // practice timer. The clock kicks off only when the coach taps
            // Start timer on the run screen.
            const { error } = await supabase
              .from("practice_plans")
              .update({ status: "live", started_at: null })
              .eq("id", plan.id);
            if (error) {
              setBusy(false);
              showError(
                "Couldn't prep practice",
                `${error.message}\n\nIf this mentions a constraint, run migration 26 in Supabase first.`
              );
              return;
            }
            // Clean slate for the live run: clear any prior per-drill state.
            await supabase
              .from("practice_plan_drills")
              .update({
                run_status: "planned",
                run_started_at: null,
                run_elapsed_seconds: 0,
                run_timer_started_at: null,
              })
              .eq("practice_plan_id", plan.id);
            setBusy(false);
            // Jump straight into the live run screen. The timer still doesn't
            // start until the coach taps Start timer there — this just opens
            // the execution view so they're not stuck on the plan detail page.
            router.push(`/practice/${plan.id}/run` as never);
          },
        },
      ],
    });
  };

  // Permanent delete. Only reachable for already-archived plans, and only
  // after the type-the-name confirm in DeleteConfirmModal — so there's no
  // Alert here, just the mutation.
  const deletePlan = async () => {
    if (!plan) return;
    setBusy(true);
    const { error } = await supabase
      .from("practice_plans")
      .delete()
      .eq("id", plan.id);
    setBusy(false);
    if (error) {
      showError("Couldn't delete practice", error.message);
      return;
    }
    setDeleteOpen(false);
    setPastDueOpen(false);
    router.back();
  };

  // Archive = soft delete, and the ONLY way to remove an active practice.
  // Every status (draft/scheduled/live/completed) archives the same way:
  // the row + all its data stay intact, it just drops out of the active
  // lists. Deleting for good is a second step, available only once archived.
  const archivePlan = () => {
    if (!plan) return;
    showModal({
      title: "Archive practice?",
      message:
        "It moves to your Archived list and out of the active practice views. You can unarchive it later.",
      actions: [
        {
          label: "Archive",
          onPress: async () => {
            setBusy(true);
            const { error } = await supabase
              .from("practice_plans")
              .update({ archived_at: new Date().toISOString() })
              .eq("id", plan.id);
            setBusy(false);
            if (error) {
              showError("Couldn't archive practice", error.message);
              return;
            }
            setPastDueOpen(false);
            router.back();
          },
        },
      ],
    });
  };

  const unarchivePlan = async () => {
    if (!plan) return;
    setBusy(true);
    const { error } = await supabase
      .from("practice_plans")
      .update({ archived_at: null })
      .eq("id", plan.id);
    setBusy(false);
    if (error) {
      showError("Couldn't unarchive practice", error.message);
      return;
    }
    await load();
  };

  if (loading) {
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

  if (!plan) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
        }}
      >
        <Text
          style={{
            fontSize: 15,
            color: colors.text.secondary,
            textAlign: "center",
            marginBottom: spacing.lg,
          }}
        >
          Practice plan not found.
        </Text>
        <Button
          label="Back to Practice"
          onPress={() => router.back()}
          variant="secondary"
          fullWidth={false}
        />
      </View>
    );
  }

  // Group consecutive rows sharing a parallel_group into one block — a
  // parallel block runs in one slot and its duration counts once.
  const drillBlocks: PlanDrill[][] = [];
  for (const d of plan.drills) {
    const prev = drillBlocks[drillBlocks.length - 1];
    if (
      prev &&
      !d.isWaterBreak &&
      !prev[0].isWaterBreak &&
      d.parallelGroup != null &&
      prev[0].parallelGroup === d.parallelGroup
    ) {
      prev.push(d);
    } else {
      drillBlocks.push([d]);
    }
  }

  // Partition the drillBlocks into practice-block sections. If there are no
  // PlanBlockSummary rows (legacy plan or migration 42 not deployed), fall
  // back to one synthetic "Schedule" section so everything still renders.
  type PracticeSection = {
    block: PlanBlockSummary | null;
    items: PlanDrill[][];
    totalMinutes: number;
  };
  const sections: PracticeSection[] = (() => {
    if (plan.blocks.length === 0) {
      const total = drillBlocks.reduce(
        (s, b) => s + (b[0].durationMinutes ?? 0),
        0
      );
      return [{ block: null, items: drillBlocks, totalMinutes: total }];
    }
    const out: PracticeSection[] = plan.blocks.map((b) => ({
      block: b,
      items: [] as PlanDrill[][],
      totalMinutes: 0,
    }));
    const byId = new Map(out.map((s) => [s.block!.id, s]));
    // Any drill missing a planBlockId (older row) falls under the first
    // block so it doesn't disappear from the schedule.
    const fallback = out[0];
    for (const block of drillBlocks) {
      const ownerId = block[0].planBlockId;
      const target = (ownerId && byId.get(ownerId)) || fallback;
      target.items.push(block);
      target.totalMinutes += block[0].durationMinutes ?? 0;
    }
    return out;
  })();

  const totalDuration =
    sections.reduce((s, x) => s + x.totalMinutes, 0) +
    plan.breaks.reduce((s, b) => s + b.durationMinutes, 0);
  const window = diffMinutes(plan.startTime, plan.endTime);
  const remaining = window != null ? window - totalDuration : null;

  const startStr = formatTime(plan.startTime);
  const endStr = formatTime(plan.endTime);

  // Water breaks aren't drills — they're excluded from the completed stats.
  const realDrills = plan.drills.filter((d) => !d.isWaterBreak);
  const skippedNames = log
    ? realDrills
        .filter((d) => d.drillId != null && log.drillsSkipped.includes(d.drillId))
        .map((d) => d.drillName)
    : [];
  const completedCount = log
    ? realDrills.filter(
        (d) => d.drillId != null && log.drillsCompleted.includes(d.drillId)
      ).length
    : 0;

  const waterBreakCount =
    plan.drills.length - realDrills.length + plan.breaks.length;
  const scheduleSummary =
    `${realDrills.length} ${realDrills.length === 1 ? "drill" : "drills"}` +
    (waterBreakCount > 0
      ? ` · ${waterBreakCount} ${
          waterBreakCount === 1 ? "water break" : "water breaks"
        }`
      : "") +
    ` · ${totalDuration} min`;

  const presentCount = attendancePlayers.filter((p) => p.attended).length;
  const rosterCount = attendancePlayers.length;

  const metaLine = [
    plan.title,
    startStr && endStr ? `${startStr} – ${endStr}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      {/* Soft orange bloom behind the header — atmosphere, not a box. */}
      <LinearGradient
        colors={["rgba(255, 106, 26, 0.09)", "rgba(255, 106, 26, 0)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 320 }}
      />
      <View
        style={{
          paddingTop: insets.top + spacing.lg,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back"
          hitSlop={10}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: pressed
              ? colors.surface.pressed
              : colors.surface.muted,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={colors.text.secondary}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing["3xl"] + 80,
        }}
      >
        <Eyebrow tick variant="brand" style={{ marginTop: spacing.xs }}>
          Practice Plan
        </Eyebrow>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: spacing.md,
            marginTop: spacing.sm,
          }}
        >
          <Text
            style={{
              flex: 1,
              fontSize: 30,
              lineHeight: 36,
              fontWeight: "500",
              letterSpacing: -0.6,
              color: colors.text.primary,
            }}
          >
            {formatLongDate(plan.practiceDate)}
          </Text>
          <TouchableOpacity
            onPress={() =>
              router.push(
                (plan.status === "completed"
                  ? `/practice/${plan.id}/log`
                  : `/practice/${plan.id}/edit`) as never
              )
            }
            accessibilityLabel={
              plan.status === "completed" ? "Edit log" : "Edit plan"
            }
            hitSlop={8}
            activeOpacity={0.8}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.orange.tint,
              borderWidth: 1,
              borderColor: colors.orange.tintBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="create-outline"
              size={20}
              color={colors.orange[400]}
            />
          </TouchableOpacity>
        </View>
        {metaLine ? (
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: colors.text.secondary,
              marginTop: spacing.xs,
              fontVariant: ["tabular-nums"],
            }}
          >
            {metaLine}
          </Text>
        ) : null}
        <View className="flex-row" style={{ marginTop: spacing.md }}>
          <StatusBadge status={plan.status} />
        </View>
        {/* Accent rule — separates the open header from the content. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: spacing.xl,
          }}
        >
          <View
            style={{
              width: 28,
              height: 2,
              borderRadius: 1,
              backgroundColor: colors.orange[500],
            }}
          />
          <View
            style={{
              flex: 1,
              height: 1,
              backgroundColor: colors.border.subtle,
            }}
          />
        </View>

        {/* Practice Log — completed practices lead with the outcome */}
        {plan.status === "completed" && log ? (
          <View style={{ marginTop: spacing["2xl"] }}>
            <Eyebrow tick>Practice Log</Eyebrow>

            <Text
              style={{
                fontSize: 15,
                lineHeight: 22,
                color: colors.text.secondary,
                marginTop: spacing.sm,
              }}
            >
              <Text style={{ color: colors.text.primary, fontWeight: "500" }}>
                {completedCount} of {realDrills.length}
              </Text>
              {" drills completed"}
              {skippedNames.length > 0
                ? ` · ${skippedNames.length} skipped`
                : ""}
            </Text>

            <View
              style={{
                flexDirection: "row",
                gap: spacing.sm,
                marginTop: spacing.md,
              }}
            >
              <StatCard
                label="Attendance"
                icon="people-outline"
                value={
                  attendanceAvailable
                    ? `${presentCount} / ${rosterCount}`
                    : String(log.attendanceCount ?? "—")
                }
                caption={
                  attendanceAvailable ? "View who showed" : "Players present"
                }
                onPress={
                  attendanceAvailable
                    ? () => setAttendanceOpen(true)
                    : undefined
                }
              />
              <StatCard
                label="Energy"
                icon="flash-outline"
                value={String(log.energyLevel ?? "—")}
                caption={
                  log.energyLevel != null
                    ? ENERGY_ANCHORS[log.energyLevel]
                    : "Not logged"
                }
              />
            </View>

            {log.teamPerformanceNotes ||
            log.highlights ||
            log.areasToImprove ? (
              <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
                {log.teamPerformanceNotes ? (
                  <DebriefCard
                    label="Team performance"
                    icon="clipboard-outline"
                    accent={colors.blue[400]}
                    body={log.teamPerformanceNotes}
                  />
                ) : null}
                {log.highlights ? (
                  <DebriefCard
                    label="What went well"
                    icon="checkmark-circle-outline"
                    accent={colors.green[400]}
                    body={log.highlights}
                  />
                ) : null}
                {log.areasToImprove ? (
                  <DebriefCard
                    label="What needs work"
                    icon="construct-outline"
                    accent={colors.amber[400]}
                    body={log.areasToImprove}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {plan.notes ? (
          <View style={{ marginTop: spacing["2xl"] }}>
            <Eyebrow tick>Notes</Eyebrow>
            <Text
              style={{
                fontSize: 15,
                lineHeight: 22,
                color: colors.text.secondary,
                marginTop: spacing.sm,
              }}
            >
              {plan.notes}
            </Text>
          </View>
        ) : null}

        {/* Check-in — pre-practice + during live. Hidden once the practice
            is completed (post-practice attendance lives in the read-only
            modal triggered from the log card below). */}
        {(plan.status === "scheduled" || plan.status === "live") &&
        attendancePlayers.length > 0 ? (
          <View style={{ marginTop: spacing["3xl"] }}>
            <View
              className="flex-row items-center justify-between"
              style={{ marginBottom: spacing.md }}
            >
              <Eyebrow tick>Check-in</Eyebrow>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Text
                  style={[
                    monoStyle("bold"),
                    { fontSize: 15, color: colors.lime[400] },
                  ]}
                >
                  {attendancePlayers.filter((p) => p.attended).length}
                </Text>
                <Text
                  style={[
                    monoStyle("medium"),
                    { fontSize: 11, color: colors.text.muted },
                  ]}
                >
                  / {attendancePlayers.length} here
                </Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.sm,
              }}
            >
              {attendancePlayers.map((p) => {
                const present = p.attended;
                const late = present && !!p.checkInLate;
                const accent = positionColor(p.positions[0]);
                const ringColor = late
                  ? colors.orange[500]
                  : present
                    ? colors.lime[400]
                    : "transparent";
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => togglePlayer(p.id)}
                    onLongPress={() => toggleLate(p.id)}
                    delayLongPress={350}
                    activeOpacity={0.7}
                    accessibilityLabel={`${p.name}, ${
                      late
                        ? "checked in late"
                        : present
                          ? "checked in"
                          : "not here"
                    }. Long press to ${late ? "clear late" : "mark late"}.`}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: present
                        ? accent
                        : colors.surface.elevated,
                      borderWidth: 2,
                      borderColor: ringColor,
                      opacity: present ? 1 : 0.45,
                    }}
                  >
                    <Text
                      style={[
                        monoStyle("bold"),
                        {
                          fontSize: 13,
                          color: present
                            ? colors.text.onBrand
                            : colors.text.primary,
                        },
                      ]}
                    >
                      {p.initials}
                    </Text>
                    {present ? (
                      <View
                        style={{
                          position: "absolute",
                          bottom: -3,
                          right: -3,
                          width: 16,
                          height: 16,
                          borderRadius: 8,
                          backgroundColor: late
                            ? colors.orange[500]
                            : colors.lime[400],
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 2,
                          borderColor: colors.surface.base,
                        }}
                      >
                        <Ionicons
                          name={late ? "time-outline" : "checkmark"}
                          size={9}
                          color={colors.text.onBrand}
                        />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: spacing.md,
              }}
            >
              <Text
                style={[
                  fontStyle("regular"),
                  { fontSize: 11, color: colors.text.muted },
                ]}
              >
                Tap to check in · long-press to mark late
              </Text>
              <TouchableOpacity onPress={markAllPresent} activeOpacity={0.7}>
                <Text
                  style={[
                    fontStyle("semibold"),
                    { fontSize: 11, color: colors.orange[500] },
                  ]}
                >
                  Mark all present →
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Schedule */}
        <View style={{ marginTop: spacing["3xl"] }}>
          <View
            className="flex-row items-center justify-between"
            style={{ marginBottom: spacing.md }}
          >
            <Eyebrow tick>Schedule</Eyebrow>
            <Text
              style={{
                fontSize: 13,
                color: colors.text.secondary,
                fontVariant: ["tabular-nums"],
              }}
            >
              {scheduleSummary}
            </Text>
          </View>

          {plan.drills.length === 0 ? (
            <View
              style={{
                padding: spacing["2xl"],
                borderRadius: radius.lg,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: colors.border.default,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: colors.text.secondary,
                  textAlign: "center",
                }}
              >
                No drills added to this plan.
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.lg }}>
              {sections.map((section, sectionIdx) => {
                const isLastSection = sectionIdx === sections.length - 1;
                const blockOrder = section.block?.blockOrder ?? -1;
                // Between-block water breaks rendered immediately after the
                // section card. Skipped after the last section.
                const gapBreaks = isLastSection
                  ? []
                  : plan.breaks
                      .filter((br) => br.afterBlockOrder === blockOrder)
                      .sort((a, b) => a.breakOrder - b.breakOrder);
                return (
                <Fragment key={section.block?.id ?? "fallback-section"}>
                <View
                  style={{ gap: spacing.sm }}
                >
                  {section.block ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.sm,
                        paddingHorizontal: 2,
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          backgroundColor: blockFillColor(section.block.name),
                        }}
                      />
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 13,
                          fontWeight: "700",
                          color: colors.text.primary,
                        }}
                      >
                        {section.block.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.text.muted,
                          fontVariant: ["tabular-nums"],
                        }}
                      >
                        {section.totalMinutes}m
                        {section.block.targetMinutes != null
                          ? ` / ${section.block.targetMinutes}m target`
                          : ""}
                      </Text>
                    </View>
                  ) : null}
                  {section.items.map((block, idx) => {
                    const head = block[0];
                    const isParallel = block.length > 1;
                    const accent = head.isWaterBreak
                      ? colors.blue[400]
                      : isParallel
                      ? colors.team.violet
                      : head.categoryName
                      ? colorForCategory(head.categoryName)
                      : colors.border.strong;
                    // For a single-drill card the whole card toggles expand.
                    // Parallel cards keep per-drill header toggles (one card,
                    // several independently-expandable drills).
                    const cardDrill = isParallel ? null : block[0];
                    const cardExpandable =
                      cardDrill != null &&
                      (!!cardDrill.description ||
                        !!cardDrill.equipmentLabel ||
                        !!cardDrill.drillId);
                    const cardExpanded =
                      cardDrill != null && expandedDrillIds.has(cardDrill.id);
                    return (
                      <TouchableOpacity
                        key={head.id}
                        activeOpacity={cardExpandable ? 0.7 : 1}
                        onPress={
                          cardExpandable
                            ? () => toggleDrillExpanded(cardDrill!.id)
                            : undefined
                        }
                        disabled={!cardExpandable}
                        accessibilityRole={cardExpandable ? "button" : undefined}
                        accessibilityState={
                          cardExpandable ? { expanded: cardExpanded } : undefined
                        }
                        style={{
                      backgroundColor: colors.surface.raised,
                      borderRadius: radius.lg,
                      borderWidth: 1,
                      borderColor: colors.border.card,
                      borderLeftWidth: 3,
                      borderLeftColor: accent,
                      padding: spacing.md,
                    }}
                  >
                    <View
                      className="flex-row items-start"
                      style={{ gap: spacing.sm }}
                    >
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          backgroundColor: `${accent}22`,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: accent,
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {idx + 1}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: spacing.sm }}>
                        {isParallel ? (
                          <Text
                            style={{
                              fontSize: 10,
                              letterSpacing: 1.2,
                              textTransform: "uppercase",
                              fontWeight: "700",
                              color: colors.team.violet,
                            }}
                          >
                            Parallel · counts once
                          </Text>
                        ) : null}
                        {block.map((d) => {
                          const skipped =
                            log != null &&
                            !d.isWaterBreak &&
                            d.drillId != null &&
                            log.drillsSkipped.includes(d.drillId);
                          const note = d.logNote?.trim();
                          const hasDesc = !!d.description;
                          const hasEquip = !!d.equipmentLabel;
                          const hasPrep = hasDesc || hasEquip;
                          const expandable = hasPrep || !!d.drillId;
                          const isExpanded = expandedDrillIds.has(d.id);
                          return (
                            <View key={d.id} style={{ gap: spacing.xs }}>
                              {/* Header row: drill name + chevron */}
                              <TouchableOpacity
                                onPress={
                                  expandable
                                    ? () => toggleDrillExpanded(d.id)
                                    : undefined
                                }
                                disabled={!expandable}
                                activeOpacity={expandable ? 0.7 : 1}
                                accessibilityRole={
                                  expandable ? "button" : undefined
                                }
                                accessibilityState={
                                  expandable
                                    ? { expanded: isExpanded }
                                    : undefined
                                }
                                hitSlop={expandable ? 6 : undefined}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: spacing.sm,
                                }}
                              >
                                <Text
                                  style={{
                                    flex: 1,
                                    fontSize: 15,
                                    lineHeight: 22,
                                    fontWeight: "500",
                                    color: colors.text.primary,
                                  }}
                                >
                                  {d.drillName}
                                </Text>
                                {expandable ? (
                                  <Ionicons
                                    name={
                                      isExpanded
                                        ? "chevron-up"
                                        : "chevron-down"
                                    }
                                    size={14}
                                    color={colors.text.muted}
                                  />
                                ) : null}
                              </TouchableOpacity>

                              {skipped ? <SkippedPill /> : null}

                              {/* Collapsed: signal badges */}
                              {hasPrep && !isExpanded ? (
                                <View
                                  style={{
                                    flexDirection: "row",
                                    flexWrap: "wrap",
                                    gap: 6,
                                    marginTop: 2,
                                  }}
                                >
                                  {hasDesc ? (
                                    <PrepSignal
                                      icon="reader-outline"
                                      label="Notes"
                                    />
                                  ) : null}
                                  {hasEquip ? (
                                    <PrepSignal
                                      icon="construct-outline"
                                      label="Equipment"
                                    />
                                  ) : null}
                                </View>
                              ) : null}

                              {/* Expanded: labeled sections + CTA */}
                              {expandable && isExpanded ? (
                                <View
                                  style={{
                                    marginTop: spacing.sm,
                                    gap: spacing.md,
                                  }}
                                >
                                  {hasDesc ? (
                                    <View style={{ gap: spacing.xs }}>
                                      <Eyebrow tick>Coaching notes</Eyebrow>
                                      <Text
                                        style={{
                                          fontSize: 13,
                                          lineHeight: 19,
                                          color: colors.text.secondary,
                                        }}
                                      >
                                        {d.description}
                                      </Text>
                                    </View>
                                  ) : null}
                                  {hasEquip ? (
                                    <View style={{ gap: spacing.xs }}>
                                      <Eyebrow tick>Equipment</Eyebrow>
                                      <View
                                        style={{
                                          flexDirection: "row",
                                          alignItems: "center",
                                          gap: 6,
                                        }}
                                      >
                                        <Ionicons
                                          name="construct-outline"
                                          size={13}
                                          color={colors.text.secondary}
                                        />
                                        <Text
                                          style={{
                                            fontSize: 13,
                                            color: colors.text.secondary,
                                          }}
                                        >
                                          {d.equipmentLabel}
                                        </Text>
                                      </View>
                                    </View>
                                  ) : null}
                                  {d.drillId ? (
                                    <TouchableOpacity
                                      onPress={() =>
                                        router.push(
                                          `/drills/${d.drillId}` as never
                                        )
                                      }
                                      accessibilityRole="link"
                                      hitSlop={6}
                                      activeOpacity={0.7}
                                      style={{
                                        borderTopWidth: 1,
                                        borderTopColor: colors.border.subtle,
                                        paddingTop: spacing.sm,
                                        flexDirection: "row",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                      }}
                                    >
                                      <Text
                                        style={{
                                          fontSize: 12.5,
                                          fontWeight: "600",
                                          color: colors.orange[500],
                                          letterSpacing: 0.3,
                                        }}
                                      >
                                        View full drill
                                      </Text>
                                      <Ionicons
                                        name="arrow-forward"
                                        size={14}
                                        color={colors.orange[500]}
                                      />
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              ) : null}

                              {note ? (
                                <View
                                  style={{
                                    borderLeftWidth: 2,
                                    borderLeftColor: colors.border.strong,
                                    paddingLeft: spacing.sm,
                                    marginTop: spacing.xs,
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 13,
                                      lineHeight: 19,
                                      color: colors.text.label,
                                    }}
                                  >
                                    {note}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                      <Text
                        style={{
                          fontSize: 13,
                          color: colors.text.secondary,
                          fontVariant: ["tabular-nums"],
                        }}
                      >
                        {head.durationMinutes ?? 0} min
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
                  })}
                </View>
                {gapBreaks.map((br) => (
                  <View
                    key={br.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.sm,
                      borderWidth: 1,
                      borderStyle: "dashed",
                      borderColor: `${colors.blue[400]}55`,
                      borderRadius: radius.lg,
                      backgroundColor: colors.surface.raised,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                    }}
                  >
                    <Ionicons
                      name="water"
                      size={14}
                      color={colors.blue[400]}
                    />
                    <Text
                      style={{
                        fontSize: 10,
                        letterSpacing: 1.2,
                        textTransform: "uppercase",
                        fontWeight: "700",
                        color: colors.blue[400],
                      }}
                    >
                      Water break
                    </Text>
                    <View style={{ flex: 1 }} />
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.text.muted,
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {br.durationMinutes} min
                    </Text>
                  </View>
                ))}
                </Fragment>
                );
              })}
            </View>
          )}

          {window != null && remaining != null ? (
            <View style={{ marginTop: spacing.md }}>
              <View
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.surface.raised,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${Math.min(100, (totalDuration / window) * 100)}%`,
                    height: "100%",
                    backgroundColor:
                      remaining < 0
                        ? colors.orange[500]
                        : colors.orange[500],
                    borderRadius: 3,
                  }}
                />
              </View>
              <Text
                style={{
                  fontSize: 13,
                  color:
                    remaining < 0
                      ? colors.orange[400]
                      : colors.text.secondary,
                  marginTop: spacing.xs,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {totalDuration} min planned of {window} min window
                {remaining < 0
                  ? ` · ${Math.abs(remaining)} min over`
                  : remaining > 0
                  ? ` · ${remaining} min available`
                  : ""}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Actions */}
        {plan.archived ? (
          <View style={{ marginTop: spacing["3xl"], gap: spacing.md }}>
            <Button
              label={busy ? "Unarchiving…" : "Unarchive"}
              onPress={unarchivePlan}
              disabled={busy}
            />
            <Button
              label="Delete practice"
              onPress={() => setDeleteOpen(true)}
              disabled={busy}
              variant="destructive"
            />
          </View>
        ) : (
          <View style={{ marginTop: spacing["3xl"], gap: spacing.md }}>
            {plan.status === "draft" && (
              <Button
                label={busy ? "Updating…" : "Finalize"}
                onPress={finalize}
                disabled={busy}
              />
            )}
            {plan.status === "scheduled" && (
              <Button
                label={busy ? "Starting…" : "Start Practice"}
                onPress={startPractice}
                disabled={busy}
              />
            )}
            {plan.status === "live" && (
              <>
                <Button
                  label="Live Practice"
                  onPress={() =>
                    router.push(`/practice/${plan.id}/run` as never)
                  }
                />
                <Button
                  label={busy ? "Moving…" : "Move back to scheduled"}
                  onPress={sendLiveToScheduled}
                  disabled={busy}
                  variant="secondary"
                />
              </>
            )}
            {plan.status === "scheduled" && (
              <Button
                label="Log Practice"
                onPress={() =>
                  router.push(`/practice/${plan.id}/log` as never)
                }
                variant="secondary"
              />
            )}
            {/* Active practices are only ever archived — never deleted
                directly. Deleting for good happens later, from the archive. */}
            <Button
              label={busy ? "Archiving…" : "Archive practice"}
              onPress={archivePlan}
              disabled={busy}
              variant="secondary"
            />
          </View>
        )}
      </ScrollView>

      <PracticeAttendanceSheet
        visible={attendanceOpen}
        onClose={() => setAttendanceOpen(false)}
        practicePlanId={plan.id}
        dateLabel={formatLongDate(plan.practiceDate)}
        players={attendancePlayers}
        onChanged={load}
      />

      <PastDueModal
        open={pastDueOpen}
        onClose={() => setPastDueOpen(false)}
        title="This practice is past due."
        body="It came and went without being closed out. Reschedule it, log what happened, or archive it."
        actions={[
          {
            label: "Log practice",
            variant: "primary",
            onPress: () => {
              setPastDueOpen(false);
              router.push(`/practice/${plan.id}/log` as never);
            },
          },
          {
            label: "Reschedule",
            variant: "secondary",
            onPress: () => {
              setPastDueOpen(false);
              router.push(`/practice/${plan.id}/edit` as never);
            },
          },
          // Active practices archive, never hard-delete. Permanent delete is
          // a second step available only from the archive.
          {
            label: "Archive",
            variant: "secondary" as const,
            onPress: archivePlan,
          },
        ]}
      />

      <DeleteConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={plan.title}
        busy={busy}
        onConfirm={deletePlan}
      />

      <ActionModal {...modalProps} />
    </View>
  );
}
