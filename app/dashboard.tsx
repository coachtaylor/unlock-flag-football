import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  colors,
  fontWeight,
  radius,
  spacing,
  tracking,
} from "../constants/design";
import { fontStyle, MonoText } from "../constants/typography";
import { teamColorHex, type TeamColorKey } from "../constants/team-colors";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";
import { useTeam } from "../lib/team-context";
import { memberRoleLabel } from "../lib/team/staff-roles";
import { Eyebrow } from "../components/ui/Eyebrow";
import { ActionModal, useActionModal } from "../components/ui/ActionModal";
import { BackfillModal, shouldShowBackfill } from "../components/BackfillModal";

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

type LeagueRow = {
  id: string;
  name: string;
  color: string;
  format: string;
  teams: number;
  members: number;
};

type TeamRow = {
  id: string;
  name: string;
  color: string;
  format: string;
  role: "coach" | "captain" | "assistant";
  players: number;
  lastPractice: string | null;
  leagueId: string | null;
  // 'draft' rows come from the user-created draft pile; they have no
  // team_members link yet, so tap behavior and meta-row copy diverge.
  status: "active" | "draft";
};

// ─────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────

// Format a YYYY-MM-DD practice date relative to today.
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

async function fetchMyTeams(userId: string): Promise<TeamRow[]> {
  // Pre-migration-49: `teams.league_id` doesn't exist. Try the new select
  // first; if Postgres reports the missing column, fall back to the
  // pre-49 select so the screen keeps rendering.
  let { data, error } = await supabase
    .from("team_members")
    .select(
      "role, team_id, teams(id, team_name, format, team_color, league_id)"
    )
    .eq("user_id", userId);

  if (error && error.code === "42703") {
    const fallback = await supabase
      .from("team_members")
      .select("role, team_id, teams(id, team_name, format, team_color)")
      .eq("user_id", userId);
    // Pre-49 shape has no league_id — cast through to the broader type.
    // We access league_id via a safe cast below so the missing field is
    // a no-op rather than a runtime error.
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) {
    console.warn("[dashboard] team_members load failed:", error.message);
    return [];
  }
  if (!data) return [];

  // Pull aux counts in parallel — keeps the screen responsive on small rosters.
  const teamIds = data
    .map((r) => r.team_id)
    .filter((id): id is string => typeof id === "string");

  const [playersRes, practiceRes, captainRes] = await Promise.all([
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
    // A user who is a captain-player on a team should read as "Captain" here,
    // even when their app-access role is team_manager (a view-only captain).
    // Their captain identity lives on team_players.is_captain. Mirrors the
    // web getUserHomeData() override.
    teamIds.length
      ? supabase
          .from("team_players")
          .select("team_id")
          .in("team_id", teamIds)
          .eq("user_id", userId)
          .eq("is_captain", true)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const captainTeamIds = new Set(
    ((captainRes.data ?? []) as Array<{ team_id: string }>).map((r) => r.team_id),
  );

  const playerCounts = new Map<string, number>();
  for (const row of (playersRes.data ?? []) as Array<{ team_id: string }>) {
    playerCounts.set(row.team_id, (playerCounts.get(row.team_id) ?? 0) + 1);
  }
  const lastPractice = new Map<string, string>();
  for (const row of (practiceRes.data ?? []) as Array<{
    team_id: string;
    practice_date: string;
  }>) {
    if (!lastPractice.has(row.team_id)) {
      lastPractice.set(row.team_id, row.practice_date);
    }
  }

  const activeTeams: TeamRow[] = data.flatMap((row) => {
    const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
    if (!team || !row.team_id) return [];
    // league_id only present post-migration-49; safely access via cast.
    const leagueId = (team as { league_id?: string | null }).league_id ?? null;
    return [
      {
        id: row.team_id,
        name: team.team_name ?? "Untitled team",
        color: teamColorHex(team.team_color as TeamColorKey | null),
        format: team.format ?? "7v7",
        role: captainTeamIds.has(row.team_id)
          ? "captain"
          : (row.role as TeamRow["role"]) ?? "coach",
        players: playerCounts.get(row.team_id) ?? 0,
        lastPractice: formatLastPractice(
          lastPractice.get(row.team_id) ?? null,
        ),
        leagueId,
        status: "active",
      },
    ];
  });

  // Drafts: pulled separately because they have no team_members row.
  // RLS still permits the read via the get_my_team_ids_incl_league
  // helper's draft branch (migration 58). Status/creator_role columns
  // may not exist on stale projects — return [] gracefully if so.
  const draftRes = await supabase
    .from("teams")
    .select("id, team_name, format, team_color, league_id, creator_role")
    .eq("created_by", userId)
    .eq("status", "draft");

  if (draftRes.error) {
    if (draftRes.error.code !== "42703" && draftRes.error.code !== "PGRST204") {
      console.warn("[dashboard] drafts load failed:", draftRes.error.message);
    }
    return activeTeams;
  }

  const draftTeams: TeamRow[] = (draftRes.data ?? []).map((row) => {
    const r = row as {
      id: string;
      team_name: string | null;
      format: string | null;
      team_color: string | null;
      league_id: string | null;
      creator_role: string | null;
    };
    return {
      id: r.id,
      name:
        r.team_name && r.team_name !== "Untitled team"
          ? r.team_name
          : "Untitled team",
      color: teamColorHex(r.team_color as TeamColorKey | null),
      format: r.format ?? "7v7",
      role: (r.creator_role as TeamRow["role"]) ?? "captain",
      players: 0,
      lastPractice: null,
      leagueId: r.league_id,
      status: "draft",
    };
  });

  // Drafts at the bottom so the user's "real" teams stay at eye level.
  return [...activeTeams, ...draftTeams];
}

// Leagues table may not exist yet (migrations 47–52 unapplied). Catch the
// "relation does not exist" error and return [] so the section just hides.
async function fetchMyLeagues(userId: string): Promise<LeagueRow[]> {
  const { data, error } = await supabase
    .from("league_members")
    .select("league_id, leagues(id, league_name, format, league_color)")
    .eq("user_id", userId);

  if (error) {
    // 42P01 = undefined_table — expected pre-migration. Anything else is real.
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.warn("[dashboard] league_members load failed:", error.message);
    }
    return [];
  }
  if (!data || data.length === 0) return [];

  const leagueIds = data
    .map((r) => r.league_id)
    .filter((id): id is string => typeof id === "string");

  const [teamCountsRes, memberCountsRes] = await Promise.all([
    supabase
      .from("teams")
      .select("league_id")
      .in("league_id", leagueIds),
    supabase
      .from("league_members")
      .select("league_id")
      .in("league_id", leagueIds),
  ]);

  const teamCounts = new Map<string, number>();
  for (const row of (teamCountsRes.data ?? []) as Array<{
    league_id: string;
  }>) {
    teamCounts.set(row.league_id, (teamCounts.get(row.league_id) ?? 0) + 1);
  }
  const memberCounts = new Map<string, number>();
  for (const row of (memberCountsRes.data ?? []) as Array<{
    league_id: string;
  }>) {
    memberCounts.set(
      row.league_id,
      (memberCounts.get(row.league_id) ?? 0) + 1,
    );
  }

  return data.flatMap((row) => {
    const league = Array.isArray(row.leagues) ? row.leagues[0] : row.leagues;
    if (!league || !row.league_id) return [];
    return [
      {
        id: row.league_id,
        name: league.league_name ?? "Untitled league",
        color: teamColorHex(league.league_color as TeamColorKey | null),
        format: league.format ?? "7v7",
        teams: teamCounts.get(row.league_id) ?? 0,
        members: memberCounts.get(row.league_id) ?? 0,
      },
    ];
  });
}

async function fetchProfile(
  userId: string,
): Promise<{ firstName: string; initial: string }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, first_name, last_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // Pre-migration: first_name/last_name don't exist; fall back to display_name only.
    if (error.code === "42703") {
      const fallback = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      const name = fallback.data?.display_name?.trim() || "Coach";
      const first = name.split(/\s+/)[0] ?? name;
      return { firstName: first, initial: first[0]?.toUpperCase() ?? "U" };
    }
    console.warn("[dashboard] profile load failed:", error.message);
    return { firstName: "Coach", initial: "U" };
  }
  const profile = data as
    | { display_name?: string | null; first_name?: string | null; last_name?: string | null }
    | null;
  const first =
    profile?.first_name?.trim() ||
    profile?.display_name?.trim().split(/\s+/)[0] ||
    "Coach";
  return { firstName: first, initial: first[0]?.toUpperCase() ?? "U" };
}

