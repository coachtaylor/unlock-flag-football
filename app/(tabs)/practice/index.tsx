import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../../components/ui/Button";
import {
  ActionModal,
  type ActionModalConfig,
} from "../../../components/ui/ActionModal";
import { DeleteConfirmModal } from "../../../components/ui/DeleteConfirmModal";
import { Eyebrow } from "../../../components/ui/Eyebrow";
import { colors, radius, spacing } from "../../../constants/design";
import { fontStyle, MonoText } from "../../../constants/typography";
import { colorForCategory, inferCategoryType } from "../../../constants/categories";
import { supabase } from "../../../lib/supabase";
import { useTeam } from "../../../lib/team-context";

const PADH = spacing.lg; // 16 — content column padding

// LayoutAnimation needs an opt-in on (old-arch) Android for the
// collapse/expand of practice sections to animate.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type PlanStatus = "draft" | "scheduled" | "live" | "completed";

type MixSlice = { name: string; minutes: number };

type PlanVM = {
  id: string;
  title: string | null;
  status: PlanStatus;
  practiceDate: string | null;
  dayOffset: number | null;
  time: string | null;
  drills: number;
  duration: number;
  mix: MixSlice[];
  attending: number | null; // completed only
  completion: number | null; // completed only, 0..1
  progressMin: number | null; // live only
  pastDue: boolean; // scheduled/live but >6h past its scheduled start
  archived: boolean; // soft-deleted (archived_at set) — hidden from active groups
};

// ── helpers ─────────────────────────────────────────────────────────

function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayOffsetFrom(iso: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return Math.round((date.getTime() - startOfToday().getTime()) / 86_400_000);
}

// A live/scheduled practice whose scheduled start slipped more than this long
// ago is treated as stale: if it's still live it gets paused (back to
// scheduled), and either way it surfaces under "Needs Attention" with a
// Past Due badge.
const PAST_DUE_GRACE_MS = 6 * 60 * 60 * 1000;

function isPastDue(
  practiceDate: string | null,
  startTime: string | null,
  now: number
): boolean {
  if (!practiceDate) return false;
  const [y, m, d] = practiceDate.split("-").map(Number);
  if (!y || !m || !d) return false;
  let dueMs: number;
  if (startTime) {
    const [hh = 0, mm = 0] = startTime.split(":").map(Number);
    dueMs = new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
  } else {
    // No start time — anchor to end of that day so we don't flag it early.
    dueMs = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  }
  return now - dueMs > PAST_DUE_GRACE_MS;
}

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function dateParts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return {
    mon: date.toLocaleDateString("en-US", { month: "short" }),
    day: String(d ?? 1),
    dow: date.toLocaleDateString("en-US", { weekday: "short" }),
  };
}

