// Coaching-staff role taxonomy — mobile mirror of the web
// src/lib/team/staff-roles.ts (Build 16.5). Single source of truth for the
// team_members staff roles so a role reads identically across the roster
// staff section, coach profiles, and the invite UI.
//
// Mirrors the DB CHECK from migration 78. team_members.role can also hold
// 'captain' (player-leaders, shown in the players list) and the legacy
// 'coach'/'assistant' values. Access tiers match get_my_writable_team_ids()
// (migration 79): head_coach / assistant_coach / captain (+ legacy coach)
// can write; team_manager is view-only.
//
// Colors are concrete hex from constants/design (web uses CSS vars).

import { colors } from "../../constants/design";

export type StaffRole = "head_coach" | "assistant_coach" | "team_manager";
export type MemberRole = StaffRole | "captain" | "coach" | "assistant";

export const STAFF_ROLES: StaffRole[] = [
  "head_coach",
  "assistant_coach",
  "team_manager",
];

// Roles that may mutate team data. Keep in lockstep with
// get_my_writable_team_ids() (migration 79).
const FULL_ACCESS_ROLES: MemberRole[] = [
  "head_coach",
  "assistant_coach",
  "captain",
  "coach",
];

export function isFullAccess(role: string | null | undefined): boolean {
  return !!role && (FULL_ACCESS_ROLES as string[]).includes(role);
}

// Whether a membership can mutate team data. A captain (role 'captain') is
// full-access UNLESS flagged view-only — the app-side mirror of
// get_my_writable_team_ids() (migration 90). Use this for every canManage
// derivation instead of isFullAccess(role) alone, so a view-only captain is
// never handed write controls. (RLS is the real gate; this keeps the UI
// honest.) Kept in sync with the web src/lib/team/staff-roles.ts copy.
export function memberCanManage(
  role: string | null | undefined,
  captainViewOnly?: boolean | null,
): boolean {
  if (!isFullAccess(role)) return false;
  if (role === "captain" && captainViewOnly) return false;
  return true;
}

export type AccessTier = "full" | "view";

export type StaffRoleMeta = {
  id: StaffRole;
  label: string;
  access: AccessTier;
  accessLabel: string;
  hint: string;
  color: string;
};

// Labels are Title Case so a role reads identically everywhere — the coach
// detail/edit screens, the staff section, the invite sheet, and the
// account-home pill (which derives from memberRoleLabel()).
export const STAFF_ROLE_META: Record<StaffRole, StaffRoleMeta> = {
  head_coach: {
    id: "head_coach",
    label: "Head Coach",
    access: "full",
    accessLabel: "Full access",
    hint: "Runs the team. Full access to everything.",
    color: colors.orange[500],
  },
  assistant_coach: {
    id: "assistant_coach",
    label: "Assistant Coach",
    access: "full",
    accessLabel: "Full access",
    hint: "Helps run sessions. Full access. Optional offense/defense focus.",
    color: colors.blue[400],
  },
  team_manager: {
    id: "team_manager",
    label: "Team Manager",
    access: "view",
    accessLabel: "View only",
    hint: "Trainer or manager. Can see everything, can't make changes.",
    color: colors.text.muted,
  },
};

// When a team has more than one head coach, each is a "Co-Head Coach".
export function headCoachLabel(headCount: number): string {
  return headCount > 1 ? "Co-Head Coach" : "Head Coach";
}

export function staffRoleLabel(role: StaffRole, headCount: number): string {
  if (role === "head_coach") return headCoachLabel(headCount);
  return STAFF_ROLE_META[role].label;
}

// Human-readable label for ANY team_members.role value (incl. captain +
// legacy coach/assistant) — never show the raw enum. Generic underscore →
// Title Case so new roles read correctly without a lookup table:
// "head_coach" → "Head Coach", "team_manager" → "Team Manager".
export function memberRoleLabel(role: string | null | undefined): string {
  if (!role) return "Member";
  return role
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export const SPECIALTY_LABELS: Record<string, string> = {
  offense: "Offense",
  defense: "Defense",
};

export function specialtyLabel(s: string): string {
  return SPECIALTY_LABELS[s] ?? s;
}

// ── Invite roles ──────────────────────────────────────────────────────
// Invites can grant any staff role OR captain (a player-leader added to the
// roster). One source of truth for the invite picker + the pending list.

export type InviteRole = StaffRole | "captain";

export const INVITE_ROLES: InviteRole[] = [...STAFF_ROLES, "captain"];

const CAPTAIN_INVITE_META = {
  label: "Captain",
  accessLabel: "Full access",
  access: "full" as AccessTier,
  hint: "Player-leader. Full access; also added to the roster as a player.",
};

export function inviteRoleLabel(role: InviteRole): string {
  return role === "captain" ? CAPTAIN_INVITE_META.label : STAFF_ROLE_META[role].label;
}

export function inviteRoleAccess(role: InviteRole): AccessTier {
  return role === "captain" ? CAPTAIN_INVITE_META.access : STAFF_ROLE_META[role].access;
}

export function inviteRoleAccessLabel(role: InviteRole): string {
  return role === "captain"
    ? CAPTAIN_INVITE_META.accessLabel
    : STAFF_ROLE_META[role].accessLabel;
}

export function inviteRoleHint(role: InviteRole): string {
  return role === "captain" ? CAPTAIN_INVITE_META.hint : STAFF_ROLE_META[role].hint;
}
