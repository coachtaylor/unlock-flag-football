import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { PastDueModal } from "../../../../components/ui/PastDueModal";
import { colors, radius, spacing } from "../../../../constants/design";
import { fontStyle, monoStyle } from "../../../../constants/typography";
import {
  colorForCategory,
  normalizeCategory,
  tintForCategory,
} from "../../../../constants/categories";
import { blockFillColor } from "../../../../constants/block-colors";
import { supabase } from "../../../../lib/supabase";
import { useAuth } from "../../../../lib/auth-context";

type RunStatus = "planned" | "active" | "done" | "skipped";

type NoteTag = "great_rep" | "coaching_point" | "sub_needed" | "injury_check";

const NOTE_TAGS: { key: NoteTag; label: string }[] = [
  { key: "great_rep", label: "Great rep" },
  { key: "coaching_point", label: "Coaching point" },
  { key: "sub_needed", label: "Sub needed" },
  { key: "injury_check", label: "Injury check" },
];
const TAG_LABEL: Record<NoteTag, string> = {
  great_rep: "Great rep",
  coaching_point: "Coaching point",
  sub_needed: "Sub needed",
  injury_check: "Injury check",
};

type RunDrill = {
  id: string;
  drillId: string | null;
  drillOrder: number;
  durationMinutes: number | null;
  drillName: string;
  categoryName: string | null;
  // Per-drill coaching cues entered in the practice planner ("Cues for today",
  // stored in practice_plan_drills.notes) — surfaced live so captains see them.
  cues: string | null;
  isWaterBreak: boolean;
  parallelGroup: number | null;
  // Which practice block this drill belongs to. Null on pre-migration-42
  // plans; rendering falls back to no block label in that case.
  planBlockId: string | null;
  // True when the underlying team_drills row is configured as a benchmark
  // (any non-empty benchmark_scope / benchmark_types). Drives the BENCHMARK
  // chip + Start assessment affordance on the live drill card.
  isBenchmark: boolean;
  runStatus: RunStatus;
  runStartedAt: string | null;
  // Independent drill stopwatch: accumulated elapsed + running-since anchor
  // (null while paused/not-started).
  runElapsedMs: number;
  runTimerStartedAt: string | null;
};

type RunBlock = {
  id: string;
  name: string;
  blockOrder: number;
};

type RunNote = {
  id: string;
  noteText: string;
  tag: NoteTag | null;
  drillLabel: string | null;
  createdAt: string;
};

type RunPlan = {
  id: string;
  teamId: string;
  title: string | null;
  startTime: string | null;
  // null until the coach taps Start practice timer on the run screen. The
  // practice can be "live" (status === 'live') with a null startedAt — that
  // means coaches have entered the runner but haven't begun timing yet.
  startedAt: string | null;
  status: string;
};

function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function normalizeStatus(raw: string): string {
  return raw === "finalized" ? "scheduled" : raw;
}

function formatStartTime(t: string | null): string | null {
  if (!t) return null;
  const m = t.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m[2] === "00" ? `${h12} ${period}` : `${h12}:${m[2]} ${period}`;
}

// Elapsed milliseconds → "mm:ss" or "h:mm:ss" once an hour is reached.
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// A captured-at timestamp → 12-hour "h:mm" for the notes list.
function formatClock(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Group consecutive rows sharing a parallel_group into one schedule block —
// a parallel block runs in one slot and its duration counts once.
function groupBlocks(drills: RunDrill[]): RunDrill[][] {
  const blocks: RunDrill[][] = [];
  for (const d of drills) {
    const prev = blocks[blocks.length - 1];
    if (
      prev &&
      !d.isWaterBreak &&
      !prev[0].isWaterBreak &&
      d.parallelGroup != null &&
      prev[0].parallelGroup === d.parallelGroup
    ) {
      prev.push(d);
    } else {
      blocks.push([d]);
    }
  }
  return blocks;
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

function PhasePill({ name }: { name: string }) {
  const known = normalizeCategory(name);
  const accent = colorForCategory(name);
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: known ? tintForCategory(name) : colors.surface.muted,
        borderWidth: known ? 1 : 0,
        borderColor: known ? accent : "transparent",
      }}
    >
      <Text
        style={{
          fontSize: 10,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: known ? accent : colors.text.subtle,
        }}
      >
        {name}
      </Text>
    </View>
  );
}

