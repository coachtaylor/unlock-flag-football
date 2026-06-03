// Team-invite actions — mobile mirror of the web invite-actions (Build 16.5).
// Thin wrappers over the SECURITY DEFINER RPCs in migrations 81/84/85. Mobile
// has no clickable /join URL, so the recipient pastes the link or token into
// the join flow (extractInviteToken parses either). Uses the shared supabase
// singleton.

import { supabase } from "../supabase";
import type { InviteRole } from "./staff-roles";

// Where invite links point (the web app). The token is what actually matters;
// mobile recipients paste the whole URL and we extract the token from it.
export const INVITE_LINK_BASE = "https://unlockflagfootball.com/join";

export function inviteLink(token: string): string {
  return `${INVITE_LINK_BASE}/${token}`;
}

// Accept a pasted invite link OR a bare token. Invite tokens are two
// concatenated uuid hexes (64 hex chars); we pull the last non-empty path
// segment of a URL, or trim a raw paste.
export function extractInviteToken(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  // Strip query/hash, then take the last path segment.
  const noQuery = raw.split(/[?#]/)[0];
  const segments = noQuery.split("/").filter(Boolean);
  const candidate = segments.length > 0 ? segments[segments.length - 1] : raw;
  return /^[a-f0-9]{16,}$/i.test(candidate) ? candidate : null;
}

type CreateResult = { ok: true; token: string } | { ok: false; error: string };

export async function createInvite(input: {
  teamId: string;
  role: InviteRole;
  specialties?: string[];
  label?: string | null;
  expiresInDays?: number | null;
  playerId?: string | null;
}): Promise<CreateResult> {
  let expiresAt: string | null = null;
  if (input.expiresInDays && input.expiresInDays > 0) {
    expiresAt = new Date(
      Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  const { data, error } = await supabase.rpc("create_team_invite", {
    p_team_id: input.teamId,
    p_role: input.role,
    p_specialties: input.role === "assistant_coach" ? input.specialties ?? [] : [],
    p_label: input.label ?? null,
    p_expires_at: expiresAt,
    p_player_id: input.playerId ?? null,
  });
  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  const token = (row as { token?: string } | null)?.token;
  if (!token) return { ok: false, error: "Invite created but no link returned." };
  return { ok: true, token };
}

export async function revokeInvite(inviteId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("revoke_team_invite", { p_invite_id: inviteId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

type RedeemResult = { ok: true; teamId: string } | { ok: false; error: string };

export async function redeemInvite(token: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc("redeem_team_invite", { p_token: token });
  if (error) return { ok: false, error: error.message };
  const teamId = (data as string) ?? null;
  if (!teamId) return { ok: false, error: "Could not join the team." };
  return { ok: true, teamId };
}

export type PendingInvite = {
  id: string;
  token: string;
  role: InviteRole;
  specialties: string[];
  label: string | null;
  expiresAt: string | null;
};

export async function loadPendingInvites(teamId: string): Promise<PendingInvite[]> {
  const { data, error } = await supabase
    .from("team_invites")
    .select("id, token, role, coach_specialties, invitee_label, expires_at")
    .eq("team_id", teamId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[invites] load pending:", error.message);
    return [];
  }
  const now = Date.now();
  return (data ?? [])
    .filter((r) => !r.expires_at || new Date(r.expires_at as string).getTime() > now)
    .map((r) => ({
      id: r.id as string,
      token: r.token as string,
      role: r.role as InviteRole,
      specialties: (r.coach_specialties as string[] | null) ?? [],
      label: (r.invitee_label as string | null) ?? null,
      expiresAt: (r.expires_at as string | null) ?? null,
    }));
}
