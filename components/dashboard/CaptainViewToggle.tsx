import { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, fontWeight, radius } from "../../constants/design";
import { fontStyle } from "../../constants/typography";
import { supabase } from "../../lib/supabase";

// §6.2 captain toggle. Only renders when the current user is BOTH a
// team_members.role='captain' AND linked to a team_players row with
// is_captain=true via the user_id added in migration 56.
//
// MVP semantics: "Coach view" is the existing team dashboard (no-op
// when selected). "Player view" navigates to the user's own player
// detail page at /(tabs)/roster/[id], which already shows their
// individual benchmarks, notes, and history. A true two-render-paths
// dashboard is a follow-up — this gets the UX in front of users today
// without rebuilding 3000 lines of dashboard logic.

type Props = {
  teamId: string;
  userId: string;
  userRole: string | null;
};

export function CaptainViewToggle({ teamId, userId, userRole }: Props) {
  const router = useRouter();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userRole !== "captain") {
      // Fast-path: non-captain users never need the lookup.
      setLoading(false);
      setPlayerId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("team_players")
        .select("id")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .eq("is_captain", true)
        .maybeSingle();

      if (cancelled) return;
      setLoading(false);
      if (error) {
        // 42703 = team_players.user_id missing (pre-56). Hide silently.
        if (error.code !== "42703") {
          console.warn("[captain-toggle] lookup failed:", error.message);
        }
        return;
      }
      const row = data as { id: string } | null;
      setPlayerId(row?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, userId, userRole]);

  if (loading || !playerId) return null;

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
      <View
        style={{
          flexDirection: "row",
          backgroundColor: colors.surface.raised,
          borderWidth: 1,
          borderColor: colors.border.default,
          borderRadius: radius.full,
          padding: 4,
          gap: 2,
        }}
      >
        <SegmentBtn label="Coach view" active onPress={() => {}} />
        <SegmentBtn
          label="Player view"
          active={false}
          onPress={() => router.push(`/(tabs)/roster/${playerId}`)}
        />
      </View>
    </View>
  );
}

function SegmentBtn({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 10,
        borderRadius: radius.full,
        backgroundColor: active ? colors.orange[500] : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={[
          fontStyle("semibold"),
          {
            fontSize: 13,
            fontWeight: fontWeight.semibold,
            color: active ? colors.text.onBrand : colors.text.secondary,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
