import { ReactNode } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, fontFamily, radius, spacing } from "../../constants/design";
import {
  SessionPlayer,
  Tone,
  toneColor,
  toneTint,
} from "../../lib/benchmark-session";

const lightHaptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

// ── Top bar ─────────────────────────────────────────────────────────
export function CaptureTopBar({
  label,
  tone = "orange",
  onBack,
  onClose,
}: {
  label: string;
  tone?: Tone;
  onBack: () => void;
  onClose: () => void;
}) {
  const color = toneColor(tone);
  const bg = toneTint(tone);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 10,
      }}
    >
      <TouchableOpacity
        onPress={onBack}
        hitSlop={10}
        accessibilityLabel="Back"
        activeOpacity={0.7}
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          backgroundColor: colors.surface.raised,
          borderWidth: 1,
          borderColor: colors.border.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="chevron-back" size={18} color={colors.text.primary} />
      </TouchableOpacity>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 11,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: bg,
        }}
      >
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: color,
          }}
        />
        <Text
          style={{
            fontSize: 10.5,
            fontFamily: fontFamily.sansBold,
            letterSpacing: 1,
            color,
          }}
        >
          {label}
        </Text>
      </View>
      <View style={{ flex: 1 }} />
      <TouchableOpacity
        onPress={onClose}
        hitSlop={10}
        accessibilityLabel="Close"
        activeOpacity={0.7}
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          backgroundColor: colors.surface.raised,
          borderWidth: 1,
          borderColor: colors.border.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="close" size={16} color={colors.text.primary} />
      </TouchableOpacity>
    </View>
  );
}

// ── Queue label (left text + optional right hint / switch CTA) ─────
export function QueueLabel({
  left,
  right,
  onRightPress,
}: {
  left: string;
  right?: string;
  onRightPress?: () => void;
}) {
  const rightNode = right ? (
    <Text
      style={{
        fontSize: 13,
        fontFamily: onRightPress ? fontFamily.sansBold : fontFamily.mono,
        letterSpacing: 0.4,
        color: onRightPress ? colors.orange[400] : colors.text.muted,
      }}
    >
      {right}
    </Text>
  ) : null;
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 18,
        paddingTop: 6,
        paddingBottom: 6,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontFamily: fontFamily.sansBold,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: colors.text.subtle,
        }}
      >
        {left}
      </Text>
      {right ? (
        onRightPress ? (
          <TouchableOpacity onPress={onRightPress} hitSlop={8} activeOpacity={0.6}>
            {rightNode}
          </TouchableOpacity>
        ) : (
          rightNode
        )
      ) : null}
    </View>
  );
}

// ── Queue (horizontal scroll of player tiles) ──────────────────────
export type QueueState = "done" | "now" | "next";

export type QueueItem = {
  playerId: string;
  initials: string;
  color: string;
  last: string; // "04.86", "✓", "NOW", "—"
  state: QueueState;
};

