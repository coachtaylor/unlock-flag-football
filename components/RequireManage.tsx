// withManageGuard — wraps a create/edit/log screen so view-only members
// (team_manager) who reach it by any path get bounced to a read-only list
// instead of a form they can't submit (RLS would reject the write anyway).
// Build 16.5 mobile parity. Implemented as a wrapper (not an inline early
// return) so the inner screen's hooks only run when it actually renders —
// keeping hook order stable.

import type { ComponentType } from "react";
import { Redirect } from "expo-router";
import { useTeam } from "../lib/team-context";

export function withManageGuard<P extends object>(
  Screen: ComponentType<P>,
  redirectHref: string,
): ComponentType<P> {
  return function ManageGuarded(props: P) {
    const { canManage, loading } = useTeam();
    if (loading) return null; // role unknown yet — avoid a redirect flash
    if (!canManage) return <Redirect href={redirectHref as never} />;
    return <Screen {...props} />;
  };
}
