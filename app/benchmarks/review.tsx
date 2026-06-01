import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Eyebrow } from "../../components/ui/Eyebrow";
import { ActionModal, useActionModal } from "../../components/ui/ActionModal";
import { colors, radius, spacing, tracking } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";
import { useTeam } from "../../lib/team-context";
import {
  clearNeedsReview,
  loadNeedsReviewQueue,
  type NeedsReviewEntry,
} from "../../lib/benchmarks";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// "Quick rate · Mobile" etc. — where this entry came from.
function sourceLabel(entry: NeedsReviewEntry): string {
  const mode =
    entry.entryMode === "practice_quick"
      ? "Quick rate"
      : entry.entryMode === "self_report"
      ? "Self-report"
      : "Benchmark";
  const where = entry.capturedOn === "desktop" ? "Web" : "Mobile";
  const by = entry.assessorName ? ` · by ${entry.assessorName}` : "";
  return `${mode} · ${where}${by}`;
}

export default function ReviewQueueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();
  const { showError, modalProps } = useActionModal();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries] = useState<NeedsReviewEntry[]>([]);
  const [clearingId, setClearingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    const rows = await loadNeedsReviewQueue(teamId);
    setEntries(rows);
    setLoading(false);
  }, [teamId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onClear = useCallback(
    async (entry: NeedsReviewEntry) => {
      if (!teamId || clearingId) return;
      setClearingId(entry.id);
      const res = await clearNeedsReview(entry.id, teamId);
      setClearingId(null);
      if (!res.ok) {
        showError("Couldn't clear flag", res.error);
        return;
      }
      // Optimistically drop the cleared row.
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    },
    [teamId, clearingId, showError]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 + insets.bottom + spacing.xl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.orange[500]}
          />
        }
      >
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + spacing.md,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md,
            flexDirection: "row",
            gap: spacing.md,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={8}
            accessibilityLabel="Back"
            style={{ paddingTop: 2 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ gap: 2, flexShrink: 1 }}>
            <Eyebrow variant="brand">FLAGGED · LAST 30 DAYS</Eyebrow>
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 22,
                  letterSpacing: tracking.tight,
                  color: colors.text.primary,
                },
              ]}
            >
              Review queue
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          {loading ? (
            <View style={{ paddingVertical: spacing["3xl"], alignItems: "center" }}>
              <ActivityIndicator color={colors.orange[500]} />
            </View>
          ) : entries.length === 0 ? (
            <View
              style={{
                padding: 24,
                borderRadius: radius.xl,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: colors.border.default,
                alignItems: "center",
                gap: spacing.sm,
              }}
            >
              <Ionicons
                name="checkmark-done-circle-outline"
                size={26}
                color={colors.lime[400]}
              />
              <Text
                style={[
                  fontStyle("regular"),
                  {
                    fontSize: 13,
                    lineHeight: 19,
                    color: colors.text.secondary,
                    textAlign: "center",
                  },
                ]}
              >
                Nothing flagged. When you tap “Needs more detail” on a quick rate
                or “Mark for review” while benchmarking, entries land here for
                follow-up.
              </Text>
            </View>
          ) : (
            entries.map((entry) => (
              <ReviewRow
                key={entry.id}
                entry={entry}
                clearing={clearingId === entry.id}
                onClear={() => onClear(entry)}
                onOpenDrill={() =>
                  router.push(`/drills/${entry.drillId}` as never)
                }
              />
            ))
          )}
        </View>
      </ScrollView>

      <ActionModal {...modalProps} />
    </View>
  );
}

function ReviewRow({
  entry,
  clearing,
  onClear,
  onOpenDrill,
}: {
  entry: NeedsReviewEntry;
  clearing: boolean;
  onClear: () => void;
  onOpenDrill: () => void;
}) {
  return (
    <View
      style={{
        padding: 14,
        borderRadius: radius.xl,
        backgroundColor: colors.surface.raised,
        borderWidth: 1,
        borderColor: colors.border.subtle,
        gap: spacing.sm,
      }}
    >
      {/* Player + value */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text
          numberOfLines={1}
          style={[
            fontStyle("bold"),
            { flex: 1, fontSize: 15, color: colors.text.primary },
          ]}
        >
          {entry.playerName}
        </Text>
        <MonoText weight="bold" style={{ fontSize: 15, color: colors.orange[400] }}>
          {entry.value}
        </MonoText>
      </View>

      {/* Drill (tappable) + date */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <TouchableOpacity
          onPress={onOpenDrill}
          activeOpacity={0.6}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Text
            numberOfLines={1}
            style={[
              fontStyle("regular"),
              { fontSize: 13, color: colors.text.secondary },
            ]}
          >
            {entry.drillName}
          </Text>
          <Ionicons name="chevron-forward" size={12} color={colors.text.muted} />
        </TouchableOpacity>
        <MonoText weight="medium" style={{ fontSize: 11, color: colors.text.muted }}>
          {formatDate(entry.assessmentDate)}
        </MonoText>
      </View>

      {/* Tags */}
      {entry.tags.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {entry.tags.map((t) => (
            <View
              key={t}
              style={{
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: radius.pill,
                backgroundColor: colors.surface.overlay,
                borderWidth: 1,
                borderColor: colors.border.card,
              }}
            >
              <Text
                style={[
                  fontStyle("medium"),
                  { fontSize: 11, color: colors.text.secondary },
                ]}
              >
                {t}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Notes */}
      {entry.notes ? (
        <Text
          style={[
            fontStyle("regular"),
            { fontSize: 13, lineHeight: 19, color: colors.text.label },
          ]}
        >
          {entry.notes}
        </Text>
      ) : null}

      {/* Source + clear */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 2,
        }}
      >
        <MonoText
          weight="medium"
          style={{
            fontSize: 9.5,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: colors.text.muted,
          }}
        >
          {sourceLabel(entry)}
        </MonoText>
        <TouchableOpacity
          onPress={onClear}
          disabled={clearing}
          activeOpacity={0.6}
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
        >
          {clearing ? (
            <ActivityIndicator size="small" color={colors.lime[400]} />
          ) : (
            <Ionicons name="checkmark-circle" size={15} color={colors.lime[400]} />
          )}
          <Text
            style={[
              fontStyle("bold"),
              { fontSize: 13, color: colors.lime[400] },
            ]}
          >
            Clear flag
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