// The currently-running drill, promoted out of the schedule timeline into its
// own card: drill identity, coaching cues, a stopwatch with its transport
// control, and a glance at what's next. `block` is null once every drill is
// done/skipped.
function NowRunningCard({
  block,
  blockName,
  elapsedMs,
  nextUp,
  onToggleTimer,
  onComplete,
  onSkip,
  onStartAssessment,
  gated = false,
}: {
  block: RunDrill[] | null;
  // Practice block this drill lives under (e.g. "Skill Block"). Shown as a
  // small eyebrow above the drill name so coaches know which part of
  // practice they're in. Null on legacy plans without block grouping.
  blockName?: string | null;
  elapsedMs: number;
  nextUp: { name: string; durMin: number } | null;
  onToggleTimer: (block: RunDrill[]) => void;
  onComplete: (block: RunDrill[]) => void;
  onSkip: (block: RunDrill[]) => void;
  // Triggered when the coach taps the "Start assessment" link on a benchmark
  // drill. Routes to the upcoming benchmark-capture flow; today it stubs
  // with an Alert until that screen ships.
  onStartAssessment?: (block: RunDrill[]) => void;
  // True while the overall practice timer hasn't been started yet. Strips the
  // drill timer + Mark complete + Skip controls and shows a "LOCKED" helper
  // so coaches only have one primary action on screen (Start practice timer).
  gated?: boolean;
}) {
  // Water breaks carry a blue accent (matching the schedule); drills are lime.
  const isWaterBreak = block != null && block[0].isWaterBreak;
  const accent = isWaterBreak ? colors.blue[400] : colors.lime[400];
  const cardStyle = {
    backgroundColor: colors.surface.raised,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border.card,
    borderTopWidth: 2,
    borderTopColor: accent,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  } as const;

  if (!block) {
    return (
      <View style={cardStyle}>
        <View
          style={{ alignItems: "center", paddingVertical: spacing["2xl"] }}
        >
          <Ionicons
            name="checkmark-done-circle"
            size={40}
            color={colors.lime[400]}
          />
          <Text
            style={[
              fontStyle("semibold"),
              {
                fontSize: 15,
                color: colors.text.primary,
                marginTop: spacing.md,
              },
            ]}
          >
            All drills wrapped
          </Text>
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 12.5,
                lineHeight: 18,
                color: colors.text.muted,
                marginTop: 4,
                textAlign: "center",
              },
            ]}
          >
            Tap End practice &amp; log to save how it went.
          </Text>
        </View>
      </View>
    );
  }

  const head = block[0];
  const durMin = head.durationMinutes ?? 0;
  const running = head.runTimerStartedAt != null;
  const state = running
    ? "running"
    : head.runElapsedMs > 0
      ? "paused"
      : "ready";
  // READY shows as a bare lime dot + white label; RUNNING/PAUSED get a tinted
  // pill (lime / amber).
  const isReady = state === "ready";
  const isLimeState = state === "running" || state === "ready";
  const stateColor = isLimeState ? colors.lime[400] : colors.amber[400];
  const stateBg = isLimeState
    ? colors.lime.tint
    : "rgba(251, 191, 36, 0.12)";
  const stateBorder = isLimeState
    ? "rgba(194, 255, 61, 0.3)"
    : "rgba(251, 191, 36, 0.3)";
  const stateLabel =
    state === "running" ? "RUNNING" : state === "paused" ? "PAUSED" : "READY";
  const progress =
    durMin > 0 ? Math.min(1, Math.max(0, elapsedMs / (durMin * 60000))) : 0;
  const hasCues = block.some((d) => d.cues);
  // Timer runs orange inside the final 2 minutes of the planned block, red
  // once it goes over.
  const plannedMs = durMin * 60000;
  const overDuration = durMin > 0 && elapsedMs >= plannedMs;
  const timerColor =
    state === "paused"
      ? colors.amber[400]
      : overDuration
        ? colors.red.semantic
        : durMin > 0 && elapsedMs >= plannedMs - 120000
          ? colors.orange[400]
          : colors.text.primary;

  return (
    <View style={cardStyle}>
      {/* Drill name + live status pill */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: spacing.sm,
        }}
      >
        <View style={{ flex: 1 }}>
          {blockName ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                marginBottom: 4,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 2,
                  backgroundColor: blockFillColor(blockName),
                }}
              />
              <Text
                style={[
                  monoStyle("bold"),
                  {
                    fontSize: 10,
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    color: blockFillColor(blockName),
                  },
                ]}
              >
                {blockName}
              </Text>
            </View>
          ) : null}
          {isWaterBreak ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
            >
              <Ionicons name="water" size={18} color={accent} />
              <Text
                style={[
                  fontStyle("bold"),
                  {
                    fontSize: 20,
                    letterSpacing: -0.3,
                    color: colors.text.primary,
                  },
                ]}
              >
                {head.drillName}
              </Text>
            </View>
          ) : (
            block.map((d) => (
              <Text
                key={d.id}
                style={[
                  fontStyle("bold"),
                  {
                    fontSize: 20,
                    letterSpacing: -0.3,
                    color: colors.text.primary,
                  },
                ]}
              >
                {d.drillName}
              </Text>
            ))
          )}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            marginTop: 3,
            ...(isReady || gated
              ? {}
              : {
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: radius.pill,
                  backgroundColor: stateBg,
                  borderWidth: 1,
                  borderColor: stateBorder,
                }),
          }}
        >
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 2.5,
              backgroundColor: gated ? colors.text.muted : stateColor,
            }}
          />
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 12,
                letterSpacing: 1,
                color: gated
                  ? colors.text.muted
                  : isReady
                    ? colors.text.primary
                    : stateColor,
              },
            ]}
          >
            {gated ? "LOCKED" : stateLabel}
          </Text>
        </View>
      </View>

      {/* Phase + benchmark marker + planned duration */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 8,
        }}
      >
        {head.categoryName ? <PhasePill name={head.categoryName} /> : null}
        {head.isBenchmark ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            }}
          >
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: colors.red.semantic,
              }}
            />
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 11,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: colors.red.semantic,
                },
              ]}
            >
              Benchmark
            </Text>
          </View>
        ) : null}
        <Text
          style={[
            monoStyle("medium"),
            { fontSize: 12, color: colors.text.muted },
          ]}
        >
          {durMin} min planned
        </Text>
      </View>

      {/* Start assessment — only on benchmark drills, post-start. Dotted
          red outline reads as a tappable benchmark-specific affordance
          without competing as a solid button. */}
      {head.isBenchmark && !gated ? (
        <TouchableOpacity
          onPress={() => onStartAssessment?.(block)}
          activeOpacity={0.7}
          hitSlop={6}
          accessibilityRole="link"
          accessibilityLabel="Start benchmark assessment"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: spacing.md,
            alignSelf: "flex-start",
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderStyle: "dotted",
            borderColor: colors.red.semantic,
          }}
        >
          <Ionicons
            name="flag-outline"
            size={15}
            color={colors.red.semantic}
          />
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 15,
                letterSpacing: 0.2,
                color: colors.red.semantic,
              },
            ]}
          >
            Start assessment
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Coaching cues from the practice plan */}
      {hasCues ? (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {block.map((d) =>
            d.cues ? (
              <View
                key={d.id}
                style={{
                  backgroundColor: colors.surface.overlay,
                  borderRadius: radius.md,
                  padding: spacing.md,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    marginBottom: 5,
                  }}
                >
                  <Ionicons
                    name="clipboard-outline"
                    size={11}
                    color={colors.lime[400]}
                  />
                  <Text
                    style={[
                      fontStyle("bold"),
                      {
                        fontSize: 9.5,
                        letterSpacing: 1,
                        color: colors.text.secondary,
                      },
                    ]}
                  >
                    {block.length > 1
                      ? `CUES · ${d.drillName.toUpperCase()}`
                      : "CUES FOR TODAY"}
                  </Text>
                </View>
                <Text
                  style={[
                    fontStyle("regular"),
                    {
                      fontSize: 13,
                      lineHeight: 19,
                      color: colors.text.label,
                    },
                  ]}
                >
                  {d.cues}
                </Text>
              </View>
            ) : null
          )}
        </View>
      ) : null}

      {/* Gated state — single helper line, no timer or buttons */}
      {gated ? (
        <View
          style={{
            marginTop: spacing.lg,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border.subtle,
            backgroundColor: colors.surface.overlay,
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <Ionicons
            name="lock-closed-outline"
            size={14}
            color={colors.text.muted}
          />
          <Text
            style={[
              fontStyle("regular"),
              {
                flex: 1,
                fontSize: 12.5,
                lineHeight: 18,
                color: colors.text.muted,
              },
            ]}
          >
            Start practice to begin timing this drill.
          </Text>
        </View>
      ) : null}

      {/* Stopwatch readout + transport control on one width-spanning row */}
      {!gated ? (
      <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: spacing.lg,
        }}
      >
        <View>
          <Text
            style={[
              monoStyle("bold"),
              {
                fontSize: 40,
                letterSpacing: -1,
                color: timerColor,
              },
            ]}
          >
            {formatElapsed(elapsedMs)}
          </Text>
          <Text
            style={[
              monoStyle("medium"),
              { fontSize: 12, color: colors.text.muted, marginTop: 2 },
            ]}
          >
            of {durMin}:00
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => onToggleTimer(block)}
          activeOpacity={0.85}
          accessibilityLabel={
            running
              ? "Pause drill timer"
              : state === "paused"
                ? "Resume drill timer"
                : "Start drill timer"
          }
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: running
              ? colors.surface.overlay
              : state === "paused"
                ? colors.amber[400]
                : accent,
            borderWidth: 1,
            borderColor: running
              ? colors.border.strong
              : state === "paused"
                ? colors.amber[400]
                : accent,
          }}
        >
          <Ionicons
            name={running ? "pause" : "play"}
            size={24}
            color={running ? colors.text.primary : colors.text.onBrand}
            style={running ? undefined : { marginLeft: 3 }}
          />
        </TouchableOpacity>
      </View>

      {/* Progress */}
      <View
        style={{
          height: 5,
          borderRadius: radius.full,
          backgroundColor: "rgba(255, 255, 255, 0.06)",
          overflow: "hidden",
          marginTop: spacing.md,
        }}
      >
        <View
          style={{
            height: "100%",
            width: `${progress * 100}%`,
            borderRadius: radius.full,
            backgroundColor: accent,
          }}
        />
      </View>

      {/* Mark complete + Skip on one row */}
      <View
        style={{
          flexDirection: "row",
          gap: spacing.sm,
          marginTop: spacing.lg,
        }}
      >
        <TouchableOpacity
          onPress={() => onComplete(block)}
          activeOpacity={0.7}
          hitSlop={6}
          accessibilityRole="link"
          accessibilityLabel="Mark drill complete"
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            height: 48,
          }}
        >
          <Ionicons name="checkmark" size={16} color={colors.lime[400]} />
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 14,
                letterSpacing: 0.2,
                color: colors.lime[400],
              },
            ]}
          >
            Mark complete
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onSkip(block)}
          activeOpacity={0.7}
          style={{
            alignItems: "center",
            justifyContent: "center",
            height: 48,
            paddingHorizontal: spacing.lg,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border.strong,
          }}
        >
          <Text
            style={[
              fontStyle("semibold"),
              { fontSize: 13, color: colors.text.secondary },
            ]}
          >
            Skip
          </Text>
        </TouchableOpacity>
      </View>
      </>
      ) : null}

      {/* Up next */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          borderTopWidth: 1,
          borderTopColor: colors.border.subtle,
          paddingTop: spacing.md,
        }}
      >
        <Ionicons name="arrow-forward" size={12} color={colors.text.muted} />
        {nextUp ? (
          <Text
            numberOfLines={1}
            style={[
              fontStyle("regular"),
              { flex: 1, fontSize: 12, color: colors.text.secondary },
            ]}
          >
            <Text style={[fontStyle("bold"), { color: colors.text.muted }]}>
              UP NEXT{"  "}
            </Text>
            {nextUp.name}
            <Text style={{ color: colors.text.muted }}>
              {"  ·  "}
              {nextUp.durMin}m
            </Text>
          </Text>
        ) : (
          <Text
            style={[
              fontStyle("regular"),
              { fontSize: 12, color: colors.text.muted },
            ]}
          >
            Last drill of practice
          </Text>
        )}
      </View>
    </View>
  );
}

