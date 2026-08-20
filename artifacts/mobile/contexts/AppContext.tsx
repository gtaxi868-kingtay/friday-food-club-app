import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── API Base URL ─────────────────────────────────────────────────────────────
// In the Replit environment, the API server is routed under /api on the same
// domain as the Expo web preview.  On native (Expo Go), the same domain
// applies via the EXPO_PUBLIC_DOMAIN env var injected by the workflow.
const RAW_DOMAIN = process.env['EXPO_PUBLIC_DOMAIN'] ?? '';
export const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? (RAW_DOMAIN
  ? `https://${RAW_DOMAIN}/api`
  : '/api');

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Chef {
  id: string;
  name: string;
  handle: string;
  rating: number;
  totalDrops: number;
  successfulDrops: number;
  isVerified: boolean;
  cuisine: string;
  region: string;
  points: number;
  rank: number;
}

export interface Drop {
  id: string;
  title: string;
  description: string;
  chef: Chef;
  price: number;
  originalPrice?: number; // pre-discount price — present when user has Club Pass and a discount was applied
  inventory: number;   // hard plate limit
  minOrders: number;   // payout threshold
  currentOrders: number;
  remaining: number;   // inventory - currentOrders
  expiresAt: string;
  cuisine: string;
  mealSlot: 'Breakfast' | 'Lunch' | 'Dinner';
  imageIndex: number;
  imageUrl?: string | null;  // chef-uploaded food photo — served via /api/drops/:id/photo
  tags: string[];
  status?: 'ACTIVE' | 'UNLOCKED' | 'SOLD_OUT' | 'COMPLETED' | 'CANCELLED';
  soldOut?: boolean;
  pickupLocation?: string;
  isSecret?: boolean; // secret drops: only orderable on Fridays
}

export interface Order {
  id: string;
  dropId: string;
  dropTitle: string;
  chefName: string;
  price: number;           // base price (undiscounted)
  effectivePrice?: number; // actual amount owed — discounted for Club Pass members
  orderedAt: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  minOrders: number;
  currentOrders: number;
  expiresAt: string;
  pickupToken?: string;   // QR token shown at pickup — releases escrow / reconciles cash
  escrowStatus?: 'HELD' | 'RELEASED' | 'CASH' | 'CASH_RECONCILED';
  paymentMethod?: 'DIGITAL' | 'CASH'; // CASH = pay at pickup; DIGITAL = pre-escrow (default)
}

export interface UserProfile {
  name: string;
  handle: string;
  nfcId: string;
  memberSince: string;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  points: number;
  walletBalance: number;
  ordersCount: number;
  chefsFollowed: number;
}

interface AppContextValue {
  drops: Drop[];
  chefs: Chef[];
  orders: Order[];
  profile: UserProfile;
  orderedDropIds: Set<string>;
  isLoadingDrops: boolean;
  dropsError: string | null;
  preOrder: (drop: Drop, paymentMethod?: 'DIGITAL' | 'CASH', extraHeaders?: Record<string, string>) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  getDropById: (id: string) => Drop | undefined;
  refreshDrops: () => Promise<void>;
}

// ─── Seed / Fallback Data ─────────────────────────────────────────────────────
// Used as a fallback when the API is unreachable (offline mode, dev without creds).

// Blank profile — real values come from the auth layer after login
const DEFAULT_PROFILE: UserProfile = {
  name: '', handle: '', nfcId: '',
  memberSince: '', tier: 'Bronze', points: 0,
  walletBalance: 0, ordersCount: 0, chefsFollowed: 0,
};

// Stable anonymous user ID — persisted in AsyncStorage
const USER_ID_KEY = '@ffc_user_id';
const ORDERS_KEY = '@ffc_orders';
const PROFILE_KEY = '@ffc_profile';
const DROP_ORDERS_KEY = '@ffc_drop_orders';

// ─── Context ─────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

// ─── API response → Drop shape mapper ────────────────────────────────────────

interface ApiDrop {
  id: string;
  title: string;
  description: string;
  mealSlot: 'Breakfast' | 'Lunch' | 'Dinner';
  price: number;
  originalPrice?: number;
  inventory: number;
  minOrders: number;
  currentOrders: number;
  remaining?: number;
  soldOut?: boolean;
  status: string;
  pickupLocation?: string;
  expiresAt: string;
  imageIndex: number;
  imageUrl?: string | null;
  tags: string[];
  chef: Chef;
}

