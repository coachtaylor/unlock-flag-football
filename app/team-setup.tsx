import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { colors, radius, spacing } from "../constants/design";
import { supabase } from "../lib/supabase";
import { useTeam } from "../lib/team-context";

export default function TeamSetupScreen() {
  const { refreshTeam } = useTeam();
  const [teamName, setTeamName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = teamName.trim();
    if (!trimmed) {
      setError("Please enter a team name.");
      return;
    }

    setError(null);
    setSubmitting(true);

    const { error: rpcError } = await supabase.rpc("create_team_with_member", {
      p_team_name: trimmed,
    });

    if (rpcError) {
      setError(rpcError.message);
      setSubmitting(false);
      return;
    }

    await refreshTeam();
    setSubmitting(false);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing["3xl"],
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            backgroundColor: colors.surface.raised,
            borderRadius: radius.lg,
            padding: spacing["2xl"],
            width: "100%",
            maxWidth: 384,
            alignSelf: "center",
          }}
        >
          <Text
            style={{
              fontSize: 20,
              lineHeight: 28,
              fontWeight: "500",
              color: colors.text.primary,
              marginBottom: spacing.xs,
            }}
          >
            Create Your Team
          </Text>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: colors.text.secondary,
              marginBottom: spacing["2xl"],
            }}
          >
            Set up your team to start tracking players and running benchmarks.
          </Text>

          <View style={{ marginBottom: spacing.lg }}>
            <Input
              label="Team Name"
              placeholder="e.g., Miami Thunder"
              value={teamName}
              onChangeText={(text) => {
                setTeamName(text);
                if (error) setError(null);
              }}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!submitting}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          {error ? (
            <Text
              style={{
                fontSize: 13,
                lineHeight: 18,
                color: colors.errorLight,
                marginBottom: spacing.lg,
              }}
            >
              {error}
            </Text>
          ) : null}

          <Button
            label={submitting ? "Creating team…" : "Create Team"}
            onPress={handleSubmit}
            disabled={submitting || !teamName.trim()}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
