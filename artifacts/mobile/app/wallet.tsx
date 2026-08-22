/**
 * Wallet — Chef's own financial dashboard
 *
 * Shows live wallet balance, freeze status, cash debt, total earnings,
 * and the full AdminCredit history so chefs understand every settlement.
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

interface WalletData {
  chefId: string;
  walletBalance: number;
  freezeThreshold: number;
  isFrozen: boolean;
  cashDebt: number;
  totalEarnings: number;
  creditHistory: { id: string; amount: number; note: string | null; createdAt: number }[];
}

function formatDate(ms: number) {
  try {
    return new Date(ms).toLocaleDateString('en-TT', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return String(ms); }
}

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const raw = useQuery(api.chefs.myWallet, token ? { sessionToken: token } : 'skip');
  const data: WalletData | null = raw
    ? { ...raw, creditHistory: raw.creditHistory.map((c) => ({ id: c.id, amount: c.amount, note: c.note, createdAt: c.createdAt })) }
    : null;
  const loadState: 'loading' | 'ok' | 'unauth' = !token ? 'unauth' : raw === undefined ? 'loading' : 'ok';

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 300));
    setRefreshing(false);
  };

  const balanceColor = (w: WalletData) =>
    w.isFrozen ? '#FF4444' : w.walletBalance < 0 ? '#F5A623' : '#4CAF50';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Back */}
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
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>Wallet</Text>

        {loadState === 'loading' && !data && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.gold} size="large" />
          </View>
        )}

        {loadState === 'unauth' && (
          <GlassView intensity={30} style={styles.messageCard}>
            <Ionicons name="person-outline" size={24} color={colors.mutedForeground} />
            <Text style={[styles.messageText, { color: colors.mutedForeground }]}>
              Sign in as a verified chef to view your wallet.
            </Text>
          </GlassView>
        )}

        {data && (
          <>
            {/* Balance card */}
            <GlassView intensity={50} style={styles.balanceCard}>
              <LinearGradient
                colors={[colors.goldDark, colors.gold, colors.goldLight, colors.gold, colors.goldDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.cardTopBorder}
              />
              <LinearGradient
                colors={['rgba(212,175,55,0.05)', 'transparent']}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.balanceTop}>
                <View>
                  <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>
                    BALANCE
                  </Text>
                  <Text style={[styles.balanceAmount, { color: balanceColor(data) }]}>
                    {data.walletBalance >= 0 ? '+' : ''}
                    {data.walletBalance.toFixed(2)}{' '}
                    <Text style={styles.balanceCurrency}>TTD</Text>
                  </Text>
                </View>
                {data.isFrozen ? (
                  <View style={styles.frozenBadge}>
                    <Ionicons name="lock-closed" size={12} color="#FF4444" />
                    <Text style={styles.frozenBadgeText}>FROZEN</Text>
                  </View>
                ) : data.walletBalance < 0 ? (
                  <View style={styles.warningBadge}>
                    <Ionicons name="warning" size={12} color="#F5A623" />
                    <Text style={styles.warningBadgeText}>OVERDUE</Text>
                  </View>
                ) : (
                  <View style={styles.clearBadge}>
                    <Ionicons name="checkmark-circle" size={12} color="#4CAF50" />
                    <Text style={styles.clearBadgeText}>CLEAR</Text>
                  </View>
                )}
              </View>

              {data.isFrozen && (
                <View style={styles.frozenBanner}>
                  <Ionicons name="lock-closed" size={14} color="#FF4444" />
                  <Text style={styles.frozenBannerText}>
                    Wallet frozen — posting new drops is blocked until you settle your cash debt.
                    Contact your admin to credit your account.
                  </Text>
                </View>
              )}

              {/* Stats row */}
              <View style={[styles.statsRow, { borderTopColor: 'rgba(212,175,55,0.12)' }]}>
                {[
                  {
                    label: 'FREEZE LIMIT',
                    value: `${data.freezeThreshold.toFixed(0)} TTD`,
                    color: colors.mutedForeground,
                  },
                  {
                    label: 'CASH DEBT',
                    value: `${Math.abs(data.cashDebt ?? 0).toFixed(2)} TTD`,
                    color: (data.cashDebt ?? 0) < 0 ? '#F5A623' : colors.mutedForeground,
                  },
                  {
                    label: 'TOTAL EARNED',
                    value: `${(data.totalEarnings ?? 0).toFixed(2)} TTD`,
                    color: '#4CAF50',
                  },
                ].map((s, i) => (
                  <React.Fragment key={s.label}>
                    {i > 0 && <View style={styles.statDivider} />}
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                        {s.label}
                      </Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </GlassView>

            {/* Credit history */}
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Admin Credits
              </Text>
            </View>

            {(!data.creditHistory || data.creditHistory.length === 0) ? (
              <GlassView intensity={25} style={styles.emptyCard}>
                <Ionicons name="receipt-outline" size={24} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No admin credits yet
                </Text>
              </GlassView>
            ) : (
              <GlassView intensity={25} style={styles.historyCard}>
                <View style={styles.historyBorder} />
                {data.creditHistory.map((c, i) => (
                  <React.Fragment key={c.id}>
                    {i > 0 && <View style={styles.historyDivider} />}
                    <View style={styles.historyRow}>
                      <LinearGradient
                        colors={c.amount >= 0 ? ['#1A2400', '#0D1A00'] : ['#1A0000', '#0D0000']}
                        style={styles.historyIcon}
                      >
                        <Ionicons
                          name={c.amount >= 0 ? 'arrow-up' : 'arrow-down'}
                          size={14}
                          color={c.amount >= 0 ? '#4CAF50' : '#FF4444'}
                        />
                      </LinearGradient>
                      <View style={styles.historyInfo}>
                        <Text style={[styles.historyNote, { color: colors.foreground }]}>
                          {c.note ?? 'Admin credit'}
                        </Text>
                        <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>
                          {formatDate(c.createdAt)}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.historyAmount,
                          { color: c.amount >= 0 ? '#4CAF50' : '#FF4444' },
                        ]}
                      >
                        {c.amount >= 0 ? '+' : ''}{c.amount.toFixed(2)} TTD
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  backBtn: { position: 'absolute', left: 16, zIndex: 100 },
  backBtnInner: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  content: { paddingHorizontal: 16 },
  pageTitle: {
    fontSize: 32, fontFamily: 'PlayfairDisplay_700Bold', marginBottom: 20,
  },
  center: { alignItems: 'center', paddingVertical: 60 },
  messageCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 20, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  messageText: {
    flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20,
  },
  // Balance card
  balanceCard: {
    borderRadius: 24, overflow: 'hidden',
    marginBottom: 24, borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.18)',
  },
  cardTopBorder: { height: 1.5 },
  balanceTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', padding: 20, paddingBottom: 14,
  },
  balanceLabel: {
    fontSize: 10, fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5, marginBottom: 6,
  },
  balanceAmount: { fontSize: 36, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  balanceCurrency: { fontSize: 16, fontFamily: 'Inter_400Regular' },
  frozenBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,68,68,0.12)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.25)',
  },
  frozenBadgeText: {
    fontSize: 10, fontFamily: 'Inter_700Bold',
    color: '#FF4444', letterSpacing: 1,
  },
  warningBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(245,166,35,0.12)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.25)',
  },
  warningBadgeText: {
    fontSize: 10, fontFamily: 'Inter_700Bold',
    color: '#F5A623', letterSpacing: 1,
  },
  clearBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(76,175,80,0.12)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.25)',
  },
  clearBadgeText: {
    fontSize: 10, fontFamily: 'Inter_700Bold',
    color: '#4CAF50', letterSpacing: 1,
  },
  frozenBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginHorizontal: 20, marginBottom: 14,
    padding: 12, borderRadius: 12,
    backgroundColor: 'rgba(255,68,68,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  frozenBannerText: {
    flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular',
    color: 'rgba(255,68,68,0.85)', lineHeight: 17,
  },
  statsRow: {
    flexDirection: 'row', borderTopWidth: 1, paddingVertical: 14,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  statLabel: {
    fontSize: 9, fontFamily: 'Inter_500Medium',
    letterSpacing: 0.5, textAlign: 'center',
  },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 4 },
  // Section
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginBottom: 14,
  },
  sectionDot: { width: 4, height: 4, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  // History
  historyCard: {
    borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  historyBorder: {
    ...StyleSheet.absoluteFillObject, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  historyRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingHorizontal: 16, paddingVertical: 14,
  },
  historyIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  historyInfo: { flex: 1 },
  historyNote: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  historyDate: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  historyAmount: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  historyDivider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.05)',
    marginLeft: 64,
  },
  // Empty
  emptyCard: {
    alignItems: 'center', gap: 10, padding: 32,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
