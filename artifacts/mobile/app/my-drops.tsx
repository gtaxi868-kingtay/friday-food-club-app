/**
 * My Drops — Chef's own drop history
 *
 * Lists all drops posted by the signed-in chef across all statuses:
 * ACTIVE, UNLOCKED, SOLD_OUT, COMPLETED, CANCELLED.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlassView from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/contexts/AppContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type DropStatus = 'ACTIVE' | 'UNLOCKED' | 'SOLD_OUT' | 'COMPLETED' | 'CANCELLED';

interface Drop {
  id: string;
  title: string;
  mealSlot: string;
  status: DropStatus;
  price: number;
  inventory: number;
  minOrders: number;
  currentOrders: number;
  remaining: number;
  expiresAt: string;
  pickupLocation: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<DropStatus, { label: string; color: string; bg: string; border: string }> = {
  ACTIVE:    { label: 'Active',    color: '#4CAF50', bg: 'rgba(76,175,80,0.12)',    border: 'rgba(76,175,80,0.25)' },
  UNLOCKED:  { label: 'Unlocked',  color: '#D4AF37', bg: 'rgba(212,175,55,0.12)',   border: 'rgba(212,175,55,0.25)' },
  SOLD_OUT:  { label: 'Sold Out',  color: '#F5A623', bg: 'rgba(245,166,35,0.12)',   border: 'rgba(245,166,35,0.25)' },
  COMPLETED: { label: 'Completed', color: '#5C9CF5', bg: 'rgba(92,156,245,0.12)',   border: 'rgba(92,156,245,0.25)' },
  CANCELLED: { label: 'Cancelled', color: '#888888', bg: 'rgba(136,136,136,0.10)', border: 'rgba(136,136,136,0.20)' },
};

function formatExpiry(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    if (diff < 0) return 'Expired';
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 24) return `${hours}h left`;
    const days = Math.floor(hours / 24);
    return `${days}d left`;
  } catch {
    return '';
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-TT', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return ''; }
}

// ── Drop Row ──────────────────────────────────────────────────────────────────

function DropRow({ drop, onPress }: { drop: Drop; onPress: () => void }) {
  const colors = useColors();
  const cfg = STATUS_CONFIG[drop.status] ?? STATUS_CONFIG.CANCELLED;
  const isExpired = drop.status === 'ACTIVE' || drop.status === 'UNLOCKED';
  const expiry = isExpired ? formatExpiry(drop.expiresAt) : formatDate(drop.expiresAt);

  const orderPct = drop.inventory > 0
    ? Math.min(1, drop.currentOrders / drop.inventory)
    : 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.dropRow, { opacity: pressed ? 0.75 : 1 }]}
    >
      {/* Status badge */}
      <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
        <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>

      {/* Title + meal slot */}
      <Text style={[styles.dropTitle, { color: colors.foreground }]} numberOfLines={2}>
        {drop.title}
      </Text>
      <Text style={[styles.dropSub, { color: colors.mutedForeground }]}>
        {drop.mealSlot} · {drop.pickupLocation}
      </Text>

      {/* Stats row */}
      <View style={styles.dropStats}>
        {/* Orders / inventory */}
        <View style={styles.statChip}>
          <Ionicons name="people-outline" size={12} color={colors.mutedForeground} />
          <Text style={[styles.statChipText, { color: colors.mutedForeground }]}>
            {drop.currentOrders} / {drop.inventory}
          </Text>
        </View>

        {/* Min orders */}
        <View style={styles.statChip}>
          <Ionicons name="checkmark-done-outline" size={12} color={colors.mutedForeground} />
          <Text style={[styles.statChipText, { color: colors.mutedForeground }]}>
            min {drop.minOrders}
          </Text>
        </View>

        {/* Price */}
        <View style={styles.statChip}>
          <Text style={[styles.statChipText, { color: colors.gold }]}>
            {drop.price.toFixed(2)} TTD
          </Text>
        </View>

        {/* Expiry */}
        <View style={[styles.statChip, { marginLeft: 'auto' }]}>
          <Ionicons
            name={isExpired ? 'time-outline' : 'calendar-outline'}
            size={12}
            color={colors.mutedForeground}
          />
          <Text style={[styles.statChipText, { color: colors.mutedForeground }]}>
            {expiry}
          </Text>
        </View>
      </View>

      {/* Progress bar — only for active/unlocked */}
      {(drop.status === 'ACTIVE' || drop.status === 'UNLOCKED') && (
        <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.round(orderPct * 100)}%` as any,
                backgroundColor: orderPct >= 1 ? '#4CAF50' : colors.gold,
              },
            ]}
          />
        </View>
      )}
    </Pressable>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MyDropsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { authHeaders } = useAuth();

  const [drops, setDrops] = useState<Drop[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error' | 'unauth'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      // Resolve the chef's own ID first
      const meRes = await fetch(`${API_BASE}/chefs/me/status`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      });
      if (meRes.status === 401 || meRes.status === 403) {
        setLoadState('unauth');
        return;
      }
      if (!meRes.ok) { setLoadState('error'); return; }
      const me = await meRes.json() as { chefId?: string };
      if (!me.chefId) { setLoadState('unauth'); return; }

      // Fetch full drop history for this chef — /chefs/:id/drops returns all
      // statuses including expired, completed, and cancelled drops without any
      // expiresAt filter (unlike GET /api/drops which only returns live drops).
      const dropsRes = await fetch(
        `${API_BASE}/chefs/${encodeURIComponent(me.chefId)}/drops?limit=50`,
        {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
        }
      );
      if (!dropsRes.ok) { setLoadState('error'); return; }
      const body = await dropsRes.json() as { drops: Drop[] };
      // Sort: active/unlocked first, then by expiry descending
      const sorted = [...(body.drops ?? [])].sort((a, b) => {
        const priority: Record<string, number> = {
          ACTIVE: 0, UNLOCKED: 1, SOLD_OUT: 2, COMPLETED: 3, CANCELLED: 4,
        };
        const pa = priority[a.status] ?? 5;
        const pb = priority[b.status] ?? 5;
        if (pa !== pb) return pa - pb;
        return new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime();
      });
      setDrops(sorted);
      setLoadState('ok');
    } catch {
      setLoadState('error');
    }
  }, [authHeaders]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Back button */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.backBtn, { top: insets.top + 12 }]}
      >
        <GlassView intensity={60} style={styles.backBtnInner}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </GlassView>
      </Pressable>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 72, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.gold}
          />
        }
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>My Drops</Text>
          {loadState === 'ok' && drops.length > 0 && (
            <GlassView intensity={30} style={styles.countBadge}>
              <Text style={[styles.countText, { color: colors.gold }]}>{drops.length}</Text>
            </GlassView>
          )}
        </View>

        {/* Loading */}
        {loadState === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.gold} size="large" />
          </View>
        )}

        {/* Unauthenticated */}
        {loadState === 'unauth' && (
          <GlassView intensity={30} style={styles.messageCard}>
            <Ionicons name="person-outline" size={24} color={colors.mutedForeground} />
            <Text style={[styles.messageText, { color: colors.mutedForeground }]}>
              Sign in as a verified chef to view your drops.
            </Text>
          </GlassView>
        )}

        {/* Error */}
        {loadState === 'error' && (
          <GlassView intensity={30} style={styles.messageCard}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.mutedForeground} />
            <Text style={[styles.messageText, { color: colors.mutedForeground }]}>
              Could not load drops. Pull down to retry.
            </Text>
          </GlassView>
        )}

        {/* Empty state */}
        {loadState === 'ok' && drops.length === 0 && (
          <GlassView intensity={30} style={styles.emptyCard}>
            <LinearGradient
              colors={['rgba(212,175,55,0.04)', 'transparent']}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="fast-food-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No drops yet</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              Create your first drop from the Studio tab to start taking orders.
            </Text>
          </GlassView>
        )}

        {/* Drop list */}
        {loadState === 'ok' && drops.length > 0 && (
          <GlassView intensity={30} style={styles.listCard}>
            <View style={[styles.listCardBorder, { borderColor: 'rgba(255,255,255,0.06)' }]} />
            {drops.map((drop, i) => (
              <React.Fragment key={drop.id}>
                {i > 0 && (
                  <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
                )}
                <DropRow
                  drop={drop}
                  onPress={() => router.push(`/drop/${drop.id}` as any)}
                />
              </React.Fragment>
            ))}
          </GlassView>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },

  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
  },
  backBtnInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  content: { paddingHorizontal: 16 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  pageTitle: { fontSize: 32, fontFamily: 'PlayfairDisplay_700Bold' },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.2)',
  },
  countText: { fontSize: 14, fontFamily: 'Inter_700Bold' },

  center: { alignItems: 'center', paddingVertical: 60 },

  messageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  messageText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },

  emptyCard: {
    alignItems: 'center',
    gap: 12,
    padding: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  emptyBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },

  listCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  listCardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
  },

  divider: { height: 1, marginHorizontal: 16 },

  // Drop row
  dropRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
  },
  statusText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  dropTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 21 },
  dropSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  dropStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  progressTrack: {
    height: 3,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});
