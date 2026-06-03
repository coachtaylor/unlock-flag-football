// Coaching-staff mutations — mobile mirror of the web staff-actions
// (Build 16.5). Thin wrappers over the SECURITY DEFINER RPCs in migration 88;
// the DB enforces access + the last-full-access lockout guard. Callers
// refetch on success (no server-side revalidation on mobile).

import { supabase } from "../supabase";
import type { StaffRole } from "./staff-roles";

type Result = { ok: true } | { ok: false; error: string };

export async function updateStaff(input: {
  memberId: string;
  role: StaffRole;
  specialties: string[];
  yearsExperience: number | null;
  experienceDetail: string | null;
  certifications: string[];
  contactEmail: string | null;
  contactPhone: string | null;
}): Promise<Result> {
  const { error } = await supabase.rpc("update_team_staff", {
    p_member_id: input.memberId,
    p_role: input.role,
    p_specialties: input.role === "assistant_coach" ? input.specialties : [],
    p_years_experience: input.yearsExperience,
    p_experience_detail: input.experienceDetail,
    p_certifications: input.certifications,
    p_contact_email: input.contactEmail,
    p_contact_phone: input.contactPhone,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeStaff(memberId: string): Promise<Result> {
  const { error } = await supabase.rpc("remove_team_member", {
    p_member_id: memberId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
