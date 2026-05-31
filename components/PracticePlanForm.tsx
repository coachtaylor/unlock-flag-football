import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Button } from "./ui/Button";
import { ActionModal, useActionModal } from "./ui/ActionModal";
import { Eyebrow } from "./ui/Eyebrow";
import { AvatarStack } from "./ui/AvatarStack";
import { DrillNoteHistorySheet } from "./DrillNoteHistorySheet";
import { colors, fontFamily, fontWeight, radius, spacing, tracking } from "../constants/design";
import { fontStyle, monoStyle } from "../constants/typography";
import {
  colorForCategory,
  normalizeCategory,
  tintForCategory,
} from "../constants/categories";
import { blockFillColor, blockTintColor } from "../constants/block-colors";
import {
  positionColor,
  positionTint,
  sideAccent,
  sideForPositions,
} from "../constants/positions";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

const ALL = "__all__";

type PlanStatus = "draft" | "scheduled" | "live" | "completed";

// Includes both legacy values ("reps_complete", "percentage") and the
// post-migration-38 vocabulary ("reps", "pct", "flags", "drops"). This screen
// only needs to know "is this a benchmark drill?", so widening the union is
// safe — type-specific UI in this file gates on .length only.
export type BenchmarkKind =
  | "timed"
  | "rated"
  | "reps_complete"
  | "percentage"
  | "reps"
  | "pct"
  | "flags"
  | "drops";

export type LibraryCategory = {
  id: string;
  name: string;
  type: "phase" | "skill" | "sub_skill" | null;
  color: string;
};

// Back-compat alias for the picker filter tabs which only need id + name.
type Category = LibraryCategory;

export type LibraryDrill = {
  id: string;
  name: string;
  description: string | null;
  categoryIds: string[];
  categoryNames: string[];
  durationMin: number | null;
  reps: number | null;
  benchmarkTypes: BenchmarkKind[];
};

type PlanDrill = {
  localId: string;
  // Which practice block this row lives inside. Required — every drill (and
  // every water break) belongs to exactly one block (Warm Up, Skill Block,
  // etc.). New rows inherit the block the coach was targeting when they
  // opened the picker.
  planBlockLocalId: string;
  drillId: string | null; // null for water breaks — they aren't drills
  durationMinutes: number;
  reps: number;
  isWaterBreak: boolean;
  notes: string; // coaching notes — per plan, never written back to the drill
  // Post-practice note — edited on the Log screen, carried forward from the
  // most recent prior practice that used this drill. Read-only here.
  logNote: string;
  // Rows sharing a non-null parallelGroup are siblings of one parallel block:
  // they run in the same time slot and the block's duration counts once.
  // Siblings are kept consecutive within their planBlock. Parallel groups
  // never span planBlocks (enforced both client-side and in the save RPC).
  parallelGroup: number | null;
};

// A practice block — Warm Up, Skill Block, Team / Situational, Cool Down, or
// a custom one the coach added. Blocks contain drills (joined via
// planBlockLocalId on PlanDrill). The targetMinutes is optional, mirrors the
// design screenshot: "20m / 25m target".
export type PlanBlock = {
  localId: string;
  // Library template this block instance came from, if any. Null when the
  // coach typed a brand-new name straight into the planner — that block
  // gets inserted into team_practice_blocks on save and gets its id back.
  templateId: string | null;
  name: string;
  targetMinutes: number | null;
};

// A row in the team's block library, loaded from team_practice_blocks. The
// "Add block" sheet lists these and lets the coach create new ones.
export type BlockTemplate = {
  id: string;
  name: string;
  displayOrder: number;
};

// A top-level water break — lives between blocks, not inside one. The
// afterBlockOrder is a positional slot: -1 = above the first block, N =
// in the gap after the block currently at index N. When the coach
// reorders blocks, breaks keep their slot — blocks shuffle around them.
// breakOrder lets multiple breaks sit in the same gap (UI only inserts
// one at a time for now, but the schema is ready).
export type PlanBreak = {
  localId: string;
  afterBlockOrder: number;
  breakOrder: number;
  durationMinutes: number;
};

// One row in the timeline: a water break, a single drill, or a parallel
// block of 2–3 drills. rowIndices point into the flat planDrills array.
type RenderBlock = {
  key: string;
  kind: "water" | "single" | "parallel";
  rowIndices: number[];
};

const WATER_BREAK_NAME = "Water Break";

function makeLocalId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// A roster player, prepared for the RSVP avatars + manage table.
export type RosterPlayer = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  initials: string;
  color: string; // offense/defense side accent
  jersey: string | null;
  positions: string[]; // primary first, then secondary
};

export type PracticePlanFormInitial = {
  id: string;
  practiceDate: string;
  startTime: string;
  endTime: string;
  title: string;
  notes: string;
  status: PlanStatus;
  // Practice blocks in display order. When edit.tsx loads a legacy plan
  // before the migration backfill has run, it should synthesize a single
  // "Skill Block" so the form always has at least one block to render
  // drills into.
  blocks: PlanBlock[];
  drills: PlanDrill[];
  // Top-level water breaks (between blocks). Empty if the plan was saved
  // before migration 44 or has no inter-block pauses.
  breaks: PlanBreak[];
  attendingIds: string[];
};

type Props = {
  teamId: string;
  drills: LibraryDrill[];
  categories: Category[];
  players: RosterPlayer[];
  initial?: PracticePlanFormInitial;
  topInset: number;
  bottomInset: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateToIso(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`;
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function timeToDate(t: string): Date {
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

function dateToTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatShortDate(iso: string) {
  return isoToDate(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeReadable(t: string | null): string {
  if (!t) return "";
  const [hh, mm] = t.split(":").map(Number);
  const period = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return mm === 0 ? `${h12} ${period}` : `${h12}:${pad2(mm)} ${period}`;
}

function formatClockShort(t: string | null): string {
  if (!t) return "";
  const [hh, mm] = t.split(":").map(Number);
  const period = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${pad2(mm)}${period}`;
}

function addMinutesToTime(start: string, mins: number): string {
  const [h, m] = start.split(":").map(Number);
  if ([h, m].some((n) => Number.isNaN(n))) return "";
  const total = h * 60 + m + mins;
  const H = ((Math.floor(total / 60) % 24) + 24) % 24;
  const M = ((total % 60) + 60) % 60;
  return `${pad2(H)}:${pad2(M)}`;
}

function nextSundayIso(): string {
  const today = new Date();
  const daysUntilSunday = (7 - today.getDay()) % 7 || 7;
  const target = new Date(today);
  target.setDate(today.getDate() + daysUntilSunday);
  return dateToIso(target);
}

const STATUS_LABEL: Record<PlanStatus, string> = {
  draft: "DRAFT",
  scheduled: "SCHEDULED",
  live: "LIVE",
  completed: "COMPLETED",
};

const STATUS_COLOR: Record<PlanStatus, string> = {
  draft: colors.orange[500],
  scheduled: colors.orange[500],
  live: colors.lime[400],
  completed: colors.text.secondary,
};

function outlinedCardStyle(extra?: ViewStyle): ViewStyle {
  return {
    backgroundColor: colors.surface.raised,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border.strong,
    borderTopWidth: 2,
    borderTopColor: colors.orange[500],
    padding: spacing.lg,
    overflow: "hidden",
    ...(extra ?? {}),
  };
}

function SectionHeader({
  num,
  label,
  right,
}: {
  num: string;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.md,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
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
            monoStyle("bold"),
            {
              fontSize: 11,
              letterSpacing: tracking.loose,
              color: colors.text.secondary,
              marginRight: 6,
            },
          ]}
        >
          {num}
        </Text>
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 11,
              letterSpacing: tracking.loose,
              textTransform: "uppercase",
              color: colors.text.primary,
            },
          ]}
        >
          {label}
        </Text>
      </View>
      {right}
    </View>
  );
}

function WhenField({
  icon,
  label,
  value,
  placeholder,
  accent,
  dim,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  placeholder?: string;
  accent?: boolean;
  dim?: boolean;
  onPress: () => void;
}) {
  const showPlaceholder = !value;
  const valueColor = showPlaceholder
    ? colors.text.muted
    : dim
    ? colors.text.muted
    : accent
    ? colors.orange[500]
    : colors.text.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => ({
        flex: 1,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
        }}
      >
        <Ionicons name={icon} size={11} color={colors.text.muted} />
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 10,
              letterSpacing: tracking.loose,
              textTransform: "uppercase",
              color: colors.text.muted,
            },
          ]}
        >
          {label}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={[
          monoStyle("bold"),
          {
            fontSize: 15,
            color: valueColor,
          },
        ]}
      >
        {showPlaceholder ? placeholder ?? "—" : value}
      </Text>
    </Pressable>
  );
}

function ScheduleBar({
  segments,
  startClock,
  endClock,
  totalMin,
}: {
  segments: { id: string; dur: number; color: string }[];
  startClock: string;
  endClock: string;
  totalMin: number;
}) {
  if (segments.length === 0) return null;
  return (
    <View style={{ marginTop: spacing.lg }}>
      <View
        style={{
          height: 6,
          flexDirection: "row",
          borderRadius: radius.full,
          overflow: "hidden",
          backgroundColor: colors.border.strong,
        }}
      >
        {segments.map((s, idx) => (
          <View
            key={s.id}
            style={{
              flex: Math.max(s.dur, 0.001),
              backgroundColor: s.color,
              opacity: 0.85,
              borderRightWidth: idx === segments.length - 1 ? 0 : 1,
              borderRightColor: colors.surface.base,
            }}
          />
        ))}
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 6,
        }}
      >
        <Text style={[monoStyle("medium"), { fontSize: 10, color: colors.text.muted }]}>
          {startClock || "—"}
        </Text>
        <Text style={[monoStyle("medium"), { fontSize: 10, color: colors.text.muted }]}>
          {totalMin}m planned
        </Text>
        <Text style={[monoStyle("medium"), { fontSize: 10, color: colors.text.muted }]}>
          {endClock || "—"}
        </Text>
      </View>
    </View>
  );
}

// Shared card surface for drill / parallel blocks.
const cardSurfaceStyle: ViewStyle = {
  backgroundColor: colors.surface.raised,
  borderRadius: radius.xl,
  borderWidth: 1,
  borderColor: colors.border.card,
};

