import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DiagramRenderer from "../../../../components/DiagramRenderer";
import { Section } from "../../../../components/ui/FormSection";
import {
  NumberedEyebrow,
  MonogramTile,
  getMonogram,
} from "../../../../components/DrillForm";
import {
  CATEGORY_COLORS,
  type CategoryType,
  inferCategoryType,
  normalizeCategory,
} from "../../../../constants/categories";
import { SKILL_GROUP_META } from "../../../../constants/skill-groups";
import { loadDrillSkills, type TaggedSkill } from "../../../../lib/skills";
import { resolveActorName } from "../../../../lib/activity";
import { Byline } from "../../../../components/ui/Byline";
import { EntityHistorySheet } from "../../../../components/activity/EntityHistorySheet";
import { Button } from "../../../../components/ui/Button";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { DeleteConfirmModal } from "../../../../components/ui/DeleteConfirmModal";
import { colors, radius, spacing } from "../../../../constants/design";
import { fontStyle, monoStyle } from "../../../../constants/typography";
import { supabase } from "../../../../lib/supabase";
import { useTeam } from "../../../../lib/team-context";
import {
  archiveTeamDrill,
  unarchiveTeamDrill,
  deleteTeamDrill,
} from "../../../../lib/preset-library";
import { generateSetupInstructions } from "../../../../lib/generate-setup-instructions";
import type { DiagramData } from "../../../../types/diagram";
import {
  BENCHMARK_SCOPE_LABELS,
  BENCHMARK_TYPE_META,
  benchmarkConfigFromLegacy,
  isBenchmarkConfigured,
  parseBenchmarkConfig,
  type BenchmarkConfig,
  type BenchmarkType,
  type GroupConfig,
} from "../../../../constants/benchmarks";

type LegacyBenchmarkKind = "timed" | "rated" | "reps_complete" | "percentage";

