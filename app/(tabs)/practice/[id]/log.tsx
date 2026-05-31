import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { TextArea } from "../../../../components/ui/TextArea";
import { DrillNoteHistorySheet } from "../../../../components/DrillNoteHistorySheet";
import { colors, radius, spacing } from "../../../../constants/design";
import { fontStyle, monoStyle } from "../../../../constants/typography";
import { blockFillColor } from "../../../../constants/block-colors";
import {
  initialsFromName,
  playerColorForIndex,
  splitFirstLast,
} from "../../../../lib/athlete";
import { supabase } from "../../../../lib/supabase";
import { useAuth } from "../../../../lib/auth-context";

type PlanStatus = "draft" | "scheduled" | "live" | "completed";

function normalizeStatus(raw: string): PlanStatus {
  if (raw === "finalized") return "scheduled"; // pre-migration rows
  if (raw === "scheduled" || raw === "live" || raw === "completed") return raw;
  return "draft";
}

type PlanDrill = {
  id: string; // practice_plan_drills row id
  drillId: string; // team_drills id
  drillOrder: number;
  drillName: string;
  parallelGroup: number | null;
  runStatus: string;
  logNote: string; // practice_plan_drills.log_note — post-practice note
  // Which practice block this drill is part of. Null on legacy plans.
  planBlockId: string | null;
};

type LogBlock = {
  id: string;
  name: string;
  blockOrder: number;
};

type LiveNote = { time: string; text: string };

type RosterPlayer = {
  id: string;
  firstName: string;
  initials: string;
  positions: string[];
  // Player's stable color slot (migration 45). Drives the per-player
  // avatar color in the post-practice notes section.
  colorIndex: number | null;
};

type Plan = {
  id: string;
  teamId: string;
  practiceDate: string;
  status: PlanStatus;
  drills: PlanDrill[];
  blocks: LogBlock[];
};

const ENERGY_ANCHORS: Record<number, string> = {
  1: "Low energy",
  2: "Sluggish",
  3: "Average",
  4: "Good energy",
  5: "Fired up",
};

function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function formatLongDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// A captured-at timestamp → 12-hour "h:mm".
function formatClock(iso: string): string {
  const dt = new Date(iso);
  const h = dt.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function SectionHeader({
  num,
  label,
  right,
}: {
  num: string;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.md,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 3,
            height: 14,
            borderRadius: 2,
            backgroundColor: colors.orange[500],
            marginRight: 8,
          }}
        />
        <Text
          style={[
            monoStyle("bold"),
            {
              fontSize: 11,
              letterSpacing: 1.5,
              color: colors.text.secondary,
              marginRight: 6,
            },
          ]}
        >
          {num}
        </Text>
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: colors.text.primary,
            },
          ]}
        >
          {label}
        </Text>
      </View>
      {right}
    </View>
  );
}

function GuardScreen({
  message,
  buttonLabel,
  onPress,
}: {
  message: string;
  buttonLabel: string;
  onPress: () => void;
}) {
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
        style={[
          fontStyle("regular"),
          {
            fontSize: 15,
            lineHeight: 22,
            color: colors.text.secondary,
            textAlign: "center",
            marginBottom: spacing.lg,
          },
        ]}
      >
        {message}
      </Text>
      <Button
        label={buttonLabel}
        onPress={onPress}
        variant="secondary"
        fullWidth={false}
      />
    </View>
  );
}

