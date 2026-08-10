import { Redirect, Tabs } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { useAuth } from "@/lib/AuthContext";
import { theme } from "@/lib/theme";

export default function TabsLayout() {
  const { session, loading } = useAuth();
  if (!loading && !session) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "หน้าหลัก", tabBarIcon: ({ color, size }) => <MaterialIcons name="home" color={color} size={size} /> }} />
      <Tabs.Screen
        name="attendance"
        options={{ title: "ลงเวลา", tabBarIcon: ({ color, size }) => <MaterialIcons name="fingerprint" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="leave"
        options={{ title: "การลา", tabBarIcon: ({ color, size }) => <MaterialIcons name="event-note" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="payslip"
        options={{ title: "เงินเดือน", tabBarIcon: ({ color, size }) => <MaterialIcons name="receipt-long" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "โปรไฟล์", tabBarIcon: ({ color, size }) => <MaterialIcons name="person" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
