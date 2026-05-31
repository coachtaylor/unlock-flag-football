import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DrillForm } from "../../../components/DrillForm";
import { colors } from "../../../constants/design";
import { loadDrillCategories } from "../../../lib/load-categories";
import { useTeam } from "../../../lib/team-context";
import type { CategoryType } from "../../../constants/categories";

type Category = { id: string; name: string; type: CategoryType | null };

export default function NewDrillScreen() {
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!teamId) return;
    (async () => {
      const rows = await loadDrillCategories(teamId);

      if (cancelled) return;
      setCategories(
        rows.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
        }))
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  if (!teamId || loading) {
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

  return (
    <DrillForm
      teamId={teamId}
      categories={categories}
      topInset={insets.top}
      bottomInset={insets.bottom + 60}
    />
  );
}
