import { useEffect, useRef, useState } from "react";
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, fontFamily, radius, spacing } from "../../constants/design";

const lightHaptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

// ── Section eyebrows / pills ─────────────────────────────────────────
export function MetricEyebrow({
  label,
  emphasis,
}: {
  label: string;
  emphasis?: string;
}) {
  return (
    <Text
      style={{
        fontSize: 11,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: colors.text.subtle,
        fontFamily: fontFamily.sansBold,
      }}
    >
      {emphasis ? (
        <Text style={{ color: colors.text.primary }}>{emphasis} </Text>
      ) : null}
      {label}
    </Text>
  );
}

export function DirectionPill({
  kind,
}: {
  kind: "higher" | "lower" | "required" | "computed";
}) {
  const cfg = {
    higher: {
      label: "HIGHER = BETTER",
      color: colors.lime[400],
      bg: colors.lime.tint,
    },
    lower: {
      label: "LOWER = BETTER",
      color: colors.red.semantic,
      bg: "rgba(255, 77, 77, 0.14)",
    },
    required: {
      label: "REQUIRED",
      color: colors.blue[400],
      bg: colors.blue.tint,
    },
    computed: {
      label: "COMPUTED",
      color: colors.text.secondary,
      bg: colors.surface.muted,
    },
  }[kind];
  return (
    <View
      style={{
        backgroundColor: cfg.bg,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radius.pill,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontFamily: fontFamily.sansBold,
          letterSpacing: 0.8,
          color: cfg.color,
        }}
      >
        {cfg.label}
      </Text>
    </View>
  );
}

// ── Set progress dots ───────────────────────────────────────────────
export function SetProgressDots({
  done,
  current,
  total,
  tone = "orange",
}: {
  done: number;
  current: number;
  total: number;
  tone?: "orange" | "blue" | "red";
}) {
  const accent =
    tone === "blue"
      ? colors.blue[400]
      : tone === "red"
      ? colors.red.semantic
      : colors.orange[500];
  const glow =
    tone === "blue"
      ? "rgba(110, 168, 255, 0.25)"
      : tone === "red"
      ? "rgba(255, 77, 77, 0.25)"
      : "rgba(255, 106, 26, 0.25)";
  return (
    <View style={{ flexDirection: "row", gap: spacing.xs + 2 }}>
      {Array.from({ length: total }).map((_, i) => {
        const isDone = i < done;
        const isNow = i === current - 1;
        return (
          <View
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: isDone || isNow ? accent : colors.border.strong,
              ...(isNow
                ? {
                    borderWidth: 3,
                    borderColor: glow,
                  }
                : null),
            }}
          />
        );
      })}
    </View>
  );
}

export function SetProgressRow({
  done,
  current,
  total,
  label = "SET PROGRESS",
  tone,
}: {
  done: number;
  current: number;
  total: number;
  label?: string;
  tone?: "orange" | "blue" | "red";
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontFamily: fontFamily.sansBold,
          letterSpacing: 1,
          color: colors.text.subtle,
        }}
      >
        {label}
      </Text>
      <SetProgressDots done={done} current={current} total={total} tone={tone} />
    </View>
  );
}

