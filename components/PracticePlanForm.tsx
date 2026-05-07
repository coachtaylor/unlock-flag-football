import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { TextArea } from "./ui/TextArea";
import { Section, SectionLabel } from "./ui/FormSection";
import { colors, radius, spacing } from "../constants/design";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

const ALL = "__all__";

type PlanStatus = "draft" | "finalized" | "completed";

type Category = { id: string; name: string };

type LibraryDrill = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
};

type PlanDrill = {
  drillId: string;
  durationMinutes: number;
};

export type PracticePlanFormInitial = {
  id: string;
  practiceDate: string;
  startTime: string;
  endTime: string;
  title: string;
  notes: string;
  status: PlanStatus;
  drills: PlanDrill[];
};

type Props = {
  teamId: string;
  drills: LibraryDrill[];
  categories: Category[];
  initial?: PracticePlanFormInitial;
  topInset: number;
  bottomInset: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateToIso(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`;
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function timeToDate(t: string): Date {
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

function dateToTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatLongDate(iso: string) {
  return isoToDate(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(iso: string) {
  return isoToDate(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeReadable(t: string | null): string {
  if (!t) return "Not set";
  const [hh, mm] = t.split(":").map(Number);
  const period = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return mm === 0 ? `${h12} ${period}` : `${h12}:${pad2(mm)} ${period}`;
}

function nextSundayIso(): string {
  const today = new Date();
  const daysUntilSunday = (7 - today.getDay()) % 7 || 7;
  const target = new Date(today);
  target.setDate(today.getDate() + daysUntilSunday);
  return dateToIso(target);
}

function PickerRow({
  label,
  value,
  onPress,
  onClear,
  placeholder,
  hideIcon,
  align = "left",
}: {
  label: string;
  value: string;
  onPress: () => void;
  onClear?: () => void;
  placeholder?: string;
  hideIcon?: boolean;
  align?: "left" | "right" | "center";
}) {
  const isPlaceholder = !value;
  return (
    <View>
      <Text
        style={{
          fontSize: 11,
          lineHeight: 14,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.text.secondary,
          fontWeight: "500",
          marginBottom: spacing.sm,
          paddingHorizontal: spacing.md,
          textAlign: align,
        }}
      >
        {label}
      </Text>
      <Pressable onPress={onPress} accessibilityRole="button">
        {({ pressed }) => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              minHeight: 44,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border.card,
              backgroundColor: colors.surface.input,
              gap: spacing.sm,
              opacity: pressed ? 0.85 : 1,
            }}
          >
        {!hideIcon ? (
          <Ionicons
            name={label.toLowerCase().includes("time") ? "time-outline" : "calendar-outline"}
            size={18}
            color={colors.text.secondary}
            style={{ marginRight: spacing.sm }}
          />
        ) : null}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={{
                flex: 1,
                fontSize: 15,
                color: isPlaceholder ? colors.text.muted : colors.text.primary,
                textAlign: align,
              }}
            >
              {value || placeholder || "Tap to set"}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
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

function DrillRow({
  index,
  total,
  drillName,
  categoryName,
  durationMinutes,
  onMoveUp,
  onMoveDown,
  onRemove,
  onChangeDuration,
}: {
  index: number;
  total: number;
  drillName: string;
  categoryName: string | null;
  durationMinutes: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onChangeDuration: (v: string) => void;
}) {
  const upDisabled = index === 0;
  const downDisabled = index === total - 1;
  return (
    <View
      style={{
        backgroundColor: colors.surface.raised,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border.card,
        padding: spacing.md,
      }}
    >
      <View className="flex-row items-start" style={{ gap: spacing.sm }}>
        <Text
          style={{
            width: 20,
            fontSize: 13,
            color: colors.text.muted,
            fontVariant: ["tabular-nums"],
            marginTop: 2,
          }}
        >
          {index + 1}
        </Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              fontWeight: "500",
              color: colors.text.primary,
            }}
            numberOfLines={2}
          >
            {drillName}
          </Text>
          {categoryName ? (
            <View
              className="flex-row"
              style={{ marginTop: spacing.xs }}
            >
              <CategoryTag name={categoryName} />
            </View>
          ) : null}
        </View>
      </View>
      <View
        className="flex-row items-center justify-between"
        style={{ marginTop: spacing.md, gap: spacing.sm }}
      >
        <View className="flex-row" style={{ gap: spacing.xs }}>
          <Pressable
            onPress={onMoveUp}
            disabled={upDisabled}
            accessibilityLabel="Move up"
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border.subtle,
              backgroundColor: colors.surface.base,
              alignItems: "center",
              justifyContent: "center",
              opacity: upDisabled ? 0.4 : pressed ? 0.7 : 1,
            })}
          >
            <Ionicons
              name="chevron-up"
              size={18}
              color={
                upDisabled ? colors.text.muted : colors.text.secondary
              }
            />
          </Pressable>
          <Pressable
            onPress={onMoveDown}
            disabled={downDisabled}
            accessibilityLabel="Move down"
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border.subtle,
              backgroundColor: colors.surface.base,
              alignItems: "center",
              justifyContent: "center",
              opacity: downDisabled ? 0.4 : pressed ? 0.7 : 1,
            })}
          >
            <Ionicons
              name="chevron-down"
              size={18}
              color={
                downDisabled ? colors.text.muted : colors.text.secondary
              }
            />
          </Pressable>
        </View>
        <View
          className="flex-row items-center"
          style={{ gap: spacing.xs }}
        >
          <TextInput
            value={String(durationMinutes)}
            onChangeText={onChangeDuration}
            keyboardType="number-pad"
            maxLength={3}
            style={{
              width: 56,
              height: 44,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border.default,
              backgroundColor: colors.surface.base,
              color: colors.text.primary,
              textAlign: "center",
              fontSize: 15,
              fontVariant: ["tabular-nums"],
            }}
          />
          <Text
            style={{
              fontSize: 13,
              color: colors.text.secondary,
            }}
          >
            min
          </Text>
        </View>
        <Pressable
          onPress={onRemove}
          accessibilityLabel="Remove drill"
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: radius.md,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons
            name="close-circle-outline"
            size={22}
            color={colors.text.muted}
          />
        </Pressable>
      </View>
    </View>
  );
}

function DrillPickerModal({
  visible,
  onClose,
  drills,
  categories,
  addedIds,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  drills: LibraryDrill[];
  categories: Category[];
  addedIds: Set<string>;
  onAdd: (drillId: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<string>(ALL);

  const filtered = useMemo(() => {
    if (activeCategory === ALL) return drills;
    return drills.filter((d) => d.categoryId === activeCategory);
  }, [drills, activeCategory]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
        <View
          className="flex-row items-center justify-between"
          style={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.border.subtle,
          }}
        >
          <Text
            style={{
              fontSize: 17,
              lineHeight: 24,
              fontWeight: "500",
              color: colors.text.primary,
            }}
          >
            Add Drills
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityLabel="Done"
            style={({ pressed }) => ({
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: "500",
                color: colors.orange[400],
              }}
            >
              Done
            </Text>
          </Pressable>
        </View>

        {drills.length === 0 ? (
          <View
            style={{
              flex: 1,
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
              }}
            >
              No published drills yet. Create a drill from the Drills tab to
              add one here.
            </Text>
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: spacing.xl,
                paddingVertical: spacing.md,
                gap: spacing.sm,
              }}
            >
              {[{ id: ALL, name: "All" }, ...categories].map((c) => {
                const selected = activeCategory === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setActiveCategory(c.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => ({
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      backgroundColor: selected
                        ? colors.orange[600]
                        : colors.surface.muted,
                      borderColor: selected
                        ? colors.orange[500]
                        : colors.border.default,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "500",
                        color: selected
                          ? colors.orange[400]
                          : colors.text.subtle,
                      }}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: spacing.xl,
                paddingBottom: spacing["3xl"],
                gap: spacing.sm,
              }}
            >
              {filtered.map((d) => {
                const added = addedIds.has(d.id);
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => !added && onAdd(d.id)}
                    disabled={added}
                    className="flex-row items-center"
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      backgroundColor: colors.surface.raised,
                      borderRadius: radius.lg,
                      borderWidth: 1,
                      borderColor: colors.border.card,
                      padding: spacing.lg,
                      gap: spacing.md,
                      minHeight: 44,
                      opacity: added ? 0.5 : pressed ? 0.85 : 1,
                    })}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          lineHeight: 22,
                          fontWeight: "500",
                          color: colors.text.primary,
                        }}
                        numberOfLines={2}
                      >
                        {d.name}
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
                    <Ionicons
                      name={added ? "checkmark-circle" : "add-circle"}
                      size={26}
                      color={
                        added ? colors.green[400] : colors.orange[500]
                      }
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

export function PracticePlanForm({
  teamId,
  drills,
  categories,
  initial,
  topInset,
  bottomInset,
}: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const isEditing = !!initial;

  const [practiceDate, setPracticeDate] = useState(
    initial?.practiceDate ?? nextSundayIso()
  );
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [planDrills, setPlanDrills] = useState<PlanDrill[]>(
    initial?.drills ?? []
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const drillsById = useMemo(() => {
    const map = new Map<string, LibraryDrill>();
    for (const d of drills) map.set(d.id, d);
    return map;
  }, [drills]);

  const addedIds = useMemo(
    () => new Set(planDrills.map((d) => d.drillId)),
    [planDrills]
  );

  const totalDuration = useMemo(
    () => planDrills.reduce((s, d) => s + (d.durationMinutes || 0), 0),
    [planDrills]
  );

  const practiceMinutes = useMemo(() => {
    if (!startTime || !endTime) return null;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
    const diff = eh * 60 + em - (sh * 60 + sm);
    return diff > 0 ? diff : null;
  }, [startTime, endTime]);

  const remainingMinutes =
    practiceMinutes != null ? practiceMinutes - totalDuration : null;

  const addDrill = (drillId: string) => {
    setPlanDrills((prev) =>
      prev.some((d) => d.drillId === drillId)
        ? prev
        : [...prev, { drillId, durationMinutes: 15 }]
    );
  };

  const removeDrill = (i: number) => {
    setPlanDrills((prev) => prev.filter((_, idx) => idx !== i));
  };

  const moveDrill = (i: number, dir: -1 | 1) => {
    setPlanDrills((prev) => {
      const target = i + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  };

  const updateDuration = (i: number, value: string) => {
    const parsed = parseInt(value, 10);
    setPlanDrills((prev) => {
      const next = [...prev];
      next[i] = {
        ...next[i],
        durationMinutes:
          Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
      };
      return next;
    });
  };

  const onDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== "ios") setDatePickerOpen(false);
    if (event.type === "dismissed") return;
    if (date) setPracticeDate(dateToIso(date));
  };

  const onStartChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== "ios") setStartPickerOpen(false);
    if (event.type === "dismissed") return;
    if (date) setStartTime(dateToTime(date));
  };

  const onEndChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== "ios") setEndPickerOpen(false);
    if (event.type === "dismissed") return;
    if (date) setEndTime(dateToTime(date));
  };

  const persistPlan = async (
    targetStatus: PlanStatus
  ): Promise<string | null> => {
    if (!practiceDate) {
      setError("Practice date is required.");
      return null;
    }
    if (!user) {
      setError("You must be logged in.");
      return null;
    }

    let planId = initial?.id;
    const payload = {
      team_id: teamId,
      practice_date: practiceDate,
      start_time: startTime || null,
      end_time: endTime || null,
      title: title.trim() || null,
      notes: notes.trim() || null,
      status: targetStatus,
    };

    if (isEditing && planId) {
      const { error: updateErr } = await supabase
        .from("practice_plans")
        .update(payload)
        .eq("id", planId);
      if (updateErr) {
        setError(updateErr.message);
        return null;
      }
      const { error: deleteErr } = await supabase
        .from("practice_plan_drills")
        .delete()
        .eq("practice_plan_id", planId);
      if (deleteErr) {
        setError(deleteErr.message);
        return null;
      }
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("practice_plans")
        .insert({ ...payload, created_by: user.id })
        .select("id")
        .single();
      if (insertErr || !inserted) {
        setError(insertErr?.message ?? "Could not create plan.");
        return null;
      }
      planId = inserted.id as string;
    }

    if (planDrills.length > 0 && planId) {
      const rows = planDrills.map((d, idx) => ({
        practice_plan_id: planId,
        drill_id: d.drillId,
        drill_order: idx + 1,
        duration_minutes: d.durationMinutes || null,
        notes: null,
      }));
      const { error: drillsErr } = await supabase
        .from("practice_plan_drills")
        .insert(rows);
      if (drillsErr) {
        setError(drillsErr.message);
        return null;
      }
    }

    return planId ?? null;
  };

  const save = async (target: PlanStatus) => {
    setError(null);
    setSubmitting(true);
    const id = await persistPlan(target);
    if (!id) {
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    if (isEditing) {
      router.back();
    } else {
      router.replace(`/practice/${id}` as never);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View
        className="flex-row items-center"
        style={{
          paddingTop: topInset + spacing.lg,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          gap: spacing.md,
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
        <Text
          style={{
            fontSize: 20,
            lineHeight: 28,
            fontWeight: "500",
            color: colors.text.primary,
          }}
        >
          {isEditing ? "Edit Practice Plan" : "New Practice Plan"}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing["3xl"] + 140,
          gap: spacing["2xl"],
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* When + Times — three fields inline */}
        <Section>
          <View className="flex-row" style={{ gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <PickerRow
                label="Date"
                value={formatShortDate(practiceDate)}
                onPress={() => {
                  setStartPickerOpen(false);
                  setEndPickerOpen(false);
                  setDatePickerOpen(true);
                }}
                hideIcon
              />
            </View>
            <View style={{ flex: 0.4 }} />
            <View
              className="flex-row"
              style={{
                flex: 1,
                gap: spacing.md,
              }}
            >
              <View style={{ flex: 1 }}>
                <PickerRow
                  label="Start"
                  value={startTime ? formatTimeReadable(startTime) : ""}
                  placeholder="—"
                  onPress={() => {
                    setDatePickerOpen(false);
                    setEndPickerOpen(false);
                    setStartPickerOpen(true);
                  }}
                  onClear={() => setStartTime("")}
                  hideIcon
                  align="center"
                />
              </View>
              <View style={{ flex: 1 }}>
                <PickerRow
                  label="End"
                  value={endTime ? formatTimeReadable(endTime) : ""}
                  placeholder="—"
                  onPress={() => {
                    setDatePickerOpen(false);
                    setStartPickerOpen(false);
                    setEndPickerOpen(true);
                  }}
                  onClear={() => setEndTime("")}
                  hideIcon
                  align="center"
                />
              </View>
            </View>
          </View>

          {datePickerOpen ? (
            <View style={{ marginTop: spacing.md }}>
              <DateTimePicker
                value={isoToDate(practiceDate)}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                onChange={onDateChange}
                themeVariant="dark"
              />
              {Platform.OS === "ios" ? (
                <View style={{ marginTop: spacing.sm }}>
                  <Button
                    label="Done"
                    onPress={() => setDatePickerOpen(false)}
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          {startPickerOpen ? (
            <View style={{ marginTop: spacing.md }}>
              <DateTimePicker
                value={startTime ? timeToDate(startTime) : timeToDate("10:00")}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onStartChange}
                themeVariant="dark"
                minuteInterval={5}
              />
              {Platform.OS === "ios" ? (
                <View
                  className="flex-row"
                  style={{ marginTop: spacing.sm, gap: spacing.sm }}
                >
                  {startTime ? (
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Clear"
                        variant="secondary"
                        onPress={() => {
                          setStartTime("");
                          setStartPickerOpen(false);
                        }}
                      />
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Done"
                      onPress={() => setStartPickerOpen(false)}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {endPickerOpen ? (
            <View style={{ marginTop: spacing.md }}>
              <DateTimePicker
                value={endTime ? timeToDate(endTime) : timeToDate("12:00")}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onEndChange}
                themeVariant="dark"
                minuteInterval={5}
              />
              {Platform.OS === "ios" ? (
                <View
                  className="flex-row"
                  style={{ marginTop: spacing.sm, gap: spacing.sm }}
                >
                  {endTime ? (
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Clear"
                        variant="secondary"
                        onPress={() => {
                          setEndTime("");
                          setEndPickerOpen(false);
                        }}
                      />
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Done"
                      onPress={() => setEndPickerOpen(false)}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {startTime && endTime && practiceMinutes == null ? (
            <Text
              style={{
                fontSize: 13,
                color: colors.errorLight,
                marginTop: spacing.sm,
              }}
            >
              End time must be after start time.
            </Text>
          ) : null}
        </Section>

        {/* Title */}
        <Section>
          <Input
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="e.g., Pre-tournament conditioning"
          />
        </Section>

        {/* Notes */}
        <Section>
          <TextArea
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Goals for this practice, things to focus on..."
            style={{ minHeight: 100 }}
          />
        </Section>

        {/* Drills section */}
        <Section>
          <View
            className="flex-row items-center justify-between"
            style={{ marginBottom: spacing.sm }}
          >
            <SectionLabel>Drills</SectionLabel>
            <Text
              style={{
                fontSize: 13,
                color:
                  remainingMinutes != null && remainingMinutes < 0
                    ? colors.orange[400]
                    : colors.text.secondary,
                fontVariant: ["tabular-nums"],
              }}
            >
              {planDrills.length}{" "}
              {planDrills.length === 1 ? "drill" : "drills"} · {totalDuration}{" "}
              min
            </Text>
          </View>

          {practiceMinutes != null && remainingMinutes != null ? (
            <Text
              style={{
                fontSize: 13,
                marginBottom: spacing.md,
                color:
                  remainingMinutes < 0
                    ? colors.orange[400]
                    : colors.text.secondary,
                fontVariant: ["tabular-nums"],
              }}
            >
              {remainingMinutes >= 0
                ? `${remainingMinutes} min remaining of ${practiceMinutes} min window`
                : `${Math.abs(remainingMinutes)} min over the ${practiceMinutes} min window`}
            </Text>
          ) : null}

          {planDrills.length === 0 ? (
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
                  lineHeight: 18,
                  color: colors.text.secondary,
                  textAlign: "center",
                }}
              >
                No drills yet. Tap &ldquo;Add Drill&rdquo; to build the
                schedule.
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {planDrills.map((pd, idx) => {
                const drill = drillsById.get(pd.drillId);
                return (
                  <DrillRow
                    key={`${pd.drillId}-${idx}`}
                    index={idx}
                    total={planDrills.length}
                    drillName={drill?.name ?? "Unknown drill"}
                    categoryName={drill?.categoryName ?? null}
                    durationMinutes={pd.durationMinutes}
                    onMoveUp={() => moveDrill(idx, -1)}
                    onMoveDown={() => moveDrill(idx, 1)}
                    onRemove={() => removeDrill(idx)}
                    onChangeDuration={(v) => updateDuration(idx, v)}
                  />
                );
              })}
            </View>
          )}

          <View style={{ marginTop: spacing.md }}>
            <Button
              label="+ Add Drill"
              onPress={() => setPickerOpen(true)}
              variant="secondary"
            />
          </View>
        </Section>

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
      </ScrollView>

      {/* Sticky save buttons */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: bottomInset + spacing.lg,
          backgroundColor: colors.surface.base,
          borderTopWidth: 1,
          borderTopColor: colors.border.subtle,
        }}
      >
        <View className="flex-row" style={{ gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={submitting ? "Saving…" : "Save Draft"}
              onPress={() => save("draft")}
              disabled={submitting}
              variant="secondary"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={submitting ? "Saving…" : "Save & Finalize"}
              onPress={() => save("finalized")}
              disabled={submitting}
            />
          </View>
        </View>
      </View>

      {/* Drill picker */}
      <DrillPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        drills={drills}
        categories={categories}
        addedIds={addedIds}
        onAdd={addDrill}
      />
    </KeyboardAvoidingView>
  );
}
