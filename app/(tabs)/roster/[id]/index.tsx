import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AthleteHero } from "../../../../components/ui/AthleteHero";
import { Button } from "../../../../components/ui/Button";
import {
  ActionModal,
  useActionModal,
} from "../../../../components/ui/ActionModal";
import {
  colors,
  fontWeight,
  radius,
  spacing,
  tracking,
} from "../../../../constants/design";
import {
  POSITION_SIDE,
  POSITIONS,
  type Side,
  positionColor,
  positionTint,
  sideAccent,
} from "../../../../constants/positions";
import { fontStyle, MonoText } from "../../../../constants/typography";
import {
  playerColorForIndex,
  initialsFromName,
  splitFirstLast,
} from "../../../../lib/athlete";
import { supabase } from "../../../../lib/supabase";

type Player = {
  id: string;
  name: string;
  positions: string[];
  jerseyNumber: string | null;
  status: "active" | "inactive";
  notes: string | null;
  injured: boolean;
  injuryNote: string | null;
  isCaptain: boolean;
  // Per-player avatar color slot (migration 45). Null only when the DB
  // hasn't been migrated yet — helper falls back to muted in that case.
  colorIndex: number | null;
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

type ObservationRow = {
  id: string;
  noteText: string;
  createdAt: string;
  practiceTitle: string | null;
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

// player_notes.created_at is a full timestamp, not a plain date.
function formatStamp(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PlayerDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<Player | null>(null);
  const [grouped, setGrouped] = useState<GroupedDrill[]>([]);
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [busy, setBusy] = useState(false);
  // App-styled confirm/error modal (replaces native Alert.alert).
  const { show: showModal, showError, modalProps } = useActionModal();

  const load = useCallback(async () => {
    if (!id) return;

    // Try the richest projection first; degrade if migration 43
    // (injury) or 45 (color_index) isn't applied.
    const playerSelect = (withInjury: boolean, withColorIndex: boolean) =>
      supabase
        .from("team_players")
        .select(
          `id, player_name, positions, jersey_number, status, notes, is_captain${
            withInjury ? ", is_injured, injury_note" : ""
          }${withColorIndex ? ", color_index" : ""}`
        )
        .eq("id", id)
        .maybeSingle();
    const [playerResRaw, benchRes, notesRes] = await Promise.all([
      (async () => {
        let res = await playerSelect(true, true);
        if (res.error && /color_index/i.test(res.error.message)) {
          res = await playerSelect(true, false);
        }
        if (res.error && /is_injured|injury_note/i.test(res.error.message)) {
          res = await playerSelect(false, false);
        }
        return res;
      })(),
      supabase
        .from("benchmark_results")
        .select(
          "id, assessment_date, time_seconds, rating, tags, notes, team_drills(drill_name, benchmark_type)"
        )
        .eq("player_id", id)
        .order("assessment_date", { ascending: false }),
      // player_notes ships in migration 37 — tolerate it not being applied.
      supabase
        .from("player_notes")
        .select("id, note_text, created_at, practice_plans(title)")
        .eq("player_id", id)
        .order("created_at", { ascending: false }),
    ]);

    const playerRes = playerResRaw;
    if (playerRes.data) {
      const raw = playerRes.data as unknown as Record<string, unknown>;
      setPlayer({
        id: raw.id as string,
        name: raw.player_name as string,
        positions: (raw.positions as string[] | null) ?? [],
        jerseyNumber: (raw.jersey_number as string | null) ?? null,
        status: raw.status as "active" | "inactive",
        notes: (raw.notes as string | null) ?? null,
        injured: raw.is_injured === true,
        injuryNote: (raw.injury_note as string | null) ?? null,
        colorIndex: (raw.color_index as number | null) ?? null,
        isCaptain: raw.is_captain === true,
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

    const obs: ObservationRow[] = (
      (notesRes.data as Record<string, unknown>[] | null) ?? []
    ).map((n) => {
      const ppRaw = n.practice_plans;
      const pp = (Array.isArray(ppRaw) ? ppRaw[0] : ppRaw) as
        | { title: string | null }
        | null;
      return {
        id: n.id as string,
        noteText: n.note_text as string,
        createdAt: n.created_at as string,
        practiceTitle: pp?.title ?? null,
      };
    });
    setObservations(obs);
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

  // Mark-injured confirm modal — replaces the native iOS Alert so it
  // matches the rest of the app's dark + orange design language. Also
  // hosts an optional injury note input so coaches can capture context
  // ("ankle, ~2 weeks") inline instead of needing a separate edit step.
  const [injuryModalOpen, setInjuryModalOpen] = useState(false);
  const [injuryNoteDraft, setInjuryNoteDraft] = useState("");

  const openInjuryModal = () => {
    if (!player) return;
    setInjuryNoteDraft(player.injuryNote ?? "");
    setInjuryModalOpen(true);
  };

  const applyInjuryChange = async (nextInjured: boolean) => {
    if (!player) return;
    setBusy(true);
    const { error } = await supabase
      .from("team_players")
      .update({
        is_injured: nextInjured,
        // Clearing the flag also clears the injury note so the next
        // injury starts fresh.
        injury_note: nextInjured
          ? injuryNoteDraft.trim() || null
          : null,
      })
      .eq("id", player.id);
    setBusy(false);
    setInjuryModalOpen(false);
    if (error) {
      showError(
        "Couldn't update player",
        /is_injured|injury_note/i.test(error.message)
          ? "Database is missing the injury columns. Apply migration 43."
          : error.message
      );
      return;
    }
    await load();
  };

  const toggleStatus = () => {
    if (!player) return;
    const next = player.status === "active" ? "inactive" : "active";
    const verb = next === "inactive" ? "Deactivate" : "Reactivate";
    showModal({
      title: `${verb} player?`,
      message:
        next === "inactive"
          ? "They'll be moved to the inactive list. Their data is kept."
          : "They'll move back to the active roster.",
      actions: [
        {
          label: verb,
          variant: next === "inactive" ? "destructive" : "primary",
          onPress: async () => {
            setBusy(true);
            const { error } = await supabase
              .from("team_players")
              .update({ status: next })
              .eq("id", player.id);
            setBusy(false);
            if (error) {
              showError("Couldn't update player", error.message);
              return;
            }
            await load();
          },
        },
      ],
    });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
        <View
          style={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 18,
          }}
        >
          <BackButton onPress={() => router.back()} />
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
          paddingTop: insets.top + 16,
        }}
      >
        <View style={{ paddingHorizontal: 18, paddingBottom: 12 }}>
          <BackButton onPress={() => router.back()} />
        </View>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 20,
          }}
        >
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 14,
                color: colors.text.secondary,
                textAlign: "center",
              },
            ]}
          >
            Player not found.
          </Text>
        </View>
      </View>
    );
  }

  const { first, last } = splitFirstLast(player.name);
  const initials = initialsFromName(player.name);
  const primary = player.positions[0] ?? null;
  const secondary = player.positions.slice(1, 3);
  const side: Side | null = primary ? POSITION_SIDE[primary] ?? null : null;
  // Per-player identity color, slot assigned by migration 45. Same hue
  // the SUN ROLL avatars, streak rows, roster list, and benchmark queue
  // use for this player.
  const accent = playerColorForIndex(player.colorIndex);

  const statusEyebrow = player.injured
    ? {
        label: player.isCaptain ? "Injured · Captain" : "Injured",
        color: colors.red.semantic,
      }
    : player.isCaptain
    ? { label: "Captain", color: colors.orange[500] }
    : player.status === "active"
    ? { label: "Active", color: colors.green[400] }
    : { label: "Inactive", color: colors.text.muted };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: 18,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <BackButton onPress={() => router.back()} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <MonoText
            weight="bold"
            style={{
              fontSize: 11,
              fontWeight: fontWeight.bold,
              color: colors.orange[500],
              letterSpacing: tracking.loose,
            }}
          >
            .03
          </MonoText>
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 11,
                fontWeight: fontWeight.bold,
                color: colors.text.secondary,
                letterSpacing: tracking.loose,
                textTransform: "uppercase",
              },
            ]}
          >
            ROSTER · VIEW
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={{ paddingHorizontal: 16 }}>
          <AthleteHero
            initials={initials}
            fullName={player.name}
            jersey={player.jerseyNumber ?? ""}
            accent={accent}
            side={side}
            primary={primary}
            secondary={secondary}
            eyebrow={statusEyebrow}
          />
        </View>

        {/* 01 Identity (read-only) */}
        <Section idx="01" title="Identity">
          <View style={{ flexDirection: "row", gap: 10 }}>
            <ReadField
              label="First name"
              value={first || "—"}
              style={{ flex: 1 }}
            />
            <ReadField
              label="Last name"
              value={last || "—"}
              style={{ flex: 1 }}
            />
          </View>
          <View style={{ marginTop: 14 }}>
            <ReadField
              label="Jersey #"
              value={player.jerseyNumber ? `#${player.jerseyNumber}` : "—"}
              mono
              style={{ width: 120 }}
            />
          </View>
        </Section>

        {/* 02 Position (read-only) */}
        <Section
          idx="02"
          title="Position"
          sub={primary ? "Primary first — drives drill targeting." : undefined}
        >
          {player.positions.length === 0 ? (
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 13, color: colors.text.muted },
              ]}
            >
              No positions assigned.
            </Text>
          ) : (
            <View style={{ gap: 12 }}>
              <PositionGroupRead
                sideLabel="OFFENSE"
                side="offense"
                positions={POSITIONS.offense.map((p) => p.id)}
                primary={primary}
                secondary={secondary}
              />
              <PositionGroupRead
                sideLabel="DEFENSE"
                side="defense"
                positions={POSITIONS.defense.map((p) => p.id)}
                primary={primary}
                secondary={secondary}
              />
            </View>
          )}
        </Section>

        {/* 03 Notes (read-only) */}
        <Section idx="03" title="Notes" optional>
          {player.notes ? (
            <Text
              style={[
                fontStyle("regular"),
                {
                  fontSize: 14,
                  lineHeight: 20,
                  color: colors.text.primary,
                  padding: 14,
                  borderRadius: radius.input,
                  borderWidth: 1,
                  borderColor: colors.border.card,
                  backgroundColor: colors.surface.input,
                },
              ]}
            >
              {player.notes}
            </Text>
          ) : (
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 13, color: colors.text.muted },
              ]}
            >
              No notes added.
            </Text>
          )}
        </Section>

        {/* 04 Observations — dated coaching notes */}
        <Section idx="04" title="Observations" optional>
          {observations.length === 0 ? (
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 13, color: colors.text.muted },
              ]}
            >
              No observations yet. Notes added when logging a practice show up
              here.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {observations.map((o) => (
                <View
                  key={o.id}
                  style={{
                    padding: 14,
                    borderRadius: radius.xl,
                    backgroundColor: colors.surface.raised,
                    borderWidth: 1,
                    borderColor: colors.border.subtle,
                  }}
                >
                  <Text
                    style={[
                      fontStyle("medium"),
                      {
                        fontSize: 11,
                        color: colors.orange[500],
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                      },
                    ]}
                  >
                    {formatStamp(o.createdAt)}
                    {o.practiceTitle ? ` · ${o.practiceTitle}` : ""}
                  </Text>
                  <Text
                    style={[
                      fontStyle("regular"),
                      {
                        fontSize: 14,
                        lineHeight: 20,
                        color: colors.text.primary,
                        marginTop: 6,
                      },
                    ]}
                  >
                    {o.noteText}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        {/* Benchmark history */}
        <Section idx="05" title="Benchmark History">
          {grouped.length === 0 ? (
            <View
              style={{
                padding: 24,
                borderRadius: radius.xl,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: colors.border.default,
                alignItems: "center",
              }}
            >
              <Ionicons
                name="stopwatch-outline"
                size={24}
                color={colors.text.muted}
                style={{ marginBottom: 8 }}
              />
              <Text
                style={[
                  fontStyle("regular"),
                  {
                    fontSize: 13,
                    lineHeight: 18,
                    color: colors.text.secondary,
                    textAlign: "center",
                  },
                ]}
              >
                No assessments yet. Run a benchmark to see this player's results here.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
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
                      padding: 14,
                      borderRadius: radius.xl,
                      backgroundColor: colors.surface.raised,
                      borderWidth: 1,
                      borderColor: colors.border.subtle,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={[
                            fontStyle("bold"),
                            {
                              fontSize: 15,
                              fontWeight: fontWeight.bold,
                              color: colors.text.primary,
                              letterSpacing: -0.2,
                            },
                          ]}
                        >
                          {g.drillName}
                        </Text>
                        <Text
                          style={[
                            fontStyle("regular"),
                            {
                              fontSize: 12,
                              color: colors.text.muted,
                              marginTop: 4,
                            },
                          ]}
                        >
                          {formatDate(latest.assessmentDate)}
                          {g.results.length > 1
                            ? ` · ${g.results.length} results`
                            : ""}
                        </Text>
                      </View>
                      <MonoText
                        weight="bold"
                        style={{
                          fontSize: 20,
                          fontWeight: fontWeight.bold,
                          color: colors.text.primary,
                          letterSpacing: -0.4,
                        }}
                      >
                        {value}
                      </MonoText>
                    </View>
                    {latest.tags.length > 0 ? (
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 4,
                          marginTop: 10,
                        }}
                      >
                        {latest.tags.map((t) => (
                          <View
                            key={t}
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: radius.pill,
                              backgroundColor: colors.surface.overlay,
                            }}
                          >
                            <Text
                              style={[
                                fontStyle("medium"),
                                {
                                  fontSize: 10,
                                  color: colors.text.secondary,
                                  letterSpacing: 0.4,
                                  textTransform: "uppercase",
                                },
                              ]}
                            >
                              {t}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {latest.notes ? (
                      <Text
                        numberOfLines={2}
                        style={[
                          fontStyle("regular"),
                          {
                            fontSize: 12,
                            lineHeight: 17,
                            color: colors.text.muted,
                            marginTop: 8,
                          },
                        ]}
                      >
                        {latest.notes}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </Section>

        {/* Action buttons */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 28,
            gap: 10,
          }}
        >
          <TouchableOpacity
            onPress={() => router.push(`/roster/${player.id}/edit` as never)}
            activeOpacity={0.9}
            accessibilityLabel="Edit player"
            style={{
              height: 52,
              borderRadius: 14,
              backgroundColor: colors.orange[500],
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
              shadowColor: colors.orange[500],
              shadowOpacity: 0.35,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
            }}
          >
            <Ionicons name="pencil" size={14} color={colors.text.primary} />
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 15,
                  fontWeight: fontWeight.bold,
                  color: colors.text.primary,
                  letterSpacing: 0.2,
                },
              ]}
            >
              Edit Player
            </Text>
          </TouchableOpacity>
          {/* Mark injured / clear injury — sits between Edit and the
              destructive Deactivate so the most-used action is closer to
              the primary CTA. */}
          <TouchableOpacity
            onPress={openInjuryModal}
            disabled={busy}
            activeOpacity={0.85}
            accessibilityLabel={
              player.injured ? "Clear injury" : "Mark player as injured"
            }
            style={{
              height: 52,
              borderRadius: 14,
              backgroundColor: player.injured
                ? "rgba(255, 77, 77, 0.10)"
                : "transparent",
              borderWidth: 1,
              borderColor: player.injured
                ? "rgba(255, 77, 77, 0.45)"
                : colors.border.default,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Ionicons
              name={player.injured ? "medkit" : "medkit-outline"}
              size={14}
              color={player.injured ? colors.red.semantic : colors.text.primary}
            />
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 14,
                  fontWeight: fontWeight.bold,
                  color: player.injured
                    ? colors.red.semantic
                    : colors.text.primary,
                  letterSpacing: 0.2,
                },
              ]}
            >
              {player.injured ? "Clear injury" : "Mark injured"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={toggleStatus}
            disabled={busy}
            activeOpacity={0.85}
            accessibilityLabel={
              player.status === "active" ? "Deactivate player" : "Reactivate player"
            }
            style={{
              height: 52,
              borderRadius: 14,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor:
                player.status === "active"
                  ? "rgba(255,77,77,0.30)"
                  : colors.border.default,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Ionicons
              name={player.status === "active" ? "remove-circle-outline" : "refresh-outline"}
              size={14}
              color={
                player.status === "active"
                  ? colors.red.semantic
                  : colors.text.primary
              }
            />
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 14,
                  fontWeight: fontWeight.bold,
                  color:
                    player.status === "active"
                      ? colors.red.semantic
                      : colors.text.primary,
                  letterSpacing: 0.2,
                },
              ]}
            >
              {busy
                ? "Updating…"
                : player.status === "active"
                ? "Deactivate Player"
                : "Reactivate Player"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Mark-injured confirm — replaces the native Alert. Dark surface,
          orange/red accents, lets the coach attach an optional injury
          note in the same step (e.g. "ankle, ~2 weeks"). */}
      <Modal
        visible={injuryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setInjuryModalOpen(false)}
      >
        <Pressable
          onPress={() => setInjuryModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            paddingHorizontal: spacing.xl,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surface.raised,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border.card,
              borderTopWidth: 2,
              borderTopColor: colors.red.semantic,
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            {/* Eyebrow + icon */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "rgba(255, 77, 77, 0.14)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="medkit"
                  size={18}
                  color={colors.red.semantic}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    fontStyle("bold"),
                    {
                      fontSize: 10,
                      color: colors.red.semantic,
                      letterSpacing: tracking.loose,
                      textTransform: "uppercase",
                    },
                  ]}
                >
                  {player.injured ? "CLEAR INJURY" : "MARK INJURED"}
                </Text>
                <Text
                  style={[
                    fontStyle("bold"),
                    {
                      fontSize: 16,
                      color: colors.text.primary,
                      marginTop: 2,
                    },
                  ]}
                >
                  {player.injured
                    ? `Clear ${player.name}'s injury?`
                    : `Mark ${player.name} as injured?`}
                </Text>
              </View>
            </View>

            <Text
              style={[
                fontStyle("regular"),
                {
                  fontSize: 13,
                  lineHeight: 19,
                  color: colors.text.secondary,
                },
              ]}
            >
              {player.injured
                ? "They'll be flagged as available again. The injury note will be cleared."
                : "They'll show an INJURED badge on the roster. They stay on the active team and still appear in benchmarks and practice — this only flags availability."}
            </Text>

            {/* Injury note input — only shown when marking, not clearing. */}
            {!player.injured ? (
              <View style={{ gap: 6 }}>
                <Text
                  style={[
                    fontStyle("bold"),
                    {
                      fontSize: 10,
                      letterSpacing: 1.4,
                      textTransform: "uppercase",
                      color: colors.text.muted,
                    },
                  ]}
                >
                  Injury note · optional
                </Text>
                <TextInput
                  value={injuryNoteDraft}
                  onChangeText={setInjuryNoteDraft}
                  placeholder="e.g. ankle, ~2 weeks"
                  placeholderTextColor={colors.text.muted}
                  autoFocus
                  style={[
                    fontStyle("regular"),
                    {
                      backgroundColor: colors.surface.input,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: colors.border.subtle,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm + 2,
                      color: colors.text.primary,
                      fontSize: 14,
                    },
                  ]}
                />
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setInjuryModalOpen(false)}
                  disabled={busy}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={
                    busy
                      ? "Saving…"
                      : player.injured
                      ? "Clear"
                      : "Mark injured"
                  }
                  variant="destructive"
                  onPress={() => applyInjuryChange(!player.injured)}
                  disabled={busy}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ActionModal {...modalProps} />
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel="Back"
      hitSlop={10}
      activeOpacity={0.7}
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.04)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="chevron-back" size={18} color={colors.text.primary} />
    </TouchableOpacity>
  );
}

function Section({
  idx,
  title,
  sub,
  optional,
  children,
}: {
  idx: string;
  title: string;
  sub?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 24 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          gap: 10,
          marginBottom: sub ? 4 : 14,
        }}
      >
        <MonoText
          weight="bold"
          style={{
            fontSize: 11,
            fontWeight: fontWeight.bold,
            color: colors.orange[500],
            letterSpacing: 0.4,
          }}
        >
          {idx}
        </MonoText>
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 16,
              fontWeight: fontWeight.bold,
              color: colors.text.primary,
              letterSpacing: -0.2,
            },
          ]}
        >
          {title}
        </Text>
        {optional ? (
          <MonoText
            weight="medium"
            style={{
              fontSize: 10,
              color: colors.text.muted,
              marginLeft: 4,
              letterSpacing: tracking.loose,
            }}
          >
            OPTIONAL
          </MonoText>
        ) : null}
      </View>
      {sub ? (
        <Text
          style={[
            fontStyle("regular"),
            {
              fontSize: 12,
              color: colors.text.secondary,
              marginBottom: 14,
              marginLeft: 22,
            },
          ]}
        >
          {sub}
        </Text>
      ) : null}
      <View>{children}</View>
    </View>
  );
}

