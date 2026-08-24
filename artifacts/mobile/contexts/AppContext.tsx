import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useQuery, useMutation, useConvex } from 'convex/react';
import { api } from '@workspace/convex-backend/convex/_generated/api';
import type { Id } from '@workspace/convex-backend/convex/_generated/dataModel';
import { useAuth } from './AuthContext';

// ─── Guest identity ─────────────────────────────────────────────────────────
// Anonymous checkout needs a server-signed guest token (Convex mutations have
// no cookie jar) — issued once, persisted, reused on every order call.
const GUEST_TOKEN_KEY = '@ffc_guest_token';

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
  originalPrice?: number;
  inventory: number;
  minOrders: number;
  currentOrders: number;
  remaining: number;
  expiresAt: string;
  cuisine: string;
  mealSlot: 'Breakfast' | 'Lunch' | 'Dinner' | 'Dessert';
  imageIndex: number;
  imageUrl?: string | null;
  tags: string[];
  status?: 'ACTIVE' | 'SOLD_OUT' | 'EXPIRED' | 'CANCELLED';
  soldOut?: boolean;
  pickupLocation?: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  isSecret?: boolean;
  /** km from the user's current location, when it's known — null when
   *  either side is missing coordinates. Feed order already reflects this
   *  server-side; it's surfaced here purely for display ("0.8 km away"). */
  distanceKm?: number | null;
}

export interface Order {
  id: string;
  dropId: string;
  dropTitle: string;
  chefName: string;
  price: number;
  effectivePrice?: number;
  orderedAt: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  minOrders: number;
  currentOrders: number;
  expiresAt: string;
  pickupToken?: string;
  escrowStatus?: 'HELD' | 'RELEASED' | 'CASH' | 'CASH_RECONCILED';
  paymentMethod?: 'DIGITAL' | 'CASH';
  pickupLocation?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
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
  preOrder: (drop: Drop, paymentMethod?: 'DIGITAL' | 'CASH') => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  getDropById: (id: string) => Drop | undefined;
  refreshDrops: () => Promise<void>;
}

const DEFAULT_PROFILE: UserProfile = {
  name: '', handle: '', nfcId: '',
  memberSince: '', tier: 'Bronze', points: 0,
  walletBalance: 0, ordersCount: 0, chefsFollowed: 0,
};

const AppContext = createContext<AppContextValue | null>(null);

function mapDrop(d: any): Drop {
  return {
    id: d._id,
    title: d.title,
    description: d.description,
    chef: {
      id: d.chefId,
      name: d.chefName ?? '',
      handle: d.chefHandle ?? '',
      rating: 0, totalDrops: 0, successfulDrops: 0, isVerified: true,
      cuisine: '', region: '', points: 0, rank: 0,
    },
    price: d.price,
    inventory: d.inventory,
    minOrders: d.minOrders,
    currentOrders: d.currentOrders,
    remaining: d.remaining ?? Math.max(0, d.inventory - d.currentOrders),
    soldOut: d.status === 'SOLD_OUT',
    pickupLocation: d.pickupLocation,
    pickupLat: d.pickupLat ?? null,
    pickupLng: d.pickupLng ?? null,
    distanceKm: d.distanceKm ?? null,
    expiresAt: new Date(d.expiresAt).toISOString(),
    cuisine: 'Caribbean',
    mealSlot: d.mealSlot,
    imageIndex: d.imageIndex ?? 1,
    imageUrl: null,
    tags: d.tags ?? [],
    status: d.status,
    isSecret: d.isSecret ?? false,
  };
}

function mapChef(c: any): Chef {
  return {
    id: c._id, name: c.name, handle: c.handle, rating: c.rating,
    totalDrops: c.totalDrops, successfulDrops: c.successfulDrops,
    isVerified: c.isVerified, cuisine: c.cuisine, region: c.region,
    points: c.points, rank: c.rank,
  };
}

