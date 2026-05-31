import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, fontWeight } from "../../constants/design";
import { fontStyle } from "../../constants/typography";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { OnboardingShell } from "../../components/onboarding/OnboardingShell";
import { BigChoiceCard } from "../../components/onboarding/BigChoiceCard";
import { Eyebrow } from "../../components/ui/Eyebrow";

// Step 3 (Single Team branch only) — coach vs captain.
// The choice is passed to /team-setup via a query param, where it's
// forwarded into create_team_with_member(p_role => ...).

type Role = "coach" | "captain";

export default function OnboardingRoleScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [role, setRole] = useState<Role | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onContinue = async () => {
    if (!role || submitting || !user) return;
    setSubmitting(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ onboarding_step: 3 })
      .eq("id", user.id);
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.push(`/team-setup?role=${role}`);
  };

  return (
    <OnboardingShell
      step={3}
      eyebrow="YOUR ROLE"
      title="What's your role on the team?"
      subtitle="This decides whether you show up on the roster as a player too."
      cta="Continue"
      ctaDisabled={!role}
      ctaLoading={submitting}
      onBack={() => router.back()}
      onContinue={onContinue}
    >
      <BigChoiceCard
        iconName="clipboard-outline"
        title="Coach"
        body="I run practices and manage the team. I'm not on the roster."
        selected={role === "coach"}
        onPress={() => setRole("coach")}
      />
      <BigChoiceCard
        iconName="star-outline"
        title="Captain"
        body="I'm a player who also runs the team. Put me on the roster with a captain tag."
        selected={role === "captain"}
        onPress={() => setRole("captain")}
      />

      {role ? (
        <View
          style={{
            marginTop: 8,
            padding: 14,
            backgroundColor: "rgba(255,255,255,0.025)",
            borderWidth: 1,
            borderColor: colors.border.subtle,
            borderRadius: 12,
            gap: 8,
          }}
        >
          <Eyebrow tick variant="dim">
            WHAT WE'LL DO
          </Eyebrow>
          <Text
            style={{
              fontSize: 12.5,
              lineHeight: 18,
              color: colors.text.secondary,
            }}
          >
            {role === "coach" ? (
              <>
                You'll be added as{" "}
                <Text
                  style={[
                    fontStyle("semibold"),
                    {
                      color: colors.text.primary,
                      fontWeight: fontWeight.semibold,
                    },
                  ]}
                >
                  coach
                </Text>{" "}
                on the team you create next. No player row.
              </>
            ) : (
              <>
                You'll be added as{" "}
                <Text
                  style={[
                    fontStyle("semibold"),
                    {
                      color: colors.text.primary,
                      fontWeight: fontWeight.semibold,
                    },
                  ]}
                >
                  captain
                </Text>{" "}
                and put on the roster with the{" "}
                <Text
                  style={[
                    fontStyle("semibold"),
                    {
                      color: colors.text.primary,
                      fontWeight: fontWeight.semibold,
                    },
                  ]}
                >
                  captain
                </Text>{" "}
                tag.
              </>
            )}
          </Text>
        </View>
      ) : null}

      {error ? (
        <Text style={{ fontSize: 13, color: colors.error }}>{error}</Text>
      ) : null}
    </OnboardingShell>
  );
}
