import { Pressable, Text, View, type PressableProps } from "react-native";
import { colors, radius } from "../../constants/design";

type TagProps = Omit<PressableProps, "children" | "style"> & {
  label: string;
  selected?: boolean;
};

export function Tag({ label, selected = false, ...rest }: TagProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={6}
      {...rest}
    >
      {({ pressed }) => (
        <View
          style={{
            minHeight: 36,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: radius.pill,
            borderWidth: selected ? 1.5 : 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: selected
              ? "rgba(212,138,48,0.22)"
              : colors.surface.elevated,
            borderColor: selected ? colors.orange[500] : colors.border.card,
            shadowColor: "#000",
            shadowOpacity: selected ? 0 : 0.18,
            shadowOffset: { width: 0, height: 1 },
            shadowRadius: 3,
            elevation: selected ? 0 : 2,
            opacity: pressed ? 0.88 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          }}
        >
          <Text
            style={{
              fontSize: 13,
              lineHeight: 18,
              fontWeight: "500",
              color: selected ? colors.orange[400] : colors.text.primary,
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
