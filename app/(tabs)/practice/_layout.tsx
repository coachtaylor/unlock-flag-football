import { Stack } from "expo-router";
import { colors } from "../../../constants/design";

export default function PracticeLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface.base },
      }}
    />
  );
}
