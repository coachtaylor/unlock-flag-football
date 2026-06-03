// Coaching-staff data layer — mobile mirror of the web
// src/lib/team/staff-detail.ts (Build 16.5). Sourced from the get_team_staff
// RPC (migration 87), which resolves names past profiles' self-only RLS and
// returns the coach-profile fields. Uses the shared supabase singleton.

import { supabase } from "../supabase";
import { STAFF_ROLES, type StaffRole } from "./staff-roles";

export type StaffProfile = {
  memberId: string;
  userId: string;
  role: StaffRole;
  specialties: string[];
  firstName: string | null;
  lastName: string | null;
  name: string;
  yearsExperience: number | null;
  experienceDetail: string | null;
  certifications: string[];
  contactEmail: string | null;
  contactPhone: string | null;
};

export type StaffRpcRow = {
  member_id: string;
  user_id: string;
  role: string;
  coach_specialties: string[] | null;
  first_name: string | null;
  last_name: string | null;
  years_experience: number | null;
  experience_detail: string | null;
  certifications: string[] | null;
  contact_email: string | null;
  contact_phone: string | null;
};

export function shapeStaffRow(row: StaffRpcRow): StaffProfile | null {
  if (!(STAFF_ROLES as string[]).includes(row.role)) return null;
  const name =
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Coach";
  return {
    memberId: row.member_id,
    userId: row.user_id,
    role: row.role as StaffRole,
    specialties: row.coach_specialties ?? [],
    firstName: row.first_name,
    lastName: row.last_name,
    name,
    yearsExperience: row.years_experience,
    experienceDetail: row.experience_detail,
    certifications: row.certifications ?? [],
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
  };
}

export async function loadTeamStaff(teamId: string): Promise<StaffRpcRow[]> {
  const { data, error } = await supabase.rpc("get_team_staff", {
    p_team_id: teamId,
  });
  if (error) {
    console.warn("[staff] get_team_staff:", error.message);
    return [];
  }
  return (data as StaffRpcRow[] | null) ?? [];
}

export async function loadTeamStaffMember(
  teamId: string,
  memberId: string,
): Promise<StaffProfile | null> {
  const rows = await loadTeamStaff(teamId);
  const row = rows.find((r) => r.member_id === memberId);
  return row ? shapeStaffRow(row) : null;
}
