import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Animated, Text } from "react-native";
import { colors, radius, spacing } from "../../constants/design";

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        lineHeight: 14,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: colors.text.label,
        fontWeight: "500",
        marginBottom: spacing.sm,
      }}
    >
      {children}
    </Text>
  );
}

export function Section({ children }: { children: ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ translateY }],
        backgroundColor: colors.surface.raised,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border.card,
        padding: spacing.lg,
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      {children}
    </Animated.View>
  );
}
