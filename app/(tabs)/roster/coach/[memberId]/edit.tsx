// Coach edit — full-access form for a staff member's profile (Build 16.5
// mobile parity). Role picker, offense/defense focus, years, background,
// certifications, contact. Saves via update_team_staff (migration 88).
// Wrapped in withManageGuard so view-only members can't reach it.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withManageGuard } from "../../../../../components/RequireManage";
import { Section, SectionLabel } from "../../../../../components/ui/FormSection";
import { colors, fontWeight, radius, spacing, tracking } from "../../../../../constants/design";
import { fontStyle } from "../../../../../constants/typography";
import { useTeam } from "../../../../../lib/team-context";
import { loadTeamStaffMember } from "../../../../../lib/team/staff-detail";
import { updateStaff } from "../../../../../lib/team/staff-actions";
import {
  STAFF_ROLES,
  STAFF_ROLE_META,
  SPECIALTY_LABELS,
  type StaffRole,
} from "../../../../../lib/team/staff-roles";

const SPECIALTIES = Object.keys(SPECIALTY_LABELS); // ["offense", "defense"]

function CoachEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { teamId } = useTeam();
  const { memberId } = useLocalSearchParams<{ memberId: string }>();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("Coach");
  const [role, setRole] = useState<StaffRole>("assistant_coach");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [years, setYears] = useState("");
  const [background, setBackground] = useState("");
  const [certs, setCerts] = useState<string[]>([]);
  const [certDraft, setCertDraft] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!teamId || !memberId) return;
      const m = await loadTeamStaffMember(teamId, memberId);
      if (cancelled || !m) {
        setLoading(false);
        return;
      }
      setName(m.name);
      setRole(m.role);
      setSpecialties(m.specialties);
      setYears(m.yearsExperience != null ? String(m.yearsExperience) : "");
      setBackground(m.experienceDetail ?? "");
      setCerts(m.certifications);
      setEmail(m.contactEmail ?? "");
      setPhone(m.contactPhone ?? "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, memberId]);

  const toggleSpecialty = useCallback((s: string) => {
    setSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }, []);

  const addCert = useCallback(() => {
    const v = certDraft.trim();
    if (!v) return;
    setCerts((prev) =>
      prev.some((c) => c.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v],
    );
    setCertDraft("");
  }, [certDraft]);

  const onSave = async () => {
    setError(null);
    let yearsValue: number | null = null;
    if (years.trim()) {
      const n = parseInt(years.trim(), 10);
      if (!Number.isFinite(n) || n < 0 || n > 80) {
        setError("Years of experience must be between 0 and 80.");
        return;
      }
      yearsValue = n;
    }
    setSaving(true);
    const res = await updateStaff({
      memberId: memberId!,
      role,
      specialties,
      yearsExperience: yearsValue,
      experienceDetail: background.trim() || null,
      certifications: certs,
      contactEmail: email.trim() || null,
      contactPhone: phone.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.back();
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface.base, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.orange[500]} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Back"
          hitSlop={10}
          activeOpacity={0.7}
          style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[fontStyle("bold"), { fontSize: 16, color: colors.text.primary }]} numberOfLines={1}>
          Edit {name}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 120, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Role */}
        <Section>
          <SectionLabel>Role</SectionLabel>
          <View style={{ gap: 8 }}>
            {STAFF_ROLES.map((r) => {
              const meta = STAFF_ROLE_META[r];
              const on = role === r;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setRole(r)}
                  activeOpacity={0.85}
                  accessibilityState={{ selected: on }}
                  style={{
                    padding: 12,
                    borderRadius: radius.input,
                    borderWidth: 1,
                    borderColor: on ? colors.orange[500] : colors.border.card,
                    backgroundColor: on ? colors.orange.tint : colors.surface.input,
                    gap: 3,
                  }}
                >
                  <Text style={[fontStyle("bold"), { fontSize: 14, color: on ? colors.orange[400] : colors.text.primary }]}>
                    {meta.label}
                  </Text>
                  <Text style={[fontStyle("regular"), { fontSize: 12, color: colors.text.muted, lineHeight: 16 }]}>
                    {meta.hint}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {role === "assistant_coach" ? (
            <View style={{ marginTop: 12 }}>
              <SectionLabel>Focus (optional)</SectionLabel>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {SPECIALTIES.map((s) => {
                  const on = specialties.includes(s);
                  return (
                    <TouchableOpacity
                      key={s}
                      onPress={() => toggleSpecialty(s)}
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
            </View>
          ) : null}
        </Section>

        {/* Experience */}
        <Section>
          <SectionLabel>Years of experience</SectionLabel>
          <FormInput
            value={years}
            onChangeText={(v) => setYears(v.replace(/\D/g, "").slice(0, 2))}
            placeholder="8"
            keyboardType="number-pad"
            style={{ width: 100, textAlign: "center" }}
          />
          <View style={{ height: 14 }} />
          <SectionLabel>Background</SectionLabel>
          <FormInput
            value={background}
            onChangeText={setBackground}
            placeholder="Coaching history, playing background, anything relevant…"
            multiline
          />
        </Section>

        {/* Certifications */}
        <Section>
          <SectionLabel>Certifications</SectionLabel>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <FormInput
                value={certDraft}
                onChangeText={setCertDraft}
                placeholder="USA Football Level 1"
                onSubmitEditing={addCert}
                returnKeyType="done"
              />
            </View>
            <TouchableOpacity
              onPress={addCert}
              activeOpacity={0.85}
              style={{ height: 46, paddingHorizontal: 16, borderRadius: radius.input, backgroundColor: colors.surface.overlay, borderWidth: 1, borderColor: colors.border.default, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={[fontStyle("bold"), { fontSize: 13, color: colors.text.primary }]}>Add</Text>
            </TouchableOpacity>
          </View>
          {certs.length > 0 ? (
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {certs.map((c) => (
                <View
                  key={c}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 12, paddingRight: 6, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surface.overlay, borderWidth: 1, borderColor: colors.border.default }}
                >
                  <Text style={[fontStyle("medium"), { fontSize: 12, color: colors.text.secondary }]}>{c}</Text>
                  <TouchableOpacity
                    onPress={() => setCerts((prev) => prev.filter((x) => x !== c))}
                    accessibilityLabel={`Remove ${c}`}
                    hitSlop={8}
                    style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface.muted, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="close" size={11} color={colors.text.muted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}
        </Section>

        {/* Contact */}
        <Section>
          <SectionLabel>Email</SectionLabel>
          <FormInput
            value={email}
            onChangeText={setEmail}
            placeholder="coach@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <View style={{ height: 14 }} />
          <SectionLabel>Phone</SectionLabel>
          <FormInput
            value={phone}
            onChangeText={setPhone}
            placeholder="(555) 123-4567"
            keyboardType="phone-pad"
          />
        </Section>

        {error ? (
          <Text style={[fontStyle("medium"), { fontSize: 13, color: colors.errorLight }]}>{error}</Text>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + 12,
          backgroundColor: colors.surface.base,
          borderTopWidth: 1,
          borderTopColor: colors.border.subtle,
        }}
      >
        <TouchableOpacity
          onPress={onSave}
          disabled={saving}
          activeOpacity={0.9}
          accessibilityLabel="Save changes"
          style={{ height: 52, borderRadius: 14, backgroundColor: colors.orange[500], alignItems: "center", justifyContent: "center", opacity: saving ? 0.7 : 1 }}
        >
          <Text style={[fontStyle("bold"), { fontSize: 15, color: colors.text.primary, letterSpacing: 0.2 }]}>
            {saving ? "Saving…" : "Save changes"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function FormInput({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  returnKeyType,
  onSubmitEditing,
  multiline,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "email-address" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  returnKeyType?: "done" | "next";
  onSubmitEditing?: () => void;
  multiline?: boolean;
  style?: object;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.text.muted}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
      multiline={multiline}
      textAlignVertical={multiline ? "top" : "center"}
      style={[
        fontStyle("regular"),
        {
          minHeight: multiline ? 88 : 46,
          borderRadius: radius.input,
          borderWidth: 1,
          borderColor: colors.border.card,
          backgroundColor: colors.surface.input,
          color: colors.text.primary,
          fontSize: 15,
          lineHeight: 20,
          paddingHorizontal: 14,
          paddingVertical: 12,
        },
        style,
      ]}
    />
  );
}

export default withManageGuard(CoachEditScreen, "/roster");
