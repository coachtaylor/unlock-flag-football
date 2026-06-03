// Coaching-staff section for the roster (Build 16.5 mobile parity). Mirrors
// the web roster's "Coaching staff" table: lists team_members in staff roles
// (head/assistant coach, team manager) above the players. Each row taps
// through to the coach profile. Self-fetching (via loadTeamStaff) + refetch
// on focus so edits/removes reflect without threading state through the
// 900-line roster screen. The Invite entry is added in the invites slice.

import { useCallback, useState } from "react";
import { Share, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, fontWeight, radius, tracking } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";
import { initialsFromName } from "../../lib/athlete";
import { useTeam } from "../../lib/team-context";
import {
  loadTeamStaff,
  shapeStaffRow,
  type StaffProfile,
} from "../../lib/team/staff-detail";
import {
  STAFF_ROLE_META,
  staffRoleLabel,
  specialtyLabel,
  inviteRoleLabel,
} from "../../lib/team/staff-roles";
import {
  loadPendingInvites,
  revokeInvite,
  inviteLink,
  type PendingInvite,
} from "../../lib/team/invite-actions";
import { InviteSheet } from "./InviteSheet";

export function CoachingStaffSection({ teamId }: { teamId: string }) {
  const router = useRouter();
  const { canManage } = useTeam();
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [rows, invites] = await Promise.all([
      loadTeamStaff(teamId),
      canManage ? loadPendingInvites(teamId) : Promise.resolve([]),
    ]);
    setStaff(rows.map(shapeStaffRow).filter((s): s is StaffProfile => !!s));
    setPending(invites);
    setLoaded(true);
  }, [teamId, canManage]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
    }, [refresh]),
  );

  // View-only members only see the section when there's staff. Full-access
  // members always see it (so they can invite the first coach).
  if (!loaded) return null;
  if (staff.length === 0 && !canManage) return null;

  const headCount = staff.filter((s) => s.role === "head_coach").length;

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 11,
              fontWeight: fontWeight.bold,
              color: colors.text.secondary,
              letterSpacing: tracking.loose,
              textTransform: "uppercase",
            },
          ]}
        >
          Coaching staff
        </Text>
        <MonoText
          weight="medium"
          style={{ fontSize: 11, color: colors.text.muted }}
        >
          {staff.length}
        </MonoText>
        <View style={{ flex: 1 }} />
        {canManage ? (
          <TouchableOpacity
            onPress={() => setInviteOpen(true)}
            accessibilityLabel="Invite to team"
            activeOpacity={0.85}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 12,
              height: 30,
              borderRadius: radius.pill,
              backgroundColor: colors.orange[500],
            }}
          >
            <Ionicons name="add" size={14} color={colors.text.primary} />
            <Text style={[fontStyle("bold"), { fontSize: 12, color: colors.text.primary }]}>Invite</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {staff.length > 0 ? (
        <View
          style={{
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border.card,
            backgroundColor: colors.surface.raised,
            overflow: "hidden",
          }}
        >
          {staff.map((m, i) => (
            <StaffRow
              key={m.memberId}
              member={m}
              headCount={headCount}
              divider={i > 0}
              onPress={() =>
                router.push(`/roster/coach/${m.memberId}` as never)
              }
            />
          ))}
        </View>
      ) : (
        <View
          style={{
            borderRadius: radius.card,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: colors.border.dashed,
            padding: 16,
          }}
        >
          <Text style={[fontStyle("regular"), { fontSize: 12.5, lineHeight: 18, color: colors.text.muted }]}>
            No coaching staff yet. Invite head coaches, assistant coaches, and
            team managers — they&rsquo;ll appear here.
          </Text>
        </View>
      )}

      {canManage && pending.length > 0 ? (
        <PendingInvites teamId={teamId} invites={pending} onChanged={refresh} />
      ) : null}

      <InviteSheet
        visible={inviteOpen}
        teamId={teamId}
        onClose={() => setInviteOpen(false)}
        onCreated={refresh}
      />
    </View>
  );
}

function PendingInvites({
  invites,
  onChanged,
}: {
  teamId: string;
  invites: PendingInvite[];
  onChanged: () => void;
}) {
  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 10.5,
            color: colors.text.muted,
            letterSpacing: tracking.loose,
            textTransform: "uppercase",
          },
        ]}
      >
        Pending invites · {invites.length}
      </Text>
      <View
        style={{
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border.card,
          backgroundColor: colors.surface.raised,
          overflow: "hidden",
        }}
      >
        {invites.map((inv, i) => (
          <View
            key={inv.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 11,
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: colors.border.subtle,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[fontStyle("semibold"), { fontSize: 13, color: colors.text.primary }]}>
                {inv.label || "Anyone with the link"}
              </Text>
              <Text style={[fontStyle("regular"), { fontSize: 11.5, color: colors.text.muted, marginTop: 1 }]}>
                {inviteRoleLabel(inv.role)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => Share.share({ message: inviteLink(inv.token) })}
              accessibilityLabel="Share invite link"
              hitSlop={8}
              style={{ width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface.overlay }}
            >
              <Ionicons name="share-outline" size={15} color={colors.text.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                const res = await revokeInvite(inv.id);
                if (res.ok) onChanged();
              }}
              accessibilityLabel="Revoke invite"
              hitSlop={8}
              style={{ width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface.overlay }}
            >
              <Ionicons name="trash-outline" size={15} color={colors.red.semantic} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
}

function StaffRow({
  member,
  headCount,
  divider,
  onPress,
}: {
  member: StaffProfile;
  headCount: number;
  divider: boolean;
  onPress: () => void;
}) {
  const meta = STAFF_ROLE_META[member.role];
  const isFull = meta.access === "full";
  const accessColor = isFull ? colors.lime[400] : colors.text.muted;
  const focus =
    member.role === "assistant_coach" && member.specialties.length > 0
      ? member.specialties.map(specialtyLabel).join(" · ")
      : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`${member.name}, ${staffRoleLabel(member.role, headCount)}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: colors.border.subtle,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface.overlay,
          borderWidth: 1.5,
          borderColor: meta.color,
        }}
      >
        <MonoText
          weight="bold"
          style={{ fontSize: 12, color: colors.text.primary }}
        >
          {initialsFromName(member.name)}
        </MonoText>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[
            fontStyle("bold"),
            {
              fontSize: 14,
              fontWeight: fontWeight.bold,
              color: colors.text.primary,
            },
          ]}
        >
          {member.name}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            fontStyle("regular"),
            { fontSize: 12, color: colors.text.secondary, marginTop: 1 },
          ]}
        >
          {staffRoleLabel(member.role, headCount)}
          {focus ? ` · ${focus}` : ""}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: radius.pill,
          backgroundColor: isFull ? colors.lime.tint : colors.surface.muted,
          borderWidth: 1,
          borderColor: isFull
            ? "rgba(194,255,61,0.30)"
            : colors.border.default,
        }}
      >
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: accessColor,
          }}
        />
        <Text
          style={[
            fontStyle("bold"),
            {
              fontSize: 9.5,
              fontWeight: fontWeight.bold,
              color: accessColor,
              letterSpacing: tracking.loose,
              textTransform: "uppercase",
            },
          ]}
        >
          {meta.accessLabel}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
    </TouchableOpacity>
  );
}