type DrillRow = {
  id: string;
  team_id: string;
  drill_name: string;
  description: string | null;
  source_url: string | null;
  benchmark_type: LegacyBenchmarkKind | null;
  benchmark_types: string[] | null;
  benchmark_scope?: string | null;
  benchmark_config?: unknown;
  status: "draft" | "published" | "archived";
  preset_drill_id?: string | null;
  setup_instructions: string | null;
  setup_diagram: DiagramData | null;
  equipment: { cones?: number; other?: unknown } | null;
  default_reps: number | null;
  default_duration_min: number | null;
  is_dashboard_pinned?: boolean | null;
  team_drill_categories: { category_id: string }[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

const PIN_CAP = 4;

const DRILL_SELECT =
  "id, team_id, drill_name, description, source_url, benchmark_type, benchmark_types, benchmark_scope, benchmark_config, status, preset_drill_id, setup_instructions, setup_diagram, equipment, default_reps, default_duration_min, is_dashboard_pinned, created_at, updated_at, created_by, updated_by, team_drill_categories(category_id)";
// Same as DRILL_SELECT minus the Build 14.5 attribution columns, for projects
// where migration 75 hasn't shipped (the byline just renders nothing there).
const DRILL_SELECT_NO_ATTRIB =
  "id, team_id, drill_name, description, source_url, benchmark_type, benchmark_types, benchmark_scope, benchmark_config, status, preset_drill_id, setup_instructions, setup_diagram, equipment, default_reps, default_duration_min, is_dashboard_pinned, team_drill_categories(category_id)";
const DRILL_SELECT_PRE_PIN =
  "id, team_id, drill_name, description, source_url, benchmark_type, benchmark_types, benchmark_scope, benchmark_config, status, setup_instructions, setup_diagram, equipment, default_reps, default_duration_min, team_drill_categories(category_id)";
const DRILL_SELECT_MIG_18 =
  "id, team_id, drill_name, description, source_url, benchmark_type, benchmark_types, status, setup_instructions, setup_diagram, equipment, default_reps, default_duration_min, team_drill_categories(category_id)";
const DRILL_SELECT_LEGACY =
  "id, team_id, drill_name, description, source_url, benchmark_type, status, setup_instructions, setup_diagram, equipment, team_drill_categories(category_id)";

export default function DrillDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { teamId, canManage } = useTeam();

  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<DrillRow | null>(null);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [categoryTypes, setCategoryTypes] = useState<
    Record<string, CategoryType>
  >({});
  const [drillSkills, setDrillSkills] = useState<TaggedSkill[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editorName, setEditorName] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !teamId) return;
    setLoadError(null);
    let res = await supabase
      .from("team_drills")
      .select(DRILL_SELECT)
      .eq("id", id)
      .maybeSingle();

    // Schema-drift fallbacks: strip newer columns one tier at a time so this
    // page keeps loading on environments where migration 75 / 40 / 38 /
    // migration 18 haven't shipped yet.
    if (
      res.error &&
      /created_by|updated_by|created_at|updated_at/i.test(res.error.message)
    ) {
      res = await supabase
        .from("team_drills")
        .select(DRILL_SELECT_NO_ATTRIB)
        .eq("id", id)
        .maybeSingle();
    }
    if (res.error && /is_dashboard_pinned/i.test(res.error.message)) {
      res = await supabase
        .from("team_drills")
        .select(DRILL_SELECT_PRE_PIN)
        .eq("id", id)
        .maybeSingle();
    }
    if (
      res.error &&
      /benchmark_(scope|config)/i.test(res.error.message)
    ) {
      res = await supabase
        .from("team_drills")
        .select(DRILL_SELECT_MIG_18)
        .eq("id", id)
        .maybeSingle();
    }
    if (
      res.error &&
      /default_reps|default_duration_min|benchmark_types/i.test(res.error.message)
    ) {
      res = await supabase
        .from("team_drills")
        .select(DRILL_SELECT_LEGACY)
        .eq("id", id)
        .maybeSingle();
    }

    if (res.error) {
      console.warn("[drill detail] query error:", res.error.message);
      setLoadError(res.error.message);
      setDrill(null);
      return;
    }

    if (!res.data || (res.data.team_id as string) !== teamId) {
      setDrill(null);
      setNotFound(true);
      return;
    }

    const drillData = res.data as DrillRow;
    setDrill(drillData);
    setNotFound(false);

    // Attribution byline: last editor, falling back to creator (Build 14.5).
    const actorId = drillData.updated_by ?? drillData.created_by ?? null;
    resolveActorName(actorId).then(setEditorName);

    const ids = Array.from(
      new Set<string>(
        (drillData.team_drill_categories ?? []).map((l) => l.category_id)
      )
    );

    if (ids.length > 0) {
      let catRes: { data: any[] | null; error: { message: string } | null } =
        await supabase
          .from("drill_categories")
          .select("id, category_name, category_type")
          .in("id", ids);
      if (catRes.error && /category_type/i.test(catRes.error.message)) {
        catRes = await supabase
          .from("drill_categories")
          .select("id, category_name")
          .in("id", ids);
      }
      const rows = catRes.data ?? [];
      const nameById = new Map(
        rows.map((c) => [c.id as string, c.category_name as string])
      );
      const names = ids
        .map((cid) => nameById.get(cid))
        .filter((n): n is string => !!n);
      const typeByName: Record<string, CategoryType> = {};
      for (const c of rows) {
        const n = c.category_name as string;
        const t = (c.category_type as CategoryType | null) ?? inferCategoryType(n);
        typeByName[n] = t;
      }
      setCategoryNames(names);
      setCategoryTypes(typeByName);
    } else {
      setCategoryNames([]);
      setCategoryTypes({});
    }

    const skillsByDrill = await loadDrillSkills([id]);
    setDrillSkills(skillsByDrill[id] ?? []);
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

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/drills" as never);
  };
  const openSourceUrl = () => {
    if (drill?.source_url) Linking.openURL(drill.source_url);
  };
  const goToEdit = () => {
    if (drill) router.push(`/drills/${drill.id}/edit` as never);
  };
  const runBenchmark = () => {
    if (drill) router.push(`/benchmarks?drill=${drill.id}` as never);
  };

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [typeDeleteOpen, setTypeDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Dashboard-pin state. `pinSupported` flips off if the column doesn't
  // exist yet (migration 40 not applied) so the row hides quietly.
  const [pinSupported, setPinSupported] = useState(true);
  const [teamPinCount, setTeamPinCount] = useState<number>(0);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinNotice, setPinNotice] = useState<string | null>(null);

  const refreshPinCount = useCallback(async () => {
    if (!teamId) return;
    const { count, error } = await supabase
      .from("team_drills")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("is_dashboard_pinned", true);
    if (error) {
      if (/is_dashboard_pinned/i.test(error.message)) {
        setPinSupported(false);
        return;
      }
      console.warn("[drill detail] pin count:", error.message);
      return;
    }
    setTeamPinCount(count ?? 0);
  }, [teamId]);

  useFocusEffect(
    useCallback(() => {
      refreshPinCount();
    }, [refreshPinCount])
  );

  const togglePin = useCallback(async () => {
    if (!drill || pinBusy) return;
    const desired = !drill.is_dashboard_pinned;
    setPinBusy(true);
    setPinNotice(null);
    const { error } = await supabase.rpc("pin_drill_to_dashboard", {
      p_drill_id: drill.id,
      p_pin: desired,
    });
    setPinBusy(false);
    if (error) {
      if (/pin_drill_to_dashboard|function .* does not exist/i.test(error.message)) {
        setPinSupported(false);
        return;
      }
      if (/pin_cap_reached/i.test(error.message)) {
        setPinNotice(
          `Dashboard is full — unpin a drill (${PIN_CAP}/${PIN_CAP}) before adding another.`
        );
        return;
      }
      setPinNotice(error.message);
      return;
    }
    // Optimistic local mirror — re-fetch source-of-truth state too.
    setDrill((d) => (d ? { ...d, is_dashboard_pinned: desired } : d));
    setPinNotice(
      desired ? "Pinned to dashboard." : "Removed from dashboard."
    );
    refreshPinCount();
  }, [drill, pinBusy, refreshPinCount]);

  const goBackToLibrary = () => {
    // Pop back to the library — the drill no longer exists or has moved out
    // of the active list, so the detail route is no longer meaningful.
    if (router.canGoBack()) router.back();
    else router.replace("/drills" as never);
  };

  // Hard delete — used for preset "Remove from library" and the custom-drill
  // permanent delete (only after it's archived). Goes through the canonical
  // deleteTeamDrill so FK-blocked deletes show a friendly message.
  const handleHardDelete = async () => {
    if (!drill) return;
    setDeleting(true);
    setDeleteError(null);
    const r = await deleteTeamDrill(drill.id);
    setDeleting(false);
    if (!r.ok) {
      setDeleteError(r.error);
      return;
    }
    setConfirmDeleteOpen(false);
    setTypeDeleteOpen(false);
    goBackToLibrary();
  };

  // Soft delete — a custom drill drops out of the active library + pickers.
  const handleArchive = async () => {
    if (!drill) return;
    setArchiving(true);
    setDeleteError(null);
    const r = await archiveTeamDrill(drill.id);
    setArchiving(false);
    if (!r.ok) {
      setDeleteError(r.error);
      return;
    }
    setConfirmArchiveOpen(false);
    goBackToLibrary();
  };

  const handleUnarchive = async () => {
    if (!drill) return;
    const r = await unarchiveTeamDrill(drill.id);
    if (!r.ok) {
      setDeleteError(r.error);
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.orange[500]} />
      </View>
    );
  }

  if (loadError) {
    return (
      <CenteredMessage
        title="Couldn't load drill"
        body={loadError}
        onBack={goBack}
        topInset={insets.top}
      />
    );
  }

  if (notFound || !drill) {
    return (
      <CenteredMessage
        title="Drill not found"
        body="This drill may have been deleted or moved."
        onBack={goBack}
        topInset={insets.top}
      />
    );
  }

  const rawDiagram = drill.setup_diagram;
  const diagram =
    rawDiagram &&
    Array.isArray(rawDiagram.cones) &&
    rawDiagram.cones.length > 0
      ? rawDiagram
      : null;

  const setupInstructions =
    drill.setup_instructions ??
    (diagram ? generateSetupInstructions(diagram) : "");

  const equipmentCones =
    typeof drill.equipment?.cones === "number" ? drill.equipment.cones : 0;
  const equipmentOther = Array.isArray(drill.equipment?.other)
    ? (drill.equipment!.other as unknown[]).filter(
        (x): x is string => typeof x === "string"
      )
    : [];
  const equipmentParts: string[] = [];
  if (equipmentCones > 0) {
    equipmentParts.push(
      `${equipmentCones} cone${equipmentCones === 1 ? "" : "s"}`
    );
  }
  equipmentParts.push(...equipmentOther);
  const equipmentLabel = equipmentParts.join(" · ");

  // Only phase categories surface now — the Skill/Sub-skill category axis was
  // retired in favor of the skill taxonomy (the "Skill tags" section).
  const typeFor = (name: string): CategoryType =>
    categoryTypes[name] ?? inferCategoryType(name);
  const phaseTags = categoryNames.filter((c) => typeFor(c) === "phase");

  // Hydrate the new benchmark_config when present; fall back to the legacy
  // single-type column so pre-migration-38 drills still render meaningfully.
  const benchmarkCfg: BenchmarkConfig | null =
    parseBenchmarkConfig(drill.benchmark_config) ??
    benchmarkConfigFromLegacy(drill.benchmark_type, drill.benchmark_types);
  // Source of truth for "is this a benchmark?" is benchmark_types — the flat
  // list BOTH web and mobile write in sync. benchmark_config has different
  // shapes per platform (mobile scope-grouped, web type-keyed), so it isn't a
  // safe cross-app signal. This matches the web drill detail exactly, so the
  // two can never disagree. benchmarkCfg (above) is still used to render the
  // rich config when the drill IS a benchmark.
  const isBenchmarkDrill =
    (drill.benchmark_types?.length ?? 0) > 0 || !!drill.benchmark_type;
  const showRunBenchmark =
    isBenchmarkDrill && drill.status === "published";
  const isLive = drill.status === "published";
  // Lifecycle context for the manage actions: preset clones are removed from
  // the library; custom drills archive → (unarchive | delete).
  const isPreset = drill.preset_drill_id != null;
  const isArchived = drill.status === "archived";
  const eyebrow = isArchived
    ? "DRILL · ARCHIVED"
    : isLive
    ? "DRILL · LIVE"
    : "DRILL · DRAFT";
  const monogram = getMonogram(drill.drill_name);

  // Reserve room for the sticky Run benchmark CTA when it renders so it
  // never sits over the tab bar. Without that CTA the page can scroll to
  // its natural end (the inline delete-drill link).
  const footerReservedHeight = showRunBenchmark ? 130 : 0;

  // Section numbers are assigned in render order so hiding a section (e.g. the
  // benchmark section on a coaching-only drill) never leaves a numbering gap.
  let _section = 0;
  const sectionNo = () => String(++_section).padStart(2, "0");

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + spacing.md,
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
          <TouchableOpacity
            onPress={goBack}
            accessibilityLabel="Back"
            hitSlop={10}
            activeOpacity={0.85}
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.lg,
              backgroundColor: colors.surface.raised,
              borderWidth: 1,
              borderColor: colors.border.card,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="chevron-back"
              size={18}
              color={colors.text.primary}
            />
          </TouchableOpacity>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: spacing.xs,
          }}
        >
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 11,
                color: colors.orange[500],
                letterSpacing: 1.5,
              },
            ]}
          >
            {eyebrow}
          </Text>
          {canManage && (
            <TouchableOpacity
              onPress={goToEdit}
              accessibilityLabel="Edit drill"
              hitSlop={10}
              activeOpacity={0.6}
            >
              <Text
                style={[
                  fontStyle("bold"),
                  {
                    fontSize: 11,
                    color: colors.lime[400],
                    letterSpacing: 1.5,
                  },
                ]}
              >
                EDIT
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom:
            insets.bottom + 60 + footerReservedHeight + spacing.lg,
          gap: spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* 01 · IDENTITY */}
        <Section>
          <NumberedEyebrow index={sectionNo()} label="Identity" />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              marginTop: spacing.md,
            }}
          >
            <MonogramTile text={monogram} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={[
                  fontStyle("bold"),
                  {
                    color: colors.text.primary,
                    fontSize: 18,
                    letterSpacing: -0.2,
                  },
                ]}
              >
                {drill.drill_name}
              </Text>
              <Text
                style={[
                  fontStyle("medium"),
                  {
                    fontSize: 10,
                    color: colors.text.muted,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  },
                ]}
              >
                Drill name
              </Text>
              {editorName ? (
                <Byline
                  who={editorName}
                  verb={drill.updated_by ? "Updated" : "Created"}
                  at={drill.updated_at ?? drill.created_at}
                />
              ) : null}
              <View style={{ marginTop: 4 }}>
                <EntityHistorySheet entityType="drill" entityId={drill.id} />
              </View>
            </View>
          </View>
        </Section>

        {/* Dashboard pin toggle — only meaningful for benchmark drills, and
            only renders if the migration that added `is_dashboard_pinned` has
            shipped. */}
        {canManage && pinSupported && isBenchmarkDrill ? (
          <PinToDashboardRow
            pinned={!!drill.is_dashboard_pinned}
            count={teamPinCount}
            cap={PIN_CAP}
            busy={pinBusy}
            notice={pinNotice}
            onToggle={togglePin}
          />
        ) : null}

        {/* 02 · PHASE */}
        <Section>
          <NumberedEyebrow index={sectionNo()} label="Phase" />
          {phaseTags.length === 0 ? (
            <EmptyText style={{ marginTop: spacing.md }}>
              No phase set.
            </EmptyText>
          ) : (
            <View
              style={{
                marginTop: spacing.md,
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {phaseTags.map((name, i) => {
                const normalized = normalizeCategory(name);
                const phaseColor = normalized
                  ? CATEGORY_COLORS[normalized]
                  : colors.text.primary;
                return (
                  <Text
                    key={name}
                    style={[
                      fontStyle("medium"),
                      {
                        fontSize: 14,
                        color: phaseColor,
                        letterSpacing: 0.1,
                      },
                    ]}
                  >
                    {i > 0 ? "  ·  " : ""}
                    {name}
                  </Text>
                );
              })}
            </View>
          )}
        </Section>

        {/* 03 · SKILL TAGS */}
        <Section>
          <NumberedEyebrow index={sectionNo()} label="Skill tags" />
          {drillSkills.length === 0 ? (
            <EmptyText style={{ marginTop: spacing.md }}>
              No skill tags assigned.
            </EmptyText>
          ) : (
            <View style={{ marginTop: spacing.md, gap: spacing.md }}>
              {SKILL_GROUP_META.map((group) => {
                const inGroup = drillSkills.filter(
                  (s) => s.skill_group === group.id
                );
                if (inGroup.length === 0) return null;
                return (
                  <View key={group.id}>
                    <MiniLabel>{group.longLabel}</MiniLabel>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: spacing.sm,
                      }}
                    >
                      {inGroup.map((s) => (
                        <SkillTagChip
                          key={s.id}
                          label={s.skill_name}
                          color={group.color}
                          tint={group.tint}
                          primary={s.weight === 1.0}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Section>

        {/* 04 · DESCRIPTION */}
        <Section>
          <NumberedEyebrow index={sectionNo()} label="Description" />
          {drill.description?.trim() ? (
            <Text
              style={[
                fontStyle("regular"),
                {
                  fontSize: 14,
                  lineHeight: 20,
                  color: colors.text.primary,
                  marginTop: spacing.md,
                },
              ]}
            >
              {drill.description}
            </Text>
          ) : (
            <EmptyText style={{ marginTop: spacing.md }}>
              No description added.
            </EmptyText>
          )}
        </Section>

        {/* BENCHMARK — only rendered when the drill actually is a benchmark.
            Coaching-only drills omit the section entirely (benchmarks are
            configured from Edit), so the screen doesn't imply a benchmark
            exists. */}
        {isBenchmarkDrill ? (
        <Section>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <NumberedEyebrow index={sectionNo()} label="Benchmark" />
            {benchmarkCfg ? (
              <View
                style={{
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 3,
                  borderRadius: radius.pill,
                  backgroundColor: colors.orange.tint,
                  borderWidth: 1,
                  borderColor: colors.orange.tintBorder,
                }}
              >
                <Text
                  style={[
                    fontStyle("bold"),
                    {
                      fontSize: 10,
                      color: colors.orange[500],
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    },
                  ]}
                >
                  {BENCHMARK_SCOPE_LABELS[benchmarkCfg.scope]}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ marginTop: spacing.md }}>
            <BenchmarkConfigView cfg={benchmarkCfg} />
          </View>
        </Section>
        ) : null}

        {/* SETUP */}
        <Section>
          <NumberedEyebrow index={sectionNo()} label="Setup" />
          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            {diagram ? (
              <>
                <DiagramRenderer data={diagram} />
                {setupInstructions.length > 0 && (
                  <View
                    style={{
                      padding: spacing.md,
                      borderRadius: radius.md,
                      backgroundColor: colors.surface.input,
                      borderWidth: 1,
                      borderColor: colors.border.default,
                    }}
                  >
                    <MiniLabel>Setup instructions</MiniLabel>
                    <Text
                      style={[
                        fontStyle("regular"),
                        {
                          fontSize: 13,
                          lineHeight: 18,
                          color: colors.text.secondary,
                        },
                      ]}
                    >
                      {setupInstructions}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <View
                accessibilityLabel="No setup diagram"
                style={{
                  borderWidth: 1.5,
                  borderColor: colors.border.dashed,
                  borderStyle: "dashed",
                  borderRadius: radius.lg,
                  paddingVertical: spacing["2xl"],
                  paddingHorizontal: spacing.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  backgroundColor: colors.surface.input,
                }}
              >
                <Ionicons
                  name="map-outline"
                  size={20}
                  color={colors.text.muted}
                />
                <Text
                  style={[
                    fontStyle("medium"),
                    {
                      fontSize: 13,
                      color: colors.text.secondary,
                      textAlign: "center",
                    },
                  ]}
                >
                  No setup diagram
                </Text>
              </View>
            )}
          </View>
        </Section>

        {/* 07 · COACHING NOTES */}
        <Section>
          <NumberedEyebrow index={sectionNo()} label="Coaching notes" />
          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <MiniLabel>Reps</MiniLabel>
                <ValueBox
                  value={
                    drill.default_reps && drill.default_reps > 0
                      ? `${drill.default_reps}×`
                      : "—"
                  }
                  muted={!drill.default_reps}
                />
              </View>
              <View style={{ flex: 1 }}>
                <MiniLabel>Duration</MiniLabel>
                <ValueBox
                  value={
                    drill.default_duration_min &&
                    drill.default_duration_min > 0
                      ? `${drill.default_duration_min} min`
                      : "—"
                  }
                  muted={!drill.default_duration_min}
                />
              </View>
            </View>

            <View>
              <MiniLabel>Equipment</MiniLabel>
              <ValueBox
                value={equipmentLabel || "—"}
                muted={!equipmentLabel}
              />
            </View>

            <View>
              <MiniLabel>Video reference</MiniLabel>
              {drill.source_url ? (
                <TouchableOpacity
                  onPress={openSourceUrl}
                  activeOpacity={0.85}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                    backgroundColor: colors.surface.input,
                    borderWidth: 1,
                    borderColor: colors.border.default,
                    borderRadius: radius.input,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm + 1,
                  }}
                >
                  <Ionicons
                    name="play"
                    size={12}
                    color={colors.orange[500]}
                  />
                  <Text
                    style={[
                      fontStyle("regular"),
                      {
                        flex: 1,
                        fontSize: 13,
                        color: colors.orange[400],
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {drill.source_url}
                  </Text>
                  <Ionicons
                    name="open-outline"
                    size={14}
                    color={colors.orange[400]}
                  />
                </TouchableOpacity>
              ) : (
                <ValueBox value="—" muted />
              )}
            </View>
          </View>
        </Section>

        {/* Lifecycle actions — inline links at the bottom of the page, not
            sticky. Full-access only. Mirrors the drill cards: preset clones
            are removed; custom drills archive → (unarchive | delete). */}
        {canManage && (
        <View
          style={{
            alignItems: "center",
            paddingVertical: spacing.md,
            gap: spacing.lg,
            flexDirection: "row",
            justifyContent: "center",
          }}
        >
          {isPreset ? (
            <ManageLink
              label="Remove Drill"
              danger
              onPress={() => {
                setDeleteError(null);
                setConfirmDeleteOpen(true);
              }}
            />
          ) : isArchived ? (
            <>
              <ManageLink label="Unarchive" onPress={handleUnarchive} />
              <ManageLink
                label="Delete Drill"
                danger
                onPress={() => {
                  setDeleteError(null);
                  setTypeDeleteOpen(true);
                }}
              />
            </>
          ) : (
            <ManageLink
              label="Archive Drill"
              danger
              onPress={() => {
                setDeleteError(null);
                setConfirmArchiveOpen(true);
              }}
            />
          )}
        </View>
        )}
      </ScrollView>

      {/* Sticky footer — only the Run benchmark CTA stays anchored.
          Full-access only (logging a benchmark is a write). */}
      {canManage && showRunBenchmark && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            // Clear the tab bar (60 + bottom inset).
            paddingBottom: insets.bottom + 60 + spacing.md,
            backgroundColor: colors.surface.base,
            borderTopWidth: 1,
            borderTopColor: colors.border.subtle,
            gap: spacing.sm,
          }}
        >
          <Button label="Run benchmark" onPress={runBenchmark} />
        </View>
      )}

      {/* Preset "Remove from library" confirmation. */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={handleHardDelete}
        title="Remove drill?"
        body={
          drill?.drill_name
            ? `"${drill.drill_name}" will be removed from your team library. The preset stays available to add again.`
            : "This drill will be removed from your team library. The preset stays available to add again."
        }
        confirmLabel="Remove"
        pendingLabel="Removing…"
        pending={deleting}
        error={deleteError}
      />

      {/* Custom-drill archive confirmation (data is kept). */}
      <ConfirmDialog
        open={confirmArchiveOpen}
        onCancel={() => setConfirmArchiveOpen(false)}
        onConfirm={handleArchive}
        title="Archive drill?"
        body="It moves to your Archived list — all data is kept, and you can unarchive it later."
        confirmLabel="Archive"
        pendingLabel="Archiving…"
        pending={archiving}
        error={deleteError}
      />

      {/* Permanent delete of an archived custom drill — type the name to
          confirm, same gate as the library archive + practice delete. */}
      <DeleteConfirmModal
        open={typeDeleteOpen}
        onClose={() => setTypeDeleteOpen(false)}
        name={drill?.drill_name ?? null}
        noun="drill"
        busy={deleting}
        error={deleteError}
        onConfirm={handleHardDelete}
      />
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

// Inline text link for the bottom-of-page lifecycle actions (archive /
// unarchive / remove / delete).
function ManageLink({
  label,
  danger,
  onPress,
}: {
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={10}
      activeOpacity={0.6}
    >
      <Text
        style={[
          fontStyle("medium"),
          { fontSize: 17, color: danger ? colors.error : colors.text.primary },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function PinToDashboardRow({
  pinned,
  count,
  cap,
  busy,
  notice,
  onToggle,
}: {
  pinned: boolean;
  count: number;
  cap: number;
  busy: boolean;
  notice: string | null;
  onToggle: () => void;
}) {
  const atCap = count >= cap && !pinned;
  const disabled = busy || atCap;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: pinned
          ? colors.lime.tint
          : colors.surface.raised,
        borderWidth: 1,
        borderColor: pinned
          ? "rgba(194,255,61,0.30)"
          : colors.border.card,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pinned ? colors.lime[400] : colors.orange.tint,
        }}
      >
        <Ionicons
          name={pinned ? "checkmark" : "pin-outline"}
          size={16}
          color={pinned ? colors.surface.base : colors.orange[500]}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 13,
              color: pinned ? colors.lime[400] : colors.text.primary,
            },
          ]}
        >
          {pinned ? "Pinned to dashboard" : "Pin to dashboard"}
        </Text>
        <Text
          style={[
            fontStyle("regular"),
            {
              fontSize: 11,
              color: colors.text.muted,
            },
          ]}
        >
          {notice
            ? notice
            : `${count} of ${cap} drills pinned. Pinned drills appear in Team Pulse.`}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onToggle}
        disabled={disabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={pinned ? "Unpin from dashboard" : "Pin to dashboard"}
        style={{
          paddingHorizontal: spacing.md,
          paddingVertical: 8,
          borderRadius: radius.pill,
          backgroundColor: pinned
            ? "rgba(255,255,255,0.06)"
            : disabled
              ? "rgba(255,106,26,0.06)"
              : colors.orange[500],
          opacity: disabled ? 0.7 : 1,
        }}
      >
        <Text
          style={[
            fontStyle("semibold"),
            {
              fontSize: 12,
              color: pinned
                ? colors.text.primary
                : disabled
                  ? colors.orange[500]
                  : colors.surface.base,
            },
          ]}
        >
          {busy ? "…" : pinned ? "Unpin" : atCap ? "Full" : "Pin"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function MiniLabel({ children }: { children: string }) {
  return (
    <Text
      style={[
        fontStyle("medium"),
        {
          fontSize: 10,
          color: colors.text.muted,
          textTransform: "uppercase",
          letterSpacing: 1.4,
          marginBottom: spacing.xs + 2,
        },
      ]}
    >
      {children}
    </Text>
  );
}

function EmptyText({
  children,
  style,
}: {
  children: string;
  style?: { marginTop?: number };
}) {
  return (
    <Text
      style={[
        fontStyle("regular"),
        {
          fontSize: 13,
          color: colors.text.muted,
          fontStyle: "italic",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}


// Read-only skill chip. Primary (weight 1.0) gets a filled tint + star;
// secondary (0.5) gets an outline + hollow star. Mirrors the SkillPicker.
function SkillTagChip({
  label,
  color,
  tint,
  primary,
}: {
  label: string;
  color: string;
  tint: string;
  primary: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        backgroundColor: primary ? tint : "transparent",
        borderColor: color,
      }}
    >
      <Ionicons
        name={primary ? "star" : "star-outline"}
        size={12}
        color={color}
      />
      <Text
        style={[
          fontStyle(primary ? "bold" : "medium"),
          { fontSize: 12.5, color, letterSpacing: 0.1 },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function BenchmarkConfigView({ cfg }: { cfg: BenchmarkConfig | null }) {
  if (!cfg || !isBenchmarkConfigured(cfg)) {
    return <EmptyText>Not a benchmark drill.</EmptyText>;
  }
  if (cfg.scope === "both") {
    return (
      <View style={{ gap: spacing.md }}>
        {cfg.nonqb ? (
          <BenchmarkGroupView
            title="Non-QBs · receivers"
            group={cfg.nonqb}
            accent={colors.orange[500]}
          />
        ) : null}
        {cfg.qb ? (
          <BenchmarkGroupView
            title="QBs"
            group={cfg.qb}
            accent={colors.blue[400]}
          />
        ) : null}
      </View>
    );
  }
  const group =
    cfg.scope === "whole"
      ? cfg.whole
      : cfg.scope === "qb"
        ? cfg.qb
        : cfg.nonqb;
  if (!group || group.types.length === 0) {
    return <EmptyText>Not a benchmark drill.</EmptyText>;
  }
  return <BenchmarkGroupView group={group} accent={colors.orange[500]} />;
}

function BenchmarkGroupView({
  title,
  group,
  accent,
}: {
  title?: string;
  group: GroupConfig;
  accent: string;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border.subtle,
        backgroundColor: "transparent",
        borderRadius: radius.lg,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      {title ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            marginBottom: spacing.xs,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: accent,
            }}
          />
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 11,
                color: accent,
                letterSpacing: 1.2,
                textTransform: "uppercase",
              },
            ]}
          >
            {title}
          </Text>
        </View>
      ) : null}
      {group.types.map((t) => {
        const meta = BENCHMARK_TYPE_META[t as BenchmarkType];
        if (!meta) return null;
        const cfg = group.perType[t as BenchmarkType] ?? {};
        const parts: string[] = [];
        if (cfg.attemptsPerSet)
          parts.push(`${cfg.attemptsPerSet} attempts / set`);
        if (cfg.label) parts.push(cfg.label);
        if (meta.hasInverseToggle)
          parts.push(cfg.inverse ? "Lower = better" : "Higher = better");
        else parts.push(meta.sub);
        return (
          <View
            key={t}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              backgroundColor: colors.surface.input,
              borderWidth: 1,
              borderColor: colors.border.default,
              borderRadius: radius.md,
              padding: spacing.md,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: radius.sm,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border.subtle,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={meta.icon} size={14} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  fontStyle("bold"),
                  { fontSize: 13.5, color: colors.text.primary },
                ]}
              >
                {meta.label}
              </Text>
              <Text
                style={[
                  fontStyle("medium"),
                  { fontSize: 11, color: colors.text.muted },
                ]}
              >
                {parts.join(" · ")}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ValueBox({ value, muted }: { value: string; muted?: boolean }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface.input,
        borderWidth: 1,
        borderColor: colors.border.default,
        borderRadius: radius.input,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 1,
      }}
    >
      <Text
        style={[
          monoStyle("medium"),
          {
            fontSize: 13,
            color: muted ? colors.text.muted : colors.text.primary,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function CenteredMessage({
  title,
  body,
  onBack,
  topInset,
}: {
  title: string;
  body: string;
  onBack: () => void;
  topInset: number;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface.base,
        paddingTop: topInset + spacing.md,
        paddingHorizontal: spacing.xl,
      }}
    >
      <TouchableOpacity
        onPress={onBack}
        activeOpacity={0.85}
        accessibilityLabel="Back"
        hitSlop={8}
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.lg,
          backgroundColor: colors.surface.raised,
          borderWidth: 1,
          borderColor: colors.border.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="chevron-back" size={18} color={colors.text.primary} />
      </TouchableOpacity>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.sm,
        }}
      >
        <Text
          style={[
            fontStyle("medium"),
            { fontSize: 14, color: colors.errorLight, textAlign: "center" },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            fontStyle("regular"),
            {
              fontSize: 12,
              color: colors.text.secondary,
              textAlign: "center",
            },
          ]}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}
