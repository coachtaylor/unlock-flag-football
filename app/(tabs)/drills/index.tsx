import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tag } from "../../../components/ui/Tag";
import { Button } from "../../../components/ui/Button";
import { colors, radius, spacing } from "../../../constants/design";
import { supabase } from "../../../lib/supabase";
import { useTeam } from "../../../lib/team-context";
import { useAuth } from "../../../lib/auth-context";

const ALL = "__all__";

type Category = { id: string; name: string };

type Drill = {
  id: string;
  name: string;
  status: "draft" | "published";
  benchmarkType: "timed" | "rated" | null;
  categoryIds: string[];
  categoryNames: string[];
  createdAt: string;
};

type StatusFilter = "all" | "draft" | "published";
type BenchmarkFilter = "all" | "timed" | "rated" | "none";
type SortOption = "name_asc" | "recent";

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
        height: 88,
        borderRadius: radius.lg,
        backgroundColor: colors.surface.raised,
        opacity,
      }}
    />
  );
}

function CategoryTag({ name }: { name: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: colors.surface.elevated,
        borderWidth: 1,
        borderColor: colors.border.card,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.text.label,
          fontWeight: "500",
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
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: colors.surface.elevated,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.30)",
        borderStyle: "dashed",
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "500",
          color: colors.text.label,
        }}
      >
        Draft
      </Text>
    </View>
  );
}

