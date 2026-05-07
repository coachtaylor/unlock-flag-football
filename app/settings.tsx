import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../components/ui/Button";
import { colors, radius, spacing } from "../constants/design";
import { useAuth } from "../lib/auth-context";
import { useTeam } from "../lib/team-context";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { teamName } = useTeam();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          gap: spacing.md,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            marginLeft: -spacing.md,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={colors.text.primary}
          />
        </Pressable>
        <Text
          style={{
            fontSize: 20,
            lineHeight: 26,
            fontWeight: "500",
            color: colors.text.primary,
          }}
        >
          Settings
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: insets.bottom + spacing["3xl"],
        }}
        showsVerticalScrollIndicator={false}
      >
        <SettingsCard label="Account">
          <RowItem
            icon="mail-outline"
            label="Email"
            value={user?.email ?? "—"}
          />
        </SettingsCard>

        <View style={{ height: spacing.lg }} />

        <SettingsCard label="Team">
          <RowItem
            icon="people-outline"
            label="Team"
            value={teamName ?? "—"}
          />
        </SettingsCard>

        <View style={{ marginTop: spacing["3xl"] }}>
          <Button label="Sign Out" variant="destructive" onPress={signOut} />
        </View>
      </ScrollView>
    </View>
  );
}

function SettingsCard({
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
          lineHeight: 14,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: colors.text.secondary,
          fontWeight: "500",
          marginBottom: spacing.sm,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          backgroundColor: colors.surface.raised,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.border.subtle,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function RowItem({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        padding: spacing.lg,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
      }}
    >
      <Ionicons name={icon} size={20} color={colors.text.secondary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 11,
            lineHeight: 14,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: colors.text.muted,
            fontWeight: "500",
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 15,
            lineHeight: 22,
            color: colors.text.primary,
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}
