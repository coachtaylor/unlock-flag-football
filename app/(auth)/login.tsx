import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Link } from "expo-router";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import Wordmark from "../../components/Wordmark";
import { colors, radius, spacing } from "../../constants/design";
import { supabase } from "../../lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }
    // Auth state change listener in the context handles the redirect.
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
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
        <View style={{ alignItems: "center", marginBottom: spacing["2xl"] }}>
          <Wordmark height={40} />
        </View>

        <View
          style={{
            backgroundColor: colors.surface.raised,
            borderRadius: radius.lg,
            padding: spacing.lg,
          }}
        >
          <Text
            style={{
              fontSize: 17,
              lineHeight: 24,
              fontWeight: "500",
              color: colors.text.primary,
              marginBottom: spacing.xs,
            }}
          >
            Welcome back
          </Text>
          <Text
            style={{
              fontSize: 13,
              lineHeight: 18,
              color: colors.text.secondary,
              marginBottom: spacing.lg,
            }}
          >
            Log in to keep tracking your team.
          </Text>

          <View style={{ gap: spacing.lg }}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!submitting}
            />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              editable={!submitting}
            />

            {error ? (
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 18,
                  color: colors.errorLight,
                }}
              >
                {error}
              </Text>
            ) : null}

            <Button
              label={submitting ? "Signing in…" : "Sign In"}
              onPress={handleSubmit}
              disabled={submitting || !email || !password}
            />
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            marginTop: spacing.xl,
          }}
        >
          <Text style={{ fontSize: 13, lineHeight: 18, color: colors.text.secondary }}>
            Don't have an account?{" "}
          </Text>
          <Link href="/(auth)/signup" asChild>
            <Pressable>
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 18,
                  color: colors.orange[400],
                  fontWeight: "500",
                }}
              >
                Create Account
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
