// Coach detail — profile for a single coaching-staff member (Build 16.5
// mobile parity). Hero (avatar, name, role, access), profile (years,
// background, certifications), contact. Full-access members get Edit +
// Remove; view-only members read it. Mirrors the web coach detail page.

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontWeight, radius, spacing, tracking } from "../../../../../constants/design";
import { fontStyle, MonoText } from "../../../../../constants/typography";
import { initialsFromName } from "../../../../../lib/athlete";
import { useTeam } from "../../../../../lib/team-context";
import { useAuth } from "../../../../../lib/auth-context";
import {
  ActionModal,
  useActionModal,
} from "../../../../../components/ui/ActionModal";
import {
  loadTeamStaff,
  shapeStaffRow,
  type StaffProfile,
} from "../../../../../lib/team/staff-detail";
import { removeStaff } from "../../../../../lib/team/staff-actions";
import {
  STAFF_ROLE_META,
  staffRoleLabel,
  specialtyLabel,
} from "../../../../../lib/team/staff-roles";

export default function CoachDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { teamId, canManage } = useTeam();
  const { user } = useAuth();
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const { show: showModal, modalProps } = useActionModal();

  const [coach, setCoach] = useState<StaffProfile | null>(null);
  const [headCount, setHeadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!teamId || !memberId) return;
        const rows = await loadTeamStaff(teamId);
        if (cancelled) return;
        const row = rows.find((r) => r.member_id === memberId);
        setCoach(row ? shapeStaffRow(row) : null);
        setHeadCount(rows.filter((r) => r.role === "head_coach").length);
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [teamId, memberId]),
  );

  const confirmRemove = () => {
    if (!coach) return;
    showModal({
      title: `Remove ${coach.name}?`,
      message:
        "They lose access to this team and drop off the coaching staff. Their account isn't deleted — you can invite them back any time.",
      actions: [
        {
          label: "Remove",
          variant: "destructive",
          onPress: async () => {
            setRemoving(true);
            const res = await removeStaff(coach.memberId);
            setRemoving(false);
            if (!res.ok) {
              showModal({ title: "Couldn't remove", message: res.error, actions: [] });
              return;
            }
            router.back();
          },
        },
      ],
    });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface.base, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.orange[500]} />
      </View>
    );
  }

  if (!coach) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface.base, paddingTop: insets.top + 40, paddingHorizontal: spacing.xl, gap: 16 }}>
        <BackButton onPress={() => router.back()} />
        <Text style={[fontStyle("bold"), { fontSize: 18, color: colors.text.primary }]}>
          Coach not found
        </Text>
      </View>
    );
  }

  const meta = STAFF_ROLE_META[coach.role];
  const roleLabel = staffRoleLabel(coach.role, headCount);
  const isYou = !!user && coach.userId === user.id;
  const isFull = meta.access === "full";
  const accessColor = isFull ? colors.lime[400] : colors.text.muted;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: 16,
          paddingBottom: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <BackButton onPress={() => router.back()} />
        {canManage ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => router.push(`/roster/coach/${coach.memberId}/edit` as never)}
              accessibilityLabel="Edit coach"
              activeOpacity={0.85}
              style={{
                height: 36,
                paddingHorizontal: 14,
                borderRadius: 12,
                backgroundColor: colors.orange.tint,
                borderWidth: 1,
                borderColor: colors.orange.tintBorder,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ionicons name="pencil" size={13} color={colors.orange[400]} />
              <Text style={[fontStyle("bold"), { fontSize: 13, color: colors.orange[400] }]}>Edit</Text>
            </TouchableOpacity>
            {!isYou ? (
              <TouchableOpacity
                onPress={confirmRemove}
                disabled={removing}
                accessibilityLabel="Remove coach"
                activeOpacity={0.85}
                style={{
                  height: 36,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: "rgba(255,77,77,0.45)",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: removing ? 0.5 : 1,
                }}
              >
                <Text style={[fontStyle("bold"), { fontSize: 13, color: colors.red.semantic }]}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View
          style={{
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border.card,
            backgroundColor: colors.surface.raised,
            padding: 18,
            gap: 14,
            marginTop: 6,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.surface.overlay,
                borderWidth: 2,
                borderColor: meta.color,
              }}
            >
              <MonoText weight="bold" style={{ fontSize: 20, color: colors.text.primary }}>
                {initialsFromName(coach.name)}
              </MonoText>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[fontStyle("bold"), { fontSize: 11, color: colors.text.muted, letterSpacing: tracking.loose, textTransform: "uppercase" }]}>
                {roleLabel}
              </Text>
              <Text style={[fontStyle("bold"), { fontSize: 22, color: colors.text.primary, letterSpacing: -0.3, marginTop: 2 }]} numberOfLines={1}>
                {coach.name}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 9,
                paddingVertical: 5,
                borderRadius: radius.pill,
                backgroundColor: isFull ? colors.lime.tint : colors.surface.muted,
                borderWidth: 1,
                borderColor: isFull ? "rgba(194,255,61,0.30)" : colors.border.default,
              }}
            >
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: accessColor }} />
              <Text style={[fontStyle("bold"), { fontSize: 9.5, color: accessColor, letterSpacing: tracking.loose, textTransform: "uppercase" }]}>
                {meta.accessLabel}
              </Text>
            </View>
          </View>

          {coach.role === "assistant_coach" && coach.specialties.length > 0 ? (
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {coach.specialties.map((s) => (
                <Tag key={s}>{specialtyLabel(s)}</Tag>
              ))}
            </View>
          ) : null}
        </View>

        {/* Profile */}
        <SectionCard title="Profile">
          <Field label="Years of experience">
            {coach.yearsExperience != null ? (
              <ValueText>{`${coach.yearsExperience} ${coach.yearsExperience === 1 ? "year" : "years"}`}</ValueText>
            ) : (
              <EmptyText />
            )}
          </Field>
          <Field label="Background">
            {coach.experienceDetail ? (
              <Text style={[fontStyle("regular"), { fontSize: 14, lineHeight: 21, color: colors.text.primary }]}>
                {coach.experienceDetail}
              </Text>
            ) : (
              <EmptyText />
            )}
          </Field>
          <Field label="Certifications">
            {coach.certifications.length > 0 ? (
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {coach.certifications.map((c) => (
                  <Tag key={c}>{c}</Tag>
                ))}
              </View>
            ) : (
              <EmptyText />
            )}
          </Field>
        </SectionCard>

        {/* Contact */}
        <SectionCard title="Contact">
          <Field label="Email">
            {coach.contactEmail ? (
              <TouchableOpacity onPress={() => Linking.openURL(`mailto:${coach.contactEmail}`)}>
                <Text style={[fontStyle("regular"), { fontSize: 14, color: colors.orange[400] }]}>{coach.contactEmail}</Text>
              </TouchableOpacity>
            ) : (
              <EmptyText />
            )}
          </Field>
          <Field label="Phone">
            {coach.contactPhone ? (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${coach.contactPhone}`)}>
                <Text style={[fontStyle("regular"), { fontSize: 14, color: colors.orange[400] }]}>{coach.contactPhone}</Text>
              </TouchableOpacity>
            ) : (
              <EmptyText />
            )}
          </Field>
        </SectionCard>
      </ScrollView>

      <ActionModal {...modalProps} />
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel="Back"
      hitSlop={10}
      activeOpacity={0.7}
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.04)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="chevron-back" size={18} color={colors.text.primary} />
    </TouchableOpacity>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border.card,
        backgroundColor: colors.surface.raised,
        padding: 16,
        gap: 16,
        marginTop: 14,
      }}
    >
      <Text style={[fontStyle("bold"), { fontSize: 11, color: colors.text.muted, letterSpacing: tracking.loose, textTransform: "uppercase" }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={[fontStyle("medium"), { fontSize: 11.5, color: colors.text.label }]}>{label}</Text>
      {children}
    </View>
  );
}

function ValueText({ children }: { children: React.ReactNode }) {
  return <Text style={[fontStyle("regular"), { fontSize: 14, color: colors.text.primary }]}>{children}</Text>;
}

function EmptyText() {
  return <Text style={[fontStyle("regular"), { fontSize: 13, color: colors.text.muted }]}>Not added yet</Text>;
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius.pill,
        backgroundColor: colors.surface.overlay,
        borderWidth: 1,
        borderColor: colors.border.default,
      }}
    >
      <Text style={[fontStyle("medium"), { fontSize: 11.5, color: colors.text.secondary }]}>{children}</Text>
    </View>
  );
}
