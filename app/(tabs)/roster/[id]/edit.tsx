import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PlayerForm, type PlayerFormInitial } from "../../../../components/PlayerForm";
import { colors } from "../../../../constants/design";
import { supabase } from "../../../../lib/supabase";
import { useTeam } from "../../../../lib/team-context";

export default function EditPlayerScreen() {
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [initial, setInitial] = useState<PlayerFormInitial | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      // Try with color_index (migration 45); fall back without it.
      const sel = (withColor: boolean) =>
        supabase
          .from("team_players")
          .select(
            `id, player_name, positions, jersey_number, notes, is_captain${
              withColor ? ", color_index" : ""
            }`
          )
          .eq("id", id)
          .maybeSingle();
      let res = await sel(true);
      if (res.error && /color_index/i.test(res.error.message)) {
        res = await sel(false);
      }
      const data = res.data as Record<string, unknown> | null;

      if (cancelled) return;
      if (data) {
        setInitial({
          id: data.id as string,
          playerName: (data.player_name as string) ?? "",
          positions: (data.positions as string[] | null) ?? [],
          jerseyNumber: (data.jersey_number as string | null) ?? "",
          notes: (data.notes as string | null) ?? "",
          colorIndex: (data.color_index as number | null) ?? null,
          isCaptain: data.is_captain === true,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!teamId || loading || !initial) {
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
    <PlayerForm teamId={teamId} initial={initial} topInset={insets.top} />
  );
}
