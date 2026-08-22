import React, { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import GlassView from '@/components/GlassView';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import type { Drop } from '@/contexts/AppContext';

const DROP_IMAGES: { [key: number]: ReturnType<typeof require> } = {
  1: require('@/assets/images/drop1.jpg'),
  2: require('@/assets/images/drop2.jpg'),
  3: require('@/assets/images/drop3.jpg'),
};

function useCountdown(expiresAt: string) {
  const get = () => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const [s, setS] = useState(get);
  useEffect(() => {
    const id = setInterval(() => setS(get()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return s;
}

function fmt(s: number) {
  if (s <= 0) return 'ENDED';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

interface Props {
  drop: Drop;
  hasOrdered: boolean;
  onPress: (drop: Drop) => void;
}

export default function DropCard({ drop, hasOrdered, onPress }: Props) {
  const colors = useColors();
  const secs = useCountdown(drop.expiresAt);
  const inventory = drop.inventory || drop.minOrders;
  const progress = Math.min(1, drop.currentOrders / inventory);
  const isCritical = secs < 3600 && secs > 0;
  const isSoldOut = drop.soldOut || drop.status === 'SOLD_OUT';
  const remaining = drop.remaining ?? Math.max(0, inventory - drop.currentOrders);
  const isAlmostFull = !isSoldOut && remaining <= Math.max(2, Math.floor(inventory * 0.15));

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(drop);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.92 : 1 }]}
    >
      {/* ── Food image ── */}
      <View style={styles.imageWrap}>
        <Image
          source={
            (drop.imageUrl
              ? { uri: drop.imageUrl! }
              : (DROP_IMAGES[drop.imageIndex] ?? DROP_IMAGES[1])) as any
          }
          style={styles.image}
          resizeMode="cover"
        />

        {/* Gradient fade into card body */}
        <LinearGradient
          colors={['transparent', 'rgba(14,14,14,0.55)', 'rgba(14,14,14,1)']}
          locations={[0.45, 0.78, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Cuisine badge — top left */}
        <View style={styles.cuisineBadge}>
          <Text style={styles.cuisineText}>{drop.cuisine.toUpperCase()}</Text>
        </View>

        {/* Countdown — top right */}
        <GlassView
          intensity={50}
          style={[
            styles.timerPill,
            { borderColor: isCritical ? 'rgba(196,30,58,0.7)' : 'rgba(212,175,55,0.45)' },
          ]}
        >
          <Ionicons name="time-outline" size={11} color={isCritical ? '#E8294A' : colors.gold} />
          <Text style={[styles.timerText, { color: isCritical ? '#E8294A' : colors.gold }]}>
            {fmt(secs)}
          </Text>
        </GlassView>

        {/* Ordered / Sold-out overlays */}
        {hasOrdered && !isSoldOut && (
          <View style={styles.orderedOverlay}>
            <Ionicons name="checkmark-circle" size={32} color="#D4AF37" />
            <Text style={styles.orderedOverlayText}>Pre-Ordered</Text>
          </View>
        )}
        {isSoldOut && (
          <View style={styles.soldOutOverlay}>
            <Text style={styles.soldOutStamp}>SOLD{'\n'}OUT</Text>
          </View>
        )}
      </View>

      {/* ── Content body ── */}
      <View style={[styles.body, { backgroundColor: 'rgba(14,14,14,0.97)' }]}>
        {/* Chef */}
        <View style={styles.chefRow}>
          <View style={[styles.chefDot, { backgroundColor: colors.gold }]} />
          <Text style={[styles.chefName, { color: colors.mutedForeground }]}>{drop.chef.name}</Text>
          {drop.chef.isVerified && (
            <Ionicons name="checkmark-circle" size={12} color={colors.gold} />
          )}
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>{drop.title}</Text>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <LinearGradient
            colors={isAlmostFull ? ['#C41E3A', '#E8294A'] : ['#9E8028', '#D4AF37', '#F5D060']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]}
          />
        </View>

        {/* Price + remaining */}
        <View style={styles.bottomRow}>
          <Text style={[styles.price, { color: isSoldOut ? 'rgba(255,255,255,0.3)' : colors.gold }]}>
            ${drop.price}
          </Text>
          {isSoldOut ? (
            <Text style={[styles.remainText, { color: '#C41E3A', fontFamily: 'Inter_700Bold' }]}>
              SOLD OUT
            </Text>
          ) : (
            <Text
              style={[
                styles.remainText,
                {
                  color: isAlmostFull ? '#E8294A' : colors.mutedForeground,
                  fontFamily: isAlmostFull ? 'Inter_700Bold' : 'Inter_400Regular',
                },
              ]}
            >
              {remaining} of {inventory} left
            </Text>
          )}
        </View>
      </View>

      {/* Card border */}
      <View style={styles.border} />

      {/* Gold top accent line */}
      <LinearGradient
        colors={['transparent', '#D4AF37', '#F5D060', '#D4AF37', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topAccent}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(14,14,14,0.97)',
  },
  imageWrap: {
    width: '100%',
    height: 200,
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  cuisineBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: 'rgba(10,10,10,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  cuisineText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 1.8,
  },
  timerPill: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  timerText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  orderedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,10,0.55)',
    gap: 6,
  },
  orderedOverlayText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#D4AF37',
    letterSpacing: 0.5,
  },
  soldOutOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,10,0.72)',
  },
  soldOutStamp: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#C41E3A',
    letterSpacing: 3,
    textAlign: 'center',
    lineHeight: 24,
    borderWidth: 2,
    borderColor: '#C41E3A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    overflow: 'hidden',
    transform: [{ rotate: '-8deg' }],
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 8,
  },
  chefRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chefDot: { width: 5, height: 5, borderRadius: 3 },
  chefName: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  title: {
    fontSize: 19,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: '#FFFFFF',
    lineHeight: 25,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  remainText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.18)',
    zIndex: 3,
    pointerEvents: 'none' as any,
  },
  topAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
});