// ─────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────

export default function UserDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { selectTeam, refreshTeam } = useTeam();
  // App-styled confirm/error modal (replaces native Alert.alert).
  const { show: showModal, showError, modalProps } = useActionModal();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [firstName, setFirstName] = useState("Coach");
  const [initial, setInitial] = useState("U");
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [backfillOpen, setBackfillOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [profile, myLeagues, myTeams, needsBackfill] = await Promise.all([
      fetchProfile(user.id),
      fetchMyLeagues(user.id),
      fetchMyTeams(user.id),
      shouldShowBackfill(user.id),
    ]);
    setFirstName(profile.firstName);
    setInitial(profile.initial);
    setLeagues(myLeagues);
    setBackfillOpen(needsBackfill);
    // Teams in one of the user's leagues live on the league dashboard, not
    // here. Pre-migration-49 every team has leagueId = null so this filter
    // is a no-op; post-49 it correctly hides league-bound teams.
    const myLeagueIds = new Set(myLeagues.map((l) => l.id));
    setTeams(
      myTeams.filter((t) => !t.leagueId || !myLeagueIds.has(t.leagueId)),
    );
  }, [user]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Refetch on focus so leagues/teams created elsewhere (e.g. the create-league
  // flow, which redirects to the league dashboard) show up when the user pops
  // back to account home instead of requiring a manual pull-to-refresh.
  // Skip the very first focus — the mount effect above already fires `load`.
  const didMountRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!didMountRef.current) {
        didMountRef.current = true;
        return;
      }
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Long-press → native destructive confirm → cascading delete. Lives
  // here (not in the row component) so we can reuse `load` + the team
  // context's refreshTeam after the row is gone. Cascades on every
  // team-scoped child FK clean up the team's data; RLS DELETE policy
  // from migration 57 gates who can do it.
  const confirmDeleteTeam = useCallback(
    (team: TeamRow) => {
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
              // Refresh dashboard list AND the team context (so the
              // active-team slot promotes the next membership, or clears
              // if this was the last one).
              await Promise.all([load(), refreshTeam()]);
            },
          },
        ],
      });
    },
    [load, refreshTeam, showModal, showError],
  );

  const isEmpty = leagues.length === 0 && teams.length === 0;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface.base,
        paddingTop: insets.top,
      }}
    >
      {/* ── Top bar: greeting + avatar ───────────────────────── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 18,
          paddingTop: 14,
          paddingBottom: 4,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow variant="dim">UFF · ACCOUNT HOME</Eyebrow>
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 24,
                fontWeight: fontWeight.bold,
                letterSpacing: -0.5,
                color: colors.text.primary,
                marginTop: 2,
              },
            ]}
            numberOfLines={1}
          >
            Hi {firstName}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push("/settings")}
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
            <Ionicons
              name="notifications-outline"
              size={16}
              color={colors.text.primary}
            />
          </TouchableOpacity>
          <View
            style={{
              height: 36,
              width: 36,
              borderRadius: 12,
              backgroundColor: colors.orange[500],
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={[
                fontStyle("bold"),
                {
                  fontSize: 13,
                  fontWeight: fontWeight.bold,
                  color: colors.text.onBrand,
                },
              ]}
            >
              {initial}
            </Text>
          </View>
        </View>
      </View>

      {/* Hairline divider */}
      <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4 }}>
        <View style={{ height: 1, backgroundColor: colors.border.subtle }} />
      </View>

      {loading ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
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
          {isEmpty ? (
            <UserDashboardEmpty
              onNewLeague={() => router.push("/onboarding/create-league")}
              onNewTeam={() => router.push("/team-setup")}
            />
          ) : (
            <>
              {leagues.length > 0 && (
                <Section
                  label="My leagues"
                  count={leagues.length}
                  cta={
                    <SecondaryCTA
                      onPress={() =>
                        router.push("/onboarding/create-league")
                      }
                      label="New league"
                    />
                  }
                >
                  {leagues.map((l) => (
                    <LeagueRowCard
                      key={l.id}
                      league={l}
                      onPress={() =>
                        router.push(`/dashboard/league/${l.id}`)
                      }
                    />
                  ))}
                </Section>
              )}

              {/* Standalone-team users have no path to create a league once
                  they're past the empty state. Surface a compact prompt so
                  the option stays discoverable. */}
              {leagues.length === 0 && teams.length > 0 && (
                <CreateLeaguePrompt
                  onPress={() => router.push("/onboarding/create-league")}
                />
              )}

              {teams.length > 0 && (
                <Section
                  label="My teams"
                  count={teams.length}
                  cta={
                    <PrimaryCTA
                      onPress={() => router.push("/team-setup")}
                      label="Add team"
                    />
                  }
                >
                  {teams.map((t) => (
                    <TeamRowCard
                      key={t.id}
                      team={t}
                      onPress={async () => {
                        if (t.status === "draft") {
                          // Resume editing the draft. team-setup loads
                          // by id, then debounced upsert keeps writing
                          // to the same row.
                          router.push(`/team-setup?draftId=${t.id}`);
                          return;
                        }
                        await selectTeam(t.id);
                        router.push("/");
                      }}
                      onDelete={() => confirmDeleteTeam(t)}
                    />
                  ))}
                </Section>
              )}

              {/* Hint when leagues-only — clarifies why league teams aren't listed below. */}
              {leagues.length > 0 && teams.length === 0 && (
                <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      padding: 14,
                      backgroundColor: "rgba(255,255,255,0.025)",
                      borderWidth: 1,
                      borderColor: colors.border.subtle,
                      borderRadius: radius.lg,
                    }}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={14}
                      color={colors.orange[500]}
                      style={{ marginTop: 1 }}
                    />
                    <Text
                      style={{
                        flex: 1,
                        color: colors.text.secondary,
                        fontSize: 12,
                        lineHeight: 17,
                      }}
                    >
                      Teams inside your leagues live on each league's
                      dashboard — open a league to see them.
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {user ? (
        <BackfillModal
          visible={backfillOpen}
          userId={user.id}
          onSaved={async () => {
            setBackfillOpen(false);
            // Refresh greeting + initial so the new name shows immediately.
            const profile = await fetchProfile(user.id);
            setFirstName(profile.firstName);
            setInitial(profile.initial);
          }}
        />
      ) : null}

      <ActionModal {...modalProps} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────────────

function Section({
  label,
  count,
  cta,
  children,
}: {
  label: string;
  count: number;
  cta: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 2,
          paddingBottom: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Eyebrow tick>{label}</Eyebrow>
          <MonoText
            style={{
              fontSize: 11,
              color: colors.text.muted,
            }}
          >
            · {count}
          </MonoText>
        </View>
        {cta}
      </View>
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  );
}

function PrimaryCTA({
  onPress,
  label,
}: {
  onPress: () => void;
  label: string;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        height: 32,
        paddingHorizontal: 11,
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
            color: colors.text.onBrand,
            fontSize: 12.5,
            fontWeight: fontWeight.semibold,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SecondaryCTA({
  onPress,
  label,
}: {
  onPress: () => void;
  label: string;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{
        paddingHorizontal: 4,
        paddingVertical: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      <Ionicons name="add" size={13} color={colors.text.primary} />
      <Text
        style={[
          fontStyle("semibold"),
          {
            color: colors.text.primary,
            fontSize: 12.5,
            fontWeight: fontWeight.semibold,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Row cards
// ─────────────────────────────────────────────────────────────────────

function LeagueRowCard({
  league,
  onPress,
}: {
  league: LeagueRow;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flexDirection: "row",
        backgroundColor: colors.surface.raised,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border.subtle,
        overflow: "hidden",
      }}
    >
      {/* Left color rail */}
      <View style={{ width: 4, backgroundColor: league.color }} />
      <View
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
            width: 42,
            height: 42,
            borderRadius: 11,
            backgroundColor: league.color,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MonoText
            weight="bold"
            style={{
              fontSize: 15,
              color: colors.text.onBrand,
              letterSpacing: -0.6,
            }}
          >
            {league.name[0]?.toUpperCase() ?? "?"}
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
              {league.name}
            </Text>
            <View
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 999,
              }}
            >
              <Text
                style={{
                  fontSize: 9.5,
                  letterSpacing: 1,
                  color: colors.text.secondary,
                  fontWeight: fontWeight.semibold,
                }}
              >
                LEAGUE
              </Text>
            </View>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <MonoText
              style={{ fontSize: 11.5, color: colors.text.secondary }}
            >
              {league.format}
            </MonoText>
            <Text style={{ color: colors.text.muted, fontSize: 11.5 }}>·</Text>
            <Text
              style={{
                fontSize: 11.5,
                color: colors.text.secondary,
              }}
            >
              <Text style={{ color: colors.text.primary }}>
                {league.teams}
              </Text>{" "}
              teams
            </Text>
            <Text style={{ color: colors.text.muted, fontSize: 11.5 }}>·</Text>
            <Text
              style={{
                fontSize: 11.5,
                color: colors.text.secondary,
              }}
            >
              <Text style={{ color: colors.text.primary }}>
                {league.members}
              </Text>{" "}
              members
            </Text>
          </View>
        </View>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={colors.text.secondary}
        />
      </View>
    </TouchableOpacity>
  );
}

function TeamRowCard({
  team,
  onPress,
  onDelete,
}: {
  team: TeamRow;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const isDraft = team.status === "draft";
  // Pill color: drafts get an amber "in-progress" treatment; active
  // teams keep the lime-vs-orange captain/coach distinction.
  const pillLabel = isDraft ? "DRAFT" : memberRoleLabel(team.role);
  const pillColor = isDraft
    ? colors.amber[400]
    : team.role === "captain"
      ? colors.lime[400]
      : colors.orange[500];
  const pillBg = isDraft
    ? "rgba(251,191,36,0.14)"
    : team.role === "captain"
      ? "rgba(194,255,61,0.12)"
      : "rgba(255,106,26,0.14)";
  // Card is a row of two press targets: the main area opens the team,
  // the trash button on the right deletes. The outer View is plain so
  // the trash press isn't swallowed by the parent TouchableOpacity.
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
            width: 42,
            height: 42,
            borderRadius: 11,
            backgroundColor: team.color,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MonoText
            weight="bold"
            style={{
              fontSize: 15,
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
            <View
              style={{
                backgroundColor: pillBg,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 999,
              }}
            >
              <Text
                style={{
                  fontSize: 9.5,
                  letterSpacing: 1,
                  color: pillColor,
                  fontWeight: fontWeight.semibold,
                }}
              >
                {pillLabel}
              </Text>
            </View>
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
                {team.lastPractice ? (
                  <>
                    <Text style={{ color: colors.text.muted, fontSize: 11.5 }}>
                      ·
                    </Text>
                    <Text
                      style={{ fontSize: 11.5, color: colors.text.secondary }}
                    >
                      {team.lastPractice}
                    </Text>
                  </>
                ) : null}
              </>
            )}
          </View>
        </View>
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
// Create-league prompt (shown when user has teams but no leagues)
// ─────────────────────────────────────────────────────────────────────

function CreateLeaguePrompt({ onPress }: { onPress: () => void }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 14,
          backgroundColor: colors.surface.raised,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.orange.tintBorder,
          borderStyle: "dashed",
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: colors.orange.tint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="trophy-outline"
            size={18}
            color={colors.orange[500]}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 13.5,
                fontWeight: fontWeight.bold,
                letterSpacing: -0.1,
                color: colors.text.primary,
              },
            ]}
          >
            Start a league
          </Text>
          <Text
            style={{
              fontSize: 11.5,
              lineHeight: 15,
              color: colors.text.secondary,
            }}
          >
            Group multiple teams together and run them as one.
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={colors.text.secondary}
        />
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────

function UserDashboardEmpty({
  onNewLeague,
  onNewTeam,
}: {
  onNewLeague: () => void;
  onNewTeam: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24 }}>
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
        <Eyebrow variant="brand">EMPTY ACCOUNT</Eyebrow>
        <Text
          style={[
            fontStyle("bold"),
            {
              marginTop: 12,
              fontSize: 22,
              fontWeight: fontWeight.bold,
              letterSpacing: -0.5,
              color: colors.text.primary,
              lineHeight: 26,
              maxWidth: 300,
            },
          ]}
        >
          You're not in any leagues or teams yet.
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
          Create one to get started. You can always add more later.
        </Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onNewLeague}
            style={{
              flex: 1,
              height: 48,
              borderRadius: radius.lg,
              backgroundColor: colors.orange[500],
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Ionicons name="add" size={14} color={colors.text.onBrand} />
            <Text
              style={[
                fontStyle("semibold"),
                {
                  fontSize: 14,
                  color: colors.text.onBrand,
                  fontWeight: fontWeight.semibold,
                },
              ]}
            >
              New league
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onNewTeam}
            style={{
              flex: 1,
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
                  color: colors.text.primary,
                  fontWeight: fontWeight.semibold,
                },
              ]}
            >
              New team
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={{
            marginTop: 18,
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: colors.border.subtle,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <Ionicons
            name="flash-outline"
            size={12}
            color={colors.orange[500]}
            style={{ marginTop: 2 }}
          />
          <Text
            style={{
              flex: 1,
              fontSize: 11.5,
              lineHeight: 17,
              color: colors.text.secondary,
            }}
          >
            Not sure? Most coaches start with a single team. League admins
            manage many.
          </Text>
        </View>
      </View>
    </View>
  );
}

// spacing/tracking imported for downstream extension; suppress unused warnings
void spacing;
void tracking;
