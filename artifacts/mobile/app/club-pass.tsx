/**
 * Club Pass — buyer subscription purchase & management screen
 *
 * Fetches live price from platform config, shows benefits, and wires
 * Subscribe / Cancel to the subscriptions API. On success the AuthContext
 * is updated so the rest of the app reflects active membership immediately.
 */
import React, { useState } from 'react';
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@workspace/convex-backend/convex/_generated/api';
import GlassView from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';

const BENEFITS = [
  { icon: 'pricetag-outline', text: 'Member pricing on every drop — pay less, eat more' },
  { icon: 'flash-outline', text: 'Priority access to limited-edition drops before they sell out' },
  { icon: 'ribbon-outline', text: 'Exclusive Club Pass badge on your profile' },
  { icon: 'notifications-outline', text: 'Early drop alerts — get notified before the public' },
  { icon: 'cash-outline', text: 'Zero service fees on digital escrow orders' },
] as const;

export default function ClubPassScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token, hasClubPass, clubPassExpiry } = useAuth();

  const config = useQuery(api.config.get, {});
  const price = config?.clubPassPrice ?? 5;
  const loadingPrice = config === undefined;

  const subscribeMutation = useMutation(api.subscriptions.subscribe);
  const cancelMutation = useMutation(api.subscriptions.cancel);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubscribe = async () => {
    if (!user || !token || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await subscribeMutation({ sessionToken: token });
      setSuccess(true);
    } catch (err: any) {
      setError(err?.data?.message ?? err?.message ?? 'Failed to activate Club Pass');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!user || !token || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await cancelMutation({ sessionToken: token });
    } catch (err: any) {
      setError(err?.data?.message ?? err?.message ?? 'Failed to cancel');
    } finally {
      setSubmitting(false);
    }
  };

  const formatExpiry = (iso: string | null) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString('en-TT', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return iso; }
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
      >
        {/* Hero */}
        <LinearGradient
          colors={['#1A1200', '#0D0D0D', '#1A1200']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <LinearGradient
            colors={['rgba(212,175,55,0.10)', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroBorder} />
          <MaterialCommunityIcons name="crown" size={48} color="#D4AF37" />
          <Text style={styles.heroTitle}>FRIDAY FOOD CLUB{'\n'}CLUB PASS</Text>
          <Text style={styles.heroSub}>
            Exclusive access to the city's most coveted drops — at member prices.
          </Text>
          {loadingPrice ? (
            <ActivityIndicator color="#D4AF37" style={{ marginTop: 8 }} />
          ) : (
            <View style={styles.priceRow}>
              <Text style={styles.priceAmount}>
                ${price}
                <Text style={styles.pricePer}>/month</Text>
              </Text>
            </View>
          )}
        </LinearGradient>

        {/* Active state */}
        {hasClubPass && (
          <GlassView intensity={30} style={styles.activeCard}>
            <View style={styles.activeBorder} />
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeTitle}>Club Pass Active</Text>
              {clubPassExpiry && (
                <Text style={styles.activeSub}>
                  Valid until {formatExpiry(clubPassExpiry)}
                </Text>
              )}
            </View>
          </GlassView>
        )}

        {/* Success banner */}
        {success && (
          <GlassView intensity={30} style={styles.successCard}>
            <Ionicons name="star" size={20} color="#D4AF37" />
            <Text style={styles.successText}>
              Welcome to the Club! Your pass is now active.
            </Text>
          </GlassView>
        )}

        {/* Benefits */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>What you get</Text>
        </View>

        <GlassView intensity={30} style={styles.benefitsCard}>
          <View style={styles.benefitsBorder} />
          {BENEFITS.map((b, i) => (
            <React.Fragment key={b.text}>
              {i > 0 && <View style={styles.benefitDivider} />}
              <View style={styles.benefitRow}>
                <LinearGradient
                  colors={['#1A1200', '#2A1E00']}
                  style={styles.benefitIconWrap}
                >
                  <Ionicons name={b.icon as any} size={18} color="#D4AF37" />
                </LinearGradient>
                <Text style={[styles.benefitText, { color: 'rgba(255,255,255,0.82)' }]}>
                  {b.text}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </GlassView>

        {/* Error */}
        {error && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={16} color="#FF6B6B" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* CTA */}
        {!user ? (
          <Pressable
            onPress={() => router.back()}
            style={styles.ctaWrap}
          >
            <LinearGradient
              colors={['#F5D060', '#D4AF37', '#9E8028']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.cta}
            >
              <Text style={styles.ctaText}>Sign in to Subscribe</Text>
              <Ionicons name="arrow-forward" size={18} color="#0A0A0A" />
            </LinearGradient>
          </Pressable>
        ) : hasClubPass ? (
          <Pressable
            onPress={handleCancel}
            disabled={submitting}
            style={({ pressed }) => [styles.cancelWrap, { opacity: pressed || submitting ? 0.65 : 1 }]}
          >
            <GlassView intensity={30} style={styles.cancelBtn}>
              {submitting ? (
                <ActivityIndicator color="#888" size="small" />
              ) : (
                <Text style={styles.cancelText}>Cancel Club Pass</Text>
              )}
            </GlassView>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSubscribe}
            disabled={submitting || loadingPrice}
            style={({ pressed }) => [styles.ctaWrap, { opacity: pressed || submitting ? 0.85 : 1 }]}
          >
            <LinearGradient
              colors={['#F5D060', '#D4AF37', '#B8961E', '#9E8028']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cta}
            >
              {submitting ? (
                <ActivityIndicator color="#0A0A0A" size="small" />
              ) : (
                <>
                  <MaterialCommunityIcons name="crown" size={20} color="#0A0A0A" />
                  <Text style={styles.ctaText}>
                    Activate Club Pass · ${price}/month
                  </Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        )}

        <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
          Cancel anytime. Pass remains valid until the end of your billing period.
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
  // Hero
  heroCard: {
    borderRadius: 28, padding: 28, alignItems: 'center',
    gap: 14, marginBottom: 16, overflow: 'hidden',
  },
  heroBorder: {
    ...StyleSheet.absoluteFillObject, borderRadius: 28,
    borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)',
  },
  heroTitle: {
    fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold',
    color: '#D4AF37', textAlign: 'center', letterSpacing: 2, lineHeight: 30,
  },
  heroSub: {
    fontSize: 14, fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 21,
  },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  priceAmount: {
    fontSize: 42, fontFamily: 'Inter_700Bold',
    color: '#FFFFFF', letterSpacing: -1,
  },
  pricePer: {
    fontSize: 16, fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.45)',
  },
  // Active state
  activeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 16, overflow: 'hidden',
    marginBottom: 12, borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.25)',
  },
  activeBorder: {
    ...StyleSheet.absoluteFillObject, borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(76,175,80,0.25)',
  },
  activeTitle: {
    fontSize: 14, fontFamily: 'Inter_700Bold', color: '#4CAF50',
  },
  activeSub: {
    fontSize: 12, fontFamily: 'Inter_400Regular',
    color: 'rgba(76,175,80,0.7)', marginTop: 2,
  },
  // Success
  successCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 16, overflow: 'hidden',
    marginBottom: 12, borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
  },
  successText: {
    flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.85)',
  },
  // Section
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginBottom: 14, marginTop: 8,
  },
  sectionDot: { width: 4, height: 4, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  // Benefits
  benefitsCard: {
    borderRadius: 20, overflow: 'hidden',
    marginBottom: 24, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  benefitsBorder: {
    ...StyleSheet.absoluteFillObject, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  benefitRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 14, padding: 16,
  },
  benefitIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(212,175,55,0.2)',
  },
  benefitText: {
    flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20,
  },
  benefitDivider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.05)',
    marginLeft: 70,
  },
  // Error
  errorCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 8, padding: 14, borderRadius: 14,
    backgroundColor: 'rgba(255,107,107,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,107,107,0.2)',
    marginBottom: 16,
  },
  errorText: {
    flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular',
    color: '#FF6B6B', lineHeight: 18,
  },
  // CTA
  ctaWrap: { marginBottom: 12 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 18, borderRadius: 18,
  },
  ctaText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },
  // Cancel
  cancelWrap: { marginBottom: 12 },
  cancelBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  cancelText: {
    fontSize: 14, fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.45)',
  },
  disclaimer: {
    fontSize: 12, fontFamily: 'Inter_400Regular',
    textAlign: 'center', lineHeight: 18, marginTop: 4,
  },
});
