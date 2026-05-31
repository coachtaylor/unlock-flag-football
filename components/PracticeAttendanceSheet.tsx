import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing } from "../constants/design";
import { fontStyle, monoStyle } from "../constants/typography";
import { playerColorForIndex } from "../lib/athlete";
import { supabase } from "../lib/supabase";

// A roster player resolved against one practice — did they attend, and any
// notes logged about them for that practice.
export type AttendancePlayer = {
  id: string;
  name: string;
  initials: string;
  positions: string[];
  // Per-player avatar color slot (migration 45). Null when the DB row
  // predates the migration — helper falls back to muted.
  colorIndex: number | null;
  attended: boolean;
  // True when the player checked in late. Only meaningful when attended is
  // true. Drives the orange clock badge in the check-in grid and the
  // dashboard's three-bar attendance breakdown.
  checkInLate?: boolean;
  notes: string[];
};

function SectionMini({ label }: { label: string }) {
  return (
    <Text
      style={[
        fontStyle("bold"),
        {
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: colors.text.muted,
        },
      ]}
    >
      {label}
    </Text>
  );
}

function PlayerRow({
  player,
  attended,
  onToggle,
}: {
  player: AttendancePlayer;
  attended: boolean;
  onToggle: () => void;
}) {
  // Per-player identity color from migration 45's color_index slot.
  const accent = playerColorForIndex(player.colorIndex);
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: attended }}
      accessibilityLabel={`${player.name}, ${
        attended ? "attended" : "absent"
      }`}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: accent,
          opacity: attended ? 1 : 0.35,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={[
            monoStyle("bold"),
            { fontSize: 12, color: colors.text.onBrand },
          ]}
        >
          {player.initials}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            minHeight: 34,
          }}
        >
          <Text
            style={[
              fontStyle("semibold"),
              {
                flex: 1,
                fontSize: 15,
                color: attended ? colors.text.primary : colors.text.muted,
              },
            ]}
          >
            {player.name}
          </Text>
          <Ionicons
            name={attended ? "checkmark-circle" : "ellipse-outline"}
            size={22}
            color={attended ? colors.lime[400] : colors.text.faint}
          />
        </View>
        {player.notes.length > 0 ? (
          <View style={{ marginTop: 2, gap: spacing.sm }}>
            {player.notes.map((note, i) => (
              <View
                key={i}
                style={{
                  borderLeftWidth: 2,
                  borderLeftColor: colors.border.strong,
                  paddingLeft: spacing.sm,
                }}
              >
                <Text
                  style={[
                    fontStyle("regular"),
                    {
                      fontSize: 13,
                      lineHeight: 19,
                      color: colors.text.label,
                    },
                  ]}
                >
                  {note}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// Bottom sheet: who showed up to a practice, plus any per-player notes logged
// for it. Tapping a player toggles their attendance (the `attended` flag).
export function PracticeAttendanceSheet({
  visible,
  onClose,
  practicePlanId,
  dateLabel,
  players,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  practicePlanId: string;
  dateLabel: string;
  players: AttendancePlayer[];
  onChanged?: () => void;
}) {
  // Local working copy of attendance — seeded each time the sheet opens, edited
  // optimistically as the coach taps, and persisted via upsert.
  const [attendedMap, setAttendedMap] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const seed: Record<string, boolean> = {};
    for (const p of players) seed[p.id] = p.attended;
    setAttendedMap(seed);
    setDirty(false);
  }, [visible]);

  const toggle = async (playerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = !attendedMap[playerId];
    setAttendedMap((m) => ({ ...m, [playerId]: next }));
    setDirty(true);
    const { error } = await supabase
      .from("practice_plan_attendees")
      .upsert(
        {
          practice_plan_id: practicePlanId,
          player_id: playerId,
          attended: next,
        },
        { onConflict: "practice_plan_id,player_id" }
      );
    if (error) console.warn("[attendance] save error", error.message);
  };

  const handleClose = () => {
    if (dirty) onChanged?.();
    onClose();
  };

  const present = players.filter((p) => attendedMap[p.id]);
  const absent = players.filter((p) => !attendedMap[p.id]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.scrim }}>
        <Pressable
          style={{ flex: 1 }}
          onPress={handleClose}
          accessibilityLabel="Close"
        />
        <View
          style={{
            backgroundColor: colors.surface.raised,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: spacing["3xl"],
            maxHeight: "82%",
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
              marginBottom: spacing.xs,
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
              Practice Attendance
            </Text>
          </View>
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 13,
                color: colors.text.secondary,
                marginBottom: spacing.lg,
              },
            ]}
          >
            {dateLabel}
            {"  ·  "}
            {present.length} of {players.length} attended
          </Text>

          {players.length === 0 ? (
            <View
              style={{ paddingVertical: spacing["2xl"], alignItems: "center" }}
            >
              <Ionicons
                name="people-outline"
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
                No active players on the roster.
              </Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                gap: spacing.xl,
                paddingBottom: spacing.md,
              }}
            >
              <Text
                style={[
                  fontStyle("regular"),
                  { fontSize: 12, color: colors.text.muted },
                ]}
              >
                Tap a player to change who attended.
              </Text>
              {present.length > 0 ? (
                <View style={{ gap: spacing.md }}>
                  <SectionMini label={`Present · ${present.length}`} />
                  {present.map((p) => (
                    <PlayerRow
                      key={p.id}
                      player={p}
                      attended
                      onToggle={() => toggle(p.id)}
                    />
                  ))}
                </View>
              ) : null}
              {absent.length > 0 ? (
                <View style={{ gap: spacing.md }}>
                  <SectionMini label={`Absent · ${absent.length}`} />
                  {absent.map((p) => (
                    <PlayerRow
                      key={p.id}
                      player={p}
                      attended={false}
                      onToggle={() => toggle(p.id)}
                    />
                  ))}
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
