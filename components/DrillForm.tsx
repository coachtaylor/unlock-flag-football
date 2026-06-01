import { useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "./ui/Button";
import { ActionModal, useActionModal } from "./ui/ActionModal";
import { TextArea } from "./ui/TextArea";
import {
  CATEGORY_COLORS,
  type CategoryType,
  inferCategoryType,
  normalizeCategory,
  tintForCategory,
} from "../constants/categories";
import { Section } from "./ui/FormSection";
import { SkillPicker } from "./SkillPicker";
import { allowedSkillGroupsForPhases } from "../constants/skill-groups";
import type {
  DrillSkillLink,
  DrillSkillWeight,
  Skill,
  SkillGroup,
} from "../lib/skills";
import DiagramEditor, {
  type DiagramEditorHandle,
  type DiagramSelectionInfo,
} from "./DiagramEditor";
import DiagramRenderer from "./DiagramRenderer";
import { colors, fontWeight, radius, spacing } from "../constants/design";
import { fontStyle, monoStyle } from "../constants/typography";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";
import { generateSetupInstructions } from "../lib/generate-setup-instructions";
import type { DiagramData } from "../types/diagram";
import {
  BENCHMARK_SCOPE_OPTIONS,
  BENCHMARK_TYPE_META,
  BENCHMARK_TYPE_ORDER,
  benchmarkConfigFromLegacy,
  buildBenchmarkConfig,
  defaultPerType,
  emptyGroup,
  flattenBenchmarkTypes,
  hasPerTypeKnobs,
  isBenchmarkConfigured,
  toggleTypeInGroup,
  updatePerType,
  type BenchmarkConfig,
  type BenchmarkScope,
  type BenchmarkType,
  type GroupConfig,
  type PerTypeConfig,
} from "../constants/benchmarks";

type Category = { id: string; name: string; type?: CategoryType | null };

export type { BenchmarkType };

export type DrillFormInitial = {
  id: string;
  drillName: string;
  categoryIds: string[];
  skills: DrillSkillLink[];
  description: string;
  sourceUrl: string;
  benchmarkConfig: BenchmarkConfig | null;
  status: "draft" | "published";
  equipment: string;
  setupDiagram: DiagramData | null;
  setupInstructions: string | null;
  defaultReps: number | null;
  defaultDurationMin: number | null;
};

type Props = {
  teamId: string;
  categories: Category[];
  // Global skill catalog for the skill-tag picker. Empty array hides the
  // section gracefully (e.g. if the taxonomy migration hasn't landed).
  skills: Skill[];
  initial?: DrillFormInitial;
  topInset: number;
  bottomInset: number;
};

function typeOf(c: Category): CategoryType {
  return c.type ?? inferCategoryType(c.name);
}

function joinEquipment(otherList: string[], cones: number | null | undefined) {
  const parts: string[] = [];
  if (cones && cones > 0) parts.push(`${cones} cone${cones === 1 ? "" : "s"}`);
  parts.push(...otherList);
  return parts.join(", ");
}

export function parseEquipmentString(input: string): {
  cones: number | null;
  other: string[];
} {
  const parts = input
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  let cones: number | null = null;
  const other: string[] = [];
  for (const p of parts) {
    const m = p.match(/^(\d+)\s+cones?$/i);
    if (m && cones == null) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > 0) {
        cones = n;
        continue;
      }
    }
    other.push(p);
  }
  return { cones, other };
}

export function formatEquipment(
  cones: number | null | undefined,
  other: string[] | null | undefined
): string {
  return joinEquipment(other ?? [], cones ?? null);
}

export function getMonogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "DR";
  const words = trimmed.split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  // Single word: take first two alphanumerics.
  const chars = (trimmed.toUpperCase().match(/[A-Z0-9]/g) ?? []).join("");
  return (chars + "DR").slice(0, 2);
}

