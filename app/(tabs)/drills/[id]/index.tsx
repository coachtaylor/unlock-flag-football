import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DiagramRenderer from "../../../../components/DiagramRenderer";
import { Button } from "../../../../components/ui/Button";
import { colors, radius, spacing } from "../../../../constants/design";
import { supabase } from "../../../../lib/supabase";
import { useTeam } from "../../../../lib/team-context";
import { generateSetupInstructions } from "../../../../lib/generate-setup-instructions";
import type { DiagramData } from "../../../../types/diagram";

type DrillRow = {
  id: string;
  team_id: string;
  drill_name: string;
  description: string | null;
  source_url: string | null;
  benchmark_type: "timed" | "rated" | null;
  status: "draft" | "published";
  setup_instructions: string | null;
  setup_diagram: DiagramData | null;
  equipment: { cones?: number; other?: unknown } | null;
  team_drill_categories: { category_id: string }[] | null;
};

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        lineHeight: 14,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: colors.text.secondary,
        fontWeight: "500",
      }}
    >
      {children}
    </Text>
  );
}

function CategoryTag({ name }: { name: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: colors.surface.muted,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.text.subtle,
        }}
      >
        {name}
      </Text>
    </View>
  );
}

function BenchmarkBadge({ type }: { type: "timed" | "rated" }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: colors.orange[600],
        borderWidth: 1,
        borderColor: colors.orange[500],
      }}
    >
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.orange[400],
          fontWeight: "500",
        }}
      >
        {type}
      </Text>
    </View>
  );
}

function DraftBadge() {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: colors.surface.muted,
        borderWidth: 1,
        borderColor: colors.border.strong,
        borderStyle: "dashed",
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "500",
          color: colors.text.muted,
        }}
      >
        Draft
      </Text>
    </View>
  );
}

