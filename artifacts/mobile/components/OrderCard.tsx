import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { useColors } from '@/hooks/useColors';
import type { Order } from '@/contexts/AppContext';

interface Props {
  order: Order;
  onCancel?: (orderId: string) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function OrderCard({ order, onCancel }: Props) {
  const colors = useColors();
  const [showQr, setShowQr] = useState(false);
  const progress = Math.min(1, order.currentOrders / order.minOrders);
  const ordersNeeded = Math.max(0, order.minOrders - order.currentOrders);
  const isLocked = order.currentOrders >= order.minOrders;
  const isCancelled = order.status === 'cancelled';

  const handleCancel = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCancel?.(order.id);
  };

  const statusColor = isCancelled
    ? colors.mutedForeground
    : isLocked
    ? '#22C55E'
    : colors.gold;

  const statusLabel = isCancelled ? 'Cancelled' : isLocked ? 'Confirmed' : 'Pending';
  const statusIcon = isCancelled ? 'close-circle' : isLocked ? 'checkmark-circle' : 'time';

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: isCancelled ? colors.border : colors.goldBorder,
          opacity: isCancelled ? 0.6 : 1,
        },
      ]}
    >
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
            {order.dropTitle}
          </Text>
          <Text style={[styles.chef, { color: colors.mutedForeground }]}>
            {order.chefName}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.price, { color: colors.gold }]}>${order.effectivePrice ?? order.price}</Text>
          <View style={styles.statusRow}>
            <Ionicons name={statusIcon as any} size={12} color={statusColor} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
      </View>

      {/* Batch progress */}
      {!isCancelled && (
        <View style={styles.progressSection}>
          <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress * 100}%`,
                  backgroundColor: isLocked ? '#22C55E' : colors.gold,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
            {isLocked
              ? 'Batch confirmed — payout released to chef'
              : `${ordersNeeded} more pre-orders needed to unlock`}
          </Text>
        </View>
      )}

      {/* Pickup pass — QR shown to the chef at pickup to release escrow / confirm cash */}
      {!isCancelled && order.pickupToken && (
        <View style={[styles.pickupSection, { borderColor: 'rgba(212,175,55,0.2)' }]}>
          {/* Cash payment badge */}
          {order.paymentMethod === 'CASH' && (
            <View style={[styles.cashBadge, { backgroundColor: 'rgba(245,166,35,0.12)', borderColor: 'rgba(245,166,35,0.35)' }]}>
              <Ionicons name="cash-outline" size={13} color="#F5A623" />
              <Text style={[styles.cashBadgeText, { color: '#F5A623' }]}>CASH ON PICKUP</Text>
            </View>
          )}
          <Pressable
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowQr(v => !v);
            }}
            style={styles.pickupHeader}
          >
            <MaterialCommunityIcons name="qrcode-scan" size={16} color={colors.gold} />
            <Text style={[styles.pickupLabel, { color: colors.gold }]}>
              {order.escrowStatus === 'RELEASED' || order.escrowStatus === 'CASH_RECONCILED'
                ? 'PICKED UP'
                : 'PICKUP PASS'}
            </Text>
            <View style={{ flex: 1 }} />
            <Ionicons name={showQr ? 'chevron-up' : 'chevron-down'} size={14} color={colors.mutedForeground} />
          </Pressable>
          {showQr && (
            <View style={styles.qrWrap}>
              <View style={styles.qrBox}>
                <QRCode value={order.pickupToken} size={140} backgroundColor="#FFFFFF" color="#0A0A0A" />
              </View>
              <Text style={[styles.tokenText, { color: colors.foreground }]}>{order.pickupToken}</Text>
              <Text style={[styles.tokenHint, { color: colors.mutedForeground }]}>
                {order.escrowStatus === 'RELEASED'
                  ? 'Escrow released — enjoy your meal'
                  : order.escrowStatus === 'CASH_RECONCILED'
                  ? 'Cash collected — enjoy your meal'
                  : order.paymentMethod === 'CASH'
                  ? `Show this QR · pay $${order.effectivePrice ?? order.price} cash to your chef`
                  : 'Show this to your chef at pickup'}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.date, { color: colors.mutedForeground }]}>
          {formatDate(order.orderedAt)}
        </Text>
        {!isCancelled && !isLocked && (
          <Pressable onPress={handleCancel} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.red }]}>Cancel</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    marginBottom: 10,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  headerLeft: { flex: 1, gap: 2 },
  headerRight: { alignItems: 'flex-end', gap: 4 },
  title: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  chef: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  price: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  progressSection: { gap: 6 },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  cashBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  cashBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  pickupSection: { borderTopWidth: 1, paddingTop: 12, gap: 10 },
  pickupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickupLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  qrWrap: { alignItems: 'center', gap: 8, paddingVertical: 6 },
  qrBox: { backgroundColor: '#FFFFFF', padding: 10, borderRadius: 12 },
  tokenText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  tokenHint: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  cancelBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  cancelText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
