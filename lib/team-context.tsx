import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";
import { memberCanManage } from "./team/staff-roles";

export type AvailableTeam = {
  id: string;
  name: string;
  format: string | null;
  color: string | null;
  role: string | null;
  captainViewOnly: boolean;
  // How the user reaches this team. "league_admin" = they administer the
  // team's league but have no direct team_members row — they can still manage.
  via: "team_member" | "league_admin";
};

export type TeamContextValue = {
  teamId: string | null;
  teamName: string | null;
  teamFormat: string | null;
  teamColor: string | null;
  userRole: string | null;
  /** True when the active team role can mutate team data (full-access). */
  canManage: boolean;
  hasTeam: boolean;
  loading: boolean;
  availableTeams: AvailableTeam[];
  selectTeam: (teamId: string) => Promise<void>;
  refreshTeam: () => Promise<void>;
};

const TeamContext = createContext<TeamContextValue | undefined>(undefined);

const SELECTED_TEAM_KEY = "uff:selected-team-id";

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [availableTeams, setAvailableTeams] = useState<AvailableTeam[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reset = useCallback(() => {
    setAvailableTeams([]);
    setTeamId(null);
  }, []);

  // Load every team the user can reach — direct team_members rows PLUS all
  // teams in leagues they administer (league_admin) — then resolve which one
  // is "active": the previously selected team if it's still reachable,
  // otherwise the first one. Mirrors web's getAccessibleTeams so a league
  // admin can select and scope to a team they don't directly belong to
  // (without this, selectTeam silently rejects those teams and every tab
  // falls back to the user's first direct team).
  const loadTeams = useCallback(
    async (userId: string) => {
      const [memberships, adminLeagues] = await Promise.all([
        supabase
          .from("team_members")
          .select("team_id, role, captain_view_only, teams(team_name, format, team_color)")
          .eq("user_id", userId),
        supabase
          .from("league_members")
          .select("league_id")
          .eq("user_id", userId)
          .eq("role", "league_admin"),
      ]);

      if (memberships.error) {
        console.error("[team-context] memberships lookup failed", memberships.error);
        reset();
        return;
      }

      // Direct memberships first — they win over a league-admin entry for the
      // same team (a real role beats the implicit admin one).
      const byId = new Map<string, AvailableTeam>();
      for (const row of memberships.data ?? []) {
        const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
        if (!team || !row.team_id) continue;
        byId.set(row.team_id, {
          id: row.team_id,
          name: team.team_name ?? "Untitled team",
          format: team.format ?? null,
          color: team.team_color ?? null,
          role: row.role ?? null,
          captainViewOnly: (row.captain_view_only as boolean | null) ?? false,
          via: "team_member",
        });
      }

      const adminLeagueIds = (adminLeagues.data ?? [])
        .map((r) => r.league_id as string | null)
        .filter((x): x is string => !!x);

      if (adminLeagueIds.length > 0) {
        const { data: leagueTeams } = await supabase
          .from("teams")
          .select("id, team_name, format, team_color")
          .in("league_id", adminLeagueIds);
        for (const t of leagueTeams ?? []) {
          const id = t.id as string;
          if (byId.has(id)) continue; // direct membership already recorded
          byId.set(id, {
            id,
            name: (t.team_name as string) ?? "Untitled team",
            format: (t.format as string | null) ?? null,
            color: (t.team_color as string | null) ?? null,
            role: null,
            captainViewOnly: false,
            via: "league_admin",
          });
        }
      }

      const next = Array.from(byId.values());
      setAvailableTeams(next);

      if (next.length === 0) {
        setTeamId(null);
        return;
      }

      const stored = await AsyncStorage.getItem(SELECTED_TEAM_KEY).catch(
        () => null,
      );
      const validStored = stored && next.some((t) => t.id === stored)
        ? stored
        : null;
      setTeamId(validStored ?? next[0].id);
    },
    [reset],
  );

  useEffect(() => {
    let cancelled = false;

    if (authLoading) return;

    if (!user) {
      reset();
      setLoading(false);
      return;
    }

    setLoading(true);
    loadTeams(user.id).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, loadTeams, reset]);

  const selectTeam = useCallback(
    async (nextTeamId: string) => {
      // Only honor selections the user actually belongs to — guards against
      // a stale dashboard call selecting a team that was just left/removed.
      const valid = availableTeams.some((t) => t.id === nextTeamId);
      if (!valid) return;
      setTeamId(nextTeamId);
      await AsyncStorage.setItem(SELECTED_TEAM_KEY, nextTeamId).catch(() => {});
    },
    [availableTeams],
  );

  const refreshTeam = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    await loadTeams(user.id);
    setLoading(false);
  }, [user, loadTeams]);

  const active = availableTeams.find((t) => t.id === teamId) ?? null;

  return (
    <TeamContext.Provider
      value={{
        teamId,
        teamName: active?.name ?? null,
        teamFormat: active?.format ?? null,
        teamColor: active?.color ?? null,
        userRole: active?.role ?? null,
        // League admins always manage; direct members only with a full-access
        // role (mirrors web's canManageTeam).
        canManage:
          active?.via === "league_admin" ||
          memberCanManage(active?.role, active?.captainViewOnly),
        hasTeam: !!active,
        loading,
        availableTeams,
        selectTeam,
        refreshTeam,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within a TeamProvider");
  return ctx;
}
