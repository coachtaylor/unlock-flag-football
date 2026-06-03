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

// Generic destructive confirmation. To prevent an accidental tap from wiping
// a record + its data, the user must type the record's name back exactly
// (case-sensitive). The Delete button stays disabled until it matches.
//
// Records with no real name (e.g. an untitled practice) pass name=null to
// skip the typing gate and fall back to a plain confirm. Canonical home for
// the type-to-confirm pattern — practice (plan archive) and the drill library
// both render this.
export function DeleteConfirmModal({
  open,
  onClose,
  name,
  noun = "item",
  onConfirm,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * The name the user must re-type to confirm (case-sensitive). Empty /
   * null / whitespace => no real name, so the typing gate is skipped.
   */
  name: string | null | undefined;
  /** Lowercase singular noun for the copy, e.g. "practice" | "drill". */
  noun?: string;
  onConfirm: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  const hasName = !!name && name.trim().length > 0;
  const matches = !hasName || value === name;

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
            {hasName
              ? `Deleting removes the ${noun} and all of its data for good. To confirm, type the ${noun} name below.`
              : `Deleting removes this ${noun} and all of its data for good.`}
          </Text>

          {hasName ? (
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
                  {name}
                </MonoText>
              </View>

              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder={`Type the ${noun} name`}
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

          {error ? (
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 13, lineHeight: 18, color: colors.red.semantic },
              ]}
            >
              {error}
            </Text>
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
                {busy ? "Deleting…" : `Delete ${noun}`}
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
