import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../../constants/design";
import { fontStyle } from "../../constants/typography";

// Bottom-sheet modal — slide-up panel with a dark scrim, rounded top
// corners, and a drag handle. Tapping the scrim closes; taps inside the
// panel are swallowed. Shared by the drill-library filter/sort sheets and
// the preset-library filter sheet (extracted from drills/index.tsx so the
// two screens don't drift).
export function SheetContainer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Scrim sits BEHIND the panel as a sibling (not a parent) so the panel
          is a plain View — a Pressable parent would claim the touch responder
          and a nested ScrollView would never scroll. Taps on the visible scrim
          above the panel close; taps inside the panel do nothing. */}
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
        />
        <View
          style={{
            maxHeight: "88%",
            backgroundColor: colors.surface.raised,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderTopWidth: 1,
            borderColor: colors.border.card,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.xl,
            gap: spacing.lg,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border.strong,
            }}
          />
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function SheetSectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={[
        fontStyle("bold"),
        {
          fontSize: 11,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: colors.text.label,
        },
      ]}
    >
      {children}
    </Text>
  );
}
