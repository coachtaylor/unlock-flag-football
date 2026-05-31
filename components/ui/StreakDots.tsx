import { View } from "react-native";
import { colors } from "../../constants/design";

type Props = {
  streak: number;
  max?: number;
  top?: boolean;
};

export function StreakDots({ streak, max = 6, top = false }: Props) {
  const fillColor = top ? colors.lime[400] : colors.orange[500];
  return (
    <View style={{ flexDirection: "row", gap: 3 }}>
      {Array.from({ length: max }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: i < streak ? fillColor : colors.border.default,
          }}
        />
      ))}
    </View>
  );
}
