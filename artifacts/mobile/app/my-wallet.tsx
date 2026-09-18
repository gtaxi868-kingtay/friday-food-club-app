/**
 * My Wallet — buyer's dedicated wallet screen
 *
 * Previously the wallet was just a small balance+button card wedged into
 * the Profile tab. This is the full page: balance, a top-up CTA, and the
 * top-up history — the buyer counterpart to the chef's wallet.tsx.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
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

function formatDate(ms: number) {
  try {
    return new Date(ms).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return String(ms); }
}

const STATUS_LABEL: Record<string, string> = {
  INITIATED: 'Started',
  PENDING: 'Processing',
  PAID: 'Completed',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
};

export default function MyWalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token } = useAuth();

  const history = useQuery(api.payments.myWalletHistory, token ? { sessionToken: token } : 'skip');
  const loading = !!token && history === undefined;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 12 }]}>
        <GlassView intensity={60} style={styles.backBtnInner}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </GlassView>
      </Pressable>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 72, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>My Wallet</Text>

        <GlassView intensity={40} style={[styles.balanceCard, { borderColor: 'rgba(212,175,55,0.15)' }]}>
          <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>Balance</Text>
          <Text style={[styles.balanceValue, { color: colors.gold }]}>
            ${(user?.walletBalance ?? 0).toFixed(2)}
          </Text>

          <Pressable
            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, marginTop: 18, width: '100%' }]}
            onPress={() => router.push('/add-funds')}
          >
            <LinearGradient
              colors={[colors.goldDark, colors.gold]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaBtn}
            >
              <Ionicons name="add" size={18} color="#0A0A0A" />
              <Text style={styles.ctaBtnText}>Add Funds</Text>
            </LinearGradient>
          </Pressable>
        </GlassView>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Top-up history</Text>

        {loading ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: 20 }} />
        ) : !history?.length ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No top-ups yet. Add funds to see your history here.
            </Text>
          </View>
        ) : (
          <GlassView intensity={30} style={[styles.historyCard, { borderColor: 'rgba(255,255,255,0.08)' }]}>
            {history.map((h, i) => (
              <View
                key={h.id}
                style={[
                  styles.historyRow,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
                ]}
              >
                <View>
                  <Text style={[styles.historyAmount, { color: colors.foreground }]}>${h.amount.toFixed(2)}</Text>
                  <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>{formatDate(h.createdAt)}</Text>
                </View>
                <Text
                  style={[
                    styles.historyStatus,
                    { color: h.status === 'PAID' ? '#4CAF50' : h.status === 'FAILED' ? '#E8294A' : colors.mutedForeground },
                  ]}
                >
                  {STATUS_LABEL[h.status] ?? h.status}
                </Text>
              </View>
            ))}
          </GlassView>
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
  title: { fontSize: 28, fontFamily: 'PlayfairDisplay_700Bold', marginBottom: 20 },
  balanceCard: {
    borderRadius: 20, overflow: 'hidden', borderWidth: 1,
    padding: 22, alignItems: 'center', marginBottom: 28,
  },
  balanceLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 6 },
  balanceValue: { fontSize: 36, fontFamily: 'PlayfairDisplay_700Bold' },
  ctaBtn: {
    borderRadius: 16, height: 50, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  ctaBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },
  sectionLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 12 },
  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', maxWidth: 240 },
  historyCard: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  historyAmount: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  historyDate: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  historyStatus: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
