import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../constants/design";
import { fontStyle, monoStyle } from "../constants/typography";
import { supabase } from "../lib/supabase";

// One practice's note for the drill. The set of these across practices is the
// drill's note history — derived purely from practice_plan_drills.log_note, no
// dedicated table.
type HistoryEntry = { date: string; title: string | null; note: string };

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DrillNoteHistorySheet({
  visible,
  drillId,
  drillName,
  teamId,
  onClose,
}: {
  visible: boolean;
  drillId: string | null;
  drillName: string;
  teamId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (!visible || !drillId) return;
    let cancelled = false;
    setLoading(true);
    setEntries([]);

    (async () => {
      const { data } = await supabase
        .from("practice_plan_drills")
        .select(
          "log_note, practice_plans!inner(practice_date, title, team_id, status)"
        )
        .eq("drill_id", drillId)
        .eq("practice_plans.team_id", teamId)
        .eq("practice_plans.status", "completed")
        .not("log_note", "is", null);

      if (cancelled) return;

      const rows = (data as Record<string, unknown>[] | null) ?? [];
      const mapped: HistoryEntry[] = [];
      for (const row of rows) {
        const planRaw = row.practice_plans;
        const plan = (
          Array.isArray(planRaw) ? planRaw[0] : planRaw
        ) as { practice_date: string; title: string | null } | null;
        const note = ((row.log_note as string | null) ?? "").trim();
        if (!plan || !note) continue;
        mapped.push({ date: plan.practice_date, title: plan.title, note });
      }
      mapped.sort((a, b) => b.date.localeCompare(a.date));

      // Collapse a note that carried unchanged across practices into one entry.
      const collapsed: HistoryEntry[] = [];
      for (const e of mapped) {
        const last = collapsed[collapsed.length - 1];
        if (last && last.note === e.note) continue;
        collapsed.push(e);
      }

      setEntries(collapsed);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, drillId, teamId]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.scrim }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={{
            backgroundColor: colors.surface.raised,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: spacing["3xl"],
            maxHeight: "78%",
          }}
        >
          <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border.strong,
              }}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: spacing.lg,
            }}
          >
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
                fontStyle("bold"),
                {
                  fontSize: 11,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: colors.text.primary,
                },
              ]}
            >
              Note History
            </Text>
          </View>

          <Text
            style={[
              fontStyle("semibold"),
              {
                fontSize: 16,
                color: colors.text.primary,
                marginBottom: spacing.lg,
              },
            ]}
          >
            {drillName}
          </Text>

          {loading ? (
            <View style={{ paddingVertical: spacing["2xl"], alignItems: "center" }}>
              <ActivityIndicator color={colors.orange[500]} />
            </View>
          ) : entries.length === 0 ? (
            <View
              style={{ paddingVertical: spacing["2xl"], alignItems: "center" }}
            >
              <Ionicons
                name="document-text-outline"
                size={32}
                color={colors.text.muted}
              />
              <Text
                style={[
                  fontStyle("regular"),
                  {
                    fontSize: 13,
                    lineHeight: 19,
                    color: colors.text.muted,
                    textAlign: "center",
                    marginTop: spacing.md,
                  },
                ]}
              >
                No notes have been logged for this drill yet.
              </Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.lg }}
            >
              {entries.map((e, idx) => (
                <View
                  key={`${e.date}-${idx}`}
                  style={{
                    borderLeftWidth: 2,
                    borderLeftColor: colors.border.strong,
                    paddingLeft: spacing.md,
                  }}
                >
                  <Text
                    style={[
                      monoStyle("bold"),
                      {
                        fontSize: 11,
                        letterSpacing: 0.5,
                        color: colors.orange[400],
                      },
                    ]}
                  >
                    {formatDate(e.date)}
                    {e.title ? (
                      <Text
                        style={[
                          monoStyle("medium"),
                          { color: colors.text.muted },
                        ]}
                      >
                        {"  ·  "}
                        {e.title}
                      </Text>
                    ) : null}
                  </Text>
                  <Text
                    style={[
                      fontStyle("regular"),
                      {
                        fontSize: 13.5,
                        lineHeight: 20,
                        color: colors.text.label,
                        marginTop: 4,
                      },
                    ]}
                  >
                    {e.note}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
