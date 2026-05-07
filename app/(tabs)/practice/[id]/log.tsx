import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../../../components/ui/Button";
import { TextArea } from "../../../../components/ui/TextArea";
import { colors, radius, spacing } from "../../../../constants/design";
import { supabase } from "../../../../lib/supabase";
import { useAuth } from "../../../../lib/auth-context";

type PlanStatus = "draft" | "finalized" | "completed";

type PlanDrill = {
  id: string;
  drillId: string;
  drillOrder: number;
  drillName: string;
};

type Plan = {
  id: string;
  teamId: string;
  practiceDate: string;
  status: PlanStatus;
  drills: PlanDrill[];
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
        style={{
          fontSize: 15,
          lineHeight: 22,
          color: colors.text.secondary,
          textAlign: "center",
          marginBottom: spacing.lg,
        }}
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

export default function PracticeLogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [teamPerformanceNotes, setTeamPerformanceNotes] = useState("");
  const [highlights, setHighlights] = useState("");
  const [areasToImprove, setAreasToImprove] = useState("");
  const [attendance, setAttendance] = useState("");
  const [energy, setEnergy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setLoading(false);
      return;
    }

    (async () => {
      const { data: planData } = await supabase
        .from("practice_plans")
        .select(
          "id, team_id, practice_date, status, practice_plan_drills(id, drill_id, drill_order, team_drills(id, drill_name))"
        )
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;

      if (!planData) {
        setPlan(null);
        setLoading(false);
        return;
      }

      type DrillRow = {
        id: string;
        drill_id: string;
        drill_order: number;
        team_drills:
          | { drill_name: string }
          | { drill_name: string }[]
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
          return {
            id: d.id,
            drillId: d.drill_id,
            drillOrder: d.drill_order,
            drillName: drill?.drill_name ?? "Unknown drill",
          };
        });

      const initCompleted: Record<string, boolean> = {};
      for (const d of drillRows) initCompleted[d.drillId] = true;

      setPlan({
        id: planData.id as string,
        teamId: planData.team_id as string,
        practiceDate: planData.practice_date as string,
        status: planData.status as PlanStatus,
        drills: drillRows,
      });
      setCompleted(initCompleted);
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

  const setEnergyValue = (r: number) => {
    lightHaptic();
    setEnergy((prev) => (prev === r ? null : r));
  };

  const handleSubmit = async () => {
    if (!plan || !user) return;
    setError(null);

    let attendanceCount: number | null = null;
    if (attendance.trim()) {
      const parsed = Number(attendance.trim());
      if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
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

    const { error: insertErr } = await supabase.from("practice_logs").insert({
      practice_plan_id: plan.id,
      team_id: plan.teamId,
      logged_by: user.id,
      drills_completed: drillsCompleted.length > 0 ? drillsCompleted : null,
      drills_skipped: drillsSkipped.length > 0 ? drillsSkipped : null,
      team_performance_notes: teamPerformanceNotes.trim() || null,
      highlights: highlights.trim() || null,
      areas_to_improve: areasToImprove.trim() || null,
      attendance_count: attendanceCount,
      energy_level: energy,
    });

    if (insertErr) {
      setError(insertErr.message);
      setSubmitting(false);
      return;
    }

    const { error: updateErr } = await supabase
      .from("practice_plans")
      .update({ status: "completed" })
      .eq("id", plan.id);

    if (updateErr) {
      setError(updateErr.message);
      setSubmitting(false);
      return;
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
        message="This plan hasn't been finalized yet."
        buttonLabel="Back to Plan"
        onPress={() => router.replace(`/practice/${plan.id}` as never)}
      />
    );
  }

  if (plan.status === "completed") {
    return (
      <GuardScreen
        message="This practice has already been logged."
        buttonLabel="View Plan"
        onPress={() => router.replace(`/practice/${plan.id}` as never)}
      />
    );
  }

  const completedCount = plan.drills.filter((d) => completed[d.drillId]).length;
  const skippedCount = plan.drills.length - completedCount;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
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
          paddingBottom: spacing["3xl"] + 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{
            fontSize: 20,
            lineHeight: 26,
            fontWeight: "500",
            color: colors.text.primary,
            marginTop: spacing.sm,
          }}
        >
          Log Practice
        </Text>
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            color: colors.text.secondary,
            marginTop: spacing.xs,
          }}
        >
          {formatLongDate(plan.practiceDate)}
        </Text>

        {/* Section 1: Drills */}
        <View style={{ marginTop: spacing["3xl"] }}>
          <View
            className="flex-row items-center justify-between"
            style={{ marginBottom: spacing.md }}
          >
            <SectionLabel>Drills</SectionLabel>
            <Text
              style={{
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: colors.text.muted,
                fontVariant: ["tabular-nums"],
              }}
            >
              {completedCount} completed · {skippedCount} skipped
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
                No drills were planned.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {plan.drills.map((d) => {
                const isCompleted = completed[d.drillId];
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => toggleDrill(d.drillId)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isCompleted }}
                    style={({ pressed }) => ({
                      backgroundColor: colors.surface.raised,
                      borderRadius: radius.xl,
                      borderWidth: 1,
                      borderColor: colors.border.subtle,
                      borderLeftWidth: 3,
                      borderLeftColor: isCompleted
                        ? colors.green[400]
                        : colors.orange[500],
                      padding: 14,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.md,
                      opacity: pressed ? 0.85 : 1,
                    })}
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
                    <Ionicons
                      name={isCompleted ? "checkmark-circle" : "close-circle"}
                      size={22}
                      color={
                        isCompleted ? colors.green[400] : colors.orange[500]
                      }
                    />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Section 2: Team performance */}
        <View style={{ marginTop: spacing["3xl"] }}>
          <SectionLabel>How did the team perform?</SectionLabel>
          <View style={{ marginTop: spacing.md }}>
            <TextArea
              value={teamPerformanceNotes}
              onChangeText={setTeamPerformanceNotes}
              placeholder="General observations about today's practice..."
              style={{
                minHeight: 88,
                backgroundColor: colors.surface.raised,
                borderColor: colors.border.subtle,
                borderRadius: radius.xl,
              }}
            />
          </View>
        </View>

        {/* Section 3: Highlights */}
        <View style={{ marginTop: spacing["2xl"] }}>
          <SectionLabel>What went well?</SectionLabel>
          <View style={{ marginTop: spacing.md }}>
            <TextArea
              value={highlights}
              onChangeText={setHighlights}
              placeholder="Best moments, breakthroughs, good reps..."
              style={{
                minHeight: 88,
                backgroundColor: colors.surface.raised,
                borderColor: colors.border.subtle,
                borderRadius: radius.xl,
              }}
            />
          </View>
        </View>

        {/* Section 4: Areas to improve */}
        <View style={{ marginTop: spacing["2xl"] }}>
          <SectionLabel>What needs work?</SectionLabel>
          <View style={{ marginTop: spacing.md }}>
            <TextArea
              value={areasToImprove}
              onChangeText={setAreasToImprove}
              placeholder="Things to focus on next practice..."
              style={{
                minHeight: 88,
                backgroundColor: colors.surface.raised,
                borderColor: colors.border.subtle,
                borderRadius: radius.xl,
              }}
            />
          </View>
        </View>

        {/* Section 5: Attendance */}
        <View style={{ marginTop: spacing["3xl"] }}>
          <SectionLabel>Players present</SectionLabel>
          <TextInput
            value={attendance}
            onChangeText={setAttendance}
            placeholder="e.g., 12"
            placeholderTextColor={colors.text.muted}
            keyboardType="number-pad"
            returnKeyType="done"
            style={{
              marginTop: spacing.md,
              backgroundColor: colors.surface.raised,
              borderWidth: 1,
              borderColor: colors.border.subtle,
              borderRadius: radius.xl,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.md,
              fontSize: 15,
              lineHeight: 22,
              color: colors.text.primary,
              fontVariant: ["tabular-nums"],
            }}
          />
          <Text
            style={{
              fontSize: 13,
              lineHeight: 18,
              color: colors.text.muted,
              marginTop: spacing.xs,
            }}
          >
            How many players showed up?
          </Text>
        </View>

        {/* Section 6: Team energy */}
        <View style={{ marginTop: spacing["2xl"] }}>
          <SectionLabel>Team energy level</SectionLabel>
          <View
            className="flex-row"
            style={{ gap: spacing.sm, marginTop: spacing.md }}
          >
            {[1, 2, 3, 4, 5].map((r) => {
              const selected = energy === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setEnergyValue(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`Energy ${r}`}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 48,
                    borderRadius: radius.xl,
                    borderWidth: 1,
                    backgroundColor: selected
                      ? colors.orange[500]
                      : colors.surface.raised,
                    borderColor: selected
                      ? colors.orange[500]
                      : colors.border.subtle,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontSize: 17,
                      lineHeight: 22,
                      fontWeight: "500",
                      color: selected ? "#FFFFFF" : colors.text.secondary,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {r}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text
            style={{
              fontSize: 13,
              lineHeight: 18,
              textAlign: "center",
              marginTop: spacing.md,
              minHeight: 18,
              color: energy ? colors.text.primary : colors.text.muted,
            }}
          >
            {energy ? ENERGY_ANCHORS[energy] : "Tap a level"}
          </Text>
        </View>

        {error ? (
          <Text
            style={{
              fontSize: 13,
              lineHeight: 18,
              color: colors.errorLight,
              marginTop: spacing.lg,
            }}
          >
            {error}
          </Text>
        ) : null}

        <View style={{ marginTop: spacing["3xl"], marginBottom: 8 }}>
          <Button
            label={submitting ? "Saving…" : "Complete Practice Log"}
            onPress={handleSubmit}
            disabled={submitting}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
