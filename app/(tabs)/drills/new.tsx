import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DrillForm } from "../../../components/DrillForm";
import { colors } from "../../../constants/design";
import { loadDrillCategories } from "../../../lib/load-categories";
import { loadAllSkills, type Skill } from "../../../lib/skills";
import { useTeam } from "../../../lib/team-context";
import type { CategoryType } from "../../../constants/categories";

type Category = { id: string; name: string; type: CategoryType | null };

export default function NewDrillScreen() {
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!teamId) return;
    (async () => {
      const [rows, catalog] = await Promise.all([
        loadDrillCategories(teamId),
        loadAllSkills(),
      ]);

      if (cancelled) return;
      setCategories(
        rows.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
        }))
      );
      setSkills(catalog.skills);
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
      skills={skills}
      topInset={insets.top}
      bottomInset={insets.bottom + 60}
    />
  );
}