// Dashed quick-add button (Add drill / Water) below the drill list.
function quickAddBtnStyle(color: string): ViewStyle {
  return {
    flex: 1,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${color}55`,
    borderStyle: "dashed",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };
}

// Small uppercase label used inside the expanded drill editor.
function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={[
        fontStyle("bold"),
        {
          fontSize: 9.5,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: colors.text.muted,
        },
      ]}
    >
      {children}
    </Text>
  );
}

// Wrapper card for one practice block — header (name, target, totals,
// reorder + delete), then the children drill rows rendered by the form,
// then the inline "+ Drill / + Water" footer.
function PlanBlockCard({
  block,
  blockIndex,
  totalMinutes,
  startClock,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
  onRename,
  onChangeTarget,
  onAddDrill,
  onAddWater,
  children,
}: {
  block: PlanBlock;
  blockIndex: number;
  totalMinutes: number;
  startClock: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onRename: (name: string) => void;
  onChangeTarget: (mins: number | null) => void;
  onAddDrill: () => void;
  onAddWater: () => void;
  children: React.ReactNode;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(block.name);
  const [targetOpen, setTargetOpen] = useState(false);
  const [targetValue, setTargetValue] = useState(
    block.targetMinutes != null ? String(block.targetMinutes) : ""
  );
  const target = block.targetMinutes;
  const overTarget = target != null && totalMinutes > target;
  const accent = blockFillColor(block.name);

  return (
    <View
      style={{
        flexDirection: "row",
        borderWidth: 1,
        borderColor: colors.border.card,
        borderRadius: radius.lg,
        backgroundColor: colors.surface.raised,
        overflow: "hidden",
      }}
    >
      {/* Left accent rail — the block's identity color, running the full
          card height. Replaces the tinted header so per-block color stays
          stable across practices without painting the screen. */}
      <View
        style={{
          width: 3,
          backgroundColor: accent,
        }}
      />

      <View style={{ flex: 1, minWidth: 0 }}>
        {/* Header row — no fill. Title pressable takes flex:1 so the icon
            cluster sits flush right. A thin vertical divider before the
            icons makes them read as a separate group regardless of title
            length. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingLeft: spacing.md,
            paddingRight: spacing.sm,
            paddingVertical: spacing.sm + 2,
            borderBottomWidth: 1,
            borderBottomColor: colors.border.subtle,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              backgroundColor: accent,
              marginRight: spacing.sm,
            }}
          />
          <TouchableOpacity
            onPress={() => {
              setRenameValue(block.name);
              setRenameOpen(true);
            }}
            hitSlop={6}
            activeOpacity={0.7}
            style={{ flex: 1, minWidth: 0 }}
          >
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 14,
                  color: colors.text.primary,
                },
              ]}
              numberOfLines={1}
            >
              {block.name}
            </Text>
          </TouchableOpacity>

          {/* Totals + target chip — inline next to the title. Tappable to
              edit the target. */}
          <TouchableOpacity
            onPress={() => {
              setTargetValue(
                block.targetMinutes != null ? String(block.targetMinutes) : ""
              );
              setTargetOpen(true);
            }}
            hitSlop={6}
            activeOpacity={0.7}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.border.subtle,
              marginLeft: spacing.sm,
            }}
          >
            <Ionicons
              name="time-outline"
              size={11}
              color={colors.text.muted}
            />
            <Text
              style={[
                monoStyle("medium"),
                {
                  fontSize: 11,
                  color: overTarget
                    ? colors.orange[500]
                    : colors.text.secondary,
                },
              ]}
            >
              {totalMinutes}m
              {target != null ? (
                <Text style={{ color: colors.text.muted }}>
                  {" / "}
                  {target}m
                </Text>
              ) : (
                <Text style={{ color: colors.text.muted }}> · set</Text>
              )}
            </Text>
          </TouchableOpacity>

          {/* Vertical divider — anchors the action cluster as a distinct
              group, not adjacent text. */}
          <View
            style={{
              width: 1,
              height: 16,
              backgroundColor: colors.border.subtle,
              marginHorizontal: spacing.sm,
            }}
          />

          {/* Reorder + remove — flush right, 6px between icons so they don't
              read as one blob. */}
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity
              onPress={onMoveUp}
              disabled={!canMoveUp}
              hitSlop={6}
              style={{
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
                opacity: canMoveUp ? 1 : 0.3,
              }}
            >
              <Ionicons
                name="chevron-up"
                size={16}
                color={colors.text.secondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onMoveDown}
              disabled={!canMoveDown}
              hitSlop={6}
              style={{
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
                opacity: canMoveDown ? 1 : 0.3,
              }}
            >
              <Ionicons
                name="chevron-down"
                size={16}
                color={colors.text.secondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onRemove}
              hitSlop={6}
              style={{
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="trash-outline"
                size={14}
                color={colors.text.muted}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Start clock */}
        {startClock ? (
          <Text
            style={[
              monoStyle("medium"),
              {
                fontSize: 10,
                color: colors.text.muted,
                paddingHorizontal: spacing.md,
                paddingTop: spacing.sm,
              },
            ]}
          >
            Starts {formatClockShort(startClock)} · Block {pad2(blockIndex + 1)}
          </Text>
        ) : null}

        <View style={{ padding: spacing.md, gap: spacing.sm }}>
          {children}
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            paddingBottom: spacing.md,
          }}
        >
          <TouchableOpacity
            onPress={onAddDrill}
            accessibilityLabel="Add drill to block"
            activeOpacity={0.7}
            style={quickAddBtnStyle(accent)}
          >
            <Ionicons name="add" size={14} color={accent} />
            <Text
              style={[
                fontStyle("semibold"),
                { fontSize: 12, color: accent },
              ]}
            >
              Drill
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onAddWater}
            accessibilityLabel="Add water break to block"
            activeOpacity={0.7}
            style={quickAddBtnStyle(colors.blue[400])}
          >
            <Ionicons name="water" size={14} color={colors.blue[400]} />
            <Text
              style={[
                fontStyle("semibold"),
                { fontSize: 12, color: colors.blue[400] },
              ]}
            >
              Water
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Rename modal */}
      <Modal
        visible={renameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            paddingHorizontal: spacing.xl,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface.raised,
              borderRadius: radius.lg,
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            <Text
              style={[
                fontStyle("bold"),
                { fontSize: 16, color: colors.text.primary },
              ]}
            >
              Rename block
            </Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              placeholder="Block name"
              placeholderTextColor={colors.text.muted}
              style={{
                backgroundColor: colors.surface.input,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm + 2,
                color: colors.text.primary,
                fontSize: 14,
              }}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setRenameOpen(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Save"
                  onPress={() => {
                    const trimmed = renameValue.trim();
                    if (trimmed) onRename(trimmed);
                    setRenameOpen(false);
                  }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Target-minutes modal */}
      <Modal
        visible={targetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTargetOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            paddingHorizontal: spacing.xl,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface.raised,
              borderRadius: radius.lg,
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            <Text
              style={[
                fontStyle("bold"),
                { fontSize: 16, color: colors.text.primary },
              ]}
            >
              Target duration
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: colors.text.muted,
              }}
            >
              Optional. Shown as "{totalMinutes}m / Nm target" in the header.
              Leave blank to remove.
            </Text>
            <TextInput
              value={targetValue}
              onChangeText={setTargetValue}
              autoFocus
              keyboardType="number-pad"
              placeholder="25"
              placeholderTextColor={colors.text.muted}
              style={{
                backgroundColor: colors.surface.input,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm + 2,
                color: colors.text.primary,
                fontSize: 14,
              }}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setTargetOpen(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Save"
                  onPress={() => {
                    const trimmed = targetValue.trim();
                    if (!trimmed) {
                      onChangeTarget(null);
                    } else {
                      const n = parseInt(trimmed, 10);
                      onChangeTarget(Number.isFinite(n) && n > 0 ? n : null);
                    }
                    setTargetOpen(false);
                  }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// "+ Add block" library sheet — lists team templates and lets the coach
// type a brand-new block name. Used inside PracticePlanForm.
function BlockLibrarySheet({
  visible,
  onClose,
  templates,
  onPickTemplate,
  onCreateNew,
}: {
  visible: boolean;
  onClose: () => void;
  templates: BlockTemplate[];
  onPickTemplate: (template: BlockTemplate) => void;
  onCreateNew: (name: string) => void;
}) {
  const [newName, setNewName] = useState("");
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface.raised,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            padding: spacing.lg,
            gap: spacing.md,
            maxHeight: "85%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={[
                fontStyle("bold"),
                { fontSize: 16, color: colors.text.primary },
              ]}
            >
              Add block
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12, color: colors.text.muted }}>
            Pick from your team library — or type a new name. New names are
            added to the library on save.
          </Text>
          <ScrollView style={{ maxHeight: 280 }}>
            {templates.length === 0 ? (
              <Text
                style={{
                  fontSize: 12,
                  color: colors.text.muted,
                  textAlign: "center",
                  paddingVertical: spacing.lg,
                }}
              >
                No saved blocks yet.
              </Text>
            ) : (
              templates.map((t) => {
                const dot = blockFillColor(t.name);
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => onPickTemplate(t)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: spacing.md - 2,
                      paddingHorizontal: spacing.sm,
                      borderRadius: radius.md,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.sm,
                      }}
                    >
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          backgroundColor: dot,
                        }}
                      />
                      <Text
                        style={[
                          fontStyle("semibold"),
                          { fontSize: 14, color: colors.text.primary },
                        ]}
                      >
                        {t.name}
                      </Text>
                    </View>
                    <Ionicons
                      name="add-circle"
                      size={20}
                      color={dot}
                    />
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
          <View
            style={{
              height: 1,
              backgroundColor: colors.border.subtle,
              marginVertical: spacing.xs,
            }}
          />
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 10,
                letterSpacing: tracking.loose,
                textTransform: "uppercase",
                color: colors.text.muted,
              },
            ]}
          >
            Create new block
          </Text>
          <View
            style={{
              flexDirection: "row",
              gap: spacing.sm,
              alignItems: "center",
            }}
          >
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g., QB Reads"
              placeholderTextColor={colors.text.muted}
              style={{
                flex: 1,
                backgroundColor: colors.surface.input,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm + 2,
                color: colors.text.primary,
                fontSize: 14,
              }}
              onSubmitEditing={() => {
                if (newName.trim()) {
                  onCreateNew(newName.trim());
                  setNewName("");
                }
              }}
              returnKeyType="done"
            />
            <TouchableOpacity
              onPress={() => {
                if (newName.trim()) {
                  onCreateNew(newName.trim());
                  setNewName("");
                }
              }}
              activeOpacity={0.7}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm + 2,
                borderRadius: radius.md,
                backgroundColor: colors.orange[500],
              }}
            >
              <Text
                style={[
                  fontStyle("bold"),
                  { fontSize: 13, color: "#0A0A0D" },
                ]}
              >
                Add
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Lightweight target-block picker. Used by the drill expanded card's
// "Move to block" action — strips out the source block so a coach can't
// "move" a drill onto itself.
function MoveDrillToBlockSheet({
  visible,
  currentBlockId,
  blocks,
  onClose,
  onPick,
}: {
  visible: boolean;
  currentBlockId: string | null;
  blocks: PlanBlock[];
  onClose: () => void;
  onPick: (targetBlockId: string) => void;
}) {
  const targets = blocks.filter((b) => b.localId !== currentBlockId);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface.raised,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            padding: spacing.lg,
            gap: spacing.md,
            maxHeight: "70%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={[
                fontStyle("bold"),
                { fontSize: 16, color: colors.text.primary },
              ]}
            >
              Move drill to block
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12, color: colors.text.muted }}>
            Pick the block to move this drill into. Paired siblings stay
            behind — un-pair first if you want to move them together.
          </Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {targets.length === 0 ? (
              <Text
                style={{
                  fontSize: 12,
                  color: colors.text.muted,
                  textAlign: "center",
                  paddingVertical: spacing.lg,
                }}
              >
                No other blocks available.
              </Text>
            ) : (
              targets.map((b) => {
                const dot = blockFillColor(b.name);
                return (
                  <TouchableOpacity
                    key={b.localId}
                    onPress={() => onPick(b.localId)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: spacing.md - 2,
                      paddingHorizontal: spacing.sm,
                      borderRadius: radius.md,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.sm,
                      }}
                    >
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          backgroundColor: dot,
                        }}
                      />
                      <Text
                        style={[
                          fontStyle("semibold"),
                          { fontSize: 14, color: colors.text.primary },
                        ]}
                      >
                        {b.name}
                      </Text>
                    </View>
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color={colors.text.secondary}
                    />
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// Compact phase pill — mono, tinted background.
function PhasePill({ name }: { name: string }) {
  const known = normalizeCategory(name);
  const accent = known ? colorForCategory(name) : colors.text.label;
  const bg = known ? tintForCategory(name) : colors.surface.elevated;
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: radius.sm,
        backgroundColor: bg,
      }}
    >
      <Text
        style={[
          monoStyle("bold"),
          {
            fontSize: 9.5,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: accent,
          },
        ]}
      >
        {name}
      </Text>
    </View>
  );
}

// Inline "benchmark" marker — red dot + label.
function BenchmarkMark() {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      accessibilityLabel="Benchmark drill"
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: colors.red.semantic,
        }}
      />
      <Text
        style={[
          monoStyle("bold"),
          {
            fontSize: 9.5,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: colors.red.semantic,
          },
        ]}
      >
        Benchmark
      </Text>
    </View>
  );
}

// Bordered 30×30 icon button for the expanded-card footer actions.
function IconBtn({
  icon,
  color,
  onPress,
  label,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      accessibilityLabel={label}
      style={{
        width: 30,
        height: 30,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border.default,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <Ionicons name={icon} size={15} color={color} />
    </TouchableOpacity>
  );
}

function InlineStepper({
  inputRef,
  icon,
  value,
  suffix,
  step,
  max,
  accent,
  accentTint,
  onChangeText,
  compact,
}: {
  inputRef: React.RefObject<TextInput | null>;
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  suffix: string;
  step: number;
  max: number;
  accent: string;
  accentTint: string;
  onChangeText: (v: string) => void;
  compact?: boolean;
}) {
  const dec = () =>
    onChangeText(String(Math.max(0, value - step)));
  const inc = () =>
    onChangeText(String(Math.min(max, value + step)));
  const atMin = value <= 0;
  const atMax = value >= max;
  const btnSize = compact ? 30 : 38;
  const sideIconSize = compact ? 15 : 18;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        ...(compact
          ? null
          : {
              borderWidth: 1,
              borderColor: colors.border.default,
              borderRadius: radius.md,
              backgroundColor: colors.surface.muted,
            }),
      }}
    >
      <TouchableOpacity
        onPress={dec}
        disabled={atMin}
        activeOpacity={0.6}
        hitSlop={8}
        accessibilityLabel={`Decrease ${suffix}`}
        style={{
          width: btnSize,
          height: btnSize,
          alignItems: "center",
          justifyContent: "center",
          opacity: atMin ? 0.35 : 1,
        }}
      >
        <Ionicons name="remove" size={sideIconSize} color={accent} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => inputRef.current?.focus()}
        activeOpacity={0.7}
        accessibilityLabel={`Edit ${suffix}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          minWidth: compact ? 46 : 56,
          height: btnSize,
        }}
      >
        <Ionicons name={icon} size={compact ? 12 : 13} color={accent} />
        <TextInput
          ref={inputRef}
          value={String(value)}
          onChangeText={onChangeText}
          keyboardType="number-pad"
          maxLength={3}
          selectTextOnFocus
          style={[
            monoStyle("bold"),
            {
              minWidth: 20,
              fontSize: compact ? 15 : 17,
              color: accent,
              padding: 0,
              textAlign: "center",
            },
          ]}
        />
        <Text
          style={[
            monoStyle("bold"),
            { fontSize: compact ? 12 : 13, color: accent, opacity: 0.85 },
          ]}
        >
          {suffix}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={inc}
        disabled={atMax}
        activeOpacity={0.6}
        hitSlop={8}
        accessibilityLabel={`Increase ${suffix}`}
        style={{
          width: btnSize,
          height: btnSize,
          alignItems: "center",
          justifyContent: "center",
          opacity: atMax ? 0.35 : 1,
        }}
      >
        <Ionicons name="add" size={sideIconSize} color={accent} />
      </TouchableOpacity>
    </View>
  );
}

// ── Timeline gutter — time, numbered chip, connector ─────────────────
function BlockGutter({
  time,
  number,
  color,
  isWater,
  isLast,
}: {
  time: string;
  number: string;
  color: string;
  isWater: boolean;
  isLast: boolean;
}) {
  return (
    <View
      style={{ width: 52, flexShrink: 0, alignItems: "center", paddingTop: 6 }}
    >
      {time ? (
        <Text
          style={[
            monoStyle("medium"),
            { fontSize: 10, color: colors.text.muted, marginBottom: 6 },
          ]}
        >
          {time}
        </Text>
      ) : null}
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: color,
          backgroundColor: colors.surface.base,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isWater ? (
          <Ionicons name="water" size={12} color={color} />
        ) : (
          <Text style={[monoStyle("bold"), { fontSize: 10, color }]}>
            {number}
          </Text>
        )}
      </View>
      {!isLast ? (
        <LinearGradient
          colors={[`${color}55`, "transparent"]}
          style={{ flex: 1, minHeight: 16, width: 1, marginTop: 6 }}
        />
      ) : null}
    </View>
  );
}

// ── Collapsed drill header — phase tick, name, meta, chevron ─────────
function DrillCardHeader({
  name,
  phaseName,
  isBenchmark,
  durationMinutes,
  accent,
  expanded,
  onToggle,
  isSibling,
}: {
  name: string;
  phaseName: string | null;
  isBenchmark: boolean;
  durationMinutes: number;
  accent: string;
  expanded: boolean;
  onToggle: () => void;
  isSibling?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityLabel={expanded ? "Collapse drill" : "Expand drill"}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: isSibling ? 12 : 14,
        paddingVertical: isSibling ? 10 : 12,
      }}
    >
      <View
        style={{
          width: 3,
          alignSelf: "stretch",
          minHeight: 22,
          borderRadius: 2,
          backgroundColor: accent,
        }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[
            fontStyle("semibold"),
            {
              fontSize: isSibling ? 14 : 15,
              fontWeight: fontWeight.semibold,
              letterSpacing: -0.1,
              color: colors.text.primary,
            },
          ]}
        >
          {name}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 8,
          }}
        >
          {phaseName ? <PhasePill name={phaseName} /> : null}
          <Text
            style={[
              fontStyle("regular"),
              { fontSize: 12, color: colors.text.muted },
            ]}
          >
            {durationMinutes} min
          </Text>
        </View>
        {isBenchmark ? (
          <View style={{ marginTop: 6, alignSelf: "flex-start" }}>
            <BenchmarkMark />
          </View>
        ) : null}
      </View>
      <Ionicons
        name={expanded ? "chevron-up" : "chevron-down"}
        size={16}
        color={colors.text.muted}
      />
    </TouchableOpacity>
  );
}

