import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontWeight, radius, spacing } from "../../../constants/design";
import { fontStyle, MonoText } from "../../../constants/typography";
import {
  teamColorHex,
  type TeamColorKey,
} from "../../../constants/team-colors";
import { supabase } from "../../../lib/supabase";
import { useTeam } from "../../../lib/team-context";
import { Eyebrow } from "../../../components/ui/Eyebrow";
import { ActionModal, useActionModal } from "../../../components/ui/ActionModal";

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

type LeagueDetail = {
  id: string;
  name: string;
  color: string;
  format: string;
};

type LeagueTeam = {
  id: string;
  name: string;
  color: string;
  format: string;
  players: number;
  lastPractice: string | null;
  status: "active" | "draft";
};

type AssignableTeam = {
  id: string;
  name: string;
  color: string;
  format: string;
};

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function formatLastPractice(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  if (diff < 14) return "1w ago";
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  return target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────

export default function LeagueDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { availableTeams, selectTeam, refreshTeam } = useTeam();
  // App-styled confirm/error modal (replaces native Alert.alert).
  const { show: showModal, showError, modalProps } = useActionModal();
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [teams, setTeams] = useState<LeagueTeam[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    if (!leagueId) return;

    const [leagueRes, teamsRes] = await Promise.all([
      supabase
        .from("leagues")
        .select("id, league_name, format, league_color")
        .eq("id", leagueId)
        .maybeSingle(),
      // RLS already filters to active teams the user is in OR drafts
      // owned by the user (via get_my_team_ids_incl_league post-58).
      // So a draft created by another admin in this league won't leak.
      supabase
        .from("teams")
        .select("id, team_name, format, team_color, status")
        .eq("league_id", leagueId),
    ]);

    if (leagueRes.error) {
      console.warn("[league] load failed:", leagueRes.error.message);
      setLeague(null);
      setTeams([]);
      return;
    }
    if (!leagueRes.data) {
      setLeague(null);
      setTeams([]);
      return;
    }
    setLeague({
      id: leagueRes.data.id,
      name: leagueRes.data.league_name ?? "Untitled league",
      color: teamColorHex(
        leagueRes.data.league_color as TeamColorKey | null,
      ),
      format: leagueRes.data.format ?? "7v7",
    });

    const teamRows = (teamsRes.data ?? []) as Array<{
      id: string;
      team_name: string | null;
      format: string | null;
      team_color: string | null;
      status: string | null;
    }>;

    const teamIds = teamRows.map((r) => r.id);
    const [playersRes, practiceRes] = await Promise.all([
      teamIds.length
        ? supabase
            .from("team_players")
            .select("team_id")
            .in("team_id", teamIds)
            .eq("status", "active")
        : Promise.resolve({ data: [], error: null }),
      teamIds.length
        ? supabase
            .from("practice_plans")
            .select("team_id, practice_date")
            .in("team_id", teamIds)
            .eq("status", "completed")
            .order("practice_date", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    const playerCounts = new Map<string, number>();
    for (const row of (playersRes.data ?? []) as Array<{ team_id: string }>) {
      playerCounts.set(row.team_id, (playerCounts.get(row.team_id) ?? 0) + 1);
    }
    const lastByTeam = new Map<string, string>();
    for (const row of (practiceRes.data ?? []) as Array<{
      team_id: string;
      practice_date: string;
    }>) {
      if (!lastByTeam.has(row.team_id)) {
        lastByTeam.set(row.team_id, row.practice_date);
      }
    }

    const mapped = teamRows.map<LeagueTeam>((r) => ({
      id: r.id,
      name: r.team_name ?? "Untitled team",
      color: teamColorHex(r.team_color as TeamColorKey | null),
      format: r.format ?? "7v7",
      players: playerCounts.get(r.id) ?? 0,
      lastPractice: formatLastPractice(lastByTeam.get(r.id) ?? null),
      status: r.status === "draft" ? "draft" : "active",
    }));
    // Active teams first, drafts at the bottom. Within each group the
    // RLS-returned order is preserved (which is created_at-ish — good
    // enough for now).
    mapped.sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === "draft" ? 1 : -1;
    });
    setTeams(mapped);
  }, [leagueId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Standalone teams the user owns and can move into this league.
  // We use TeamContext.availableTeams (already a join through team_members)
  // and filter out anything already in *this* league. The teams.league_id
  // RLS update in migration 49 lets the UPDATE through for league admins.
  const assignableCandidates = useMemo<AssignableTeam[]>(() => {
    const alreadyIn = new Set(teams.map((t) => t.id));
    return availableTeams
      .filter((t) => !alreadyIn.has(t.id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        color: teamColorHex(t.color as TeamColorKey | null),
        format: t.format ?? "7v7",
      }));
  }, [availableTeams, teams]);

  const onAssign = useCallback(
    async (teamId: string) => {
      if (!leagueId) return;
      const { error } = await supabase
        .from("teams")
        .update({ league_id: leagueId })
        .eq("id", teamId);
      if (error) {
        console.warn("[league] assign failed:", error.message);
        return;
      }
      setSheetOpen(false);
      await load();
    },
    [leagueId, load],
  );

  // Trash-icon → native confirm → cascading delete. RLS DELETE policy
  // from migration 57 gates this; cascading FKs on every team-scoped
  // child table wipe the team's data atomically.
  const confirmDeleteTeam = useCallback(
    (team: LeagueTeam) => {
      showModal({
        title: `Delete ${team.name}?`,
        message:
          "This wipes the team, its roster, drills, practices, benchmarks, and notes. This can't be undone.",
        actions: [
          {
            label: "Delete",
            variant: "destructive",
            onPress: async () => {
              const { error } = await supabase
                .from("teams")
                .delete()
                .eq("id", team.id);
              if (error) {
                showError("Couldn't delete team", error.message);
                return;
              }
              // Refresh the league's team list AND the team context (so
              // the active-team slot drops this team if it was selected).
              await Promise.all([load(), refreshTeam()]);
            },
          },
        ],
      });
    },
    [load, refreshTeam, showModal, showError],
  );

  // League not found OR user lacks access — show a small fallback.
  if (!loading && !league) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          paddingTop: insets.top + 60,
          paddingHorizontal: 24,
          alignItems: "center",
        }}
      >
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={colors.text.muted}
        />
        <Text
          style={[
            fontStyle("semibold"),
            {
              marginTop: 12,
              fontSize: 16,
              fontWeight: fontWeight.semibold,
              color: colors.text.primary,
            },
          ]}
        >
          League not found
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontSize: 13,
            color: colors.text.secondary,
            textAlign: "center",
          }}
        >
          You may not have access, or the league was deleted.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace("/dashboard")}
          style={{
            marginTop: 18,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: radius.md,
            backgroundColor: colors.orange[500],
          }}
        >
          <Text
            style={[
              fontStyle("semibold"),
              {
                color: colors.text.onBrand,
                fontWeight: fontWeight.semibold,
                fontSize: 13,
              },
            ]}
          >
            Back to dashboard
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface.base,
        paddingTop: insets.top,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 18,
          paddingTop: 14,
          paddingBottom: 8,
          gap: 12,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.back()}
          style={{
            height: 36,
            width: 36,
            borderRadius: 12,
            backgroundColor: colors.surface.raised,
            borderWidth: 1,
            borderColor: colors.border.default,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={16} color={colors.text.primary} />
        </TouchableOpacity>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: league?.color ?? colors.orange[500],
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MonoText
              weight="bold"
              style={{
                fontSize: 14,
                color: colors.text.onBrand,
                letterSpacing: -0.6,
              }}
            >
              {(league?.name[0] ?? "L").toUpperCase()}
            </MonoText>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Eyebrow variant="dim">LEAGUE</Eyebrow>
              <MonoText style={{ fontSize: 9.5, color: colors.text.muted }}>
                · ADMIN
              </MonoText>
            </View>
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 17,
                  fontWeight: fontWeight.bold,
                  letterSpacing: -0.2,
                  color: colors.text.primary,
                  marginTop: 1,
                },
              ]}
              numberOfLines={1}
            >
              {league?.name ?? ""}
            </Text>
          </View>
        </View>
      </View>

      {/* Color ribbon */}
      <View style={{ paddingHorizontal: 18, paddingBottom: 16 }}>
        <View
          style={{
            height: 3,
            borderRadius: 2,
            backgroundColor: league?.color ?? colors.orange[500],
            opacity: 0.7,
            width: "100%",
          }}
        />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.orange[500]} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.orange[500]}
            />
          }
        >
          {/* Section header */}
          <View
            style={{
              paddingHorizontal: 22,
              paddingTop: 4,
              paddingBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Eyebrow tick>TEAMS</Eyebrow>
              {teams.length > 0 ? (
                <MonoText
                  style={{ fontSize: 11, color: colors.text.muted }}
                >
                  · {teams.length}
                </MonoText>
              ) : null}
            </View>
            {teams.length > 0 ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSheetOpen(true)}
                style={{
                  height: 34,
                  paddingHorizontal: 12,
                  borderRadius: radius.md,
                  backgroundColor: colors.orange[500],
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Ionicons name="add" size={13} color={colors.text.onBrand} />
                <Text
                  style={[
                    fontStyle("semibold"),
                    {
                      fontSize: 13,
                      fontWeight: fontWeight.semibold,
                      color: colors.text.onBrand,
                    },
                  ]}
                >
                  Add team
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {teams.length === 0 ? (
            <EmptyLeagueState
              leagueName={league?.name ?? "this league"}
              onAddTeam={() => setSheetOpen(true)}
            />
          ) : (
            <View style={{ paddingHorizontal: 16, gap: 10 }}>
              {teams.map((t) => (
                <LeagueTeamRow
                  key={t.id}
                  team={t}
                  onPress={async () => {
                    if (t.status === "draft") {
                      router.push(`/team-setup?draftId=${t.id}`);
                      return;
                    }
                    await selectTeam(t.id);
                    router.push("/");
                  }}
                  onDelete={() => confirmDeleteTeam(t)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <AssignTeamSheet
        visible={sheetOpen}
        candidates={assignableCandidates}
        onClose={() => setSheetOpen(false)}
        onPick={onAssign}
        onCreateNew={() => {
          setSheetOpen(false);
          router.push("/team-setup");
        }}
      />

      <ActionModal {...modalProps} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────

function EmptyLeagueState({
  leagueName,
  onAddTeam,
}: {
  leagueName: string;
  onAddTeam: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
      <View
        style={{
          padding: 22,
          backgroundColor: colors.surface.raised,
          borderRadius: radius.hero,
          borderWidth: 1,
          borderColor: colors.orange.tintBorder,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Eyebrow variant="brand">FIRST TEAM</Eyebrow>
          <View style={{ flex: 1 }} />
          <MonoText style={{ fontSize: 10.5, color: colors.text.secondary }}>
            0 / ∞
          </MonoText>
        </View>

        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 24,
              fontWeight: fontWeight.bold,
              letterSpacing: -0.5,
              color: colors.text.primary,
              lineHeight: 28,
              maxWidth: 300,
            },
          ]}
        >
          No teams yet.{"\n"}Add your first to get started.
        </Text>
        <Text
          style={{
            marginTop: 10,
            fontSize: 14,
            lineHeight: 20,
            color: colors.text.secondary,
            maxWidth: 320,
          }}
        >
          You're the league admin for{" "}
          <Text style={{ color: colors.text.primary }}>{leagueName}</Text>.
          Every team you add inherits your admin access.
        </Text>

        {/* Ghost team slots */}
        <View style={{ marginTop: 18, gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                height: 52,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: colors.border.default,
                borderStyle: "dashed",
                backgroundColor: "rgba(255,255,255,0.015)",
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 14,
                gap: 12,
                opacity: 1 - i * 0.18,
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderWidth: 1,
                  borderColor: colors.border.default,
                }}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <View
                  style={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.border.subtle,
                    width: `${60 - i * 12}%`,
                  }}
                />
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.border.subtle,
                    width: `${40 - i * 8}%`,
                  }}
                />
              </View>
              {i === 0 ? (
                <Text
                  style={{
                    fontSize: 10.5,
                    color: colors.text.muted,
                    letterSpacing: 0.6,
                  }}
                >
                  SLOT
                </Text>
              ) : null}
            </View>
          ))}
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onAddTeam}
          style={{
            marginTop: 18,
            height: 48,
            borderRadius: radius.lg,
            backgroundColor: colors.orange[500],
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 6,
          }}
        >
          <Ionicons name="add" size={14} color={colors.text.onBrand} />
          <Text
            style={[
              fontStyle("semibold"),
              {
                fontSize: 14,
                fontWeight: fontWeight.semibold,
                color: colors.text.onBrand,
              },
            ]}
          >
            Add team
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Team row
// ─────────────────────────────────────────────────────────────────────

function LeagueTeamRow({
  team,
  onPress,
  onDelete,
}: {
  team: LeagueTeam;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const isDraft = team.status === "draft";
  // Outer View so the trash button isn't swallowed by the parent's
  // tap target — mirrors the pattern on /dashboard's TeamRowCard.
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.surface.raised,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border.subtle,
        overflow: "hidden",
      }}
    >
      <View style={{ width: 4, backgroundColor: team.color }} />
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 14,
          gap: 12,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: team.color,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MonoText
            weight="bold"
            style={{
              fontSize: 14,
              color: colors.text.onBrand,
              letterSpacing: -0.6,
            }}
          >
            {team.name[0]?.toUpperCase() ?? "?"}
          </MonoText>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
            }}
          >
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 14.5,
                  fontWeight: fontWeight.bold,
                  letterSpacing: -0.15,
                  color: colors.text.primary,
                  flexShrink: 1,
                },
              ]}
              numberOfLines={1}
            >
              {team.name}
            </Text>
            {isDraft ? (
              <View
                style={{
                  backgroundColor: "rgba(251,191,36,0.14)",
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderRadius: 999,
                }}
              >
                <Text
                  style={{
                    fontSize: 9.5,
                    letterSpacing: 1,
                    color: colors.amber[400],
                    fontWeight: fontWeight.semibold,
                  }}
                >
                  DRAFT
                </Text>
              </View>
            ) : null}
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <MonoText
              style={{ fontSize: 11.5, color: colors.text.secondary }}
            >
              {team.format}
            </MonoText>
            {isDraft ? (
              <>
                <Text style={{ color: colors.text.muted, fontSize: 11.5 }}>
                  ·
                </Text>
                <Text
                  style={{ fontSize: 11.5, color: colors.text.secondary }}
                >
                  Setup in progress
                </Text>
              </>
            ) : (
              <>
                <Text style={{ color: colors.text.muted, fontSize: 11.5 }}>·</Text>
                <Text style={{ fontSize: 11.5, color: colors.text.secondary }}>
                  <Text style={{ color: colors.text.primary }}>{team.players}</Text>{" "}
                  players
                </Text>
              </>
            )}
          </View>
        </View>
        {isDraft ? null : (
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                fontSize: 10.5,
                color: team.lastPractice
                  ? colors.text.secondary
                  : colors.text.muted,
                letterSpacing: 0.2,
              }}
            >
              {team.lastPractice ?? "No practice yet"}
            </Text>
          </View>
        )}
      </TouchableOpacity>
      {onDelete ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${team.name}`}
          hitSlop={6}
          style={{
            width: 48,
            alignItems: "center",
            justifyContent: "center",
            borderLeftWidth: 1,
            borderLeftColor: colors.border.subtle,
          }}
        >
          <Ionicons
            name="trash-outline"
            size={16}
            color={colors.error}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Assign-team sheet
// ─────────────────────────────────────────────────────────────────────
//
// Lists the user's existing standalone teams (anything not already in
// this league). Picking one runs UPDATE teams SET league_id = X. There's
// also a "Create a new team" shortcut that routes to /team-setup; once
// the smart-picker form lands (workflow §6.4) that flow can pre-fill the
// league id from URL state.

function AssignTeamSheet({
  visible,
  candidates,
  onClose,
  onPick,
  onCreateNew,
}: {
  visible: boolean;
  candidates: AssignableTeam[];
  onClose: () => void;
  onPick: (teamId: string) => void | Promise<void>;
  onCreateNew: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
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
            padding: 22,
            shadowColor: "#000",
            shadowOpacity: 0.5,
            shadowRadius: 60,
            shadowOffset: { width: 0, height: 20 },
            elevation: 16,
          }}
        >
          {/* Drag handle */}
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border.default,
              alignSelf: "center",
              marginBottom: 18,
            }}
          />

          <Eyebrow tick variant="dim">
            ADD TEAM
          </Eyebrow>
          <Text
            style={[
              fontStyle("bold"),
              {
                marginTop: 14,
                fontSize: 20,
                fontWeight: fontWeight.bold,
                letterSpacing: -0.3,
                color: colors.text.primary,
              },
            ]}
          >
            Add a team to this league
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 13,
              lineHeight: 18,
              color: colors.text.secondary,
            }}
          >
            Pick from teams you already manage, or create a new one.
          </Text>

          <View style={{ marginTop: 16, gap: 8 }}>
            {candidates.length === 0 ? (
              <View
                style={{
                  padding: 14,
                  backgroundColor: "rgba(255,255,255,0.025)",
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border.subtle,
                }}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    color: colors.text.secondary,
                    lineHeight: 18,
                  }}
                >
                  No other teams to add. Create a new one and it'll land in
                  this league.
                </Text>
              </View>
            ) : (
              candidates.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  activeOpacity={0.85}
                  onPress={() => onPick(c.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surface.overlay,
                    borderWidth: 1,
                    borderColor: colors.border.subtle,
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: c.color,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MonoText
                      weight="bold"
                      style={{
                        fontSize: 13,
                        color: colors.text.onBrand,
                        letterSpacing: -0.6,
                      }}
                    >
                      {c.name[0]?.toUpperCase() ?? "?"}
                    </MonoText>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[
                        fontStyle("semibold"),
                        {
                          fontSize: 14,
                          fontWeight: fontWeight.semibold,
                          color: colors.text.primary,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    <MonoText
                      style={{ fontSize: 11, color: colors.text.secondary }}
                    >
                      {c.format}
                    </MonoText>
                  </View>
                  <Ionicons
                    name="add-circle"
                    size={22}
                    color={colors.orange[500]}
                  />
                </TouchableOpacity>
              ))
            )}
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onCreateNew}
            style={{
              marginTop: 14,
              height: 48,
              borderRadius: radius.lg,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border.default,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Ionicons name="add" size={14} color={colors.text.primary} />
            <Text
              style={[
                fontStyle("semibold"),
                {
                  fontSize: 14,
                  fontWeight: fontWeight.semibold,
                  color: colors.text.primary,
                },
              ]}
            >
              Create a new team
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onClose}
            style={{ alignSelf: "center", marginTop: 12, padding: 6 }}
          >
            <Text style={{ fontSize: 12, color: colors.text.muted }}>
              Cancel
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

void spacing;
void Platform;
