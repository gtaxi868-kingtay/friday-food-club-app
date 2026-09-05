/**
 * AuthContext — session token lives in AsyncStorage, verified server-side by
 * Convex on every call (lib/auth.ts's HMAC session token — same scheme, now
 * checked inside Convex functions instead of Express middleware).
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useMutation, useQuery, useConvex } from 'convex/react';
import { api } from '@workspace/convex-backend/convex/_generated/api';
import { reportRuntimeError } from '@/lib/runtimeDiagnostics';

const AUTH_TOKEN_KEY = '@ffc_auth_token';

export interface AuthUser {
  id:     string;
  name:   string;
  email:  string;
  role:   'BUYER' | 'CHEF' | 'ADMIN';
  area?:  string | null;
  chefId?: string | null;
  chefVerified?: boolean | null;
  chefVerificationStatus?: string | null;
}

interface AuthContextValue {
  user:              AuthUser | null;
  token:             string | null;
  isLoading:         boolean;
  authError:          string | null;
  retryAuthRestore:   () => void;
  hasClubPass:       boolean;
  clubPassExpiry:    string | null;
  login:             (email: string, password: string) => Promise<void>;
  register:          (name: string, email: string, password: string, area?: string) => Promise<void>;
  logout:            () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const convex = useConvex();
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const loginMutation = useMutation(api.auth.login);
  const registerMutation = useMutation(api.auth.register);
  const setPushTokenMutation = useMutation(api.auth.setPushToken);

  // `me` is a reactive query — user profile updates live everywhere the
  // instant it changes server-side (e.g. chef verification approval).
  const me = useQuery(api.auth.me, token ? { sessionToken: token } : 'skip');
  const user: AuthUser | null = me
    ? {
        id: me.id, name: me.name, email: me.email, role: me.role, area: me.area,
        chefId: me.chefId, chefVerified: me.chefVerified, chefVerificationStatus: me.chefVerificationStatus,
      }
    : null;

  const subscription = useQuery(api.subscriptions.mine, token ? { sessionToken: token } : 'skip');
  const hasClubPass = subscription?.isActive ?? false;
  const clubPassExpiry = subscription?.subscription
    ? new Date(subscription.subscription.expiresAt).toISOString()
    : null;

  const registerPushToken = useCallback(async (bearerToken: string) => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
        });
      }

      const projectId: string | undefined =
        Constants.easConfig?.projectId ||
        (Constants.expoConfig?.extra as any)?.eas?.projectId ||
        undefined;

      const tokenData = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
      const expoPushToken = tokenData.data;
      if (!expoPushToken) return;

      await setPushTokenMutation({ sessionToken: bearerToken, expoPushToken });
    } catch (err) {
      reportRuntimeError('push-registration', err);
    }
  }, [setPushTokenMutation]);

  const restoreAuth = useCallback(async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const stored = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (stored) {
        setToken(stored);
        void registerPushToken(stored);
      }
    } catch (error) {
      reportRuntimeError('auth-restore', error);
      setAuthError(
        'Your saved session could not be restored. You can keep browsing, or sign in again.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [registerPushToken]);

  useEffect(() => {
    void restoreAuth();
  }, [restoreAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginMutation({ email, password });
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
    setToken(data.token);
    setAuthError(null);
    void registerPushToken(data.token);
  }, [loginMutation, registerPushToken]);

  const register = useCallback(async (name: string, email: string, password: string, area?: string) => {
    const data = await registerMutation({ name, email, password, area });
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
    setToken(data.token);
    setAuthError(null);
    void registerPushToken(data.token);
  }, [registerMutation, registerPushToken]);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    setToken(null);
    setAuthError(null);
  }, []);

  const refreshSubscription = useCallback(async () => {
    // Reactive query above stays current on its own — kept for callers that
    // still invoke refreshSubscription() explicitly after subscribe/cancel.
  }, []);

  return (
    <AuthContext.Provider value={{
      user, token, isLoading,
      authError, retryAuthRestore: restoreAuth,
      hasClubPass, clubPassExpiry,
      login, register, logout, refreshSubscription,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
