// Player Card (Build 18) — the roster detail, redesigned. Top: a grade hero
// (photo/physicals identity + overall grade + per-group chips + relative
// standing + mini-stats) so a captain reads "who + how good" at a glance. Below:
// skill profile, notes, observations, and a bridge into the full scouting
// detail (per-drill history / sessions / corrections live there, not duplicated
// here). Grade math comes from the SHARED graders (player-grade.ts) run on a
// per-player + cohort fetch — the same source the scouting report uses, so the
// card can't drift from it. Management actions (edit / injury / status) are
// canManage-gated. Conventions: ActionModal (never Alert.alert); TouchableOpacity
// static-style; bottom clearance.
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
import { Button } from "../../../../components/ui/Button";
import {
  ActionModal,
  useActionModal,
} from "../../../../components/ui/ActionModal";
import { Section, SectionLabel } from "../../../../components/ui/FormSection";
import { PlayerCardHero } from "../../../../components/roster/PlayerCardHero";
import {
  PlayerSkillProfileCard,
  type PlayerSkill,
} from "../../../../components/PlayerSkillProfileCard";
import {
  colors,
  fontWeight,
  radius,
  spacing,
  tracking,
} from "../../../../constants/design";
import { fontStyle, monoStyle } from "../../../../constants/typography";
import { resolveActorName } from "../../../../lib/activity";
import { playerColorForIndex, initialsFromName } from "../../../../lib/athlete";
import { supabase } from "../../../../lib/supabase";
import { useTeam } from "../../../../lib/team-context";
import {
  gradePlayerGroups,
  groupCompositesFromProfile,
  relativeStandingFor,
  type GroupScore,
  type RelativeStanding,
} from "../../../../lib/scouting/player-grade";
import {
  buildPlayerHistory,
  type BenchHistoryRow,
} from "../../../../lib/benchmarks/player-history";
import type { Grade } from "../../../../lib/dashboard/heat-scale";
import type { SkillGroup } from "../../../../constants/skill-groups";

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
  colorIndex: number | null;
  photoUrl: string | null;
  heightIn: number | null;
  weightLb: number | null;
};

type ObservationRow = {
  id: string;
  noteText: string;
  createdAt: string;
  practiceTitle: string | null;
};

// Grade evidence derived from the shared graders (matches the scouting report).
type GradeEvidence = {
  groupScores: GroupScore[];
  overallGrade: Grade | null;
  standing: RelativeStanding | null;
  benchmarkCount: number;
  pbCount: number;
  drillCount: number;
};

const EMPTY_GRADE: GradeEvidence = {
  groupScores: [],
  overallGrade: null,
  standing: null,
  benchmarkCount: 0,
  pbCount: 0,
  drillCount: 0,
};

