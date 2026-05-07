import { View, Text, TextInput, type TextInputProps } from "react-native";
import { colors, radius, spacing } from "../../constants/design";

type InputProps = TextInputProps & {
  label?: string;
};

export function Input({ label, style, ...rest }: InputProps) {
  return (
    <View style={{ width: "100%" }}>
      {label ? (
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
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.text.muted}
        style={[
          {
            minHeight: 44,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border.card,
            backgroundColor: colors.surface.input,
            color: colors.text.primary,
            fontSize: 15,
            lineHeight: 22,
          },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}