function apiDropToLocal(d: ApiDrop): Drop {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    chef: d.chef,
    price: d.price,
    originalPrice: d.originalPrice,
    inventory: d.inventory ?? 0,
    minOrders: d.minOrders,
    currentOrders: d.currentOrders,
    remaining: d.remaining ?? Math.max(0, (d.inventory ?? 0) - d.currentOrders),
    soldOut: d.soldOut ?? d.status === 'SOLD_OUT',
    pickupLocation: d.pickupLocation,
    expiresAt: d.expiresAt,
    // Derive cuisine label from chef's cuisine field
    cuisine: d.chef?.cuisine ?? 'Caribbean',
    mealSlot: d.mealSlot,
    imageIndex: d.imageIndex ?? 1,
    imageUrl: d.imageUrl ?? null,
    tags: d.tags ?? [],
    status: d.status as Drop['status'],
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [drops, setDrops] = useState<Drop[]>([]);
  const [chefs, setChefs] = useState<Chef[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [orderedDropIds, setOrderedDropIds] = useState<Set<string>>(new Set());
  const [isLoadingDrops, setIsLoadingDrops] = useState(true);
  const [dropsError, setDropsError] = useState<string | null>(null);
  const userIdRef = useRef<string>('');

  // ── Bootstrap: load local state + fetch live data ──────────────────────────

  useEffect(() => {
    (async () => {
      try {
        // Restore local state
        const [ordersJson, profileJson, dropOrdersJson, storedUserId] = await Promise.all([
          AsyncStorage.getItem(ORDERS_KEY),
          AsyncStorage.getItem(PROFILE_KEY),
          AsyncStorage.getItem(DROP_ORDERS_KEY),
          AsyncStorage.getItem(USER_ID_KEY),
        ]);
        if (ordersJson) setOrders(JSON.parse(ordersJson));
        if (profileJson) setProfile(JSON.parse(profileJson));
        if (dropOrdersJson) {
          const ids: string[] = JSON.parse(dropOrdersJson);
          setOrderedDropIds(new Set(ids));
        }
        // Stable anonymous ID
        if (storedUserId) {
          userIdRef.current = storedUserId;
        } else {
          const newId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          userIdRef.current = newId;
          await AsyncStorage.setItem(USER_ID_KEY, newId);
        }
      } catch (_) { /* non-fatal */ }

      // Fetch live drops + chefs from API
      await fetchDropsAndChefs();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDropsAndChefs = useCallback(async () => {
    setIsLoadingDrops(true);
    setDropsError(null);
    try {
      const [dropsRes, chefsRes] = await Promise.all([
        apiFetch<{ drops: ApiDrop[] }>('/drops'),
        apiFetch<{ chefs: Chef[] }>('/chefs'),
      ]);

      // Always replace state from the API — empty DB = empty app, no demo data
      setDrops(dropsRes.drops.map(apiDropToLocal));
      setChefs(chefsRes.chefs);
    } catch (err: any) {
      console.warn('[FFC] API unreachable — showing seed data:', err?.message);
      setDropsError(err?.message ?? 'Could not reach server');
      // Keep fallback data already in state
    } finally {
      setIsLoadingDrops(false);
    }
  }, []);

  // ── Persistence helpers ────────────────────────────────────────────────────

  const saveOrders = useCallback(async (newOrders: Order[], newOrderedIds: Set<string>) => {
    await Promise.all([
      AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(newOrders)),
      AsyncStorage.setItem(DROP_ORDERS_KEY, JSON.stringify([...newOrderedIds])),
    ]);
  }, []);

  const saveProfile = useCallback(async (p: UserProfile) => {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  }, []);

  // ── preOrder ───────────────────────────────────────────────────────────────

  const preOrder = useCallback(async (drop: Drop, paymentMethod: 'DIGITAL' | 'CASH' = 'DIGITAL', extraHeaders: Record<string, string> = {}) => {
    if (drop.soldOut || drop.status === 'SOLD_OUT' || (drop.inventory > 0 && drop.remaining <= 0)) {
      throw new Error('This drop is SOLD OUT');
    }
    // Optimistically update local UI
    const optimisticOrder: Order = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      dropId: drop.id,
      dropTitle: drop.title,
      chefName: drop.chef.name,
      price: drop.price,
      orderedAt: new Date().toISOString(),
      status: 'pending',
      minOrders: drop.minOrders,
      currentOrders: drop.currentOrders + 1,
      expiresAt: drop.expiresAt,
      paymentMethod,
      escrowStatus: paymentMethod === 'CASH' ? 'CASH' : 'HELD',
    };

    const newOrders = [optimisticOrder, ...orders];
    const newOrderedIds = new Set([...orderedDropIds, drop.id]);
    const newProfile: UserProfile = {
      ...profile,
      walletBalance: profile.walletBalance + drop.price,
      ordersCount: profile.ordersCount + 1,
      points: profile.points + Math.round(drop.price * 10),
    };

    setDrops(prev => prev.map(d =>
      d.id === drop.id
        ? { ...d, currentOrders: d.currentOrders + 1, remaining: Math.max(0, d.remaining - 1) }
        : d
    ));
    setOrders(newOrders);
    setOrderedDropIds(newOrderedIds);
    setProfile(newProfile);

    await Promise.all([saveOrders(newOrders, newOrderedIds), saveProfile(newProfile)]);

    // Post to API in background — update order ID if successful
    try {
      const res = await apiFetch<{
        order: { id: string; pickupToken?: string; escrowStatus?: Order['escrowStatus']; paymentMethod?: 'DIGITAL' | 'CASH'; effectivePrice?: number };
        drop: { currentOrders: number; remaining?: number; status: string; justUnlocked: boolean; justSoldOut?: boolean };
      }>('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify({ userId: userIdRef.current, dropId: drop.id, paymentMethod }),
      });

      // Swap local placeholder ID with server ID + attach QR token + effective price
      setOrders(prev => prev.map(o =>
        o.id === optimisticOrder.id
          ? { ...o, id: res.order.id, pickupToken: res.order.pickupToken, escrowStatus: res.order.escrowStatus, paymentMethod: res.order.paymentMethod, effectivePrice: res.order.effectivePrice }
          : o
      ));
      // Sync live inventory from server (inventory engine result)
      setDrops(prev => prev.map(d =>
        d.id === drop.id
          ? {
              ...d,
              currentOrders: res.drop.currentOrders,
              remaining: res.drop.remaining ?? Math.max(0, d.inventory - res.drop.currentOrders),
              status: res.drop.status as Drop['status'],
              soldOut: res.drop.status === 'SOLD_OUT',
            }
          : d
      ));
    } catch (err: any) {
      // Do not leave a false "Pre-Ordered" state when the server rejected the
      // order. The server is the source of truth for inventory and orders.
      setOrders(orders);
      setOrderedDropIds(orderedDropIds);
      setProfile(profile);
      setDrops(prev => prev.map(d =>
        d.id === drop.id
          ? { ...d, currentOrders: drop.currentOrders, remaining: drop.remaining, soldOut: drop.soldOut, status: drop.status }
          : d
      ));
      await Promise.all([saveOrders(orders, orderedDropIds), saveProfile(profile)]);
      throw err;
    }
  }, [orders, orderedDropIds, profile, saveOrders, saveProfile]);

  // ── cancelOrder ────────────────────────────────────────────────────────────

  const cancelOrder = useCallback(async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const newOrders = orders.map(o =>
      o.id === orderId ? { ...o, status: 'cancelled' as const } : o
    );
    const newOrderedIds = new Set([...orderedDropIds]);
    newOrderedIds.delete(order.dropId);
    const newProfile: UserProfile = {
      ...profile,
      walletBalance: Math.max(0, profile.walletBalance - order.price),
      ordersCount: Math.max(0, profile.ordersCount - 1),
    };

    setOrders(newOrders);
    setOrderedDropIds(newOrderedIds);
    setDrops(prev => prev.map(d =>
      d.id === order.dropId ? { ...d, currentOrders: Math.max(0, d.currentOrders - 1) } : d
    ));
    setProfile(newProfile);

    await Promise.all([saveOrders(newOrders, newOrderedIds), saveProfile(newProfile)]);

    // Cancel on server — only if it's a real (non-local-optimistic) order ID
    if (!orderId.startsWith('local_')) {
      try {
        await apiFetch(`/orders/${orderId}/cancel`, { method: 'PATCH' });
      } catch (err: any) {
        console.warn('[FFC] Cancel API call failed (local state still cancelled):', err?.message);
      }
    }
  }, [orders, orderedDropIds, profile, saveOrders, saveProfile]);

  const getDropById = useCallback((id: string) => drops.find(d => d.id === id), [drops]);

  return (
    <AppContext.Provider value={{
      drops,
      chefs,
      orders,
      profile,
      orderedDropIds,
      isLoadingDrops,
      dropsError,
      preOrder,
      cancelOrder,
      getDropById,
      refreshDrops: fetchDropsAndChefs,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