function mapOrder(o: any): Order {
  return {
    id: o._id,
    dropId: o.dropId,
    dropTitle: o.dropTitle ?? '',
    chefName: o.chefName ?? '',
    price: o.price,
    effectivePrice: o.effectivePrice,
    orderedAt: new Date(o._creationTime).toISOString(),
    status: o.status === 'CANCELLED' ? 'cancelled' : o.status === 'FULFILLED' ? 'confirmed' : 'pending',
    minOrders: o.minOrders ?? 0,
    currentOrders: o.currentOrders ?? 0,
    expiresAt: o.dropExpiresAt ? new Date(o.dropExpiresAt).toISOString() : '',
    pickupToken: o.pickupToken,
    escrowStatus: o.escrowStatus,
    paymentMethod: o.paymentMethod,
    pickupLocation: o.pickupLocation ?? null,
    pickupLat: o.pickupLat ?? null,
    pickupLng: o.pickupLng ?? null,
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const convex = useConvex();
  const { token: sessionToken } = useAuth();
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Closest-first feed — best-effort: a denied/unavailable permission just
  // leaves userLocation null, and the feed falls back to its recency sort
  // (see drops.list), so this never blocks or breaks anything on failure.
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // Permission dialog dismissed, location services off, simulator with
        // no location set, etc. — feed just stays in recency order.
      }
    })();
  }, []);

  // Guest identity — only needed while logged out.
  useEffect(() => {
    (async () => {
      if (sessionToken) return;
      const stored = await AsyncStorage.getItem(GUEST_TOKEN_KEY);
      if (stored) {
        setGuestToken(stored);
        return;
      }
      const { guestToken: issued } = await convex.mutation(api.orders.issueGuestToken, {});
      await AsyncStorage.setItem(GUEST_TOKEN_KEY, issued);
      setGuestToken(issued);
    })();
  }, [sessionToken, convex]);

  // ── Reactive live data — no manual fetch/refresh plumbing needed ──────────
  const dropsRaw = useQuery(
    api.drops.list,
    userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : {},
  );
  const chefsRaw = useQuery(api.chefs.list, {});
  const ordersRaw = useQuery(
    api.orders.listMine,
    sessionToken || guestToken ? { sessionToken: sessionToken ?? undefined, guestToken: guestToken ?? undefined } : 'skip',
  );

  const drops = (dropsRaw ?? []).map(mapDrop);
  const chefs = (chefsRaw ?? []).map(mapChef);
  const orders = (ordersRaw ?? []).map(mapOrder);
  const orderedDropIds = new Set(orders.filter((o) => o.status !== 'cancelled').map((o) => o.dropId));
  const isLoadingDrops = dropsRaw === undefined;
  const dropsError = null;

  const placeOrderMutation = useMutation(api.orders.place);
  const cancelOrderMutation = useMutation(api.orders.cancel);

  const preOrder = useCallback(async (drop: Drop, paymentMethod: 'DIGITAL' | 'CASH' = 'DIGITAL') => {
    if (drop.soldOut || drop.status === 'SOLD_OUT' || (drop.inventory > 0 && drop.remaining <= 0)) {
      throw new Error('This drop is SOLD OUT');
    }
    await placeOrderMutation({
      dropId: drop.id as Id<'drops'>,
      paymentMethod,
      sessionToken: sessionToken ?? undefined,
      guestToken: guestToken ?? undefined,
    });
    // No optimistic local state needed — Convex's reactive queries above
    // (ordersRaw / dropsRaw) update every subscribed screen automatically
    // the instant the mutation commits.
  }, [placeOrderMutation, sessionToken, guestToken]);

  const cancelOrder = useCallback(async (orderId: string) => {
    await cancelOrderMutation({
      orderId: orderId as Id<'orders'>,
      sessionToken: sessionToken ?? undefined,
      guestToken: guestToken ?? undefined,
    });
  }, [cancelOrderMutation, sessionToken, guestToken]);

  const getDropById = useCallback((id: string) => drops.find((d) => d.id === id), [drops]);

  const refreshDrops = useCallback(async () => {
    // Reactive queries stay live on their own — kept as a no-op for screens
    // that still call refreshDrops() on pull-to-refresh.
  }, []);

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
      refreshDrops,
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