function ReadField({
  label,
  value,
  mono,
  style,
}: {
  label: string;
  value: string;
  mono?: boolean;
  style?: object;
}) {
  return (
    <View style={style}>
      <Text
        style={[
          fontStyle("medium"),
          {
            fontSize: 11,
            color: colors.text.label,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            marginBottom: 8,
            fontWeight: fontWeight.medium,
          },
        ]}
      >
        {label}
      </Text>
      <View
        style={{
          minHeight: 46,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: radius.input,
          borderWidth: 1,
          borderColor: colors.border.subtle,
          backgroundColor: colors.surface.raised,
          justifyContent: "center",
        }}
      >
        <Text
          style={[
            mono ? { fontFamily: "JetBrainsMono_500Medium" } : fontStyle("regular"),
            {
              fontSize: 15,
              lineHeight: 20,
              color: colors.text.primary,
            },
          ]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function PositionGroupRead({
  sideLabel,
  side,
  positions,
  primary,
  secondary,
}: {
  sideLabel: string;
  side: Side;
  positions: string[];
  primary: string | null;
  secondary: string[];
}) {
  // Filter to only show positions selected on this side
  const sidePrimary =
    primary && POSITION_SIDE[primary] === side ? primary : null;
  const sideSecondary = secondary.filter((p) => POSITION_SIDE[p] === side);

  if (!sidePrimary && sideSecondary.length === 0) return null;

  return (
    <View>
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 10,
            fontWeight: fontWeight.bold,
            color: side === "offense" ? colors.orange[500] : colors.red.semantic,
            letterSpacing: tracking.loose,
            textTransform: "uppercase",
            marginBottom: 8,
            opacity: 0.85,
          },
        ]}
      >
        {sideLabel}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {positions
          .filter((p) => p === sidePrimary || sideSecondary.includes(p))
          .map((id) => {
            const isPrimary = id === sidePrimary;
            const accent = positionColor(id);
            return (
              <View
                key={id}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: isPrimary ? positionTint(id) : "transparent",
                  borderWidth: 1,
                  borderColor: accent,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {isPrimary ? (
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 2.5,
                      backgroundColor: accent,
                    }}
                  />
                ) : null}
                <Text
                  style={[
                    fontStyle("bold"),
                    {
                      fontSize: 13,
                      fontWeight: fontWeight.bold,
                      color: accent,
                      letterSpacing: 0.1,
                    },
                  ]}
                >
                  {id}
                </Text>
              </View>
            );
          })}
      </View>
    </View>
  );
}
