import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { TeamProvider, useTeam } from "../lib/team-context";
import { colors } from "../constants/design";
import "../global.css";

function RootLayoutNav() {
  const { session, loading: authLoading } = useAuth();
  const { hasTeam, loading: teamLoading } = useTeam();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const onTeamSetup = segments[0] === "team-setup";

    if (!session) {
      if (!inAuthGroup) router.replace("/(auth)/login");
      return;
    }

    if (teamLoading) return;

    if (!hasTeam) {
      if (!onTeamSetup) router.replace("/team-setup");
      return;
    }

    if (inAuthGroup || onTeamSetup) {
      router.replace("/(tabs)");
    }
  }, [session, authLoading, hasTeam, teamLoading, segments, router]);

  const showLoading = authLoading || (session && teamLoading);

  if (showLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface.base,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.orange[500]} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface.base },
        animation: "slide_from_right",
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
        <StatusBar style="light" />
        <AuthProvider>
          <TeamProvider>
            <RootLayoutNav />
          </TeamProvider>
        </AuthProvider>
      </View>
    </SafeAreaProvider>
  );
}
