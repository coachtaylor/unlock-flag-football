import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  type ScrollViewProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontWeight, radius } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";
import { Eyebrow } from "../ui/Eyebrow";

// Shared wrapper for every onboarding step. Matches the design's
// OnboardingShell from onboarding-shared.jsx: tiny back chevron + step
// counter, 4-dot progress, title + subtitle block, body, sticky CTA.
//
// Routing decisions live in the screen — this component only renders.
// `onBack === null` hides the back button entirely (used on step 1).
// `onContinue === null` hides the CTA (e.g. while loading initial state).

const TOTAL_STEPS = 4;

type Props = {
  step: 1 | 2 | 3 | 4;
  eyebrow: string;
  title: string;
  subtitle?: string;
  cta?: string;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
  onBack?: (() => void) | null;
  onContinue: () => void;
  children: React.ReactNode;
  scrollProps?: ScrollViewProps;
};

export function OnboardingShell({
  step,
  eyebrow,
  title,
  subtitle,
  cta = "Continue",
  ctaDisabled = false,
  ctaLoading = false,
  onBack,
  onContinue,
  children,
  scrollProps,
}: Props) {
  const insets = useSafeAreaInsets();
  const showBack = onBack !== null && onBack !== undefined;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface.base }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...scrollProps}
        contentContainerStyle={[
          {
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 120,
          },
          scrollProps?.contentContainerStyle,
        ]}
      >
        {/* Top bar — back chevron + step counter */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 18,
            paddingVertical: 8,
          }}
        >
          {showBack ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onBack ?? undefined}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
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
          ) : (
            <View style={{ width: 36 }} />
          )}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <MonoText
              weight="bold"
              style={{
                fontSize: 11.5,
                color: colors.orange[500],
                letterSpacing: 1.4,
              }}
            >
              {String(step).padStart(2, "0")}
            </MonoText>
            <Text
              style={{
                fontSize: 11.5,
                color: colors.text.muted,
                letterSpacing: 1.4,
                fontWeight: fontWeight.semibold,
              }}
            >
              / {String(TOTAL_STEPS).padStart(2, "0")}
            </Text>
            <Eyebrow variant="dim" style={{ marginLeft: 8 }}>
              {eyebrow}
            </Eyebrow>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Progress dots */}
        <View style={{ paddingHorizontal: 18, paddingBottom: 28 }}>
          <ProgressDots step={step} total={TOTAL_STEPS} />
        </View>

        {/* Title block */}
        <View style={{ paddingHorizontal: 22, paddingBottom: 24 }}>
          <Text
            style={[
              fontStyle("bold"),
              {
                fontSize: 30,
                fontWeight: fontWeight.bold,
                letterSpacing: -0.6,
                lineHeight: 32,
                color: colors.text.primary,
              },
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={{
                marginTop: 10,
                fontSize: 15,
                lineHeight: 22,
                color: colors.text.secondary,
                maxWidth: 340,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* Body */}
        <View style={{ paddingHorizontal: 18, gap: 14 }}>{children}</View>
      </ScrollView>

      {/* Sticky CTA */}
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
          onPress={onContinue}
          disabled={ctaDisabled || ctaLoading}
          style={{
            width: "100%",
            height: 52,
            borderRadius: radius.lg,
            backgroundColor:
              ctaDisabled || ctaLoading
                ? "rgba(255,255,255,0.06)"
                : colors.orange[500],
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
          }}
        >
          {ctaLoading ? (
            <ActivityIndicator color={colors.text.onBrand} size="small" />
          ) : null}
          <Text
            style={[
              fontStyle("semibold"),
              {
                fontSize: 15,
                fontWeight: fontWeight.semibold,
                color:
                  ctaDisabled || ctaLoading
                    ? colors.text.muted
                    : colors.text.onBrand,
              },
            ]}
          >
            {cta}
          </Text>
          {!ctaDisabled && !ctaLoading ? (
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
// ProgressDots
// ─────────────────────────────────────────────────────────────────────
//
// Four pills: completed (orange, dimmed), current (orange, full), next
// (faded orange preview), and far-future (line-soft). Matches the
// `.fr-prog` CSS rhythm in the design bundle.

function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {Array.from({ length: total }).map((_, i) => {
        const idx = i + 1;
        const isPast = idx < step;
        const isCurrent = idx === step;
        const isNext = idx === step + 1;
        const bg = isPast
          ? "rgba(255,106,26,0.55)"
          : isCurrent
            ? colors.orange[500]
            : isNext
              ? "rgba(255,106,26,0.30)"
              : "rgba(255,255,255,0.06)";
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: bg,
            }}
          />
        );
      })}
    </View>
  );
}