export default function DrillDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { teamId } = useTeam();

  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<DrillRow | null>(null);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!id || !teamId) return;
    const { data } = await supabase
      .from("team_drills")
      .select(
        "id, team_id, drill_name, description, source_url, benchmark_type, status, setup_instructions, setup_diagram, equipment, team_drill_categories(category_id)"
      )
      .eq("id", id)
      .maybeSingle();

    if (!data || (data.team_id as string) !== teamId) {
      setDrill(null);
      setNotFound(true);
      return;
    }

    const drillData = data as DrillRow;
    setDrill(drillData);
    setNotFound(false);

    const ids = Array.from(
      new Set<string>(
        (drillData.team_drill_categories ?? []).map((l) => l.category_id)
      )
    );

    if (ids.length > 0) {
      const { data: cats } = await supabase
        .from("drill_categories")
        .select("id, category_name")
        .in("id", ids);
      const nameById = new Map(
        (cats ?? []).map((c) => [c.id as string, c.category_name as string])
      );
      setCategoryNames(
        ids.map((cid) => nameById.get(cid)).filter((n): n is string => !!n)
      );
    } else {
      setCategoryNames([]);
    }
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

  // Reload whenever the screen regains focus (e.g. after returning from edit)
  // so saved changes are reflected without a manual refresh.
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

  const headerPaddingTop = insets.top + spacing.md;

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

  if (notFound || !drill) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          paddingTop: headerPaddingTop,
          paddingHorizontal: spacing.xl,
        }}
      >
        <Pressable
          onPress={goBack}
          hitSlop={8}
          style={{
            flexDirection: "row",
            alignItems: "center",
            minHeight: 44,
          }}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={colors.text.secondary}
          />
          <Text
            style={{
              fontSize: 13,
              color: colors.text.secondary,
              marginLeft: spacing.xs,
            }}
          >
            Drills
          </Text>
        </Pressable>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: 15,
              color: colors.text.secondary,
            }}
          >
            Drill not found.
          </Text>
        </View>
      </View>
    );
  }

  const rawDiagram = drill.setup_diagram;
  const diagram =
    rawDiagram && Array.isArray(rawDiagram.cones) && rawDiagram.cones.length > 0
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
  const showEquipment = equipmentCones > 0 || equipmentOther.length > 0;

  const showRunBenchmark =
    drill.benchmark_type !== null && drill.status === "published";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerPaddingTop,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing["3xl"],
        }}
      >
        <Pressable
          onPress={goBack}
          hitSlop={8}
          style={{
            flexDirection: "row",
            alignItems: "center",
            minHeight: 44,
          }}
          accessibilityLabel="Back to drills"
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={colors.text.secondary}
          />
          <Text
            style={{
              fontSize: 13,
              color: colors.text.secondary,
              marginLeft: spacing.xs,
            }}
          >
            Drills
          </Text>
        </Pressable>

        <Text
          style={{
            fontSize: 20,
            lineHeight: 28,
            fontWeight: "500",
            color: colors.text.primary,
            marginTop: spacing.md,
          }}
        >
          {drill.drill_name}
        </Text>

        {(categoryNames.length > 0 ||
          drill.benchmark_type ||
          drill.status === "draft") && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              gap: spacing.xs,
              marginTop: spacing.md,
            }}
          >
            {categoryNames.map((name) => (
              <CategoryTag key={name} name={name} />
            ))}
            {drill.benchmark_type && (
              <BenchmarkBadge type={drill.benchmark_type} />
            )}
            {drill.status === "draft" && <DraftBadge />}
          </View>
        )}

        {(drill.description || drill.source_url) && (
          <View style={{ marginTop: spacing["2xl"] }}>
            <SectionLabel>Description</SectionLabel>
            {drill.description && (
              <Text
                style={{
                  fontSize: 15,
                  lineHeight: 22,
                  color: colors.text.primary,
                  marginTop: spacing.sm,
                }}
              >
                {drill.description}
              </Text>
            )}
            {drill.source_url && (
              <Pressable
                onPress={openSourceUrl}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: spacing.sm,
                  minHeight: 44,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    lineHeight: 22,
                    color: colors.orange[400],
                    marginRight: spacing.xs,
                  }}
                >
                  View source video
                </Text>
                <Ionicons
                  name="open-outline"
                  size={16}
                  color={colors.orange[400]}
                />
              </Pressable>
            )}
          </View>
        )}

        {diagram && (
          <View style={{ marginTop: spacing["2xl"] }}>
            <SectionLabel>Setup Diagram</SectionLabel>
            <View style={{ marginTop: spacing.sm }}>
              <DiagramRenderer data={diagram} />
            </View>
          </View>
        )}

        {diagram && setupInstructions.length > 0 && (
          <View style={{ marginTop: spacing["2xl"] }}>
            <SectionLabel>Setup Instructions</SectionLabel>
            <View
              style={{
                marginTop: spacing.sm,
                padding: spacing.lg,
                borderRadius: radius.lg,
                backgroundColor: colors.surface.raised,
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  lineHeight: 22,
                  color: colors.text.secondary,
                }}
              >
                {setupInstructions}
              </Text>
            </View>
          </View>
        )}

        {showEquipment && (
          <View style={{ marginTop: spacing["2xl"] }}>
            <SectionLabel>Equipment</SectionLabel>
            <View
              style={{
                marginTop: spacing.sm,
                padding: spacing.lg,
                borderRadius: radius.lg,
                backgroundColor: colors.surface.raised,
                gap: spacing.sm,
              }}
            >
              {equipmentCones > 0 && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      lineHeight: 22,
                      color: colors.text.primary,
                    }}
                  >
                    Cones
                  </Text>
                  <Text
                    style={{
                      fontSize: 15,
                      lineHeight: 22,
                      color: colors.text.primary,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {equipmentCones}
                  </Text>
                </View>
              )}
              {equipmentOther.map((item, idx) => (
                <Text
                  key={`${item}-${idx}`}
                  style={{
                    fontSize: 15,
                    lineHeight: 22,
                    color: colors.text.primary,
                  }}
                >
                  {item}
                </Text>
              ))}
            </View>
          </View>
        )}

        <View
          style={{
            marginTop: spacing["3xl"],
            gap: spacing.md,
          }}
        >
          <Button
            label="Edit Drill"
            variant="secondary"
            onPress={goToEdit}
          />
          {showRunBenchmark && (
            <Button label="Run Benchmark" onPress={runBenchmark} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
