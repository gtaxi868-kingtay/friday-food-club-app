import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import GlassView from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import type { Drop } from '@/contexts/AppContext';

const DROP_IMAGES: { [key: number]: ReturnType<typeof require> } = {
  1: require('@/assets/images/drop1.jpg'),
  2: require('@/assets/images/drop2.jpg'),
  3: require('@/assets/images/drop3.jpg'),
};

function viewerCount(id: string): number {
  const seed = id.charCodeAt(id.length - 1);
  return 8 + (seed % 23);
}

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

// Public landing page — what a recipient lands on before the app is
// installed. Update this URL if the artifact is ever republished/moved.
const LANDING_URL = 'https://claude.ai/code/artifact/0943a17b-6669-40f1-a700-3c972b9aeaf7';

function buildWhatsAppText(drop: Drop, secs: number): string {
  const urgency = secs < 3600 ? `Only ${fmt(secs)} LEFT` : `Closing in ${fmt(secs)}`;
  const spotsLeft = drop.remaining ?? Math.max(0, (drop.inventory || drop.minOrders) - drop.currentOrders);
  return (
    `🔒 *SECRET DROP — Friday Food Club*\n\n` +
    `*${drop.title}* by ${drop.chef.name}\n` +
    `💰 $${drop.price} per plate\n` +
    `⏰ ${urgency}\n` +
    `🔥 Only ${spotsLeft > 0 ? spotsLeft : 'a few'} plates left — hard limit, no restocks\n\n` +
    `Don't sleep — this is members only. Pre-order now before it's gone.\n\n` +
    `*Good Food. Good People. Exclusive Access.* 🥇\n` +
    `${LANDING_URL}`
  );
}

interface Props {
  drop: Drop;
  hasOrdered: boolean;
  onPress: (drop: Drop) => void;
}