export function DrillForm({
  teamId,
  categories,
  skills,
  initial,
  topInset,
  bottomInset,
}: Props) {
  const router = useRouter();
  // When the form is opened from the practice planner's "Add Drills" picker,
  // /drills/new is pushed with ?returnTo=<encoded practice form path>. On a
  // successful create we navigate straight back to that path (cross-tab safe,
  // since the practice form lives in the practice tab and /drills/new lives
  // in the drills tab — router.back() alone would land on /drills).
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const decodedReturnTo =
    typeof returnTo === "string" && returnTo.length > 0
      ? decodeURIComponent(returnTo)
      : null;
  const { user } = useAuth();
  const isEditing = !!initial;

  // App-styled validation/error modal (replaces native Alert.alert).
  const { showError, modalProps } = useActionModal();

  const [drillName, setDrillName] = useState(initial?.drillName ?? "");
  // "02 Phase" now holds only phase categories — the old Skill/Sub-skill
  // category axis was retired in favor of the skill taxonomy (section 03).
  // Strip any legacy skill/sub-skill links off an edited drill on load; they
  // get dropped on the next save (Phase tags are kept).
  const [categoryIds, setCategoryIds] = useState<string[]>(() => {
    const phaseIds = new Set(
      categories.filter((c) => typeOf(c) === "phase").map((c) => c.id)
    );
    return (initial?.categoryIds ?? []).filter((id) => phaseIds.has(id));
  });

  // Skill tags: skillId → weight (1.0 primary / 0.5 secondary). Absence = off.
  const [skillWeights, setSkillWeights] = useState<
    Map<string, DrillSkillWeight>
  >(() => {
    const m = new Map<string, DrillSkillWeight>();
    for (const s of initial?.skills ?? []) m.set(s.skill_id, s.weight);
    return m;
  });

  // skillId → skill_group, for pruning out-of-scope skills on phase change.
  const skillGroupById = useMemo(() => {
    const m = new Map<string, SkillGroup>();
    for (const s of skills) m.set(s.id, s.skill_group);
    return m;
  }, [skills]);

  // Which skill groups the picker offers, derived from the chosen phases.
  const allowedGroupsFor = (ids: string[]): SkillGroup[] =>
    allowedSkillGroupsForPhases(
      ids.map((id) => {
        const cat = categories.find((c) => c.id === id);
        return cat ? normalizeCategory(cat.name) : null;
      })
    );
  const allowedGroups = allowedGroupsFor(categoryIds);

  const toggleCategory = (id: string) => {
    const next = categoryIds.includes(id)
      ? categoryIds.filter((x) => x !== id)
      : [...categoryIds, id];
    setCategoryIds(next);
    // Prune tagged skills whose group the new phase no longer offers, so a
    // drill can't keep e.g. Defense skills after switching to Offense-only.
    const allowed = new Set(allowedGroupsFor(next));
    setSkillWeights((sw) => {
      let changed = false;
      const m = new Map(sw);
      for (const sid of Array.from(m.keys())) {
        const g = skillGroupById.get(sid);
        if (!g || !allowed.has(g)) {
          m.delete(sid);
          changed = true;
        }
      }
      return changed ? m : sw;
    });
  };
  const [description, setDescription] = useState(initial?.description ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");

  // Benchmark state: Q1 (yes/no) + Q2 (scope) + Q3 (per-group type sets +
  // per-type knobs). All three group states live in parallel so flipping the
  // scope picker is non-destructive — if a coach switches whole → both →
  // whole, their original config is still there.
  const initialCfg = initial?.benchmarkConfig ?? null;
  const [isBenchmark, setIsBenchmark] = useState<boolean>(
    isBenchmarkConfigured(initialCfg)
  );
  const [benchmarkScope, setBenchmarkScope] = useState<BenchmarkScope>(
    initialCfg?.scope ?? "whole"
  );
  const [wholeGroup, setWholeGroup] = useState<GroupConfig>(
    initialCfg?.whole ?? emptyGroup()
  );
  const [qbGroup, setQbGroup] = useState<GroupConfig>(
    initialCfg?.qb ?? emptyGroup()
  );
  const [nonqbGroup, setNonqbGroup] = useState<GroupConfig>(
    initialCfg?.nonqb ?? emptyGroup()
  );
  const [matchConfigs, setMatchConfigs] = useState<boolean>(
    initialCfg?.matchConfigs ?? false
  );

  // When "Match QB & Non-QB" is on, every Non-QB edit mirrors into QB.
  const applyNonQb = (next: GroupConfig) => {
    setNonqbGroup(next);
    if (benchmarkScope === "both" && matchConfigs) setQbGroup(next);
  };

  const toggleMatchConfigs = () => {
    setMatchConfigs((prev) => {
      const next = !prev;
      if (next) setQbGroup(nonqbGroup);
      return next;
    });
  };
  const [equipment, setEquipment] = useState(initial?.equipment ?? "");
  // 0 doubles as "not set" / null in storage. Steppers can't go below 0.
  const [defaultReps, setDefaultReps] = useState(initial?.defaultReps ?? 0);
  const [defaultDurationMin, setDefaultDurationMin] = useState(
    initial?.defaultDurationMin ?? 0
  );
  const [diagramData, setDiagramData] = useState<DiagramData | null>(
    initial?.setupDiagram ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);

  // Diagram editor lives inside a modal. `draftDiagram` is the in-modal
  // working copy; we only commit it back to `diagramData` on Save.
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftDiagram, setDraftDiagram] = useState<DiagramData | null>(null);
  // Measured size of the modal body (between header and footer). Used to
  // cap the field height so the editor fits without scroll on every iPhone.
  const [editorAreaSize, setEditorAreaSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  // ScrollView is the safety net — only scrollable when the user isn't
  // mid-drag on a cone (otherwise it races the editor's PanResponder).
  const [modalScrollEnabled, setModalScrollEnabled] = useState(true);
  // Tracks what (if anything) is currently selected/being-edited inside
  // the diagram editor so we can morph the sticky bottom button into a
  // contextual "Save cone / Save QB / Save route" action.
  const [editorSelection, setEditorSelection] =
    useState<DiagramSelectionInfo>(null);
  const editorRef = useRef<DiagramEditorHandle>(null);
  const modalInsets = useSafeAreaInsets();

  // The field SVG aspect (width/height in VIEW units). Recompute if
  // FIELD_YARDS_* ever change. VIEW_W = 218 (200 + 14 + 4), VIEW_H = 258
  // (250 + 4 + 4) with the current 20×25 field.
  const FIELD_VIEW_ASPECT = 218 / 258;
  // Reserve room for everything DiagramEditor renders below the field
  // (tool palette, mode buttons, helper rows, cone-color picker, spacings).
  // Empirically the editor's non-field section runs ~280pt; bump on overflow.
  const EDITOR_CHROME_HEIGHT = 280;
  const computedMaxFieldHeight = editorAreaSize
    ? Math.min(
        editorAreaSize.width / FIELD_VIEW_ASPECT,
        Math.max(220, editorAreaSize.height - EDITOR_CHROME_HEIGHT)
      )
    : undefined;

  const hasDiagramCones = !!diagramData && diagramData.cones.length > 0;

  const openDiagramEditor = () => {
    setDraftDiagram(diagramData);
    setEditorSelection(null);
    setEditorOpen(true);
  };
  const cancelDiagramEditor = () => {
    setEditorOpen(false);
    setDraftDiagram(null);
    setEditorSelection(null);
  };
  const saveDiagramEditor = () => {
    setDiagramData(
      draftDiagram && draftDiagram.cones.length > 0 ? draftDiagram : null
    );
    setEditorOpen(false);
    setDraftDiagram(null);
    setEditorSelection(null);
  };

  const isCurrentlyPublished = initial?.status === "published";

  // Only phase categories are managed here now — the Skill/Sub-skill category
  // axis was retired in favor of the skill taxonomy (section 03).
  const phaseCategories = categories.filter((c) => typeOf(c) === "phase");

  // Build the benchmark config once for both completion + submit reads.
  const benchmarkConfig: BenchmarkConfig | null = isBenchmark
    ? buildBenchmarkConfig({
        scope: benchmarkScope,
        whole: wholeGroup,
        qb: qbGroup,
        nonqb: nonqbGroup,
        matchConfigs,
      })
    : null;
  const benchmarkComplete =
    !isBenchmark || isBenchmarkConfigured(benchmarkConfig);

  // Completion mirrors the 7 numbered sections: identity, tags, skill tags,
  // description, benchmark, setup, coaching notes (any of
  // reps/duration/equipment/video). When the skill catalog is empty the
  // skill-tags section is hidden, so it doesn't count toward completion.
  const completionSteps = [
    !!drillName.trim(),
    categoryIds.length > 0,
    ...(skills.length > 0 ? [skillWeights.size > 0] : []),
    !!description.trim(),
    benchmarkComplete,
    hasDiagramCones,
    defaultReps > 0 ||
      defaultDurationMin > 0 ||
      !!equipment.trim() ||
      !!sourceUrl.trim(),
  ];
  const completionDone = completionSteps.filter(Boolean).length;
  const completionTotal = completionSteps.length;

  const monogram = getMonogram(drillName);

  const persist = async (
    targetStatus: "draft" | "published"
  ): Promise<string | null> => {
    setError(null);

    const missing: string[] = [];
    if (!drillName.trim()) missing.push("Drill name");
    // Phase is required to save at all (not just to publish) — every drill
    // needs a practice phase so it groups in the library + planner.
    if (categoryIds.length === 0) missing.push("Phase");

    if (missing.length > 0) {
      const verb = targetStatus === "published" ? "publish" : "save";
      showError(
        targetStatus === "published"
          ? "Can't publish drill"
          : "Can't save drill",
        `Please add the following before you ${verb}:\n\n• ${missing.join("\n• ")}`
      );
      return null;
    }

    if (!user) {
      showError("Not logged in", "You must be logged in to save a drill.");
      return null;
    }

    const eq = parseEquipmentString(equipment);
    const equipmentJson =
      eq.cones != null || eq.other.length > 0
        ? { cones: eq.cones ?? 0, other: eq.other }
        : null;

    const setupDiagramPayload = hasDiagramCones ? diagramData : null;
    const diagramUnchanged =
      !!initial && diagramData === initial.setupDiagram;
    const setupInstructions = setupDiagramPayload
      ? diagramUnchanged && initial?.setupInstructions
        ? initial.setupInstructions
        : generateSetupInstructions(setupDiagramPayload).trim() || null
      : null;

    // Flat columns + jsonb for clean dashboard queries; legacy benchmark_type
    // gets the first selected type as a write-through so old read paths keep
    // working.
    const flatTypes = benchmarkConfig
      ? flattenBenchmarkTypes(benchmarkConfig)
      : [];
    const LEGACY_TYPE_FALLBACK: Record<BenchmarkType, string> = {
      timed: "timed",
      rated: "rated",
      reps: "reps_complete",
      pct: "percentage",
      flags: "reps_complete",
      drops: "reps_complete",
    };
    const legacyBenchmarkType =
      isBenchmark && flatTypes[0]
        ? LEGACY_TYPE_FALLBACK[flatTypes[0]]
        : null;

    const payload = {
      drill_name: drillName.trim(),
      description: description.trim() || null,
      source_url: sourceUrl.trim() || null,
      benchmark_scope: isBenchmark ? benchmarkScope : null,
      benchmark_types: flatTypes,
      benchmark_config: benchmarkConfig,
      benchmark_type: legacyBenchmarkType,
      status: targetStatus,
      category_id: null,
      equipment: equipmentJson,
      setup_diagram: setupDiagramPayload,
      setup_instructions: setupInstructions,
      default_reps: defaultReps > 0 ? defaultReps : null,
      default_duration_min:
        defaultDurationMin > 0 ? defaultDurationMin : null,
    };

    // Strip new columns one at a time if migration 38 hasn't landed on this
    // deploy. Once it ships everywhere this loop becomes dormant.
    const NEW_BENCHMARK_COLUMNS = [
      "benchmark_config",
      "benchmark_scope",
      "benchmark_types",
    ] as const;
    type PayloadLike = Record<string, unknown>;

    const writePayload = async (p: PayloadLike) => {
      if (isEditing && initial) {
        return supabase.from("team_drills").update(p).eq("id", initial.id);
      }
      return supabase
        .from("team_drills")
        .insert({
          ...p,
          team_id: teamId,
          created_by: user.id,
        })
        .select("id")
        .single();
    };

    const tryWriteWithDrift = async (
      basePayload: PayloadLike
    ): Promise<{
      data: { id?: string } | null;
      error: { message: string } | null;
    }> => {
      let p: PayloadLike = { ...basePayload };
      // Up to N retries — one per unknown column.
      for (let i = 0; i <= NEW_BENCHMARK_COLUMNS.length; i++) {
        const res = await writePayload(p);
        if (!res.error) {
          return {
            data: (res.data as { id?: string } | null) ?? null,
            error: null,
          };
        }
        const msg = res.error.message ?? "";
        const dropped = NEW_BENCHMARK_COLUMNS.find(
          (c) => p[c] !== undefined && new RegExp(c, "i").test(msg)
        );
        if (!dropped) {
          return { data: null, error: res.error };
        }
        const next: PayloadLike = { ...p };
        delete next[dropped];
        p = next;
      }
      return {
        data: null,
        error: { message: "Could not write drill after schema-drift retries." },
      };
    };

    let drillId: string;
    if (isEditing && initial) {
      const res = await tryWriteWithDrift(payload);
      if (res.error) {
        showError("Couldn't save drill", res.error.message);
        return null;
      }
      drillId = initial.id;
    } else {
      const res = await tryWriteWithDrift(payload);
      if (res.error || !res.data?.id) {
        showError(
          "Couldn't save drill",
          res.error?.message ?? "Could not create drill."
        );
        return null;
      }
      drillId = res.data.id;
    }

    const { error: deleteCatErr } = await supabase
      .from("team_drill_categories")
      .delete()
      .eq("drill_id", drillId);
    if (deleteCatErr) {
      showError("Couldn't save categories", deleteCatErr.message);
      return null;
    }
    if (categoryIds.length > 0) {
      const { error: insertCatErr } = await supabase
        .from("team_drill_categories")
        .insert(
          categoryIds.map((cid) => ({ drill_id: drillId, category_id: cid }))
        );
      if (insertCatErr) {
        showError("Couldn't save categories", insertCatErr.message);
        return null;
      }
    }

    // Skill tags — same delete-then-insert pattern against drill_skills. Only
    // attempted when the catalog loaded (skills.length > 0); a missing
    // taxonomy table on an older deploy would otherwise block the save.
    if (skills.length > 0) {
      const { error: deleteSkillErr } = await supabase
        .from("drill_skills")
        .delete()
        .eq("drill_id", drillId);
      if (deleteSkillErr) {
        showError("Couldn't save skill tags", deleteSkillErr.message);
        return null;
      }
      // Persist only skills whose group the chosen phase actually offers, so
      // an out-of-scope tag can never be saved (the guided-flow invariant).
      const allowed = new Set(allowedGroups);
      const skillRows = Array.from(skillWeights.entries())
        .filter(([skill_id]) => {
          const g = skillGroupById.get(skill_id);
          return g ? allowed.has(g) : false;
        })
        .map(([skill_id, weight]) => ({ drill_id: drillId, skill_id, weight }));
      if (skillRows.length > 0) {
        const { error: insertSkillErr } = await supabase
          .from("drill_skills")
          .insert(skillRows);
        if (insertSkillErr) {
          showError("Couldn't save skill tags", insertSkillErr.message);
          return null;
        }
      }
    }

    return drillId;
  };

  const save = async (target: "draft" | "published") => {
    setSubmitting(true);
    const id = await persist(target);
    if (!id) {
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    if (decodedReturnTo && decodedReturnTo.startsWith("/")) {
      // Practice-planner flow: cross-tab navigate (not back) so the user
      // lands on the practice form, not on the drill library.
      router.navigate(decodedReturnTo as never);
    } else if (isEditing) {
      router.back();
    } else {
      // Standalone library "+" flow: return to the drill library instead
      // of forwarding to the new drill's detail page.
      router.back();
    }
  };

  const publishLabel = isEditing
    ? isCurrentlyPublished
      ? "Save changes"
      : "Publish drill"
    : "Publish drill";

  const eyebrow = isEditing
    ? isCurrentlyPublished
      ? "EDIT DRILL · LIVE"
      : "EDIT DRILL · DRAFT"
    : "NEW DRILL · DRAFT";

  const title = isEditing ? "Edit a drill." : "Build a drill.";

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
          <TouchableOpacity
            onPress={() => router.back()}
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

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
            }}
          >
            <Text
              style={[
                monoStyle("medium"),
                { fontSize: 11, color: colors.text.secondary },
              ]}
            >
              {completionDone}/{completionTotal}
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
                fontStyle("medium"),
                {
                  fontSize: 11,
                  color: colors.text.muted,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                },
              ]}
            >
              Draft
            </Text>
          </View>
        </View>

        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 11,
              color: colors.orange[500],
              letterSpacing: 1.5,
              marginBottom: spacing.xs,
            },
          ]}
        >
          {eyebrow}
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: spacing.lg,
          }}
        >
          <Text
            style={[
              fontStyle("bold"),
              {
                flex: 1,
                fontSize: 26,
                lineHeight: 30,
                color: colors.text.primary,
                letterSpacing: -0.6,
              },
            ]}
          >
            {title}
          </Text>
          <CompletionRing total={completionTotal} done={completionDone} />
        </View>

        <Text
          style={[
            fontStyle("regular"),
            {
              fontSize: 13,
              lineHeight: 18,
              color: colors.text.secondary,
              marginTop: spacing.xs,
            },
          ]}
        >
          Tag it, set its benchmark, sketch the setup.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: footerHeight + spacing["2xl"],
          gap: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 01 · IDENTITY */}
        <Section>
          <NumberedEyebrow index="01" label="Identity" />
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: spacing.md,
              marginTop: spacing.md,
            }}
          >
            <MonogramTile text={monogram} />
            <View style={{ flex: 1, gap: 2 }}>
              <TextInput
                value={drillName}
                onChangeText={setDrillName}
                placeholder="Drill name"
                placeholderTextColor={colors.text.muted}
                maxLength={28}
                autoCapitalize="words"
                returnKeyType="next"
                style={[
                  fontStyle("bold"),
                  {
                    color: colors.text.primary,
                    fontSize: 18,
                    padding: 0,
                    letterSpacing: -0.2,
                  },
                ]}
              />
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
                Drill name · 28 chars max
              </Text>
            </View>
          </View>
        </Section>

        {/* 02 · PHASE */}
        {phaseCategories.length > 0 ? (
          <Section>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <NumberedEyebrow index="02" label="Phase" />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Text
                  style={[
                    monoStyle("bold"),
                    { fontSize: 11, color: colors.text.primary },
                  ]}
                >
                  {categoryIds.length}
                </Text>
                <Text
                  style={[
                    fontStyle("medium"),
                    { fontSize: 11, color: colors.text.muted },
                  ]}
                >
                  selected
                </Text>
              </View>
            </View>

            {phaseCategories.length > 0 ? (
              <>
                <Text
                  style={[
                    fontStyle("regular"),
                    {
                      fontSize: 11.5,
                      lineHeight: 16,
                      color: colors.text.muted,
                      marginTop: spacing.sm,
                      marginBottom: spacing.sm,
                    },
                  ]}
                >
                  Where this drill runs in practice. Sets which skill groups you
                  can tag below.
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    rowGap: spacing.sm,
                    columnGap: spacing.lg,
                  }}
                >
                  {phaseCategories.map((c) => {
                    const normalized = normalizeCategory(c.name);
                    const phaseColor =
                      (normalized ? CATEGORY_COLORS[normalized] : undefined) ??
                      colors.text.muted;
                    const phaseTint = tintForCategory(c.name);
                    const selected = categoryIds.includes(c.id);
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => toggleCategory(c.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        activeOpacity={0.7}
                        hitSlop={6}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: radius.sm,
                          backgroundColor: selected
                            ? phaseTint
                            : "transparent",
                        }}
                      >
                        {selected ? (
                          <Ionicons
                            name="checkmark"
                            size={14}
                            color={phaseColor}
                          />
                        ) : null}
                        <Text
                          style={[
                            fontStyle(selected ? "semibold" : "medium"),
                            {
                              fontSize: 14,
                              color: selected
                                ? phaseColor
                                : colors.text.primary,
                              letterSpacing: 0.1,
                            },
                          ]}
                        >
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

          </Section>
        ) : null}

        {/* 03 · SKILL TAGS */}
        {skills.length > 0 ? (
          <Section>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <NumberedEyebrow index="03" label="Skill tags" />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Text
                  style={[
                    monoStyle("bold"),
                    { fontSize: 11, color: colors.text.primary },
                  ]}
                >
                  {skillWeights.size}
                </Text>
                <Text
                  style={[
                    fontStyle("medium"),
                    { fontSize: 11, color: colors.text.muted },
                  ]}
                >
                  selected
                </Text>
              </View>
            </View>
            <View style={{ marginTop: spacing.md }}>
              {allowedGroups.length === 0 ? (
                <View
                  style={{
                    borderWidth: 1.5,
                    borderColor: colors.border.default,
                    borderStyle: "dashed",
                    borderRadius: radius.lg,
                    paddingVertical: spacing.lg,
                    paddingHorizontal: spacing.md,
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Ionicons
                    name="pricetags-outline"
                    size={18}
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
                    Pick a phase first
                  </Text>
                  <Text
                    style={[
                      fontStyle("regular"),
                      {
                        fontSize: 11.5,
                        lineHeight: 16,
                        color: colors.text.muted,
                        textAlign: "center",
                      },
                    ]}
                  >
                    The skills you can tag depend on where the drill runs.
                  </Text>
                </View>
              ) : (
                <SkillPicker
                  skills={skills}
                  value={skillWeights}
                  onChange={setSkillWeights}
                  groups={allowedGroups}
                />
              )}
            </View>
          </Section>
        ) : null}

        {/* 04 · DESCRIPTION */}
        <Section>
          <NumberedEyebrow index="04" label="Description" />
          <View style={{ marginTop: spacing.md }}>
            <TextArea
              label="How to run it"
              value={description}
              onChangeText={setDescription}
              placeholder="Cues. Common mistakes. Setup notes."
              style={{ minHeight: 110 }}
            />
          </View>
        </Section>

        {/* 05 · BENCHMARK */}
        <Section>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: spacing.md,
            }}
          >
            <NumberedEyebrow index="05" label="Benchmark" />
            <Text
              style={[
                fontStyle("medium"),
                { fontSize: 11, color: colors.text.muted },
              ]}
            >
              How players are measured
            </Text>
          </View>

          {/* Q1 — is this a benchmark drill? */}
          <Text
            style={[
              fontStyle("medium"),
              {
                fontSize: 13,
                color: colors.text.label,
                marginBottom: spacing.sm,
              },
            ]}
          >
            Is this a benchmark drill?
          </Text>
          <Segmented
            value={isBenchmark ? "yes" : "no"}
            onChange={(v) => setIsBenchmark(v === "yes")}
            options={[
              { value: "no", label: "No", sub: "Coaching only" },
              { value: "yes", label: "Yes", sub: "Capture data" },
            ]}
          />

          {isBenchmark ? (
            <>
              {/* Q2 — who gets benchmarked? */}
              <Text
                style={[
                  fontStyle("medium"),
                  {
                    fontSize: 13,
                    color: colors.text.label,
                    marginTop: spacing.lg,
                    marginBottom: spacing.sm,
                  },
                ]}
              >
                Who gets benchmarked?
              </Text>
              <ScopeGrid
                value={benchmarkScope}
                onChange={setBenchmarkScope}
              />
              <Text
                style={[
                  fontStyle("regular"),
                  {
                    fontSize: 11,
                    lineHeight: 16,
                    color: colors.text.muted,
                    marginTop: spacing.sm,
                  },
                ]}
              >
                "Both" lets you configure QBs and non-QBs differently on the
                same drill.
              </Text>

              {/* Q3 — what gets captured? */}
              {benchmarkScope === "both" ? (
                <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
                  <MatchConfigsRow
                    value={matchConfigs}
                    onToggle={toggleMatchConfigs}
                  />
                  <GroupBlock
                    title="Non-QBs · receivers"
                    accent={colors.orange[500]}
                    group={nonqbGroup}
                    onChange={applyNonQb}
                  />
                  <GroupBlock
                    title="QBs"
                    accent={colors.blue[400]}
                    group={qbGroup}
                    onChange={(g) => {
                      if (matchConfigs) {
                        setNonqbGroup(g);
                        setQbGroup(g);
                      } else {
                        setQbGroup(g);
                      }
                    }}
                    disabled={matchConfigs}
                  />
                </View>
              ) : (
                <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
                  <GroupBlock
                    title="What gets captured?"
                    accent={colors.orange[500]}
                    group={
                      benchmarkScope === "qb"
                        ? qbGroup
                        : benchmarkScope === "nonqb"
                          ? nonqbGroup
                          : wholeGroup
                    }
                    onChange={(g) => {
                      if (benchmarkScope === "qb") setQbGroup(g);
                      else if (benchmarkScope === "nonqb") setNonqbGroup(g);
                      else setWholeGroup(g);
                    }}
                    hideTitle
                  />
                </View>
              )}
            </>
          ) : null}
        </Section>

        {/* 06 · SETUP */}
        <Section>
          <NumberedEyebrow index="06" label="Setup" />
          <View style={{ marginTop: spacing.md }}>
            {hasDiagramCones && diagramData ? (
              <View style={{ position: "relative" }}>
                <DiagramRenderer data={diagramData} />
                <TouchableOpacity
                  onPress={openDiagramEditor}
                  accessibilityLabel="Edit diagram"
                  hitSlop={8}
                  activeOpacity={0.85}
                  style={{
                    position: "absolute",
                    top: spacing.sm,
                    right: spacing.sm,
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: "rgba(20,20,23,0.85)",
                    borderWidth: 1,
                    borderColor: "rgba(244,244,242,0.18)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="pencil"
                    size={16}
                    color={colors.text.primary}
                  />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={openDiagramEditor}
                accessibilityLabel="Add diagram"
                activeOpacity={0.85}
                style={{
                  borderWidth: 1.5,
                  borderColor: colors.border.default,
                  borderStyle: "dashed",
                  borderRadius: radius.lg,
                  paddingVertical: spacing["2xl"],
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  backgroundColor: colors.surface.input,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                  }}
                >
                  <Ionicons
                    name="add"
                    size={18}
                    color={colors.orange[500]}
                  />
                  <Text
                    style={[
                      fontStyle("medium"),
                      {
                        fontSize: 14,
                        color: colors.text.primary,
                        letterSpacing: 0.1,
                      },
                    ]}
                  >
                    Add diagram
                  </Text>
                </View>
                <Text
                  style={[
                    fontStyle("regular"),
                    {
                      fontSize: 12,
                      color: colors.text.muted,
                    },
                  ]}
                >
                  Sketch the cone setup and routes
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Section>

        {/* 07 · COACHING NOTES */}
        <Section>
          <NumberedEyebrow index="07" label="Coaching notes" />
          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <FieldLabeled label="Reps (optional)">
                  <Stepper
                    value={defaultReps}
                    onChange={setDefaultReps}
                    suffix="×"
                  />
                </FieldLabeled>
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabeled label="Duration (optional)">
                  <Stepper
                    value={defaultDurationMin}
                    onChange={setDefaultDurationMin}
                    suffix=" min"
                  />
                </FieldLabeled>
              </View>
            </View>
            <FieldLabeled label="Equipment">
              <TextInput
                value={equipment}
                onChangeText={setEquipment}
                placeholder="e.g., 5 cones, 1 agility ladder"
                placeholderTextColor={colors.text.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={smallInputStyle}
              />
            </FieldLabeled>
            <FieldLabeled label="Video reference">
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                  backgroundColor: colors.surface.input,
                  borderWidth: 1,
                  borderColor: colors.border.default,
                  borderRadius: radius.input,
                  paddingHorizontal: spacing.md,
                }}
              >
                <Ionicons
                  name="play"
                  size={12}
                  color={colors.text.muted}
                />
                <TextInput
                  value={sourceUrl}
                  onChangeText={setSourceUrl}
                  placeholder="paste youtube / tiktok / ig link"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[
                    fontStyle("regular"),
                    {
                      flex: 1,
                      color: colors.text.primary,
                      fontSize: 13,
                      paddingVertical: spacing.sm + 1,
                    },
                  ]}
                />
              </View>
            </FieldLabeled>
          </View>
        </Section>

        {error ? (
          <Text
            style={[
              fontStyle("regular"),
              {
                fontSize: 13,
                lineHeight: 18,
                color: colors.errorLight,
              },
            ]}
          >
            {error}
          </Text>
        ) : null}
      </ScrollView>

      {/* Sticky save buttons */}
      <View
        onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: bottomInset + spacing.lg,
          backgroundColor: colors.surface.base,
          borderTopWidth: 1,
          borderTopColor: colors.border.subtle,
          flexDirection: "row",
          gap: spacing.md,
        }}
      >
        <Button
          label={submitting ? "Saving…" : "Save draft"}
          onPress={() => save("draft")}
          disabled={submitting}
          variant="secondary"
          fullWidth={false}
          style={{ flex: 1 }}
        />
        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={() => save("published")}
          style={{ flex: 2, opacity: submitting ? 0.5 : 1 }}
        >
          <View
            style={{
              minHeight: 52,
              borderRadius: radius.xl,
              backgroundColor: colors.orange[500],
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: spacing.sm,
              paddingHorizontal: spacing.lg,
            }}
          >
            <Text
              style={[
                fontStyle("medium"),
                {
                  color: "#FFFFFF",
                  fontSize: 15,
                  lineHeight: 22,
                  letterSpacing: 0.3,
                },
              ]}
            >
              {submitting ? "Saving…" : publishLabel}
            </Text>
            {!submitting ? (
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            ) : null}
          </View>
        </Pressable>
      </View>

      <Modal
        visible={editorOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={cancelDiagramEditor}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: colors.surface.base }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={{
              paddingTop: modalInsets.top + spacing.md,
              paddingHorizontal: spacing.xl,
              paddingBottom: spacing.md,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottomWidth: 1,
              borderBottomColor: colors.border.subtle,
            }}
          >
            <TouchableOpacity
              onPress={cancelDiagramEditor}
              accessibilityLabel="Cancel"
              hitSlop={10}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  fontStyle("medium"),
                  { fontSize: 15, color: colors.text.secondary },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <Text
              style={[
                fontStyle("bold"),
                { fontSize: 16, color: colors.text.primary },
              ]}
            >
              Setup diagram
            </Text>
            <View style={{ width: 56 }} />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingTop: spacing.sm,
              paddingBottom: 100 + modalInsets.bottom,
            }}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={modalScrollEnabled}
            onLayout={(e) =>
              setEditorAreaSize({
                width: e.nativeEvent.layout.width,
                height: e.nativeEvent.layout.height,
              })
            }
          >
            <DiagramEditor
              ref={editorRef}
              value={draftDiagram}
              onChange={setDraftDiagram}
              maxFieldHeight={computedMaxFieldHeight}
              onDragStateChange={(dragging) =>
                setModalScrollEnabled(!dragging)
              }
              onSelectionChange={setEditorSelection}
            />
          </ScrollView>

          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.md,
              paddingBottom: modalInsets.bottom + spacing.lg,
              backgroundColor: colors.surface.base,
              borderTopWidth: 1,
              borderTopColor: colors.border.subtle,
            }}
          >
            <Button
              label={
                editorSelection
                  ? `Save ${editorSelection.label}`
                  : "Save diagram"
              }
              onPress={
                editorSelection
                  ? () => editorRef.current?.clearSelection()
                  : saveDiagramEditor
              }
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ActionModal {...modalProps} />
    </KeyboardAvoidingView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