// ── Expanded drill editor — library note, cues, footer actions ───────
function DrillExpandedBody({
  description,
  durationMinutes,
  notes,
  logNote,
  accent,
  accentTint,
  onChangeDuration,
  onChangeNotes,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onRemove,
  onPair,
  canPair,
  onUnpair,
  onMoveToBlock,
  canMoveToBlock,
  onOpenDrill,
  onOpenHistory,
}: {
  description: string | null;
  durationMinutes: number;
  notes: string;
  logNote: string;
  accent: string;
  accentTint: string;
  onChangeDuration: (v: string) => void;
  onChangeNotes: (v: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: () => void;
  onPair: () => void;
  canPair: boolean;
  onUnpair?: () => void;
  // Opens the "move to a different practice block" sheet. Hidden when the
  // plan has only one block (nowhere to move to) or when the drill is in a
  // parallel group (the coach should unpair first, otherwise siblings get
  // orphaned without warning).
  onMoveToBlock?: () => void;
  canMoveToBlock?: boolean;
  onOpenDrill: () => void;
  onOpenHistory: () => void;
}) {
  const durationInputRef = useRef<TextInput>(null);
  const [libOpen, setLibOpen] = useState(false);
  return (
    <View
      style={{
        paddingTop: 4,
        paddingBottom: 14,
        paddingLeft: 27,
        paddingRight: 14,
        borderTopWidth: 1,
        borderTopColor: colors.border.default,
      }}
    >
      {/* Cues for this practice — promoted focal point */}
      <View style={{ marginTop: 14, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons
            name="megaphone-outline"
            size={13}
            color={colors.text.secondary}
          />
          <Text
            style={[
              fontStyle("medium"),
              {
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: colors.text.label,
              },
            ]}
          >
            Cues for today
          </Text>
        </View>
        <TextInput
          value={notes}
          onChangeText={onChangeNotes}
          placeholder="Notes the team will see during practice…"
          placeholderTextColor={colors.text.muted}
          multiline
          style={[
            fontStyle("regular"),
            {
              minHeight: 76,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border.subtle,
              backgroundColor: colors.surface.input,
              paddingHorizontal: 12,
              paddingTop: 10,
              paddingBottom: 10,
              fontSize: 14,
              lineHeight: 20,
              color: colors.text.primary,
              textAlignVertical: "top",
            },
          ]}
        />
      </View>

      {/* Reference — collapsible drill library + last practice */}
      <View
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: colors.border.subtle,
          gap: 14,
        }}
      >
        {/* Drill library notes — read-only, collapsible */}
        <View style={{ gap: 6 }}>
          <TouchableOpacity
            onPress={() => setLibOpen((v) => !v)}
            activeOpacity={0.6}
            accessibilityLabel={
              libOpen ? "Hide drill library notes" : "Show drill library notes"
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <MicroLabel>From drill library</MicroLabel>
            <Ionicons
              name={libOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.text.muted}
            />
          </TouchableOpacity>
          {libOpen ? (
            <>
              <View
                style={{
                  backgroundColor: colors.surface.muted,
                  borderWidth: 1,
                  borderColor: colors.border.subtle,
                  borderRadius: radius.md,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <Text
                  style={[
                    fontStyle("regular"),
                    {
                      fontSize: 12.5,
                      lineHeight: 18,
                      color:
                        description && description.trim()
                          ? colors.text.secondary
                          : colors.text.muted,
                    },
                  ]}
                >
                  {description && description.trim()
                    ? description
                    : "No notes saved for this drill."}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onOpenDrill}
                activeOpacity={0.6}
                hitSlop={6}
                accessibilityLabel="Open full drill"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 3,
                  alignSelf: "flex-start",
                }}
              >
                <Text
                  style={[
                    fontStyle("semibold"),
                    { fontSize: 11.5, letterSpacing: 0.3, color: accent },
                  ]}
                >
                  Open full drill
                </Text>
                <Ionicons name="chevron-forward" size={12} color={accent} />
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        {/* From last practice — read-only carried note + history link */}
        <View style={{ gap: 6 }}>
          <MicroLabel>From last practice</MicroLabel>
          {logNote.trim() ? (
            <View
              style={{
                backgroundColor: colors.surface.muted,
                borderWidth: 1,
                borderColor: colors.border.subtle,
                borderRadius: radius.md,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text
                style={[
                  fontStyle("regular"),
                  {
                    fontSize: 12.5,
                    lineHeight: 18,
                    color: colors.text.secondary,
                  },
                ]}
              >
                {logNote}
              </Text>
            </View>
          ) : (
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 12.5, color: colors.text.muted },
              ]}
            >
              No note carried from a previous practice.
            </Text>
          )}
          <TouchableOpacity
            onPress={onOpenHistory}
            activeOpacity={0.6}
            hitSlop={6}
            accessibilityLabel="Drill note history"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 3,
              alignSelf: "flex-start",
            }}
          >
            <Ionicons name="time-outline" size={12} color={accent} />
            <Text
              style={[
                fontStyle("semibold"),
                { fontSize: 11.5, letterSpacing: 0.3, color: accent },
              ]}
            >
              Note history
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer — duration stepper + reorder / pair / remove */}
      <View style={{ marginTop: 14, flexDirection: "column", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MicroLabel>Duration</MicroLabel>
          <InlineStepper
            inputRef={durationInputRef}
            icon="time-outline"
            value={durationMinutes}
            suffix="m"
            step={1}
            max={120}
            accent={accent}
            accentTint={accentTint}
            onChangeText={onChangeDuration}
          />
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* left — reorder */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <IconBtn
              icon="chevron-up"
              color={colors.text.secondary}
              label="Move up"
              onPress={onMoveUp}
              disabled={!canMoveUp}
            />
            <IconBtn
              icon="chevron-down"
              color={colors.text.secondary}
              label="Move down"
              onPress={onMoveDown}
              disabled={!canMoveDown}
            />
          </View>
          {/* center — pair / un-pair */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <TouchableOpacity
              onPress={onPair}
              disabled={!canPair}
              activeOpacity={0.7}
              accessibilityLabel="Pair with another drill"
              style={{
                height: 30,
                paddingHorizontal: 12,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: `${colors.team.violet}55`,
                borderStyle: "dashed",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: canPair ? 1 : 0.3,
              }}
            >
              <Ionicons
                name="link-outline"
                size={14}
                color={colors.team.violet}
              />
              <Text
                style={[
                  fontStyle("semibold"),
                  { fontSize: 12, color: colors.team.violet },
                ]}
              >
                Link drill
              </Text>
            </TouchableOpacity>
            {onUnpair ? (
              <IconBtn
                icon="git-branch-outline"
                color={colors.text.secondary}
                label="Un-pair drill"
                onPress={onUnpair}
              />
            ) : null}
            {onMoveToBlock && canMoveToBlock ? (
              <IconBtn
                icon="swap-vertical-outline"
                color={colors.text.secondary}
                label="Move to another block"
                onPress={onMoveToBlock}
              />
            ) : null}
          </View>
          {/* right — remove */}
          <IconBtn
            icon="trash-outline"
            color={colors.red.semantic}
            label="Remove drill"
            onPress={onRemove}
          />
        </View>
      </View>
    </View>
  );
}

// ── Parallel block header strip ──────────────────────────────────────
function ParallelHeader({ duration }: { duration: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.subtle,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Ionicons
          name="git-branch-outline"
          size={11}
          color={colors.team.violet}
        />
        <Text
          style={[
            monoStyle("bold"),
            {
              fontSize: 9.5,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: colors.team.violet,
            },
          ]}
        >
          Parallel
        </Text>
      </View>
      <View style={{ flex: 1 }} />
      <Text
        style={[monoStyle("medium"), { fontSize: 11, color: colors.text.muted }]}
      >
        {duration}m · counts once
      </Text>
    </View>
  );
}

// ── Water break card ─────────────────────────────────────────────────
function WaterCard({
  duration,
  onChangeDuration,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onRemove,
}: {
  duration: number;
  onChangeDuration: (v: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: () => void;
}) {
  const durationInputRef = useRef<TextInput>(null);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: `${colors.blue[400]}55`,
        borderStyle: "dotted",
        borderRadius: radius.xl,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      <InlineStepper
        inputRef={durationInputRef}
        icon="time-outline"
        value={duration}
        suffix="m"
        step={1}
        max={60}
        accent={colors.blue[400]}
        accentTint={colors.surface.elevated}
        onChangeText={onChangeDuration}
        compact
      />
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: "row", gap: 6 }}>
        <IconBtn
          icon="chevron-up"
          color={colors.text.secondary}
          label="Move up"
          onPress={onMoveUp}
          disabled={!canMoveUp}
        />
        <IconBtn
          icon="chevron-down"
          color={colors.text.secondary}
          label="Move down"
          onPress={onMoveDown}
          disabled={!canMoveDown}
        />
        <IconBtn
          icon="trash-outline"
          color={colors.red.semantic}
          label="Remove water break"
          onPress={onRemove}
        />
      </View>
    </View>
  );
}

// Top-level water break card — visually similar to the in-block WaterCard
// but sits between block cards rather than inside one. No block accent rail
// (it belongs to no block) and no per-block reorder; the user inserts /
// removes it via the gap zone affordance instead.
function TopLevelBreakCard({
  duration,
  onChangeDuration,
  onRemove,
}: {
  duration: number;
  onChangeDuration: (v: string) => void;
  onRemove: () => void;
}) {
  const durationInputRef = useRef<TextInput>(null);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: `${colors.blue[400]}55`,
        borderStyle: "dashed",
        borderRadius: radius.xl,
        backgroundColor: colors.surface.raised,
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 10,
      }}
    >
      <Ionicons name="water" size={16} color={colors.blue[400]} />
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: colors.blue[400],
          },
        ]}
      >
        Water break
      </Text>
      <View style={{ flex: 1 }} />
      <InlineStepper
        inputRef={durationInputRef}
        icon="time-outline"
        value={duration}
        suffix="m"
        step={1}
        max={60}
        accent={colors.blue[400]}
        accentTint={colors.surface.elevated}
        onChangeText={onChangeDuration}
        compact
      />
      <IconBtn
        icon="trash-outline"
        color={colors.red.semantic}
        label="Remove water break"
        onPress={onRemove}
      />
    </View>
  );
}

// Gap zone sits between two block cards. If a top-level break already lives
// in this slot, render it; otherwise show a subtle "+ Water break" insert
// pill so the coach can drop one in.
function GapZone({
  breaks,
  onAdd,
  onChangeDuration,
  onRemove,
}: {
  breaks: PlanBreak[];
  onAdd: () => void;
  onChangeDuration: (localId: string, v: string) => void;
  onRemove: (localId: string) => void;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      {breaks.map((br) => (
        <TopLevelBreakCard
          key={br.localId}
          duration={br.durationMinutes}
          onChangeDuration={(v) => onChangeDuration(br.localId, v)}
          onRemove={() => onRemove(br.localId)}
        />
      ))}
      <TouchableOpacity
        onPress={onAdd}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Add water break between blocks"
        style={{
          alignSelf: "center",
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: radius.full,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: colors.border.dashed,
          backgroundColor: "transparent",
        }}
      >
        <Ionicons name="water-outline" size={12} color={colors.text.muted} />
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
          + Water break
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Unused legacy shell kept to satisfy the original signature — removed.
// ── Picker row atoms — mirror the canonical drill library row ─────────
const PICKER_COL_BENCH_W = 56;
const PICKER_COL_ACTION_W = 24;
const PICKER_COL_GAP = 10;

function PickerTableHeader() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: spacing.lg,
        paddingVertical: 10,
        gap: PICKER_COL_GAP,
        backgroundColor: colors.surface.overlay,
      }}
    >
      <Text
        style={[
          fontStyle("bold"),
          {
            flex: 1,
            fontSize: 9.5,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: colors.text.muted,
          },
        ]}
      >
        Drill
      </Text>
      <Text
        style={[
          monoStyle("bold"),
          {
            width: PICKER_COL_BENCH_W,
            fontSize: 9.5,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: colors.text.muted,
            textAlign: "right",
          },
        ]}
      >
        Dur
      </Text>
      <View style={{ width: PICKER_COL_ACTION_W }} />
    </View>
  );
}

