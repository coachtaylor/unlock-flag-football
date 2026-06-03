// Join a team with an invite link/code (Build 16.5 mobile parity). Mobile
// has no clickable /join URL, so the recipient pastes the link (or bare
// token) here. We extract the token, redeem it (migration 85), mark
// onboarding complete, refresh team context, and drop into the dashboard.

import { useState } from "react";
import { Text, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { colors, radius } from "../../constants/design";
import { fontStyle } from "../../constants/typography";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { useTeam } from "../../lib/team-context";
import { OnboardingShell } from "../../components/onboarding/OnboardingShell";
import { HelperNote } from "../../components/onboarding/BigChoiceCard";
import {
  extractInviteToken,
  redeemInvite,
} from "../../lib/team/invite-actions";

export default function OnboardingJoinScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { refreshTeam } = useTeam();

  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onJoin = async () => {
    if (submitting) return;
    setError(null);
    const token = extractInviteToken(value);
    if (!token) {
      setError("That doesn't look like a valid invite link or code.");
      return;
    }
    setSubmitting(true);
    const res = await redeemInvite(token);
    if (!res.ok) {
      setSubmitting(false);
      setError(res.error);
      return;
    }
    // Mark onboarding finished so the router treats this account as done.
    if (user) {
      await supabase
        .from("profiles")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("id", user.id)
        .then(undefined, () => {});
    }
    await refreshTeam();
    setSubmitting(false);
    router.replace("/dashboard");
  };

  return (
    <OnboardingShell
      step={2}
      eyebrow="INVITE"
      title="Have an invite link?"
      subtitle="Paste the link a coach or captain shared with you."
      cta="Join team"
      ctaDisabled={!value.trim()}
      ctaLoading={submitting}
      onBack={() => router.back()}
      onContinue={onJoin}
    >
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="unlockflagfootball.com/join/…"
        placeholderTextColor={colors.text.muted}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        textAlignVertical="top"
        style={[
          fontStyle("regular"),
          {
            minHeight: 64,
            borderRadius: radius.input,
            borderWidth: 1,
            borderColor: colors.border.card,
            backgroundColor: colors.surface.input,
            color: colors.text.primary,
            fontSize: 15,
            lineHeight: 21,
            paddingHorizontal: 14,
            paddingVertical: 12,
          },
        ]}
      />

      <HelperNote>
        You&rsquo;ll join the team at whatever access level the invite grants.
        Coaches and captains can see and manage; team managers have view-only
        access.
      </HelperNote>

      {error ? (
        <Text style={{ fontSize: 13, color: colors.error }}>{error}</Text>
      ) : null}
    </OnboardingShell>
  );
}