export function NumberedEyebrow({
  index,
  label,
}: {
  index: string;
  label: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text
        style={[
          monoStyle("bold"),
          {
            fontSize: 11,
            color: colors.orange[500],
            letterSpacing: 0.4,
          },
        ]}
      >
        {index}
      </Text>
      <View
        style={{ width: 1, height: 10, backgroundColor: colors.border.strong }}
      />
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 11,
            color: colors.text.label,
            letterSpacing: 1.5,
            textTransform: "uppercase",
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}


function CompletionRing({ total, done }: { total: number; done: number }) {
  const size = 44;
  const r = 18;
  const c = 2 * Math.PI * r;
  const pct = total === 0 ? 0 : done / total;
  return (
    <View style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.border.strong}
          strokeWidth={3}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.orange[500]}
          strokeWidth={3}
          fill="none"
          strokeDasharray={`${c}`}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
        />
      </Svg>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={[
            monoStyle("bold"),
            { fontSize: 11, color: colors.text.primary },
          ]}
        >
          {done}/{total}
        </Text>
      </View>
    </View>
  );
}

export function MonogramTile({ text }: { text: string }) {
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: radius.lg,
        backgroundColor: colors.orange.tint,
        borderWidth: 1,
        borderColor: colors.orange.tintBorder,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={[
          monoStyle("bold"),
          { fontSize: 16, color: colors.orange[500] },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

export function PhaseChip({
  label,
  color,
  selected,
  onPress,
}: {
  label: string;
  // Optional: when omitted (or for unknown categories), the chip falls back
  // to a neutral grey outline.
  color?: string;
  selected: boolean;
  onPress: () => void;
}) {
  // Unselected → white text on a muted border (legible by default, no
  // category color visible). Selected → category color text + border +
  // checkmark, still no fill.
  const accent = color ?? colors.text.muted;
  const tone = selected ? accent : colors.text.primary;
  const borderTone = selected ? accent : colors.border.default;
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      activeOpacity={0.85}
      hitSlop={6}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        backgroundColor: "transparent",
        borderColor: borderTone,
      }}
    >
      {selected ? (
        <Ionicons name="checkmark" size={12} color={tone} />
      ) : null}
      <Text
        style={[
          fontStyle("medium"),
          {
            fontSize: 12.5,
            color: tone,
            letterSpacing: 0.1,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}


function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; sub: string }[];
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.surface.input,
        borderWidth: 1,
        borderColor: colors.border.default,
        borderRadius: radius.lg,
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            activeOpacity={0.85}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: radius.md,
              backgroundColor: active ? colors.orange[500] : "transparent",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 13,
                  color: active ? "#0A0A0D" : colors.text.primary,
                },
              ]}
            >
              {opt.label}
            </Text>
            <Text
              style={[
                fontStyle("medium"),
                {
                  fontSize: 10,
                  color: active
                    ? "rgba(10,10,13,0.65)"
                    : colors.text.muted,
                  letterSpacing: 0.3,
                },
              ]}
            >
              {opt.sub}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FieldLabeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={[
          fontStyle("medium"),
          {
            fontSize: 10,
            color: colors.text.muted,
            textTransform: "uppercase",
            letterSpacing: 1.4,
          },
        ]}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

