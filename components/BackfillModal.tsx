import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontWeight, radius, spacing } from "../constants/design";
import { fontStyle } from "../constants/typography";
import { Eyebrow } from "./ui/Eyebrow";
import { supabase } from "../lib/supabase";

// Spec §7. Existing users (onboarding_completed_at IS NOT NULL) whose
// first_name is null get a single one-time prompt to collect first + last
// name. On submit we patch profiles and close. Onboarding step is NOT
// touched — they're already past it.

type Props = {
  visible: boolean;
  userId: string;
  onSaved: () => void;
};

export function BackfillModal({ visible, userId, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setFirst("");
      setLast("");
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const ready =
    first.trim().length > 0 && last.trim().length > 0 && !submitting;

  const onSubmit = async () => {
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    const firstClean = first.trim();
    const lastClean = last.trim();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        first_name: firstClean,
        last_name: lastClean,
        display_name: `${firstClean} ${lastClean}`,
      })
      .eq("id", userId);
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Spec: modal blocks the dashboard — no dismiss without submit.
      }}
    >
      {/* Scrim */}
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(8,9,11,0.72)",
          justifyContent: "flex-end",
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ width: "100%" }}
        >
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 16 + insets.bottom,
              backgroundColor: colors.surface.raised,
              borderWidth: 1,
              borderColor: colors.border.default,
              borderRadius: 22,
              padding: 22,
              shadowColor: "#000",
              shadowOpacity: 0.5,
              shadowRadius: 60,
              shadowOffset: { width: 0, height: 20 },
              elevation: 16,
            }}
          >
            {/* Drag handle */}
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border.default,
                alignSelf: "center",
                marginBottom: 18,
              }}
            />

            <Eyebrow tick variant="dim">
              QUICK UPDATE
            </Eyebrow>

            <Text
              style={[
                fontStyle("bold"),
                {
                  marginTop: 14,
                  fontSize: 22,
                  fontWeight: fontWeight.bold,
                  letterSpacing: -0.3,
                  color: colors.text.primary,
                  lineHeight: 26,
                },
              ]}
            >
              Quick update.
            </Text>
            <Text
              style={{
                marginTop: 8,
                fontSize: 14,
                lineHeight: 20,
                color: colors.text.secondary,
                maxWidth: 320,
              }}
            >
              We added a few new things. Can you confirm a couple of details
              so we get this right?
            </Text>

            <View style={{ marginTop: 18, gap: 14 }}>
              <FieldGroup
                label="First name"
                value={first}
                onChange={setFirst}
                placeholder="e.g., Taylor"
                autoFocus
                autoComplete="given-name"
                textContentType="givenName"
                returnKeyType="next"
              />
              <FieldGroup
                label="Last name"
                value={last}
                onChange={setLast}
                placeholder="e.g., Rivera"
                autoComplete="family-name"
                textContentType="familyName"
                returnKeyType="done"
                onSubmitEditing={onSubmit}
              />
            </View>

            {error ? (
              <Text
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  color: colors.error,
                }}
              >
                {error}
              </Text>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onSubmit}
              disabled={!ready}
              style={{
                width: "100%",
                height: 48,
                marginTop: 18,
                borderRadius: radius.lg,
                backgroundColor: ready
                  ? colors.orange[500]
                  : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
              }}
            >
              {submitting ? (
                <ActivityIndicator color={colors.text.onBrand} size="small" />
              ) : null}
              <Text
                style={[
                  fontStyle("semibold"),
                  {
                    fontSize: 14,
                    fontWeight: fontWeight.semibold,
                    color: ready ? colors.text.onBrand : colors.text.muted,
                  },
                ]}
              >
                Save and continue
              </Text>
            </TouchableOpacity>

            <View style={{ alignItems: "center", marginTop: 10 }}>
              <Text style={{ fontSize: 11, color: colors.text.muted }}>
                We won't ask again.
              </Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// Inline field — mirrors the design's `.fr-label` + `.fr-input` pair without
// pulling the existing Input atom (label sizing/spacing differ enough that
// styling the atom inline would be more code than re-rolling).
function FieldGroup({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  autoComplete?:
    | "given-name"
    | "family-name"
    | "name"
    | "off";
  textContentType?: "givenName" | "familyName" | "name" | "none";
  returnKeyType?: "next" | "done";
  onSubmitEditing?: () => void;
}) {
  return (
    <View>
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.text.label,
          fontWeight: fontWeight.medium,
          marginBottom: spacing.sm,
        }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.text.muted}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        textContentType={textContentType}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        autoCapitalize="words"
        style={{
          minHeight: 48,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border.card,
          backgroundColor: colors.surface.input,
          color: colors.text.primary,
          fontSize: 15,
          lineHeight: 22,
        }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Detection helper
// ─────────────────────────────────────────────────────────────────────

// Returns true when this user needs the backfill prompt:
//   onboarding_completed_at IS NOT NULL  AND  first_name IS NULL
// Pre-migration the first_name column doesn't exist (Postgres 42703); in
// that case we skip — there's nothing to write to yet.
export async function shouldShowBackfill(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("first_name, onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (error.code === "42703") return false;
    console.warn("[backfill] check failed:", error.message);
    return false;
  }
  const profile = data as
    | { first_name: string | null; onboarding_completed_at: string | null }
    | null;
  if (!profile) return false;
  if (!profile.onboarding_completed_at) return false;
  return !profile.first_name || profile.first_name.trim().length === 0;
}
