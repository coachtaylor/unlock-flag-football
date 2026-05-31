import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "../../../components/ui/Card";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Eyebrow } from "../../../components/ui/Eyebrow";
import { HeaderIconButton } from "../../../components/ui/HeaderIconButton";
import { SheetContainer, SheetSectionLabel } from "../../../components/ui/Sheet";
import { PhaseChip } from "../../../components/DrillForm";
import { colors, radius, spacing, tracking } from "../../../constants/design";
import { fontStyle, monoStyle } from "../../../constants/typography";
import {
  SKILL_GROUP_META,
  skillGroupMeta,
  type SkillGroup,
} from "../../../constants/skill-groups";
import {
  clonePresetDrill,
  loadPresetLibrary,
  removeClonedDrill,
  type PresetDrillWithSkills,
} from "../../../lib/preset-library";
import type { TaggedSkill } from "../../../lib/skills";
import { useTeam } from "../../../lib/team-context";

const FORMATS = ["5v5", "7v7"] as const;
type Format = (typeof FORMATS)[number];

// Position vocabulary kept inline (mirrors the web preset library): the
// seed's primary_for_positions[] is human-typed, not the full positions.ts
// catalog.
const POSITION_FILTERS = [
  "QB",
  "WR",
  "RB",
  "Center",
  "DB",
  "Safety",
  "Rusher",
] as const;
type PositionFilter = (typeof POSITION_FILTERS)[number];

