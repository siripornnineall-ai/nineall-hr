import "../lib/polyfills";
import { useCallback, useEffect } from "react";
import { Text } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts as useNotoSans, NotoSans_400Regular, NotoSans_500Medium, NotoSans_600SemiBold, NotoSans_700Bold } from "@expo-google-fonts/noto-sans";
import {
  useFonts as useNotoSansThai,
  NotoSansThai_400Regular,
  NotoSansThai_500Medium,
  NotoSansThai_600SemiBold,
  NotoSansThai_700Bold,
} from "@expo-google-fonts/noto-sans-thai";
import {
  useFonts as useNotoSansLao,
  NotoSansLao_400Regular,
  NotoSansLao_500Medium,
  NotoSansLao_600SemiBold,
  NotoSansLao_700Bold,
} from "@expo-google-fonts/noto-sans-lao";
import {
  useFonts as useNotoSansMyanmar,
  NotoSansMyanmar_400Regular,
  NotoSansMyanmar_500Medium,
  NotoSansMyanmar_600SemiBold,
  NotoSansMyanmar_700Bold,
} from "@expo-google-fonts/noto-sans-myanmar";
import { AuthProvider } from "@/lib/AuthContext";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [latinLoaded] = useNotoSans({ NotoSans_400Regular, NotoSans_500Medium, NotoSans_600SemiBold, NotoSans_700Bold });
  const [thaiLoaded] = useNotoSansThai({
    NotoSansThai_400Regular,
    NotoSansThai_500Medium,
    NotoSansThai_600SemiBold,
    NotoSansThai_700Bold,
  });
  const [laoLoaded] = useNotoSansLao({
    NotoSansLao_400Regular,
    NotoSansLao_500Medium,
    NotoSansLao_600SemiBold,
    NotoSansLao_700Bold,
  });
  const [myanmarLoaded] = useNotoSansMyanmar({
    NotoSansMyanmar_400Regular,
    NotoSansMyanmar_500Medium,
    NotoSansMyanmar_600SemiBold,
    NotoSansMyanmar_700Bold,
  });

  const fontsReady = latinLoaded && thaiLoaded && laoLoaded && myanmarLoaded;

  const onLayoutRootView = useCallback(async () => {
    if (fontsReady) {
      await SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  useEffect(() => {
    onLayoutRootView();
  }, [onLayoutRootView]);

  if (!fontsReady) {
    return null;
  }

  // Default every <Text> to the Thai font (today's default app language, master prompt
  // §5) until the per-user language preference can pick a font per script — RN, unlike
  // CSS, cannot fall back across font families for characters missing from the first one.
  // TODO(i18n): once packages/i18n lands, replace this with a locale-aware font provider
  // that swaps in NotoSansLao_*/NotoSansMyanmar_* for lo/my users.
  (Text as unknown as { defaultProps?: { style?: unknown } }).defaultProps = {
    ...(Text as unknown as { defaultProps?: { style?: unknown } }).defaultProps,
    style: [{ fontFamily: "NotoSansThai_400Regular" }, (Text as unknown as { defaultProps?: { style?: unknown } }).defaultProps?.style],
  };

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
