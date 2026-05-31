import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Button } from "./Button";
import { colors, radius, spacing } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";

export type PastDueAction = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "destructive";
};

// Centered modal shown when a coach opens a past-due practice. Red "PAST
// DUE" eyebrow + a short prompt + a stack of full-width action buttons.
// Used on the live run screen (Resume / Log) and the plan detail screen
// (Reschedule / Log / Delete). Tapping the scrim dismisses.
export function PastDueModal({
  open,
  onClose,
  title,
  body,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  actions: PastDueAction[];
}) {
  return (
    <Modal
      visible={open}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: 380,
            backgroundColor: colors.surface.raised,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border.card,
            padding: spacing.xl,
            gap: spacing.md,
          }}
        >
          <MonoText
            weight="bold"
            style={{
              fontSize: 11,
              color: colors.red.semantic,
              letterSpacing: 1.2,
              textTransform: "uppercase",
            }}
          >
            Past Due
          </MonoText>
          <Text
            style={[
              fontStyle("bold"),
              { fontSize: 18, color: colors.text.primary },
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              fontStyle("regular"),
              { fontSize: 14, lineHeight: 20, color: colors.text.secondary },
            ]}
          >
            {body}
          </Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {actions.map((a) => (
              <Button
                key={a.label}
                label={a.label}
                variant={a.variant ?? "secondary"}
                onPress={a.onPress}
              />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