function fmtDur(m: number) {
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

function formatTime(t: string | null): string | null {
  if (!t) return null;
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr ?? "0", 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr ?? "00"} ${ampm}`;
}

function relDay(offset: number | null): string {
  if (offset == null) return "Unscheduled";
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset > 1) return `In ${offset} days`;
  if (offset === -1) return "Yesterday";
  return `${Math.abs(offset)} days ago`;
}

function normalizeStatus(raw: string): PlanStatus {
  if (raw === "finalized") return "scheduled"; // pre-migration rows
  if (
    raw === "draft" ||
    raw === "scheduled" ||
    raw === "live" ||
    raw === "completed"
  ) {
    return raw;
  }
  return "draft";
}

/** PostgREST to-one embeds may arrive as an object or a 1-element array. */
function one<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? x[0] ?? null : x;
}

// ── raw row shapes ──────────────────────────────────────────────────

type DrillCat = { category_name: string | null; category_type: string | null };
type DrillCatRow = {
  drill_categories: DrillCat | DrillCat[] | null;
};
type PpdRow = {
  duration_minutes: number | null;
  drill_order: number | null;
  is_water_break?: boolean | null;
  team_drills:
    | { team_drill_categories: DrillCatRow[] | null }
    | { team_drill_categories: DrillCatRow[] | null }[]
    | null;
};
type PlanRow = {
  id: string;
  practice_date: string | null;
  start_time: string | null;
  title: string | null;
  status: string;
  started_at?: string | null;
  archived_at?: string | null;
  practice_plan_drills: PpdRow[] | null;
};
type LogRow = {
  practice_plan_id: string | null;
  attendance_count: number | null;
  drills_completed: string[] | null;
};

/** Only phase categories belong in the mix — skills/sub-skills are excluded. */
function isPhase(cat: DrillCat): boolean {
  if (!cat.category_name) return false;
  if (cat.category_type === "phase") return true;
  if (cat.category_type === "skill" || cat.category_type === "sub_skill") {
    return false;
  }
  return inferCategoryType(cat.category_name) === "phase";
}

function buildMix(ppd: PpdRow[]): MixSlice[] {
  const acc = new Map<string, number>();
  // Mix segments follow the practice schedule order, not minute weight.
  const ordered = [...ppd].sort(
    (a, b) => (a.drill_order ?? 0) - (b.drill_order ?? 0)
  );
  for (const pd of ordered) {
    if (pd.is_water_break) continue; // water breaks aren't training
    const mins = pd.duration_minutes ?? 0;
    if (mins <= 0) continue;
    const td = one(pd.team_drills);
    const names = (td?.team_drill_categories ?? [])
      .map((tc) => one(tc.drill_categories))
      .filter((c): c is DrillCat => !!c && isPhase(c))
      .map((c) => c.category_name as string);
    if (names.length === 0) {
      acc.set("Other", (acc.get("Other") ?? 0) + mins);
    } else {
      for (const n of names) acc.set(n, (acc.get(n) ?? 0) + mins);
    }
  }
  return Array.from(acc.entries()).map(([name, minutes]) => ({
    name,
    minutes,
  }));
}

const PLANS_SELECT_CORE =
  "id, practice_date, start_time, title, status, practice_plan_drills(duration_minutes, drill_order, team_drills(team_drill_categories(drill_categories(category_name, category_type))))";

// ── status pill ─────────────────────────────────────────────────────

const STATUS_META: Record<PlanStatus, { label: string; color: string }> = {
  draft: { label: "Draft", color: colors.text.secondary },
  scheduled: { label: "Scheduled", color: colors.orange[500] },
  live: { label: "Live", color: colors.lime[400] },
  completed: { label: "Completed", color: colors.blue[400] },
};

// All status badges share the Past Due treatment: plain bold uppercase mono
// text in the status color, no pill/background. Live keeps a small dot.
function StatusPill({ status }: { status: PlanStatus }) {
  const m = STATUS_META[status];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      {status === "live" && (
        <View
          style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: m.color }}
        />
      )}
      <MonoText
        weight="bold"
        style={{
          fontSize: 10,
          color: m.color,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {m.label}
      </MonoText>
    </View>
  );
}

// ── date tile ───────────────────────────────────────────────────────

function DateTile({
  iso,
  dayOffset,
  size,
  pastDue,
}: {
  iso: string | null;
  dayOffset: number | null;
  size: number;
  pastDue?: boolean;
}) {
  if (!iso) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius.lg,
          backgroundColor: colors.surface.overlay,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: colors.border.dashed,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MonoText weight="bold" style={{ fontSize: 18, color: colors.text.muted }}>
          ?
        </MonoText>
      </View>
    );
  }
  const { mon, day, dow } = dateParts(iso);
  const isToday = dayOffset === 0;
  const isPast = dayOffset != null && dayOffset < 0;
  // Accent (today / past-due) is carried by a 1.5px ring + tinted fill +
  // colored numerals — NOT a solid fill — so the tile never competes with
  // the card's orange CTA.
  const accent = pastDue
    ? colors.red.semantic
    : isToday
    ? colors.orange[500]
    : null;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.lg,
        backgroundColor: accent ? `${accent}1A` : colors.surface.overlay,
        borderWidth: accent ? 1.5 : 1,
        borderColor: accent ? `${accent}80` : colors.border.strong,
        alignItems: "center",
        justifyContent: "center",
        opacity: !accent && isPast ? 0.62 : 1,
      }}
    >
      <MonoText
        weight="bold"
        style={{
          fontSize: 9,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: accent ?? colors.text.secondary,
        }}
      >
        {mon}
      </MonoText>
      <MonoText
        weight="bold"
        style={{
          fontSize: size >= 64 ? 24 : 20,
          lineHeight: size >= 64 ? 27 : 23,
          color: accent ?? colors.text.primary,
        }}
      >
        {day}
      </MonoText>
      <MonoText
        weight="bold"
        style={{
          fontSize: 9,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: accent ? `${accent}B0` : colors.text.muted,
        }}
      >
        {dow}
      </MonoText>
    </View>
  );
}

// ── mix bar ─────────────────────────────────────────────────────────

function MixBar({ mix, height }: { mix: MixSlice[]; height: number }) {
  const total = mix.reduce((s, m) => s + m.minutes, 0);
  if (total <= 0) {
    return (
      <View
        style={{ height, borderRadius: 2, backgroundColor: colors.border.strong }}
      />
    );
  }
  return (
    <View
      style={{
        flexDirection: "row",
        height,
        borderRadius: 2,
        overflow: "hidden",
        gap: 1,
      }}
    >
      {mix.map((m) => (
        <View
          key={m.name}
          style={{
            flex: m.minutes,
            minWidth: 2,
            backgroundColor: colorForCategory(m.name),
          }}
        />
      ))}
    </View>
  );
}

function Dot() {
  return (
    <View
      style={{
        width: 2,
        height: 2,
        borderRadius: 1,
        backgroundColor: colors.text.muted,
      }}
    />
  );
}

// ── group header ────────────────────────────────────────────────────

function GroupHeader({
  label,
  count,
  color,
  trailing,
  collapsible,
  collapsed,
  onToggle,
}: {
  label: string;
  count?: number;
  color: string;
  trailing?: React.ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const inner = (
    <>
      <View
        style={{ width: 4, height: 12, borderRadius: 2, backgroundColor: color }}
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
        {label}
      </Text>
      {count !== undefined && (
        <MonoText style={{ fontSize: 11, color: colors.text.muted }}>
          {count}
        </MonoText>
      )}
      <View
        style={{
          flex: 1,
          height: 1,
          backgroundColor: colors.border.card,
          marginLeft: 4,
        }}
      />
      {trailing}
      {collapsible && (
        <Ionicons
          name={collapsed ? "chevron-down" : "chevron-up"}
          size={15}
          color={colors.text.muted}
        />
      )}
    </>
  );

  const style = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingHorizontal: PADH,
    paddingTop: spacing["2xl"],
    paddingBottom: spacing.sm,
  };

  if (collapsible) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        style={style}
      >
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={style}>{inner}</View>;
}

// ── cadence strip ───────────────────────────────────────────────────

function MiniStat({
  value,
  suffix,
  label,
  color,
}: {
  value: string;
  suffix?: string;
  label: string;
  color: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
      <MonoText weight="bold" style={{ fontSize: 22, color, letterSpacing: -0.4 }}>
        {value}
        {suffix ? (
          <Text style={{ fontSize: 11, color: colors.text.muted }}>{suffix}</Text>
        ) : null}
      </MonoText>
      <MonoText style={{ fontSize: 10, color: colors.text.muted, letterSpacing: 0.6 }}>
        {label}
      </MonoText>
    </View>
  );
}

function CadenceStrip({
  last4,
  avgAttend,
  onFieldTotal,
}: {
  last4: PlanVM[];
  avgAttend: number | null;
  onFieldTotal: number;
}) {
  const maxDur = Math.max(...last4.map((p) => p.duration), 1);
  return (
    <View style={{ paddingHorizontal: PADH, paddingTop: spacing.md }}>
      <View
        style={{
          padding: 14,
          backgroundColor: colors.surface.raised,
          borderWidth: 1,
          borderColor: colors.border.card,
          borderRadius: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
        }}
      >
        <View style={{ flex: 1, gap: 6 }}>
          <Eyebrow variant="dim">Last {last4.length} practices</Eyebrow>
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "baseline",
              flexWrap: "wrap",
            }}
          >
            {avgAttend != null && (
              <MiniStat
                value={`${avgAttend}`}
                suffix="%"
                label="ATTEND"
                color={colors.lime[400]}
              />
            )}
            <MiniStat
              value={`${onFieldTotal}`}
              suffix="m"
              label="ON FIELD"
              color={colors.text.primary}
            />
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            gap: 4,
            alignItems: "flex-end",
            height: 36,
          }}
        >
          {[...last4].reverse().map((p, i) => (
            <View
              key={p.id}
              style={{
                width: 8,
                borderRadius: 2,
                height: 8 + (p.duration / maxDur) * 28,
                backgroundColor:
                  i === last4.length - 1
                    ? colors.orange[500]
                    : colors.border.strong,
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

// ── live ribbon ─────────────────────────────────────────────────────

function LiveRibbon({
  plan,
  onPress,
  onLive,
  onSendToScheduled,
  onManage,
  busy,
}: {
  plan: PlanVM;
  onPress: () => void;
  onLive: () => void;
  onSendToScheduled: () => void;
  onManage?: () => void;
  busy: boolean;
}) {
  const progress = plan.progressMin ?? 0;
  const pct = plan.duration > 0 ? Math.round((progress / plan.duration) * 100) : 0;
  return (
    <View style={{ paddingHorizontal: PADH, paddingTop: 14 }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={{
          padding: 14,
          backgroundColor: colors.surface.raised,
          borderWidth: 1,
          borderColor: "rgba(194,255,61,0.32)",
          borderRadius: 16,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ flex: 1, gap: 6, paddingRight: 10 }}>
            <View style={{ flexDirection: "row" }}>
              <StatusPill status="live" />
            </View>
            <Text
              style={[
                fontStyle("semibold"),
                { fontSize: 16, color: colors.text.primary },
              ]}
              numberOfLines={1}
            >
              {plan.title || "Untitled practice"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons
                name="time-outline"
                size={12}
                color={colors.text.secondary}
              />
              <MonoText style={{ fontSize: 11, color: colors.text.secondary }}>
                {progress}m / {plan.duration}m
              </MonoText>
            </View>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            {onManage ? <CardManageButton onPress={onManage} /> : null}
            <TouchableOpacity
              accessibilityLabel="Send back to scheduled"
              hitSlop={8}
              disabled={busy}
              activeOpacity={0.85}
              onPress={onSendToScheduled}
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border.default,
                alignItems: "center",
                justifyContent: "center",
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Ionicons
                name="arrow-undo-outline"
                size={16}
                color={colors.text.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Live practice"
              activeOpacity={0.85}
              onPress={onLive}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: colors.lime[400],
                paddingHorizontal: 14,
                height: 38,
                borderRadius: 10,
              }}
            >
              <Ionicons name="play" size={12} color={colors.text.onBrand} />
              <Text
                style={[
                  fontStyle("bold"),
                  {
                    fontSize: 12,
                    color: colors.text.onBrand,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                  },
                ]}
              >
                Live
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <View
          style={{
            marginTop: 12,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.border.strong,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${pct}%`,
              height: "100%",
              backgroundColor: colors.lime[400],
            }}
          />
        </View>
        {/* Explicit way back to the prep page (attendance + plan review).
            The green LIVE pill jumps into the run timer instead. */}
        <TouchableOpacity
          accessibilityRole="link"
          accessibilityLabel="Review setup"
          activeOpacity={0.7}
          onPress={onPress}
          hitSlop={6}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            marginTop: 12,
            alignSelf: "flex-start",
          }}
        >
          <Ionicons
            name="clipboard-outline"
            size={13}
            color={colors.text.secondary}
          />
          <Text
            style={[
              fontStyle("semibold"),
              { fontSize: 12, color: colors.text.secondary },
            ]}
          >
            Review Setup
          </Text>
          <Ionicons
            name="chevron-forward"
            size={11}
            color={colors.text.muted}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}