export default function HeroDropCard({ drop, hasOrdered, onPress }: Props) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const HERO_H = Math.round(width * 1.08);

  const secs = useCountdown(drop.expiresAt);
  const inventory = drop.inventory || drop.minOrders;
  const progress = Math.min(1, drop.currentOrders / inventory);
  const isCritical = secs < 3600 && secs > 0;
  const isSoldOut = drop.soldOut || drop.status === 'SOLD_OUT';
  const remaining = drop.remaining ?? Math.max(0, inventory - drop.currentOrders);
  const isAlmostFull = !isSoldOut && remaining <= Math.max(2, Math.floor(inventory * 0.15));
  const viewers = viewerCount(drop.id);

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.5, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
    return () => pulse.stopAnimation();
  }, []);

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(drop);
  };

  const handleShare = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = buildWhatsAppText(drop, secs);
    const waUrl = `whatsapp://send?text=${encodeURIComponent(text)}`;
    const canOpen = await Linking.canOpenURL(waUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(waUrl);
    } else {
      await Share.share({ message: text });
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, { height: HERO_H, opacity: pressed ? 0.97 : 1 }]}
    >
      {/* Full-bleed food image */}
      <Image
        source={
          (drop.imageUrl
            ? { uri: drop.imageUrl! }
            : (DROP_IMAGES[drop.imageIndex] ?? DROP_IMAGES[1])) as any
        }
        style={styles.image}
        resizeMode="cover"
      />

      {/* Deep vignette */}
      <LinearGradient
        colors={['rgba(10,10,10,0.15)', 'transparent', 'rgba(10,10,10,0.97)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* SECRET MENU badge */}
      <LinearGradient
        colors={['#9E8028', '#D4AF37', '#F5D060']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.secretBadge}
      >
        <MaterialCommunityIcons name="lock-outline" size={10} color="#0A0A0A" />
        <Text style={styles.secretBadgeText}>SECRET MENU</Text>
      </LinearGradient>

      {/* Cuisine + tags */}
      <View style={styles.topRow}>
        <GlassView intensity={50} style={styles.cuisinePill}>
          <Text style={styles.cuisineText}>{drop.cuisine.toUpperCase()}</Text>
        </GlassView>
        <View style={styles.tagsRight}>
          {drop.tags.slice(0, 2).map(tag => (
            <GlassView key={tag} intensity={50} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </GlassView>
          ))}
        </View>
      </View>

      {/* Bottom panel */}
      <GlassView intensity={55} style={styles.panel}>
        <LinearGradient
          colors={['#9E8028', '#D4AF37', '#F5D060', '#D4AF37', '#9E8028']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.panelBorder}
        />

        {/* Chef + viewers */}
        <View style={styles.chefViewersRow}>
          <View style={styles.chefRow}>
            <View style={[styles.chefDot, { backgroundColor: colors.gold }]} />
            <Text style={styles.chefName}>{drop.chef.name}</Text>
            {drop.chef.isVerified && (
              <Ionicons name="checkmark-circle" size={14} color={colors.gold} />
            )}
          </View>
          <GlassView style={styles.viewerPill}>
            <Animated.View style={[styles.viewerDot, { transform: [{ scale: pulse }] }]} />
            <Text style={styles.viewerText}>{viewers} watching</Text>
          </GlassView>
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>{drop.title}</Text>

        {/* Description preview */}
        <Text style={styles.description} numberOfLines={2}>{drop.description}</Text>

        {/* Price + Countdown */}
        <View style={styles.metaRow}>
          <Text style={[styles.price, { color: colors.gold }]}>${drop.price}</Text>
          <GlassView
            style={[
              styles.countdownPill,
              { borderColor: isCritical ? 'rgba(196,30,58,0.6)' : 'rgba(212,175,55,0.35)' },
            ]}
          >
            <Ionicons
              name="time-outline"
              size={13}
              color={isCritical ? '#C41E3A' : colors.gold}
            />
            <Text style={[styles.countdownText, { color: isCritical ? '#C41E3A' : colors.gold }]}>
              {fmt(secs)}
            </Text>
          </GlassView>
        </View>

        {/* Progress */}
        <View style={styles.progressSection}>
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={isAlmostFull ? ['#C41E3A', '#E8294A'] : ['#9E8028', '#D4AF37', '#F5D060']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]}
            />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.progressText}>
              {isSoldOut
                ? `All ${inventory} plates claimed`
                : `${remaining} of ${inventory} plates left`}
            </Text>
            {isSoldOut ? (
              <Text style={[styles.progressText, { color: '#C41E3A', fontFamily: 'Inter_700Bold' }]}>
                SOLD OUT
              </Text>
            ) : isAlmostFull ? (
              <Text style={[styles.progressText, { color: '#C41E3A', fontFamily: 'Inter_700Bold' }]}>
                Almost gone
              </Text>
            ) : null}
          </View>
        </View>

        {/* Action row */}
        <View style={styles.actionRow}>
          <Pressable onPress={handleShare} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
            <GlassView style={styles.shareBtn} darkness={0.5}>
              <MaterialCommunityIcons name="whatsapp" size={20} color="#25D366" />
            </GlassView>
          </Pressable>

          {isSoldOut && !hasOrdered ? (
            <View style={styles.soldOutBadge}>
              <MaterialCommunityIcons name="fire-off" size={18} color="#C41E3A" />
              <Text style={styles.soldOutText}>SOLD OUT — GONE FOR GOOD</Text>
            </View>
          ) : hasOrdered ? (
            <GlassView style={styles.orderedBadge}>
              <Ionicons name="checkmark-circle" size={18} color={colors.gold} />
              <Text style={[styles.orderedText, { color: colors.gold }]}>Pre-Ordered</Text>
            </GlassView>
          ) : (
            <Pressable onPress={handlePress} style={styles.ctaWrap}>
              <LinearGradient
                colors={['#F5D060', '#D4AF37', '#B8961E', '#9E8028']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cta}
              >
                <Text style={styles.ctaText}>View Drop · ${drop.price}</Text>
                <Ionicons name="arrow-forward" size={16} color="#0A0A0A" />
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </GlassView>

      {/* Card border */}
      <View style={styles.cardBorder} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius: 28,
    overflow: 'hidden',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  secretBadge: {
    position: 'absolute',
    top: 54,
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  secretBadgeText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: '#0A0A0A',
    letterSpacing: 1.5,
  },
  topRow: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cuisinePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cuisineText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1.5,
  },
  tagsRight: { flexDirection: 'row', gap: 6 },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
  },
  tagText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: '#D4AF37',
    letterSpacing: 0.5,
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 18,
    paddingBottom: 20,
    gap: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  panelBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
  },
  chefViewersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chefRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chefDot: { width: 6, height: 6, borderRadius: 3 },
  chefName: { fontSize: 13, fontFamily: 'Inter_500Medium', color: 'rgba(255,255,255,0.7)' },
  viewerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  viewerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C41E3A',
  },
  viewerText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.6)',
  },
  title: {
    fontSize: 26,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: '#FFFFFF',
    lineHeight: 31,
  },
  description: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  countdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  countdownText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  progressSection: { gap: 6 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.5)' },
  actionRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  shareBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(37,211,102,0.25)',
    flexShrink: 0,
  },
  orderedBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  orderedText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  soldOutBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(196,30,58,0.6)',
    backgroundColor: 'rgba(196,30,58,0.12)',
  },
  soldOutText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#C41E3A', letterSpacing: 1 },
  ctaWrap: { flex: 1 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  ctaText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#0A0A0A',
    letterSpacing: 0.2,
  },
  cardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.22)',
    pointerEvents: 'none' as any,
  },
});
