import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { TextArea } from "./ui/TextArea";
import { Tag } from "./ui/Tag";
import { Section, SectionLabel } from "./ui/FormSection";
import DiagramEditor from "./DiagramEditor";
import { colors, radius, spacing } from "../constants/design";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";
import { generateSetupInstructions } from "../lib/generate-setup-instructions";
import type { DiagramData } from "../types/diagram";

type Category = { id: string; name: string };

type BenchmarkType = "timed" | "rated" | null;

export type DrillFormInitial = {
  id: string;
  drillName: string;
  categoryIds: string[];
  description: string;
  sourceUrl: string;
  benchmarkType: BenchmarkType;
  status: "draft" | "published";
  equipment: string;
  setupDiagram: DiagramData | null;
  setupInstructions: string | null;
};

type Props = {
  teamId: string;
  categories: Category[];
  initial?: DrillFormInitial;
  topInset: number;
  bottomInset: number;
};

const BENCHMARK_OPTIONS: { value: "none" | "timed" | "rated"; label: string }[] = [
  { value: "none", label: "None" },
  { value: "timed", label: "Timed" },
  { value: "rated", label: "Rated" },
];

const BENCHMARK_HELPER: Record<"none" | "timed" | "rated", string> = {
  none: "",
  timed: "Players will be timed in seconds.",
  rated: "Players will be rated 1–5.",
};

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


