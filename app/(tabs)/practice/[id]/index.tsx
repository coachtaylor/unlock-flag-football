import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../../../components/ui/Button";
import { colors, radius, spacing } from "../../../../constants/design";
import { supabase } from "../../../../lib/supabase";

type PlanStatus = "draft" | "finalized" | "completed";

type PlanDrill = {
  id: string;
  drillId: string;
  drillOrder: number;
  durationMinutes: number | null;
  drillName: string;
  categoryName: string | null;
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
  drills: PlanDrill[];
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

function StatusBadge({ status }: { status: PlanStatus }) {
  if (status === "draft") {
    return (
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: radius.pill,
          backgroundColor: colors.surface.muted,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: colors.border.strong,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: "500",
            color: colors.text.muted,
            letterSpacing: 0.3,
          }}
        >
          Draft
        </Text>
      </View>
    );
  }
  if (status === "finalized") {
    return (
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: radius.pill,
          backgroundColor: colors.green[800],
          borderWidth: 1,
          borderColor: colors.green[600],
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: "500",
            color: colors.green[400],
            letterSpacing: 0.3,
          }}
        >
          Finalized
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: colors.surface.muted,
        borderWidth: 1,
        borderColor: colors.border.subtle,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "500",
          color: colors.text.muted,
          letterSpacing: 0.3,
        }}
      >
        Completed
      </Text>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        lineHeight: 14,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        color: colors.text.secondary,
        fontWeight: "500",
      }}
    >
      {children}
    </Text>
  );
}

function CategoryTag({ name }: { name: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: colors.surface.muted,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.text.subtle,
        }}
      >
        {name}
      </Text>
    </View>
  );
}

