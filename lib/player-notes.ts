// Player observation notes — write path for the scouting detail's "Add note"
// affordance. Mirrors web's addPlayerNote (benchmarks/actions.ts): a note
// written from scouting isn't tied to a practice, so practice_plan_id stays
// null. created_by is stamped with the current user for attribution. Reads of
// player_notes happen inline in the scouting loader + roster screen; this is the
// one shared insert helper.

import { supabase } from "./supabase";

export type AddNoteResult = { ok: true } | { ok: false; error: string };

export async function addPlayerNote(input: {
  teamId: string;
  playerId: string;
  noteText: string;
}): Promise<AddNoteResult> {
  const text = input.noteText.trim();
  if (!text) return { ok: false, error: "Note can't be empty." };
  if (!input.teamId || !input.playerId) return { ok: false, error: "Missing id." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { error } = await supabase.from("player_notes").insert({
    player_id: input.playerId,
    team_id: input.teamId,
    note_text: text,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
