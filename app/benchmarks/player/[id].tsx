// Full-screen player scouting detail (Build 17). Re-resolves its card from the
// lean loader (the card carries all pre-loaded evidence — no extra fetch). Read
// sections: verdict, group grades, most-tagged, skill profile, trend, per-drill
// history, observations. Captain-only write paths: inline result-correction +
// add observation. Conventions: ActionModal (never Alert.alert); TouchableOpacity
// static-style; bottom clearance insets.bottom + 60; tokens only.
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing } from "../../../constants/design";
import { fontStyle, monoStyle } from "../../../constants/typography";
import { POSITION_SIDE } from "../../../constants/positions";
import { useTeam } from "../../../lib/team-context";
import {
  loadTeamScouting,
  type EditableResult,
  type PlayerReportCard,
} from "../../../lib/scouting/team-scouting-data";
import { addBenchmarkSet, correctBenchmarkResult } from "../../../lib/benchmarks";
import type { BenchmarkType } from "../../../constants/benchmarks";
import { addPlayerNote } from "../../../lib/player-notes";
import { GroupGradesRow } from "../../../components/scouting/GroupGradesRow";
import { AthleteHero } from "../../../components/ui/AthleteHero";
import { PlayerSkillProfileCard } from "../../../components/PlayerSkillProfileCard";
import { Section, SectionLabel } from "../../../components/ui/FormSection";
import { SheetContainer } from "../../../components/ui/Sheet";
import { ActionModal, useActionModal } from "../../../components/ui/ActionModal";

function valueLabel(r: EditableResult): string {
  switch (r.benchmarkType) {
    case "rated":
      return r.rating != null ? `${r.rating}/5` : "—";
    case "timed":
      return r.timeSeconds != null ? `${r.timeSeconds}s` : "—";
    case "pct":
      return r.madeCount != null && r.attemptsCount
        ? `${Math.round((r.madeCount / r.attemptsCount) * 100)}%`
        : "—";
    default:
      return r.madeCount != null ? String(r.madeCount) : "—";
  }
}

// Direction-aware "best rep" across a drill's reps (timed = lower is better).
function repScore(r: EditableResult): number | null {
  switch (r.benchmarkType) {
    case "rated":
      return r.rating;
    case "timed":
      return r.timeSeconds;
    case "pct":
      return r.madeCount != null && r.attemptsCount ? r.madeCount / r.attemptsCount : null;
    default:
      return r.madeCount;
  }
}
function bestResult(results: EditableResult[]): EditableResult | null {
  const lowerBetter = results[0]?.benchmarkType === "timed";
  let best: EditableResult | null = null;
  let bestScore = 0;
  for (const r of results) {
    const s = repScore(r);
    if (s == null) continue;
    if (best == null || (lowerBetter ? s < bestScore : s > bestScore)) {
      best = r;
      bestScore = s;
    }
  }
  return best;
}

