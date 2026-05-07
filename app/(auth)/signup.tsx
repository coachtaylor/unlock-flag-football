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
import { colors, radius, spacing } from "../../constants/design";
import { supabase } from "../../lib/supabase";

export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);

    const trimmedEmail = email.trim();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setSubmitting(false);
      return;
    }

    // No session means Supabase is awaiting email confirmation.
    // Otherwise the auth state change fires and the root layout redirects.
    if (!data.session) {
      setConfirmationEmail(trimmedEmail);
      setSubmitting(false);
    }
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
        <Text
          style={{
            fontSize: 20,
            lineHeight: 28,
            fontWeight: "500",
            color: colors.text.primary,
            textAlign: "center",
            marginBottom: spacing["2xl"],
          }}
        >
          Unlock Flag Football
        </Text>

        <View
          style={{
            backgroundColor: colors.surface.raised,
            borderRadius: radius.lg,
            padding: spacing.lg,
          }}
        >
          {confirmationEmail ? (
            <View style={{ gap: spacing.md }}>
              <Text
                style={{
                  fontSize: 17,
                  lineHeight: 24,
                  fontWeight: "500",
                  color: colors.text.primary,
                }}
              >
                Check your email
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 18,
                  color: colors.text.secondary,
                }}
              >
                We sent a confirmation link to{" "}
                <Text style={{ color: colors.text.primary, fontWeight: "500" }}>
                  {confirmationEmail}
                </Text>
                . Tap the link in that email to activate your account, then
                come back here to sign in.
              </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable>
                  <Text
                    style={{
                      fontSize: 13,
                      lineHeight: 18,
                      color: colors.orange[400],
                      fontWeight: "500",
                      marginTop: spacing.sm,
                    }}
                  >
                    Go to Sign In
                  </Text>
                </Pressable>
              </Link>
            </View>
          ) : (
          <>
          <Text
            style={{
              fontSize: 17,
              lineHeight: 24,
              fontWeight: "500",
              color: colors.text.primary,
              marginBottom: spacing.xs,
            }}
          >
            Create your account
          </Text>
          <Text
            style={{
              fontSize: 13,
              lineHeight: 18,
              color: colors.text.secondary,
              marginBottom: spacing.lg,
            }}
          >
            Start planning practices and benchmarking players.
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
              autoComplete="new-password"
              textContentType="newPassword"
              editable={!submitting}
            />

            <Input
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
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
              label={submitting ? "Creating account…" : "Create Account"}
              onPress={handleSubmit}
              disabled={submitting || !email || !password || !confirmPassword}
            />
          </View>
          </>
          )}
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            marginTop: spacing.xl,
          }}
        >
          <Text style={{ fontSize: 13, lineHeight: 18, color: colors.text.secondary }}>
            Already have an account?{" "}
          </Text>
          <Link href="/(auth)/login" asChild>
            <Pressable>
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 18,
                  color: colors.orange[400],
                  fontWeight: "500",
                }}
              >
                Sign In
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
