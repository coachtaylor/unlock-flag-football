import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, radius, spacing } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";
import { isUntitledPlanTitle } from "../../lib/practice";

// Destructive confirmation for permanently deleting an archived practice.
// To prevent an accidental tap from wiping a plan + its logged data, the
// coach must type the practice title back exactly (case-sensitive). The
// Delete button stays disabled until the typed value matches.
//
// Untitled practices have no name to match against, so they fall back to a
// plain confirm (still a deliberate two-tap action, just no typing gate).
export function DeleteConfirmModal({
  open,
  onClose,
  title,
  onConfirm,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * The practice title the coach must re-type to confirm (case-sensitive).
   * Empty/whitespace => the practice is untitled and the typing gate is
   * skipped.
   */
  title: string | null | undefined;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  // A real, user-given name requires typing to confirm; placeholder/blank
  // titles fall back to a plain confirm.
  const hasTitle = !isUntitledPlanTitle(title);
  const matches = !hasTitle || value === title;

  return (
    <Modal visible={open} animationType="fade" transparent onRequestClose={onClose}>
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
            Delete permanently
          </MonoText>
          <Text style={[fontStyle("bold"), { fontSize: 18, color: colors.text.primary }]}>
            This can't be undone.
          </Text>
          <Text
            style={[
              fontStyle("regular"),
              { fontSize: 14, lineHeight: 20, color: colors.text.secondary },
            ]}
          >
            {hasTitle
              ? "Deleting removes the practice and all of its data for good. To confirm, type the practice name below."
              : "Deleting removes this practice and all of its data for good."}
          </Text>

          {hasTitle ? (
            <>
              <View
                style={{
                  backgroundColor: colors.surface.overlay,
                  borderRadius: radius.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                }}
              >
                <MonoText style={{ fontSize: 13, color: colors.text.primary }}>
                  {title}
                </MonoText>
              </View>

              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder="Type the practice name"
                placeholderTextColor={colors.text.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  fontStyle("regular"),
                  {
                    fontSize: 15,
                    color: colors.text.primary,
                    backgroundColor: colors.surface.input,
                    borderWidth: 1,
                    borderColor: matches
                      ? colors.red.semantic
                      : colors.border.strong,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    paddingVertical: 12,
                  },
                ]}
              />
            </>
          ) : null}

          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={!matches || busy}
              onPress={onConfirm}
              style={{
                height: 48,
                borderRadius: radius.lg,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.red.semantic,
                opacity: !matches || busy ? 0.4 : 1,
              }}
            >
              <Text style={[fontStyle("bold"), { fontSize: 15, color: "#FFFFFF" }]}>
                {busy ? "Deleting…" : "Delete practice"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onClose}
              style={{
                height: 48,
                borderRadius: radius.lg,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: colors.border.strong,
              }}
            >
              <Text
                style={[fontStyle("semibold"), { fontSize: 15, color: colors.text.primary }]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