// ── Stopwatch (timed) ───────────────────────────────────────────────
export function Stopwatch({
  value,
  onChange,
  running,
  onToggle,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  running: boolean;
  onToggle: () => void;
}) {
  const startRef = useRef<number | null>(null);
  const baseRef = useRef<number>(value ?? 0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now();
    baseRef.current = value ?? 0;
    const id = setInterval(() => setTick((n) => n + 1), 50);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && startRef.current != null) {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const next = +(baseRef.current + elapsed).toFixed(2);
      if (next !== value) onChange(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const display = (value ?? 0).toFixed(2);

  return (
    <View
      style={{
        backgroundColor: colors.surface.overlay,
        borderWidth: 1,
        borderColor: colors.border.card,
        borderRadius: radius.card,
        padding: spacing.xl,
      }}
    >
      <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
        <Text
          style={{
            fontFamily: fontFamily.monoBold,
            fontSize: 56,
            lineHeight: 60,
            color: colors.text.primary,
            letterSpacing: -1.5,
          }}
        >
          {display}
        </Text>
        <Text
          style={{
            fontSize: 10,
            fontFamily: fontFamily.sansBold,
            letterSpacing: 1.6,
            color: colors.text.subtle,
            marginTop: 2,
          }}
        >
          SECONDS
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => {
          lightHaptic();
          onToggle();
        }}
        activeOpacity={0.85}
        style={{
          width: "100%",
          height: 52,
          borderRadius: radius.xl,
          backgroundColor: running ? colors.red.semantic : colors.orange[500],
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: spacing.sm,
        }}
      >
        {running ? (
          <View
            style={{
              width: 11,
              height: 11,
              backgroundColor: "#FFFFFF",
              borderRadius: 2,
            }}
          />
        ) : (
          <Ionicons name="play" size={14} color={colors.text.onBrand} />
        )}
        <Text
          style={{
            fontFamily: fontFamily.sansBold,
            fontSize: 14,
            letterSpacing: 1.2,
            color: running ? "#FFFFFF" : colors.text.onBrand,
          }}
        >
          {running ? "STOP" : value != null && value > 0 ? "RESUME" : "START"}
        </Text>
      </TouchableOpacity>
      {value != null && value > 0 && !running ? (
        <TouchableOpacity
          onPress={() => onChange(null)}
          hitSlop={8}
          activeOpacity={0.6}
          style={{
            alignSelf: "center",
            marginTop: spacing.md,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: colors.text.muted,
              fontFamily: fontFamily.sansMedium,
            }}
          >
            Reset
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Counter (reps / flags / drops) ──────────────────────────────────
export function Counter({
  value,
  onChange,
  inverse = false,
  attempts,
}: {
  value: number;
  onChange: (next: number) => void;
  inverse?: boolean;
  attempts?: number | null;
}) {
  const dec = () => {
    if (value <= 0) return;
    lightHaptic();
    onChange(value - 1);
  };
  const inc = () => {
    if (attempts != null && value >= attempts) return;
    lightHaptic();
    onChange(value + 1);
  };

  const accent = inverse ? colors.red.semantic : colors.orange[500];
  const minusBg = inverse ? "rgba(255, 77, 77, 0.12)" : colors.surface.overlay;
  const minusBorder = inverse
    ? "rgba(255, 77, 77, 0.30)"
    : colors.border.strong;
  const minusColor = inverse ? colors.errorLight : colors.text.primary;
  const numColor = inverse ? colors.red.semantic : colors.text.primary;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.md,
      }}
    >
      <TouchableOpacity
        onPress={dec}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Decrement"
        activeOpacity={0.7}
        disabled={value <= 0}
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.card,
          backgroundColor: minusBg,
          borderWidth: 1,
          borderColor: minusBorder,
          alignItems: "center",
          justifyContent: "center",
          opacity: value <= 0 ? 0.4 : 1,
        }}
      >
        <Text
          style={{
            fontSize: 28,
            fontFamily: fontFamily.sansMedium,
            color: minusColor,
          }}
        >
          −
        </Text>
      </TouchableOpacity>

      <View style={{ flex: 1, alignItems: "center" }}>
        <Text
          style={{
            fontFamily: fontFamily.monoBold,
            fontSize: 44,
            lineHeight: 48,
            color: numColor,
            letterSpacing: -1,
          }}
        >
          {value}
          {attempts != null ? (
            <Text
              style={{
                color: colors.text.muted,
                fontFamily: fontFamily.monoBold,
                fontSize: 28,
              }}
            >
              /{attempts}
            </Text>
          ) : null}
        </Text>
      </View>

      <TouchableOpacity
        onPress={inc}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Increment"
        activeOpacity={0.85}
        disabled={attempts != null && value >= attempts}
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.card,
          backgroundColor: accent,
          alignItems: "center",
          justifyContent: "center",
          opacity: attempts != null && value >= attempts ? 0.4 : 1,
        }}
      >
        <Text
          style={{
            fontSize: 30,
            fontFamily: fontFamily.sansBold,
            color: "#FFFFFF",
          }}
        >
          +
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Attempt grid (pct) ──────────────────────────────────────────────
export type AttemptState = "made" | "miss" | "pending";