export default function DrillListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();
  const { user } = useAuth();
  const userId = user?.id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>(ALL);
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("all");
  const [activeBenchmark, setActiveBenchmark] = useState<BenchmarkFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name_asc");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!teamId) return;
    const [categoriesRes, drillsRes] = await Promise.all([
      supabase
        .from("drill_categories")
        .select("id, category_name, display_order")
        .or(`team_id.is.null,team_id.eq.${teamId}`)
        .order("display_order", { ascending: true })
        .order("category_name", { ascending: true }),
      supabase
        .from("team_drills")
        .select(
          "id, drill_name, status, benchmark_type, created_by, created_at, team_drill_categories(category_id)"
        )
        .eq("team_id", teamId)
        .order("drill_name", { ascending: true }),
    ]);

    if (drillsRes.error) {
      console.warn("[drills] load error:", drillsRes.error.message);
    }

    const categoryRows: Category[] = (categoriesRes.data ?? []).map((c) => ({
      id: c.id as string,
      name: c.category_name as string,
    }));
    const nameById = new Map(categoryRows.map((c) => [c.id, c.name]));

    const drillRows: Drill[] = (drillsRes.data ?? [])
      .filter((d) => {
        // Show all published drills + only the current user's own drafts.
        if (d.status === "published") return true;
        if (d.status === "draft") return d.created_by === userId;
        return false;
      })
      .map((d) => {
        const links =
          (d.team_drill_categories as { category_id: string }[] | null) ?? [];
        const ids = links.map((l) => l.category_id);
        const names = ids
          .map((id) => nameById.get(id))
          .filter((n): n is string => !!n);
        return {
          id: d.id as string,
          name: d.drill_name as string,
          status: d.status as "draft" | "published",
          benchmarkType:
            (d.benchmark_type as "timed" | "rated" | null) ?? null,
          categoryIds: ids,
          categoryNames: names,
          createdAt: (d.created_at as string) ?? "",
        };
      });

    const usedCategoryIds = new Set<string>();
    for (const d of drillRows) {
      for (const id of d.categoryIds) usedCategoryIds.add(id);
    }
    const usedCategories = categoryRows.filter((c) =>
      usedCategoryIds.has(c.id)
    );

    setCategories(usedCategories);
    setDrills(drillRows);
  }, [teamId, userId]);

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

  // Reload every time the tab comes back into focus so newly created
  // drills (or drafts) appear without a manual pull-to-refresh.
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = drills.filter((d) => {
      const categoryMatch =
        activeCategory === ALL || d.categoryIds.includes(activeCategory);
      const searchMatch = q.length === 0 || d.name.toLowerCase().includes(q);
      const statusMatch =
        activeStatus === "all" || d.status === activeStatus;
      const benchmarkMatch =
        activeBenchmark === "all"
          ? true
          : activeBenchmark === "none"
          ? d.benchmarkType === null
          : d.benchmarkType === activeBenchmark;
      return categoryMatch && searchMatch && statusMatch && benchmarkMatch;
    });
    if (sortBy === "recent") {
      return [...matched].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return [...matched].sort((a, b) => a.name.localeCompare(b.name));
  }, [drills, activeCategory, activeStatus, activeBenchmark, search, sortBy]);

  const activeFilterCount =
    (activeCategory !== ALL ? 1 : 0) +
    (activeStatus !== "all" ? 1 : 0) +
    (activeBenchmark !== "all" ? 1 : 0);

  const sortLabel = sortBy === "recent" ? "Recent" : "A–Z";

  const goToDrill = (id: string) => {
    router.push(`/drills/${id}` as never);
  };

  const goToNew = () => {
    router.push("/drills/new" as never);
  };

  const headerPaddingTop = insets.top + spacing.lg;

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          paddingHorizontal: spacing.xl,
          paddingTop: headerPaddingTop,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            lineHeight: 28,
            fontWeight: "500",
            color: colors.text.primary,
          }}
        >
          Drills
        </Text>
        <View style={{ marginTop: spacing["2xl"], gap: spacing.sm }}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      </View>
    );
  }

  if (drills.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          paddingHorizontal: spacing.xl,
          paddingTop: headerPaddingTop,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            lineHeight: 28,
            fontWeight: "500",
            color: colors.text.primary,
          }}
        >
          Drills
        </Text>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.lg,
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
            No drills yet. Create your first drill to get started.
          </Text>
          <Button label="Create Drill" onPress={goToNew} fullWidth={false} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <View
        style={{
          paddingTop: headerPaddingTop,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            lineHeight: 28,
            fontWeight: "500",
            color: colors.text.primary,
          }}
        >
          Drills
        </Text>
      </View>

      <View
        style={{
          paddingHorizontal: spacing.xl,
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

      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          gap: spacing.sm,
        }}
      >
        <FilterButton
          label="Filter"
          badge={activeFilterCount > 0 ? activeFilterCount : undefined}
          active={activeFilterCount > 0}
          onPress={() => setFilterOpen(true)}
        />
        <FilterButton
          label={`Sort: ${sortLabel}`}
          active={sortBy !== "name_asc"}
          onPress={() => setSortOpen(true)}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing["3xl"] + 72,
          gap: spacing.sm,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.orange[500]}
          />
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => goToDrill(item.id)}>
            {({ pressed }) => (
              <View
                style={{
                  backgroundColor: colors.surface.raised,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border.card,
                  borderLeftWidth: 3,
                  borderLeftColor: colors.orange[500],
                  padding: spacing.lg,
                  minHeight: 64,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  shadowColor: "#000",
                  shadowOpacity: 0.15,
                  shadowOffset: { width: 0, height: 2 },
                  shadowRadius: 4,
                  elevation: 2,
                  opacity: pressed ? 0.88 : 1,
                  transform: [{ scale: pressed ? 0.99 : 1 }],
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: spacing.md,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        lineHeight: 22,
                        fontWeight: "500",
                        color: colors.text.primary,
                        flex: 1,
                      }}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                    {item.status === "draft" && <DraftBadge />}
                  </View>
                  {(item.categoryNames.length > 0 || item.benchmarkType) && (
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: spacing.xs,
                        marginTop: spacing.sm,
                      }}
                    >
                      {item.categoryNames.map((name) => (
                        <CategoryTag key={name} name={name} />
                      ))}
                      {item.benchmarkType && (
                        <BenchmarkBadge type={item.benchmarkType} />
                      )}
                    </View>
                  )}
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.text.secondary}
                />
              </View>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <View
            style={{
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
        }
      />

      <Pressable
        onPress={goToNew}
        accessibilityLabel="Create drill"
        style={{
          position: "absolute",
          right: spacing.xl,
          bottom: 60 + insets.bottom + spacing.lg,
          width: 56,
          height: 56,
        }}
      >
        {({ pressed }) => (
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.orange[500],
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35,
              shadowRadius: 10,
              elevation: 8,
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            }}
          >
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </View>
        )}
      </Pressable>

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        categories={categories}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        activeStatus={activeStatus}
        setActiveStatus={setActiveStatus}
        activeBenchmark={activeBenchmark}
        setActiveBenchmark={setActiveBenchmark}
        onClear={() => {
          setActiveCategory(ALL);
          setActiveStatus("all");
          setActiveBenchmark("all");
        }}
      />
      <SortSheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        sortBy={sortBy}
        setSortBy={setSortBy}
      />
    </View>
  );
}

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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.xs,
            minHeight: 36,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: radius.pill,
            borderWidth: active ? 1.5 : 1,
            backgroundColor: active
              ? "rgba(212,138,48,0.22)"
              : colors.surface.elevated,
            borderColor: active ? colors.orange[500] : colors.border.card,
            opacity: pressed ? 0.88 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          }}
        >
          <Text
            style={{
              fontSize: 13,
              lineHeight: 18,
              fontWeight: "500",
              color: active ? colors.orange[400] : colors.text.primary,
            }}
          >
            {label}
            {badge !== undefined ? ` (${badge})` : ""}
          </Text>
          <Ionicons
            name="chevron-down"
            size={14}
            color={active ? colors.orange[400] : colors.text.secondary}
          />
        </View>
      )}
    </Pressable>
  );
}

