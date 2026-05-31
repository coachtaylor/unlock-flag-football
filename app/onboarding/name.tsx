import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import {
  colors,
  fontWeight,
  radius,
  spacing,
} from "../../constants/design";
import { fontStyle } from "../../constants/typography";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { OnboardingShell } from "../../components/onboarding/OnboardingShell";

// Step 1 — capture first + last name. Writes profiles.first_name,
// profiles.last_name, and recomputes profiles.display_name. Bumps
// onboarding_step to 1 so the routing helper knows step 1 is done.

export default function OnboardingNameScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from existing profile so re-entering the flow doesn't blank
  // the fields. (e.g. user already submitted, hit back from step 2.)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const profile = data as
        | { first_name: string | null; last_name: string | null }
        | null;
      if (profile?.first_name) setFirst(profile.first_name);
      if (profile?.last_name) setLast(profile.last_name);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const firstClean = first.trim();
  const lastClean = last.trim();
  const ready = firstClean.length > 0 && lastClean.length > 0 && !submitting;

  const onContinue = async () => {
    if (!ready || !user) return;
    setSubmitting(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        first_name: firstClean,
        last_name: lastClean,
        display_name: `${firstClean} ${lastClean}`,
        onboarding_step: 1,
      })
      .eq("id", user.id);
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.push("/onboarding/scope");
  };

  const initials =
    `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() || "?";

  return (
    <OnboardingShell
      step={1}
      eyebrow="ABOUT YOU"
      title="Let's get you set up."
      subtitle="First, what should we call you? You can change this anytime from Settings."
      cta="Continue"
      ctaDisabled={!ready}
      ctaLoading={submitting}
      onBack={null}
      onContinue={onContinue}
    >
      <Field label="First name">
        <TextInput
          value={first}
          onChangeText={setFirst}
          placeholder="e.g., Taylor"
          placeholderTextColor={colors.text.muted}
          autoFocus
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          returnKeyType="next"
          style={inputStyle}
        />
      </Field>

      <Field label="Last name">
        <TextInput
          value={last}
          onChangeText={setLast}
          placeholder="e.g., Rivera"
          placeholderTextColor={colors.text.muted}
          autoCapitalize="words"
          autoComplete="family-name"
          textContentType="familyName"
          returnKeyType="done"
          onSubmitEditing={onContinue}
          style={inputStyle}
        />
      </Field>

      {/* Display-name preview chip */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingLeft: 2,
          marginTop: 6,
          opacity: ready ? 1 : 0.45,
        }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colors.orange[500],
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 11,
                fontWeight: fontWeight.bold,
                color: colors.text.onBrand,
              },
            ]}
          >
            {initials}
          </Text>
        </View>
        <Text
          style={[
            fontStyle("semibold"),
            {
              fontSize: 12.5,
              fontWeight: fontWeight.semibold,
              color: colors.text.primary,
            },
          ]}
        >
          {ready ? `${firstClean} ${lastClean}` : "Your display name"}
        </Text>
      </View>

      {error ? (
        <Text style={{ fontSize: 13, color: colors.error }}>{error}</Text>
      ) : null}
    </OnboardingShell>
  );
}

const inputStyle = {
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
} as const;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
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
      {children}
    </View>
  );
}
