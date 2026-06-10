// Player-photo upload to Supabase Storage (Build 18). Mirrors web's player-card
// photo flow against the same `player-photos` bucket (migration 101). Path
// convention is enforced by the bucket's write RLS: {team_id}/{player_id}.{ext}
// — the first folder segment must be a team the caller can manage, so callers
// MUST pass the route teamId (never a first-team lookup).
//
// Upload strategy: fetch(localUri).arrayBuffer() — the Supabase RN-recommended
// path. No expo-file-system / base64 dep needed in SDK 54.

import { supabase } from "./supabase";

const BUCKET = "player-photos";

export type PhotoUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

// Normalize an extension from the picked asset's mime type or uri. jpeg → jpg.
function extFrom(uri: string, mimeType?: string | null): string {
  if (mimeType) {
    const sub = mimeType.split("/")[1];
    if (sub) return sub === "jpeg" ? "jpg" : sub;
  }
  const clean = uri.split("?")[0];
  const dot = clean.lastIndexOf(".");
  const ext = dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
  return ext === "jpeg" ? "jpg" : ext || "jpg";
}

export async function uploadPlayerPhoto(args: {
  teamId: string;
  playerId: string;
  uri: string;
  mimeType?: string | null;
}): Promise<PhotoUploadResult> {
  const { teamId, playerId, uri, mimeType } = args;
  try {
    const ext = extFrom(uri, mimeType);
    const path = `${teamId}/${playerId}.${ext}`;
    const arrayBuffer = await fetch(uri).then((r) => r.arrayBuffer());
    const contentType = mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, { contentType, upsert: true });
    if (error) return { ok: false, error: error.message };

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    // Cache-bust so a re-upload at the same path refreshes in <Image> (RN caches
    // by URL). Harmless on web — the query param is ignored.
    return { ok: true, url: `${data.publicUrl}?v=${Date.now()}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}