export default function RunPracticeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id, pastdue } = useLocalSearchParams<{
    id: string;
    pastdue?: string;
  }>();
  // Shown when arriving from a "Needs Attention" card (?pastdue=1): the
  // practice is stale but still live, so the coach can resume where they
  // left off or close it out by logging.
  const [pastDueOpen, setPastDueOpen] = useState(pastdue === "1");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [plan, setPlan] = useState<RunPlan | null>(null);
  const [drills, setDrills] = useState<RunDrill[]>([]);
  const [planBlocks, setPlanBlocks] = useState<RunBlock[]>([]);
  // Latest drills, readable from the focus-effect cleanup (which closes over
  // stale state otherwise) to auto-pause the running drill timer on blur.
  const drillsRef = useRef<RunDrill[]>([]);
  drillsRef.current = drills;
  const [notes, setNotes] = useState<RunNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [nowTs, setNowTs] = useState(() => Date.now());
  // Pause mirrors practice_plans.paused_total_seconds / paused_at — paused
  // time is accumulated and subtracted from every timer. Persisted on toggle.
  const [pausedAccumMs, setPausedAccumMs] = useState(0);
  const [pauseStartedAt, setPauseStartedAt] = useState<number | null>(null);

  // 1-second tick drives both the overall and the active-drill timers.
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setLoading(false);
      return;
    }

    (async () => {
      const PLAN_SELECT_FULL =
        "id, team_id, title, status, start_time, started_at, created_at, " +
        "paused_at, paused_total_seconds, " +
        "practice_plan_drills(id, drill_id, drill_order, duration_minutes, " +
        "notes, is_water_break, parallel_group, plan_block_id, run_status, run_started_at, " +
        "run_elapsed_seconds, run_timer_started_at, " +
        "team_drills(id, drill_name, benchmark_scope, benchmark_types, team_drill_categories(drill_categories(category_name)))), " +
        "practice_plan_blocks(id, name, block_order)";
      const PLAN_SELECT_NO_BLOCKS =
        "id, team_id, title, status, start_time, started_at, created_at, " +
        "paused_at, paused_total_seconds, " +
        "practice_plan_drills(id, drill_id, drill_order, duration_minutes, " +
        "notes, is_water_break, parallel_group, run_status, run_started_at, " +
        "run_elapsed_seconds, run_timer_started_at, " +
        "team_drills(id, drill_name, benchmark_scope, benchmark_types, team_drill_categories(drill_categories(category_name))))";
      const PLAN_SELECT_LEGACY =
        "id, team_id, title, status, start_time, started_at, created_at, " +
        "paused_at, paused_total_seconds, " +
        "practice_plan_drills(id, drill_id, drill_order, duration_minutes, " +
        "notes, is_water_break, parallel_group, run_status, run_started_at, " +
        "run_elapsed_seconds, run_timer_started_at, " +
        "team_drills(id, drill_name, team_drill_categories(drill_categories(category_name))))";

      let planQuery = await supabase
        .from("practice_plans")
        .select(PLAN_SELECT_FULL)
        .eq("id", id)
        .maybeSingle();
      // Migration-42 drift fallback: plan_block_id / practice_plan_blocks
      // may not exist on this environment yet.
      if (
        planQuery.error &&
        /plan_block_id|practice_plan_blocks/i.test(planQuery.error.message)
      ) {
        planQuery = await supabase
          .from("practice_plans")
          .select(PLAN_SELECT_NO_BLOCKS)
          .eq("id", id)
          .maybeSingle();
      }
      // Migration-38 drift fallback: benchmark_scope / benchmark_types may not
      // exist on this environment yet. Retry without them.
      if (
        planQuery.error &&
        /benchmark_(scope|types)/i.test(planQuery.error.message)
      ) {
        planQuery = await supabase
          .from("practice_plans")
          .select(PLAN_SELECT_LEGACY)
          .eq("id", id)
          .maybeSingle();
      }

      if (cancelled) return;

      if (planQuery.error) {
        setLoadError(
          `${planQuery.error.message}\n\nMake sure migrations 32–35 have been run in Supabase.`
        );
        setLoading(false);
        return;
      }
      // The nested join defeats PostgREST's type inference — cast to a loose
      // shape and narrow each field explicitly below.
      const planData = planQuery.data as Record<string, unknown> | null;
      if (!planData) {
        setPlan(null);
        setLoading(false);
        return;
      }

      type CategoryRel = {
        drill_categories:
          | { category_name: string }
          | { category_name: string }[]
          | null;
      };
      type DrillRow = {
        id: string;
        drill_id: string | null;
        drill_order: number;
        duration_minutes: number | null;
        notes: string | null;
        is_water_break: boolean | null;
        parallel_group: number | null;
        plan_block_id?: string | null;
        run_status: string | null;
        run_started_at: string | null;
        run_elapsed_seconds: number | null;
        run_timer_started_at: string | null;
        team_drills:
          | {
              drill_name: string;
              benchmark_scope?: string | null;
              benchmark_types?: string[] | null;
              team_drill_categories: CategoryRel[] | null;
            }
          | {
              drill_name: string;
              benchmark_scope?: string | null;
              benchmark_types?: string[] | null;
              team_drill_categories: CategoryRel[] | null;
            }[]
          | null;
      };

      const runDrills: RunDrill[] = (
        (planData.practice_plan_drills as DrillRow[] | null) ?? []
      )
        .slice()
        .sort((a, b) => a.drill_order - b.drill_order)
        .map((d): RunDrill => {
          const drill = Array.isArray(d.team_drills)
            ? d.team_drills[0]
            : d.team_drills;
          let categoryName: string | null = null;
          for (const rel of drill?.team_drill_categories ?? []) {
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
          const rs = (d.run_status as RunStatus) ?? "planned";
          const isBenchmark =
            !isWaterBreak &&
            (!!drill?.benchmark_scope ||
              (drill?.benchmark_types?.length ?? 0) > 0);
          return {
            id: d.id,
            drillId: d.drill_id,
            drillOrder: d.drill_order,
            durationMinutes: d.duration_minutes,
            drillName: isWaterBreak
              ? "Water Break"
              : drill?.drill_name ?? "Unknown drill",
            categoryName: isWaterBreak ? null : categoryName,
            cues: isWaterBreak ? null : d.notes?.trim() || null,
            isWaterBreak,
            parallelGroup: d.parallel_group ?? null,
            planBlockId: (d.plan_block_id ?? null) as string | null,
            isBenchmark,
            runStatus: rs,
            runStartedAt: d.run_started_at,
            runElapsedMs: (d.run_elapsed_seconds ?? 0) * 1000,
            runTimerStartedAt: d.run_timer_started_at,
          };
        });

      // First open of a freshly started practice: nothing has run yet, so
      // auto-activate the first block to give it a live timer.
      const anyStarted = runDrills.some((d) => d.runStatus !== "planned");
      if (!anyStarted && runDrills.length > 0) {
        const startedAt = new Date().toISOString();
        const firstGroup = runDrills[0].parallelGroup;
        const firstIds: string[] = [];
        for (const d of runDrills) {
          const sameBlock =
            d.id === runDrills[0].id ||
            (!d.isWaterBreak &&
              !runDrills[0].isWaterBreak &&
              firstGroup != null &&
              d.parallelGroup === firstGroup);
          if (sameBlock) {
            d.runStatus = "active";
            d.runStartedAt = startedAt;
            d.runElapsedMs = 0;
            d.runTimerStartedAt = null;
            firstIds.push(d.id);
          }
        }
        if (firstIds.length) {
          // Activate the first block but leave its timer stopped — the
          // captain presses Start.
          await supabase
            .from("practice_plan_drills")
            .update({
              run_status: "active",
              run_started_at: startedAt,
              run_elapsed_seconds: 0,
              run_timer_started_at: null,
            })
            .in("id", firstIds);
        }
      }

      const teamId = planData.team_id as string;

      // Check-in (roster + practice_plan_attendees) is loaded on the plan
      // detail page now — this screen only needs notes for the run.
      const [notesRes] = await Promise.all([
        supabase
          .from("practice_notes")
          .select("id, note_text, tag, drill_label, created_at")
          .eq("practice_plan_id", id)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      const runNotes: RunNote[] = (notesRes.data ?? []).map((n) => ({
        id: n.id as string,
        noteText: n.note_text as string,
        tag: (n.tag as NoteTag | null) ?? null,
        drillLabel: (n.drill_label as string | null) ?? null,
        createdAt: n.created_at as string,
      }));

      setPlan({
        id: planData.id as string,
        teamId,
        title: (planData.title as string | null) ?? null,
        startTime: (planData.start_time as string | null) ?? null,
        // null until the coach taps Start timer on this screen. Don't fall
        // back to created_at — that would make the timer count from plan
        // creation, defeating the explicit-start behaviour.
        startedAt: (planData.started_at as string | null) ?? null,
        status: normalizeStatus(planData.status as string),
      });
      setDrills(runDrills);
      const blockRows = (planData.practice_plan_blocks as
        | {
            id: string;
            name: string;
            block_order: number;
          }[]
        | null
        | undefined) ?? [];
      setPlanBlocks(
        blockRows
          .slice()
          .sort((a, b) => a.block_order - b.block_order)
          .map((b) => ({
            id: b.id,
            name: b.name,
            blockOrder: b.block_order,
          }))
      );
      setNotes(runNotes);
      // Restore persisted pause state.
      setPausedAccumMs(
        ((planData.paused_total_seconds as number | null) ?? 0) * 1000
      );
      const pausedAtIso = planData.paused_at as string | null;
      setPauseStartedAt(pausedAtIso ? new Date(pausedAtIso).getTime() : null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const blocks = useMemo(() => groupBlocks(drills), [drills]);
  const activeBlock = useMemo(
    () => blocks.find((b) => b[0].runStatus === "active") ?? null,
    [blocks]
  );
  // First still-planned block after the active one — drives the "up next" line.
  const nextPlannedBlock = useMemo(() => {
    const activeIdx = blocks.findIndex((b) => b[0].runStatus === "active");
    for (let i = activeIdx + 1; i < blocks.length; i++) {
      if (blocks[i][0].runStatus === "planned") return blocks[i];
    }
    return null;
  }, [blocks]);
  const doneCount = blocks.filter((b) => b[0].runStatus === "done").length;
  const totalPlannedMin = blocks.reduce(
    (s, b) => s + (b[0].durationMinutes ?? 0),
    0
  );

  // --- Start practice timer (overall practice clock) ----------------------

  // Called when the coach taps "Start Timer" on the run screen. Up until
  // now the practice has been "live" but the clock hasn't started —
  // started_at is null. Once started, elapsed time runs off this timestamp.
  // We also kick off the first drill's own stopwatch in the same action so
  // the coach doesn't have to press a second button to begin timing the
  // active drill. LayoutAnimation smooths the hero/drill-card transformation.
  const startPracticeTimer = async () => {
    if (!plan) return;
    lightHaptic();
    const iso = new Date().toISOString();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPlan({ ...plan, startedAt: iso });
    await supabase
      .from("practice_plans")
      .update({ started_at: iso })
      .eq("id", plan.id);

    // Auto-start the active drill's stopwatch — same payload toggleDrillTimer
    // would write on first tap.
    if (activeBlock && activeBlock[0].runTimerStartedAt == null) {
      const ids = activeBlock.map((d) => d.id);
      const idSet = new Set(ids);
      setDrills((prev) =>
        prev.map((d) =>
          idSet.has(d.id) ? { ...d, runTimerStartedAt: iso } : d
        )
      );
      await updateRows(ids, { run_timer_started_at: iso });
    }
  };

  // --- Pause (overall practice clock) --------------------------------------

  const togglePause = async () => {
    if (!plan) return;
    lightHaptic();
    if (pauseStartedAt != null) {
      const newAccumMs = pausedAccumMs + (Date.now() - pauseStartedAt);
      setPausedAccumMs(newAccumMs);
      setPauseStartedAt(null);
      await supabase
        .from("practice_plans")
        .update({
          paused_at: null,
          paused_total_seconds: Math.round(newAccumMs / 1000),
        })
        .eq("id", plan.id);
    } else {
      const at = Date.now();
      setPauseStartedAt(at);
      await supabase
        .from("practice_plans")
        .update({ paused_at: new Date(at).toISOString() })
        .eq("id", plan.id);
    }
  };

  // --- Schedule actions -----------------------------------------------------

  const updateRows = async (
    ids: string[],
    patch: Record<string, unknown>
  ) => {
    if (!ids.length) return;
    const { error } = await supabase
      .from("practice_plan_drills")
      .update(patch)
      .in("id", ids);
    if (error) console.warn("[run] drill update failed", error.message);
  };

  // Drill stopwatch frozen at `now`: if running, fold the running span into
  // elapsed; otherwise leave elapsed as-is.
  const frozenElapsedMs = (d: RunDrill, now: number) =>
    d.runTimerStartedAt != null
      ? d.runElapsedMs + (now - new Date(d.runTimerStartedAt).getTime())
      : d.runElapsedMs;

  // Jump into the benchmark capture flow for the active drill. Preselects the
  // drill in the picker so the coach just chooses sets + players and starts.
  const startAssessment = (block: RunDrill[]) => {
    lightHaptic();
    const drillId = block[0]?.drillId;
    if (!drillId) {
      Alert.alert(
        "Missing drill",
        "This block has no underlying drill to benchmark."
      );
      return;
    }
    router.push(`/benchmarks?drill=${drillId}` as never);
  };

  // Start / pause the active drill's own stopwatch (whole block together).
  const toggleDrillTimer = async (block: RunDrill[]) => {
    lightHaptic();
    const ids = new Set(block.map((d) => d.id));
    const now = Date.now();
    if (block[0].runTimerStartedAt != null) {
      const elapsedMs = frozenElapsedMs(block[0], now);
      setDrills((prev) =>
        prev.map((d) =>
          ids.has(d.id)
            ? { ...d, runElapsedMs: elapsedMs, runTimerStartedAt: null }
            : d
        )
      );
      await updateRows([...ids], {
        run_elapsed_seconds: Math.round(elapsedMs / 1000),
        run_timer_started_at: null,
      });
    } else {
      const iso = new Date(now).toISOString();
      setDrills((prev) =>
        prev.map((d) =>
          ids.has(d.id) ? { ...d, runTimerStartedAt: iso } : d
        )
      );
      await updateRows([...ids], { run_timer_started_at: iso });
    }
  };

  // Finish the active block (done/skipped) and auto-activate the next un-run
  // block — the next block's stopwatch starts stopped (captain presses Start).
  const advanceBlock = async (
    block: RunDrill[],
    finishStatus: "done" | "skipped"
  ) => {
    lightHaptic();
    const finishedIdx = blocks.findIndex((b) => b[0].id === block[0].id);
    const finishIds = new Set(block.map((d) => d.id));
    let nextBlock: RunDrill[] | null = null;
    for (let i = finishedIdx + 1; i < blocks.length; i++) {
      if (blocks[i][0].runStatus === "planned") {
        nextBlock = blocks[i];
        break;
      }
    }
    const nextIds = nextBlock ? new Set(nextBlock.map((d) => d.id)) : null;
    const startedAt = new Date().toISOString();
    const finishElapsedMs = frozenElapsedMs(block[0], Date.now());

    setDrills((prev) =>
      prev.map((d) => {
        if (finishIds.has(d.id))
          return {
            ...d,
            runStatus: finishStatus,
            runElapsedMs: finishElapsedMs,
            runTimerStartedAt: null,
          };
        if (nextIds && nextIds.has(d.id))
          return { ...d, runStatus: "active", runStartedAt: startedAt };
        return d;
      })
    );

    await updateRows([...finishIds], {
      run_status: finishStatus,
      run_elapsed_seconds: Math.round(finishElapsedMs / 1000),
      run_timer_started_at: null,
    });
    if (nextIds)
      await updateRows([...nextIds], {
        run_status: "active",
        run_started_at: startedAt,
      });
  };

  // Tap a non-active block to make it the current drill. Its stopwatch keeps
  // whatever elapsed it had (0 if untouched) and stays paused — press Start.
  const activateBlock = async (block: RunDrill[]) => {
    if (block[0].runStatus === "active") return;
    lightHaptic();
    const targetIds = new Set(block.map((d) => d.id));
    const prevActive = drills.filter((d) => d.runStatus === "active");
    const prevActiveIds = new Set(prevActive.map((d) => d.id));
    const startedAt = new Date().toISOString();
    const prevElapsedMs = prevActive[0]
      ? frozenElapsedMs(prevActive[0], Date.now())
      : 0;

    setDrills((prev) =>
      prev.map((d) => {
        if (targetIds.has(d.id))
          return { ...d, runStatus: "active", runStartedAt: startedAt };
        if (prevActiveIds.has(d.id))
          return {
            ...d,
            runStatus: "planned",
            runElapsedMs: prevElapsedMs,
            runTimerStartedAt: null,
          };
        return d;
      })
    );

    await updateRows([...targetIds], {
      run_status: "active",
      run_started_at: startedAt,
    });
    if (prevActiveIds.size)
      await updateRows([...prevActiveIds], {
        run_status: "planned",
        run_elapsed_seconds: Math.round(prevElapsedMs / 1000),
        run_timer_started_at: null,
      });
  };

  // Auto-pause the running drill timer when leaving the screen, persisting
  // where it left off so it can be resumed on return.
  useFocusEffect(
    useCallback(() => {
      return () => {
        const running = drillsRef.current.filter(
          (d) => d.runStatus === "active" && d.runTimerStartedAt != null
        );
        if (!running.length) return;
        const elapsedMs = frozenElapsedMs(running[0], Date.now());
        const ids = running.map((d) => d.id);
        setDrills((prev) =>
          prev.map((d) =>
            ids.includes(d.id)
              ? { ...d, runElapsedMs: elapsedMs, runTimerStartedAt: null }
              : d
          )
        );
        supabase
          .from("practice_plan_drills")
          .update({
            run_elapsed_seconds: Math.round(elapsedMs / 1000),
            run_timer_started_at: null,
          })
          .in("id", ids)
          .then(({ error }) => {
            if (error) console.warn("[run] auto-pause failed", error.message);
          });
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // --- Notes actions --------------------------------------------------------

  const addNote = async (tag: NoteTag | null) => {
    if (!plan || !user) return;
    const text = noteDraft.trim() || (tag ? TAG_LABEL[tag] : "");
    if (!text) return;
    lightHaptic();
    const activeDrill = activeBlock ? activeBlock[0] : null;
    setNoteDraft("");
    const { data, error } = await supabase
      .from("practice_notes")
      .insert({
        practice_plan_id: plan.id,
        team_id: plan.teamId,
        drill_id:
          activeDrill && !activeDrill.isWaterBreak ? activeDrill.drillId : null,
        drill_label: activeDrill ? activeDrill.drillName : null,
        note_text: text,
        tag,
        created_by: user.id,
      })
      .select("id, note_text, tag, drill_label, created_at")
      .single();
    if (error) {
      Alert.alert("Couldn't save note", error.message);
      return;
    }
    if (data) {
      setNotes((prev) => [
        {
          id: data.id as string,
          noteText: data.note_text as string,
          tag: (data.tag as NoteTag | null) ?? null,
          drillLabel: (data.drill_label as string | null) ?? null,
          createdAt: data.created_at as string,
        },
        ...prev,
      ]);
    }
  };

  // --- End practice ---------------------------------------------------------

  const endPractice = () => {
    if (!plan) return;
    Alert.alert(
      "End practice?",
      "You'll move to the post-practice log to finalize and save it.",
      [
        { text: "Keep running", style: "cancel" },
        {
          text: "End & log",
          onPress: () => router.push(`/practice/${plan.id}/log` as never),
        },
      ]
    );
  };

  // --- Render guards --------------------------------------------------------

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

  if (loadError || !plan || plan.status !== "live") {
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
          {loadError
            ? loadError
            : !plan
              ? "Practice plan not found."
              : "This practice isn't live."}
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

  const isPaused = pauseStartedAt != null;
  const pausedMs =
    pausedAccumMs + (pauseStartedAt != null ? nowTs - pauseStartedAt : 0);
  // Practice timer is "armed" but not running until the coach taps Start
  // practice timer (which sets plan.startedAt). Until then, elapsed = 0 and
  // the pause button is hidden.
  const timerArmed = plan.startedAt != null;
  const elapsedMs = timerArmed
    ? Math.max(
        0,
        nowTs - new Date(plan.startedAt as string).getTime() - pausedMs
      )
    : 0;
  const overallProgress =
    timerArmed && totalPlannedMin > 0
      ? Math.min(1, Math.max(0, elapsedMs / (totalPlannedMin * 60000)))
      : 0;
  // The active drill's own start/pausable stopwatch.
  const activeDrillElapsedMs = activeBlock
    ? activeBlock[0].runElapsedMs +
      (activeBlock[0].runTimerStartedAt != null
        ? nowTs - new Date(activeBlock[0].runTimerStartedAt).getTime()
        : 0)
    : 0;
  const startLabel = formatStartTime(plan.startTime);
  const activeDrillName = activeBlock ? activeBlock[0].drillName : null;
  const nextUp = nextPlannedBlock
    ? {
        name: nextPlannedBlock.map((d) => d.drillName).join(" + "),
        durMin: nextPlannedBlock[0].durationMinutes ?? 0,
      }
    : null;
  // The schedule list shows only non-active blocks (the active one is promoted
  // into the NowRunningCard); the first planned row is flagged "up next".
  const scheduleBlocks = blocks.filter((b) => b[0].runStatus !== "active");
  const nextUpId =
    scheduleBlocks.find((b) => b[0].runStatus === "planned")?.[0].id ?? null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing.xl,
          paddingTop: insets.top + 8,
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
          <Ionicons name="chevron-back" size={20} color={colors.text.primary} />
        </TouchableOpacity>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: radius.pill,
            backgroundColor: isPaused
              ? "rgba(251, 191, 36, 0.12)"
              : colors.lime.tint,
            borderWidth: 1,
            borderColor: isPaused
              ? "rgba(251, 191, 36, 0.3)"
              : "rgba(194, 255, 61, 0.3)",
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: isPaused
                ? colors.amber[400]
                : colors.lime[400],
            }}
          />
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 11,
                letterSpacing: 1.4,
                color: isPaused ? colors.amber[400] : colors.lime[400],
              },
            ]}
          >
            {isPaused ? "PAUSED" : "LIVE"}
          </Text>
        </View>

        <TouchableOpacity
          onPress={endPractice}
          activeOpacity={0.7}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: radius.pill,
            backgroundColor: "rgba(255, 77, 77, 0.12)",
            borderWidth: 1,
            borderColor: "rgba(255, 77, 77, 0.3)",
          }}
        >
          <Text
            style={[
              fontStyle("bold"),
              { fontSize: 12, color: colors.red.semantic },
            ]}
          >
            End
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          // Reserve room for the sticky End CTA only when it's actually
          // rendered (post-start). Pre-start the screen can scroll to its
          // natural end with just tab-bar clearance.
          paddingBottom: insets.bottom + (timerArmed ? 150 : 60),
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — title + count-up timer */}
        <View style={{ marginBottom: spacing["2xl"] }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              numberOfLines={1}
              style={[
                fontStyle("bold"),
                {
                  flex: 1,
                  fontSize: 11,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: colors.orange[500],
                },
              ]}
            >
              {plan.title || "Practice"}
            </Text>
            {startLabel ? (
              <Text
                style={[
                  monoStyle("medium"),
                  {
                    fontSize: 11,
                    color: colors.text.muted,
                    marginLeft: spacing.sm,
                  },
                ]}
              >
                {startLabel} start
              </Text>
            ) : null}
          </View>

          {!timerArmed ? (
            <TouchableOpacity
              onPress={startPracticeTimer}
              activeOpacity={0.85}
              accessibilityLabel="Start practice timer"
              style={{
                marginTop: spacing.md,
                marginBottom: spacing.sm,
                height: 64,
                borderRadius: radius.lg,
                backgroundColor: colors.lime[400],
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <Ionicons
                name="play"
                size={20}
                color={colors.text.onBrand}
                style={{ marginLeft: 2 }}
              />
              <Text
                style={[
                  fontStyle("bold"),
                  {
                    fontSize: 17,
                    letterSpacing: 0.3,
                    color: colors.text.onBrand,
                  },
                ]}
              >
                Start Timer
              </Text>
            </TouchableOpacity>
          ) : (
          <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 6,
              marginBottom: 4,
            }}
          >
            <Text
              style={[
                monoStyle("bold"),
                {
                  fontSize: 56,
                  letterSpacing: -1.6,
                  color: isPaused ? colors.amber[400] : colors.text.primary,
                },
              ]}
            >
              {formatElapsed(elapsedMs)}
            </Text>
            {timerArmed ? (
              <TouchableOpacity
                onPress={togglePause}
                activeOpacity={0.8}
                accessibilityLabel={
                  isPaused ? "Resume practice" : "Pause practice"
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  height: 36,
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  backgroundColor: isPaused
                    ? colors.amber[400]
                    : colors.surface.raised,
                  borderWidth: 1,
                  borderColor: isPaused
                    ? colors.amber[400]
                    : colors.border.strong,
                }}
              >
                <Ionicons
                  name={isPaused ? "play" : "pause"}
                  size={14}
                  color={
                    isPaused ? colors.text.onBrand : colors.text.secondary
                  }
                />
                <Text
                  style={[
                    fontStyle("bold"),
                    {
                      fontSize: 12,
                      letterSpacing: 0.3,
                      color: isPaused
                        ? colors.text.onBrand
                        : colors.text.secondary,
                    },
                  ]}
                >
                  {isPaused ? "Resume" : "Pause"}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={startPracticeTimer}
                activeOpacity={0.85}
                accessibilityLabel="Start practice timer"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  height: 36,
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  backgroundColor: colors.lime[400],
                }}
              >
                <Ionicons
                  name="play"
                  size={14}
                  color={colors.text.onBrand}
                  style={{ marginLeft: 1 }}
                />
                <Text
                  style={[
                    fontStyle("bold"),
                    {
                      fontSize: 12,
                      letterSpacing: 0.3,
                      color: colors.text.onBrand,
                    },
                  ]}
                >
                  Start timer
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: spacing.sm,
            }}
          >
            <Text
              style={[
                monoStyle("medium"),
                { fontSize: 11, color: colors.text.muted },
              ]}
            >
              of {formatElapsed(totalPlannedMin * 60000)}
            </Text>
            <Text
              style={[
                monoStyle("medium"),
                { fontSize: 11, color: colors.lime[400] },
              ]}
            >
              {doneCount}/{blocks.length} drills done
            </Text>
          </View>

          <View
            style={{
              height: 6,
              borderRadius: radius.full,
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${overallProgress * 100}%`,
                borderRadius: radius.full,
                backgroundColor: colors.lime[400],
              }}
            />
          </View>
          </>
          )}
        </View>

        {/* Check-in lives on the practice plan detail page now — coaches
            mark players present during prep before tapping Begin practice.
            The run screen stays focused on execution: timer + active drill
            + schedule + notes. */}

        {/* NOW RUNNING — the current drill, lifted out of the schedule */}
        <NowRunningCard
          block={activeBlock}
          blockName={(() => {
            if (!activeBlock || activeBlock.length === 0) return null;
            const blockId = activeBlock[0].planBlockId;
            if (!blockId) return null;
            return planBlocks.find((b) => b.id === blockId)?.name ?? null;
          })()}
          elapsedMs={activeDrillElapsedMs}
          nextUp={nextUp}
          onToggleTimer={toggleDrillTimer}
          onComplete={(b) => advanceBlock(b, "done")}
          onSkip={(b) => advanceBlock(b, "skipped")}
          onStartAssessment={startAssessment}
          gated={!timerArmed}
        />

        {/* 02 — SCHEDULE */}
        <Card variant="filled" style={{ marginBottom: spacing.lg }}>
          <SectionHeader
            num="02"
            label="SCHEDULE"
            right={
              <Text
                style={[
                  monoStyle("medium"),
                  { fontSize: 11, color: colors.text.muted },
                ]}
              >
                {doneCount}/{blocks.length} done
              </Text>
            }
          />

          {blocks.length === 0 ? (
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 13, color: colors.text.muted },
              ]}
            >
              This practice has no drills scheduled.
            </Text>
          ) : scheduleBlocks.length === 0 ? (
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 13, color: colors.text.muted },
              ]}
            >
              Every drill is in the running card above.
            </Text>
          ) : (
            scheduleBlocks.map((block, idx) => {
              const head = block[0];
              const status = head.runStatus;
              const isLast = idx === scheduleBlocks.length - 1;
              const isNextUp = head.id === nextUpId;
              const accent = head.isWaterBreak
                ? colors.blue[400]
                : head.categoryName
                  ? colorForCategory(head.categoryName)
                  : colors.orange[500];
              const durMin = head.durationMinutes ?? 0;

              return (
                <View
                  key={head.id}
                  style={{ flexDirection: "row", gap: spacing.md }}
                >
                  {/* Timeline gutter */}
                  <View style={{ width: 26, alignItems: "center" }}>
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          status === "done" ? colors.lime[400] : "transparent",
                        borderWidth: status === "done" ? 0 : 1.5,
                        borderColor: isNextUp
                          ? colors.lime[400]
                          : colors.border.strong,
                      }}
                    >
                      {status === "done" ? (
                        <Ionicons
                          name="checkmark"
                          size={14}
                          color={colors.text.onBrand}
                        />
                      ) : head.isWaterBreak ? (
                        <Ionicons
                          name="water"
                          size={13}
                          color={colors.blue[400]}
                        />
                      ) : (
                        <Text
                          style={[
                            monoStyle("bold"),
                            {
                              fontSize: 10,
                              color:
                                status === "skipped"
                                  ? colors.text.muted
                                  : isNextUp
                                    ? colors.lime[400]
                                    : colors.text.secondary,
                            },
                          ]}
                        >
                          {String(idx + 1).padStart(2, "0")}
                        </Text>
                      )}
                    </View>
                    {!isLast ? (
                      <View
                        style={{
                          flex: 1,
                          width: 2,
                          minHeight: 14,
                          marginTop: 4,
                          backgroundColor: colors.border.strong,
                        }}
                      />
                    ) : null}
                  </View>

                  {/* Block content */}
                  <View
                    style={{ flex: 1, marginBottom: isLast ? 0 : spacing.md }}
                  >
                    <TouchableOpacity
                      onPress={() => activateBlock(block)}
                      activeOpacity={0.7}
                      style={{
                        borderRadius: radius.lg,
                        backgroundColor: colors.surface.raised,
                        borderWidth: isNextUp ? 1 : 0,
                        borderColor: "rgba(194, 255, 61, 0.3)",
                        borderLeftWidth: 3,
                        borderLeftColor:
                          status === "done"
                            ? colors.lime[400]
                            : status === "skipped"
                              ? colors.border.strong
                              : accent,
                        paddingVertical: spacing.md,
                        paddingHorizontal: spacing.md,
                        opacity: status === "skipped" ? 0.6 : 1,
                      }}
                    >
                      {block.map((d) => (
                        <Text
                          key={d.id}
                          style={[
                            fontStyle("semibold"),
                            {
                              fontSize: 14.5,
                              color:
                                status === "skipped"
                                  ? colors.text.muted
                                  : colors.text.primary,
                            },
                          ]}
                        >
                          {d.drillName}
                        </Text>
                      ))}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 8,
                          marginTop: 6,
                        }}
                      >
                        {isNextUp ? (
                          <View
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: radius.pill,
                              backgroundColor: colors.lime.tint,
                              borderWidth: 1,
                              borderColor: "rgba(194, 255, 61, 0.3)",
                            }}
                          >
                            <Text
                              style={[
                                fontStyle("bold"),
                                {
                                  fontSize: 9,
                                  letterSpacing: 0.8,
                                  color: colors.lime[400],
                                },
                              ]}
                            >
                              UP NEXT
                            </Text>
                          </View>
                        ) : null}
                        {head.categoryName ? (
                          <PhasePill name={head.categoryName} />
                        ) : null}
                        <Text
                          style={[
                            monoStyle("medium"),
                            { fontSize: 11.5, color: colors.text.muted },
                          ]}
                        >
                          planned {durMin}m
                          {status === "done"
                            ? " · done"
                            : status === "skipped"
                              ? " · skipped"
                              : ""}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </Card>

        {/* 03 — NOTES */}
        <Card variant="filled">
          <SectionHeader
            num="03"
            label="NOTES"
            right={
              <Text
                style={[
                  monoStyle("medium"),
                  { fontSize: 11, color: colors.text.muted },
                ]}
              >
                {notes.length} captured
              </Text>
            }
          />

          {notes.length > 0 ? (
            <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
              {notes.map((n) => (
                <View
                  key={n.id}
                  style={{
                    flexDirection: "row",
                    gap: spacing.md,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surface.raised,
                    padding: spacing.md,
                  }}
                >
                  <Text
                    style={[
                      monoStyle("medium"),
                      {
                        fontSize: 10,
                        color: colors.text.muted,
                        width: 36,
                        paddingTop: 1,
                      },
                    ]}
                  >
                    {formatClock(n.createdAt)}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 6,
                        marginBottom: 2,
                      }}
                    >
                      {n.drillLabel ? (
                        <Text
                          style={[
                            fontStyle("bold"),
                            {
                              fontSize: 9.5,
                              letterSpacing: 0.6,
                              textTransform: "uppercase",
                              color: colors.orange[500],
                            },
                          ]}
                        >
                          {n.drillLabel}
                        </Text>
                      ) : null}
                      {n.tag ? (
                        <Text
                          style={[
                            fontStyle("semibold"),
                            {
                              fontSize: 9.5,
                              letterSpacing: 0.4,
                              textTransform: "uppercase",
                              color: colors.text.muted,
                            },
                          ]}
                        >
                          · {TAG_LABEL[n.tag]}
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        fontStyle("regular"),
                        {
                          fontSize: 12.5,
                          lineHeight: 17,
                          color: colors.text.label,
                        },
                      ]}
                    >
                      {n.noteText}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {/* Note input */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              borderRadius: radius.lg,
              backgroundColor: colors.surface.raised,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <Ionicons
              name="create-outline"
              size={16}
              color={colors.text.muted}
            />
            <TextInput
              value={noteDraft}
              onChangeText={setNoteDraft}
              onSubmitEditing={() => addNote(null)}
              returnKeyType="send"
              placeholder={
                activeDrillName
                  ? `Tag a note for "${activeDrillName}"…`
                  : "Add a practice note…"
              }
              placeholderTextColor={colors.text.muted}
              style={[
                fontStyle("regular"),
                { flex: 1, fontSize: 13, color: colors.text.primary },
              ]}
            />
            <TouchableOpacity
              disabled
              accessibilityLabel="Voice note (coming soon)"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: radius.pill,
                backgroundColor: colors.orange.tint,
                opacity: 0.5,
              }}
            >
              <Ionicons name="mic" size={12} color={colors.orange[500]} />
              <Text
                style={[
                  fontStyle("bold"),
                  { fontSize: 11, color: colors.orange[500] },
                ]}
              >
                Voice
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick-add tag chips */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: spacing.sm,
              marginTop: spacing.md,
            }}
          >
            {NOTE_TAGS.map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => addNote(t.key)}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: colors.border.strong,
                }}
              >
                <Text
                  style={[
                    fontStyle("semibold"),
                    { fontSize: 10.5, color: colors.text.secondary },
                  ]}
                >
                  + {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      </ScrollView>

      {/* Sticky footer — only renders once the practice timer has started.
          Pre-start there's nothing meaningful to "end" yet, and showing the
          orange CTA next to the big lime Start CTA creates competing actions. */}
      {timerArmed ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.surface.base,
            borderTopWidth: 1,
            borderTopColor: colors.border.subtle,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + 60,
          }}
        >
          <TouchableOpacity
            onPress={endPractice}
            activeOpacity={0.85}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              minHeight: 52,
              borderRadius: radius.xl,
              backgroundColor: colors.orange[500],
            }}
          >
            <Ionicons name="flag" size={16} color="#FFFFFF" />
            <Text
              style={[
                fontStyle("bold"),
                { fontSize: 14, letterSpacing: 0.3, color: "#FFFFFF" },
              ]}
            >
              END PRACTICE & LOG
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <PastDueModal
        open={pastDueOpen}
        onClose={() => setPastDueOpen(false)}
        title="This practice is past due."
        body="It was left running. Pick up where you left off, or close it out by logging what happened."
        actions={[
          {
            label: "Resume",
            variant: "primary",
            onPress: () => setPastDueOpen(false),
          },
          {
            label: "Log practice",
            variant: "secondary",
            onPress: () => {
              setPastDueOpen(false);
              router.push(`/practice/${plan.id}/log` as never);
            },
          },
        ]}
      />
    </KeyboardAvoidingView>
  );
}
