import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { KeyboardProviderCompat } from '@/components/KeyboardProviderCompat';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { reportRuntimeError } from '@/lib/runtimeDiagnostics';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { Stack, router } from 'expo-router';
import { reloadAppAsync } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { AppProvider } from '@/contexts/AppContext';
import { AuthProvider } from '@/contexts/AuthContext';

type ConvexClientState = {
  client: ConvexReactClient | null;
  error: string | null;
};

function createConvexClient(): ConvexClientState {
  const url = process.env['EXPO_PUBLIC_CONVEX_URL']?.trim();

  if (!url) {
    const error = new Error('EXPO_PUBLIC_CONVEX_URL is not configured');
    reportRuntimeError('convex-config', error, { reason: 'missing_url' });
    return {
      client: null,
      error: 'The live service is not configured. Add EXPO_PUBLIC_CONVEX_URL and restart the mobile preview.',
    };
  }

  try {
    return {
      client: new ConvexReactClient(url, { unsavedChangesWarning: false }),
      error: null,
    };
  } catch (error) {
    reportRuntimeError('convex-config', error, { reason: 'invalid_url' });
    return {
      client: null,
      error: 'The live service URL is invalid. Check EXPO_PUBLIC_CONVEX_URL and restart the mobile preview.',
    };
  }
}

const convexState = createConvexClient();

SplashScreen.preventAutoHideAsync().catch(error => {
  reportRuntimeError('splash-screen', error);
});

// Show notifications as banners even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const queryClient = new QueryClient();

function RootLayoutNav() {
  // ── Deep-link handler: route to the correct screen on notification tap ──
  // The push notification data payload (sent by the API on approve/reject)
  // contains a `type` field: 'CHEF_VERIFIED' or 'CHEF_REJECTED'.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const type = data?.type as string | undefined;

      if (type === 'CHEF_VERIFIED') {
        // Chef was approved — take them straight to the Studio tab
        router.replace('/(tabs)/studio');
      } else if (type === 'CHEF_REJECTED') {
        // Chef was rejected — take them to resubmit their application
        router.push('/apply-chef');
      }
    });

    return () => sub.remove();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="apply-chef"
        options={{ headerShown: false, presentation: 'card', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="club-pass"
        options={{ headerShown: false, presentation: 'card', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="wallet"
        options={{ headerShown: false, presentation: 'card', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="create-drop"
        options={{ headerShown: false, presentation: 'card', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="drop/[id]"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />
      <Stack.Screen
        name="chef/[id]"
        options={{ headerShown: false, presentation: 'card', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="spots"
        options={{ headerShown: false, presentation: 'card', animation: 'slide_from_right' }}
      />
    </Stack>
  );
}

function StartupNotice() {
  const { startupError, retryStartup } = useApp();
  const { authError, retryAuthRestore } = useAuth();
  const message = startupError ?? authError;

  if (!message) return null;

  return (
    <View pointerEvents="box-none" style={styles.noticeLayer}>
      <View style={styles.notice}>
        <View style={styles.noticeCopy}>
          <Text style={styles.noticeTitle}>Some setup needs attention</Text>
          <Text style={styles.noticeText}>{message}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry app setup"
          onPress={() => {
            if (startupError) retryStartup();
            if (authError) retryAuthRestore();
          }}
          style={styles.noticeButton}
        >
          <Text style={styles.noticeButtonText}>Retry</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StartupErrorScreen({ message }: { message: string }) {
  const restart = async () => {
    reportRuntimeError('startup-blocked', new Error(message));
    try {
      await reloadAppAsync();
    } catch (error) {
      reportRuntimeError('startup-reload', error);
    }
  };

  return (
    <View style={styles.startupScreen}>
      <Text style={styles.startupBrand}>FRIDAY FOOD CLUB</Text>
      <Text style={styles.startupTitle}>Connection setup needed</Text>
      <Text style={styles.startupMessage}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reload after checking connection setup"
        onPress={restart}
        style={styles.startupButton}
      >
        <Text style={styles.startupButtonText}>Reload after fixing setup</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  if (!convexState.client) {
    return (
      <SafeAreaProvider>
        <StartupErrorScreen message={convexState.error ?? 'Live service configuration is unavailable.'} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ConvexProvider client={convexState.client}>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProviderCompat>
                <AuthProvider>
                  <AppProvider>
                    <View style={styles.appRoot}>
                      <RootLayoutNav />
                      <StartupNotice />
                    </View>
                  </AppProvider>
                </AuthProvider>
              </KeyboardProviderCompat>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ConvexProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1 },
  noticeLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  notice: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#3A1E24',
    borderWidth: 1,
    borderColor: '#C41E3A',
  },
  noticeCopy: { flex: 1, gap: 2 },
  noticeTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  noticeText: { color: '#F6DDE1', fontSize: 12, lineHeight: 17 },
  noticeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#D4AF37',
  },
  noticeButtonText: { color: '#0A0A0A', fontSize: 12, fontWeight: '700' },
  startupScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#0A0A0A',
    gap: 16,
  },
  startupBrand: { color: '#D4AF37', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  startupTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '700', textAlign: 'center' },
  startupMessage: { color: '#B8B1A8', fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 520 },
  startupButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, backgroundColor: '#D4AF37' },
  startupButtonText: { color: '#0A0A0A', fontSize: 14, fontWeight: '700' },
});