function shortMonth(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// player_notes.created_at is a full timestamp.
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

  const { teamId, canManage } = useTeam();
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<Player | null>(null);
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [skillProfile, setSkillProfile] = useState<PlayerSkill[]>([]);
  const [grade, setGrade] = useState<GradeEvidence>(EMPTY_GRADE);
  const [busy, setBusy] = useState(false);
  const [addedByName, setAddedByName] = useState<string | null>(null);
  const [addedAt, setAddedAt] = useState<string | null>(null);
  const { show: showModal, showError, modalProps } = useActionModal();

  const load = useCallback(async () => {
    if (!id) return;

    // Resilient player select — degrade through migration drift (101 card cols →
    // 75 attribution → 45 color_index → 43 injury).
    const sel = (cols: string) =>
      supabase
        .from("team_players")
        .select(
          `id, player_name, positions, jersey_number, status, notes, is_captain${cols}`
        )
        .eq("id", id)
        .maybeSingle();

    const [playerRes, benchRes, notesRes, skillRes, cohortPlayersRes, cohortProfilesRes] =
      await Promise.all([
        (async () => {
          let res = await sel(
            ", created_by, created_at, is_injured, injury_note, color_index, photo_url, height_in, weight_lb"
          );
          if (res.error && /photo_url|height_in|weight_lb/i.test(res.error.message))
            res = await sel(", created_by, created_at, is_injured, injury_note, color_index");
          if (res.error && /created_by|created_at/i.test(res.error.message))
            res = await sel(", is_injured, injury_note, color_index");
          if (res.error && /color_index/i.test(res.error.message))
            res = await sel(", is_injured, injury_note");
          if (res.error && /is_injured|injury_note/i.test(res.error.message))
            res = await sel("");
          return res;
        })(),
        supabase
          .from("benchmark_results")
          .select(
            "id, assessment_date, time_seconds, rating, made_count, attempts_count, benchmark_type, drill_id, team_drills(id, drill_name, benchmark_type, benchmark_types)"
          )
          .eq("player_id", id)
          .order("assessment_date", { ascending: true }),
        supabase
          .from("player_notes")
          .select("id, note_text, created_at, practice_plans(title)")
          .eq("player_id", id)
          .order("created_at", { ascending: false }),
        // This player's skill profile (grade + skill-profile card).
        teamId
          ? supabase
              .from("v_player_skill_profile")
              .select(
                "skill_id, skill_name, skill_group, composite_score, drill_sample_size"
              )
              .eq("player_id", id)
              .eq("team_id", teamId)
          : Promise.resolve({ data: [], error: null }),
        // Cohort: every team player's positions (for room membership) …
        teamId
          ? supabase.from("team_players").select("id, positions").eq("team_id", teamId)
          : Promise.resolve({ data: [], error: null }),
        // … and the team's profile rows (for each cohort member's overall score).
        teamId
          ? supabase
              .from("v_player_skill_profile")
              .select("player_id, skill_group, composite_score")
              .eq("team_id", teamId)
          : Promise.resolve({ data: [], error: null }),
      ]);

    let positions: string[] = [];
    if (playerRes.data) {
      const raw = playerRes.data as unknown as Record<string, unknown>;
      positions = (raw.positions as string[] | null) ?? [];
      setPlayer({
        id: raw.id as string,
        name: raw.player_name as string,
        positions,
        jerseyNumber: (raw.jersey_number as string | null) ?? null,
        status: raw.status as "active" | "inactive",
        notes: (raw.notes as string | null) ?? null,
        injured: raw.is_injured === true,
        injuryNote: (raw.injury_note as string | null) ?? null,
        colorIndex: (raw.color_index as number | null) ?? null,
        isCaptain: raw.is_captain === true,
        photoUrl: (raw.photo_url as string | null) ?? null,
        heightIn: (raw.height_in as number | null) ?? null,
        weightLb: (raw.weight_lb as number | null) ?? null,
      });
      setAddedAt((raw.created_at as string | null) ?? null);
      resolveActorName((raw.created_by as string | null) ?? null).then(setAddedByName);
    } else {
      setPlayer(null);
    }

    // ── Grade evidence via the shared graders ────────────────────────────────
    type ProfileRow = {
      skill_id: string;
      skill_name: string;
      skill_group: SkillGroup;
      composite_score: number | null;
      drill_sample_size: number | null;
    };
    const profileRows = (skillRes.data as ProfileRow[] | null) ?? [];

    setSkillProfile(
      profileRows
        .filter((r) => r.composite_score != null)
        .map((r) => ({
          skillId: r.skill_id,
          skillName: r.skill_name,
          skillGroup: r.skill_group,
          composite: Number(r.composite_score),
          sampleSize: r.drill_sample_size ?? 0,
        }))
    );

    const { groupScores, overallGrade } = gradePlayerGroups(
      groupCompositesFromProfile(
        profileRows.map((r) => ({
          skill_group: r.skill_group,
          composite_score: r.composite_score,
        }))
      ),
      positions
    );

    const historyRows: BenchHistoryRow[] = ((benchRes.data ?? []) as Record<string, unknown>[]).map(
      (b) => ({
        id: b.id as string,
        assessment_date: b.assessment_date as string,
        time_seconds: (b.time_seconds as number | null) ?? null,
        rating: (b.rating as number | null) ?? null,
        made_count: (b.made_count as number | null) ?? null,
        attempts_count: (b.attempts_count as number | null) ?? null,
        benchmark_type: (b.benchmark_type as string | null) ?? null,
        drill_id: b.drill_id as string,
        team_drills: b.team_drills as BenchHistoryRow["team_drills"],
      })
    );
    const history = buildPlayerHistory(historyRows);

    // Cohort overall scores → relative standing (same grader, one source).
    const cohortProfileByPlayer = new Map<
      string,
      { skill_group: SkillGroup; composite_score: number | null }[]
    >();
    for (const r of (cohortProfilesRes.data as {
      player_id: string;
      skill_group: SkillGroup;
      composite_score: number | null;
    }[] | null) ?? []) {
      const arr = cohortProfileByPlayer.get(r.player_id) ?? [];
      arr.push({ skill_group: r.skill_group, composite_score: r.composite_score });
      cohortProfileByPlayer.set(r.player_id, arr);
    }
    const cohort = ((cohortPlayersRes.data as { id: string; positions: string[] | null }[] | null) ??
      []).map((pl) => ({
      playerId: pl.id,
      positions: pl.positions ?? [],
      overallScore: gradePlayerGroups(
        groupCompositesFromProfile(cohortProfileByPlayer.get(pl.id) ?? []),
        pl.positions ?? []
      ).overallScore,
    }));
    const standing = relativeStandingFor({ playerId: id, positions }, cohort);

    setGrade({
      groupScores,
      overallGrade,
      standing,
      benchmarkCount: history.benchmarkCount,
      pbCount: history.pbCount,
      drillCount: history.drills.length,
    });

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
  }, [id, teamId]);

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

  // ── Injury confirm modal (mirrors prior behavior) ──────────────────────────
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
        injury_note: nextInjured ? injuryNoteDraft.trim() || null : null,
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
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 18 }}>
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
              { fontSize: 14, color: colors.text.secondary, textAlign: "center" },
            ]}
          >
            Player not found.
          </Text>
        </View>
      </View>
    );
  }

  const accent = playerColorForIndex(player.colorIndex);
  const joinedLabel = addedAt ? `Joined ${shortMonth(addedAt)}` : null;

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
          gap: spacing.sm,
        }}
      >
        <BackButton onPress={() => router.back()} />
        <Text
          style={[
            monoStyle("bold"),
            { fontSize: 11, color: colors.orange[500], letterSpacing: tracking.loose },
          ]}
        >
          ROSTER · PLAYER
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 100,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <PlayerCardHero
          name={player.name}
          initials={initialsFromName(player.name)}
          jerseyNumber={player.jerseyNumber}
          positions={player.positions}
          status={player.status}
          isCaptain={player.isCaptain}
          injured={player.injured}
          injuryNote={player.injuryNote}
          accent={accent}
          photoUrl={player.photoUrl}
          heightIn={player.heightIn}
          weightLb={player.weightLb}
          addedByName={addedByName}
          addedAt={addedAt}
          joinedLabel={joinedLabel}
          overallGrade={grade.overallGrade}
          groupScores={grade.groupScores}
          standing={grade.standing}
          benchmarkCount={grade.benchmarkCount}
          pbCount={grade.pbCount}
          drillCount={grade.drillCount}
        />

        {/* Bridge into the full scouting detail (deep evidence lives there). */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push(`/benchmarks/player/${player.id}` as never)}
          accessibilityLabel="View full scouting"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: radius.lg,
            backgroundColor: colors.surface.raised,
            borderWidth: 1,
            borderColor: colors.border.card,
          }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: radius.md,
              backgroundColor: colors.orange.tint,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="analytics-outline" size={17} color={colors.orange[400]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[fontStyle("medium"), { fontSize: 14, color: colors.text.primary }]}>
              View full scouting
            </Text>
            <Text style={[fontStyle("regular"), { fontSize: 12, color: colors.text.muted, marginTop: 1 }]}>
              Per-drill history, trend, and sessions
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
        </TouchableOpacity>

        {/* Skill profile — its own card. */}
        <PlayerSkillProfileCard skills={skillProfile} playerName={player.name} />

        {/* Notes (free-text). */}
        {player.notes ? (
          <Section>
            <SectionLabel>Notes</SectionLabel>
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 14, lineHeight: 20, color: colors.text.primary },
              ]}
            >
              {player.notes}
            </Text>
          </Section>
        ) : null}

        {/* Observations — dated coaching notes (read-only; add lives on scouting). */}
        <Section>
          <SectionLabel>Observations</SectionLabel>
          {observations.length === 0 ? (
            <Text style={[fontStyle("regular"), { fontSize: 13, color: colors.text.muted }]}>
              No observations yet. Notes added when logging a practice show up here.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {observations.map((o) => (
                <View
                  key={o.id}
                  style={{
                    padding: 12,
                    borderRadius: radius.md,
                    backgroundColor: colors.surface.overlay,
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
                      { fontSize: 14, lineHeight: 20, color: colors.text.primary, marginTop: 6 },
                    ]}
                  >
                    {o.noteText}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        {/* Management actions — full-access only. */}
        {canManage && (
          <View style={{ paddingTop: 8, gap: 10 }}>
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
                  { fontSize: 15, fontWeight: fontWeight.bold, color: colors.text.primary, letterSpacing: 0.2 },
                ]}
              >
                Edit Player
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={openInjuryModal}
              disabled={busy}
              activeOpacity={0.85}
              accessibilityLabel={player.injured ? "Clear injury" : "Mark player as injured"}
              style={{
                height: 52,
                borderRadius: 14,
                backgroundColor: player.injured ? "rgba(255, 77, 77, 0.10)" : "transparent",
                borderWidth: 1,
                borderColor: player.injured ? "rgba(255, 77, 77, 0.45)" : colors.border.default,
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
                    color: player.injured ? colors.red.semantic : colors.text.primary,
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
                  player.status === "active" ? "rgba(255,77,77,0.30)" : colors.border.default,
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
                color={player.status === "active" ? colors.red.semantic : colors.text.primary}
              />
              <Text
                style={[
                  fontStyle("bold"),
                  {
                    fontSize: 14,
                    fontWeight: fontWeight.bold,
                    color: player.status === "active" ? colors.red.semantic : colors.text.primary,
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
        )}
      </ScrollView>

      {/* Mark-injured confirm — dark surface, optional injury note. */}
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
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
                <Ionicons name="medkit" size={18} color={colors.red.semantic} />
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
                <Text style={[fontStyle("bold"), { fontSize: 16, color: colors.text.primary, marginTop: 2 }]}>
                  {player.injured
                    ? `Clear ${player.name}'s injury?`
                    : `Mark ${player.name} as injured?`}
                </Text>
              </View>
            </View>

            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 13, lineHeight: 19, color: colors.text.secondary },
              ]}
            >
              {player.injured
                ? "They'll be flagged as available again. The injury note will be cleared."
                : "They'll show an INJURED badge on the roster. They stay on the active team and still appear in benchmarks and practice — this only flags availability."}
            </Text>

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
                  label={busy ? "Saving…" : player.injured ? "Clear" : "Mark injured"}
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
