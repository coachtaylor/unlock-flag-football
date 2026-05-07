import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Input } from "./ui/Input";
import { TextArea } from "./ui/TextArea";
import { Button } from "./ui/Button";
import { Tag } from "./ui/Tag";
import { colors, spacing } from "../constants/design";
import { supabase } from "../lib/supabase";

const POSITION_OPTIONS = [
  "QB",
  "WR",
  "RB",
  "C",
  "CB",
  "S",
  "LB",
  "DE",
  "Rusher",
];

export type PlayerFormInitial = {
  id: string;
  playerName: string;
  positions: string[];
  jerseyNumber: string;
  notes: string;
};

type Props = {
  teamId: string;
  initial?: PlayerFormInitial;
  topInset: number;
};

export function PlayerForm({ teamId, initial, topInset }: Props) {
  const router = useRouter();
  const isEditing = !!initial;

  const [playerName, setPlayerName] = useState(initial?.playerName ?? "");
  const [positions, setPositions] = useState<string[]>(
    initial?.positions ?? []
  );
  const [jerseyNumber, setJerseyNumber] = useState(
    initial?.jerseyNumber ?? ""
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const togglePosition = (pos: string) => {
    setPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const onSubmit = async () => {
    setError(null);
    if (!playerName.trim()) {
      setError("Player name is required.");
      return;
    }
    setSubmitting(true);

    const payload = {
      player_name: playerName.trim(),
      positions: positions.length > 0 ? positions : null,
      jersey_number: jerseyNumber.trim() || null,
      notes: notes.trim() || null,
    };

    if (isEditing && initial) {
      const { error: updateErr } = await supabase
        .from("team_players")
        .update(payload)
        .eq("id", initial.id);
      if (updateErr) {
        setError(updateErr.message);
        setSubmitting(false);
        return;
      }
      router.back();
    } else {
      const { error: insertErr } = await supabase.from("team_players").insert({
        ...payload,
        team_id: teamId,
        status: "active",
      });
      if (insertErr) {
        setError(insertErr.message);
        setSubmitting(false);
        return;
      }
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
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
        <Text
          style={{
            fontSize: 20,
            lineHeight: 28,
            fontWeight: "500",
            color: colors.text.primary,
          }}
        >
          {isEditing ? "Edit Player" : "Add Player"}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing["3xl"] + 80,
          gap: spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Input
          label="Player Name"
          value={playerName}
          onChangeText={setPlayerName}
          placeholder="e.g., Marcus Johnson"
          autoCapitalize="words"
          returnKeyType="next"
        />

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
            }}
          >
            Positions
          </Text>
          <View
            className="flex-row flex-wrap"
            style={{ gap: spacing.sm }}
          >
            {POSITION_OPTIONS.map((pos) => (
              <Tag
                key={pos}
                label={pos}
                selected={positions.includes(pos)}
                onPress={() => togglePosition(pos)}
              />
            ))}
          </View>
        </View>

        <Input
          label="Jersey Number"
          value={jerseyNumber}
          onChangeText={setJerseyNumber}
          placeholder="e.g., 7"
          keyboardType="number-pad"
          maxLength={4}
          style={{ width: 120 }}
        />

        <TextArea
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything to remember about this player..."
          style={{ minHeight: 110 }}
        />

        {error ? (
          <Text
            style={{
              fontSize: 13,
              lineHeight: 18,
              color: colors.errorLight,
            }}
          >
            {error}
          </Text>
        ) : null}

        <Button
          label={
            submitting
              ? isEditing
                ? "Saving…"
                : "Adding…"
              : isEditing
              ? "Save Changes"
              : "Add Player"
          }
          onPress={onSubmit}
          disabled={submitting}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