const smallInputStyle = {
  backgroundColor: colors.surface.input,
  borderWidth: 1,
  borderColor: colors.border.default,
  borderRadius: radius.input,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm + 1,
  color: colors.text.primary,
  fontSize: 13,
  fontFamily: undefined,
  fontWeight: fontWeight.normal,
};

function Stepper({
  value,
  onChange,
  suffix = "",
  step = 1,
  max = 99,
}: {
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  step?: number;
  max?: number;
}) {
  const isUnset = value <= 0;
  const isAtMax = value >= max;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: colors.surface.input,
        borderWidth: 1,
        borderColor: colors.border.default,
        borderRadius: radius.input,
        padding: 4,
      }}
    >
      <TouchableOpacity
        onPress={() => onChange(Math.max(0, value - step))}
        accessibilityLabel="Decrement"
        hitSlop={6}
        activeOpacity={0.85}
        disabled={isUnset}
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.sm,
          alignItems: "center",
          justifyContent: "center",
          opacity: isUnset ? 0.4 : 1,
        }}
      >
        <Text
          style={[
            fontStyle("bold"),
            { fontSize: 16, color: colors.text.primary },
          ]}
        >
          −
        </Text>
      </TouchableOpacity>
      <Text
        style={[
          monoStyle("bold"),
          {
            fontSize: 14,
            color: isUnset ? colors.text.muted : colors.text.primary,
          },
        ]}
      >
        {isUnset ? "—" : `${value}${suffix}`}
      </Text>
      <TouchableOpacity
        onPress={() => onChange(Math.min(max, value + step))}
        accessibilityLabel="Increment"
        hitSlop={6}
        activeOpacity={0.85}
        disabled={isAtMax}
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.sm,
          alignItems: "center",
          justifyContent: "center",
          opacity: isAtMax ? 0.4 : 1,
        }}
      >
        <Text
          style={[
            fontStyle("bold"),
            { fontSize: 16, color: colors.text.primary },
          ]}
        >
          +
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Benchmark step 04 sub-components ──────────────────────────────────

