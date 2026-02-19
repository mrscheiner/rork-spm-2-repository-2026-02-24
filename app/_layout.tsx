import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; 
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, Platform, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SeasonPassProvider } from "@/providers/SeasonPassProvider";
import { trpc, trpcClient } from "@/lib/trpc";
import { checkAndSeedCanonicalData } from "@/lib/canonicalBootstrap";

SplashScreen.preventAutoHideAsync().catch(() => { /* retry */ });
console.log('[RootLayout] Build refresh: 2026-02-09T12:00');

const DEFAULT_MAX_FONT_SIZE_MULTIPLIER = 1.0 as const;

const ensureDefaultProps = (Component: unknown) => {
  const c = Component as { defaultProps?: Record<string, unknown> };
  if (!c.defaultProps) c.defaultProps = {};
  return c;
};

ensureDefaultProps(Text).defaultProps = {
  ...ensureDefaultProps(Text).defaultProps,
  allowFontScaling: false,
  maxFontSizeMultiplier: DEFAULT_MAX_FONT_SIZE_MULTIPLIER,
};

ensureDefaultProps(TextInput).defaultProps = {
  ...ensureDefaultProps(TextInput).defaultProps,
  allowFontScaling: false,
  maxFontSizeMultiplier: DEFAULT_MAX_FONT_SIZE_MULTIPLIER,
};

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen 
        name="setup" 
        options={{ 
          headerShown: false,
          presentation: "fullScreenModal",
          gestureEnabled: false,
        }} 
      />
      <Stack.Screen 
        name="edit-pass" 
        options={{ 
          headerShown: false,
          presentation: "modal",
        }} 
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [isBootstrapped, setIsBootstrapped] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const didReset = await checkAndSeedCanonicalData();
        if (didReset) {
          console.log('[RootLayout] Canonical bootstrap cleared storage — provider will re-seed');
        }
      } catch (e) {
        console.error('[RootLayout] Bootstrap error (non-fatal):', e);
      } finally {
        setIsBootstrapped(true);
        SplashScreen.hideAsync();
      }
    })();
  }, []);

  const rootViewStyle = useMemo(() => {
    const { width } = Dimensions.get("window");
    const shouldCompact = Platform.OS === "ios" && width <= 390;
    const compactScale = 0.92;

    if (!shouldCompact) return { flex: 1 } as const;

    const expandedWidthPct = `${Math.round((100 / compactScale) * 10) / 10}%`;

    return {
      flex: 1,
      alignSelf: "center" as const,
      width: expandedWidthPct,
      transform: [{ scale: compactScale }],
    };
  }, []);

  if (!isBootstrapped) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F7' }}>
        <ActivityIndicator size="large" color="#002B5C" />
      </View>
    );
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <SeasonPassProvider>
          <GestureHandlerRootView style={rootViewStyle}>
            <RootLayoutNav />
          </GestureHandlerRootView>
        </SeasonPassProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
