import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontWeight, radius, spacing } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";
import {
  teamColorHex,
  type TeamColorKey,
} from "../../constants/team-colors";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";

// Smart picker per §6.4. Three states based on how many leagues the
// caller administers:
//   - 0 leagues → not rendered (returns null). Caller is unaffected;
//     team-setup keeps creating standalone teams as it always did.
//   - 1 league → compact 2-option selector (Standalone + the league),
//     defaulted to the league.
//   - 2+ leagues → "Standalone" + a tap-to-open dropdown sheet listing
//     every league. No default — user must pick.
//
// The `selected` value is the league_id the parent will plumb into
// create_team_with_member(p_league_id => ...). `null` means standalone.

type League = {
  id: string;
  name: string;
  color: string;
};

type Props = {
  selected: string | null;
  onChange: (leagueId: string | null) => void;
};

export function LeaguePicker({ selected, onChange }: Props) {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("league_members")
        .select("league_id, leagues(id, league_name, league_color)")
        .eq("user_id", user.id);

      if (cancelled) return;
      setLoading(false);

      if (error) {
        // 42P01/PGRST205 = leagues table missing (pre-48). Hide silently.
        if (error.code !== "42P01" && error.code !== "PGRST205") {
          console.warn("[league-picker] load failed:", error.message);
        }
        setLeagues([]);
        return;
      }
      const rows = (data ?? []).flatMap((row) => {
        const league = Array.isArray(row.leagues) ? row.leagues[0] : row.leagues;
        if (!league || !row.league_id) return [];
        return [
          {
            id: row.league_id,
            name: league.league_name ?? "Untitled league",
            color: teamColorHex(league.league_color as TeamColorKey | null),
          },
        ];
      });
      setLeagues(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Default to the only league when there's exactly one. Run once on
  // load — don't re-fire if the user actively switches to standalone.
  useEffect(() => {
    if (loading) return;
    if (leagues.length === 1 && selected === null) {
      onChange(leagues[0].id);
    }
  }, [loading, leagues, selected, onChange]);

  const selectedLeague = useMemo(
    () => leagues.find((l) => l.id === selected) ?? null,
    [leagues, selected],
  );

  if (loading) {
    // Compact skeleton so the surrounding form doesn't jump when leagues
    // resolve. Same height as the rendered one-league state.
    return (
      <View
        style={{
          height: 56,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border.subtle,
          backgroundColor: colors.surface.raised,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.text.muted} size="small" />
      </View>
    );
  }

  if (leagues.length === 0) {
    // §6.4: zero leagues → hide the picker entirely.
    return null;
  }

  if (leagues.length === 1) {
    const single = leagues[0];
    return (
      <View>
        <Label />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <ChipOption
            label={single.name}
            color={single.color}
            selected={selected === single.id}
            onPress={() => onChange(single.id)}
          />
          <ChipOption
            label="Standalone team"
            color={null}
            selected={selected === null}
            onPress={() => onChange(null)}
          />
        </View>
      </View>
    );
  }

  // 2+ leagues
  return (
    <View>
      <Label />
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setSheetOpen(true)}
        style={{
          minHeight: 48,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border.card,
          backgroundColor: colors.surface.input,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        {selectedLeague ? (
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              backgroundColor: selectedLeague.color,
            }}
          />
        ) : selected === null ? (
          <Ionicons name="layers-outline" size={20} color={colors.text.secondary} />
        ) : null}
        <Text
          style={[
            fontStyle("medium"),
            {
              flex: 1,
              fontSize: 15,
              fontWeight: fontWeight.medium,
              color:
                selectedLeague || selected === null
                  ? colors.text.primary
                  : colors.text.muted,
            },
          ]}
          numberOfLines={1}
        >
          {selectedLeague?.name ??
            (selected === null ? "Standalone team" : "Choose a league or standalone")}
        </Text>
        <Ionicons
          name="chevron-down"
          size={16}
          color={colors.text.secondary}
        />
      </TouchableOpacity>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable
          onPress={() => setSheetOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(8,9,11,0.72)",
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              marginHorizontal: 16,
              marginBottom: 16 + insets.bottom,
              backgroundColor: colors.surface.raised,
              borderWidth: 1,
              borderColor: colors.border.default,
              borderRadius: 22,
              padding: 18,
              maxHeight: "70%",
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border.default,
                alignSelf: "center",
                marginBottom: 14,
              }}
            />
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 16,
                  fontWeight: fontWeight.bold,
                  color: colors.text.primary,
                  marginBottom: 12,
                  paddingHorizontal: 4,
                },
              ]}
            >
              Where does this team belong?
            </Text>
            <ScrollView style={{ flexGrow: 0 }}>
              <SheetRow
                label="Standalone team"
                color={null}
                selected={selected === null}
                onPress={() => {
                  onChange(null);
                  setSheetOpen(false);
                }}
              />
              {leagues.map((l) => (
                <SheetRow
                  key={l.id}
                  label={l.name}
                  color={l.color}
                  selected={selected === l.id}
                  onPress={() => {
                    onChange(l.id);
                    setSheetOpen(false);
                  }}
                />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Internal atoms
// ─────────────────────────────────────────────────────────────────────

function Label() {
  return (
    <Text
      style={{
        fontSize: 11,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: colors.text.label,
        fontWeight: fontWeight.medium,
        marginBottom: spacing.sm,
      }}
    >
      Where does this team belong?
    </Text>
  );
}

function ChipOption({
  label,
  color,
  selected,
  onPress,
}: {
  label: string;
  color: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 48,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: radius.md,
        backgroundColor: selected
          ? "rgba(255,106,26,0.10)"
          : colors.surface.input,
        borderWidth: 1.5,
        borderColor: selected ? colors.orange[500] : colors.border.card,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      {color ? (
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            backgroundColor: color,
          }}
        />
      ) : (
        <Ionicons
          name="layers-outline"
          size={16}
          color={selected ? colors.orange[500] : colors.text.secondary}
        />
      )}
      <Text
        style={[
          fontStyle("semibold"),
          {
            flex: 1,
            fontSize: 13,
            fontWeight: fontWeight.semibold,
            color: colors.text.primary,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {selected ? (
        <Ionicons
          name="checkmark-circle"
          size={18}
          color={colors.orange[500]}
        />
      ) : null}
    </TouchableOpacity>
  );
}

function SheetRow({
  label,
  color,
  selected,
  onPress,
}: {
  label: string;
  color: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 14,
        borderRadius: radius.lg,
        backgroundColor: selected
          ? "rgba(255,106,26,0.10)"
          : "transparent",
        marginBottom: 4,
      }}
    >
      {color ? (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            backgroundColor: color,
          }}
        />
      ) : (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            backgroundColor: "rgba(255,255,255,0.04)",
            borderWidth: 1,
            borderColor: colors.border.default,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="layers-outline"
            size={14}
            color={colors.text.secondary}
          />
        </View>
      )}
      <Text
        style={[
          fontStyle("medium"),
          {
            flex: 1,
            fontSize: 14,
            fontWeight: fontWeight.medium,
            color: colors.text.primary,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {selected ? (
        <MonoText
          weight="bold"
          style={{ fontSize: 10, color: colors.orange[500], letterSpacing: 0.8 }}
        >
          SELECTED
        </MonoText>
      ) : null}
    </TouchableOpacity>
  );
}
