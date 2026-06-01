// Coach attribution read layer (Build 14.5) — mobile mirror of
// unlock-web/src/lib/activity.ts. Keep the two in sync (types, verb labels,
// describeActivity output). Reads the append-only activity_events log (mig 74)
// and resolves actor names (profiles) + subject-player names (team_players).
//
// Resilient: if the table isn't there yet (migrations not applied) or a query
// errors, every loader returns [] so the feed falls back to its empty state.

import { supabase } from "./supabase";
import { formatActorTime } from "./date";

export type ActivityEntityType =
  | "drill"
  | "practice_plan"
  | "player"
  | "benchmark"
  | "practice_log"
  | "note";

export type ActivityEvent = {
  id: string;
  teamId: string;
  actorUserId: string;
  verb: string;
  entityType: ActivityEntityType;
  entityId: string;
  subjectPlayerId: string | null;
  summary: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export type ActivityFeedItem = ActivityEvent & {
  who: string;
  subjectName: string | null;
  verbLabel: string;
  what: string;
  when: string;
};

const VERB_LABEL: Record<string, string> = {
  created: "created",
  updated: "updated",
  published: "published",
  unpublished: "unpublished",
  pinned: "pinned",
  unpinned: "unpinned",
  finalized: "finalized",
  began: "started",
  completed: "completed",
  archived: "archived",
  added: "added",
  deactivated: "deactivated",
  reactivated: "reactivated",
  assessed: "assessed",
  quick_rated: "quick-rated",
  cleared_review: "cleared review on",
  logged_injury: "flagged an injury for",
  resolved_injury: "cleared the injury for",
  noted: "added a note",
  logged: "logged",
};

function benchmarkValue(meta: Record<string, unknown> | null): string {
  if (!meta) return "";
  const time = meta.time_seconds as number | null | undefined;
  const rating = meta.rating as number | null | undefined;
  const made = meta.made_count as number | null | undefined;
  const attempts = meta.attempts_count as number | null | undefined;
  if (time != null) return ` · ${Number(time).toFixed(2)}s`;
  if (rating != null) return ` · ${rating}/5`;
  if (made != null && attempts != null) return ` · ${made}/${attempts}`;
  return "";
}

/** Raw event → { verbLabel, what }. Single source so the feed + any history
 * surface phrase the same event identically. */
export function describeActivity(
  ev: ActivityEvent,
  ctx: { subjectName?: string | null } = {}
): { verbLabel: string; what: string } {
  const verbLabel = VERB_LABEL[ev.verb] ?? ev.verb;
  const summary = ev.summary ?? "";
  const subject = ctx.subjectName ?? null;

  let what = summary;
  switch (ev.entityType) {
    case "benchmark":
      what = subject
        ? `${subject} · ${summary}${benchmarkValue(ev.meta)}`
        : `${summary}${benchmarkValue(ev.meta)}`;
      break;
    case "player":
      what = summary || subject || "a player";
      break;
    case "note":
      what = subject ? `on ${subject}` : "a practice note";
      break;
    case "practice_log":
      what = "post-practice notes";
      break;
    default:
      what = summary;
  }
  return { verbLabel, what };
}

/**
 * Resolve actor user ids → display names (display_name, else "First Last",
 * else "Coach"). Single source for the actor-name rule. [] / empty map on error.
 */
export async function resolveActorNames(
  userIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean) as string[]));
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, first_name, last_name")
    .in("id", ids);
  for (const p of (data ?? []) as {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  }[]) {
    const name =
      p.display_name?.trim() ||
      [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
      "Coach";
    out.set(p.id, name);
  }
  return out;
}

/** One actor id → display name (null if unresolved). */
export async function resolveActorName(
  userId: string | null | undefined
): Promise<string | null> {
  if (!userId) return null;
  const map = await resolveActorNames([userId]);
  return map.get(userId) ?? null;
}

const SELECT_COLS =
  "id, team_id, actor_user_id, verb, entity_type, entity_id, subject_player_id, summary, meta, created_at";

function rowToEvent(r: Record<string, unknown>): ActivityEvent {
  return {
    id: r.id as string,
    teamId: r.team_id as string,
    actorUserId: r.actor_user_id as string,
    verb: r.verb as string,
    entityType: r.entity_type as ActivityEntityType,
    entityId: r.entity_id as string,
    subjectPlayerId: (r.subject_player_id as string | null) ?? null,
    summary: (r.summary as string | null) ?? null,
    meta: (r.meta as Record<string, unknown> | null) ?? null,
    createdAt: r.created_at as string,
  };
}

async function enrich(events: ActivityEvent[]): Promise<ActivityFeedItem[]> {
  if (events.length === 0) return [];
  const subjectIds = Array.from(
    new Set(events.map((e) => e.subjectPlayerId).filter(Boolean) as string[])
  );
  const [nameByUser, playersRes] = await Promise.all([
    resolveActorNames(events.map((e) => e.actorUserId)),
    subjectIds.length
      ? supabase.from("team_players").select("id, player_name").in("id", subjectIds)
      : Promise.resolve({ data: [] as { id: string; player_name: string }[] }),
  ]);
  const playerById = new Map<string, string>();
  for (const p of (playersRes.data ?? []) as { id: string; player_name: string }[]) {
    playerById.set(p.id, p.player_name);
  }
  return events.map((ev) => {
    const subjectName = ev.subjectPlayerId
      ? playerById.get(ev.subjectPlayerId) ?? null
      : null;
    const { verbLabel, what } = describeActivity(ev, { subjectName });
    return {
      ...ev,
      who: nameByUser.get(ev.actorUserId) ?? "Coach",
      subjectName,
      verbLabel,
      what,
      when: formatActorTime(ev.createdAt),
    };
  });
}

/** Team activity feed, newest first. `sinceDays` windows it; omit for all-time. */
export async function loadTeamActivity(
  teamId: string,
  opts: { limit?: number; sinceDays?: number } = {}
): Promise<ActivityFeedItem[]> {
  if (!teamId) return [];
  const { limit = 20, sinceDays } = opts;
  let q = supabase
    .from("activity_events")
    .select(SELECT_COLS)
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sinceDays != null) {
    const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * sinceDays).toISOString();
    q = q.gte("created_at", cutoff);
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return enrich(data.map(rowToEvent));
}

/** Full history for one entity (create→edit→… trail), newest first. */
export async function loadEntityHistory(
  entityType: ActivityEntityType,
  entityId: string,
  opts: { limit?: number } = {}
): Promise<ActivityFeedItem[]> {
  if (!entityId) return [];
  const { data, error } = await supabase
    .from("activity_events")
    .select(SELECT_COLS)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (error || !data) return [];
  return enrich(data.map(rowToEvent));
}