const TYPE_LABEL: Record<string, string> = { rated: "RATED", timed: "TIMED", pct: "PCT", count: "COUNT" };
function TypeChip({ type }: { type: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: radius.md,
        backgroundColor: colors.surface.input,
        borderWidth: 1,
        borderColor: colors.border.subtle,
      }}
    >
      <Text style={[monoStyle("medium"), { fontSize: 9.5, letterSpacing: 0.6, color: colors.text.muted }]}>
        {TYPE_LABEL[type] ?? type.toUpperCase()}
      </Text>
    </View>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatSessionDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}`;
}

function NumField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.text.muted}
      keyboardType="numeric"
      style={[
        fontStyle("medium"),
        {
          minWidth: 64,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: radius.input,
          backgroundColor: colors.surface.input,
          borderWidth: 1,
          borderColor: colors.border.default,
          color: colors.text.primary,
          fontSize: 14,
        },
      ]}
    />
  );
}

function CorrectRow({
  result,
  repLabel,
  isBest = false,
  teamId,
  onSaved,
  onError,
}: {
  result: EditableResult;
  repLabel: string;
  isBest?: boolean;
  teamId: string;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rating, setRating] = useState<number | null>(result.rating);
  const [timeStr, setTimeStr] = useState(result.timeSeconds != null ? String(result.timeSeconds) : "");
  const [madeStr, setMadeStr] = useState(result.madeCount != null ? String(result.madeCount) : "");
  const [attemptsStr, setAttemptsStr] = useState(
    result.attemptsCount != null ? String(result.attemptsCount) : ""
  );
  const [countStr, setCountStr] = useState(result.madeCount != null ? String(result.madeCount) : "");

  const type = result.benchmarkType;

  const save = async () => {
    setSaving(true);
    let patch: Parameters<typeof correctBenchmarkResult>[0];
    if (type === "rated") {
      patch = { resultId: result.id, teamId, rating };
    } else if (type === "timed") {
      patch = { resultId: result.id, teamId, timeSeconds: timeStr ? parseFloat(timeStr) : null };
    } else if (type === "pct") {
      patch = {
        resultId: result.id,
        teamId,
        madeCount: madeStr ? parseInt(madeStr, 10) : null,
        attemptsCount: attemptsStr ? parseInt(attemptsStr, 10) : null,
      };
    } else {
      patch = { resultId: result.id, teamId, madeCount: countStr ? parseInt(countStr, 10) : null };
    }
    const res = await correctBenchmarkResult(patch);
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      onSaved();
    } else {
      onError(res.error);
    }
  };

  return (
    <View
      style={{
        paddingVertical: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.border.subtle,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text style={[monoStyle("medium"), { fontSize: 11.5, letterSpacing: 0.3, color: colors.text.muted }]}>
          {repLabel}
        </Text>
        {!editing ? (
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing.sm }}>
            {isBest ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.lime[400] }} />
                <Text style={[monoStyle("medium"), { fontSize: 9.5, letterSpacing: 0.5, color: colors.lime[400] }]}>
                  BEST
                </Text>
              </View>
            ) : null}
            <Text
              style={[
                monoStyle("medium"),
                { fontSize: 14, color: isBest ? colors.text.primary : colors.text.secondary },
              ]}
            >
              {valueLabel(result)}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setEditing(true)}
              hitSlop={10}
              style={{ width: 30, height: 30, alignItems: "center", justifyContent: "center", marginRight: -6 }}
            >
              <Ionicons name="pencil" size={14} color={colors.text.muted} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
      </View>

      {editing ? (
        <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
          {type === "rated" ? (
            <View style={{ flexDirection: "row", gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = rating === n;
                return (
                  <TouchableOpacity
                    key={n}
                    activeOpacity={0.8}
                    onPress={() => setRating(n)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: radius.md,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: on ? colors.orange.tint : colors.surface.input,
                      borderWidth: 1,
                      borderColor: on ? colors.orange.tintBorder : colors.border.default,
                    }}
                  >
                    <Text
                      style={[
                        fontStyle("bold"),
                        { fontSize: 15, color: on ? colors.orange[400] : colors.text.secondary },
                      ]}
                    >
                      {n}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : type === "timed" ? (
            <NumField value={timeStr} onChange={setTimeStr} placeholder="seconds" />
          ) : type === "pct" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <NumField value={madeStr} onChange={setMadeStr} placeholder="made" />
              <Text style={[fontStyle(), { color: colors.text.muted }]}>/</Text>
              <NumField value={attemptsStr} onChange={setAttemptsStr} placeholder="attempts" />
            </View>
          ) : (
            <NumField value={countStr} onChange={setCountStr} placeholder="count" />
          )}

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={saving}
              onPress={save}
              style={{
                paddingHorizontal: spacing.lg,
                paddingVertical: 9,
                borderRadius: radius.pill,
                backgroundColor: colors.orange[500],
                opacity: saving ? 0.6 : 1,
              }}
            >
              <Text style={[fontStyle("medium"), { fontSize: 13, color: colors.text.onBrand }]}>
                {saving ? "Saving…" : "Save"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setEditing(false)}
              style={{ paddingHorizontal: spacing.lg, paddingVertical: 9 }}
            >
              <Text style={[fontStyle("medium"), { fontSize: 13, color: colors.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// Per-drill history rows. Extracted so the capped inline preview and the
// "view all" sheet render identical markup (DRY — one source of truth).
function HistoryDrillRow({ d }: { d: PlayerReportCard["historyDrills"][number] }) {
  const last = d.samples[d.samples.length - 1];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={[fontStyle("medium"), { fontSize: 13, color: colors.text.primary, flex: 1 }]} numberOfLines={1}>
        {d.drillName}
      </Text>
      <Text style={[monoStyle("medium"), { fontSize: 12.5, color: colors.text.secondary }]}>
        {last ? `${last.label}${d.unit}` : "—"} · {d.samples.length}×
      </Text>
    </View>
  );
}

function HistoryLockedRow({ l }: { l: PlayerReportCard["historyLocked"][number] }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={[fontStyle(), { fontSize: 12.5, color: colors.text.muted, flex: 1 }]} numberOfLines={1}>
        {l.drillName}
      </Text>
      <Text style={[fontStyle(), { fontSize: 11, color: colors.text.muted }]}>
        {l.benchmarkType} · locked
      </Text>
    </View>
  );
}

const HISTORY_PREVIEW = 6;

export default function PlayerScoutDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { teamId, canManage } = useTeam();
  const { showError, modalProps } = useActionModal();

  const [card, setCard] = useState<PlayerReportCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addingDrill, setAddingDrill] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId || !id) return;
    setLoading(true);
    try {
      const d = await loadTeamScouting(teamId);
      setCard(d.playerCards.find((c) => c.playerId === id) ?? null);
    } finally {
      setLoading(false);
    }
  }, [teamId, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const submitNote = async () => {
    if (!teamId || !card) return;
    const text = noteDraft.trim();
    if (!text) return;
    setSavingNote(true);
    const res = await addPlayerNote({ teamId, playerId: card.playerId, noteText: text });
    setSavingNote(false);
    if (res.ok) {
      setNoteDraft("");
      load();
    } else {
      showError("Couldn't add note", res.error);
    }
  };

  if (loading && !card) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface.base, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.orange[400]} />
      </View>
    );
  }

  if (!card) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface.base, alignItems: "center", justifyContent: "center", gap: spacing.md }}>
        <Text style={[fontStyle("medium"), { color: colors.text.secondary }]}>Player not found.</Text>
        <TouchableOpacity activeOpacity={0.7} onPress={() => router.back()}>
          <Text style={[fontStyle("medium"), { color: colors.orange[400] }]}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const side = card.primaryPosition ? POSITION_SIDE[card.primaryPosition] ?? null : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.sm,
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
        }}
      >
        <TouchableOpacity activeOpacity={0.7} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.text.secondary} />
        </TouchableOpacity>
        <Text style={[monoStyle("bold"), { fontSize: 11, color: colors.orange[500], letterSpacing: 0.4 }]}>
          SCOUTING · PLAYER
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + 60,
          gap: spacing.lg,
        }}
      >
        <AthleteHero
          initials={card.initials}
          fullName={card.name}
          jersey=""
          accent={card.color}
          side={side}
          primary={card.primaryPosition}
          secondary={card.positions.slice(1)}
          eyebrow={{ label: card.verdict.roleRead, color: colors.orange[400] }}
        />

        {/* Verdict */}
        <Section>
          <SectionLabel>The read</SectionLabel>
          <Text style={[fontStyle(), { fontSize: 14, color: colors.text.primary, lineHeight: 21, marginTop: 6 }]}>
            {card.verdict.headline}
          </Text>
          {canManage && card.verdict.gapSkillId ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push("/practice/new" as never)}
              style={{
                alignSelf: "flex-start",
                marginTop: spacing.md,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: spacing.lg,
                paddingVertical: 9,
                borderRadius: radius.pill,
                backgroundColor: colors.orange.tint,
                borderWidth: 1,
                borderColor: colors.orange.tintBorder,
              }}
            >
              <Ionicons name="clipboard-outline" size={14} color={colors.orange[400]} />
              <Text style={[fontStyle("medium"), { fontSize: 13, color: colors.orange[400] }]}>
                {card.verdict.ctaLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </Section>

        {/* Group grades */}
        {card.groupScores.length ? (
          <Section>
            <SectionLabel>Skill areas</SectionLabel>
            <View style={{ marginTop: 6 }}>
              <GroupGradesRow groups={card.groupScores} />
            </View>
          </Section>
        ) : null}

        {/* Most tagged */}
        {card.recentTags.length ? (
          <Section>
            <SectionLabel>Most tagged</SectionLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {card.recentTags.slice(0, 6).map((t) => (
                <View
                  key={t.tag}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: spacing.md,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: colors.surface.overlay,
                  }}
                >
                  <Text style={[fontStyle("medium"), { fontSize: 12, color: colors.text.secondary }]}>
                    {t.tag}
                  </Text>
                  <Text style={[monoStyle("bold"), { fontSize: 11, color: colors.text.muted }]}>{t.count}</Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {/* Skill profile (reused component) */}
        <PlayerSkillProfileCard skills={card.skillProfile} playerName={card.name} />

        {/* Skill-group trend */}
        {card.skillGroupTrend.hasSignal ? (
          <Section>
            <SectionLabel>Skill-area trend</SectionLabel>
            <View style={{ gap: spacing.sm, marginTop: 6 }}>
              {card.skillGroupTrend.series.map((s) => {
                const latest = s.points[s.points.length - 1]?.score ?? null;
                return (
                  <View
                    key={s.group}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
                      <Text style={[fontStyle("medium"), { fontSize: 13, color: colors.text.primary }]}>
                        {s.label}
                      </Text>
                    </View>
                    <Text style={[monoStyle("medium"), { fontSize: 12.5, color: colors.text.secondary }]}>
                      {latest != null ? `${(latest * 5).toFixed(1)}/5` : "—"} · {s.points.length} wk
                    </Text>
                  </View>
                );
              })}
            </View>
          </Section>
        ) : null}

        {/* Per-drill history — capped preview; full list opens in a sheet so a
            deep roster of drills doesn't bury the rest of the page. */}
        {card.historyDrills.length || card.historyLocked.length ? (
          (() => {
            const totalHistory = card.historyDrills.length + card.historyLocked.length;
            const previewDrills = card.historyDrills.slice(0, HISTORY_PREVIEW);
            const lockedRoom = HISTORY_PREVIEW - previewDrills.length;
            const previewLocked = lockedRoom > 0 ? card.historyLocked.slice(0, lockedRoom) : [];
            const hidden = totalHistory - previewDrills.length - previewLocked.length;
            return (
              <Section>
                <SectionLabel>Per-drill history</SectionLabel>
                <View style={{ gap: spacing.sm, marginTop: 6 }}>
                  {previewDrills.map((d) => (
                    <HistoryDrillRow key={d.key} d={d} />
                  ))}
                  {previewLocked.map((l) => (
                    <HistoryLockedRow key={l.key} l={l} />
                  ))}
                </View>
                {hidden > 0 ? (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setHistoryOpen(true)}
                    hitSlop={8}
                    style={{
                      marginTop: spacing.md,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      alignSelf: "flex-start",
                    }}
                  >
                    <Text style={[fontStyle("medium"), { fontSize: 13, color: colors.orange[400] }]}>
                      View all {totalHistory} drills
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.orange[400]} />
                  </TouchableOpacity>
                ) : null}
              </Section>
            );
          })()
        ) : null}

        {/* Benchmark sessions (captain-only) — one row per session; tap to
            view/edit that session's results in a sheet. */}
        {canManage && card.sessions.length && teamId ? (
          <Section>
            <SectionLabel>Benchmark sessions</SectionLabel>
            <View style={{ marginTop: 6 }}>
              {card.sessions.map((sess) => (
                <TouchableOpacity
                  key={sess.date}
                  activeOpacity={0.7}
                  onPress={() => setSelectedDate(sess.date)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    paddingVertical: spacing.md,
                    borderTopWidth: 1,
                    borderTopColor: colors.border.subtle,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[fontStyle("medium"), { fontSize: 14, color: colors.text.primary }]}
                      numberOfLines={1}
                    >
                      {sess.label}
                    </Text>
                    <Text style={[fontStyle(), { fontSize: 11.5, color: colors.text.muted, marginTop: 2 }]}>
                      {formatSessionDate(sess.date)} · {sess.drills.length} drill
                      {sess.drills.length === 1 ? "" : "s"} · {sess.resultCount} set
                      {sess.resultCount === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
                </TouchableOpacity>
              ))}
            </View>
          </Section>
        ) : null}

        {/* Observations + add note */}
        <Section>
          <SectionLabel>Observations</SectionLabel>
          <View style={{ gap: spacing.sm, marginTop: 6 }}>
            {card.observations.length ? (
              card.observations.map((o) => (
                <View
                  key={o.id}
                  style={{
                    padding: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: colors.surface.overlay,
                  }}
                >
                  <Text style={[fontStyle(), { fontSize: 13, color: colors.text.primary, lineHeight: 19 }]}>
                    {o.noteText}
                  </Text>
                  {o.practiceTitle || o.practiceDate ? (
                    <Text style={[fontStyle(), { fontSize: 11, color: colors.text.muted, marginTop: 4 }]}>
                      {[o.practiceTitle, o.practiceDate].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={[fontStyle(), { fontSize: 12.5, color: colors.text.muted }]}>No observations yet.</Text>
            )}
          </View>

          {canManage ? (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <TextInput
                value={noteDraft}
                onChangeText={setNoteDraft}
                placeholder="Add an observation…"
                placeholderTextColor={colors.text.muted}
                multiline
                style={[
                  fontStyle(),
                  {
                    minHeight: 64,
                    padding: spacing.md,
                    borderRadius: radius.input,
                    backgroundColor: colors.surface.input,
                    borderWidth: 1,
                    borderColor: colors.border.default,
                    color: colors.text.primary,
                    fontSize: 14,
                    textAlignVertical: "top",
                  },
                ]}
              />
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={savingNote || !noteDraft.trim()}
                onPress={submitNote}
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: spacing.xl,
                  paddingVertical: 9,
                  borderRadius: radius.pill,
                  backgroundColor: colors.orange[500],
                  opacity: savingNote || !noteDraft.trim() ? 0.5 : 1,
                }}
              >
                <Text style={[fontStyle("medium"), { fontSize: 13, color: colors.text.onBrand }]}>
                  {savingNote ? "Adding…" : "Add note"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Section>
      </ScrollView>

      <SheetContainer open={selectedDate != null} onClose={() => setSelectedDate(null)}>
        {(() => {
          const sess = card.sessions.find((x) => x.date === selectedDate);
          if (!sess || !teamId) return null;
          const tid = teamId;
          return (
            <>
              <View style={{ gap: 2 }}>
                <Text style={[fontStyle("bold"), { fontSize: 16, color: colors.text.primary }]}>
                  {sess.label}
                </Text>
                <Text style={[fontStyle(), { fontSize: 12, color: colors.text.muted }]}>
                  {formatSessionDate(sess.date)} · {sess.drills.length} drill
                  {sess.drills.length === 1 ? "" : "s"} · {sess.resultCount} set
                  {sess.resultCount === 1 ? "" : "s"}
                </Text>
              </View>
              <ScrollView
                style={{ maxHeight: 440 }}
                contentContainerStyle={{ gap: spacing.md }}
                showsVerticalScrollIndicator={false}
              >
                {sess.drills.map((d) => {
                  const best = bestResult(d.results);
                  const multi = d.results.length > 1;
                  const type = d.results[0]?.benchmarkType ?? "rated";
                  const drillId = d.results[0]?.drillId ?? null;
                  const adding = addingDrill === d.drillName;
                  const onAddSet = async () => {
                    if (!drillId || !id) return;
                    setAddingDrill(d.drillName);
                    const nextSet = d.results.reduce((m, r) => Math.max(m, r.setNumber), 0) + 1;
                    const res = await addBenchmarkSet({
                      teamId: tid,
                      drillId,
                      playerId: id,
                      benchmarkType: type as BenchmarkType,
                      assessmentDate: sess.date,
                      setNumber: nextSet,
                    });
                    setAddingDrill(null);
                    if (res.ok) load();
                    else showError("Couldn't add set", res.error);
                  };
                  return (
                    <View
                      key={d.drillName}
                      style={{
                        borderRadius: radius.lg,
                        borderWidth: 1,
                        borderColor: colors.border.subtle,
                        backgroundColor: colors.surface.overlay,
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: spacing.sm,
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.sm + 2,
                        }}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text
                            style={[fontStyle("semibold"), { fontSize: 14.5, color: colors.text.primary }]}
                            numberOfLines={1}
                          >
                            {d.drillName}
                          </Text>
                          <Text style={[fontStyle(), { fontSize: 11, color: colors.text.muted }]}>
                            {d.results.length} set{d.results.length === 1 ? "" : "s"}
                            {multi && best ? ` · best ${valueLabel(best)}` : ""}
                          </Text>
                        </View>
                        <TypeChip type={type} />
                      </View>
                      <View style={{ paddingHorizontal: spacing.md }}>
                        {d.results.map((r) => (
                          <CorrectRow
                            key={r.id}
                            result={r}
                            repLabel={`Set ${r.setNumber}`}
                            isBest={multi && best?.id === r.id}
                            teamId={tid}
                            onSaved={load}
                            onError={(msg) => showError("Couldn't update", msg)}
                          />
                        ))}
                      </View>
                      {canManage && drillId ? (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          disabled={adding}
                          onPress={onAddSet}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm + 2,
                            borderTopWidth: 1,
                            borderTopColor: colors.border.subtle,
                            opacity: adding ? 0.5 : 1,
                          }}
                        >
                          <Ionicons name="add" size={15} color={colors.orange[400]} />
                          <Text style={[fontStyle("medium"), { fontSize: 12.5, color: colors.orange[400] }]}>
                            {adding ? "Adding set…" : "Add set"}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            </>
          );
        })()}
      </SheetContainer>

      <SheetContainer open={historyOpen} onClose={() => setHistoryOpen(false)}>
        <View style={{ gap: 2 }}>
          <Text style={[fontStyle("bold"), { fontSize: 16, color: colors.text.primary }]}>
            Per-drill history
          </Text>
          <Text style={[fontStyle(), { fontSize: 12, color: colors.text.muted }]}>
            {card.historyDrills.length + card.historyLocked.length} drills · best result · reps logged
          </Text>
        </View>
        <ScrollView
          style={{ maxHeight: 440 }}
          contentContainerStyle={{ gap: spacing.sm }}
          showsVerticalScrollIndicator={false}
        >
          {card.historyDrills.map((d) => (
            <HistoryDrillRow key={d.key} d={d} />
          ))}
          {card.historyLocked.map((l) => (
            <HistoryLockedRow key={l.key} l={l} />
          ))}
        </ScrollView>
      </SheetContainer>

      <ActionModal {...modalProps} />
    </View>
  );
}
