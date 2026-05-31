import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
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
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
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
        </Pressable>
      </Pressable>
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
