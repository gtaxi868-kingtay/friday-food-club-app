/**
 * Earnings — Chef's revenue summary
 *
 * Shows total all-time earnings from completed drops, current wallet balance,
 * and a per-drop breakdown so chefs can reconcile each payout.
 */
import React, { useState } from 'react';
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
import { useQuery } from 'convex/react';
import { api } from '@workspace/convex-backend/convex/_generated/api';
import GlassView from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ms: number | null) {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleDateString('en-TT', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return String(ms); }
}

function fmtTTD(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)} TTD`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function EarningsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const data = useQuery(api.chefs.myEarnings, token ? { sessionToken: token } : 'skip');
  const loadState: 'loading' | 'ok' | 'unauth' = !token ? 'unauth' : data === undefined ? 'loading' : 'ok';

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 300));
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
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>Earnings</Text>

        {/* ── Loading ─────────────────────────────────────────────── */}
        {loadState === 'loading' && !data && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.gold} size="large" />
          </View>
        )}

        {/* ── Unauth ──────────────────────────────────────────────── */}
        {loadState === 'unauth' && (
          <GlassView intensity={30} style={styles.messageCard}>
            <Ionicons name="person-outline" size={24} color={colors.mutedForeground} />
            <Text style={[styles.messageText, { color: colors.mutedForeground }]}>
              Sign in as a verified chef to view your earnings.
            </Text>
          </GlassView>
        )}

        {/* ── Data ────────────────────────────────────────────────── */}
        {data && (
          <>
            {/* Summary cards */}
            <View style={styles.summaryRow}>
              {/* Total earnings */}
              <GlassView intensity={50} style={[styles.summaryCard, styles.summaryCardWide]}>
                <LinearGradient
                  colors={['rgba(212,175,55,0.06)', 'transparent']}
                  style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                  colors={[colors.goldDark, colors.gold, colors.goldLight, colors.gold, colors.goldDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.cardTopBorder}
                />
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
                  TOTAL EARNINGS
                </Text>
                <Text style={[styles.summaryAmount, { color: colors.gold }]}>
                  {data.totalEarnings.toFixed(2)}
                  <Text style={styles.summaryUnit}> TTD</Text>
                </Text>
                <Text style={[styles.summaryNote, { color: colors.mutedForeground }]}>
                  {data.drops.length} completed {data.drops.length === 1 ? 'drop' : 'drops'}
                </Text>
              </GlassView>

              {/* Wallet balance */}
              <GlassView intensity={40} style={styles.summaryCard}>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
                  WALLET
                </Text>
                <Text
                  style={[
                    styles.summaryAmount,
                    styles.summaryAmountSm,
                    {
                      color: data.walletBalance < data.freezeThreshold
                        ? '#FF4444'
                        : data.walletBalance < 0
                        ? '#F5A623'
                        : '#4CAF50',
                    },
                  ]}
                >
                  {data.walletBalance >= 0 ? '+' : ''}
                  {data.walletBalance.toFixed(2)}
                  <Text style={styles.summaryUnit}> TTD</Text>
                </Text>
                <Text style={[styles.summaryNote, { color: colors.mutedForeground }]}>
                  {data.walletBalance < data.freezeThreshold
                    ? 'Frozen'
                    : data.walletBalance < 0
                    ? 'Overdue'
                    : 'Clear'}
                </Text>
              </GlassView>
            </View>

            {/* Per-drop breakdown */}
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Completed Drops
              </Text>
            </View>

            {data.drops.length === 0 ? (
              <GlassView intensity={30} style={styles.emptyCard}>
                <Ionicons name="receipt-outline" size={28} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No completed drops yet. Earnings will appear here once a drop sells out and unlocks.
                </Text>
              </GlassView>
            ) : (
              <GlassView intensity={30} style={styles.dropList}>
                <View style={[styles.dropListBorder, { borderColor: 'rgba(255,255,255,0.06)' }]} />
                {data.drops.map((drop, i) => (
                  <React.Fragment key={drop.id}>
                    {i > 0 && (
                      <View style={[styles.dropDivider, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
                    )}
                    <View style={styles.dropRow}>
                      <GlassView intensity={20} style={styles.dropIconWrap}>
                        <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                      </GlassView>
                      <View style={styles.dropInfo}>
                        <Text
                          style={[styles.dropTitle, { color: colors.foreground }]}
                          numberOfLines={1}
                        >
                          {drop.title as string}
                        </Text>
                        <Text style={[styles.dropMeta, { color: colors.mutedForeground }]}>
                          {`${drop.orders} ${drop.orders === 1 ? 'order' : 'orders'}`}
                          {drop.lastFulfilledAt ? `  ·  ${fmtDate(drop.lastFulfilledAt)}` : ''}
                        </Text>
                      </View>
                      <Text style={[styles.dropEarnings, { color: colors.gold }]}>
                        {fmtTTD(drop.chefEarnings)}
                      </Text>
                    </View>
                  </React.Fragment>
                ))}
              </GlassView>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16 },

  backBtn: { position: 'absolute', left: 16, zIndex: 10 },
  backBtnInner: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },

  pageTitle: {
    fontSize: 32,
    fontFamily: 'PlayfairDisplay_700Bold',
    marginBottom: 24,
  },

  center: { alignItems: 'center', paddingVertical: 48 },

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
  messageText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },

  // Summary row
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  summaryCard: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.15)',
  },
  summaryCardWide: { flex: 1.55 },
  cardTopBorder: { height: 1.5, marginBottom: 14, marginHorizontal: -18, marginTop: -18 },
  summaryLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  summaryAmount: { fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  summaryAmountSm: { fontSize: 20 },
  summaryUnit: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  summaryNote: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionDot: { width: 4, height: 4, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },

  // Empty
  emptyCard: {
    alignItems: 'center',
    gap: 12,
    padding: 28,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    textAlign: 'center',
  },

  // Drop list
  dropList: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  dropListBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: 1,
  },
  dropDivider: { height: 1, marginHorizontal: 16 },
  dropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  dropInfo: { flex: 1, gap: 3 },
  dropTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  dropMeta: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  dropEarnings: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});
