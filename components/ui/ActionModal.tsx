import React, { useCallback, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Button } from "./Button";
import { colors, radius, spacing } from "../../constants/design";
import { fontStyle, MonoText } from "../../constants/typography";

export type ModalAction = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "destructive";
};

export type ActionModalConfig = {
  title: string;
  message?: string;
  /** Optional small uppercase eyebrow above the title (e.g. status word). */
  eyebrow?: string;
  eyebrowColor?: string;
  actions: ModalAction[];
  cancelLabel?: string;
};

// Single canonical hook for every styled confirm / action-sheet / error
// modal. Encapsulates the config state, a `show()` opener, a `showError()`
// shortcut (title + message + just an OK dismiss), and the props to spread
// straight into <ActionModal {...modalProps} />. Use this instead of
// re-declaring useState + a showError in each screen (DRY).
export function useActionModal() {
  const [config, setConfig] = useState<ActionModalConfig | null>(null);
  const show = useCallback((c: ActionModalConfig) => setConfig(c), []);
  const close = useCallback(() => setConfig(null), []);
  const showError = useCallback(
    (title: string, message?: string) =>
      setConfig({ title, message, actions: [], cancelLabel: "OK" }),
    []
  );
  return {
    show,
    showError,
    close,
    modalProps: { open: !!config, onClose: close, config },
  };
}

// App-styled replacement for the native iOS Alert.alert / action sheet.
// Centered dark card matching PastDueModal / DeleteConfirmModal: optional
// eyebrow, title, optional message, a stack of full-width action buttons,
// and a Cancel. Each action auto-dismisses the modal after firing. Tapping
// the scrim dismisses.
//
// Driven by a single piece of config state at the call site, so it reads
// almost like Alert.alert: setModal({ title, message, actions }).
export function ActionModal({
  open,
  onClose,
  config,
}: {
  open: boolean;
  onClose: () => void;
  config: ActionModalConfig | null;
}) {
  if (!config) return null;
  const { title, message, eyebrow, eyebrowColor, actions, cancelLabel } = config;
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
          {eyebrow ? (
            <MonoText
              weight="bold"
              style={{
                fontSize: 11,
                color: eyebrowColor ?? colors.orange[500],
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              {eyebrow}
            </MonoText>
          ) : null}
          <Text style={[fontStyle("bold"), { fontSize: 18, color: colors.text.primary }]}>
            {title}
          </Text>
          {message ? (
            <Text
              style={[
                fontStyle("regular"),
                { fontSize: 14, lineHeight: 20, color: colors.text.secondary },
              ]}
            >
              {message}
            </Text>
          ) : null}
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {actions.map((a) => (
              <Button
                key={a.label}
                label={a.label}
                variant={a.variant ?? "secondary"}
                onPress={() => {
                  a.onPress();
                  onClose();
                }}
              />
            ))}
            <Button
              label={cancelLabel ?? "Cancel"}
              variant="secondary"
              onPress={onClose}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
