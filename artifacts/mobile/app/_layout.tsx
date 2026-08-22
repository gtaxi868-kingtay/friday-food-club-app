import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
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
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { AppProvider } from '@/contexts/AppContext';
import { AuthProvider } from '@/contexts/AuthContext';

const convex = new ConvexReactClient(process.env['EXPO_PUBLIC_CONVEX_URL']!, {
  unsavedChangesWarning: false,
});

SplashScreen.preventAutoHideAsync();

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
    </Stack>
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

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ConvexProvider client={convex}>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <AuthProvider>
                  <AppProvider>
                    <RootLayoutNav />
                  </AppProvider>
                </AuthProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ConvexProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