export function PlayerQueue({
  items,
  onTap,
}: {
  items: QueueItem[];
  onTap: (playerId: string) => void;
}) {
  // flexGrow: 0 + a fixed height prevents the horizontal ScrollView from
  // expanding to fill the parent column (RN default for horizontal scrolls).
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, flexShrink: 0, height: 80 }}
      contentContainerStyle={{
        paddingHorizontal: 14,
        paddingBottom: 10,
        gap: 8,
        alignItems: "flex-start",
      }}
    >
      {items.map((p) => {
        const isNow = p.state === "now";
        const isDone = p.state === "done";
        return (
          <TouchableOpacity
            key={p.playerId}
            onPress={() => {
              lightHaptic();
              onTap(p.playerId);
            }}
            activeOpacity={0.8}
            style={{
              width: 64,
              backgroundColor: isNow
                ? "rgba(255, 106, 26, 0.10)"
                : colors.surface.raised,
              borderWidth: 1,
              borderColor: isNow ? colors.orange[500] : colors.border.card,
              borderRadius: radius.lg,
              paddingVertical: 8,
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: p.color,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: fontFamily.sansBold,
                  color: colors.text.onBrand,
                }}
              >
                {p.initials}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={{
                marginTop: 6,
                fontSize: 9.5,
                fontFamily: fontFamily.monoBold,
                color: isNow
                  ? colors.orange[400]
                  : isDone
                  ? colors.lime[400]
                  : colors.text.muted,
              }}
            >
              {p.last}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── Banner ──────────────────────────────────────────────────────────
export function PlayerBanner({
  player,
  role,
  setIndex,
  setTotal,
  pb,
  last,
  tone = "orange",
}: {
  player: SessionPlayer;
  role: string;
  setIndex: number;
  setTotal: number;
  pb?: string | null;
  last?: string | null;
  tone?: Tone;
}) {
  const accent = toneColor(tone);
  return (
    <View
      style={{
        marginHorizontal: 14,
        marginBottom: 12,
        padding: 14,
        backgroundColor: colors.surface.raised,
        borderWidth: 1,
        borderColor: colors.border.card,
        borderRadius: radius.xl,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: player.color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontFamily: fontFamily.sansBold,
            color: colors.text.onBrand,
          }}
        >
          {player.initials}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: 9.5,
            fontFamily: fontFamily.sansBold,
            letterSpacing: 1,
            color: accent,
          }}
        >
          {role}
        </Text>
        <Text
          style={{
            fontSize: 15,
            fontFamily: fontFamily.sansBold,
            color: colors.text.primary,
            letterSpacing: -0.2,
          }}
          numberOfLines={1}
        >
          {player.name}
        </Text>
        {pb || last ? (
          <Text
            style={{
              fontSize: 10.5,
              color: colors.text.muted,
              fontFamily: fontFamily.sansMedium,
            }}
            numberOfLines={1}
          >
            {pb ? (
              <>
                PB{" "}
                <Text
                  style={{
                    fontFamily: fontFamily.mono,
                    color: colors.text.subtle,
                  }}
                >
                  {pb}
                </Text>
              </>
            ) : null}
            {pb && last ? "  ·  " : null}
            {last ? (
              <>
                last{" "}
                <Text
                  style={{
                    fontFamily: fontFamily.mono,
                    color: colors.text.subtle,
                  }}
                >
                  {last}
                </Text>
              </>
            ) : null}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 999,
          backgroundColor: colors.surface.overlay,
          borderWidth: 1,
          borderColor: colors.border.card,
        }}
      >
        <Text
          style={{
            fontSize: 10.5,
            fontFamily: fontFamily.sansBold,
            color: colors.text.primary,
          }}
        >
          Set{" "}
          <Text style={{ color: accent, fontFamily: fontFamily.monoBold }}>
            {setIndex}
          </Text>{" "}
          of {setTotal}
        </Text>
      </View>
    </View>
  );
}

// ── Footer (Skip / Save) ────────────────────────────────────────────
export function CaptureFooter({
  secondary = "Skip set",
  primary = "Save set · next",
  tone = "orange",
  onSecondary,
  onPrimary,
  primaryDisabled,
  saving,
  bottomInset = 0,
}: {
  secondary?: string;
  primary?: string;
  tone?: Tone;
  onSecondary: () => void;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  saving?: boolean;
  bottomInset?: number;
}) {
  const accent = toneColor(tone);
  const accentText = tone === "blue" ? "#062239" : colors.text.onBrand;
  return (
    <View
      style={{
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 18 + bottomInset,
        borderTopWidth: 1,
        borderTopColor: colors.border.subtle,
        backgroundColor: colors.surface.base,
        flexDirection: "row",
        gap: 8,
      }}
    >
      <TouchableOpacity
        onPress={onSecondary}
        activeOpacity={0.7}
        style={{
          flex: 1,
          height: 48,
          borderRadius: radius.xl,
          backgroundColor: colors.surface.overlay,
          borderWidth: 1,
          borderColor: colors.border.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontFamily: fontFamily.sansBold,
            color: colors.text.primary,
          }}
        >
          {secondary}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onPrimary}
        disabled={primaryDisabled || saving}
        activeOpacity={0.85}
        style={{
          flex: 2,
          height: 48,
          borderRadius: radius.xl,
          backgroundColor: accent,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          opacity: primaryDisabled || saving ? 0.5 : 1,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontFamily: fontFamily.sansBold,
            color: accentText,
            letterSpacing: 0.3,
          }}
        >
          {saving ? "Saving…" : primary}
        </Text>
        {!saving ? (
          <Ionicons name="arrow-forward" size={14} color={accentText} />
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

// ── Shell wrapper ───────────────────────────────────────────────────
export function CaptureShell({
  topLabel,
  topTone = "orange",
  onBack,
  onClose,
  queueLeft,
  queueRight,
  onQueueRightPress,
  queue,
  onQueueTap,
  banner,
  children,
  footer,
  topPaddingInset = 0,
}: {
  topLabel: string;
  topTone?: Tone;
  onBack: () => void;
  onClose: () => void;
  queueLeft: string;
  queueRight?: string;
  onQueueRightPress?: () => void;
  queue: QueueItem[];
  onQueueTap: (playerId: string) => void;
  banner: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  topPaddingInset?: number;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.base }}>
      <View style={{ paddingTop: topPaddingInset }} />
      <CaptureTopBar
        label={topLabel}
        tone={topTone}
        onBack={onBack}
        onClose={onClose}
      />
      <QueueLabel
        left={queueLeft}
        right={queueRight}
        onRightPress={onQueueRightPress}
      />
      <PlayerQueue items={queue} onTap={onQueueTap} />
      {banner}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 14,
          paddingBottom: 8,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}
