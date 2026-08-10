import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/AuthContext";
import { theme } from "@/lib/theme";

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceCream }}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  return <Redirect href={session ? "/(tabs)" : "/(auth)/login"} />;
}
