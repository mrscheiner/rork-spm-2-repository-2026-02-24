import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; 
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { Component, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, Platform, Text, TextInput, View, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SeasonPassProvider } from "@/providers/SeasonPassProvider";
import { AppThemeProvider } from "../components/AppThemeProvider";
import { getTeamTheme } from "../constants/teamThemes";
import { EventsProvider } from "@/providers/EventsProvider";
import { trpc, trpcClient } from "@/lib/trpc";
import { checkAndSeedCanonicalData } from "@/lib/canonicalBootstrap";

// Safely prevent auto hide - wrap in try/catch for production safety
try {
  SplashScreen.preventAutoHideAsync().catch(() => { /* retry */ });
} catch (e) {
  console.warn('[RootLayout] SplashScreen.preventAutoHideAsync failed:', e);
}
console.log('[RootLayout] Build refresh: 2026-02-21T12:00');

const DEFAULT_MAX_FONT_SIZE_MULTIPLIER = 1.0 as const;

const ensureDefaultProps = (Component: unknown) => {
  try {
    const c = Component as { defaultProps?: Record<string, unknown> };
    if (!c.defaultProps) c.defaultProps = {};
    return c;
  } catch (e) {
    console.warn('[RootLayout] ensureDefaultProps failed:', e);
    return { defaultProps: {} } as { defaultProps: Record<string, unknown> };
  }
};

try {
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
} catch (e) {
  console.warn('[RootLayout] Failed to set default props:', e);
}

// Create QueryClient with safe defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
    },
    mutations: {
      retry: 1,
    },
  },
});

/**
 * Error Boundary to catch and handle crashes gracefully.
 * This prevents the entire app from crashing in production (TestFlight/App Store).
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Caught error:', error);
    console.error('[AppErrorBoundary] Error info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text style={errorStyles.message}>
            The app encountered an unexpected error. Please restart the app.
          </Text>
          {__DEV__ && this.state.error && (
            <Text style={errorStyles.debug}>{this.state.error.toString()}</Text>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#002B5C',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  debug: {
    marginTop: 20,
    fontSize: 12,
    color: '#999',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

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
      <Stack.Screen 
        name="rewind" 
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
  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const didReset = await checkAndSeedCanonicalData();
        if (didReset) {
          console.log('[RootLayout] Canonical bootstrap cleared storage — provider will re-seed');
        }
      } catch (e) {
        console.error('[RootLayout] Bootstrap error (non-fatal):', e);
        setBootstrapError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setIsBootstrapped(true);
        try {
          await SplashScreen.hideAsync();
        } catch (splashErr) {
          console.warn('[RootLayout] SplashScreen.hideAsync failed:', splashErr);
        }
      }
    })();
  }, []);

  const rootViewStyle = useMemo(() => {
    try {
      const { width } = Dimensions.get("window");
      const shouldCompact = Platform.OS === "ios" && width <= 390;
      const compactScale = 0.92;

      if (!shouldCompact) return { flex: 1 } as const;

      const expandedWidthPct = `${Math.round((100 / compactScale) * 10) / 10}%` as const;

      return {
        flex: 1,
        alignSelf: "center" as const,
        width: expandedWidthPct as unknown as number,
        transform: [{ scale: compactScale }],
      };
    } catch (e) {
      console.warn('[RootLayout] rootViewStyle calculation failed:', e);
      return { flex: 1 } as const;
    }
  }, []);

  if (!isBootstrapped) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F7' }}>
        <ActivityIndicator size="large" color="#002B5C" />
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <SeasonPassProvider>
            <AppThemeProvider>
              <EventsProvider>
                <GestureHandlerRootView style={rootViewStyle}>
                  <RootLayoutNav />
                </GestureHandlerRootView>
              </EventsProvider>
            </AppThemeProvider>
          </SeasonPassProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </AppErrorBoundary>
  );
}
