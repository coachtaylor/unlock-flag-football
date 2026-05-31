import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontWeight, radius } from "../../constants/design";
import { fontStyle } from "../../constants/typography";

// The full-width choice card used for "Single team / League" (step 2)
// and "Coach / Captain" (step 3). Icon top-left, title, supporting copy,
// selected state with a check pip.
//
// Icon name is passed in (not a rendered node) so the card can color it
// based on its own selected state — the icon flips to onBrand when the
// card is selected, matching the icon tile flipping to orange.

type Props = {
  iconName: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
};

export function BigChoiceCard({
  iconName,
  title,
  body,
  selected,
  onPress,
}: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        backgroundColor: selected
          ? "rgba(255,106,26,0.10)"
          : colors.surface.raised,
        borderWidth: 1.5,
        borderColor: selected ? colors.orange[500] : colors.border.default,
        borderRadius: 18,
        padding: 18,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: selected
              ? colors.orange[500]
              : "rgba(255,255,255,0.04)",
            borderWidth: selected ? 0 : 1,
            borderColor: colors.border.default,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name={iconName}
            size={22}
            color={selected ? colors.text.onBrand : colors.text.secondary}
          />
        </View>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: selected ? colors.orange[500] : "transparent",
            borderWidth: selected ? 0 : 1.5,
            borderColor: colors.border.default,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selected ? (
            <Ionicons
              name="checkmark"
              size={14}
              color={colors.text.onBrand}
            />
          ) : null}
        </View>
      </View>

      <Text
        style={[
          fontStyle("bold"),
          {
            fontSize: 17,
            fontWeight: fontWeight.bold,
            letterSpacing: -0.15,
            color: colors.text.primary,
            marginBottom: 6,
          },
        ]}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 13,
          lineHeight: 19,
          color: colors.text.secondary,
        }}
      >
        {body}
      </Text>
    </TouchableOpacity>
  );
}

// Soft helper note used at the bottom of steps 2 + 3 once the user has
// made a choice. Same visual rhythm across both screens.

export function HelperNote({
  children,
  iconName = "flash-outline",
}: {
  children: React.ReactNode;
  iconName?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        padding: 14,
        marginTop: 4,
        backgroundColor: "rgba(255,255,255,0.025)",
        borderWidth: 1,
        borderColor: colors.border.subtle,
        borderRadius: radius.lg,
      }}
    >
      <Ionicons
        name={iconName}
        size={12}
        color={colors.orange[500]}
        style={{ marginTop: 2 }}
      />
      <Text
        style={{
          flex: 1,
          fontSize: 12.5,
          lineHeight: 18,
          color: colors.text.secondary,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