export function AttemptGrid({
  attempts,
  onTap,
}: {
  attempts: AttemptState[];
  onTap: (index: number) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: spacing.xs + 2,
      }}
    >
      {attempts.map((a, i) => {
        const made = a === "made";
        const miss = a === "miss";
        const pending = a === "pending";
        return (
          <TouchableOpacity
            key={i}
            onPress={() => {
              lightHaptic();
              onTap(i);
            }}
            activeOpacity={0.75}
            style={{
              flex: 1,
              aspectRatio: 1,
              borderRadius: radius.lg,
              backgroundColor: made
                ? colors.lime.tint
                : miss
                ? "rgba(255, 77, 77, 0.12)"
                : colors.surface.overlay,
              borderWidth: 1,
              borderStyle: pending ? "dashed" : "solid",
              borderColor: made
                ? "rgba(194, 255, 61, 0.32)"
                : miss
                ? "rgba(255, 77, 77, 0.32)"
                : colors.border.strong,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontFamily: fontFamily.monoBold,
                color: colors.text.subtle,
                position: "absolute",
                top: 6,
              }}
            >
              {i + 1}
            </Text>
            {made ? (
              <Ionicons name="checkmark" size={22} color={colors.lime[400]} />
            ) : miss ? (
              <Ionicons name="close" size={22} color={colors.red.semantic} />
            ) : (
              <Text
                style={{
                  fontSize: 20,
                  color: colors.text.muted,
                  fontFamily: fontFamily.sansMedium,
                }}
              >
                ·
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Rating row (rated 1-5) ──────────────────────────────────────────
const RATING_WORDS = ["Poor", "Off", "OK", "Solid", "Sharp"];

export function RatingRow({
  value,
  onChange,
  tone = "orange",
}: {
  value: number | null;
  onChange: (next: number) => void;
  tone?: "orange" | "blue";
}) {
  const accent = tone === "blue" ? colors.blue[400] : colors.orange[500];
  const accentText = tone === "blue" ? "#062239" : colors.text.onBrand;
  return (
    <View>
      <View style={{ flexDirection: "row", gap: spacing.xs + 2 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <TouchableOpacity
              key={n}
              onPress={() => {
                lightHaptic();
                onChange(n);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Rating ${n}`}
              activeOpacity={0.85}
              style={{
                flex: 1,
                paddingVertical: spacing.lg,
                borderRadius: radius.lg,
                backgroundColor: active ? accent : colors.surface.overlay,
                borderWidth: active ? 0 : 1,
                borderColor: colors.border.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: fontFamily.monoBold,
                  fontSize: 20,
                  color: active ? accentText : colors.text.primary,
                }}
              >
                {n}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View
        style={{
          flexDirection: "row",
          marginTop: spacing.md,
        }}
      >
        {RATING_WORDS.map((w, i) => {
          const active = value === i + 1;
          return (
            <Text
              key={w}
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 9.5,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: active ? accent : colors.text.muted,
                fontFamily: active ? fontFamily.sansBold : fontFamily.sansMedium,
              }}
            >
              {w}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

// ── Observation row ─────────────────────────────────────────────────
export function ObservationRow({
  label = "Add observation",
  onPress,
  hasNote,
  style,
}: {
  label?: string;
  onPress: () => void;
  hasNote?: boolean;
  style?: ViewStyle;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: colors.surface.overlay,
        borderWidth: 1,
        borderColor: colors.border.card,
        borderRadius: radius.lg,
        paddingHorizontal: 13,
        paddingVertical: 11,
        ...style,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons
          name={hasNote ? "chatbubble-ellipses-outline" : "add"}
          size={14}
          color={hasNote ? colors.orange[400] : colors.text.muted}
        />
        <Text
          style={{
            fontSize: 12,
            color: hasNote ? colors.text.primary : colors.text.subtle,
            fontFamily: fontFamily.sansMedium,
          }}
        >
          {hasNote ? "Edit observation" : label}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.orange[400]} />
    </TouchableOpacity>
  );
}

// ── Manual time input fallback (when user prefers typing) ───────────
export function ManualTimeInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const [text, setText] = useState(value != null ? value.toFixed(2) : "");
  useEffect(() => {
    setText(value != null ? value.toFixed(2) : "");
  }, [value]);
  return (
    <TextInput
      value={text}
      onChangeText={(t) => {
        setText(t);
        const n = Number(t);
        if (t.trim() === "") onChange(null);
        else if (Number.isFinite(n) && n >= 0) onChange(+n.toFixed(2));
      }}
      placeholder="0.00"
      placeholderTextColor={colors.text.muted}
      keyboardType="decimal-pad"
      returnKeyType="done"
      style={{
        backgroundColor: colors.surface.overlay,
        borderWidth: 1,
        borderColor: colors.border.card,
        borderRadius: radius.lg,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        fontFamily: fontFamily.monoBold,
        fontSize: 22,
        color: colors.text.primary,
        textAlign: "center",
      }}
    />
  );
}

// Re-export needed types
export type { ViewStyle };