// ── meta row (time · duration · drills) ─────────────────────────────

function MetaRow({ plan }: { plan: PlanVM }) {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}
    >
      {plan.time && (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons
              name="time-outline"
              size={11}
              color={colors.text.secondary}
            />
            <MonoText style={{ fontSize: 11, color: colors.text.secondary }}>
              {plan.time}
            </MonoText>
          </View>
          <Dot />
        </>
      )}
      <MonoText style={{ fontSize: 11, color: colors.text.secondary }}>
        {fmtDur(plan.duration)}
      </MonoText>
      <Dot />
      <MonoText style={{ fontSize: 11, color: colors.text.secondary }}>
        {plan.drills} {plan.drills === 1 ? "drill" : "drills"}
      </MonoText>
    </View>
  );
}

// ── hero card (up next) ─────────────────────────────────────────────

function HeroCard({
  plan,
  starting,
  onOpen,
  onStart,
  onEdit,
  onManage,
}: {
  plan: PlanVM;
  starting: boolean;
  onOpen: () => void;
  onStart: () => void;
  onEdit: () => void;
  onManage?: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: PADH }}>
      <View
        style={{
          padding: spacing.lg,
          backgroundColor: colors.surface.raised,
          borderWidth: 1,
          borderColor: colors.orange.tintBorder,
          borderTopWidth: 2,
          borderTopColor: colors.orange[500],
          borderRadius: radius.card,
        }}
      >
        <View
          style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onOpen}
            style={{ flex: 1, flexDirection: "row", gap: 14 }}
          >
            <DateTile iso={plan.practiceDate} dayOffset={plan.dayOffset} size={64} />
            <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
              {/* Title first; badge rides on the same row, vertically centered. */}
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Text
                  style={[
                    fontStyle("semibold"),
                    {
                      flexShrink: 1,
                      fontSize: 18,
                      lineHeight: 23,
                      color: colors.text.primary,
                    },
                  ]}
                  numberOfLines={2}
                >
                  {plan.title || "Untitled practice"}
                </Text>
                <StatusPill status={plan.status} />
              </View>
              <MetaRow plan={plan} />
            </View>
          </TouchableOpacity>
          {onManage ? <CardManageButton onPress={onManage} /> : null}
        </View>

        <TouchableOpacity activeOpacity={0.85} onPress={onOpen}>
          {/* Drill mix — duration already shown in the meta row above, so the
              header is just the label (no redundant total). */}
          <View style={{ marginTop: 16 }}>
            <Eyebrow variant="dim">Mix</Eyebrow>
            <View style={{ height: 6 }} />
            <MixBar mix={plan.mix} height={6} />
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 8,
              }}
            >
              {plan.mix.map((m) => (
                <View
                  key={m.name}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: colorForCategory(m.name),
                    }}
                  />
                  <Text
                    style={[
                      fontStyle("regular"),
                      { fontSize: 10, color: colors.text.secondary },
                    ]}
                  >
                    {m.name}
                  </Text>
                  <MonoText style={{ fontSize: 10, color: colors.text.primary }}>
                    {m.minutes}m
                  </MonoText>
                </View>
              ))}
            </View>
          </View>
        </TouchableOpacity>

        {/* Actions */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onStart}
            disabled={starting}
            style={{
              flex: 1,
              height: 44,
              borderRadius: radius.lg,
              backgroundColor: colors.orange[500],
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              opacity: starting ? 0.6 : 1,
            }}
          >
            <Ionicons
              name="clipboard-outline"
              size={14}
              color={colors.text.primary}
            />
            <Text
              style={[
                fontStyle("bold"),
                { fontSize: 13, color: colors.text.primary },
              ]}
            >
              Prepare Practice
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onEdit}
            style={{
              height: 44,
              paddingHorizontal: 18,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border.strong,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={[
                fontStyle("semibold"),
                { fontSize: 13, color: colors.text.primary },
              ]}
            >
              Edit
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── past-due badge ──────────────────────────────────────────────────

function PastDueBadge() {
  return (
    <MonoText
      weight="bold"
      style={{
        fontSize: 10,
        color: colors.red.semantic,
        letterSpacing: 1,
        textTransform: "uppercase",
      }}
    >
      Past Due
    </MonoText>
  );
}

// ── card manage button ─────────────────────────────────────────────
// A single neutral overflow control. Tapping opens an action sheet with
// the lifecycle action(s) available for this plan (delete/archive/
// unarchive, plus duplicate on the hero). Kept quiet so it never competes
// with the card's content or the destructive-red Past Due signal.
function CardManageButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.6}
      hitSlop={10}
      accessibilityLabel="Manage practice"
      onPress={(e) => {
        e.stopPropagation();
        onPress();
      }}
      style={{
        width: 30,
        height: 30,
        borderRadius: radius.md,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons
        name="ellipsis-horizontal"
        size={18}
        color={colors.text.muted}
      />
    </TouchableOpacity>
  );
}

// ── compact plan card ───────────────────────────────────────────────

function PlanCard({
  plan,
  onPress,
  onManage,
  pastDue,
}: {
  plan: PlanVM;
  onPress: () => void;
  onManage?: () => void;
  pastDue?: boolean;
}) {
  const isCompleted = plan.status === "completed";
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        padding: spacing.lg,
        backgroundColor: colors.surface.raised,
        borderWidth: 1,
        borderColor: colors.border.card,
        borderRadius: radius.xl,
        flexDirection: "row",
        gap: spacing.md,
        alignItems: "flex-start",
        opacity: isCompleted ? 0.92 : 1,
      }}
    >
      <DateTile
        iso={plan.practiceDate}
        dayOffset={plan.dayOffset}
        size={52}
        pastDue={pastDue}
      />
      <View style={{ flex: 1, gap: 12, minWidth: 0 }}>
        {/* Title first; badge rides on the same row (centered), with the
            ••• pushed to the far right so it stays clear of the badge. */}
        <View style={{ gap: 4, minWidth: 0 }}>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <Text
              style={[
                fontStyle("semibold"),
                {
                  flexShrink: 1,
                  fontSize: 15,
                  color: plan.title ? colors.text.primary : colors.text.muted,
                },
              ]}
              numberOfLines={1}
            >
              {plan.title || "Untitled plan"}
            </Text>
            {pastDue ? <PastDueBadge /> : <StatusPill status={plan.status} />}
            <View style={{ flex: 1 }} />
            {onManage ? <CardManageButton onPress={onManage} /> : null}
          </View>
          <MetaRow plan={plan} />
        </View>

        {plan.drills > 0 ? (
          <MixBar mix={plan.mix} height={4} />
        ) : (
          <Text
            style={[
              fontStyle("regular"),
              { fontSize: 11, color: colors.text.muted },
            ]}
          >
            No drills added yet
          </Text>
        )}

        {isCompleted && (plan.attending != null || plan.completion != null) && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginTop: 2,
            }}
          >
            {plan.attending != null && (
              <MonoText style={{ fontSize: 10, color: colors.text.secondary }}>
                {plan.attending} attended
              </MonoText>
            )}
            <View style={{ flex: 1 }} />
            {plan.completion != null && plan.completion < 1 && (
              <MonoText style={{ fontSize: 10, color: colors.text.muted }}>
                {Math.round(plan.completion * 100)}% done
              </MonoText>
            )}
            <Ionicons
              name="chevron-forward"
              size={11}
              color={colors.text.muted}
            />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── skeleton ────────────────────────────────────────────────────────

