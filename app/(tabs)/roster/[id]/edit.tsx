import { withManageGuard } from "../../../../components/RequireManage";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PlayerForm, type PlayerFormInitial } from "../../../../components/PlayerForm";
import { colors } from "../../../../constants/design";
import { supabase } from "../../../../lib/supabase";
import { useTeam } from "../../../../lib/team-context";

function EditPlayerScreen() {
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [initial, setInitial] = useState<PlayerFormInitial | null>(null);
  // The player's own team_id — used as the PlayerForm team so team-scoped
  // writes (esp. the photo Storage path {teamId}/{playerId}) target the team
  // the player actually belongs to, not whatever team the context resolved to.
  const [playerTeamId, setPlayerTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      // Degrade through migration drift: 101 card cols (photo/physicals) →
      // 45 color_index.
      const sel = (withColor: boolean, withCard: boolean) =>
        supabase
          .from("team_players")
          .select(
            `id, team_id, player_name, first_name, last_name, positions, jersey_number, notes, is_captain, captain_access, user_id${
              withColor ? ", color_index" : ""
            }${withCard ? ", photo_url, height_in, weight_lb" : ""}`
          )
          .eq("id", id)
          .maybeSingle();
      let res = await sel(true, true);
      if (res.error && /photo_url|height_in|weight_lb/i.test(res.error.message)) {
        res = await sel(true, false);
      }
      if (res.error && /color_index/i.test(res.error.message)) {
        res = await sel(false, false);
      }
      const data = res.data as Record<string, unknown> | null;

      if (cancelled) return;
      if (data) {
        setPlayerTeamId((data.team_id as string | null) ?? null);
        setInitial({
          id: data.id as string,
          playerName: (data.player_name as string) ?? "",
          firstName: (data.first_name as string | null) ?? null,
          lastName: (data.last_name as string | null) ?? null,
          positions: (data.positions as string[] | null) ?? [],
          jerseyNumber: (data.jersey_number as string | null) ?? "",
          notes: (data.notes as string | null) ?? "",
          colorIndex: (data.color_index as number | null) ?? null,
          isCaptain: data.is_captain === true,
          captainAccess:
            (data.captain_access as "full" | "view" | "none" | null) ?? null,
          accountLinked: !!(data.user_id as string | null),
          photoUrl: (data.photo_url as string | null) ?? null,
          heightIn: (data.height_in as number | null) ?? null,
          weightLb: (data.weight_lb as number | null) ?? null,
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
    <PlayerForm teamId={playerTeamId ?? teamId} initial={initial} topInset={insets.top} />
  );
}

export default withManageGuard(EditPlayerScreen, "/roster");