function SheetContainer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface.raised,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderTopWidth: 1,
            borderColor: colors.border.card,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.xl,
            gap: spacing.lg,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border.strong,
            }}
          />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetSectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: "500",
        letterSpacing: 0.8,
        textTransform: "uppercase",
        color: colors.text.label,
      }}
    >
      {children}
    </Text>
  );
}

function FilterSheet({
  open,
  onClose,
  categories,
  activeCategory,
  setActiveCategory,
  activeStatus,
  setActiveStatus,
  activeBenchmark,
  setActiveBenchmark,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  activeCategory: string;
  setActiveCategory: (v: string) => void;
  activeStatus: StatusFilter;
  setActiveStatus: (v: StatusFilter) => void;
  activeBenchmark: BenchmarkFilter;
  setActiveBenchmark: (v: BenchmarkFilter) => void;
  onClear: () => void;
}) {
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
          style={{
            fontSize: 18,
            fontWeight: "500",
            color: colors.text.primary,
          }}
        >
          Filter
        </Text>
        <Pressable onPress={onClear} hitSlop={8}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "500",
              color: colors.orange[400],
            }}
          >
            Clear
          </Text>
        </Pressable>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SheetSectionLabel>Category</SheetSectionLabel>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
        >
          <Tag
            label="All"
            selected={activeCategory === ALL}
            onPress={() => setActiveCategory(ALL)}
          />
          {categories.map((c) => (
            <Tag
              key={c.id}
              label={c.name}
              selected={activeCategory === c.id}
              onPress={() => setActiveCategory(c.id)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SheetSectionLabel>Status</SheetSectionLabel>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
        >
          <Tag
            label="All"
            selected={activeStatus === "all"}
            onPress={() => setActiveStatus("all")}
          />
          <Tag
            label="Published"
            selected={activeStatus === "published"}
            onPress={() => setActiveStatus("published")}
          />
          <Tag
            label="Draft"
            selected={activeStatus === "draft"}
            onPress={() => setActiveStatus("draft")}
          />
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SheetSectionLabel>Benchmark Type</SheetSectionLabel>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
        >
          <Tag
            label="All"
            selected={activeBenchmark === "all"}
            onPress={() => setActiveBenchmark("all")}
          />
          <Tag
            label="Timed"
            selected={activeBenchmark === "timed"}
            onPress={() => setActiveBenchmark("timed")}
          />
          <Tag
            label="Rated"
            selected={activeBenchmark === "rated"}
            onPress={() => setActiveBenchmark("rated")}
          />
          <Tag
            label="None"
            selected={activeBenchmark === "none"}
            onPress={() => setActiveBenchmark("none")}
          />
        </View>
      </View>

      <Button label="Done" onPress={onClose} />
    </SheetContainer>
  );
}

function SortSheet({
  open,
  onClose,
  sortBy,
  setSortBy,
}: {
  open: boolean;
  onClose: () => void;
  sortBy: SortOption;
  setSortBy: (v: SortOption) => void;
}) {
  const options: { value: SortOption; label: string }[] = [
    { value: "name_asc", label: "Name (A–Z)" },
    { value: "recent", label: "Recently added" },
  ];
  return (
    <SheetContainer open={open} onClose={onClose}>
      <Text
        style={{
          fontSize: 18,
          fontWeight: "500",
          color: colors.text.primary,
        }}
      >
        Sort
      </Text>
      <View style={{ gap: spacing.xs }}>
        {options.map((o) => {
          const selected = sortBy === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                setSortBy(o.value);
                onClose();
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: pressed
                  ? colors.surface.pressed
                  : "transparent",
              })}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "500",
                  color: selected ? colors.orange[400] : colors.text.primary,
                }}
              >
                {o.label}
              </Text>
              {selected ? (
                <Ionicons
                  name="checkmark"
                  size={18}
                  color={colors.orange[400]}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </SheetContainer>
  );
}