function ScopeGrid({
  value,
  onChange,
}: {
  value: BenchmarkScope;
  onChange: (v: BenchmarkScope) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
      }}
    >
      {BENCHMARK_SCOPE_OPTIONS.map((o) => {
        const active = value === o.id;
        return (
          <TouchableOpacity
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            activeOpacity={0.85}
            style={{
              width: "48%",
              paddingVertical: spacing.md - 1,
              paddingHorizontal: spacing.md,
              borderRadius: radius.lg,
              backgroundColor: active
                ? colors.orange[500]
                : colors.surface.input,
              borderWidth: 1,
              borderColor: active ? "transparent" : colors.border.default,
              gap: 2,
            }}
          >
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 13,
                  color: active ? "#0A0A0D" : colors.text.primary,
                },
              ]}
            >
              {o.label}
            </Text>
            <Text
              style={[
                fontStyle("medium"),
                {
                  fontSize: 10.5,
                  color: active
                    ? "rgba(10,10,13,0.65)"
                    : colors.text.muted,
                  letterSpacing: 0.2,
                },
              ]}
            >
              {o.sub}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TypeChip({
  kind,
  selected,
  onPress,
  accent,
}: {
  kind: BenchmarkType;
  selected: boolean;
  onPress: () => void;
  accent: string;
}) {
  const meta = BENCHMARK_TYPE_META[kind];
  const tone = selected ? accent : colors.text.primary;
  const borderTone = selected ? accent : colors.border.default;
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      activeOpacity={0.85}
      hitSlop={6}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        backgroundColor: "transparent",
        borderColor: borderTone,
      }}
    >
      {selected ? (
        <Ionicons name="checkmark" size={12} color={tone} />
      ) : (
        <Ionicons name={meta.icon} size={12} color={tone} />
      )}
      <Text
        style={[
          fontStyle("medium"),
          {
            fontSize: 12.5,
            color: tone,
            letterSpacing: 0.1,
          },
        ]}
      >
        {meta.label}
      </Text>
    </TouchableOpacity>
  );
}

