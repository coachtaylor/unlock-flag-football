import { useEffect, useMemo, useRef, useState } from "react";
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
import { Button } from "../../components/ui/Button";
import { TextArea } from "../../components/ui/TextArea";
import { colors, radius, spacing } from "../../constants/design";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { useTeam } from "../../lib/team-context";

const QUICK_TAGS = [
  "Good hands",
  "Quick feet",
  "Needs footwork help",
  "Sharp routes",
  "Slow reaction",
  "Strong arm",
  "Good vision",
];

const RATING_ANCHORS: Record<number, string> = {
  1: "Can't execute the drill",
  2: "Struggles, needs significant work",
  3: "Gets it done but inconsistent",
  4: "Solid, minor refinements needed",
  5: "Reliable under pressure",
};

type Drill = {
  id: string;
  name: string;
  benchmarkType: "timed" | "rated";
};

type Player = {
  id: string;
  name: string;
  positions: string[];
};

type PlayerResult = {
  timeSeconds: string;
  rating: number | null;
  tags: Set<string>;
  notes: string;
};

function emptyResult(): PlayerResult {
  return { timeSeconds: "", rating: null, tags: new Set(), notes: "" };
}

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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

function PositionPill({ label }: { label: string }) {
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
        {label}
      </Text>
    </View>
  );
}

function TagPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? colors.orange[600] : colors.surface.muted,
        borderColor: selected ? colors.orange[500] : colors.border.default,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 13,
          lineHeight: 18,
          fontWeight: "500",
          color: selected ? colors.orange[400] : colors.text.subtle,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function RatingButton({
  value,
  selected,
  onPress,
}: {
  value: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Rating ${value}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flex: 1,
        height: 56,
        borderRadius: radius.xl,
        borderWidth: 1,
        backgroundColor: selected
          ? colors.orange[500]
          : colors.surface.raised,
        borderColor: selected ? colors.orange[500] : colors.border.card,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 20,
          lineHeight: 24,
          fontWeight: "500",
          color: selected ? "#FFFFFF" : colors.text.secondary,
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
    </Pressable>
  );
}

