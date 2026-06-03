// InviteSheet — create a team invite link (Build 16.5 mobile parity). Pick a
// role (+ offense/defense focus for assistants) and an optional label, then
// generate a link to share. Mobile has no clickable URL handoff, so the
// recipient pastes the link into the join flow; here we just hand off via the
// OS share sheet (no extra clipboard dep).

import { useState } from "react";
import {
  Modal,
  Pressable,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, tracking } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";
import {
  STAFF_ROLES,
  inviteRoleLabel,
  inviteRoleHint,
  inviteRoleAccessLabel,
  SPECIALTY_LABELS,
  type StaffRole,
} from "../../lib/team/staff-roles";
import {
  createInvite,
  inviteLink,
} from "../../lib/team/invite-actions";

const SPECIALTIES = Object.keys(SPECIALTY_LABELS);

export function InviteSheet({
  visible,
  teamId,
  onClose,
  onCreated,
}: {
  visible: boolean;
  teamId: string;
  onClose: () => void;
  /** Called after a link is generated so the parent can refresh its list. */
  onCreated?: () => void;
}) {
  // Only coaching-staff roles here — captains are added through the player
  // flow (with a permission tier), per the web setup decision.
  const [role, setRole] = useState<StaffRole>("assistant_coach");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const reset = () => {
    setRole("assistant_coach");
    setSpecialties([]);
    setLabel("");
    setError(null);
    setToken(null);
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const generate = async () => {
    setError(null);
    setBusy(true);
    const res = await createInvite({
      teamId,
      role,
      specialties,
      label: label.trim() || null,
      expiresInDays: 14,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setToken(res.token);
    onCreated?.();
  };

  const link = token ? inviteLink(token) : "";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable
        onPress={close}
        style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface.raised,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            borderColor: colors.border.card,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing["3xl"],
            gap: spacing.lg,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[fontStyle("bold"), { fontSize: 18, color: colors.text.primary }]}>
              {token ? "Invite link ready" : "Invite to team"}
            </Text>
            <TouchableOpacity onPress={close} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.text.muted} />
            </TouchableOpacity>
          </View>

          {token ? (
            <>
              <Text style={[fontStyle("regular"), { fontSize: 13, lineHeight: 19, color: colors.text.secondary }]}>
                Share this link with the {inviteRoleLabel(role).toLowerCase()}. They open it on the web, sign in,
                and join the team. Or they can paste it into &ldquo;Join a team&rdquo; on mobile.
              </Text>
              <View
                style={{
                  borderRadius: radius.input,
                  borderWidth: 1,
                  borderColor: colors.border.default,
                  backgroundColor: colors.surface.input,
                  padding: 12,
                }}
              >
                <MonoText weight="medium" selectable style={{ fontSize: 12, color: colors.text.primary }}>
                  {link}
                </MonoText>
              </View>
              <TouchableOpacity
                onPress={() => Share.share({ message: link })}
                activeOpacity={0.9}
                style={{ height: 52, borderRadius: 14, backgroundColor: colors.orange[500], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}
              >
                <Ionicons name="share-outline" size={16} color={colors.text.primary} />
                <Text style={[fontStyle("bold"), { fontSize: 15, color: colors.text.primary }]}>Share link</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={reset} activeOpacity={0.7} style={{ alignItems: "center", paddingVertical: 6 }}>
                <Text style={[fontStyle("semibold"), { fontSize: 13, color: colors.text.secondary }]}>
                  Create another
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{ gap: 8 }}>
                {STAFF_ROLES.map((r) => {
                  const on = role === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setRole(r)}
                      activeOpacity={0.85}
                      style={{
                        padding: 12,
                        borderRadius: radius.input,
                        borderWidth: 1,
                        borderColor: on ? colors.orange[500] : colors.border.card,
                        backgroundColor: on ? colors.orange.tint : colors.surface.input,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[fontStyle("bold"), { fontSize: 14, color: on ? colors.orange[400] : colors.text.primary }]}>
                          {inviteRoleLabel(r)}
                        </Text>
                        <Text style={[fontStyle("regular"), { fontSize: 12, color: colors.text.muted, lineHeight: 16, marginTop: 1 }]}>
                          {inviteRoleHint(r)}
                        </Text>
                      </View>
                      <Text style={[fontStyle("bold"), { fontSize: 9.5, color: colors.text.muted, letterSpacing: tracking.loose, textTransform: "uppercase" }]}>
                        {inviteRoleAccessLabel(r)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {role === "assistant_coach" ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {SPECIALTIES.map((s) => {
                    const on = specialties.includes(s);
                    return (
                      <TouchableOpacity
                        key={s}
                        onPress={() =>
                          setSpecialties((prev) =>
                            prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                          )
                        }
                        activeOpacity={0.85}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          borderRadius: radius.pill,
                          borderWidth: 1,
                          borderColor: on ? colors.orange[500] : colors.border.default,
                          backgroundColor: on ? colors.orange.tint : colors.surface.overlay,
                        }}
                      >
                        <Text style={[fontStyle("bold"), { fontSize: 13, color: on ? colors.orange[400] : colors.text.secondary }]}>
                          {SPECIALTY_LABELS[s]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="e.g. WR coach"
                placeholderTextColor={colors.text.muted}
                style={[
                  fontStyle("regular"),
                  {
                    minHeight: 46,
                    borderRadius: radius.input,
                    borderWidth: 1,
                    borderColor: colors.border.card,
                    backgroundColor: colors.surface.input,
                    color: colors.text.primary,
                    fontSize: 15,
                    paddingHorizontal: 14,
                  },
                ]}
              />

              {error ? (
                <Text style={[fontStyle("medium"), { fontSize: 13, color: colors.errorLight }]}>{error}</Text>
              ) : null}

              <TouchableOpacity
                onPress={generate}
                disabled={busy}
                activeOpacity={0.9}
                style={{ height: 52, borderRadius: 14, backgroundColor: colors.orange[500], alignItems: "center", justifyContent: "center", opacity: busy ? 0.7 : 1 }}
              >
                <Text style={[fontStyle("bold"), { fontSize: 15, color: colors.text.primary }]}>
                  {busy ? "Generating…" : "Generate link"}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