// One drill in the 01 DRILLS section — completed/skipped toggle, a post-practice
// note that carries forward, live-run notes pulled in as reference, and a link
// to the drill's note history.
function DrillRow({
  drill,
  completed,
  note,
  liveNotes,
  onToggle,
  onChangeNote,
  onAppendLive,
  onOpenHistory,
}: {
  drill: PlanDrill;
  completed: boolean;
  note: string;
  liveNotes: LiveNote[];
  onToggle: () => void;
  onChangeNote: (t: string) => void;
  onAppendLive: (t: string) => void;
  onOpenHistory: () => void;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: completed }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
        }}
      >
        <Text
          style={[
            fontStyle("semibold"),
            { flex: 1, fontSize: 15, color: colors.text.primary },
          ]}
        >
          {drill.drillName}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 10,
                letterSpacing: 1,
                color: completed ? colors.green[400] : colors.orange[500],
              },
            ]}
          >
            {completed ? "DONE" : "SKIPPED"}
          </Text>
          <Ionicons
            name={completed ? "checkmark-circle" : "close-circle"}
            size={22}
            color={completed ? colors.green[400] : colors.orange[500]}
          />
        </View>
      </TouchableOpacity>

      <TextArea
        value={note}
        onChangeText={onChangeNote}
        placeholder="Notes for this drill — what to work on next time…"
        style={{
          minHeight: 56,
          backgroundColor: colors.surface.raised,
          borderColor: colors.border.subtle,
          borderRadius: radius.md,
        }}
      />

      {liveNotes.length > 0 ? (
        <View style={{ gap: 5, marginTop: 2 }}>
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 9,
                letterSpacing: 0.8,
                color: colors.text.muted,
              },
            ]}
          >
            FROM PRACTICE · TAP TO ADD
          </Text>
          {liveNotes.map((ln, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => onAppendLive(ln.text)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text
                style={[
                  monoStyle("medium"),
                  { fontSize: 10, color: colors.text.muted },
                ]}
              >
                {ln.time}
              </Text>
              <Text
                style={[
                  fontStyle("regular"),
                  {
                    flex: 1,
                    fontSize: 12,
                    lineHeight: 17,
                    color: colors.text.label,
                  },
                ]}
              >
                {ln.text}
              </Text>
              <Ionicons
                name="add-circle-outline"
                size={15}
                color={colors.text.muted}
              />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <TouchableOpacity
        onPress={onOpenHistory}
        activeOpacity={0.7}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          alignSelf: "flex-start",
          marginTop: 2,
        }}
      >
        <Ionicons name="time-outline" size={13} color={colors.orange[400]} />
        <Text
          style={[
            fontStyle("semibold"),
            { fontSize: 11.5, color: colors.orange[400] },
          ]}
        >
          Note history
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function PracticeLogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [drillNotes, setDrillNotes] = useState<Record<string, string>>({});
  const [liveNotesByDrill, setLiveNotesByDrill] = useState<
    Record<string, LiveNote[]>
  >({});
  const [teamPerformanceNotes, setTeamPerformanceNotes] = useState("");
  const [highlights, setHighlights] = useState("");
  const [areasToImprove, setAreasToImprove] = useState("");
  const [attendance, setAttendance] = useState("");
  const [energy, setEnergy] = useState<number | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [playerNotes, setPlayerNotes] = useState<Record<string, string>>({});
  const [expandedPlayers, setExpandedPlayers] = useState<
    Record<string, boolean>
  >({});
  const [historyTarget, setHistoryTarget] = useState<{
    drillId: string;
    drillName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set when this plan already has a practice_logs row — switches the screen
  // into edit mode (prefill from the saved log, update instead of insert).
  const [existingLogId, setExistingLogId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setLoading(false);
      return;
    }

    (async () => {
      const planSelect = (withExtras: boolean, withBlocks: boolean) => {
        const drillCols = `id, drill_id, drill_order, is_water_break${
          withExtras ? ", parallel_group, run_status, log_note" : ""
        }${withBlocks ? ", plan_block_id" : ""}, team_drills(id, drill_name)`;
        const blockJoin = withBlocks
          ? ", practice_plan_blocks(id, name, block_order)"
          : "";
        return supabase
          .from("practice_plans")
          .select(
            `id, team_id, practice_date, status, practice_plan_drills(${drillCols})${blockJoin}`
          )
          .eq("id", id)
          .maybeSingle();
      };
      let planQ = await planSelect(true, true);
      if (
        planQ.error &&
        /plan_block_id|practice_plan_blocks/i.test(planQ.error.message)
      ) {
        planQ = await planSelect(true, false);
      }
      if (
        planQ.error &&
        /parallel_group|run_status|log_note/i.test(planQ.error.message)
      ) {
        planQ = await planSelect(false, false);
      }
      const planData = planQ.data as unknown as Record<string, unknown> | null;

      if (cancelled) return;

      if (!planData) {
        setPlan(null);
        setLoading(false);
        return;
      }

      type DrillRowData = {
        id: string;
        drill_id: string | null;
        drill_order: number;
        is_water_break: boolean | null;
        parallel_group: number | null;
        run_status?: string | null;
        log_note?: string | null;
        plan_block_id?: string | null;
        team_drills:
          | { drill_name: string }
          | { drill_name: string }[]
          | null;
      };

      const drillRows = (
        (planData.practice_plan_drills as DrillRowData[] | null) ?? []
      )
        .slice()
        // Water breaks aren't drills — they can't be completed/skipped or noted.
        .filter((d) => !d.is_water_break)
        .sort((a, b) => a.drill_order - b.drill_order)
        .map((d): PlanDrill => {
          const drill = Array.isArray(d.team_drills)
            ? d.team_drills[0]
            : d.team_drills;
          return {
            id: d.id,
            drillId: d.drill_id ?? "",
            drillOrder: d.drill_order,
            drillName: drill?.drill_name ?? "Unknown drill",
            parallelGroup: d.parallel_group ?? null,
            runStatus: d.run_status ?? "planned",
            logNote: d.log_note ?? "",
            planBlockId: (d.plan_block_id ?? null) as string | null,
          };
        });

      const blockRowsRaw = (planData.practice_plan_blocks as
        | { id: string; name: string; block_order: number }[]
        | null
        | undefined) ?? [];
      const logBlocks: LogBlock[] = blockRowsRaw
        .slice()
        .sort((a, b) => a.block_order - b.block_order)
        .map((b) => ({
          id: b.id,
          name: b.name,
          blockOrder: b.block_order,
        }));

      const teamId = planData.team_id as string;

      // Prefill from the live run: a drill marked 'skipped' starts unchecked.
      const initCompleted: Record<string, boolean> = {};
      const initDrillNotes: Record<string, string> = {};
      for (const d of drillRows) {
        initCompleted[d.drillId] = d.runStatus !== "skipped";
        initDrillNotes[d.id] = d.logNote;
      }

      const [attendeeQ, notesQ, rosterQ, logQ, playerNotesQ] =
        await Promise.all([
          supabase
            .from("practice_plan_attendees")
            .select("id", { count: "exact", head: true })
            .eq("practice_plan_id", id)
            .eq("attended", true),
          supabase
            .from("practice_notes")
            .select("note_text, drill_id, drill_label, created_at")
            .eq("practice_plan_id", id)
            .order("created_at", { ascending: true }),
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
            .from("practice_logs")
            .select(
              "id, drills_completed, drills_skipped, team_performance_notes, highlights, areas_to_improve, attendance_count, energy_level"
            )
            .eq("practice_plan_id", id)
            .maybeSingle(),
          supabase
            .from("player_notes")
            .select("player_id, note_text")
            .eq("practice_plan_id", id),
        ]);

      if (cancelled) return;

      // Live practice notes: drill-tagged ones feed each drill; untagged ones
      // prefill the team-performance field.
      const noteRows =
        (notesQ.data as
          | {
              note_text: string;
              drill_id: string | null;
              drill_label: string | null;
              created_at: string;
            }[]
          | null) ?? [];
      const byDrill: Record<string, LiveNote[]> = {};
      const generalLines: string[] = [];
      for (const n of noteRows) {
        if (n.drill_id) {
          (byDrill[n.drill_id] ??= []).push({
            time: formatClock(n.created_at),
            text: n.note_text,
          });
        } else {
          generalLines.push(
            `[${formatClock(n.created_at)}] ${n.note_text}`
          );
        }
      }

      const rosterPlayers: RosterPlayer[] = (rosterQ.data ?? []).map((p) => {
        const name = (p.player_name as string) ?? "";
        return {
          id: p.id as string,
          firstName: splitFirstLast(name).first || name,
          initials: initialsFromName(name),
          positions: (p.positions as string[] | null) ?? [],
          colorIndex: (p.color_index as number | null) ?? null,
        };
      });

      setPlan({
        id: planData.id as string,
        teamId,
        practiceDate: planData.practice_date as string,
        status: normalizeStatus(planData.status as string),
        drills: drillRows,
        blocks: logBlocks,
      });
      setDrillNotes(initDrillNotes);
      setLiveNotesByDrill(byDrill);
      setRoster(rosterPlayers);

      // Prefill player notes already logged for this practice, so editing the
      // log shows them instead of starting blank (which led to re-typing →
      // duplicate rows).
      const playerNotePrefill: Record<string, string> = {};
      for (const n of (playerNotesQ.data as
        | { player_id: string; note_text: string | null }[]
        | null) ?? []) {
        const text = (n.note_text ?? "").trim();
        if (!text) continue;
        playerNotePrefill[n.player_id] = playerNotePrefill[n.player_id]
          ? `${playerNotePrefill[n.player_id]}\n${text}`
          : text;
      }
      setPlayerNotes(playerNotePrefill);

      // Editing an already-logged practice: prefill every field from the saved
      // practice_logs row (the source of truth) rather than the live-run guesses.
      const logRow = logQ.data as {
        id: string;
        drills_completed: string[] | null;
        drills_skipped: string[] | null;
        team_performance_notes: string | null;
        highlights: string | null;
        areas_to_improve: string | null;
        attendance_count: number | null;
        energy_level: number | null;
      } | null;
      if (logRow) {
        setExistingLogId(logRow.id);
        const comp = logRow.drills_completed ?? [];
        const skip = logRow.drills_skipped ?? [];
        const fromLog: Record<string, boolean> = {};
        for (const d of drillRows) {
          if (skip.includes(d.drillId)) fromLog[d.drillId] = false;
          else if (comp.includes(d.drillId)) fromLog[d.drillId] = true;
          // A drill added to the plan after it was logged falls back to the
          // run-status guess.
          else fromLog[d.drillId] = initCompleted[d.drillId];
        }
        setCompleted(fromLog);
        setTeamPerformanceNotes(logRow.team_performance_notes ?? "");
        setHighlights(logRow.highlights ?? "");
        setAreasToImprove(logRow.areas_to_improve ?? "");
        setAttendance(
          logRow.attendance_count != null
            ? String(logRow.attendance_count)
            : ""
        );
        setEnergy(logRow.energy_level);
      } else {
        setCompleted(initCompleted);
        if (typeof attendeeQ.count === "number" && attendeeQ.count > 0) {
          setAttendance(String(attendeeQ.count));
        }
        if (generalLines.length > 0) {
          setTeamPerformanceNotes(generalLines.join("\n"));
        }
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const toggleDrill = useCallback((drillId: string) => {
    lightHaptic();
    setCompleted((prev) => ({ ...prev, [drillId]: !prev[drillId] }));
  }, []);

  const setDrillNote = useCallback((rowId: string, value: string) => {
    setDrillNotes((prev) => ({ ...prev, [rowId]: value }));
  }, []);

  const appendLiveToNote = useCallback((rowId: string, text: string) => {
    lightHaptic();
    setDrillNotes((prev) => {
      const current = prev[rowId] ?? "";
      return {
        ...prev,
        [rowId]: current.trim() ? `${current.trimEnd()}\n${text}` : text,
      };
    });
  }, []);

  const setEnergyValue = (r: number) => {
    lightHaptic();
    setEnergy((prev) => (prev === r ? null : r));
  };

  const togglePlayer = useCallback((playerId: string) => {
    lightHaptic();
    setExpandedPlayers((prev) => ({ ...prev, [playerId]: !prev[playerId] }));
  }, []);

  const setPlayerNote = useCallback((playerId: string, value: string) => {
    setPlayerNotes((prev) => ({ ...prev, [playerId]: value }));
  }, []);

  const handleSubmit = async () => {
    if (!plan || !user) return;
    setError(null);

    let attendanceCount: number | null = null;
    if (attendance.trim()) {
      const parsed = Number(attendance.trim());
      if (
        !Number.isFinite(parsed) ||
        parsed < 0 ||
        !Number.isInteger(parsed)
      ) {
        setError("Attendance must be a whole number.");
        return;
      }
      attendanceCount = parsed;
    }

    const drillsCompleted: string[] = [];
    const drillsSkipped: string[] = [];
    for (const d of plan.drills) {
      if (completed[d.drillId]) drillsCompleted.push(d.drillId);
      else drillsSkipped.push(d.drillId);
    }

    setSubmitting(true);

    // Per-drill notes → practice_plan_drills.log_note. Best-effort: needs
    // migration 36, degrades gracefully if not yet applied.
    await Promise.all(
      plan.drills.map((d) => {
        const text = (drillNotes[d.id] ?? "").trim();
        return supabase
          .from("practice_plan_drills")
          .update({ log_note: text || null })
          .eq("id", d.id)
          .then(({ error: e }) => {
            if (e) console.warn("[log] drill note save failed", e.message);
          });
      })
    );

    // Carry each drill note onto the next upcoming practice (best-effort).
    await supabase
      .rpc("propagate_drill_log_notes", { p_plan_id: plan.id })
      .then(({ error: e }) => {
        if (e) console.warn("[log] note carry-forward failed", e.message);
      });

    // Player notes → player_notes. The log screen owns the full set of a
    // practice's player notes, so replace wholesale (delete + re-insert) —
    // idempotent, so re-saving / editing the log can't duplicate them.
    // Best-effort: needs migration 37.
    const playerRows = roster
      .map((p) => ({ p, text: (playerNotes[p.id] ?? "").trim() }))
      .filter((x) => x.text.length > 0)
      .map((x) => ({
        player_id: x.p.id,
        team_id: plan.teamId,
        practice_plan_id: plan.id,
        note_text: x.text,
        created_by: user.id,
      }));
    {
      const { error: clearErr } = await supabase
        .from("player_notes")
        .delete()
        .eq("practice_plan_id", plan.id);
      if (clearErr) {
        console.warn("[log] player notes clear failed", clearErr.message);
      }
    }
    if (playerRows.length > 0) {
      const { error: pnErr } = await supabase
        .from("player_notes")
        .insert(playerRows);
      if (pnErr) console.warn("[log] player notes save failed", pnErr.message);
    }

    const logPayload = {
      drills_completed: drillsCompleted,
      drills_skipped: drillsSkipped,
      team_performance_notes: teamPerformanceNotes.trim() || null,
      highlights: highlights.trim() || null,
      areas_to_improve: areasToImprove.trim() || null,
      attendance_count: attendanceCount,
      energy_level: energy,
    };

    // Editing an existing log updates it in place; a first-time log inserts.
    const { error: logErr } = existingLogId
      ? await supabase
          .from("practice_logs")
          .update(logPayload)
          .eq("id", existingLogId)
      : await supabase.from("practice_logs").insert({
          practice_plan_id: plan.id,
          team_id: plan.teamId,
          logged_by: user.id,
          ...logPayload,
        });

    if (logErr) {
      setError(logErr.message);
      setSubmitting(false);
      return;
    }

    // A first-time log completes the plan; editing leaves the status alone.
    if (!existingLogId) {
      const { error: updateErr } = await supabase
        .from("practice_plans")
        .update({ status: "completed" })
        .eq("id", plan.id);

      if (updateErr) {
        setError(updateErr.message);
        setSubmitting(false);
        return;
      }
    }

    router.replace(`/practice/${plan.id}` as never);
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
      <GuardScreen
        message="Practice plan not found."
        buttonLabel="Back to Practice"
        onPress={() => router.back()}
      />
    );
  }

  if (plan.status === "draft") {
    return (
      <GuardScreen
        message="This plan hasn't been scheduled yet."
        buttonLabel="Back to Plan"
        onPress={() => router.replace(`/practice/${plan.id}` as never)}
      />
    );
  }

  const completedCount = plan.drills.filter(
    (d) => completed[d.drillId]
  ).length;
  const skippedCount = plan.drills.length - completedCount;
  const notedPlayers = roster.filter(
    (p) => (playerNotes[p.id] ?? "").trim().length > 0
  ).length;

  // Group consecutive parallel siblings so a parallel block reads as a unit.
  const drillBlocks: PlanDrill[][] = [];
  for (const d of plan.drills) {
    const prev = drillBlocks[drillBlocks.length - 1];
    if (
      prev &&
      d.parallelGroup != null &&
      prev[0].parallelGroup === d.parallelGroup
    ) {
      prev.push(d);
    } else {
      drillBlocks.push([d]);
    }
  }

  const renderDrill = (d: PlanDrill) => (
    <DrillRow
      key={d.id}
      drill={d}
      completed={!!completed[d.drillId]}
      note={drillNotes[d.id] ?? ""}
      liveNotes={liveNotesByDrill[d.drillId] ?? []}
      onToggle={() => toggleDrill(d.drillId)}
      onChangeNote={(t) => setDrillNote(d.id, t)}
      onAppendLive={(t) => appendLiveToNote(d.id, t)}
      onOpenHistory={() =>
        setHistoryTarget({ drillId: d.drillId, drillName: d.drillName })
      }
    />
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.sm,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityLabel="Back"
          style={{
            width: 38,
            height: 38,
            borderRadius: radius.md,
            backgroundColor: colors.surface.pressed,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={colors.text.primary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + 80,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={{ marginBottom: spacing["2xl"] }}>
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 24,
                letterSpacing: -0.4,
                color: colors.text.primary,
              },
            ]}
          >
            {existingLogId ? "Edit Practice Log" : "Log Practice"}
          </Text>
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 13,
                color: colors.text.secondary,
                marginTop: 2,
              },
            ]}
          >
            {formatLongDate(plan.practiceDate)}
          </Text>
        </View>

        {/* 01 — DRILLS */}
        <Card variant="filled" style={{ marginBottom: spacing.lg }}>
          <SectionHeader
            num="01"
            label="DRILLS"
            right={
              <Text
                style={[
                  monoStyle("medium"),
                  { fontSize: 11, color: colors.text.muted },
                ]}
              >
                {completedCount} done · {skippedCount} skipped
              </Text>
            }
          />

          {plan.drills.length === 0 ? (
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 13, color: colors.text.muted },
              ]}
            >
              No drills were planned.
            </Text>
          ) : (
            <View style={{ gap: spacing.lg }}>
              {(() => {
                // Group drillBlocks by their planBlockId so the log mirrors
                // the schedule. Legacy plans (no blocks) collapse into one
                // unlabeled section.
                type LogSection = {
                  block: LogBlock | null;
                  items: PlanDrill[][];
                };
                const sections: LogSection[] =
                  plan.blocks.length === 0
                    ? [{ block: null, items: drillBlocks }]
                    : plan.blocks.map((b) => ({ block: b, items: [] }));
                const sectionById = new Map<string, LogSection>();
                for (const s of sections) {
                  if (s.block) sectionById.set(s.block.id, s);
                }
                if (plan.blocks.length > 0) {
                  const fallback = sections[0];
                  for (const block of drillBlocks) {
                    const ownerId = block[0].planBlockId;
                    const target =
                      (ownerId && sectionById.get(ownerId)) || fallback;
                    target.items.push(block);
                  }
                }
                return sections.map((section) => (
                  <View
                    key={section.block?.id ?? "fallback"}
                    style={{ gap: spacing.md }}
                  >
                    {section.block ? (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
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
                          style={[
                            fontStyle("bold"),
                            {
                              fontSize: 10,
                              letterSpacing: 1.4,
                              textTransform: "uppercase",
                              color: blockFillColor(section.block.name),
                            },
                          ]}
                        >
                          {section.block.name}
                        </Text>
                      </View>
                    ) : null}
                    {section.items.map((block) => {
                if (block.length === 1) {
                  const d = block[0];
                  const isCompleted = !!completed[d.drillId];
                  return (
                    <View
                      key={d.id}
                      style={{
                        backgroundColor: colors.surface.base,
                        borderRadius: radius.lg,
                        borderWidth: 1,
                        borderColor: colors.border.subtle,
                        borderLeftWidth: 3,
                        borderLeftColor: isCompleted
                          ? colors.green[400]
                          : colors.orange[500],
                        padding: spacing.md,
                      }}
                    >
                      {renderDrill(d)}
                    </View>
                  );
                }
                // Parallel block — siblings ran in one slot; each is marked and
                // noted on its own.
                return (
                  <View
                    key={block[0].id}
                    style={{
                      backgroundColor: colors.surface.base,
                      borderRadius: radius.lg,
                      borderWidth: 1,
                      borderColor: colors.border.subtle,
                      borderLeftWidth: 3,
                      borderLeftColor: colors.team.violet,
                      padding: spacing.md,
                      gap: spacing.md,
                    }}
                  >
                    <Text
                      style={[
                        fontStyle("bold"),
                        {
                          fontSize: 10,
                          letterSpacing: 1.2,
                          textTransform: "uppercase",
                          color: colors.team.violet,
                        },
                      ]}
                    >
                      Parallel
                    </Text>
                    {block.map((d, i) => (
                      <View
                        key={d.id}
                        style={
                          i > 0
                            ? {
                                borderTopWidth: 1,
                                borderTopColor: colors.border.subtle,
                                paddingTop: spacing.md,
                              }
                            : undefined
                        }
                      >
                        {renderDrill(d)}
                      </View>
                    ))}
                  </View>
                );
                    })}
                  </View>
                ));
              })()}
            </View>
          )}
        </Card>

        {/* 02 — TEAM DEBRIEF */}
        <Card variant="filled" style={{ marginBottom: spacing.lg }}>
          <SectionHeader num="02" label="TEAM DEBRIEF" />
          <View style={{ gap: spacing.lg }}>
            {(
              [
                {
                  label: "How did the team perform?",
                  value: teamPerformanceNotes,
                  onChange: setTeamPerformanceNotes,
                  placeholder: "General observations about today's practice…",
                },
                {
                  label: "What went well?",
                  value: highlights,
                  onChange: setHighlights,
                  placeholder: "Best moments, breakthroughs, good reps…",
                },
                {
                  label: "What needs work?",
                  value: areasToImprove,
                  onChange: setAreasToImprove,
                  placeholder: "Things to focus on next practice…",
                },
              ] as const
            ).map((field) => (
              <View key={field.label}>
                <Text
                  style={[
                    fontStyle("semibold"),
                    {
                      fontSize: 12,
                      color: colors.text.secondary,
                      marginBottom: spacing.sm,
                    },
                  ]}
                >
                  {field.label}
                </Text>
                <TextArea
                  value={field.value}
                  onChangeText={field.onChange}
                  placeholder={field.placeholder}
                  style={{
                    minHeight: 84,
                    backgroundColor: colors.surface.raised,
                    borderColor: colors.border.subtle,
                    borderRadius: radius.md,
                  }}
                />
              </View>
            ))}
          </View>
        </Card>

        {/* 03 — PLAYER NOTES */}
        <Card variant="filled" style={{ marginBottom: spacing.lg }}>
          <SectionHeader
            num="03"
            label="PLAYER NOTES"
            right={
              notedPlayers > 0 ? (
                <Text
                  style={[
                    monoStyle("medium"),
                    { fontSize: 11, color: colors.lime[400] },
                  ]}
                >
                  {notedPlayers} noted
                </Text>
              ) : undefined
            }
          />
          {roster.length === 0 ? (
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 13, color: colors.text.muted },
              ]}
            >
              No active players on the roster.
            </Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              <Text
                style={[
                  fontStyle("regular"),
                  {
                    fontSize: 12,
                    lineHeight: 17,
                    color: colors.text.muted,
                    marginBottom: 2,
                  },
                ]}
              >
                Jot an observation — it's saved to the player's profile.
              </Text>
              {roster.map((p) => {
                const note = playerNotes[p.id] ?? "";
                const expanded = !!expandedPlayers[p.id];
                const accent = playerColorForIndex(p.colorIndex);
                const hasNote = note.trim().length > 0;
                return (
                  <View
                    key={p.id}
                    style={{
                      backgroundColor: colors.surface.base,
                      borderRadius: radius.lg,
                      borderWidth: 1,
                      borderColor: hasNote
                        ? "rgba(194, 255, 61, 0.25)"
                        : colors.border.subtle,
                      padding: spacing.md,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => togglePlayer(p.id)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.md,
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: accent,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={[
                            monoStyle("bold"),
                            { fontSize: 11, color: colors.text.onBrand },
                          ]}
                        >
                          {p.initials}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            fontStyle("semibold"),
                            { fontSize: 14, color: colors.text.primary },
                          ]}
                        >
                          {p.firstName}
                        </Text>
                        {hasNote && !expanded ? (
                          <Text
                            numberOfLines={1}
                            style={[
                              fontStyle("regular"),
                              {
                                fontSize: 12,
                                color: colors.text.secondary,
                                marginTop: 1,
                              },
                            ]}
                          >
                            {note.trim()}
                          </Text>
                        ) : !hasNote ? (
                          <Text
                            style={[
                              fontStyle("regular"),
                              {
                                fontSize: 12,
                                color: colors.text.muted,
                                marginTop: 1,
                              },
                            ]}
                          >
                            + Add a note
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={colors.text.muted}
                      />
                    </TouchableOpacity>
                    {expanded ? (
                      <TextArea
                        value={note}
                        onChangeText={(t) => setPlayerNote(p.id, t)}
                        placeholder="What did you notice about this player?"
                        autoFocus
                        style={{
                          minHeight: 64,
                          marginTop: spacing.sm,
                          backgroundColor: colors.surface.raised,
                          borderColor: colors.border.subtle,
                          borderRadius: radius.md,
                        }}
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* 04 — WRAP-UP */}
        <Card variant="filled" style={{ marginBottom: spacing.lg }}>
          <SectionHeader num="04" label="WRAP-UP" />

          <Text
            style={[
              fontStyle("semibold"),
              {
                fontSize: 12,
                color: colors.text.secondary,
                marginBottom: spacing.sm,
              },
            ]}
          >
            Players present
          </Text>
          <TextInput
            value={attendance}
            onChangeText={setAttendance}
            placeholder="e.g., 12"
            placeholderTextColor={colors.text.muted}
            keyboardType="number-pad"
            returnKeyType="done"
            style={[
              fontStyle("regular"),
              {
                backgroundColor: colors.surface.raised,
                borderWidth: 1,
                borderColor: colors.border.subtle,
                borderRadius: radius.md,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.md,
                fontSize: 15,
                color: colors.text.primary,
                fontVariant: ["tabular-nums"],
              },
            ]}
          />

          <Text
            style={[
              fontStyle("semibold"),
              {
                fontSize: 12,
                color: colors.text.secondary,
                marginTop: spacing.lg,
                marginBottom: spacing.sm,
              },
            ]}
          >
            Team energy level
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {[1, 2, 3, 4, 5].map((r) => {
              const selected = energy === r;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setEnergyValue(r)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Energy ${r}`}
                  accessibilityState={{ selected }}
                  style={{
                    flex: 1,
                    height: 46,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    backgroundColor: selected
                      ? colors.orange[500]
                      : colors.surface.raised,
                    borderColor: selected
                      ? colors.orange[500]
                      : colors.border.subtle,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={[
                      monoStyle("bold"),
                      {
                        fontSize: 16,
                        color: selected ? "#FFFFFF" : colors.text.secondary,
                      },
                    ]}
                  >
                    {r}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 13,
                textAlign: "center",
                marginTop: spacing.md,
                color: energy ? colors.text.primary : colors.text.muted,
              },
            ]}
          >
            {energy ? ENERGY_ANCHORS[energy] : "Tap a level"}
          </Text>
        </Card>

        {error ? (
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 13,
                lineHeight: 18,
                color: colors.errorLight,
                marginBottom: spacing.md,
              },
            ]}
          >
            {error}
          </Text>
        ) : null}

        <Button
          label={
            submitting
              ? "Saving…"
              : existingLogId
              ? "Save Changes"
              : "Complete Practice Log"
          }
          onPress={handleSubmit}
          disabled={submitting}
        />
      </ScrollView>

      <DrillNoteHistorySheet
        visible={historyTarget != null}
        drillId={historyTarget?.drillId ?? null}
        drillName={historyTarget?.drillName ?? ""}
        teamId={plan.teamId}
        onClose={() => setHistoryTarget(null)}
      />
    </KeyboardAvoidingView>
  );
}
