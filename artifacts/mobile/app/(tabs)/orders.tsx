import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import GlassView from '@/components/GlassView';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/contexts/AppContext';
import OrderCard from '@/components/OrderCard';

const LOGO_GOLD = require('@/assets/images/logo-gold-transparent.png');

export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { orders, cancelOrder } = useApp();

  const activeOrders = orders.filter(o => o.status !== 'cancelled');
  const cancelledOrders = orders.filter(o => o.status === 'cancelled');
  const lockedFunds = activeOrders
    .filter((o) => o.escrowStatus === 'HELD')
    .reduce((sum, o) => sum + (o.effectivePrice ?? o.price), 0);
  const confirmedOrders = activeOrders.filter(o => o.currentOrders >= o.minOrders);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Image source={LOGO_GOLD} style={styles.bgWatermark} resizeMode="contain" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Orders</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            Wallet & batch tracking
          </Text>
        </View>

        {/* Wallet Card */}
        <View style={styles.walletWrap}>
          <LinearGradient
            colors={['#1A1200', '#0A0A0A', '#1A1200']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.walletCard}
          >
            <Image source={LOGO_GOLD} style={styles.walletLogoBackdrop} resizeMode="contain" />
            <LinearGradient
              colors={['rgba(212,175,55,0.06)', 'transparent', 'rgba(212,175,55,0.04)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.walletTop}>
              <View>
                <Text style={styles.walletLabel}>LOCKED IN BATCHES</Text>
                <Text style={styles.walletAmount}>${lockedFunds}</Text>
              </View>
              <GlassView intensity={35} style={styles.walletIconWrap}>
                <Ionicons name="wallet-outline" size={22} color={colors.gold} />
              </GlassView>
            </View>

            <LinearGradient
              colors={['transparent', 'rgba(212,175,55,0.3)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.walletDivider}
            />

            <View style={styles.walletStats}>
              {[
                { label: 'ACTIVE', value: activeOrders.length },
                { label: 'CONFIRMED', value: confirmedOrders.length },
                { label: 'CANCELLED', value: cancelledOrders.length },
              ].map((s, i) => (
                <React.Fragment key={s.label}>
                  {i > 0 && (
                    <View style={[styles.walletStatDivider, { backgroundColor: 'rgba(212,175,55,0.2)' }]} />
                  )}
                  <View style={styles.walletStatItem}>
                    <Text style={styles.walletStatValue}>{s.value}</Text>
                    <Text style={styles.walletStatLabel}>{s.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>

            <LinearGradient
              colors={[colors.goldDark, colors.gold, colors.goldLight, colors.gold, colors.goldDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.walletBottomBorder}
            />
          </LinearGradient>
          <View style={styles.walletBorder} />
        </View>

        {/* Active orders */}
        {activeOrders.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Active Batches
              </Text>
              <GlassView intensity={30} style={styles.countPill}>
                <Text style={[styles.countPillText, { color: colors.gold }]}>
                  {activeOrders.length}
                </Text>
              </GlassView>
            </View>
            {activeOrders.map(order => (
              <OrderCard key={order.id} order={order} onCancel={cancelOrder} />
            ))}
          </>
        )}

        {/* Cancelled */}
        {cancelledOrders.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: colors.mutedForeground }]} />
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                Cancelled
              </Text>
            </View>
            {cancelledOrders.map(order => (
              <OrderCard key={order.id} order={order} onCancel={cancelOrder} />
            ))}
          </>
        )}

        {/* Empty state */}
        {orders.length === 0 && (
          <GlassView intensity={35} style={styles.emptyCard}>
            <Ionicons name="bag-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No orders yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Pre-order a drop from the Feed to lock your spot in a batch
            </Text>
          </GlassView>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bgWatermark: {
    position: 'absolute',
    width: 360,
    height: 360,
    top: 40,
    right: -90,
    opacity: 0.05,
    zIndex: 0,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16 },
  header: { marginBottom: 20 },
  headerTitle: { fontSize: 32, fontFamily: 'PlayfairDisplay_700Bold' },
  headerSub: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 2 },
  walletWrap: { marginBottom: 28, borderRadius: 24, overflow: 'hidden', position: 'relative' },
  walletCard: { borderRadius: 24, padding: 22, gap: 16, minHeight: 180, overflow: 'hidden' },
  walletLogoBackdrop: {
    position: 'absolute',
    width: 240,
    height: 240,
    right: -40,
    top: -20,
    opacity: 0.13,
  },
  walletTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  walletLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(212,175,55,0.7)',
    letterSpacing: 2,
    marginBottom: 6,
  },
  walletAmount: {
    fontSize: 42,
    fontFamily: 'Inter_700Bold',
    color: '#D4AF37',
    letterSpacing: -1,
  },
  walletIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
  },
  walletDivider: { height: 1 },
  walletStats: { flexDirection: 'row' },
  walletStatItem: { flex: 1, alignItems: 'center', gap: 4 },
  walletStatValue: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  walletStatLabel: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.5,
  },
  walletStatDivider: { width: 1, marginVertical: 6 },
  walletBottomBorder: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2 },
  walletBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.22)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionDot: { width: 4, height: 4, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', flex: 1 },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
  },
  countPillText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  emptyCard: {
    borderRadius: 24,
    overflow: 'hidden',
    padding: 40,
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginTop: 20,
  },
  emptyTitle: { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  emptySub: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 21,
  },
});
