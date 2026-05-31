import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../constants/design";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.orange[500],
        tabBarInactiveTintColor: "rgba(255,255,255,0.95)",
        tabBarShowLabel: true,
        tabBarLabelPosition: "below-icon",
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "rgba(13,17,23,0.92)",
          borderTopColor: colors.border.subtle,
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingHorizontal: 8,
          elevation: 0,
        },
        tabBarBackground: () => (
          <View
            style={{
              flex: 1,
              backgroundColor:
                Platform.OS === "ios"
                  ? "rgba(13,17,23,0.85)"
                  : colors.surface.base,
            }}
          />
        ),
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "500",
          letterSpacing: 0.2,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              name={focused ? "home" : "home-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="roster"
        options={{
          title: "Roster",
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              name={focused ? "people" : "people-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="drills"
        options={{
          title: "Drills",
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              name={focused ? "football" : "football-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
        listeners={({ navigation }) => ({
          // Always land users on the drill library when they tap Drills,
          // even if the drills stack still has /drills/new on top from the
          // practice planner's "+" flow.
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate("drills", { screen: "index" });
          },
        })}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: "Practice",
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              name={focused ? "clipboard" : "clipboard-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
        listeners={({ navigation }) => ({
          // Always land users on the practice library when they tap Practice.
          // Without this, deep links into /practice/[id] (from the dashboard
          // hero, Moves, or activity feed) keep the stack focused on that
          // detail page, so the tab tap looks like a no-op.
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate("practice", { screen: "index" });
          },
        })}
      />
    </Tabs>
  );
}

function TabIcon({
  name,
  color,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
}) {
  return (
    <View
      style={{
        width: 44,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? "rgba(212,138,48,0.16)" : "transparent",
      }}
    >
      <Ionicons name={name} size={20} color={color} />
    </View>
  );
}
