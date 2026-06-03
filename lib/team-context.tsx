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
import { isFullAccess } from "./team/staff-roles";

export type AvailableTeam = {
  id: string;
  name: string;
  format: string | null;
  color: string | null;
  role: string | null;
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

  // Load all team memberships for the user, then resolve which one is
  // "active" — the previously selected team if it's still a valid
  // membership, otherwise the first one. The active team id flows through
  // the rest of the app via the existing `teamId` field.
  const loadTeams = useCallback(
    async (userId: string) => {
      const { data, error } = await supabase
        .from("team_members")
        .select("team_id, role, teams(team_name, format, team_color)")
        .eq("user_id", userId);

      if (error) {
        console.error("[team-context] memberships lookup failed", error);
        reset();
        return;
      }

      const next: AvailableTeam[] = (data ?? []).flatMap((row) => {
        const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
        if (!team || !row.team_id) return [];
        return [
          {
            id: row.team_id,
            name: team.team_name ?? "Untitled team",
            format: team.format ?? null,
            color: team.team_color ?? null,
            role: row.role ?? null,
          },
        ];
      });

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
        canManage: isFullAccess(active?.role),
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
