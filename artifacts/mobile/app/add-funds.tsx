/**
 * Add Funds — buyer wallet top-up
 *
 * Mirrors the club-pass checkout pattern: create a pending WiPay
 * transaction, open the hosted checkout in-browser, then let the webhook
 * (payments.applyWebhook) credit users.walletBalance once WiPay confirms
 * payment. Until WIPAY_API_KEY etc. are set on the Convex deployment,
 * startWalletTopUp throws PAYMENT_NOT_CONFIGURED — surfaced here as a
 * plain error message rather than a fake success.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAction } from 'convex/react';
import { api } from '@workspace/convex-backend/convex/_generated/api';
import * as WebBrowser from 'expo-web-browser';
import GlassView from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';

const PRESET_AMOUNTS = [25, 50, 100, 200];

export default function AddFundsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token } = useAuth();

  const startWalletTopUp = useAction(api.payments.startWalletTopUp);
  const [selected, setSelected] = useState<number>(50);
  const [customAmount, setCustomAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = customAmount ? parseFloat(customAmount) : selected;
  const validAmount = Number.isFinite(amount) && amount >= 10 && amount <= 1000;

  const handleTopUp = async () => {
    if (!user || !token || !validAmount || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const checkout = await startWalletTopUp({ sessionToken: token, amount });
      await WebBrowser.openBrowserAsync(checkout.checkoutUrl);
    } catch (err: any) {
      setError(err?.data?.message ?? err?.message ?? 'Failed to start top-up');
    } finally {
      setSubmitting(false);
    }
  };

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
        <Text style={[styles.title, { color: colors.foreground }]}>Add Funds</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Top up your wallet to check out faster on future drops.
        </Text>

        <GlassView intensity={40} style={[styles.balanceCard, { borderColor: 'rgba(212,175,55,0.15)' }]}>
          <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>Current balance</Text>
          <Text style={[styles.balanceValue, { color: colors.gold }]}>
            ${(user?.walletBalance ?? 0).toFixed(2)}
          </Text>
        </GlassView>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Choose an amount (TTD)</Text>
        <View style={styles.presetRow}>
          {PRESET_AMOUNTS.map((preset) => {
            const isActive = !customAmount && selected === preset;
            return (
              <Pressable
                key={preset}
                onPress={() => { setSelected(preset); setCustomAmount(''); }}
                style={[
                  styles.presetChip,
                  { borderColor: isActive ? colors.gold : 'rgba(255,255,255,0.12)' },
                  isActive && { backgroundColor: 'rgba(212,175,55,0.12)' },
                ]}
              >
                <Text style={[styles.presetChipText, { color: isActive ? colors.gold : colors.foreground }]}>
                  ${preset}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>Or enter a custom amount</Text>
        <GlassView intensity={25} style={styles.inputWrap}>
          <Text style={[styles.inputPrefix, { color: colors.mutedForeground }]}>$</Text>
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder="10 – 1000"
            placeholderTextColor={colors.mutedForeground}
            value={customAmount}
            onChangeText={setCustomAmount}
            keyboardType="decimal-pad"
          />
        </GlassView>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#E8294A" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [{ opacity: pressed || !validAmount ? 0.7 : 1, marginTop: 24 }]}
          onPress={handleTopUp}
          disabled={!validAmount || submitting}
        >
          <LinearGradient
            colors={submitting || !validAmount ? ['#555', '#444'] : [colors.goldDark, colors.gold]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaBtn}
          >
            {submitting
              ? <ActivityIndicator color="#0A0A0A" />
              : <Text style={styles.ctaBtnText}>Add ${validAmount ? amount.toFixed(2) : '—'}</Text>}
          </LinearGradient>
        </Pressable>

        <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
          Payments are processed securely by WiPay. Your balance updates automatically once payment is confirmed.
        </Text>
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
  title: { fontSize: 28, fontFamily: 'PlayfairDisplay_700Bold', marginBottom: 6 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 20 },
  balanceCard: {
    borderRadius: 20, overflow: 'hidden', borderWidth: 1,
    padding: 20, alignItems: 'center', marginBottom: 24,
  },
  balanceLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 6 },
  balanceValue: { fontSize: 34, fontFamily: 'PlayfairDisplay_700Bold' },
  sectionLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 10 },
  presetRow: { flexDirection: 'row', gap: 10 },
  presetChip: {
    flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  presetChipText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  inputWrap: {
    borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 50,
  },
  inputPrefix: { fontSize: 15, fontFamily: 'Inter_700Bold', marginRight: 6 },
  input: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16,
    padding: 12, borderRadius: 12, backgroundColor: 'rgba(232,41,74,0.1)',
  },
  errorText: { color: '#E8294A', fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  ctaBtn: {
    borderRadius: 16, height: 52, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  ctaBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },
  disclaimer: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16, textAlign: 'center', marginTop: 16 },
});