export default function PracticePlanDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [log, setLog] = useState<PracticeLog | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;

    const { data: planData } = await supabase
      .from("practice_plans")
      .select(
        "id, team_id, practice_date, start_time, end_time, title, status, notes, practice_plan_drills(id, drill_id, drill_order, duration_minutes, team_drills(id, drill_name, drill_categories(category_name)))"
      )
      .eq("id", id)
      .maybeSingle();

    if (!planData) {
      setPlan(null);
      return;
    }

    type DrillRow = {
      id: string;
      drill_id: string;
      drill_order: number;
      duration_minutes: number | null;
      team_drills:
        | {
            drill_name: string;
            drill_categories:
              | { category_name: string }
              | { category_name: string }[]
              | null;
          }
        | {
            drill_name: string;
            drill_categories:
              | { category_name: string }
              | { category_name: string }[]
              | null;
          }[]
        | null;
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
        const cat = drill?.drill_categories;
        const categoryName = Array.isArray(cat)
          ? cat[0]?.category_name ?? null
          : cat?.category_name ?? null;
        return {
          id: d.id,
          drillId: d.drill_id,
          drillOrder: d.drill_order,
          durationMinutes: d.duration_minutes,
          drillName: drill?.drill_name ?? "Unknown drill",
          categoryName,
        };
      });

    const status = planData.status as PlanStatus;

    setPlan({
      id: planData.id as string,
      teamId: planData.team_id as string,
      practiceDate: planData.practice_date as string,
      startTime: (planData.start_time as string | null) ?? null,
      endTime: (planData.end_time as string | null) ?? null,
      title: (planData.title as string | null) ?? null,
      status,
      notes: (planData.notes as string | null) ?? null,
      drills: drillRows,
    });

    if (status === "completed") {
      const { data: logData } = await supabase
        .from("practice_logs")
        .select(
          "drills_completed, drills_skipped, team_performance_notes, highlights, areas_to_improve, attendance_count, energy_level"
        )
        .eq("practice_plan_id", id)
        .maybeSingle();
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
      }
    } else {
      setLog(null);
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
    Alert.alert(
      "Finalize plan?",
      "Finalizing locks in the schedule and unlocks Log Practice on practice day.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Finalize",
          onPress: async () => {
            setBusy(true);
            const { error } = await supabase
              .from("practice_plans")
              .update({ status: "finalized" })
              .eq("id", plan.id);
            setBusy(false);
            if (error) {
              Alert.alert("Couldn't finalize", error.message);
              return;
            }
            await load();
          },
        },
      ]
    );
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

  const totalDuration = plan.drills.reduce(
    (s, d) => s + (d.durationMinutes ?? 0),
    0
  );
  const window = diffMinutes(plan.startTime, plan.endTime);
  const remaining = window != null ? window - totalDuration : null;

  const startStr = formatTime(plan.startTime);
  const endStr = formatTime(plan.endTime);

  const skippedNames = log
    ? plan.drills
        .filter((d) => log.drillsSkipped.includes(d.drillId))
        .map((d) => d.drillName)
    : [];
  const completedCount = log ? log.drillsCompleted.length : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
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
        <Text
          style={{
            fontSize: 24,
            lineHeight: 30,
            fontWeight: "500",
            color: colors.text.primary,
            marginTop: spacing.sm,
          }}
        >
          {formatLongDate(plan.practiceDate)}
        </Text>
        {plan.title ? (
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: colors.text.secondary,
              marginTop: spacing.xs,
            }}
          >
            {plan.title}
          </Text>
        ) : null}
        {startStr && endStr ? (
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: colors.text.secondary,
              marginTop: spacing.xs,
              fontVariant: ["tabular-nums"],
            }}
          >
            {startStr} – {endStr}
          </Text>
        ) : null}
        <View
          className="flex-row"
          style={{ marginTop: spacing.md }}
        >
          <StatusBadge status={plan.status} />
        </View>

        {plan.notes ? (
          <View style={{ marginTop: spacing["2xl"] }}>
            <SectionLabel>Notes</SectionLabel>
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

        {/* Schedule */}
        <View style={{ marginTop: spacing["3xl"] }}>
          <View
            className="flex-row items-center justify-between"
            style={{ marginBottom: spacing.md }}
          >
            <SectionLabel>Schedule</SectionLabel>
            <Text
              style={{
                fontSize: 13,
                color: colors.text.secondary,
                fontVariant: ["tabular-nums"],
              }}
            >
              {plan.drills.length}{" "}
              {plan.drills.length === 1 ? "drill" : "drills"} · {totalDuration}{" "}
              min
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
            <View style={{ gap: spacing.sm }}>
              {plan.drills.map((d, idx) => (
                <View
                  key={d.id}
                  style={{
                    backgroundColor: colors.surface.raised,
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: colors.border.card,
                    padding: spacing.md,
                  }}
                >
                  <View
                    className="flex-row items-start"
                    style={{ gap: spacing.sm }}
                  >
                    <Text
                      style={{
                        width: 20,
                        fontSize: 13,
                        color: colors.text.muted,
                        fontVariant: ["tabular-nums"],
                        marginTop: 2,
                      }}
                    >
                      {idx + 1}
                    </Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          lineHeight: 22,
                          fontWeight: "500",
                          color: colors.text.primary,
                        }}
                      >
                        {d.drillName}
                      </Text>
                      {d.categoryName ? (
                        <View
                          className="flex-row"
                          style={{ marginTop: spacing.xs }}
                        >
                          <CategoryTag name={d.categoryName} />
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        color: colors.text.secondary,
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {d.durationMinutes ?? 0} min
                    </Text>
                  </View>
                </View>
              ))}
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

        {/* Practice Log (only if completed) */}
        {plan.status === "completed" && log ? (
          <View style={{ marginTop: spacing["3xl"] }}>
            <SectionLabel>Practice Log</SectionLabel>
            <View
              style={{
                marginTop: spacing.md,
                backgroundColor: colors.surface.raised,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.border.card,
                padding: spacing.lg,
              }}
            >
              <Text
                style={{
                  fontSize: 22,
                  lineHeight: 28,
                  fontWeight: "500",
                  color: colors.text.primary,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {completedCount} of {plan.drills.length} drills completed
              </Text>
              {skippedNames.length > 0 ? (
                <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
                  <SectionLabel>Skipped</SectionLabel>
                  {skippedNames.map((name) => (
                    <Text
                      key={name}
                      style={{
                        fontSize: 15,
                        color: colors.text.primary,
                      }}
                    >
                      · {name}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>

            <View
              className="flex-row"
              style={{ gap: spacing.sm, marginTop: spacing.md }}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.surface.raised,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border.card,
                  padding: spacing.lg,
                }}
              >
                <SectionLabel>Attendance</SectionLabel>
                <Text
                  style={{
                    fontSize: 28,
                    lineHeight: 34,
                    fontWeight: "500",
                    color: colors.text.primary,
                    fontVariant: ["tabular-nums"],
                    marginTop: spacing.xs,
                  }}
                >
                  {log.attendanceCount ?? "—"}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.surface.raised,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border.card,
                  padding: spacing.lg,
                }}
              >
                <SectionLabel>Energy</SectionLabel>
                <Text
                  style={{
                    fontSize: 28,
                    lineHeight: 34,
                    fontWeight: "500",
                    color: colors.text.primary,
                    fontVariant: ["tabular-nums"],
                    marginTop: spacing.xs,
                  }}
                >
                  {log.energyLevel ?? "—"}
                </Text>
                {log.energyLevel != null ? (
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.text.secondary,
                      marginTop: spacing.xs,
                    }}
                  >
                    {ENERGY_ANCHORS[log.energyLevel]}
                  </Text>
                ) : null}
              </View>
            </View>

            {log.teamPerformanceNotes ? (
              <View style={{ marginTop: spacing.lg }}>
                <SectionLabel>Team performance</SectionLabel>
                <Text
                  style={{
                    fontSize: 15,
                    lineHeight: 22,
                    color: colors.text.primary,
                    marginTop: spacing.sm,
                  }}
                >
                  {log.teamPerformanceNotes}
                </Text>
              </View>
            ) : null}
            {log.highlights ? (
              <View style={{ marginTop: spacing.lg }}>
                <SectionLabel>What went well</SectionLabel>
                <Text
                  style={{
                    fontSize: 15,
                    lineHeight: 22,
                    color: colors.text.primary,
                    marginTop: spacing.sm,
                  }}
                >
                  {log.highlights}
                </Text>
              </View>
            ) : null}
            {log.areasToImprove ? (
              <View style={{ marginTop: spacing.lg }}>
                <SectionLabel>What needs work</SectionLabel>
                <Text
                  style={{
                    fontSize: 15,
                    lineHeight: 22,
                    color: colors.text.primary,
                    marginTop: spacing.sm,
                  }}
                >
                  {log.areasToImprove}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Actions */}
        {plan.status !== "completed" ? (
          <View
            style={{ marginTop: spacing["3xl"], gap: spacing.md }}
          >
            {plan.status === "draft" ? (
              <>
                <Button
                  label={busy ? "Updating…" : "Finalize"}
                  onPress={finalize}
                  disabled={busy}
                />
                <Button
                  label="Edit Plan"
                  onPress={() =>
                    router.push(`/practice/${plan.id}/edit` as never)
                  }
                  variant="secondary"
                />
              </>
            ) : (
              <>
                <Button
                  label="Log Practice"
                  onPress={() =>
                    router.push(`/practice/${plan.id}/log` as never)
                  }
                />
                <Button
                  label="Edit Plan"
                  onPress={() =>
                    router.push(`/practice/${plan.id}/edit` as never)
                  }
                  variant="secondary"
                />
              </>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
