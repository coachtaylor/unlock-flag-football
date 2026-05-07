import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";

export type TeamContextValue = {
  teamId: string | null;
  teamName: string | null;
  userRole: string | null;
  hasTeam: boolean;
  loading: boolean;
  refreshTeam: () => Promise<void>;
};

const TeamContext = createContext<TeamContextValue | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [hasTeam, setHasTeam] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadTeam = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("team_members")
      .select("team_id, role, teams(team_name)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[team-context] membership lookup failed", error);
      setTeamId(null);
      setTeamName(null);
      setUserRole(null);
      setHasTeam(false);
      return;
    }

    if (data) {
      const teams = data.teams as
        | { team_name: string }
        | { team_name: string }[]
        | null;
      const name = Array.isArray(teams) ? teams[0]?.team_name : teams?.team_name;
      setTeamId(data.team_id);
      setTeamName(name ?? null);
      setUserRole(data.role);
      setHasTeam(true);
    } else {
      setTeamId(null);
      setTeamName(null);
      setUserRole(null);
      setHasTeam(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (authLoading) return;

    if (!user) {
      setTeamId(null);
      setTeamName(null);
      setUserRole(null);
      setHasTeam(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    loadTeam(user.id).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, loadTeam]);

  const refreshTeam = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    await loadTeam(user.id);
    setLoading(false);
  }, [user, loadTeam]);

  return (
    <TeamContext.Provider
      value={{ teamId, teamName, userRole, hasTeam, loading, refreshTeam }}
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
