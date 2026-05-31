import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  colors,
  fontWeight,
  radius,
  spacing,
  tracking,
} from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";
import {
  TEAM_COLORS,
  teamColorHex,
  type TeamColorKey,
} from "../../constants/team-colors";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { Eyebrow } from "../../components/ui/Eyebrow";

type LeagueFormat = "5v5" | "7v7" | "both";

const FORMAT_OPTIONS: { value: LeagueFormat; label: string }[] = [
  { value: "5v5", label: "5v5" },
  { value: "7v7", label: "7v7" },
  { value: "both", label: "Both" },
];

export default function CreateLeagueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [format, setFormat] = useState<LeagueFormat>("7v7");
  const [color, setColor] = useState<TeamColorKey>("orange");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const ready = trimmedName.length > 0 && !submitting;
  const colorHex = useMemo(() => teamColorHex(color), [color]);
  const initial = (trimmedName[0] ?? "L").toUpperCase();

  async function onCreate() {
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc(
      "create_league_with_admin",
      {
        p_league_name: trimmedName,
        p_format: format,
        p_league_color: color,
      },
    );
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const newLeagueId = data as string | null;
    if (!newLeagueId) {
      setError("League was created but no id was returned. Try refreshing.");
      return;
    }

    // Mark onboarding complete — entering through the league branch
    // counts as finishing the flow. Mirrors the same write in
    // team-setup.tsx so routing doesn't bounce the user back here on
    // their next session. Guarded with .is(null) so we never overwrite
    // an existing completion timestamp.
    if (user) {
      await supabase
        .from("profiles")
        .update({
          onboarding_completed_at: new Date().toISOString(),
          onboarding_step: 4,
        })
        .eq("id", user.id)
        .is("onboarding_completed_at", null);
    }

    router.replace(`/dashboard/league/${newLeagueId}`);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 120,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 18,
            paddingTop: 8,
            paddingBottom: 8,
          }}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.back()}
            style={{
              height: 36,
              width: 36,
              borderRadius: 12,
              backgroundColor: colors.surface.raised,
              borderWidth: 1,
              borderColor: colors.border.default,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="chevron-back"
              size={16}
              color={colors.text.primary}
            />
          </TouchableOpacity>
          <Eyebrow variant="dim">LEAGUE SETUP</Eyebrow>
          <View style={{ width: 36 }} />
        </View>

        {/* Title block */}
        <View style={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 24 }}>
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 30,
                fontWeight: fontWeight.bold,
                letterSpacing: -0.6,
                color: colors.text.primary,
                lineHeight: 32,
              },
            ]}
          >
            Name your league.
          </Text>
          <Text
            style={{
              marginTop: 10,
              fontSize: 15,
              lineHeight: 22,
              color: colors.text.secondary,
              maxWidth: 340,
            }}
          >
            You'll add teams next.
          </Text>
        </View>

        {/* Live identity preview */}
        <View style={{ paddingHorizontal: 18, gap: 14 }}>
          <View
            style={{
              backgroundColor: colors.surface.raised,
              borderWidth: 1,
              borderColor: colors.border.default,
              borderRadius: radius.xl,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: colorHex,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MonoText
                weight="bold"
                style={{
                  fontSize: 18,
                  color: colors.text.onBrand,
                  letterSpacing: -0.7,
                }}
              >
                {initial}
              </MonoText>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text
                style={[
                  fontStyle("bold"),
                  {
                    fontSize: 15,
                    fontWeight: fontWeight.bold,
                    letterSpacing: -0.15,
                    color: ready
                      ? colors.text.primary
                      : colors.text.muted,
                  },
                ]}
                numberOfLines={1}
              >
                {ready ? trimmedName : "Your league name"}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <MonoText
                  style={{ fontSize: 11, color: colors.text.secondary }}
                >
                  {format.toUpperCase()}
                </MonoText>
                <Text style={{ color: colors.text.muted, fontSize: 11 }}>
                  ·
                </Text>
                <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                  0 teams
                </Text>
                <Text style={{ color: colors.text.muted, fontSize: 11 }}>
                  ·
                </Text>
                <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                  You're admin
                </Text>
              </View>
            </View>
          </View>

          {/* League name field */}
          <Field label="League name">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g., Miami Youth Flag"
              placeholderTextColor={colors.text.muted}
              autoFocus
              autoCapitalize="words"
              returnKeyType="next"
              style={inputStyle}
            />
          </Field>

          {/* Format */}
          <Field
            label="Default format"
            rightLabel="teams can override"
          >
            <Segmented
              value={format}
              onChange={setFormat}
              options={FORMAT_OPTIONS}
            />
          </Field>

          {/* Color */}
          <Field
            label="League color"
            rightLabel={
              <MonoText style={{ fontSize: 10.5, color: colorHex }}>
                {colorHex.toUpperCase()}
              </MonoText>
            }
          >
            <ColorSwatchRow value={color} onChange={setColor} />
          </Field>

          {/* Helper note */}
          <View
            style={{
              marginTop: 4,
              flexDirection: "row",
              gap: 8,
              padding: 14,
              backgroundColor: "rgba(255,255,255,0.025)",
              borderWidth: 1,
              borderColor: colors.border.subtle,
              borderRadius: radius.lg,
            }}
          >
            <Ionicons
              name="flash-outline"
              size={12}
              color={colors.orange[500]}
              style={{ marginTop: 2 }}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 12,
                lineHeight: 17,
                color: colors.text.secondary,
              }}
            >
              The league color shows up on the league dashboard header. Each
              team picks its own.
            </Text>
          </View>

          {error ? (
            <Text style={{ fontSize: 13, color: colors.error }}>{error}</Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky footer CTA */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 16,
          paddingTop: 16,
          backgroundColor: colors.surface.base,
          borderTopWidth: 1,
          borderTopColor: colors.border.subtle,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onCreate}
          disabled={!ready}
          style={{
            width: "100%",
            height: 52,
            borderRadius: radius.lg,
            backgroundColor: ready
              ? colors.orange[500]
              : "rgba(255,255,255,0.06)",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
          }}
        >
          {submitting ? (
            <ActivityIndicator color={colors.text.onBrand} size="small" />
          ) : null}
          <Text
            style={[
              fontStyle("semibold"),
              {
                fontSize: 15,
                fontWeight: fontWeight.semibold,
                color: ready ? colors.text.onBrand : colors.text.muted,
              },
            ]}
          >
            Create league
          </Text>
          {ready && !submitting ? (
            <Ionicons
              name="arrow-forward"
              size={14}
              color={colors.text.onBrand}
            />
          ) : null}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Atoms (local to this screen)
// ─────────────────────────────────────────────────────────────────────

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
  rightLabel,
  children,
}: {
  label: string;
  rightLabel?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: spacing.sm,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: colors.text.label,
            fontWeight: fontWeight.medium,
          }}
        >
          {label}
        </Text>
        {rightLabel ? (
          <>
            <View style={{ flex: 1 }} />
            {typeof rightLabel === "string" ? (
              <Text
                style={{
                  fontSize: 11,
                  color: colors.text.muted,
                  marginLeft: 8,
                }}
              >
                · {rightLabel}
              </Text>
            ) : (
              rightLabel
            )}
          </>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: LeagueFormat;
  onChange: (v: LeagueFormat) => void;
  options: { value: LeagueFormat; label: string }[];
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.surface.overlay,
        borderWidth: 1,
        borderColor: colors.border.strong,
        borderRadius: 12,
        padding: 4,
        gap: 2,
      }}
    >
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 9,
              backgroundColor: selected ? colors.orange[500] : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={[
                fontStyle("semibold"),
                {
                  fontSize: 13,
                  fontWeight: fontWeight.semibold,
                  color: selected
                    ? colors.surface.base
                    : colors.text.secondary,
                  letterSpacing: tracking.tight,
                },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ColorSwatchRow({
  value,
  onChange,
}: {
  value: TeamColorKey;
  onChange: (v: TeamColorKey) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
      {TEAM_COLORS.map((c) => {
        const selected = value === c.id;
        return (
          <Pressable
            key={c.id}
            onPress={() => onChange(c.id)}
            accessibilityLabel={`Select ${c.label}`}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: c.hex,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: selected ? colors.text.primary : "transparent",
            }}
          >
            {selected ? (
              <Ionicons
                name="checkmark"
                size={16}
                color={colors.surface.base}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
