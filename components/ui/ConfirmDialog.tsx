import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Button } from "./Button";
import { colors, radius, spacing } from "../../constants/design";
import { fontStyle } from "../../constants/typography";

// Centered destructive-confirmation dialog. Scrim-backed card with a title,
// body, optional error line, and Cancel / destructive-confirm buttons.
// Tapping the scrim cancels (unless pending). Shared by the drill detail
// "Delete drill?" flow and the preset-library "Remove from library?" flow.
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  body,
  confirmLabel,
  pendingLabel,
  pending = false,
  error = null,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  pendingLabel: string;
  pending?: boolean;
  error?: string | null;
}) {
  return (
    <Modal
      visible={open}
      animationType="fade"
      transparent
      onRequestClose={() => !pending && onCancel()}
    >
      <Pressable
        onPress={() => !pending && onCancel()}
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
          <Text style={[fontStyle("bold"), { fontSize: 18, color: colors.text.primary }]}>
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
          {error ? (
            <Text style={{ fontSize: 13, color: colors.errorLight }}>{error}</Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={onCancel}
                disabled={pending}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={pending ? pendingLabel : confirmLabel}
                variant="destructive"
                onPress={onConfirm}
                disabled={pending}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