function InverseRow({
  value,
  onToggle,
  label,
  desc,
  accent,
}: {
  value: boolean;
  onToggle: () => void;
  label: string;
  desc: string;
  accent: string;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      activeOpacity={0.85}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.surface.input,
        borderWidth: 1,
        borderColor: colors.border.default,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        gap: spacing.sm,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={[
            fontStyle("bold"),
            { fontSize: 12, color: colors.text.primary },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            fontStyle("regular"),
            { fontSize: 10.5, lineHeight: 14, color: colors.text.muted },
          ]}
        >
          {desc}
        </Text>
      </View>
      <View
        style={{
          width: 38,
          height: 22,
          borderRadius: 999,
          backgroundColor: value ? accent : colors.border.strong,
          padding: 2,
          alignItems: value ? "flex-end" : "flex-start",
        }}
      >
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: "#0A0A0D",
          }}
        />
      </View>
    </TouchableOpacity>
  );
}

function MatchConfigsRow({
  value,
  onToggle,
}: {
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <InverseRow
      value={value}
      onToggle={onToggle}
      label="Match QB & non-QB configs"
      desc={
        value
          ? "On — both groups capture the same metrics"
          : "Off — each group has its own setup"
      }
      accent={colors.orange[500]}
    />
  );
}

function GroupBlock({
  title,
  accent,
  group,
  onChange,
  hideTitle = false,
  disabled = false,
}: {
  title: string;
  accent: string;
  group: GroupConfig;
  onChange: (g: GroupConfig) => void;
  hideTitle?: boolean;
  disabled?: boolean;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border.subtle,
        backgroundColor: "transparent",
        borderRadius: radius.lg,
        padding: spacing.md,
        gap: spacing.md,
        opacity: disabled ? 0.55 : 1,
      }}
      pointerEvents={disabled ? "none" : "auto"}
    >
      {!hideTitle ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
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
      ) : (
        <Text
          style={[
            fontStyle("medium"),
            {
              fontSize: 11,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: colors.text.muted,
            },
          ]}
        >
          What gets captured?
        </Text>
      )}

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: spacing.sm,
        }}
      >
        {BENCHMARK_TYPE_ORDER.map((t) => (
          <TypeChip
            key={t}
            kind={t}
            selected={group.types.includes(t)}
            onPress={() => onChange(toggleTypeInGroup(group, t))}
            accent={accent}
          />
        ))}
      </View>

      {group.types.length === 0 ? (
        <Text
          style={[
            fontStyle("regular"),
            {
              fontSize: 12,
              lineHeight: 16,
              color: colors.text.muted,
            },
          ]}
        >
          Pick at least one metric to publish.
        </Text>
      ) : group.types.some(hasPerTypeKnobs) ? (
        <View
          style={{
            backgroundColor: colors.surface.input,
            borderWidth: 1,
            borderColor: colors.border.default,
            borderRadius: radius.md,
            padding: spacing.md,
            gap: spacing.md,
          }}
        >
          {group.types
            .filter(hasPerTypeKnobs)
            .map((t, i) => (
              <View
                key={t}
                style={
                  i === 0
                    ? undefined
                    : {
                        borderTopWidth: 1,
                        borderTopColor: colors.border.subtle,
                        borderStyle: "dashed",
                        paddingTop: spacing.md,
                      }
                }
              >
                <PerTypeRow
                  kind={t}
                  accent={accent}
                  config={group.perType[t] ?? defaultPerType(t)}
                  onChange={(patch) =>
                    onChange(updatePerType(group, t, patch))
                  }
                />
              </View>
            ))}
        </View>
      ) : null}
    </View>
  );
}

