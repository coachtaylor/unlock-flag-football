import { useState } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../../constants/design";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { OnboardingShell } from "../../components/onboarding/OnboardingShell";
import {
  BigChoiceCard,
  HelperNote,
} from "../../components/onboarding/BigChoiceCard";

// Step 2 — single team or league. The choice is purely client-side until
// they submit; bumping onboarding_step to 2 happens on continue so the
// routing helper knows step 2 is done. Choosing 'league' routes to step
// 4-League directly (skipping role); 'single' routes to step 3.

type Scope = "single" | "league";

export default function OnboardingScopeScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [scope, setScope] = useState<Scope | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onContinue = async () => {
    if (!scope || submitting || !user) return;
    setSubmitting(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ onboarding_step: 2 })
      .eq("id", user.id);
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (scope === "single") {
      router.push("/onboarding/role");
    } else {
      router.push("/onboarding/create-league");
    }
  };

  return (
    <OnboardingShell
      step={2}
      eyebrow="SCOPE"
      title="Are you running a league or a single team?"
      subtitle="You can always add more later."
      cta="Continue"
      ctaDisabled={!scope}
      ctaLoading={submitting}
      onBack={() => router.back()}
      onContinue={onContinue}
    >
      <BigChoiceCard
        iconName="people-outline"
        title="Single team"
        body="I run one team. I'm a coach or captain."
        selected={scope === "single"}
        onPress={() => setScope("single")}
      />
      <BigChoiceCard
        iconName="trophy-outline"
        title="League"
        body="I run multiple teams in a league or organization."
        selected={scope === "league"}
        onPress={() => setScope("league")}
      />
      <BigChoiceCard
        iconName="link-outline"
        title="Join with an invite"
        body="A coach or captain shared an invite link with me."
        selected={false}
        onPress={() => router.push("/onboarding/join")}
      />

      {scope ? (
        <HelperNote>
          {scope === "single"
            ? "Next, you'll pick your role on the team and set up the team itself."
            : "Next, you'll name your league. You'll add teams to it from the league dashboard."}
        </HelperNote>
      ) : null}

      {error ? (
        <Text style={{ fontSize: 13, color: colors.error }}>{error}</Text>
      ) : null}
    </OnboardingShell>
  );
}
