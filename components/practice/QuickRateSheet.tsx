import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontFamily, spacing } from "../../constants/design";
import { fontStyle } from "../../constants/typography";
import { SheetContainer, SheetSectionLabel } from "../ui/Sheet";
import { Button } from "../ui/Button";
import { TextArea } from "../ui/TextArea";
import { PlayerAvatar } from "../ui/PlayerAvatar";
import { RatingRow } from "../benchmark/CaptureWidgets";
import { SkillTagChips } from "../benchmark/SkillTagChips";
import { upsertBenchmarkResult } from "../../lib/benchmarks";
import { localDateString } from "../../lib/date";
import type { SkillTagGroup } from "../../lib/skills";

export type QuickRatePlayer = {
  id: string;
  name: string;
  colorIndex: number | null;
};

// Mid-practice quick-rate sheet (Build 14d, mobile-only). Tap a present
// player on the live drill card → rate 1-5, optional skill-tag chips + note,
// and a "needs more detail" flag (default ON — a quick tap during practice is
// rarely the full picture). Saves to benchmark_results via the shared write
// path with entry_mode='practice_quick'. Designed to capture one player in
// well under the 8-second target: rating is the only required field and Save
// is reachable in two taps.
export function QuickRateSheet({
  open,
  onClose,
  player,
  drillId,
  drillName,
  teamId,
  assessedBy,
  skillTagGroups,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  player: QuickRatePlayer | null;
  drillId: string;
  drillName: string;
  teamId: string;
  assessedBy: string;
  skillTagGroups: SkillTagGroup[];
  onSaved?: (playerId: string) => void;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [needsReview, setNeedsReview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the draft each time the sheet opens for a (different) player so one
  // player's rating never bleeds into the next.
  useEffect(() => {
    if (open) {
      setRating(null);
      setTags(new Set());
      setNote("");
      setNeedsReview(true);
      setSaving(false);
      setError(null);
    }
  }, [open, player?.id]);

  const toggleTag = (label: string) => {
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const save = async () => {
    if (!player || rating == null || !teamId || !drillId || !assessedBy) return;
    setSaving(true);
    setError(null);
    const { error: writeErr } = await upsertBenchmarkResult({
      team_id: teamId,
      drill_id: drillId,
      player_id: player.id,
      assessed_by: assessedBy,
      assessment_date: localDateString(),
      benchmark_type: "rated",
      set_number: 1,
      rating,
      tags: Array.from(tags),
      notes: note.trim() || null,
      entry_mode: "practice_quick",
      needs_review: needsReview,
    });
    if (writeErr) {
      setSaving(false);
      setError(writeErr.message);
      return;
    }
    setSaving(false);
    onSaved?.(player.id);
    onClose();
  };

  if (!player) return null;

  return (
    <SheetContainer open={open} onClose={onClose}>
      {/* Player + drill header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <PlayerAvatar name={player.name} colorIndex={player.colorIndex} size={40} />
        <View style={{ flex: 1 }}>
          <SheetSectionLabel>Quick rate</SheetSectionLabel>
          <Text style={[fontStyle("bold"), { fontSize: 18, color: colors.text.primary }]}>
            {player.name}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: colors.text.muted,
              fontFamily: fontFamily.sansMedium,
            }}
            numberOfLines={1}
          >
            {drillName}
          </Text>
        </View>
      </View>

      {/* Rating (required) */}
      <View style={{ gap: spacing.sm }}>
        <SheetSectionLabel>Rating</SheetSectionLabel>
        <RatingRow value={rating} onChange={setRating} />
      </View>

      {/* Skill-tag chips (optional) — shared with the benchmark log */}
      <SkillTagChips groups={skillTagGroups} selected={tags} onToggle={toggleTag} />

      {/* Note (optional) — uses the OS keyboard's native dictation */}
      <TextArea
        label="Note"
        placeholder="Optional — tap the mic to dictate"
        value={note}
        onChangeText={setNote}
        style={{ minHeight: 64 }}
      />

      {/* Needs more detail later — surfaces in the dashboard review queue */}
      <TouchableOpacity
        onPress={() => setNeedsReview((v) => !v)}
        activeOpacity={0.7}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          paddingVertical: 4,
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: needsReview ? colors.orange[500] : colors.border.strong,
            backgroundColor: needsReview ? colors.orange[500] : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {needsReview && (
            <Ionicons name="checkmark" size={15} color={colors.text.onBrand} />
          )}
        </View>
        <Text
          style={{
            fontSize: 13,
            color: colors.text.secondary,
            fontFamily: fontFamily.sansMedium,
          }}
        >
          Needs more detail later
        </Text>
      </TouchableOpacity>

      {error && (
        <Text
          style={{
            fontSize: 13,
            color: colors.error,
            fontFamily: fontFamily.sansMedium,
          }}
        >
          {error}
        </Text>
      )}

      {/* Save */}
      {saving ? (
        <View style={{ minHeight: 52, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.orange[500]} />
        </View>
      ) : (
        <Button
          label={rating == null ? "Tap a rating to save" : "Save rating"}
          variant="primary"
          disabled={rating == null}
          onPress={save}
        />
      )}
    </SheetContainer>
  );
}
