import { useCallback, useEffect, useState } from "react";
import {
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

type Player = {
  id: string;
  name: string;
  positions: string[];
  jerseyNumber: string | null;
  status: "active" | "inactive";
  notes: string | null;
};

type BenchmarkRow = {
  id: string;
  assessmentDate: string;
  timeSeconds: number | null;
  rating: number | null;
  tags: string[];
  notes: string | null;
  drillName: string;
  benchmarkType: "timed" | "rated" | null;
};

type GroupedDrill = {
  drillName: string;
  benchmarkType: "timed" | "rated" | null;
  results: BenchmarkRow[];
};

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PositionPill({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: "rgba(255,255,255,0.04)",
      }}
    >
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function SectionLabel({ label }: { label: string }) {
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
      {label}
    </Text>
  );
}

export default function PlayerDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<Player | null>(null);
  const [grouped, setGrouped] = useState<GroupedDrill[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;

    const [playerRes, benchRes] = await Promise.all([
      supabase
        .from("team_players")
        .select(
          "id, player_name, positions, jersey_number, status, notes"
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("benchmark_results")
        .select(
          "id, assessment_date, time_seconds, rating, tags, notes, team_drills(drill_name, benchmark_type)"
        )
        .eq("player_id", id)
        .order("assessment_date", { ascending: false }),
    ]);

    if (playerRes.data) {
      setPlayer({
        id: playerRes.data.id as string,
        name: playerRes.data.player_name as string,
        positions: (playerRes.data.positions as string[] | null) ?? [],
        jerseyNumber:
          (playerRes.data.jersey_number as string | null) ?? null,
        status: playerRes.data.status as "active" | "inactive",
        notes: (playerRes.data.notes as string | null) ?? null,
      });
    } else {
      setPlayer(null);
    }

    const rows: BenchmarkRow[] = (benchRes.data ?? []).map((b) => {
      const drill = Array.isArray(b.team_drills)
        ? b.team_drills[0]
        : b.team_drills;
      return {
        id: b.id as string,
        assessmentDate: b.assessment_date as string,
        timeSeconds: (b.time_seconds as number | null) ?? null,
        rating: (b.rating as number | null) ?? null,
        tags: ((b.tags as string[] | null) ?? []) as string[],
        notes: (b.notes as string | null) ?? null,
        drillName: (drill?.drill_name as string) ?? "Unknown drill",
        benchmarkType:
          (drill?.benchmark_type as "timed" | "rated" | null) ?? null,
      };
    });

    const groups: GroupedDrill[] = [];
    const idx = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.drillName}::${r.benchmarkType ?? ""}`;
      let i = idx.get(key);
      if (i === undefined) {
        i = groups.length;
        idx.set(key, i);
        groups.push({
          drillName: r.drillName,
          benchmarkType: r.benchmarkType,
          results: [],
        });
      }
      groups[i].results.push(r);
    }
    setGrouped(groups);
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

  const toggleStatus = async () => {
    if (!player) return;
    const next = player.status === "active" ? "inactive" : "active";
    const verb = next === "inactive" ? "Deactivate" : "Reactivate";
    Alert.alert(
      `${verb} player?`,
      next === "inactive"
        ? "They'll be moved to the inactive list. Their data is kept."
        : "They'll move back to the active roster.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: verb,
          style: next === "inactive" ? "destructive" : "default",
          onPress: async () => {
            setBusy(true);
            const { error } = await supabase
              .from("team_players")
              .update({ status: next })
              .eq("id", player.id);
            setBusy(false);
            if (error) {
              Alert.alert("Couldn't update player", error.message);
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
      <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
        <View
          style={{
            paddingTop: insets.top + spacing.lg,
            paddingHorizontal: spacing.xl,
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
                ? "rgba(255,255,255,0.08)"
                : "rgba(255,255,255,0.04)",
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
      </View>
    );
  }

  if (!player) {
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
          Player not found.
        </Text>
        <Button
          label="Back to Roster"
          onPress={() => router.back()}
          fullWidth={false}
          variant="secondary"
        />
      </View>
    );
  }

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
              ? "rgba(255,255,255,0.08)"
              : "rgba(255,255,255,0.04)",
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
        {/* Title row */}
        <View
          className="flex-row items-baseline flex-wrap"
          style={{ gap: spacing.md, marginTop: spacing.sm }}
        >
          <Text
            style={{
              fontSize: 24,
              lineHeight: 30,
              fontWeight: "500",
              color: colors.text.primary,
            }}
          >
            {player.name}
          </Text>
          {player.jerseyNumber ? (
            <Text
              style={{
                fontSize: 17,
                lineHeight: 24,
                color: colors.text.secondary,
                fontVariant: ["tabular-nums"],
              }}
            >
              #{player.jerseyNumber}
            </Text>
          ) : null}
        </View>

        {/* Status */}
        <Text
          style={{
            fontSize: 13,
            marginTop: spacing.sm,
            color:
              player.status === "active"
                ? colors.green[400]
                : colors.text.muted,
            fontWeight: "500",
          }}
        >
          {player.status === "active" ? "Active" : "Inactive"}
        </Text>

        {/* Positions */}
        {player.positions.length > 0 ? (
          <View
            className="flex-row flex-wrap items-center"
            style={{ gap: spacing.xs, marginTop: spacing.md }}
          >
            {player.positions.map((p) => (
              <PositionPill key={p} label={p} />
            ))}
          </View>
        ) : null}

        {/* Notes */}
        {player.notes ? (
          <View style={{ marginTop: spacing["2xl"] }}>
            <SectionLabel label="Notes" />
            <Text
              style={{
                fontSize: 15,
                lineHeight: 22,
                color: colors.text.secondary,
                marginTop: spacing.sm,
              }}
            >
              {player.notes}
            </Text>
          </View>
        ) : null}

        {/* Benchmark history */}
        <View style={{ marginTop: spacing["3xl"] }}>
          <SectionLabel label="Benchmark History" />
          {grouped.length === 0 ? (
            <View
              style={{
                marginTop: spacing.lg,
                padding: spacing["2xl"],
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.border.default,
                borderStyle: "dashed",
                alignItems: "center",
              }}
            >
              <Ionicons
                name="stopwatch-outline"
                size={24}
                color="rgba(255,255,255,0.20)"
                style={{ marginBottom: spacing.sm }}
              />
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 18,
                  color: colors.text.secondary,
                  textAlign: "center",
                }}
              >
                No assessments yet. Run a benchmark to see this player's
                results here.
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
              {grouped.map((g) => {
                const latest = g.results[0];
                const value =
                  g.benchmarkType === "timed" && latest.timeSeconds != null
                    ? `${Number(latest.timeSeconds).toFixed(2)}s`
                    : g.benchmarkType === "rated" && latest.rating != null
                    ? `${latest.rating}/5`
                    : latest.timeSeconds != null
                    ? `${Number(latest.timeSeconds).toFixed(2)}s`
                    : latest.rating != null
                    ? `${latest.rating}/5`
                    : "—";
                return (
                  <View
                    key={`${g.drillName}-${g.benchmarkType ?? ""}`}
                    style={{
                      padding: spacing.lg,
                      borderRadius: radius.lg,
                      backgroundColor: colors.surface.raised,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.14)",
                    }}
                  >
                    <View
                      className="flex-row items-start justify-between"
                      style={{ gap: spacing.md }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            fontSize: 15,
                            lineHeight: 22,
                            fontWeight: "500",
                            color: colors.text.primary,
                          }}
                        >
                          {g.drillName}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            lineHeight: 18,
                            color: colors.text.muted,
                            marginTop: spacing.xs,
                          }}
                        >
                          {formatDate(latest.assessmentDate)}
                          {g.results.length > 1
                            ? ` · ${g.results.length} results`
                            : ""}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 22,
                          lineHeight: 28,
                          fontWeight: "500",
                          color: colors.text.primary,
                          fontVariant: ["tabular-nums"],
                        }}
                      >
                        {value}
                      </Text>
                    </View>

                    {latest.tags.length > 0 ? (
                      <View
                        className="flex-row flex-wrap items-center"
                        style={{ gap: spacing.xs, marginTop: spacing.md }}
                      >
                        {latest.tags.map((t) => (
                          <PositionPill key={t} label={t} />
                        ))}
                      </View>
                    ) : null}

                    {latest.notes ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 13,
                          lineHeight: 18,
                          color: colors.text.muted,
                          marginTop: spacing.sm,
                        }}
                      >
                        {latest.notes}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={{ marginTop: spacing["3xl"], gap: spacing.md }}>
          <Button
            label="Edit Player"
            onPress={() => router.push(`/roster/${player.id}/edit` as never)}
            variant="secondary"
          />
          {player.status === "active" ? (
            <Button
              label={busy ? "Updating…" : "Deactivate Player"}
              onPress={toggleStatus}
              disabled={busy}
              variant="destructive"
            />
          ) : (
            <Button
              label={busy ? "Updating…" : "Reactivate Player"}
              onPress={toggleStatus}
              disabled={busy}
              variant="secondary"
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
