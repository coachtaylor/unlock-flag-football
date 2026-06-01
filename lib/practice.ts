// Shared practice-plan domain helpers. Single source of truth — keep
// plan-title logic here, not inlined at call sites.

// The title a freshly-created practice plan gets before the coach renames it
// (the web app stores this literal; mobile leaves blank titles null).
export const DEFAULT_PLAN_TITLE = "Untitled practice plan";

// Titles that are effectively "no real name": blank, or one of the app's
// default placeholders (the stored default plus the display fallbacks). These
// skip the type-the-name delete confirmation — there's nothing meaningful to
// type. One canonical predicate so the modal + any call site agree.
const PLACEHOLDER_PLAN_TITLES = new Set([
  DEFAULT_PLAN_TITLE.toLowerCase(),
  "untitled practice",
  "untitled plan",
]);

export function isUntitledPlanTitle(title: string | null | undefined): boolean {
  const t = (title ?? "").trim();
  return t.length === 0 || PLACEHOLDER_PLAN_TITLES.has(t.toLowerCase());
}