function SkillFilterChip({
  label,
  count,
  active,
  color,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityRole="button">
      {({ pressed }) => (
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: radius.full,
            backgroundColor: active
              ? colors.text.primary
              : colors.surface.raised,
            borderWidth: active ? 0 : 1,
            borderColor: colors.border.card,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            opacity: pressed ? 0.85 : 1,
          }}
        >
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 11.5,
                letterSpacing: 0.4,
                color: active ? colors.text.onBrand : color ?? colors.text.primary,
              },
            ]}
          >
            {label}
          </Text>
          <Text
            style={[
              monoStyle("medium"),
              {
                fontSize: 10,
                color: active ? colors.text.onBrand : colors.text.muted,
                opacity: active ? 0.55 : 1,
              },
            ]}
          >
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function PickerDrillRow({
  drill,
  byId,
  added,
  onAdd,
  onRemove,
  isFirst,
  pairMode,
  onPick,
}: {
  drill: LibraryDrill;
  byId: Map<string, LibraryCategory>;
  added: boolean;
  onAdd: () => void;
  onRemove: () => void;
  isFirst: boolean;
  pairMode?: boolean;
  onPick?: () => void;
}) {
  // Phases drive structural sections (rendered above this row), so the row
  // only surfaces skills / sub-skills. The first skill colors the left bar;
  // drills with no skill tagged fall back to violet — a hue we don't use
  // anywhere else, so "no skill yet" reads as its own state at a glance.
  const linked = drill.categoryIds
    .map((id) => byId.get(id))
    .filter((c): c is LibraryCategory => !!c && c.type !== "phase");
  const accentColor = linked[0]?.color ?? colors.team.violet;
  return (
    <Pressable
      onPress={() =>
        pairMode ? onPick?.() : added ? onRemove() : onAdd()
      }
      accessibilityRole="button"
      accessibilityLabel={
        pairMode
          ? "Pair this drill"
          : added
          ? "Remove drill from plan"
          : "Add drill to plan"
      }
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "stretch",
            borderTopWidth: isFirst ? 0 : 1,
            borderTopColor: colors.border.subtle,
            opacity: pressed ? 0.85 : 1,
          }}
        >
          {/* Left short colored bar in primary-skill color */}
          <View
            style={{
              width: spacing.lg,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: spacing.md,
            }}
          >
            <View
              style={{
                width: 3,
                flex: 1,
                borderRadius: 2,
                backgroundColor: accentColor,
              }}
            />
          </View>
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              paddingRight: spacing.lg,
              paddingVertical: spacing.lg,
              gap: PICKER_COL_GAP,
            }}
          >
            {/* Name + primary pill + duration + sub-skills */}
            <View style={{ flex: 1, minWidth: 0, gap: spacing.sm }}>
              <Text
                style={[
                  fontStyle("bold"),
                  {
                    fontSize: 14,
                    color: colors.text.primary,
                  },
                ]}
                numberOfLines={1}
              >
                {drill.name}
              </Text>
              {linked.length > 0 && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 5,
                  }}
                >
                  {linked.map((c) => (
                    <View
                      key={c.id}
                      style={{
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 4,
                        backgroundColor: tintForCategory(c.name),
                      }}
                    >
                      <Text
                        style={[
                          fontStyle("bold"),
                          {
                            fontSize: 9.5,
                            letterSpacing: 0.6,
                            textTransform: "uppercase",
                            color: c.color,
                          },
                        ]}
                      >
                        {c.name}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {drill.benchmarkTypes.length > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                  }}
                  accessibilityLabel="Benchmark drill"
                >
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: colors.red.semantic,
                    }}
                  />
                  <Text
                    style={[
                      fontStyle("bold"),
                      {
                        fontSize: 9.5,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        color: colors.red.semantic,
                      },
                    ]}
                  >
                    Benchmark
                  </Text>
                </View>
              ) : null}
            </View>

            {/* DURATION */}
            <View style={{ width: PICKER_COL_BENCH_W, alignItems: "flex-end" }}>
              {drill.durationMin != null && drill.durationMin > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    gap: 2,
                  }}
                >
                  <Text
                    style={[
                      monoStyle("bold"),
                      {
                        fontSize: 13,
                        color: colors.text.primary,
                        letterSpacing: -0.2,
                      },
                    ]}
                  >
                    {drill.durationMin}
                  </Text>
                  <Text
                    style={[
                      monoStyle("medium"),
                      {
                        fontSize: 10,
                        color: colors.text.muted,
                        letterSpacing: 0.4,
                      },
                    ]}
                  >
                    m
                  </Text>
                </View>
              ) : (
                <Text
                  style={[
                    monoStyle("medium"),
                    {
                      fontSize: 11,
                      color: colors.text.muted,
                      letterSpacing: 0.4,
                    },
                  ]}
                >
                  —
                </Text>
              )}
            </View>


            {/* Add / added / pair icon */}
            <View style={{ width: PICKER_COL_ACTION_W, alignItems: "center" }}>
              <Ionicons
                name={
                  pairMode
                    ? "link"
                    : added
                    ? "checkmark-circle"
                    : "add-circle"
                }
                size={22}
                color={
                  pairMode
                    ? colors.team.violet
                    : added
                    ? colors.lime[400]
                    : accentColor
                }
              />
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function DrillPickerModal({
  visible,
  onClose,
  drills,
  categories,
  addedIds,
  onAdd,
  onRemove,
  onCreateNew,
  pairMode,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  drills: LibraryDrill[];
  categories: Category[];
  addedIds: Set<string>;
  onAdd: (drillId: string) => void;
  onRemove: (drillId: string) => void;
  onCreateNew: () => void;
  pairMode?: boolean;
  onPick?: (drillId: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<string>(ALL);
  const [benchmarkOnly, setBenchmarkOnly] = useState(false);
  const [search, setSearch] = useState("");

  const categoryById = useMemo(() => {
    const m = new Map<string, LibraryCategory>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const drillCountByCategoryId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of categories) m[c.id] = 0;
    for (const d of drills) {
      for (const id of d.categoryIds) {
        if (id in m) m[id]++;
      }
    }
    return m;
  }, [drills, categories]);

  const benchmarkDrillCount = useMemo(
    () => drills.filter((d) => d.benchmarkTypes.length > 0).length,
    [drills]
  );

  // Phases first, then skills — each filtered to those that have at least one
  // drill in the team's library. Empty categories stay hidden until tagged.
  const filterSkills = useMemo(
    () =>
      categories.filter(
        (c) => c.type === "skill" && (drillCountByCategoryId[c.id] ?? 0) > 0
      ),
    [categories, drillCountByCategoryId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drills.filter((d) => {
      const categoryMatch =
        activeCategory === ALL || d.categoryIds.includes(activeCategory);
      const searchMatch = q.length === 0 || d.name.toLowerCase().includes(q);
      const benchmarkMatch = !benchmarkOnly || d.benchmarkTypes.length > 0;
      return categoryMatch && searchMatch && benchmarkMatch;
    });
  }, [drills, activeCategory, benchmarkOnly, search]);

  // Phase-driven sections: Warm Up at the top, Agilities right below, the
  // remaining phases in natural order, Conditioning at the bottom, then an
  // Unsorted catch-all. Empty buckets stay hidden.
  const sectionedDrills = useMemo(() => {
    type Section = {
      key: string;
      label: string;
      color: string;
      drills: LibraryDrill[];
    };
    const byPhaseId = new Map<string, LibraryDrill[]>();
    const unsorted: LibraryDrill[] = [];
    for (const d of filtered) {
      const phaseId = d.categoryIds.find(
        (id) => categoryById.get(id)?.type === "phase"
      );
      if (phaseId) {
        const list = byPhaseId.get(phaseId) ?? [];
        list.push(d);
        byPhaseId.set(phaseId, list);
      } else {
        unsorted.push(d);
      }
    }

    const phasesAll = categories.filter((c) => c.type === "phase");
    const PINNED_TOP_KEYS: ReadonlyArray<string> = ["warmup", "agilities"];
    const PINNED_BOTTOM_KEYS: ReadonlyArray<string> = ["conditioning"];
    const phaseByNormalizedKey = (key: string) =>
      phasesAll.find((p) => normalizeCategory(p.name) === key);
    const topPinned = PINNED_TOP_KEYS.map(phaseByNormalizedKey).filter(
      (p): p is LibraryCategory => !!p
    );
    const bottomPinned = PINNED_BOTTOM_KEYS.map(phaseByNormalizedKey).filter(
      (p): p is LibraryCategory => !!p
    );
    const pinnedIds = new Set(
      [...topPinned, ...bottomPinned].map((p) => p.id)
    );

    const pushPhase = (sections: Section[], p: LibraryCategory) => {
      const list = byPhaseId.get(p.id) ?? [];
      if (list.length === 0) return;
      sections.push({ key: p.id, label: p.name, color: p.color, drills: list });
    };

    const sections: Section[] = [];
    for (const p of topPinned) pushPhase(sections, p);
    for (const p of phasesAll) {
      if (pinnedIds.has(p.id)) continue;
      pushPhase(sections, p);
    }
    for (const p of bottomPinned) pushPhase(sections, p);
    if (unsorted.length > 0) {
      sections.push({
        key: "unsorted",
        label: "Unsorted",
        color: colors.text.muted,
        drills: unsorted,
      });
    }
    return sections;
  }, [filtered, categories, categoryById]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.border.subtle,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={[
                fontStyle("medium"),
                {
                  fontSize: 20,
                  lineHeight: 28,
                  fontWeight: fontWeight.medium,
                  color: colors.text.primary,
                },
              ]}
            >
              {pairMode ? "Pair a drill" : "Add Drills"}
            </Text>
            {pairMode ? (
              <Text
                style={[
                  fontStyle("regular"),
                  { fontSize: 12, color: colors.text.secondary, marginTop: 1 },
                ]}
              >
                Runs in the same time slot — counts once.
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={onCreateNew}
            hitSlop={12}
            accessibilityLabel="Create new drill"
            activeOpacity={0.6}
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="add" size={24} color={colors.orange[500]} />
          </TouchableOpacity>
        </View>

        {drills.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: spacing.xl,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                color: colors.text.secondary,
                textAlign: "center",
              }}
            >
              No published drills yet. Create a drill from the Drills tab to
              add one here.
            </Text>
          </View>
        ) : (
          <>
            <View
              style={{
                paddingHorizontal: spacing.xl,
                paddingTop: spacing.md,
                paddingBottom: spacing.md,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.surface.raised,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border.card,
                  paddingHorizontal: spacing.md,
                  minHeight: 44,
                }}
              >
                <Ionicons
                  name="search"
                  size={18}
                  color={colors.text.muted}
                  style={{ marginRight: spacing.sm }}
                />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search drills..."
                  placeholderTextColor={colors.text.muted}
                  style={{
                    flex: 1,
                    fontSize: 15,
                    color: colors.text.primary,
                    paddingVertical: spacing.sm,
                  }}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {search.length > 0 && (
                  <Pressable
                    onPress={() => setSearch("")}
                    hitSlop={8}
                    accessibilityLabel="Clear search"
                  >
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={colors.text.muted}
                    />
                  </Pressable>
                )}
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{
                paddingHorizontal: spacing.xl,
                paddingBottom: spacing.md,
                gap: spacing.sm,
                alignItems: "center",
              }}
            >
              <SkillFilterChip
                label="All"
                count={drills.length}
                active={activeCategory === ALL && !benchmarkOnly}
                onPress={() => {
                  setActiveCategory(ALL);
                  setBenchmarkOnly(false);
                }}
              />
              {/* Phases now render as structural sections in the list below,
                  so the chip row only carries skills + the Benchmark toggle. */}
              {filterSkills.map((c) => (
                <SkillFilterChip
                  key={c.id}
                  label={c.name}
                  count={drillCountByCategoryId[c.id] ?? 0}
                  color={c.color}
                  active={activeCategory === c.id}
                  onPress={() => setActiveCategory(c.id)}
                />
              ))}
              {benchmarkDrillCount > 0 ? (
                <SkillFilterChip
                  label="Benchmark"
                  count={benchmarkDrillCount}
                  color={colors.red.semantic}
                  active={benchmarkOnly}
                  onPress={() => setBenchmarkOnly((v) => !v)}
                />
              ) : null}
            </ScrollView>

            {sectionedDrills.length === 0 ? (
              <View
                style={{
                  marginHorizontal: spacing.xl,
                  padding: spacing["2xl"],
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border.default,
                  borderStyle: "dashed",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    lineHeight: 22,
                    color: colors.text.secondary,
                    textAlign: "center",
                  }}
                >
                  No drills match your filters.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: spacing.xl,
                  paddingTop: spacing.xs,
                  paddingBottom: spacing["3xl"],
                }}
                keyboardShouldPersistTaps="handled"
              >
                {sectionedDrills.map((section) => (
                  <View
                    key={section.key}
                    style={{ marginBottom: spacing.lg }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingTop: spacing.md,
                        paddingBottom: spacing.sm,
                      }}
                    >
                      <Text
                        style={[
                          fontStyle("bold"),
                          {
                            fontSize: 12,
                            letterSpacing: tracking.loose,
                            textTransform: "uppercase",
                            color: section.color,
                          },
                        ]}
                      >
                        {section.label}
                      </Text>
                      <Text
                        style={[
                          monoStyle("medium"),
                          {
                            fontSize: 11,
                            color: colors.text.muted,
                            letterSpacing: 0.4,
                          },
                        ]}
                      >
                        {section.drills.length}{" "}
                        {section.drills.length === 1 ? "drill" : "drills"}
                      </Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: colors.surface.raised,
                        borderRadius: radius.lg,
                        borderWidth: 1,
                        borderColor: colors.border.card,
                        overflow: "hidden",
                      }}
                    >
                      <PickerTableHeader />
                      {section.drills.map((d, i) => (
                        <PickerDrillRow
                          key={d.id}
                          drill={d}
                          byId={categoryById}
                          added={addedIds.has(d.id)}
                          onAdd={() => onAdd(d.id)}
                          onRemove={() => onRemove(d.id)}
                          isFirst={i === 0}
                          pairMode={pairMode}
                          onPick={() => onPick?.(d.id)}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </>
        )}

        {/* Sticky footer: Done dismisses the picker */}
        <View
          style={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: spacing.lg,
            borderTopWidth: 1,
            borderTopColor: colors.border.subtle,
            backgroundColor: colors.surface.base,
          }}
        >
          <Button label="Done" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

// ── RSVP — pick which roster players are attending ───────────────────
// ── RSVP roster table ────────────────────────────────────────────────
const RSVP_COL_NUM_W = 26;
const RSVP_COL_POS_W = 88;
const RSVP_COL_ACTION_W = 26;

function RsvpHeaderCell({
  label,
  width,
  flex,
}: {
  label: string;
  width?: number;
  flex?: number;
}) {
  return (
    <Text
      style={[
        fontStyle("bold"),
        {
          width,
          flex,
          fontSize: 9.5,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: colors.text.muted,
        },
      ]}
    >
      {label}
    </Text>
  );
}

// Offense / defense tally of attending players, by primary position.
function RsvpSideStat({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 3.5,
          backgroundColor: color,
        }}
      />
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 10,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: colors.text.muted,
          },
        ]}
      >
        {label}
      </Text>
      <Text style={[monoStyle("bold"), { fontSize: 15, color }]}>
        {count}
      </Text>
    </View>
  );
}