export default function BenchmarkLogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { teamId } = useTeam();
  const params = useLocalSearchParams<{ drill?: string; players?: string }>();
  const drillId = params.drill ?? "";
  const playerIdsStr = params.players ?? "";
  const playerIds = useMemo(
    () => (playerIdsStr ? playerIdsStr.split(",").filter(Boolean) : []),
    [playerIdsStr]
  );

  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const timeInputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!drillId || playerIds.length === 0) {
      setLoading(false);
      return;
    }

    (async () => {
      const [drillRes, playersRes] = await Promise.all([
        supabase
          .from("team_drills")
          .select("id, drill_name, benchmark_type")
          .eq("id", drillId)
          .maybeSingle(),
        supabase
          .from("team_players")
          .select("id, player_name, positions")
          .in("id", playerIds),
      ]);

      if (cancelled) return;

      if (drillRes.data) {
        setDrill({
          id: drillRes.data.id as string,
          name: drillRes.data.drill_name as string,
          benchmarkType: drillRes.data.benchmark_type as "timed" | "rated",
        });
      }

      // Order players in the order they were passed in the URL
      const byId = new Map<string, Player>();
      for (const p of playersRes.data ?? []) {
        byId.set(p.id as string, {
          id: p.id as string,
          name: p.player_name as string,
          positions: (p.positions as string[] | null) ?? [],
        });
      }
      const ordered: Player[] = playerIds
        .map((id) => byId.get(id))
        .filter((p): p is Player => !!p);

      setPlayers(ordered);
      setResults(ordered.map(() => emptyResult()));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [drillId, playerIds]);

  const currentPlayer = players[index];
  const currentResult = results[index];
  const isLast = index === players.length - 1;

  // Auto-focus the time input when arriving on a timed-drill player
  useEffect(() => {
    if (!drill || !currentPlayer) return;
    if (drill.benchmarkType === "timed") {
      // Small delay so the keyboard animation doesn't fight with the screen mount
      const t = setTimeout(() => timeInputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [drill, currentPlayer, index]);

  const updateCurrent = (patch: Partial<PlayerResult>) => {
    setResults((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const toggleTag = (tag: string) => {
    if (!currentResult) return;
    lightHaptic();
    const next = new Set(currentResult.tags);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    updateCurrent({ tags: next });
  };

  const setRating = (r: number) => {
    lightHaptic();
    updateCurrent({ rating: r });
  };

  const saveCurrent = async (): Promise<boolean> => {
    setError(null);
    if (!drill || !currentPlayer || !teamId || !user) {
      setError("Missing context. Please go back and try again.");
      return false;
    }

    let timeValue: number | null = null;
    let ratingValue: number | null = null;

    if (drill.benchmarkType === "timed") {
      const trimmed = currentResult.timeSeconds.trim();
      if (!trimmed) {
        setError("Enter a time before continuing.");
        return false;
      }
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError("Time must be a positive number.");
        return false;
      }
      timeValue = parsed;
    } else {
      if (!currentResult.rating) {
        setError("Pick a rating before continuing.");
        return false;
      }
      ratingValue = currentResult.rating;
    }

    const date = todayString();
    const tagsArray = Array.from(currentResult.tags);
    const payload = {
      team_id: teamId,
      drill_id: drill.id,
      player_id: currentPlayer.id,
      assessed_by: user.id,
      assessment_date: date,
      time_seconds: timeValue,
      rating: ratingValue,
      tags: tagsArray.length > 0 ? tagsArray : null,
      notes: currentResult.notes.trim() || null,
    };

    setSubmitting(true);

    if (savedIds.has(currentPlayer.id)) {
      const { error: updateErr } = await supabase
        .from("benchmark_results")
        .update(payload)
        .eq("team_id", teamId)
        .eq("drill_id", drill.id)
        .eq("player_id", currentPlayer.id)
        .eq("assessment_date", date)
        .eq("assessed_by", user.id);
      if (updateErr) {
        setError(updateErr.message);
        setSubmitting(false);
        return false;
      }
    } else {
      const { error: insertErr } = await supabase
        .from("benchmark_results")
        .insert(payload);
      if (insertErr) {
        setError(insertErr.message);
        setSubmitting(false);
        return false;
      }
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.add(currentPlayer.id);
        return next;
      });
    }

    setSubmitting(false);
    return true;
  };

  const handleNext = async () => {
    const ok = await saveCurrent();
    if (!ok) return;
    if (isLast) {
      router.replace(
        `/benchmarks/complete?drill=${drill!.id}&count=${players.length}` as never
      );
      return;
    }
    setIndex((i) => i + 1);
    setShowNotes(false);
    setError(null);
  };

  const handlePrevious = () => {
    if (index === 0) return;
    setIndex((i) => i - 1);
    setShowNotes(false);
    setError(null);
  };

  const headerPaddingTop = insets.top + spacing.lg;

  if (loading || !drill || !currentPlayer || !currentResult) {
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

  const progressPct = ((index + 1) / players.length) * 100;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header with back + progress */}
      <View
        style={{
          paddingTop: headerPaddingTop,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
        }}
      >
        <View
          className="flex-row items-center"
          style={{ gap: spacing.md, marginBottom: spacing.lg }}
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
              fontSize: 13,
              color: colors.text.secondary,
              flex: 1,
            }}
            numberOfLines={1}
          >
            Player {index + 1} of {players.length} · {drill.name}
          </Text>
        </View>

        <View
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.surface.raised,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${progressPct}%`,
              height: "100%",
              backgroundColor: colors.orange[500],
              borderRadius: 2,
            }}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing["3xl"] + 120,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Player */}
        <Text
          style={{
            fontSize: 24,
            lineHeight: 30,
            fontWeight: "500",
            color: colors.text.primary,
          }}
        >
          {currentPlayer.name}
        </Text>
        {currentPlayer.positions.length > 0 ? (
          <View
            className="flex-row flex-wrap items-center"
            style={{ gap: spacing.xs, marginTop: spacing.sm }}
          >
            {currentPlayer.positions.map((p) => (
              <PositionPill key={p} label={p} />
            ))}
          </View>
        ) : null}

        {/* Result input */}
        <View style={{ marginTop: spacing["3xl"] }}>
          {drill.benchmarkType === "timed" ? (
            <View>
              <SectionLabel>Time (seconds)</SectionLabel>
              <TextInput
                ref={timeInputRef}
                value={currentResult.timeSeconds}
                onChangeText={(v) => updateCurrent({ timeSeconds: v })}
                placeholder="0.00"
                placeholderTextColor={colors.text.muted}
                keyboardType="decimal-pad"
                returnKeyType="done"
                style={{
                  marginTop: spacing.md,
                  backgroundColor: colors.surface.raised,
                  borderWidth: 1,
                  borderColor: colors.border.card,
                  borderRadius: radius.lg,
                  paddingVertical: spacing.lg,
                  paddingHorizontal: spacing.md,
                  fontSize: 28,
                  lineHeight: 34,
                  fontWeight: "500",
                  color: colors.text.primary,
                  textAlign: "center",
                  fontVariant: ["tabular-nums"],
                }}
              />
            </View>
          ) : (
            <View>
              <SectionLabel>Rating</SectionLabel>
              <View
                className="flex-row items-center"
                style={{ marginTop: spacing.md, gap: spacing.sm }}
              >
                {[1, 2, 3, 4, 5].map((r) => (
                  <RatingButton
                    key={r}
                    value={r}
                    selected={currentResult.rating === r}
                    onPress={() => setRating(r)}
                  />
                ))}
              </View>
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 18,
                  textAlign: "center",
                  marginTop: spacing.md,
                  minHeight: 18,
                  color: currentResult.rating
                    ? colors.text.primary
                    : colors.text.muted,
                }}
              >
                {currentResult.rating
                  ? RATING_ANCHORS[currentResult.rating]
                  : "Tap a rating to see the anchor"}
              </Text>
            </View>
          )}
        </View>

        {/* Tags */}
        <View style={{ marginTop: spacing["3xl"] }}>
          <SectionLabel>Quick tags</SectionLabel>
          <View
            className="flex-row flex-wrap"
            style={{ gap: spacing.sm, marginTop: spacing.md }}
          >
            {QUICK_TAGS.map((tag) => (
              <TagPill
                key={tag}
                label={tag}
                selected={currentResult.tags.has(tag)}
                onPress={() => toggleTag(tag)}
              />
            ))}
          </View>
        </View>

        {/* Notes (collapsible) */}
        <View style={{ marginTop: spacing["2xl"] }}>
          {showNotes ? (
            <TextArea
              label="Notes"
              value={currentResult.notes}
              onChangeText={(v) => updateCurrent({ notes: v })}
              placeholder="Optional observations about this player..."
              style={{ minHeight: 100 }}
            />
          ) : (
            <Pressable
              onPress={() => setShowNotes(true)}
              hitSlop={8}
              accessibilityRole="button"
              style={({ pressed }) => ({
                paddingVertical: spacing.sm,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "500",
                  color: colors.orange[400],
                }}
              >
                + Add notes
              </Text>
            </Pressable>
          )}
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
      </ScrollView>

      {/* Sticky nav buttons */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.lg,
          backgroundColor: colors.surface.base,
          borderTopWidth: 1,
          borderTopColor: colors.border.subtle,
        }}
      >
        <View className="flex-row" style={{ gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Previous"
              onPress={handlePrevious}
              disabled={index === 0 || submitting}
              variant="secondary"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={
                submitting
                  ? "Saving…"
                  : isLast
                  ? "Finish"
                  : "Next"
              }
              onPress={handleNext}
              disabled={submitting}
            />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
