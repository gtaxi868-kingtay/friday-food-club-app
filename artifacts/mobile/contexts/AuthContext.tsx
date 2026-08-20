/**
 * AuthContext — lightweight authentication layer for mobile
 *
 * Stores the session Bearer token in AsyncStorage.
 * Provides login(), logout(), authHeaders(), and subscription state (hasClubPass).
 * Works alongside AppContext (which handles drops/orders independently).
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { API_BASE } from './AppContext';

const AUTH_TOKEN_KEY = '@ffc_auth_token';
const AUTH_USER_KEY  = '@ffc_auth_user';

export interface AuthUser {
  id:     string;
  name:   string;
  email:  string;
  role:   'BUYER' | 'CHEF' | 'ADMIN';
  area?:  string | null;
  chefId?: string | null;
  chefVerified?: boolean | null;
  chefVerificationStatus?: string | null;
  chefRejectionReason?: string | null;
}

interface AuthContextValue {
  user:              AuthUser | null;
  token:             string | null;
  isLoading:         boolean;
  hasClubPass:       boolean;
  clubPassExpiry:    string | null;
  login:             (email: string, password: string) => Promise<void>;
  logout:            () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  /** Returns Authorization header object if logged in, else empty object */
  authHeaders:       () => Record<string, string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]               = useState<AuthUser | null>(null);
  const [token, setToken]             = useState<string | null>(null);
  const [isLoading, setIsLoading]     = useState(true);
  const [hasClubPass, setHasClubPass] = useState(false);
  const [clubPassExpiry, setClubPassExpiry] = useState<string | null>(null);

  // ── Subscription check ────────────────────────────────────────────────────

  const checkSubscription = useCallback(async (userId: string, bearerToken: string) => {
    try {
      const res = await fetch(`${API_BASE}/subscriptions/${userId}`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json() as { isActive: boolean; subscription?: { expiresAt: string } | null };
      setHasClubPass(data.isActive);
      setClubPassExpiry(data.subscription?.expiresAt ?? null);
    } catch {
      // Non-fatal — subscription state stays false
    }
  }, []);

  const refreshSubscription = useCallback(async () => {
    if (user && token) await checkSubscription(user.id, token);
  }, [user, token, checkSubscription]);

  // ── Restore session from AsyncStorage on mount ────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          AsyncStorage.getItem(AUTH_TOKEN_KEY),
          AsyncStorage.getItem(AUTH_USER_KEY),
        ]);
        if (storedToken && storedUser) {
          const parsedUser = JSON.parse(storedUser) as AuthUser;
          setToken(storedToken);
          setUser(parsedUser);
          // Re-register push token and check subscription in the background
          registerPushToken(storedToken);
          checkSubscription(parsedUser.id, storedToken);
        }
      } catch (_) { /* non-fatal */ }
      finally { setIsLoading(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Register the device's Expo push token with the API (best-effort). */
  const registerPushToken = useCallback(async (bearerToken: string) => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('[Push] Notification permission not granted — skipping token registration');
        return;
      }

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
      if (!expoPushToken) {
        console.warn('[Push] getExpoPushTokenAsync returned no token');
        return;
      }

      const res = await fetch(`${API_BASE}/auth/push-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ expoPushToken }),
      });
      if (!res.ok) {
        console.warn('[Push] Failed to store push token on server:', res.status);
      } else {
        console.log('[Push] Push token registered successfully');
      }
    } catch (err) {
      console.warn('[Push] Push token registration error:', err);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as any).error ?? `Login failed (${res.status})`);
    }
    const data = await res.json() as { token: string; user: AuthUser };
    await Promise.all([
      AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token),
      AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user)),
    ]);
    setToken(data.token);
    setUser(data.user);
    // Background tasks — non-blocking
    registerPushToken(data.token);
    checkSubscription(data.user.id, data.token);
  }, [registerPushToken, checkSubscription]);

  const logout = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(AUTH_TOKEN_KEY),
      AsyncStorage.removeItem(AUTH_USER_KEY),
    ]);
    setToken(null);
    setUser(null);
    setHasClubPass(false);
    setClubPassExpiry(null);
    fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  const authHeaders = useCallback((): Record<string, string> => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  return (
    <AuthContext.Provider value={{
      user, token, isLoading,
      hasClubPass, clubPassExpiry,
      login, logout, refreshSubscription, authHeaders,
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