export default function PresetLibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { teamId, teamName } = useTeam();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [presets, setPresets] = useState<PresetDrillWithSkills[]>([]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeGroups, setActiveGroups] = useState<Set<SkillGroup>>(new Set());
  const [activeFormats, setActiveFormats] = useState<Set<Format>>(new Set());
  const [activePositions, setActivePositions] = useState<Set<PositionFilter>>(
    new Set()
  );
  const [hideCloned, setHideCloned] = useState(false);

  // Remove-clone confirmation. Holds the preset whose team copy is being
  // removed; the ConfirmDialog reads it for the drill name.
  const [removeTarget, setRemoveTarget] = useState<PresetDrillWithSkills | null>(
    null
  );
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    const { presets } = await loadPresetLibrary(teamId);
    setPresets(presets);
  }, [teamId]);

  // Reload on focus so "Already added" status refreshes after a clone +
  // navigating back.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      load().finally(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const rows = useMemo(() => {
    let xs = presets.slice();
    const q = search.trim().toLowerCase();
    if (q) {
      xs = xs.filter(
        (p) =>
          p.drill_name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      );
    }
    if (activeGroups.size > 0) {
      xs = xs.filter((p) => p.skills.some((s) => activeGroups.has(s.skill_group)));
    }
    if (activeFormats.size > 0) {
      xs = xs.filter((p) => p.formats.some((f) => activeFormats.has(f as Format)));
    }
    if (activePositions.size > 0) {
      xs = xs.filter((p) => {
        // Empty primary_for_positions[] = "all positions" → always passes.
        if (p.primary_for_positions.length === 0) return true;
        return p.primary_for_positions.some((pos) =>
          activePositions.has(pos as PositionFilter)
        );
      });
    }
    if (hideCloned) xs = xs.filter((p) => !p.alreadyCloned);
    return xs;
  }, [presets, search, activeGroups, activeFormats, activePositions, hideCloned]);

  const activeFilterCount =
    activeGroups.size +
    activeFormats.size +
    activePositions.size +
    (hideCloned ? 1 : 0);

  const clearAll = () => {
    setActiveGroups(new Set());
    setActiveFormats(new Set());
    setActivePositions(new Set());
    setHideCloned(false);
  };

  const confirmRemove = async () => {
    if (!removeTarget?.clonedDrillId || removing) return;
    setRemoving(true);
    setRemoveError(null);
    const result = await removeClonedDrill(removeTarget.clonedDrillId);
    setRemoving(false);
    if (!result.ok) {
      setRemoveError(result.error);
      return;
    }
    setRemoveTarget(null);
    await load();
  };

  const headerPaddingTop = insets.top + spacing.md;
  const eyebrowLeft = teamName ? teamName.toUpperCase() : "PLAYBOOK";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 60 + insets.bottom + spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.orange[500]}
          />
        }
      >
        {/* Header */}
        <View
          style={{
            paddingTop: headerPaddingTop,
            paddingHorizontal: spacing.lg,
            paddingBottom: 2,
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", gap: spacing.md, flexShrink: 1 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.7}
              hitSlop={8}
              accessibilityLabel="Back"
              style={{ paddingTop: 2 }}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={colors.text.primary}
              />
            </TouchableOpacity>
            <View style={{ gap: 2, flexShrink: 1 }}>
              <Eyebrow variant="brand">{eyebrowLeft} · LIBRARY</Eyebrow>
              <Text
                style={[
                  fontStyle("bold"),
                  {
                    fontSize: 22,
                    letterSpacing: tracking.tight,
                    color: colors.text.primary,
                  },
                ]}
              >
                Preset library
              </Text>
            </View>
          </View>
          <HeaderIconButton
            icon="search"
            variant="solid"
            onPress={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setSearch("");
            }}
            accessibilityLabel="Search presets"
          />
        </View>

        {/* Search row (toggle) */}
        {searchOpen && (
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.surface.raised,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border.card,
                paddingHorizontal: spacing.md,
                minHeight: 40,
              }}
            >
              <Ionicons name="search" size={16} color={colors.text.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search presets…"
                placeholderTextColor={colors.text.muted}
                autoFocus
                style={[
                  fontStyle("medium"),
                  {
                    flex: 1,
                    marginLeft: spacing.sm,
                    fontSize: 14,
                    color: colors.text.primary,
                    paddingVertical: 8,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* Filter / count bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.md,
          }}
        >
          <FilterButton
            label="Filter"
            badge={activeFilterCount > 0 ? activeFilterCount : undefined}
            active={activeFilterCount > 0}
            onPress={() => setFilterOpen(true)}
          />
          <Text
            style={[
              monoStyle("medium"),
              { fontSize: 11, color: colors.text.muted, letterSpacing: 0.4 },
            ]}
          >
            {rows.length} / {presets.length}
          </Text>
        </View>

        {/* Cards */}
        {loading ? (
          <View style={{ paddingTop: spacing["3xl"], alignItems: "center" }}>
            <ActivityIndicator color={colors.orange[500]} />
          </View>
        ) : rows.length === 0 ? (
          <View
            style={{
              marginHorizontal: spacing.lg,
              padding: spacing["2xl"],
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.border.default,
              borderStyle: "dashed",
              alignItems: "center",
              gap: spacing.sm,
            }}
          >
            <Text
              style={[
                fontStyle("medium"),
                { fontSize: 14, color: colors.text.secondary, textAlign: "center" },
              ]}
            >
              {presets.length === 0
                ? "No presets available yet."
                : "No presets match your filters."}
            </Text>
            {activeFilterCount > 0 && (
              <TouchableOpacity onPress={clearAll} activeOpacity={0.7}>
                <Text
                  style={[
                    fontStyle("medium"),
                    { fontSize: 13, color: colors.orange[400] },
                  ]}
                >
                  Clear filters
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {rows.map((p) => (
              <PresetCard
                key={p.id}
                preset={p}
                teamId={teamId ?? ""}
                onCloned={(drillId) => router.push(`/drills/${drillId}` as never)}
                onOpen={(drillId) => router.push(`/drills/${drillId}` as never)}
                onRequestRemove={() => {
                  setRemoveError(null);
                  setRemoveTarget(p);
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        presets={presets}
        activeGroups={activeGroups}
        setActiveGroups={setActiveGroups}
        activeFormats={activeFormats}
        setActiveFormats={setActiveFormats}
        activePositions={activePositions}
        setActivePositions={setActivePositions}
        hideCloned={hideCloned}
        setHideCloned={setHideCloned}
        onClear={clearAll}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onCancel={() => {
          if (!removing) {
            setRemoveTarget(null);
            setRemoveError(null);
          }
        }}
        onConfirm={confirmRemove}
        title="Remove from library?"
        body={`"${
          removeTarget?.drill_name ?? "This drill"
        }" will be removed from your team library. The preset stays available to add again.`}
        confirmLabel="Remove"
        pendingLabel="Removing…"
        pending={removing}
        error={removeError}
      />
    </View>
  );
}

// ── Preset card ─────────────────────────────────────────────────────────

function PresetCard({
  preset,
  teamId,
  onCloned,
  onOpen,
  onRequestRemove,
}: {
  preset: PresetDrillWithSkills;
  teamId: string;
  onCloned: (drillId: string) => void;
  onOpen: (drillId: string) => void;
  onRequestRemove: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primaryGroup = preset.skills[0]?.skill_group ?? null;
  const accentColor = primaryGroup
    ? skillGroupMeta(primaryGroup).color
    : colors.border.strong;

  const handleClone = async () => {
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await clonePresetDrill(preset.id, teamId);
    setPending(false);
    if (result.ok) onCloned(result.drillId);
    else setError(result.error);
  };

  const metaParts = [
    preset.category_type,
    preset.default_duration_min ? `${preset.default_duration_min}m` : null,
    preset.default_reps ? `${preset.default_reps} reps` : null,
  ].filter(Boolean) as string[];

  return (
    <Card variant="filled" pad={0} style={{ overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "stretch" }}>
        {/* Left accent stripe in the primary skill-group color */}
        <View style={{ width: 3, backgroundColor: accentColor }} />

        <View style={{ flex: 1, padding: spacing.lg, gap: spacing.sm }}>
          {/* Title + meta. Presets are NOT labeled as benchmarks — benchmark
              designation is a captain opt-in after cloning (see the clone RPC),
              so no "Bench" badge here. Trash (top-right) removes the team's
              clone; only shown once cloned. */}
          <View
            style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text
                style={[
                  fontStyle("bold"),
                  { fontSize: 15, color: colors.text.primary },
                ]}
              >
                {preset.drill_name}
              </Text>
              {metaParts.length > 0 && (
                <Text
                  style={[
                    monoStyle("medium"),
                    {
                      fontSize: 10,
                      color: colors.text.muted,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                    },
                  ]}
                >
                  {metaParts.join(" · ")}
                </Text>
              )}
            </View>
            {preset.alreadyCloned && preset.clonedDrillId && (
              <TouchableOpacity
                onPress={onRequestRemove}
                activeOpacity={0.7}
                hitSlop={8}
                accessibilityLabel="Remove from library"
                style={{ padding: 2 }}
              >
                <Ionicons
                  name="trash-outline"
                  size={17}
                  color={colors.red.semantic}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Description */}
          {preset.description.length > 0 && (
            <Text
              numberOfLines={3}
              style={[
                fontStyle("regular"),
                { fontSize: 12.5, lineHeight: 18, color: colors.text.secondary },
              ]}
            >
              {preset.description}
            </Text>
          )}

          {/* Skill chips */}
          {preset.skills.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
              {preset.skills.map((s) => (
                <SkillChip key={s.id} skill={s} />
              ))}
            </View>
          )}

          {/* Meta pills + action */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.sm,
              marginTop: 2,
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 4,
                minWidth: 0,
              }}
            >
              {preset.formats.map((f) => (
                <MetaPill key={f} label={f} />
              ))}
              {preset.primary_for_positions.length > 0 ? (
                preset.primary_for_positions.map((p) => (
                  <MetaPill key={p} label={p} dim />
                ))
              ) : (
                <MetaPill label="all positions" dim />
              )}
            </View>
            {preset.alreadyCloned && preset.clonedDrillId ? (
              <TouchableOpacity
                onPress={() => onOpen(preset.clonedDrillId!)}
                activeOpacity={0.7}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border.card,
                }}
              >
                <Text
                  style={[
                    fontStyle("semibold"),
                    { fontSize: 11.5, color: colors.lime[400] },
                  ]}
                >
                  In library →
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleClone}
                activeOpacity={0.85}
                disabled={pending}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: radius.md,
                  backgroundColor: pending
                    ? colors.surface.overlay
                    : colors.orange[500],
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                {pending ? (
                  <ActivityIndicator size="small" color={colors.text.muted} />
                ) : (
                  <Ionicons name="add" size={13} color={colors.text.onBrand} />
                )}
                <Text
                  style={[
                    fontStyle("semibold"),
                    {
                      fontSize: 11.5,
                      color: pending ? colors.text.muted : colors.text.onBrand,
                    },
                  ]}
                >
                  {pending ? "Adding…" : "Add to team"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {error && (
            <Text
              style={[
                monoStyle("medium"),
                { fontSize: 11, color: colors.red.semantic },
              ]}
            >
              {error}
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
}

function SkillChip({ skill }: { skill: TaggedSkill }) {
  const isPrimary = skill.weight === 1.0;
  const meta = skillGroupMeta(skill.skill_group);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: isPrimary ? meta.tint : colors.surface.overlay,
        borderWidth: 1,
        borderColor: isPrimary ? meta.color : "transparent",
      }}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: meta.color,
          opacity: isPrimary ? 1 : 0.6,
        }}
      />
      <Text
        style={[
          isPrimary ? fontStyle("bold") : fontStyle("medium"),
          {
            fontSize: 10.5,
            color: isPrimary ? colors.text.primary : colors.text.muted,
          },
        ]}
      >
        {skill.skill_name}
      </Text>
    </View>
  );
}

function MetaPill({ label, dim }: { label: string; dim?: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
        backgroundColor: colors.surface.overlay,
        borderWidth: 1,
        borderColor: colors.border.card,
      }}
    >
      <Text
        style={[
          monoStyle("bold"),
          {
            fontSize: 9.5,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: dim ? colors.text.muted : colors.text.secondary,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// ── Filter button + sheet ─────────────────────────────────────────────────

function FilterButton({
  label,
  badge,
  active,
  onPress,
}: {
  label: string;
  badge?: number;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: active ? colors.orange[500] : colors.border.card,
        backgroundColor: active ? colors.orange.tint : colors.surface.raised,
      }}
    >
      <Ionicons
        name="options-outline"
        size={14}
        color={active ? colors.orange[400] : colors.text.secondary}
      />
      <Text
        style={[
          fontStyle("medium"),
          {
            fontSize: 13,
            color: active ? colors.orange[400] : colors.text.secondary,
          },
        ]}
      >
        {label}
      </Text>
      {badge != null && (
        <View
          style={{
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 4,
            backgroundColor: colors.orange[500],
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={[
              monoStyle("bold"),
              { fontSize: 10, color: colors.text.onBrand },
            ]}
          >
            {badge}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function FilterSheet({
  open,
  onClose,
  presets,
  activeGroups,
  setActiveGroups,
  activeFormats,
  setActiveFormats,
  activePositions,
  setActivePositions,
  hideCloned,
  setHideCloned,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  presets: PresetDrillWithSkills[];
  activeGroups: Set<SkillGroup>;
  setActiveGroups: (v: Set<SkillGroup>) => void;
  activeFormats: Set<Format>;
  setActiveFormats: (v: Set<Format>) => void;
  activePositions: Set<PositionFilter>;
  setActivePositions: (v: Set<PositionFilter>) => void;
  hideCloned: boolean;
  setHideCloned: (v: boolean) => void;
  onClear: () => void;
}) {
  const clonedCount = useMemo(
    () => presets.filter((p) => p.alreadyCloned).length,
    [presets]
  );

  function toggle<T>(set: Set<T>, val: T, setter: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  }

  return (
    <SheetContainer open={open} onClose={onClose}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={[fontStyle("bold"), { fontSize: 18, color: colors.text.primary }]}
        >
          Filter
        </Text>
        <TouchableOpacity onPress={onClear} hitSlop={8} activeOpacity={0.7}>
          <Text
            style={[fontStyle("medium"), { fontSize: 13, color: colors.orange[400] }]}
          >
            Clear
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SheetSectionLabel>Skill group</SheetSectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {SKILL_GROUP_META.map((m) => (
            <PhaseChip
              key={m.id}
              label={m.label}
              color={m.color}
              selected={activeGroups.has(m.id)}
              onPress={() => toggle(activeGroups, m.id, setActiveGroups)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SheetSectionLabel>Format</SheetSectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {FORMATS.map((f) => (
            <PhaseChip
              key={f}
              label={f}
              selected={activeFormats.has(f)}
              onPress={() => toggle(activeFormats, f, setActiveFormats)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SheetSectionLabel>Position</SheetSectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {POSITION_FILTERS.map((p) => (
            <PhaseChip
              key={p}
              label={p}
              selected={activePositions.has(p)}
              onPress={() => toggle(activePositions, p, setActivePositions)}
            />
          ))}
        </View>
      </View>

      {clonedCount > 0 && (
        <View style={{ gap: spacing.sm }}>
          <SheetSectionLabel>Library status</SheetSectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <PhaseChip
              label={`Hide already added (${clonedCount})`}
              selected={hideCloned}
              onPress={() => setHideCloned(!hideCloned)}
            />
          </View>
        </View>
      )}
    </SheetContainer>
  );
}