function SkeletonCard() {
  const [opacity] = useState(new Animated.Value(0.3));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={{
        height: 96,
        borderRadius: radius.xl,
        backgroundColor: colors.surface.raised,
        opacity,
      }}
    />
  );
}

// ── screen ──────────────────────────────────────────────────────────

function ScreenHeader({
  teamName,
  onPlan,
}: {
  teamName: string | null;
  onPlan: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        paddingHorizontal: PADH,
        paddingBottom: 2,
      }}
    >
      <View style={{ gap: 2 }}>
        {teamName ? <Eyebrow variant="brand">{teamName}</Eyebrow> : null}
        <Text
          style={[
            fontStyle("bold"),
            { fontSize: 24, color: colors.text.primary, letterSpacing: -0.2 },
          ]}
        >
          Practice
        </Text>
      </View>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPlan}
        accessibilityLabel="Plan a practice"
        style={{
          width: 36,
          height: 36,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radius.lg,
          backgroundColor: colors.orange[500],
        }}
      >
        <Ionicons name="add" size={20} color={colors.text.primary} />
      </TouchableOpacity>
    </View>
  );
}

export default function PracticeListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { teamId, teamName } = useTeam();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [plans, setPlans] = useState<PlanVM[]>([]);
  const [roster, setRoster] = useState(0);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  // The archived plan a coach is confirming a permanent delete on. Delete is
  // only reachable from the archive, behind a type-the-name confirm.
  const [deleteTarget, setDeleteTarget] = useState<PlanVM | null>(null);
  const [deleting, setDeleting] = useState(false);
  // App-styled modal (replaces native Alert.alert): drives confirms, the
  // per-card manage menu, and error messages from one config slot.
  const [modal, setModal] = useState<ActionModalConfig | null>(null);
  const showError = (title: string, message?: string) =>
    setModal({ title, message, actions: [], cancelLabel: "OK" });
  // Collapsed section keys (view-only state, like the detail page's
  // expandable drill rows — not persisted).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleSection = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const load = useCallback(async () => {
    if (!teamId) return;

    // Plans — select with started_at, fall back if the column doesn't exist.
    let rows: PlanRow[] = [];
    const withStarted = await supabase
      .from("practice_plans")
      .select(`id, practice_date, start_time, title, status, started_at, archived_at, practice_plan_drills(duration_minutes, drill_order, is_water_break, team_drills(team_drill_categories(drill_categories(category_name, category_type))))`)
      .eq("team_id", teamId);
    if (withStarted.error) {
      const core = await supabase
        .from("practice_plans")
        .select(PLANS_SELECT_CORE)
        .eq("team_id", teamId);
      if (core.error) {
        console.warn("practice_plans load failed:", core.error.message);
        return;
      }
      rows = (core.data ?? []) as PlanRow[];
    } else {
      rows = (withStarted.data ?? []) as PlanRow[];
    }

    // Practice logs — attendance + completion for completed plans.
    const logsRes = await supabase
      .from("practice_logs")
      .select("practice_plan_id, attendance_count, drills_completed")
      .eq("team_id", teamId);
    const logsByPlan = new Map<string, LogRow>();
    for (const l of (logsRes.data ?? []) as LogRow[]) {
      if (l.practice_plan_id) logsByPlan.set(l.practice_plan_id, l);
    }

    // Roster size — active players.
    const rosterRes = await supabase
      .from("team_players")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("status", "active");
    setRoster(rosterRes.count ?? 0);

    const now = Date.now();
    setPlans(
      rows.map((r) => {
        const ppd = r.practice_plan_drills ?? [];
        const duration = ppd.reduce(
          (s, d) => s + (d.duration_minutes ?? 0),
          0
        );
        // Past-due is derived only — we keep the practice in its real status
        // (a stale "live" practice stays live so it can be resumed with its
        // data intact). It's surfaced under "Needs Attention" and pulled out
        // of the active live ribbon by the grouping below.
        const pastDue = isPastDue(r.practice_date, r.start_time, now);
        const status = normalizeStatus(r.status);
        const vm: PlanVM = {
          id: r.id,
          title: r.title,
          status,
          practiceDate: r.practice_date,
          dayOffset: dayOffsetFrom(r.practice_date),
          time: formatTime(r.start_time),
          drills: ppd.filter((d) => !d.is_water_break).length,
          duration,
          mix: buildMix(ppd),
          attending: null,
          completion: null,
          progressMin: null,
          pastDue,
          archived: !!r.archived_at,
        };
        if (status === "completed") {
          const log = logsByPlan.get(r.id);
          if (log) {
            vm.attending = log.attendance_count;
            vm.completion =
              ppd.length > 0
                ? Math.min(1, (log.drills_completed?.length ?? 0) / ppd.length)
                : null;
          }
        }
        if (status === "live" && r.started_at) {
          const elapsed = Math.round((now - Date.parse(r.started_at)) / 60_000);
          vm.progressMin = Math.max(0, Math.min(duration, elapsed));
        }
        return vm;
      })
    );
  }, [teamId]);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const goToPlan = (id: string) => {
    lightHaptic();
    router.push(`/practice/${id}` as never);
  };
  const goToNew = () => {
    lightHaptic();
    router.push("/practice/new" as never);
  };
  const goToEdit = (id: string) => {
    lightHaptic();
    router.push(`/practice/${id}/edit` as never);
  };

  const sendLiveToScheduled = (id: string) => {
    lightHaptic();
    setModal({
      title: "Move back to scheduled?",
      message:
        "The practice will no longer show as live. Per-drill timing is preserved — re-starting will reset it for a fresh run.",
      actions: [
        {
          label: "Move",
          onPress: async () => {
            setStartingId(id);
            const { error } = await supabase
              .from("practice_plans")
              .update({ status: "scheduled", started_at: null })
              .eq("id", id);
            setStartingId(null);
            if (error) {
              showError("Couldn't move practice", error.message);
              return;
            }
            await load();
          },
        },
      ],
    });
  };

  // Run a lifecycle mutation (delete / archive / unarchive) then reload.
  const doManage = async (
    plan: PlanVM,
    patch: object | null,
    label: string
  ) => {
    const q = supabase.from("practice_plans");
    const { error } = patch
      ? await q.update(patch).eq("id", plan.id)
      : await q.delete().eq("id", plan.id);
    if (error) {
      showError(`Couldn't ${label} practice`, error.message);
      return;
    }
    await load();
  };

  // Single overflow menu for a card. Lifecycle policy: ANY active practice
  // can only be archived (data is always kept). Deleting is only possible
  // once a practice is archived, and goes through a type-the-name confirm
  // modal. `duplicate` adds a Duplicate option (used by the hero, which
  // folds its old duplicate icon into this menu).
  const openPlanMenu = (plan: PlanVM, opts?: { duplicate?: boolean }) => {
    lightHaptic();
    const actions: ActionModalConfig["actions"] = [];
    if (opts?.duplicate) {
      actions.push({ label: "Duplicate", onPress: () => duplicatePlan(plan.id) });
    }
    let message: string | undefined;
    if (plan.archived) {
      actions.push({
        label: "Unarchive",
        onPress: () => doManage(plan, { archived_at: null }, "unarchive"),
      });
      actions.push({
        label: "Delete",
        variant: "destructive",
        onPress: () => setDeleteTarget(plan),
      });
    } else {
      message =
        "Practices are archived, not deleted — all data is kept. You can delete it permanently later from the archive.";
      actions.push({
        label: "Archive",
        onPress: () =>
          doManage(plan, { archived_at: new Date().toISOString() }, "archive"),
      });
    }
    setModal({ title: plan.title ?? "Practice", message, actions });
  };

  // Duplicate a plan into a fresh independent draft, then open it for editing.
  // Copies title, notes and the drill schedule — never the date, time, status,
  // or any logged (RSVP / completion) data.
  const duplicatePlan = async (planId: string) => {
    if (duplicating) return;
    lightHaptic();
    setDuplicating(true);
    try {
      const { data: orig, error: origErr } = await supabase
        .from("practice_plans")
        .select(
          "title, notes, practice_plan_drills(drill_id, drill_order, duration_minutes, reps_count, notes, is_water_break, parallel_group)"
        )
        .eq("id", planId)
        .maybeSingle();
      if (origErr || !orig) {
        showError(
          "Couldn't duplicate",
          origErr?.message ?? "Practice plan not found."
        );
        return;
      }

      const { data: auth } = await supabase.auth.getUser();
      const { data: created, error: createErr } = await supabase
        .from("practice_plans")
        .insert({
          team_id: teamId,
          created_by: auth.user?.id,
          practice_date: todayIso(), // a fresh date — the original's is not copied
          title: (orig as { title: string | null }).title,
          notes: (orig as { notes: string | null }).notes,
          status: "draft",
        })
        .select("id")
        .single();
      if (createErr || !created) {
        showError(
          "Couldn't duplicate",
          createErr?.message ?? "Could not create the copy."
        );
        return;
      }

      type SrcDrill = {
        drill_id: string | null;
        drill_order: number;
        duration_minutes: number | null;
        reps_count: number | null;
        notes: string | null;
        is_water_break?: boolean | null;
        parallel_group?: number | null;
      };
      const srcDrills =
        ((orig as { practice_plan_drills: SrcDrill[] | null })
          .practice_plan_drills ?? []);
      if (srcDrills.length > 0) {
        const rows = srcDrills.map((d) => ({
          practice_plan_id: created.id,
          drill_id: d.drill_id,
          is_water_break: d.is_water_break ?? false,
          drill_order: d.drill_order,
          duration_minutes: d.duration_minutes,
          reps_count: d.reps_count,
          notes: d.notes,
          parallel_group: d.parallel_group ?? null,
        }));
        let insErr = (
          await supabase.from("practice_plan_drills").insert(rows)
        ).error;
        if (insErr && /is_water_break/.test(insErr.message)) {
          const legacy = rows.map(({ is_water_break, ...r }) => r);
          insErr = (
            await supabase.from("practice_plan_drills").insert(legacy)
          ).error;
        }
        if (insErr) {
          showError("Couldn't duplicate", insErr.message);
          return;
        }
      }

      router.push(`/practice/${created.id}/edit` as never);
    } finally {
      setDuplicating(false);
    }
  };

  const groups = useMemo(() => {
    const byDateAsc = (a: PlanVM, b: PlanVM) =>
      (a.practiceDate ?? "9999-99-99").localeCompare(
        b.practiceDate ?? "9999-99-99"
      );
    const byDateDesc = (a: PlanVM, b: PlanVM) =>
      (b.practiceDate ?? "0000-00-00").localeCompare(
        a.practiceDate ?? "0000-00-00"
      );
    // Archived (soft-deleted) plans live in their own bottom section and are
    // excluded from every active group.
    const active = plans.filter((p) => !p.archived);
    const archived = plans.filter((p) => p.archived).sort(byDateDesc);
    // Stale scheduled/live practices (>6h past start) — surfaced separately.
    const needsAttention = active
      .filter(
        (p) => p.pastDue && (p.status === "scheduled" || p.status === "live")
      )
      .sort(byDateDesc);
    const naIds = new Set(needsAttention.map((p) => p.id));
    const live = active
      .filter((p) => p.status === "live" && !naIds.has(p.id))
      .sort(byDateDesc);
    const upcoming = active
      .filter((p) => p.status === "scheduled" && !naIds.has(p.id))
      .sort(byDateAsc);
    const drafts = active.filter((p) => p.status === "draft").sort(byDateAsc);
    const completed = active
      .filter((p) => p.status === "completed")
      .sort(byDateDesc);
    return {
      needsAttention,
      live,
      nextUp: upcoming[0] ?? null,
      restWeek: upcoming.slice(1),
      drafts,
      completed,
      archived,
    };
  }, [plans]);

  const cadence = useMemo(() => {
    const last4 = groups.completed.slice(0, 4);
    if (last4.length === 0) return null;
    const onFieldTotal = last4.reduce((s, p) => s + p.duration, 0);
    const withAttend = last4.filter((p) => p.attending != null && roster > 0);
    const avgAttend =
      withAttend.length > 0
        ? Math.round(
            (withAttend.reduce((s, p) => s + (p.attending ?? 0) / roster, 0) /
              withAttend.length) *
              100
          )
        : null;
    return { last4, onFieldTotal, avgAttend };
  }, [groups.completed, roster]);

  const headerPaddingTop = insets.top + spacing.lg;

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          paddingTop: headerPaddingTop,
        }}
      >
        <ScreenHeader teamName={teamName} onPlan={goToNew} />
        <View
          style={{ marginTop: spacing["2xl"], paddingHorizontal: PADH, gap: spacing.sm }}
        >
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      </View>
    );
  }

  if (plans.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          paddingTop: headerPaddingTop,
        }}
      >
        <ScreenHeader teamName={teamName} onPlan={goToNew} />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.lg,
            paddingHorizontal: spacing.xl,
            paddingBottom: 80,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.surface.muted,
              borderWidth: 1,
              borderColor: colors.border.subtle,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="calendar-outline"
              size={28}
              color={colors.text.muted}
            />
          </View>
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 15,
                lineHeight: 22,
                color: colors.text.secondary,
                textAlign: "center",
                maxWidth: 280,
              },
            ]}
          >
            No practice plans yet. Plan your first practice to keep the team on
            track.
          </Text>
          <Button label="Plan a Practice" onPress={goToNew} fullWidth={false} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerPaddingTop,
          paddingBottom: insets.bottom + 60 + spacing["2xl"],
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.orange[500]}
          />
        }
      >
        <ScreenHeader teamName={teamName} onPlan={goToNew} />

        {cadence && (
          <CadenceStrip
            last4={cadence.last4}
            avgAttend={cadence.avgAttend}
            onFieldTotal={cadence.onFieldTotal}
          />
        )}

        {groups.live.map((p) => (
          <LiveRibbon
            key={p.id}
            plan={p}
            onPress={() => goToPlan(p.id)}
            onLive={() => router.push(`/practice/${p.id}/run` as never)}
            onSendToScheduled={() => sendLiveToScheduled(p.id)}
            onManage={() => openPlanMenu(p)}
            busy={startingId === p.id}
          />
        ))}

        {groups.nextUp && (
          <>
            <GroupHeader
              label="Up next"
              color={colors.orange[500]}
              collapsible
              collapsed={collapsed.has("upNext")}
              onToggle={() => toggleSection("upNext")}
              trailing={
                <MonoText style={{ fontSize: 10, color: colors.text.muted }}>
                  {relDay(groups.nextUp.dayOffset)}
                </MonoText>
              }
            />
            {!collapsed.has("upNext") && (
              <HeroCard
                plan={groups.nextUp}
                starting={startingId === groups.nextUp.id}
                onOpen={() => goToPlan(groups.nextUp!.id)}
                onStart={() => goToPlan(groups.nextUp!.id)}
                onEdit={() => goToEdit(groups.nextUp!.id)}
                onManage={() => openPlanMenu(groups.nextUp!, { duplicate: true })}
              />
            )}
          </>
        )}

        {groups.restWeek.length > 0 && (
          <>
            <GroupHeader
              label="This week"
              count={groups.restWeek.length}
              color={colors.text.primary}
              collapsible
              collapsed={collapsed.has("thisWeek")}
              onToggle={() => toggleSection("thisWeek")}
            />
            {!collapsed.has("thisWeek") && (
              <View style={{ paddingHorizontal: PADH, gap: 10 }}>
                {groups.restWeek.map((p) => (
                  <PlanCard
                  key={p.id}
                  plan={p}
                  onPress={() => goToPlan(p.id)}
                  onManage={() => openPlanMenu(p)}
                />
                ))}
              </View>
            )}
          </>
        )}

        {groups.needsAttention.length > 0 && (
          <>
            <GroupHeader
              label="Needs Attention!"
              count={groups.needsAttention.length}
              color={colors.red.semantic}
              collapsible
              collapsed={collapsed.has("needsAttention")}
              onToggle={() => toggleSection("needsAttention")}
            />
            {!collapsed.has("needsAttention") && (
              <View style={{ paddingHorizontal: PADH, gap: 10 }}>
                {groups.needsAttention.map((p) => (
                  <PlanCard
                    key={p.id}
                    plan={p}
                    pastDue
                    onManage={() => openPlanMenu(p)}
                    onPress={() =>
                      router.push(
                        (p.status === "live"
                          ? `/practice/${p.id}/run?pastdue=1`
                          : `/practice/${p.id}?pastdue=1`) as never
                      )
                    }
                  />
                ))}
              </View>
            )}
          </>
        )}

        {groups.drafts.length > 0 && (
          <>
            <GroupHeader
              label="Drafts"
              count={groups.drafts.length}
              color={colors.text.muted}
              collapsible
              collapsed={collapsed.has("drafts")}
              onToggle={() => toggleSection("drafts")}
            />
            {!collapsed.has("drafts") && (
              <View style={{ paddingHorizontal: PADH, gap: 10 }}>
                {groups.drafts.map((p) => (
                  <PlanCard
                  key={p.id}
                  plan={p}
                  onPress={() => goToPlan(p.id)}
                  onManage={() => openPlanMenu(p)}
                />
                ))}
              </View>
            )}
          </>
        )}

        {groups.completed.length > 0 && (
          <>
            <GroupHeader
              label="Recent"
              count={groups.completed.length}
              color={colors.blue[400]}
              collapsible
              collapsed={collapsed.has("recent")}
              onToggle={() => toggleSection("recent")}
            />
            {!collapsed.has("recent") && (
              <View style={{ paddingHorizontal: PADH, gap: 10 }}>
                {groups.completed.map((p) => (
                  <PlanCard
                  key={p.id}
                  plan={p}
                  onPress={() => goToPlan(p.id)}
                  onManage={() => openPlanMenu(p)}
                />
                ))}
              </View>
            )}
          </>
        )}

        {groups.archived.length > 0 && (
          <>
            <GroupHeader
              label="Archived"
              count={groups.archived.length}
              color={colors.text.muted}
              collapsible
              collapsed={collapsed.has("archived")}
              onToggle={() => toggleSection("archived")}
            />
            {!collapsed.has("archived") && (
              <View style={{ paddingHorizontal: PADH, gap: 10 }}>
                {groups.archived.map((p) => (
                  <PlanCard
                  key={p.id}
                  plan={p}
                  onPress={() => goToPlan(p.id)}
                  onManage={() => openPlanMenu(p)}
                />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <ActionModal
        open={!!modal}
        onClose={() => setModal(null)}
        config={modal}
      />

      <DeleteConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.title}
        busy={deleting}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          await doManage(deleteTarget, null, "delete");
          setDeleting(false);
          setDeleteTarget(null);
        }}
      />
    </View>
  );
}