export function DrillForm({
  teamId,
  categories,
  initial,
  topInset,
  bottomInset,
}: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const isEditing = !!initial;

  const [drillName, setDrillName] = useState(initial?.drillName ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>(
    initial?.categoryIds ?? []
  );

  const toggleCategory = (id: string) => {
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const [description, setDescription] = useState(initial?.description ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");
  const [benchmarkSelection, setBenchmarkSelection] = useState<
    "none" | "timed" | "rated"
  >(initial?.benchmarkType ?? "none");
  const [equipment, setEquipment] = useState(initial?.equipment ?? "");
  const [diagramData, setDiagramData] = useState<DiagramData | null>(
    initial?.setupDiagram ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const hasDiagramCones =
    !!diagramData && diagramData.cones.length > 0;

  const isCurrentlyPublished = initial?.status === "published";

  const persist = async (
    targetStatus: "draft" | "published"
  ): Promise<string | null> => {
    setError(null);

    // Validation: drafts only need a name. Publishing requires name + category.
    const missing: string[] = [];
    if (!drillName.trim()) missing.push("Drill name");
    if (targetStatus === "published" && categoryIds.length === 0)
      missing.push("Category");

    if (missing.length > 0) {
      const verb = targetStatus === "published" ? "publish" : "save";
      Alert.alert(
        targetStatus === "published"
          ? "Can't publish drill"
          : "Can't save drill",
        `Please add the following before you ${verb}:\n\n• ${missing.join("\n• ")}`,
        [{ text: "OK" }]
      );
      return null;
    }

    if (!user) {
      Alert.alert("Not logged in", "You must be logged in to save a drill.");
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

    const payload = {
      drill_name: drillName.trim(),
      description: description.trim() || null,
      source_url: sourceUrl.trim() || null,
      benchmark_type:
        benchmarkSelection === "none" ? null : benchmarkSelection,
      status: targetStatus,
      category_id: null,
      equipment: equipmentJson,
      setup_diagram: setupDiagramPayload,
      setup_instructions: setupInstructions,
    };

    let drillId: string;
    if (isEditing && initial) {
      const { error: updateErr } = await supabase
        .from("team_drills")
        .update(payload)
        .eq("id", initial.id);
      if (updateErr) {
        Alert.alert("Couldn't save drill", updateErr.message);
        return null;
      }
      drillId = initial.id;
    } else {
      const { data, error: insertErr } = await supabase
        .from("team_drills")
        .insert({
          ...payload,
          team_id: teamId,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (insertErr || !data) {
        Alert.alert(
          "Couldn't save drill",
          insertErr?.message ?? "Could not create drill."
        );
        return null;
      }
      drillId = data.id as string;
    }

    const { error: deleteCatErr } = await supabase
      .from("team_drill_categories")
      .delete()
      .eq("drill_id", drillId);
    if (deleteCatErr) {
      Alert.alert("Couldn't save categories", deleteCatErr.message);
      return null;
    }
    if (categoryIds.length > 0) {
      const { error: insertCatErr } = await supabase
        .from("team_drill_categories")
        .insert(
          categoryIds.map((cid) => ({ drill_id: drillId, category_id: cid }))
        );
      if (insertCatErr) {
        Alert.alert("Couldn't save categories", insertCatErr.message);
        return null;
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
    if (isEditing) {
      router.back();
    } else {
      router.replace(`/drills/${id}` as never);
    }
  };

  const publishLabel = isEditing
    ? isCurrentlyPublished
      ? "Save Changes"
      : "Publish Drill"
    : "Publish Drill";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
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
              ? colors.surface.pressed
              : colors.surface.muted,
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
          {isEditing ? "Edit Drill" : "New Drill"}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: footerHeight + spacing["2xl"],
          gap: spacing["2xl"],
        }}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled}
      >
        {/* Drill name */}
        <Section>
          <Input
            label="Drill Name"
            value={drillName}
            onChangeText={setDrillName}
            placeholder="e.g., 5-10-5 Shuttle"
            autoCapitalize="words"
            returnKeyType="next"
          />
        </Section>

        {/* Categories (multi-select) */}
        {categories.length > 0 ? (
          <Section>
            <SectionLabel>Categories</SectionLabel>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.sm,
                paddingVertical: 2,
              }}
            >
              {categories.map((c) => {
                const selected = categoryIds.includes(c.id);
                return (
                  <Tag
                    key={c.id}
                    label={c.name}
                    selected={selected}
                    onPress={() => toggleCategory(c.id)}
                  />
                );
              })}
            </View>
          </Section>
        ) : null}

        {/* Description */}
        <Section>
          <TextArea
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="How to run this drill, coaching points..."
            style={{ minHeight: 110 }}
          />
        </Section>

        {/* Source URL */}
        <Section>
          <Input
            label="Video Link"
            value={sourceUrl}
            onChangeText={setSourceUrl}
            placeholder="https://youtube.com/... or TikTok/Instagram link"
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Section>

        {/* Benchmark type */}
        <Section>
          <SectionLabel>Benchmark Type</SectionLabel>
          <View
            className="flex-row"
            style={{ gap: spacing.sm, flexWrap: "wrap" }}
          >
            {BENCHMARK_OPTIONS.map((opt) => (
              <Tag
                key={opt.value}
                label={opt.label}
                selected={benchmarkSelection === opt.value}
                onPress={() => setBenchmarkSelection(opt.value)}
              />
            ))}
          </View>
          {BENCHMARK_HELPER[benchmarkSelection] ? (
            <Text
              style={{
                fontSize: 13,
                lineHeight: 18,
                color: colors.text.muted,
                marginTop: spacing.sm,
              }}
            >
              {BENCHMARK_HELPER[benchmarkSelection]}
            </Text>
          ) : null}
        </Section>

        {/* Equipment */}
        <Section>
          <Input
            label="Equipment"
            value={equipment}
            onChangeText={setEquipment}
            placeholder="e.g., 5 cones, 1 agility ladder"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Section>

        {/* Setup Diagram */}
        <Section>
          <SectionLabel>Setup Diagram</SectionLabel>
          <DiagramEditor
            value={diagramData}
            onChange={setDiagramData}
            onDragStateChange={(dragging) => setScrollEnabled(!dragging)}
          />
        </Section>

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
          gap: spacing.md,
        }}
      >
        <Button
          label={submitting ? "Saving…" : publishLabel}
          onPress={() => save("published")}
          disabled={submitting}
        />
        <Button
          label={submitting ? "Saving…" : "Save as Draft"}
          onPress={() => save("draft")}
          disabled={submitting}
          variant="secondary"
        />
      </View>
    </KeyboardAvoidingView>
  );
}
