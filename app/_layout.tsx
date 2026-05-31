import {
  Stack,
  useRootNavigationState,
  useRouter,
  useSegments,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { TeamProvider, useTeam } from "../lib/team-context";
import { colors } from "../constants/design";
import { applyDefaultTextFont } from "../constants/typography";
import { supabase } from "../lib/supabase";
import "../global.css";

// Decide the post-auth landing route from the profile snapshot. The
// onboarding flow (§5) is a strict ordering: capture name, then scope,
// then role/team-or-league. We use first_name as "did step 1 land?" and
// onboarding_completed_at as "did the user finish?". Both fields are
// nullable on older profiles, so this also covers existing users mid-
// migration: anyone without first_name gets bounced to step 1.
type LandingRoute = "/dashboard" | "/onboarding/name";

async function resolveLandingRoute(userId: string): Promise<LandingRoute> {
  const { data, error } = await supabase
    .from("profiles")
    .select("first_name")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    // 42703 (first_name column missing) = pre-migration-47: there's no
    // onboarding flow to drop into yet, so fall through to the dashboard.
    // Same fallback if the profile row is null — handle_new_user trigger
    // from migration 53 should have created it; if it didn't, the
    // dashboard's empty state still works.
    return "/dashboard";
  }

  const profile = data as { first_name: string | null };

  // Step 1 (name) is the only step we hard-gate at the routing layer.
  // Once first_name is set the user can land on /dashboard and pick up
  // wherever — the dashboard's empty state surfaces "New league" and
  // "New team" CTAs that drop them back into the right flow.
  // Force-redirecting mid-onboarding users into /onboarding/scope on
  // every cold-start traps them in the flow if they bail; the dashboard
  // is a friendlier home base.
  if (!profile.first_name || profile.first_name.trim().length === 0) {
    return "/onboarding/name";
  }
  return "/dashboard";
}

function RootLayoutNav() {
  const { session, loading: authLoading } = useAuth();
  const { hasTeam, loading: teamLoading } = useTeam();
  const segments = useSegments();
  const router = useRouter();
  // Wait for the root navigator to register every route before any
  // imperative router.replace fires. Without this guard, redirects to
  // file-system routes race the navigator's mount pass and surface as
  // "REPLACE was not handled by any navigator".
  const navState = useRootNavigationState();
  const navReady = !!navState?.key;

  // We resolve the landing route exactly once per logged-in session.
  // Re-running the profile fetch on every render of this effect would
  // (a) fire a network call on every navigation and (b) yank the user
  // back to /onboarding/name in the middle of typing if the row hasn't
  // been written yet. Tracking the resolved user id keeps it pinned.
  const resolvedForUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!navReady) return;
    if (authLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const onTeamSetup = segments[0] === "team-setup";

    if (!session) {
      resolvedForUserId.current = null;
      if (!inAuthGroup) router.replace("/(auth)/login");
      return;
    }

    // Already resolved for this user — leave subsequent navigation alone.
    if (resolvedForUserId.current === session.user.id) return;

    // Wait for the team context to load before deciding — we use hasTeam
    // below to detect a stale /team-setup landing (user bailed mid-flow
    // and got restored there by expo-router on cold-start).
    if (teamLoading) return;

    // We force-redirect on first encounter of a new session in two cases:
    //   1. Coming from the (auth) group → fresh login, send them to
    //      /onboarding/name or /dashboard based on profile state.
    //   2. Cold-start landed on /team-setup with no team membership →
    //      they bailed mid-onboarding and never finished. The dashboard
    //      is a better home base than re-trapping them in the form.
    // Any other restored route (tabs, league dashboard, etc.) we respect
    // so deep-links and back-nav state survive.
    const userId = session.user.id;
    resolvedForUserId.current = userId;
    const shouldResolve = inAuthGroup || (onTeamSetup && !hasTeam);
    if (!shouldResolve) return;

    resolveLandingRoute(userId)
      .then((path) => router.replace(path))
      .catch(() => router.replace("/dashboard"));
  }, [navReady, session, authLoading, hasTeam, teamLoading, segments, router]);

  const showLoading = authLoading;

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
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      applyDefaultTextFont();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
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
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