function PerTypeRow({
  kind,
  accent,
  config,
  onChange,
}: {
  kind: BenchmarkType;
  accent: string;
  config: PerTypeConfig;
  onChange: (patch: Partial<PerTypeConfig>) => void;
}) {
  const meta = BENCHMARK_TYPE_META[kind];
  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.sm,
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Ionicons name={meta.icon} size={12} color={accent} />
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 10.5,
                color: accent,
                letterSpacing: 1,
                textTransform: "uppercase",
              },
            ]}
          >
            {meta.label}
          </Text>
        </View>
        <Text
          style={[
            fontStyle("regular"),
            { fontSize: 10.5, color: colors.text.muted },
          ]}
        >
          {meta.sub}
        </Text>
      </View>

      {meta.hasAttempts ? (
        <FieldLabeled label="Attempts per set">
          <Stepper
            value={config.attemptsPerSet ?? 0}
            onChange={(n) => onChange({ attemptsPerSet: n })}
            max={20}
          />
        </FieldLabeled>
      ) : null}

      {meta.hasLabel ? (
        <FieldLabeled label="What are you rating? (e.g. footwork, form)">
          <TextInput
            value={config.label ?? ""}
            onChangeText={(v) => onChange({ label: v })}
            placeholder="Footwork"
            placeholderTextColor={colors.text.muted}
            autoCapitalize="words"
            autoCorrect={false}
            style={smallInputStyle}
          />
        </FieldLabeled>
      ) : null}

      {meta.hasInverseToggle ? (
        <InverseRow
          value={!!config.inverse}
          onToggle={() => onChange({ inverse: !config.inverse })}
          label={`"${meta.label}" is inverse`}
          desc={
            config.inverse
              ? "Lower = better · capture flips colors"
              : "Higher = better"
          }
          accent={accent}
        />
      ) : null}
    </View>
  );
}