function AttendanceModal({
  visible,
  onClose,
  players,
  attendingIds,
  onToggle,
}: {
  visible: boolean;
  onClose: () => void;
  players: RosterPlayer[];
  attendingIds: Set<string>;
  onToggle: (playerId: string) => void;
}) {
  const attending = players.filter((p) => attendingIds.has(p.id));
  const attendingCount = attending.length;
  // Tally attending players by their primary position's side.
  let offenseCount = 0;
  let defenseCount = 0;
  for (const p of attending) {
    const side = sideForPositions(p.positions);
    if (side === "offense") offenseCount += 1;
    else if (side === "defense") defenseCount += 1;
  }
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
        <View
          style={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing.md,
          }}
        >
          <Text
            style={[
              fontStyle("medium"),
              {
                fontSize: 20,
                lineHeight: 28,
                fontWeight: fontWeight.medium,
                color: colors.text.primary,
              },
            ]}
          >
            Who's coming
          </Text>
          <Text
            style={[
              fontStyle("regular"),
              { fontSize: 13, color: colors.text.secondary, marginTop: 1 },
            ]}
          >
            {players.length === 0
              ? "No players on the roster yet."
              : `${attendingCount} of ${players.length} attending`}
          </Text>
        </View>

        {players.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: spacing.xl,
            }}
          >
            <Ionicons
              name="people-outline"
              size={44}
              color={colors.text.muted}
            />
            <Text
              style={{
                marginTop: spacing.md,
                fontSize: 15,
                lineHeight: 22,
                color: colors.text.secondary,
                textAlign: "center",
              }}
            >
              Add players on the Roster tab to track who's coming to practice.
            </Text>
          </View>
        ) : (
          <>
            {/* Table header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "stretch",
                backgroundColor: colors.surface.raised,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: colors.border.subtle,
              }}
            >
              <View style={{ width: 5 }} />
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingLeft: 14,
                  paddingRight: spacing.xl,
                  paddingVertical: 9,
                }}
              >
                <RsvpHeaderCell label="#" width={RSVP_COL_NUM_W} />
                <RsvpHeaderCell label="First name" flex={1} />
                <RsvpHeaderCell label="Last name" flex={1} />
                <RsvpHeaderCell label="Pos." width={RSVP_COL_POS_W} />
                <View style={{ width: RSVP_COL_ACTION_W }} />
              </View>
            </View>

            {/* Rows */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: spacing["3xl"] }}
              keyboardShouldPersistTaps="handled"
            >
              {players.map((p, i) => {
                const on = attendingIds.has(p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => onToggle(p.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    {({ pressed }) => (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "stretch",
                          backgroundColor: on
                            ? colors.surface.raised
                            : "transparent",
                          opacity: pressed ? 0.85 : 1,
                        }}
                      >
                        {/* Offense / defense side bar — short centered accent */}
                        <View
                          style={{
                            width: 5,
                            height: 30,
                            alignSelf: "center",
                            borderRadius: 2.5,
                            backgroundColor: p.color,
                          }}
                        />
                        <View
                          style={{
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            paddingLeft: 14,
                            paddingRight: spacing.xl,
                            paddingVertical: 22,
                            borderTopWidth: i === 0 ? 0 : 1,
                            borderTopColor: colors.border.subtle,
                          }}
                        >
                          <Text
                            style={[
                              monoStyle("medium"),
                              {
                                width: RSVP_COL_NUM_W,
                                fontSize: 12,
                                color: p.jersey
                                  ? colors.text.secondary
                                  : colors.text.muted,
                              },
                            ]}
                          >
                            {p.jersey ?? "—"}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={[
                              fontStyle("medium"),
                              {
                                flex: 1,
                                fontSize: 15,
                                fontWeight: fontWeight.medium,
                                color: colors.text.primary,
                              },
                            ]}
                          >
                            {p.firstName || "—"}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={[
                              fontStyle("medium"),
                              {
                                flex: 1,
                                fontSize: 15,
                                fontWeight: fontWeight.medium,
                                color: p.lastName
                                  ? colors.text.primary
                                  : colors.text.muted,
                              },
                            ]}
                          >
                            {p.lastName || "—"}
                          </Text>
                          <View
                            style={{
                              width: RSVP_COL_POS_W,
                              flexDirection: "row",
                              flexWrap: "wrap",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            {p.positions.length === 0 ? (
                              <Text
                                style={[
                                  monoStyle("medium"),
                                  { fontSize: 12, color: colors.text.muted },
                                ]}
                              >
                                —
                              </Text>
                            ) : (
                              p.positions.map((pos) => (
                                <View
                                  key={pos}
                                  style={{
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 4,
                                    backgroundColor: positionTint(pos),
                                  }}
                                >
                                  <Text
                                    style={[
                                      fontStyle("bold"),
                                      {
                                        fontSize: 9,
                                        letterSpacing: 0.3,
                                        color: positionColor(pos),
                                      },
                                    ]}
                                  >
                                    {pos}
                                  </Text>
                                </View>
                              ))
                            )}
                          </View>
                          <View
                            style={{
                              width: RSVP_COL_ACTION_W,
                              alignItems: "flex-end",
                            }}
                          >
                            {on ? (
                              <Ionicons
                                name="checkmark"
                                size={22}
                                color={colors.lime[400]}
                              />
                            ) : null}
                          </View>
                        </View>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        <View
          style={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: spacing.lg,
            borderTopWidth: 1,
            borderTopColor: colors.border.subtle,
            backgroundColor: colors.surface.base,
          }}
        >
          {players.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: spacing.lg,
                marginBottom: spacing.md,
              }}
            >
              <RsvpSideStat
                label="Offense"
                count={offenseCount}
                color={sideAccent("offense")}
              />
              <View
                style={{
                  width: 1,
                  height: 16,
                  backgroundColor: colors.border.strong,
                }}
              />
              <RsvpSideStat
                label="Defense"
                count={defenseCount}
                color={sideAccent("defense")}
              />
            </View>
          ) : null}
          <Button label="Done" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

export function PracticePlanForm({
  teamId,
  drills,
  categories,
  players,
  initial,
  topInset,
  bottomInset,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const isEditing = !!initial;
  const status: PlanStatus = initial?.status ?? "draft";

  const [practiceDate, setPracticeDate] = useState(
    initial?.practiceDate ?? nextSundayIso()
  );
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [planBlocks, setPlanBlocks] = useState<PlanBlock[]>(
    initial?.blocks ?? []
  );
  const [planDrills, setPlanDrills] = useState<PlanDrill[]>(
    initial?.drills ?? []
  );
  // Top-level water breaks. Indexed by (afterBlockOrder, breakOrder) where
  // afterBlockOrder is a slot tied to a position, not a specific block —
  // block reorders leave breaks where they are.
  const [planBreaks, setPlanBreaks] = useState<PlanBreak[]>(
    initial?.breaks ?? []
  );

  // The team's block library, loaded once. Refreshed after the coach adds a
  // custom block so the sheet shows it on the next open.
  const [blockTemplates, setBlockTemplates] = useState<BlockTemplate[]>([]);
  const [blockSheetOpen, setBlockSheetOpen] = useState(false);

  const refreshBlockTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from("team_practice_blocks")
      .select("id, name, display_order")
      .eq("team_id", teamId)
      .order("display_order", { ascending: true });
    if (error) {
      // Migration 42 not applied — the sheet still works, the coach just
      // can't see saved templates yet. Don't crash.
      console.warn("[practice] block templates load error", error.message);
      setBlockTemplates([]);
      return;
    }
    setBlockTemplates(
      (data ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        displayOrder: (r.display_order as number) ?? 0,
      }))
    );
  }, [teamId]);

  useEffect(() => {
    refreshBlockTemplates();
  }, [refreshBlockTemplates]);

  // On a brand-new practice (no `initial`) once the team library loads,
  // seed the four default blocks into the plan so the coach starts with
  // structure instead of an empty timeline. Only fires when planBlocks is
  // empty so we don't clobber the coach's edits if they're mid-build.
  // Editing an existing plan never seeds because initial?.blocks is set.
  const didSeedRef = useRef(false);
  useEffect(() => {
    if (didSeedRef.current) return;
    if (initial) {
      didSeedRef.current = true;
      return;
    }
    if (blockTemplates.length === 0) return;
    if (planBlocks.length > 0) return;
    didSeedRef.current = true;
    setPlanBlocks(
      blockTemplates.map((t) => ({
        localId: makeLocalId(),
        templateId: t.id,
        name: t.name,
        targetMinutes: null,
      }))
    );
  }, [initial, blockTemplates, planBlocks.length]);

  // Active block for picker targeting. Set when the coach taps "+ Add drill"
  // inside a particular block; nulled when they cancel/finish.
  const [pickerBlockId, setPickerBlockId] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  // localId of the drill whose card is expanded (one at a time), and the
  // drill a "Pair" action is targeting (drives the picker's pair mode).
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [pairTargetId, setPairTargetId] = useState<string | null>(null);
  // RSVP — set of roster player ids marked attending; modal toggles them.
  const [attendingIds, setAttendingIds] = useState<Set<string>>(
    () => new Set(initial?.attendingIds ?? [])
  );
  const [rsvpModalOpen, setRsvpModalOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<{
    drillId: string;
    drillName: string;
  } | null>(null);
  // A ref (not state) so toggling it doesn't change the useCallback identity
  // below — that re-render would cause useFocusEffect to re-fire while the
  // form is still focused, reopening the picker on top of the navigation.
  const reopenPickerOnFocusRef = useRef(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // App-styled confirm/error modal (replaces native Alert.alert).
  const { show: showModal, showError, modalProps } = useActionModal();

  useFocusEffect(
    useCallback(() => {
      if (reopenPickerOnFocusRef.current) {
        setPickerOpen(true);
        reopenPickerOnFocusRef.current = false;
      }
    }, [])
  );

  const handleCreateNewDrill = () => {
    setPickerOpen(false);
    reopenPickerOnFocusRef.current = true;
    // Pass the current practice form path so /drills/new can navigate
    // straight back here on save. Plain router.back() would only pop the
    // drills stack and leave the user on /drills (the library), since the
    // push crossed tabs into the drills stack.
    const returnTo = encodeURIComponent(pathname);
    router.push(`/drills/new?returnTo=${returnTo}` as never);
  };

  const drillsById = useMemo(() => {
    const map = new Map<string, LibraryDrill>();
    for (const d of drills) map.set(d.id, d);
    return map;
  }, [drills]);

  const categoryById = useMemo(() => {
    const map = new Map<string, LibraryCategory>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  // Set of drillIds already in the picker's active block. The picker uses
  // this to flip Add ↔ Remove. Scoping per-block lets a drill exist in
  // multiple blocks (e.g. a warm-up rep and a skill rep of the same drill).
  const addedIds = useMemo(() => {
    const target = pickerBlockId;
    if (!target) return new Set<string>();
    return new Set(
      planDrills
        .filter((d) => d.planBlockLocalId === target && d.drillId !== null)
        .map((d) => d.drillId as string)
    );
  }, [planDrills, pickerBlockId]);

  // ── Render-block model ─────────────────────────────────────────────
  // Inside one practice block, rows sharing a non-null parallelGroup (kept
  // consecutive) form one parallel render block. Water breaks and ungrouped
  // drills are their own render block. The indices stored in `rowIndices`
  // are global into the flat planDrills array.
  function buildRenderBlocks(rows: PlanDrill[]): RenderBlock[] {
    const result: RenderBlock[] = [];
    let i = 0;
    while (i < rows.length) {
      const pd = rows[i];
      const globalIdx = planDrills.indexOf(pd);
      if (pd.isWaterBreak) {
        result.push({ key: pd.localId, kind: "water", rowIndices: [globalIdx] });
        i += 1;
        continue;
      }
      if (pd.parallelGroup != null) {
        const g = pd.parallelGroup;
        const idxs: number[] = [];
        while (
          i < rows.length &&
          !rows[i].isWaterBreak &&
          rows[i].parallelGroup === g
        ) {
          idxs.push(planDrills.indexOf(rows[i]));
          i += 1;
        }
        if (idxs.length >= 2) {
          result.push({
            key: planDrills[idxs[0]].localId,
            kind: "parallel",
            rowIndices: idxs,
          });
        } else {
          for (const x of idxs) {
            result.push({
              key: planDrills[x].localId,
              kind: "single",
              rowIndices: [x],
            });
          }
        }
        continue;
      }
      result.push({ key: pd.localId, kind: "single", rowIndices: [globalIdx] });
      i += 1;
    }
    return result;
  }

  // Render blocks per practice block, keyed by planBlock localId. Read by
  // the timeline render below.
  const renderBlocksByBlock = useMemo(() => {
    const map = new Map<string, RenderBlock[]>();
    for (const b of planBlocks) {
      const rows = planDrills.filter((d) => d.planBlockLocalId === b.localId);
      map.set(b.localId, buildRenderBlocks(rows));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planBlocks, planDrills]);

  // Per-block totals (sum of render-block durations inside this block).
  // A parallel render-block still counts once.
  const blockTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const [blockId, rbs] of renderBlocksByBlock) {
      const total = rbs.reduce(
        (s, b) => s + (planDrills[b.rowIndices[0]]?.durationMinutes || 0),
        0
      );
      map.set(blockId, total);
    }
    return map;
  }, [renderBlocksByBlock, planDrills]);

  const totalDuration = useMemo(
    () => Array.from(blockTotals.values()).reduce((s, n) => s + n, 0),
    [blockTotals]
  );

  const practiceMinutes = useMemo(() => {
    if (!startTime || !endTime) return null;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
    const diff = eh * 60 + em - (sh * 60 + sm);
    return diff > 0 ? diff : null;
  }, [startTime, endTime]);

  const remainingMinutes =
    practiceMinutes != null ? practiceMinutes - totalDuration : null;
  const overWindow = remainingMinutes != null && remainingMinutes < 0;

  // Start time per render block, scoped within its practice block. The
  // first render block in each practice block starts at the running clock
  // total. Returned as Map<renderBlockKey, startClock>.
  const renderBlockStarts = useMemo(() => {
    const map = new Map<string, string>();
    if (!startTime) return map;
    let acc = 0;
    for (const b of planBlocks) {
      const rbs = renderBlocksByBlock.get(b.localId) ?? [];
      for (const rb of rbs) {
        map.set(rb.key, addMinutesToTime(startTime, acc));
        acc += planDrills[rb.rowIndices[0]]?.durationMinutes || 0;
      }
    }
    return map;
  }, [planBlocks, renderBlocksByBlock, planDrills, startTime]);

  // Start clock per practice block — first render block's start in each.
  const planBlockStarts = useMemo(() => {
    const map = new Map<string, string>();
    if (!startTime) return map;
    let acc = 0;
    for (const b of planBlocks) {
      map.set(b.localId, addMinutesToTime(startTime, acc));
      acc += blockTotals.get(b.localId) ?? 0;
    }
    return map;
  }, [planBlocks, blockTotals, startTime]);

  const computedEndTime = startTime ? addMinutesToTime(startTime, totalDuration) : "";
  const headerEndDisplay = endTime || computedEndTime;

  const completionPct = useMemo(() => {
    const filled =
      (practiceDate ? 1 : 0) +
      (title.trim() ? 1 : 0) +
      (planDrills.length ? 1 : 0) +
      (notes.trim() ? 1 : 0) +
      (startTime ? 1 : 0);
    return Math.round((filled / 5) * 100);
  }, [practiceDate, title, planDrills.length, notes, startTime]);

  // Sequence for new parallel-group ids — starts above any loaded id.
  const parallelGroupSeq = useRef(
    (initial?.drills ?? []).reduce(
      (m, d) => Math.max(m, d.parallelGroup ?? 0),
      0
    ) + 1
  );

  // ── Practice block helpers ─────────────────────────────────────────
  // Drills are partitioned by planBlockLocalId. Order within a block is
  // the order rows appear in planDrills (we keep them grouped contiguously).

  const drillsByBlock = useMemo(() => {
    const map = new Map<string, PlanDrill[]>();
    for (const b of planBlocks) map.set(b.localId, []);
    for (const d of planDrills) {
      const list = map.get(d.planBlockLocalId);
      if (list) list.push(d);
      // Drills whose block was deleted are dropped from rendering — they
      // get pruned in the same setPlanBlocks call that removes the block.
    }
    return map;
  }, [planBlocks, planDrills]);

  const addBlockFromTemplate = (template: BlockTemplate) => {
    setPlanBlocks((prev) => [
      ...prev,
      {
        localId: makeLocalId(),
        templateId: template.id,
        name: template.name,
        targetMinutes: null,
      },
    ]);
  };

  // Add a brand-new block by name. If the name matches an existing template
  // (case-insensitive), reuse that template id so we don't double up.
  // Otherwise the templateId stays null and persistPlan will insert it into
  // team_practice_blocks before the RPC payload is sent.
  const addBlockByName = (rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    const existing = blockTemplates.find(
      (t) => t.name.toLowerCase() === name.toLowerCase()
    );
    setPlanBlocks((prev) => [
      ...prev,
      {
        localId: makeLocalId(),
        templateId: existing?.id ?? null,
        name: existing?.name ?? name,
        targetMinutes: null,
      },
    ]);
  };

  const removePlanBlock = (blockLocalId: string) => {
    // Identify the index of the block being removed so we can remap
    // top-level break slots: breaks "after" the removed block disappear,
    // and breaks below shift up by one slot.
    const removedIdx = planBlocks.findIndex((b) => b.localId === blockLocalId);
    setPlanBlocks((prev) => prev.filter((b) => b.localId !== blockLocalId));
    setPlanDrills((prev) =>
      prev.filter((d) => d.planBlockLocalId !== blockLocalId)
    );
    if (removedIdx === -1) return;
    setPlanBreaks((prev) =>
      prev
        .filter((br) => br.afterBlockOrder !== removedIdx)
        .map((br) =>
          br.afterBlockOrder > removedIdx
            ? { ...br, afterBlockOrder: br.afterBlockOrder - 1 }
            : br
        )
    );
  };

  const moveBlockMeta = (blockLocalId: string, dir: -1 | 1) => {
    const idx = planBlocks.findIndex((b) => b.localId === blockLocalId);
    if (idx === -1) return;
    const j = idx + dir;
    if (j < 0 || j >= planBlocks.length) return;
    const reordered = planBlocks.slice();
    [reordered[idx], reordered[j]] = [reordered[j], reordered[idx]];
    setPlanBlocks(reordered);
    // Keep planDrills physically grouped by block order so the timeline
    // walks blocks top-to-bottom. Stable sort preserves drill order
    // inside each block.
    const orderMap = new Map<string, number>();
    reordered.forEach((b, i) => orderMap.set(b.localId, i));
    setPlanDrills((prev) =>
      prev.slice().sort((a, b) => {
        const ai = orderMap.get(a.planBlockLocalId) ?? 0;
        const bi = orderMap.get(b.planBlockLocalId) ?? 0;
        return ai - bi;
      })
    );
  };

  const updateBlockTarget = (blockLocalId: string, mins: number | null) => {
    setPlanBlocks((prev) =>
      prev.map((b) =>
        b.localId === blockLocalId ? { ...b, targetMinutes: mins } : b
      )
    );
  };

  const updateBlockName = (blockLocalId: string, name: string) => {
    setPlanBlocks((prev) =>
      prev.map((b) =>
        b.localId === blockLocalId ? { ...b, name } : b
      )
    );
  };

  const addDrill = (drillId: string, blockLocalId?: string) => {
    // Default to the picker's active block, then to the last block in the
    // plan, then no-op (caller should never invoke without at least one
    // block present in the UI).
    const targetBlockId =
      blockLocalId ??
      pickerBlockId ??
      planBlocks[planBlocks.length - 1]?.localId ??
      null;
    if (!targetBlockId) return;
    const newLocalId = makeLocalId();
    let didAdd = false;
    setPlanDrills((prev) => {
      // Dedupe within the same block — same drill twice across different
      // blocks is allowed (a coach may want a warm-up rep and a skill rep
      // of the same drill).
      if (
        prev.some(
          (d) =>
            d.drillId === drillId && d.planBlockLocalId === targetBlockId
        )
      ) {
        return prev;
      }
      didAdd = true;
      const lib = drillsById.get(drillId);
      const newRow: PlanDrill = {
        localId: newLocalId,
        planBlockLocalId: targetBlockId,
        drillId,
        durationMinutes: lib?.durationMin ?? 15,
        reps: lib?.reps ?? 0,
        isWaterBreak: false,
        notes: "",
        logNote: "",
        parallelGroup: null,
      };
      // Insert at the end of the target block so siblings stay grouped.
      const lastIdxInBlock = (() => {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].planBlockLocalId === targetBlockId) return i;
        }
        return -1;
      })();
      if (lastIdxInBlock === -1) {
        return [...prev, newRow];
      }
      return [
        ...prev.slice(0, lastIdxInBlock + 1),
        newRow,
        ...prev.slice(lastIdxInBlock + 1),
      ];
    });
    if (!didAdd) return;
    // Carry forward: seed log_note from the most recent prior practice that
    // used this drill. drill_id is team-unique and RLS scopes the query.
    (async () => {
      const { data } = await supabase
        .from("practice_plan_drills")
        .select("log_note, practice_plans!inner(practice_date)")
        .eq("drill_id", drillId)
        .not("log_note", "is", null);
      const rows = (data as Record<string, unknown>[] | null) ?? [];
      let best: { date: string; note: string } | null = null;
      for (const row of rows) {
        const planRaw = row.practice_plans;
        const plan = (Array.isArray(planRaw) ? planRaw[0] : planRaw) as
          | { practice_date: string }
          | null;
        const note = ((row.log_note as string | null) ?? "").trim();
        if (!plan || !note) continue;
        if (!best || plan.practice_date > best.date) {
          best = { date: plan.practice_date, note };
        }
      }
      if (!best) return;
      const seeded = best.note;
      setPlanDrills((prev) =>
        prev.map((d) =>
          d.localId === newLocalId && !d.logNote.trim()
            ? { ...d, logNote: seeded }
            : d
        )
      );
    })();
  };

  // Top-level water break helpers. afterBlockOrder is positional: -1 = top,
  // N = the gap after the block currently at index N. Block reorders don't
  // touch these; block deletes remap them (see removePlanBlock).
  const addTopLevelBreak = (afterBlockOrder: number) => {
    setPlanBreaks((prev) => {
      // breakOrder = next free slot in this gap so two stacked breaks
      // don't collide on the unique index server-side.
      const usedOrders = prev
        .filter((br) => br.afterBlockOrder === afterBlockOrder)
        .map((br) => br.breakOrder);
      const nextOrder = usedOrders.length
        ? Math.max(...usedOrders) + 1
        : 0;
      return [
        ...prev,
        {
          localId: makeLocalId(),
          afterBlockOrder,
          breakOrder: nextOrder,
          durationMinutes: 2,
        },
      ];
    });
  };

  const removeTopLevelBreak = (localId: string) => {
    setPlanBreaks((prev) => prev.filter((br) => br.localId !== localId));
  };

  const updateTopLevelBreakDuration = (
    localId: string,
    durationMinutes: number
  ) => {
    setPlanBreaks((prev) =>
      prev.map((br) =>
        br.localId === localId
          ? { ...br, durationMinutes: Math.max(1, durationMinutes) }
          : br
      )
    );
  };

  const addWaterBreak = (blockLocalId?: string) => {
    const targetBlockId =
      blockLocalId ?? planBlocks[planBlocks.length - 1]?.localId ?? null;
    if (!targetBlockId) return;
    // A water break is plan-only — it is NOT saved as a drill. It lives
    // purely as a flagged practice_plan_drills row (drill_id null).
    const newRow: PlanDrill = {
      localId: makeLocalId(),
      planBlockLocalId: targetBlockId,
      drillId: null,
      durationMinutes: 2,
      reps: 0,
      isWaterBreak: true,
      notes: "",
      logNote: "",
      parallelGroup: null,
    };
    setPlanDrills((prev) => {
      const lastIdxInBlock = (() => {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].planBlockLocalId === targetBlockId) return i;
        }
        return -1;
      })();
      if (lastIdxInBlock === -1) return [...prev, newRow];
      return [
        ...prev.slice(0, lastIdxInBlock + 1),
        newRow,
        ...prev.slice(lastIdxInBlock + 1),
      ];
    });
  };

  // Remove every row of a block as a unit (the drill-card trash action).
  const removeBlock = (rowIndices: number[]) => {
    const set = new Set(rowIndices);
    setPlanDrills((prev) => prev.filter((_, i) => !set.has(i)));
  };

  const removeDrillById = (drillId: string) => {
    // Removes the matching row inside the picker's active block. The
    // picker only ever shows the current block's drills as "added", so the
    // search is scoped accordingly. If the row was in a parallel group, a
    // lone survivor is un-grouped.
    const target = pickerBlockId;
    setPlanDrills((prev) => {
      const idx = prev.findIndex(
        (d) =>
          d.drillId === drillId &&
          (target == null || d.planBlockLocalId === target)
      );
      if (idx === -1) return prev;
      const g = prev[idx].parallelGroup;
      let next = prev.filter((_, i) => i !== idx);
      if (g != null && next.filter((d) => d.parallelGroup === g).length < 2) {
        next = next.map((d) =>
          d.parallelGroup === g ? { ...d, parallelGroup: null } : d
        );
      }
      return next;
    });
  };

  // Move a render block up/down inside its practice block. Render blocks
  // are contiguous index ranges inside planDrills, so adjacent ones swap
  // by swapping their two contiguous slices. The caller passes the
  // practice block id so we can boundary-check without scanning the
  // whole timeline.
  const moveBlock = (
    planBlockId: string,
    rbIndex: number,
    dir: -1 | 1
  ) => {
    const rbs = renderBlocksByBlock.get(planBlockId) ?? [];
    const j = rbIndex + dir;
    if (j < 0 || j >= rbs.length) return;
    const a = rbs[rbIndex];
    const b = rbs[j];
    setPlanDrills((prev) => {
      const [first, second] =
        a.rowIndices[0] < b.rowIndices[0] ? [a, b] : [b, a];
      const start = first.rowIndices[0];
      const end = second.rowIndices[second.rowIndices.length - 1];
      const firstRows = first.rowIndices.map((i) => prev[i]);
      const secondRows = second.rowIndices.map((i) => prev[i]);
      return [
        ...prev.slice(0, start),
        ...secondRows,
        ...firstRows,
        ...prev.slice(end + 1),
      ];
    });
  };

  // Duration is shared across a parallel block — write to every sibling row.
  const updateBlockDuration = (rowIndices: number[], value: string) => {
    const parsed = parseInt(value, 10);
    const dur = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    const set = new Set(rowIndices);
    setPlanDrills((prev) =>
      prev.map((d, i) => (set.has(i) ? { ...d, durationMinutes: dur } : d))
    );
  };

  // Cues / notes are per-drill — never shared across a parallel block.
  const updateRowNotes = (rowIdx: number, value: string) => {
    setPlanDrills((prev) =>
      prev.map((d, i) => (i === rowIdx ? { ...d, notes: value } : d))
    );
  };

  // Pull one drill out of its parallel block. The freed row is parked just
  // after its former siblings so siblings stay consecutive; if the block
  // drops below 2 drills the survivor is un-grouped too.
  const unpairDrill = (rowIdx: number) => {
    setPlanDrills((prev) => {
      const row = prev[rowIdx];
      const g = row?.parallelGroup;
      if (g == null) return prev;
      const groupIdxs = prev
        .map((d, i) => (d.parallelGroup === g ? i : -1))
        .filter((i) => i >= 0);
      const lastIdx = groupIdxs[groupIdxs.length - 1];
      const without = prev.filter((_, i) => i !== rowIdx);
      let insertAt = lastIdx + 1;
      if (rowIdx < insertAt) insertAt -= 1;
      let next = [
        ...without.slice(0, insertAt),
        { ...row, parallelGroup: null },
        ...without.slice(insertAt),
      ];
      if (next.filter((d) => d.parallelGroup === g).length < 2) {
        next = next.map((d) =>
          d.parallelGroup === g ? { ...d, parallelGroup: null } : d
        );
      }
      return next;
    });
  };

  // Pair the picked drill into the target drill's block (max 3 drills).
  // An existing plan drill is moved in; a brand-new one is inserted.
  // The pair always lives in the target's planBlock — pairing across
  // practice blocks is rejected at the picker level, so we only need to
  // honor it here.
  const pairDrillIntoTarget = (targetLocalId: string, drillId: string) => {
    setPlanDrills((prev) => {
      const targetIdx = prev.findIndex((d) => d.localId === targetLocalId);
      if (targetIdx === -1) return prev;
      const planBlockId = prev[targetIdx].planBlockLocalId;
      let arr = prev.slice();
      let group = arr[targetIdx].parallelGroup;
      if (group == null) {
        group = parallelGroupSeq.current;
        parallelGroupSeq.current += 1;
        const gid = group;
        arr = arr.map((d) =>
          d.localId === targetLocalId ? { ...d, parallelGroup: gid } : d
        );
      }
      const groupIdxs = arr
        .map((d, i) => (d.parallelGroup === group ? i : -1))
        .filter((i) => i >= 0);
      if (groupIdxs.length >= 3) return prev; // block already full
      const head = arr[groupIdxs[0]];
      const blockDur = head.durationMinutes;
      // Only match an existing plan row that's already inside the same
      // practice block (cross-block reuse would silently move the row
      // and confuse the coach).
      const existingIdx = arr.findIndex(
        (d) => d.drillId === drillId && d.planBlockLocalId === planBlockId
      );
      if (existingIdx !== -1) {
        if (arr[existingIdx].parallelGroup === group) return prev; // already here
        const oldGroup = arr[existingIdx].parallelGroup;
        const moved: PlanDrill = {
          ...arr[existingIdx],
          parallelGroup: group,
          durationMinutes: blockDur,
        };
        arr = arr.filter((_, i) => i !== existingIdx);
        const insertAt = arr.reduce(
          (acc, d, i) => (d.parallelGroup === group ? i + 1 : acc),
          0
        );
        arr = [...arr.slice(0, insertAt), moved, ...arr.slice(insertAt)];
        if (
          oldGroup != null &&
          oldGroup !== group &&
          arr.filter((d) => d.parallelGroup === oldGroup).length < 2
        ) {
          arr = arr.map((d) =>
            d.parallelGroup === oldGroup ? { ...d, parallelGroup: null } : d
          );
        }
        return arr;
      }
      const lib = drillsById.get(drillId);
      const fresh: PlanDrill = {
        localId: makeLocalId(),
        planBlockLocalId: planBlockId,
        drillId,
        durationMinutes: blockDur,
        reps: lib?.reps ?? 0,
        isWaterBreak: false,
        notes: "",
        logNote: "",
        parallelGroup: group,
      };
      const lastIdx = groupIdxs[groupIdxs.length - 1];
      return [...arr.slice(0, lastIdx + 1), fresh, ...arr.slice(lastIdx + 1)];
    });
  };

  // Cross-block move. The drill is appended to the end of the target block
  // and stripped of its parallel_group (a parallel group cannot span blocks,
  // and the siblings can't follow). If the source group ends up with a lone
  // survivor it's un-grouped too.
  const moveDrillToBlock = (rowIdx: number, targetBlockId: string) => {
    setPlanDrills((prev) => {
      if (rowIdx < 0 || rowIdx >= prev.length) return prev;
      const row = prev[rowIdx];
      if (row.planBlockLocalId === targetBlockId) return prev;
      const oldGroup = row.parallelGroup;
      const moved: PlanDrill = {
        ...row,
        planBlockLocalId: targetBlockId,
        parallelGroup: null,
      };
      let next = prev.filter((_, i) => i !== rowIdx);
      // Insert at the end of the target block.
      let insertAt = next.length;
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].planBlockLocalId === targetBlockId) {
          insertAt = i + 1;
          break;
        }
        if (i === 0) insertAt = next.length; // target block is empty — append at end
      }
      next = [...next.slice(0, insertAt), moved, ...next.slice(insertAt)];
      // Clean up an orphaned parallel group (now has 1 sibling).
      if (
        oldGroup != null &&
        next.filter((d) => d.parallelGroup === oldGroup).length < 2
      ) {
        next = next.map((d) =>
          d.parallelGroup === oldGroup ? { ...d, parallelGroup: null } : d
        );
      }
      return next;
    });
  };

  // Sheet target for the cross-block move action.
  const [moveSheet, setMoveSheet] = useState<{
    rowIdx: number;
    fromBlockId: string;
  } | null>(null);

  const openPairPicker = (targetLocalId: string, planBlockId: string) => {
    setExpandedRowId(null);
    setPickerBlockId(planBlockId);
    setPairTargetId(targetLocalId);
    setPickerOpen(true);
  };

  const handlePick = (drillId: string) => {
    if (pairTargetId) pairDrillIntoTarget(pairTargetId, drillId);
    setPairTargetId(null);
    setPickerOpen(false);
    // Keep pickerBlockId set briefly so re-opening the picker for the same
    // block re-uses it; reset on explicit close instead.
  };

  // Resolve a plan row to the display data the block cards need.
  const resolveRow = (pd: PlanDrill | undefined) => {
    const d = pd?.drillId ? drillsById.get(pd.drillId) : undefined;
    let phaseName: string | null = null;
    for (const cid of d?.categoryIds ?? []) {
      const cat = categoryById.get(cid);
      if (cat?.type === "phase") {
        phaseName = cat.name;
        break;
      }
    }
    const accentName = phaseName ?? d?.categoryNames?.[0] ?? null;
    return {
      name: d?.name ?? "Unknown drill",
      phaseName,
      isBenchmark: (d?.benchmarkTypes?.length ?? 0) > 0,
      description: d?.description ?? null,
      accent: accentName ? colorForCategory(accentName) : colors.text.muted,
      accentTint: accentName
        ? tintForCategory(accentName)
        : colors.surface.elevated,
    };
  };

  // RSVP — players (active roster) marked attending, in roster order.
  const attendingPlayers = useMemo(
    () => players.filter((p) => attendingIds.has(p.id)),
    [players, attendingIds]
  );

  // Attending players tallied by their primary position's side.
  const attendingSides = useMemo(() => {
    let offense = 0;
    let defense = 0;
    for (const p of attendingPlayers) {
      const s = sideForPositions(p.positions);
      if (s === "offense") offense += 1;
      else if (s === "defense") defense += 1;
    }
    return { offense, defense };
  }, [attendingPlayers]);

  const toggleAttending = (playerId: string) => {
    setAttendingIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const onDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== "ios") setDatePickerOpen(false);
    if (event.type === "dismissed") return;
    if (date) setPracticeDate(dateToIso(date));
  };

  const onStartChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== "ios") setStartPickerOpen(false);
    if (event.type === "dismissed") return;
    if (!date) return;
    const next = dateToTime(date);
    setStartTime(next);
    // Default the end time to 2h after start when the coach hasn't set one yet.
    if (!endTime) {
      setEndTime(addMinutesToTime(next, 120));
    }
  };

  const onEndChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== "ios") setEndPickerOpen(false);
    if (event.type === "dismissed") return;
    if (date) setEndTime(dateToTime(date));
  };

  const persistPlan = async (
    targetStatus: PlanStatus
  ): Promise<string | null> => {
    if (!practiceDate) {
      setError("Practice date is required.");
      return null;
    }
    if (!user) {
      setError("You must be logged in.");
      return null;
    }

    let planId = initial?.id;
    const payload = {
      team_id: teamId,
      practice_date: practiceDate,
      start_time: startTime || null,
      end_time: endTime || null,
      title: title.trim() || null,
      notes: notes.trim() || null,
      status: targetStatus,
    };

    // Any block whose templateId is null was either typed-in fresh, or
    // pointed at a library entry the coach later deleted. Try to insert
    // each unique fresh name into team_practice_blocks so they're reusable
    // on the next practice. On collision (name already exists), look up
    // the existing template id; on RLS / migration failure, persist with
    // template_id null so the plan still saves.
    const freshNames = Array.from(
      new Set(
        planBlocks
          .filter((b) => b.templateId == null)
          .map((b) => b.name.trim())
          .filter((n) => n.length > 0)
      )
    );
    const nameToTemplateId = new Map<string, string>();
    for (const name of freshNames) {
      // Existing templates short-circuit the insert.
      const existing = blockTemplates.find(
        (t) => t.name.toLowerCase() === name.toLowerCase()
      );
      if (existing) {
        nameToTemplateId.set(name.toLowerCase(), existing.id);
        continue;
      }
      const { data, error: tplErr } = await supabase
        .from("team_practice_blocks")
        .insert({
          team_id: teamId,
          name,
          display_order: (blockTemplates.length ?? 0) + 100,
        })
        .select("id")
        .single();
      if (tplErr) {
        // Unique-violation = a parallel save raced us; refetch and use it.
        if (
          tplErr.code === "23505" ||
          /uq_team_practice_blocks/i.test(tplErr.message ?? "")
        ) {
          const { data: refetched } = await supabase
            .from("team_practice_blocks")
            .select("id, name")
            .eq("team_id", teamId)
            .ilike("name", name)
            .maybeSingle();
          if (refetched?.id) {
            nameToTemplateId.set(name.toLowerCase(), refetched.id as string);
          }
        }
        // Migration 42 not applied → table doesn't exist. Skip silently;
        // the block will save with template_id null inside the RPC's plan-
        // scoped blocks table, or fail in the RPC. Surfacing the error
        // here would block the whole save.
        continue;
      }
      if (data?.id) {
        nameToTemplateId.set(name.toLowerCase(), data.id as string);
      }
    }

    const resolveTemplateId = (block: PlanBlock): string | null => {
      if (block.templateId) return block.templateId;
      return nameToTemplateId.get(block.name.trim().toLowerCase()) ?? null;
    };

    // Build the RPC payload. drill_order is per-block (1-based); block_order
    // is the index of the block in planBlocks. Rows for a single block
    // appear in their planDrills order, with siblings of a parallel group
    // staying consecutive.
    const buildBlocksPayload = () =>
      planBlocks.map((b, bi) => {
        const blockDrills = planDrills
          .filter((d) => d.planBlockLocalId === b.localId)
          .map((d, di) => ({
            drill_id: d.isWaterBreak ? null : d.drillId,
            is_water_break: d.isWaterBreak,
            drill_order: di + 1,
            duration_minutes: d.durationMinutes || null,
            reps_count: d.reps ?? 0,
            notes: (d.notes ?? "").trim() || null,
            log_note: (d.logNote ?? "").trim() || null,
            parallel_group: d.parallelGroup,
          }));
        return {
          name: b.name.trim() || "Block",
          template_id: resolveTemplateId(b),
          target_minutes: b.targetMinutes,
          block_order: bi,
          drills: blockDrills,
        };
      });

    // Top-level (between-block) water breaks. Clamp afterBlockOrder to the
    // current block count so a stale slot from a since-removed block can't
    // sneak through (removePlanBlock already remaps, this is a safety net).
    const maxSlot = Math.max(planBlocks.length - 1, -1);
    const buildBreaksPayload = () =>
      planBreaks
        .filter((br) => br.afterBlockOrder >= -1 && br.afterBlockOrder <= maxSlot)
        .map((br) => ({
          after_block_order: br.afterBlockOrder,
          break_order: br.breakOrder,
          duration_minutes: br.durationMinutes,
        }));

    if (isEditing && planId) {
      const blocksPayload = buildBlocksPayload();
      const { error: updateErr } = await supabase
        .from("practice_plans")
        .update(payload)
        .eq("id", planId);
      if (updateErr) {
        setError(updateErr.message);
        return null;
      }
      const { error: rpcErr } = await supabase.rpc(
        "replace_practice_plan_blocks",
        {
          p_plan_id: planId,
          p_blocks: blocksPayload,
          p_breaks: buildBreaksPayload(),
        }
      );
      if (rpcErr) {
        setError(
          rpcErr.message ??
            "Couldn't save practice blocks. Make sure migration 42 has been applied."
        );
        return null;
      }
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("practice_plans")
        .insert({ ...payload, created_by: user.id })
        .select("id")
        .single();
      if (insertErr || !inserted) {
        setError(insertErr?.message ?? "Could not create plan.");
        return null;
      }
      planId = inserted.id as string;
      if (planBlocks.length > 0) {
        const blocksPayload = buildBlocksPayload();
        const { error: rpcErr } = await supabase.rpc(
          "replace_practice_plan_blocks",
          { p_plan_id: planId, p_blocks: blocksPayload }
        );
        if (rpcErr) {
          setError(
            rpcErr.message ??
              "Couldn't save practice blocks. Make sure migration 42 has been applied."
          );
          return null;
        }
      }
    }

    // After save, refresh templates so any newly-created ones are visible
    // on a follow-up edit.
    refreshBlockTemplates();

    // RSVP — upsert the `rsvp` flag per roster player. No delete-all: actual
    // check-in (`attended`) lives in the same row and a plan save must never
    // clobber it. Best-effort: a failure (e.g. migration 38 not applied) is
    // logged but never blocks the plan save.
    if (planId) {
      const pid = planId;
      const rsvpRows = players.map((p) => ({
        practice_plan_id: pid,
        player_id: p.id,
        rsvp: attendingIds.has(p.id),
      }));
      if (rsvpRows.length > 0) {
        const { error: attErr } = await supabase
          .from("practice_plan_attendees")
          .upsert(rsvpRows, { onConflict: "practice_plan_id,player_id" });
        if (attErr) {
          console.warn("[practice] RSVP save error", attErr);
        }
      }
    }

    return planId ?? null;
  };

  const save = async (target: PlanStatus) => {
    setError(null);
    setSubmitting(true);
    const id = await persistPlan(target);
    if (!id) {
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    if (isEditing) {
      router.back();
    } else {
      router.replace(`/practice/${id}` as never);
    }
  };

  const handleDelete = () => {
    if (!initial) return;
    const planId = initial.id;
    showModal({
      title: "Delete this practice plan?",
      message:
        "This removes the plan and its drill schedule for the whole team. This can't be undone.",
      actions: [
        {
          label: "Delete",
          variant: "destructive",
          onPress: async () => {
            setSubmitting(true);
            const { data: deleted, error: delErr } = await supabase
              .from("practice_plans")
              .delete()
              .eq("id", planId)
              .select("id");
            if (delErr || !deleted || deleted.length === 0) {
              setSubmitting(false);
              showError(
                "Couldn't delete",
                delErr?.message ??
                  "The plan couldn't be deleted. The latest database migration may not be applied yet."
              );
              return;
            }
            router.replace("/practice" as never);
          },
        },
      ],
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View
        style={{
          paddingTop: topInset + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.sm,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: spacing.md,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Back"
            hitSlop={10}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 12,
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
              color={colors.text.primary}
            />
          </Pressable>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Text
              style={[
                monoStyle("bold"),
                { fontSize: 11, color: colors.text.secondary },
              ]}
            >
              {completionPct}%
            </Text>
            <View
              style={{
                width: 1,
                height: 10,
                backgroundColor: colors.border.strong,
              }}
            />
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 10,
                  letterSpacing: tracking.loose,
                  textTransform: "uppercase",
                  color: STATUS_COLOR[status],
                },
              ]}
            >
              {STATUS_LABEL[status]}
            </Text>
          </View>
        </View>

        <Eyebrow variant="brand" style={{ marginBottom: 4 }}>
          PRACTICE PLAN · {STATUS_LABEL[status]}
        </Eyebrow>

        {/* Title — doubles as the screen heading */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          }}
        >
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g., Pre-tournament conditioning"
            placeholderTextColor={colors.text.muted}
            maxLength={60}
            multiline
            style={[
              fontStyle("bold"),
              {
                flex: 1,
                fontSize: 26,
                lineHeight: 32,
                fontWeight: fontWeight.bold,
                letterSpacing: -0.5,
                color: colors.text.primary,
                padding: 0,
              },
            ]}
          />
          {isEditing ? (
            <TouchableOpacity
              onPress={handleDelete}
              accessibilityLabel="Delete practice plan"
              hitSlop={10}
              disabled={submitting}
              activeOpacity={0.6}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                backgroundColor: colors.surface.muted,
                alignItems: "center",
                justifyContent: "center",
                opacity: submitting ? 0.5 : 1,
              }}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={colors.red.semantic}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Date / Start / Ends */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            marginTop: spacing.md,
          }}
        >
          <WhenField
            icon="calendar-outline"
            label="Date"
            value={formatShortDate(practiceDate)}
            onPress={() => {
              setStartPickerOpen(false);
              setEndPickerOpen(false);
              setDatePickerOpen(true);
            }}
          />
          <View
            style={{
              width: 1,
              height: 32,
              backgroundColor: colors.border.strong,
            }}
          />
          <WhenField
            icon="time-outline"
            label="Start"
            value={formatTimeReadable(startTime)}
            placeholder="—"
            accent
            onPress={() => {
              setDatePickerOpen(false);
              setEndPickerOpen(false);
              setStartPickerOpen(true);
            }}
          />
          <View
            style={{
              width: 1,
              height: 32,
              backgroundColor: colors.border.strong,
            }}
          />
          <WhenField
            icon="time-outline"
            label="Ends"
            value={
              endTime
                ? formatTimeReadable(endTime)
                : computedEndTime
                ? formatTimeReadable(computedEndTime)
                : ""
            }
            placeholder="—"
            dim={!endTime}
            onPress={() => {
              setDatePickerOpen(false);
              setStartPickerOpen(false);
              setEndPickerOpen(true);
            }}
          />
        </View>

        {datePickerOpen ? (
          <View style={{ marginTop: spacing.md }}>
            <DateTimePicker
              value={isoToDate(practiceDate)}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={onDateChange}
              themeVariant="dark"
            />
            {Platform.OS === "ios" ? (
              <View style={{ marginTop: spacing.sm }}>
                <Button label="Done" onPress={() => setDatePickerOpen(false)} />
              </View>
            ) : null}
          </View>
        ) : null}

        {startPickerOpen ? (
          <View style={{ marginTop: spacing.md }}>
            <DateTimePicker
              value={startTime ? timeToDate(startTime) : timeToDate("10:00")}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onStartChange}
              themeVariant="dark"
              minuteInterval={5}
            />
            {Platform.OS === "ios" ? (
              <View
                style={{
                  flexDirection: "row",
                  marginTop: spacing.sm,
                  gap: spacing.sm,
                }}
              >
                {startTime ? (
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Clear"
                      variant="secondary"
                      onPress={() => {
                        setStartTime("");
                        setStartPickerOpen(false);
                      }}
                    />
                  </View>
                ) : null}
                <View style={{ flex: 1 }}>
                  <Button
                    label="Done"
                    onPress={() => setStartPickerOpen(false)}
                  />
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {endPickerOpen ? (
          <View style={{ marginTop: spacing.md }}>
            <DateTimePicker
              value={endTime ? timeToDate(endTime) : timeToDate("12:00")}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onEndChange}
              themeVariant="dark"
              minuteInterval={5}
            />
            {Platform.OS === "ios" ? (
              <View
                style={{
                  flexDirection: "row",
                  marginTop: spacing.sm,
                  gap: spacing.sm,
                }}
              >
                {endTime ? (
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Clear"
                      variant="secondary"
                      onPress={() => {
                        setEndTime("");
                        setEndPickerOpen(false);
                      }}
                    />
                  </View>
                ) : null}
                <View style={{ flex: 1 }}>
                  <Button label="Done" onPress={() => setEndPickerOpen(false)} />
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {startTime && endTime && practiceMinutes == null ? (
          <Text
            style={{
              fontSize: 13,
              color: colors.errorLight,
              marginTop: spacing.sm,
            }}
          >
            End time must be after start time.
          </Text>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing["3xl"] + 200,
          gap: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 01 — RSVP */}
        <View style={outlinedCardStyle()}>
          <SectionHeader
            num="01"
            label="Who's coming"
            right={
              <Text
                style={[
                  monoStyle("medium"),
                  {
                    fontSize: 11,
                    color:
                      attendingPlayers.length > 0
                        ? colors.lime[400]
                        : colors.text.muted,
                  },
                ]}
              >
                {attendingPlayers.length}/{players.length} attending
              </Text>
            }
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.md,
            }}
          >
            {attendingPlayers.length > 0 ? (
              <AvatarStack
                players={attendingPlayers.map((p) => ({
                  initials: p.initials,
                  color: p.color,
                  name: p.name,
                }))}
                size={34}
                max={7}
              />
            ) : (
              <Text
                style={{
                  flex: 1,
                  fontSize: 13,
                  lineHeight: 18,
                  color: colors.text.muted,
                }}
              >
                {players.length === 0
                  ? "Add players on the Roster tab first."
                  : "No RSVPs yet — tap Manage to add players."}
              </Text>
            )}
            <TouchableOpacity
              onPress={() => setRsvpModalOpen(true)}
              accessibilityLabel="Manage who's coming"
              activeOpacity={0.7}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.border.strong,
                backgroundColor: colors.surface.overlay,
              }}
            >
              <Text
                style={[
                  fontStyle("semibold"),
                  { fontSize: 13, color: colors.text.primary },
                ]}
              >
                Manage
              </Text>
            </TouchableOpacity>
          </View>

          {attendingPlayers.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: spacing.lg,
                marginTop: spacing.md + spacing.xs,
                marginBottom: -spacing.xs,
              }}
            >
              <RsvpSideStat
                label="Offense"
                count={attendingSides.offense}
                color={sideAccent("offense")}
              />
              <View
                style={{
                  width: 1,
                  height: 16,
                  backgroundColor: colors.border.strong,
                }}
              />
              <RsvpSideStat
                label="Defense"
                count={attendingSides.defense}
                color={sideAccent("defense")}
              />
            </View>
          ) : null}
        </View>

        {/* 02 — NOTES */}
        <View style={outlinedCardStyle()}>
          <SectionHeader
            num="02"
            label="Notes"
            right={
              <Text
                style={[
                  fontStyle("bold"),
                  {
                    fontSize: 10,
                    letterSpacing: tracking.loose,
                    textTransform: "uppercase",
                    color: colors.text.muted,
                  },
                ]}
              >
                Visible to team
              </Text>
            }
          />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Goals for this practice, things to focus on…"
            placeholderTextColor={colors.text.muted}
            multiline
            textAlignVertical="top"
            style={{
              minHeight: 96,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border.card,
              backgroundColor: colors.surface.overlay,
              color: colors.text.primary,
              fontSize: 14,
              lineHeight: 20,
              fontFamily: fontFamily.sans,
            }}
          />
        </View>

        {/* 03 — DRILLS (now grouped into practice blocks) */}
        <View style={outlinedCardStyle()}>
          <SectionHeader
            num="03"
            label="Schedule"
            right={
              <Text
                style={[
                  monoStyle("medium"),
                  {
                    fontSize: 11,
                    color: overWindow ? colors.orange[500] : colors.text.muted,
                  },
                ]}
              >
                {planBlocks.length}{" "}
                {planBlocks.length === 1 ? "block" : "blocks"} · {totalDuration}m
              </Text>
            }
          />

          <View style={{ marginBottom: spacing.md }}>
            <ScheduleBar
              segments={planBlocks.flatMap((pb) => {
                const rbs = renderBlocksByBlock.get(pb.localId) ?? [];
                return rbs.map((b) => {
                  const head = planDrills[b.rowIndices[0]];
                  const d = head?.drillId
                    ? drillsById.get(head.drillId)
                    : undefined;
                  const cat = d?.categoryNames[0];
                  return {
                    id: b.key,
                    dur: head?.durationMinutes || 0,
                    color:
                      b.kind === "water"
                        ? colors.blue[400]
                        : b.kind === "parallel"
                        ? colors.team.violet
                        : cat
                        ? colorForCategory(cat)
                        : colors.text.muted,
                  };
                });
              })}
              startClock={formatClockShort(startTime)}
              endClock={formatClockShort(headerEndDisplay)}
              totalMin={totalDuration}
            />
          </View>

          {planBlocks.length === 0 ? (
            <View
              style={{
                padding: spacing["2xl"],
                borderRadius: radius.lg,
                borderWidth: 1.5,
                borderStyle: "dashed",
                borderColor: colors.border.dashed,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 18,
                  color: colors.text.secondary,
                  textAlign: "center",
                }}
              >
                No blocks yet. Tap{" "}
                <Text
                  style={[
                    monoStyle("bold"),
                    { color: colors.orange[500] },
                  ]}
                >
                  + Add block
                </Text>{" "}
                to start building the practice.
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.lg }}>
              {planBlocks.map((pb, pbi) => {
                const rbs = renderBlocksByBlock.get(pb.localId) ?? [];
                const blockTotal = blockTotals.get(pb.localId) ?? 0;
                const blockStart = planBlockStarts.get(pb.localId) ?? "";
                const canMoveBlockUp = pbi > 0;
                const canMoveBlockDown = pbi < planBlocks.length - 1;
                const gapBreaks = planBreaks
                  .filter((br) => br.afterBlockOrder === pbi)
                  .sort((a, b) => a.breakOrder - b.breakOrder);
                return (
                  <Fragment key={pb.localId}>
                  <PlanBlockCard
                    block={pb}
                    blockIndex={pbi}
                    totalMinutes={blockTotal}
                    startClock={blockStart}
                    canMoveUp={canMoveBlockUp}
                    canMoveDown={canMoveBlockDown}
                    onMoveUp={() => moveBlockMeta(pb.localId, -1)}
                    onMoveDown={() => moveBlockMeta(pb.localId, 1)}
                    onRemove={() => {
                      const hasDrills = (drillsByBlock.get(pb.localId) ?? []).length > 0;
                      if (!hasDrills) {
                        removePlanBlock(pb.localId);
                        return;
                      }
                      showModal({
                        title: `Remove "${pb.name}"?`,
                        message:
                          "This will remove every drill in this block from the practice. The drills stay in your library.",
                        actions: [
                          {
                            label: "Remove",
                            variant: "destructive",
                            onPress: () => removePlanBlock(pb.localId),
                          },
                        ],
                      });
                    }}
                    onRename={(name) => updateBlockName(pb.localId, name)}
                    onChangeTarget={(mins) => updateBlockTarget(pb.localId, mins)}
                    onAddDrill={() => {
                      setPickerBlockId(pb.localId);
                      setPairTargetId(null);
                      setPickerOpen(true);
                    }}
                    onAddWater={() => addWaterBreak(pb.localId)}
                  >
                    {rbs.length === 0 ? (
                      <View
                        style={{
                          paddingVertical: spacing.lg,
                          paddingHorizontal: spacing.md,
                          borderRadius: radius.md,
                          borderWidth: 1,
                          borderStyle: "dashed",
                          borderColor: colors.border.dashed,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            color: colors.text.muted,
                          }}
                        >
                          No drills in this block yet.
                        </Text>
                      </View>
                    ) : (
                      rbs.map((block, bi) => {
                        const headRow = planDrills[block.rowIndices[0]];
                        const blockDur = headRow?.durationMinutes || 0;
                        const isLastRb = bi === rbs.length - 1;
                        const start = renderBlockStarts.get(block.key) ?? "";
                        const headInfo = resolveRow(headRow);
                        const gutterColor =
                          block.kind === "water"
                            ? colors.blue[400]
                            : block.kind === "parallel"
                            ? colors.team.violet
                            : headInfo.accent;
                        return (
                          <View
                            key={block.key}
                            style={{
                              flexDirection: "row",
                              gap: 10,
                              alignItems: "stretch",
                            }}
                          >
                            <BlockGutter
                              time={start ? formatClockShort(start) : ""}
                              number={pad2(bi + 1)}
                              color={gutterColor}
                              isWater={block.kind === "water"}
                              isLast={isLastRb}
                            />
                            <View
                              style={{
                                flex: 1,
                                minWidth: 0,
                                paddingBottom:
                                  block.kind === "water" ? spacing.md : spacing.xl,
                              }}
                            >
                              {block.kind === "water" ? (
                                <WaterCard
                                  duration={blockDur}
                                  onChangeDuration={(v) =>
                                    updateBlockDuration(block.rowIndices, v)
                                  }
                                  onMoveUp={() =>
                                    moveBlock(pb.localId, bi, -1)
                                  }
                                  onMoveDown={() =>
                                    moveBlock(pb.localId, bi, 1)
                                  }
                                  canMoveUp={bi > 0}
                                  canMoveDown={!isLastRb}
                                  onRemove={() => removeBlock(block.rowIndices)}
                                />
                              ) : block.kind === "parallel" ? (
                                <View style={cardSurfaceStyle}>
                                  <ParallelHeader duration={blockDur} />
                                  {block.rowIndices.map((ri, si) => {
                                    const pd = planDrills[ri];
                                    const info = resolveRow(pd);
                                    const expanded =
                                      expandedRowId === pd.localId;
                                    return (
                                      <View
                                        key={pd.localId}
                                        style={{
                                          borderTopWidth: si > 0 ? 1 : 0,
                                          borderTopColor: colors.border.subtle,
                                        }}
                                      >
                                        <DrillCardHeader
                                          isSibling
                                          name={info.name}
                                          phaseName={info.phaseName}
                                          isBenchmark={info.isBenchmark}
                                          durationMinutes={blockDur}
                                          accent={info.accent}
                                          expanded={expanded}
                                          onToggle={() =>
                                            setExpandedRowId(
                                              expanded ? null : pd.localId
                                            )
                                          }
                                        />
                                        {expanded ? (
                                          <DrillExpandedBody
                                            description={info.description}
                                            durationMinutes={blockDur}
                                            notes={pd.notes}
                                            logNote={pd.logNote}
                                            accent={info.accent}
                                            accentTint={info.accentTint}
                                            onChangeDuration={(v) =>
                                              updateBlockDuration(
                                                block.rowIndices,
                                                v
                                              )
                                            }
                                            onChangeNotes={(v) =>
                                              updateRowNotes(ri, v)
                                            }
                                            onMoveUp={() =>
                                              moveBlock(pb.localId, bi, -1)
                                            }
                                            onMoveDown={() =>
                                              moveBlock(pb.localId, bi, 1)
                                            }
                                            canMoveUp={bi > 0}
                                            canMoveDown={!isLastRb}
                                            onRemove={() =>
                                              removeBlock(block.rowIndices)
                                            }
                                            canPair={
                                              block.rowIndices.length < 3
                                            }
                                            onPair={() =>
                                              openPairPicker(
                                                pd.localId,
                                                pb.localId
                                              )
                                            }
                                            onUnpair={() => unpairDrill(ri)}
                                            canMoveToBlock={
                                              planBlocks.length > 1 &&
                                              pd.parallelGroup == null
                                            }
                                            onMoveToBlock={() =>
                                              setMoveSheet({
                                                rowIdx: ri,
                                                fromBlockId: pb.localId,
                                              })
                                            }
                                            onOpenDrill={() =>
                                              pd.drillId &&
                                              router.push(
                                                `/drills/${pd.drillId}` as never
                                              )
                                            }
                                            onOpenHistory={() => {
                                              if (pd.drillId)
                                                setHistoryTarget({
                                                  drillId: pd.drillId,
                                                  drillName: info.name,
                                                });
                                            }}
                                          />
                                        ) : null}
                                      </View>
                                    );
                                  })}
                                </View>
                              ) : (
                                <View style={cardSurfaceStyle}>
                                  <DrillCardHeader
                                    name={headInfo.name}
                                    phaseName={headInfo.phaseName}
                                    isBenchmark={headInfo.isBenchmark}
                                    durationMinutes={blockDur}
                                    accent={headInfo.accent}
                                    expanded={
                                      expandedRowId === headRow.localId
                                    }
                                    onToggle={() =>
                                      setExpandedRowId(
                                        expandedRowId === headRow.localId
                                          ? null
                                          : headRow.localId
                                      )
                                    }
                                  />
                                  {expandedRowId === headRow.localId ? (
                                    <DrillExpandedBody
                                      description={headInfo.description}
                                      durationMinutes={blockDur}
                                      notes={headRow.notes}
                                      logNote={headRow.logNote}
                                      accent={headInfo.accent}
                                      accentTint={headInfo.accentTint}
                                      onChangeDuration={(v) =>
                                        updateBlockDuration(
                                          block.rowIndices,
                                          v
                                        )
                                      }
                                      onChangeNotes={(v) =>
                                        updateRowNotes(
                                          block.rowIndices[0],
                                          v
                                        )
                                      }
                                      onMoveUp={() =>
                                        moveBlock(pb.localId, bi, -1)
                                      }
                                      onMoveDown={() =>
                                        moveBlock(pb.localId, bi, 1)
                                      }
                                      canMoveUp={bi > 0}
                                      canMoveDown={!isLastRb}
                                      onRemove={() =>
                                        removeBlock(block.rowIndices)
                                      }
                                      canPair
                                      onPair={() =>
                                        openPairPicker(
                                          headRow.localId,
                                          pb.localId
                                        )
                                      }
                                      canMoveToBlock={planBlocks.length > 1}
                                      onMoveToBlock={() =>
                                        setMoveSheet({
                                          rowIdx: block.rowIndices[0],
                                          fromBlockId: pb.localId,
                                        })
                                      }
                                      onOpenDrill={() =>
                                        headRow.drillId &&
                                        router.push(
                                          `/drills/${headRow.drillId}` as never
                                        )
                                      }
                                      onOpenHistory={() => {
                                        if (headRow.drillId)
                                          setHistoryTarget({
                                            drillId: headRow.drillId,
                                            drillName: headInfo.name,
                                          });
                                      }}
                                    />
                                  ) : null}
                                </View>
                              )}
                            </View>
                          </View>
                        );
                      })
                    )}
                  </PlanBlockCard>
                  {pbi < planBlocks.length - 1 ? (
                    <GapZone
                      breaks={gapBreaks}
                      onAdd={() => addTopLevelBreak(pbi)}
                      onChangeDuration={(id, v) =>
                        updateTopLevelBreakDuration(id, parseInt(v, 10) || 0)
                      }
                      onRemove={removeTopLevelBreak}
                    />
                  ) : null}
                  </Fragment>
                );
              })}
            </View>
          )}

          <View
            style={{
              marginTop: spacing.lg,
            }}
          >
            <TouchableOpacity
              onPress={() => setBlockSheetOpen(true)}
              accessibilityLabel="Add block"
              activeOpacity={0.7}
              style={quickAddBtnStyle(colors.orange[500])}
            >
              <Ionicons name="add" size={14} color={colors.orange[500]} />
              <Text
                style={[
                  fontStyle("semibold"),
                  { fontSize: 12, color: colors.orange[500] },
                ]}
              >
                Add block
              </Text>
            </TouchableOpacity>
          </View>

          {practiceMinutes != null && remainingMinutes != null ? (
            <Text
              style={[
                monoStyle("medium"),
                {
                  fontSize: 12,
                  marginTop: spacing.lg,
                  textAlign: "center",
                  color: overWindow
                    ? colors.orange[400]
                    : colors.text.secondary,
                },
              ]}
            >
              {remainingMinutes >= 0
                ? `${remainingMinutes}m remaining of ${practiceMinutes}m window`
                : `${Math.abs(remainingMinutes)}m over the ${practiceMinutes}m window`}
            </Text>
          ) : null}
        </View>

        {error ? (
          <Text
            style={{
              fontSize: 13,
              lineHeight: 18,
              color: colors.errorLight,
              marginTop: spacing.sm,
            }}
          >
            {error}
          </Text>
        ) : null}
      </ScrollView>

      {/* Sticky footer with gradient fade */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <LinearGradient
          colors={[
            "rgba(8,9,11,0)",
            "rgba(8,9,11,0.92)",
            colors.surface.base,
          ]}
          locations={[0, 0.3, 0.6]}
          style={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing["3xl"],
            paddingBottom: bottomInset + 60 + spacing.lg,
          }}
        >
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                label={submitting ? "Saving…" : "Save draft"}
                onPress={() => save("draft")}
                disabled={submitting}
                variant="secondary"
              />
            </View>
            <View style={{ flex: 2 }}>
              <Button
                label={submitting ? "Saving…" : "Save & Finalize"}
                onPress={() => save("scheduled")}
                disabled={submitting}
                style={{
                  shadowColor: colors.orange[500],
                  shadowOpacity: 0.45,
                  shadowOffset: { width: 0, height: 8 },
                  shadowRadius: 24,
                  elevation: 6,
                }}
              />
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Drill picker — also used in "pair mode" to add a parallel drill.
          pickerBlockId targets which practice block a non-pair add lands in. */}
      <DrillPickerModal
        visible={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setPairTargetId(null);
          setPickerBlockId(null);
        }}
        drills={drills.filter(
          (d) => d.name.toLowerCase() !== WATER_BREAK_NAME.toLowerCase()
        )}
        categories={categories}
        addedIds={addedIds}
        onAdd={(drillId) => addDrill(drillId)}
        onRemove={removeDrillById}
        onCreateNew={handleCreateNewDrill}
        pairMode={pairTargetId != null}
        onPick={handlePick}
      />

      {/* Block library sheet — pick from team_practice_blocks or type a new
          block name to add it to the library on save. */}
      <BlockLibrarySheet
        visible={blockSheetOpen}
        onClose={() => setBlockSheetOpen(false)}
        templates={blockTemplates}
        onPickTemplate={(tpl) => {
          addBlockFromTemplate(tpl);
          setBlockSheetOpen(false);
        }}
        onCreateNew={(name) => {
          addBlockByName(name);
          setBlockSheetOpen(false);
        }}
      />

      {/* RSVP — manage which roster players are attending */}
      <AttendanceModal
        visible={rsvpModalOpen}
        onClose={() => setRsvpModalOpen(false)}
        players={players}
        attendingIds={attendingIds}
        onToggle={toggleAttending}
      />

      <DrillNoteHistorySheet
        visible={historyTarget != null}
        drillId={historyTarget?.drillId ?? null}
        drillName={historyTarget?.drillName ?? ""}
        teamId={teamId}
        onClose={() => setHistoryTarget(null)}
      />

      {/* Cross-block move — lists every other block in the plan. Tapping
          one moves the drill there and strips its parallel group (siblings
          stay in their original block). */}
      <MoveDrillToBlockSheet
        visible={moveSheet != null}
        currentBlockId={moveSheet?.fromBlockId ?? null}
        blocks={planBlocks}
        onClose={() => setMoveSheet(null)}
        onPick={(targetBlockId) => {
          if (moveSheet) {
            moveDrillToBlock(moveSheet.rowIdx, targetBlockId);
            setExpandedRowId(null);
          }
          setMoveSheet(null);
        }}
      />

      <ActionModal {...modalProps} />
    </KeyboardAvoidingView>
  );
}
