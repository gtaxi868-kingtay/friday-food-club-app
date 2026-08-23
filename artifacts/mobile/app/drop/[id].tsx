import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import GlassView from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useApp, type Drop } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { DUMMY_DROPS } from '@/lib/dummyDrops';
import { openInMaps } from '@/lib/maps';

const DROP_IMAGES: { [key: number]: ReturnType<typeof require> } = {
  1: require('@/assets/images/drop1.jpg'),
  2: require('@/assets/images/drop2.jpg'),
  3: require('@/assets/images/drop3.jpg'),
};

/** Resolve the hero image source — prefer the chef-uploaded photo, fall back to bundled stock. */
function heroSource(drop: Drop): any {
  if (drop.imageUrl) {
    return { uri: drop.imageUrl };
  }
  return DROP_IMAGES[drop.imageIndex] ?? DROP_IMAGES[1];
}

const MEAL_SLOT_COLORS: Record<string, string> = {
  Breakfast: '#F5A623',
  Lunch: '#7ED321',
  Dinner: '#D4AF37',
  Dessert: '#E85D9C',
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

function viewerCount(id: string): number {
  const seed = id.charCodeAt(id.length - 1);
  return 8 + (seed % 23);
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

export default function DropDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { getDropById, orderedDropIds, preOrder } = useApp();
  const { hasClubPass } = useAuth();
  const [paymentMethod, setPaymentMethod] = useState<'DIGITAL' | 'CASH'>('DIGITAL');
  const [isOrdering, setIsOrdering] = useState(false);

  const isDummy = id?.startsWith('dummy-');
  const drop = isDummy ? (DUMMY_DROPS[id ?? ''] ?? null) : getDropById(id);
  const secs = useCountdown(drop?.expiresAt ?? new Date().toISOString());

  // Convex's drops.list query above is already reactive and live — no
  // separate detail fetch needed, it updates in place as inventory changes.
  const effectiveDrop = drop;

  // Entry animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]).start();
  }, []);

  if (!drop) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.notFound, { paddingTop: insets.top + 60 }]}>
          <Ionicons name="restaurant-outline" size={52} color={colors.mutedForeground} />
          <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>Drop not found</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backBtnText, { color: colors.gold }]}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const hasOrdered = orderedDropIds.has(effectiveDrop!.id);
  const inventory = effectiveDrop!.inventory || effectiveDrop!.minOrders;
  const remaining = effectiveDrop!.remaining ?? Math.max(0, inventory - effectiveDrop!.currentOrders);
  const isSoldOut = effectiveDrop!.soldOut || effectiveDrop!.status === 'SOLD_OUT' || remaining <= 0;
  const progress = Math.min(1, effectiveDrop!.currentOrders / inventory);
  const isAlmostFull = !isSoldOut && remaining <= Math.max(2, Math.floor(inventory * 0.15));
  const isCritical = secs < 3600 && secs > 0;
  const isUnlocked = effectiveDrop!.currentOrders >= effectiveDrop!.minOrders;
  const viewers = viewerCount(effectiveDrop!.id);
  const HERO_H = Math.round(width * 1.05);
  const slotColor = MEAL_SLOT_COLORS[effectiveDrop!.mealSlot] ?? colors.gold;

  const handlePreOrder = async () => {
    if (hasOrdered || isSoldOut || isOrdering) return;

    // Secret drop — enforce Friday-only rule client-side (server enforces too)
    if (effectiveDrop!.isSecret) {
      const dayInTrinidad = new Date().toLocaleDateString('en-US', {
        timeZone: 'America/Port_of_Spain',
        weekday: 'long',
      });
      if (dayInTrinidad !== 'Friday') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          '🔒 Friday Only',
          'Secret drops are exclusively available on Fridays. Come back then — this one will be waiting for you.',
          [{ text: 'Got It', style: 'default' }],
        );
        return;
      }
    }

    setIsOrdering(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await preOrder(effectiveDrop!, paymentMethod);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        paymentMethod === 'CASH' ? 'Reservation Confirmed' : 'Pre-order Confirmed',
        paymentMethod === 'CASH'
          ? 'Your plate is reserved. Pay cash when you collect it.'
          : 'Your order is secured in escrow. Bring your QR code to pickup.',
        [{ text: 'Done' }],
      );
    } catch (error: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = error instanceof Error ? error.message : 'We could not place your order. Please try again.';
      const cleanMessage = message.includes('NOT_FRIDAY')
        ? 'Secret drops are exclusively available on Fridays. Come back then — this one will be waiting for you.'
        : message.replace(/^API .*? → \d+: /, '') || 'We could not place your order. Please try again.';
      Alert.alert('Order Not Placed', cleanMessage, [{ text: 'Try Again', style: 'default' }]);
    } finally {
      setIsOrdering(false);
    }
  };

  const handleShare = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = buildWhatsAppText(effectiveDrop!, secs);
    const waUrl = `whatsapp://send?text=${encodeURIComponent(text)}`;
    const canOpen = await Linking.canOpenURL(waUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(waUrl);
    } else {
      await Share.share({ message: text });
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
      >
        {/* ── Cinematic hero image ── */}
        <View style={[styles.heroContainer, { height: HERO_H }]}>
          <Image
            source={heroSource(effectiveDrop!)}
            style={styles.heroImage}
            resizeMode="cover"
          />

          {/* Vignette */}
          <LinearGradient
            colors={['rgba(10,10,10,0.25)', 'transparent', 'rgba(10,10,10,0.95)']}
            locations={[0, 0.35, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Meal slot badge — top left */}
          <LinearGradient
            colors={[slotColor + 'CC', slotColor]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.mealSlotBadge, { top: insets.top + 56 }]}
          >
            <Text style={styles.mealSlotText}>{effectiveDrop!.mealSlot.toUpperCase()}</Text>
          </LinearGradient>

          {/* SECRET MENU badge — only for secret drops */}
          {effectiveDrop!.isSecret && (
            <LinearGradient
              colors={['#9E8028', '#D4AF37', '#F5D060']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.secretBadge, { top: insets.top + 56 + 38 }]}
            >
              <MaterialCommunityIcons name="lock-outline" size={10} color="#0A0A0A" />
              <Text style={styles.secretBadgeText}>SECRET MENU</Text>
            </LinearGradient>
          )}

          {/* Tags — bottom of hero */}
          <View style={styles.tagsRow}>
            {effectiveDrop!.tags.slice(0, 3).map(tag => (
              <GlassView key={tag} intensity={50} style={styles.tagPill}>
                <Text style={styles.tagText}>{tag}</Text>
              </GlassView>
            ))}
          </View>
        </View>

        {/* ── Content card ── */}
        <Animated.View
          style={[
            styles.contentCard,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Chef + viewers */}
          <View style={styles.chefRow}>
            <View style={styles.chefLeft}>
              <LinearGradient
                colors={['#D4AF37', '#9E8028']}
                style={styles.chefDot}
              />
              <Text style={[styles.chefName, { color: 'rgba(255,255,255,0.75)' }]}>
                {effectiveDrop!.chef.name}
              </Text>
              {effectiveDrop!.chef.isVerified && (
                <Ionicons name="checkmark-circle" size={15} color={colors.gold} />
              )}
              <GlassView intensity={30} style={styles.cuisinePill}>
                <Text style={[styles.cuisineText, { color: colors.mutedForeground }]}>
                  {effectiveDrop!.cuisine}
                </Text>
              </GlassView>
            </View>
            <GlassView style={styles.viewerPill}>
              <View style={styles.viewerDot} />
              <Text style={styles.viewerText}>{viewers} watching</Text>
            </GlassView>
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.foreground }]}>{effectiveDrop!.title}</Text>

          {/* Friday-only notice for secret drops */}
          {effectiveDrop!.isSecret && (
            <GlassView intensity={30} style={styles.fridayBadge}>
              <MaterialCommunityIcons name="lock-clock" size={14} color="#D4AF37" />
              <View style={{ flex: 1 }}>
                <Text style={styles.fridayBadgeTitle}>FRIDAY ONLY · SECRET DROP</Text>
                <Text style={[styles.fridayBadgeSub, { color: 'rgba(255,255,255,0.5)' }]}>
                  Orders only open on Fridays — server enforced
                </Text>
              </View>
            </GlassView>
          )}

          {/* Club Pass discount badge — show exact savings when available */}
          {hasClubPass && effectiveDrop!.originalPrice != null && effectiveDrop!.originalPrice > effectiveDrop!.price && (
            <View style={styles.clubPassBadge}>
              <MaterialCommunityIcons name="crown-outline" size={13} color="#D4AF37" />
              <Text style={styles.clubPassBadgeText}>
                Club Pass · you saved TTD {(effectiveDrop!.originalPrice - effectiveDrop!.price).toFixed(2)}
              </Text>
            </View>
          )}

          {/* Price + Countdown */}
          <View style={styles.metaRow}>
            <Text style={[styles.price, { color: colors.gold }]}>${effectiveDrop!.price}</Text>
            <GlassView
              style={[
                styles.countdownPill,
                { borderColor: isCritical ? 'rgba(196,30,58,0.6)' : 'rgba(212,175,55,0.35)' },
              ]}
            >
              <Ionicons
                name="time-outline"
                size={14}
                color={isCritical ? '#C41E3A' : colors.gold}
              />
              <Text style={[styles.countdownText, { color: isCritical ? '#C41E3A' : colors.gold }]}>
                {fmt(secs)}
              </Text>
            </GlassView>
          </View>

          {/* Progress section */}
          <GlassView intensity={35} style={styles.progressCard}>
            <LinearGradient
              colors={[colors.goldDark, colors.gold, colors.goldLight, colors.gold, colors.goldDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.progressCardBorder}
            />
            <View style={styles.progressRow}>
              <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
                Plates claimed
              </Text>
              {isSoldOut ? (
                <View style={styles.unlockedBadge}>
                  <MaterialCommunityIcons name="fire-off" size={13} color="#C41E3A" />
                  <Text style={[styles.unlockedText, { color: '#C41E3A' }]}>SOLD OUT</Text>
                </View>
              ) : isUnlocked ? (
                <View style={styles.unlockedBadge}>
                  <Ionicons name="checkmark-circle" size={13} color="#25D366" />
                  <Text style={styles.unlockedText}>UNLOCKED</Text>
                </View>
              ) : (
                <Text style={[styles.progressCount, { color: isAlmostFull ? '#C41E3A' : colors.gold }]}>
                  {effectiveDrop!.currentOrders}/{inventory} plates
                </Text>
              )}
            </View>
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={
                  isSoldOut
                    ? ['#C41E3A', '#8E1528']
                    : isUnlocked
                    ? ['#25D366', '#1DA851']
                    : isAlmostFull
                    ? ['#C41E3A', '#E8294A']
                    : ['#9E8028', '#D4AF37', '#F5D060']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]}
              />
            </View>
            <Text style={[styles.progressSub, { color: isSoldOut ? '#C41E3A' : colors.mutedForeground }]}>
              {isSoldOut
                ? `All ${inventory} plates claimed — when it's gone, it's gone`
                : isUnlocked
                ? `Batch confirmed — only ${remaining} plate${remaining === 1 ? '' : 's'} left`
                : `${remaining} of ${inventory} plates remaining — hard limit, no restocks`}
            </Text>
          </GlassView>

          {/* Divider */}
          <LinearGradient
            colors={['transparent', 'rgba(212,175,55,0.2)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.divider}
          />

          {/* Description */}
          <View style={styles.descSection}>
            <Text style={[styles.descLabel, { color: colors.gold }]}>THE DROP</Text>
            <Text style={[styles.description, { color: 'rgba(255,255,255,0.8)' }]}>
              {effectiveDrop!.description}
            </Text>
          </View>

          {/* ── Pickup location ── */}
          {effectiveDrop!.pickupLocation && (
            <GlassView intensity={35} style={styles.locationCard}>
              <LinearGradient
                colors={['#9E8028', '#D4AF37', '#F5D060', '#D4AF37', '#9E8028']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.locationCardBorder}
              />
              <View style={styles.locationHeader}>
                <Ionicons name="location" size={14} color="#D4AF37" />
                <Text style={styles.locationLabel}>
                  {isDummy ? 'PREVIEW LOCATION' : 'PICKUP POINT'}
                </Text>
                {isDummy && (
                  <View style={styles.pinnedBadge}>
                    <Ionicons name="pin" size={10} color="#D4AF37" />
                    <Text style={styles.pinnedBadgeText}>PINNED SPOT</Text>
                  </View>
                )}
              </View>
              <Text style={styles.locationName}>{effectiveDrop!.pickupLocation}</Text>
              <Text style={styles.locationNote}>
                {isDummy
                  ? 'This is a permanent pinned venue — available even without a live drop.'
                  : 'Bring your QR code at pickup time to release your order.'}
              </Text>
              {!!effectiveDrop!.pickupLat && !!effectiveDrop!.pickupLng && (
                <Pressable
                  onPress={async () => {
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    openInMaps(effectiveDrop!.pickupLat!, effectiveDrop!.pickupLng!, effectiveDrop!.pickupLocation);
                  }}
                  style={({ pressed }) => [styles.mapsBtn, { opacity: pressed ? 0.75 : 1 }]}
                >
                  <Ionicons name="navigate" size={14} color="#0A0A0A" />
                  <Text style={styles.mapsBtnText}>Open in Maps</Text>
                </Pressable>
              )}
            </GlassView>
          )}

          {/* Chef stats */}
          <GlassView intensity={35} style={styles.chefCard}>
            <View style={styles.chefCardHeader}>
              <LinearGradient
                colors={['#D4AF37', '#9E8028']}
                style={styles.chefAvatar}
              >
                <Text style={styles.chefAvatarText}>
                  {effectiveDrop!.chef.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </Text>
              </LinearGradient>
              <View style={styles.chefCardInfo}>
                <Text style={[styles.chefCardName, { color: colors.foreground }]}>
                  {effectiveDrop!.chef.name}
                </Text>
                <Text style={[styles.chefHandle, { color: colors.mutedForeground }]}>
                  {effectiveDrop!.chef.handle}
                </Text>
              </View>
              {effectiveDrop!.chef.isVerified && (
                <GlassView intensity={30} style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={13} color={colors.gold} />
                  <Text style={[styles.verifiedText, { color: colors.gold }]}>Verified</Text>
                </GlassView>
              )}
            </View>
            <View style={styles.chefStats}>
              {[
                { label: 'Rating', value: effectiveDrop!.chef.rating.toFixed(1) },
                { label: 'Drops', value: effectiveDrop!.chef.totalDrops },
                { label: 'Success', value: `${Math.round((effectiveDrop!.chef.successfulDrops / effectiveDrop!.chef.totalDrops) * 100)}%` },
                { label: 'Region', value: effectiveDrop!.chef.region },
              ].map((stat, i) => (
                <React.Fragment key={stat.label}>
                  {i > 0 && <View style={[styles.chefStatDivider, { backgroundColor: 'rgba(255,255,255,0.06)' }]} />}
                  <View style={styles.chefStatItem}>
                    <Text style={[styles.chefStatValue, { color: colors.foreground }]}>
                      {stat.value}
                    </Text>
                    <Text style={[styles.chefStatLabel, { color: colors.mutedForeground }]}>
                      {stat.label}
                    </Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </GlassView>
        </Animated.View>
      </ScrollView>

      {/* ── Back button (floating) ── */}
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.floatingBack,
          { top: insets.top + 12, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <GlassView intensity={60} style={styles.floatingBackInner}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </GlassView>
      </Pressable>

      {/* ── Fixed bottom CTA ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <LinearGradient
          colors={['rgba(8,8,8,0)', 'rgba(8,8,8,0.98)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.bottomRow}>
          {/* WhatsApp share */}
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <GlassView style={styles.shareBtn}>
              <MaterialCommunityIcons name="whatsapp" size={22} color="#25D366" />
            </GlassView>
          </Pressable>

          {/* Preview-only notice for dummy drops */}
          {isDummy ? (
            <GlassView style={styles.previewBar}>
              <Ionicons name="eye-outline" size={16} color="#D4AF37" />
              <Text style={styles.previewBarText}>Preview — drops go live here</Text>
            </GlassView>
          ) : isSoldOut && !hasOrdered ? (
            <View style={styles.soldOutBar}>
              <MaterialCommunityIcons name="fire-off" size={20} color="#C41E3A" />
              <Text style={styles.soldOutBarText}>SOLD OUT — GONE FOR GOOD</Text>
            </View>
          ) : hasOrdered ? (
            <GlassView style={styles.orderedBadge}>
              <Ionicons name="checkmark-circle" size={20} color={colors.gold} />
              <Text style={[styles.orderedText, { color: colors.gold }]}>
                You're in this batch
              </Text>
            </GlassView>
          ) : (
            <View style={styles.ctaWrap}>
              {/* Payment method toggle */}
              <View style={[styles.payToggle, { borderColor: 'rgba(212,175,55,0.2)' }]}>
                <Pressable
                  onPress={() => setPaymentMethod('DIGITAL')}
                  style={[
                    styles.payToggleBtn,
                    paymentMethod === 'DIGITAL' && { backgroundColor: 'rgba(212,175,55,0.15)' },
                  ]}
                >
                  <Ionicons name="shield-checkmark-outline" size={14}
                    color={paymentMethod === 'DIGITAL' ? colors.gold : colors.mutedForeground} />
                  <Text style={[styles.payToggleText,
                    { color: paymentMethod === 'DIGITAL' ? colors.gold : colors.mutedForeground }]}>
                    Escrow
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPaymentMethod('CASH')}
                  style={[
                    styles.payToggleBtn,
                    paymentMethod === 'CASH' && { backgroundColor: 'rgba(245,166,35,0.15)' },
                  ]}
                >
                  <Ionicons name="cash-outline" size={14}
                    color={paymentMethod === 'CASH' ? '#F5A623' : colors.mutedForeground} />
                  <Text style={[styles.payToggleText,
                    { color: paymentMethod === 'CASH' ? '#F5A623' : colors.mutedForeground }]}>
                    Cash
                  </Text>
                </Pressable>
              </View>
              <Pressable
                onPress={handlePreOrder}
                disabled={isOrdering}
                style={({ pressed }) => [{ opacity: pressed || isOrdering ? 0.65 : 1, flex: 1 }]}
              >
                <LinearGradient
                  colors={paymentMethod === 'CASH'
                    ? ['#F5A623', '#D4881E', '#B87018', '#9A6010']
                    : ['#F5D060', '#D4AF37', '#B8961E', '#9E8028']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cta}
                >
                  <Text style={styles.ctaText}>
                    {isOrdering
                      ? 'Placing Order…'
                      : paymentMethod === 'CASH'
                      ? 'Reserve · Pay Cash · '
                      : 'Pre-Order Now · '}
                    {!isOrdering && `$${effectiveDrop!.price}`}
                  </Text>
                  {!isOrdering && <Ionicons name="arrow-forward" size={17} color="#0A0A0A" />}
                </LinearGradient>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  heroContainer: { position: 'relative', overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  mealSlotBadge: {
    position: 'absolute',
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  mealSlotText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: '#0A0A0A',
    letterSpacing: 1.5,
  },
  secretBadge: {
    position: 'absolute',
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
  fridayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    overflow: 'hidden',
  },
  fridayBadgeTitle: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: '#D4AF37',
    letterSpacing: 1.5,
  },
  fridayBadgeSub: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  tagsRow: {
    position: 'absolute',
    bottom: 16,
    left: 18,
    right: 18,
    flexDirection: 'row',
    gap: 8,
  },
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
  contentCard: {
    paddingHorizontal: 20,
    paddingTop: 22,
    gap: 18,
  },
  clubPassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  clubPassBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#D4AF37',
    letterSpacing: 0.3,
  },
  chefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chefLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, flexWrap: 'wrap' },
  chefDot: { width: 7, height: 7, borderRadius: 3.5 },
  chefName: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  cuisinePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cuisineText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  viewerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  viewerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C41E3A',
  },
  viewerText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: 'rgba(255,255,255,0.6)' },
  title: {
    fontSize: 32,
    fontFamily: 'PlayfairDisplay_700Bold',
    lineHeight: 38,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  countdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
  },
  countdownText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  progressCard: {
    borderRadius: 18,
    overflow: 'hidden',
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.15)',
  },
  progressCardBorder: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  progressCount: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  unlockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  unlockedText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#25D366', letterSpacing: 0.5 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  progressSub: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  divider: { height: 1 },
  descSection: { gap: 10 },
  descLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2.5,
  },
  description: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    lineHeight: 26,
  },
  chefCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.12)',
  },
  chefCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    paddingBottom: 12,
  },
  chefAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chefAvatarText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },
  chefCardInfo: { flex: 1, gap: 2 },
  chefCardName: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  chefHandle: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.2)',
    flexShrink: 0,
  },
  verifiedText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  chefStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 12,
  },
  chefStatItem: { flex: 1, alignItems: 'center', gap: 3 },
  chefStatValue: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  chefStatLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 0.3 },
  chefStatDivider: { width: 1, marginVertical: 4 },
  // Floating back button
  floatingBack: {
    position: 'absolute',
    left: 16,
    zIndex: 100,
  },
  floatingBackInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  shareBtn: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(37,211,102,0.25)',
    flexShrink: 0,
  },
  ctaWrap: { flex: 1, gap: 8 },
  payToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  payToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 10,
  },
  payToggleText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: 18,
  },
  ctaText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#0A0A0A',
    letterSpacing: 0.2,
  },
  orderedBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  orderedText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  soldOutBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(196,30,58,0.6)',
    backgroundColor: 'rgba(196,30,58,0.12)',
  },
  soldOutBarText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#C41E3A', letterSpacing: 1 },
  // Location card
  locationCard: {
    borderRadius: 18,
    overflow: 'hidden',
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.15)',
  },
  locationCardBorder: { position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 },
  locationHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  locationLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 2, color: '#D4AF37', flex: 1 },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pinnedBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#D4AF37', letterSpacing: 1 },
  locationName: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  locationNote: { fontSize: 12, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.45)', lineHeight: 17 },
  mapsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 10, paddingVertical: 10, borderRadius: 12, backgroundColor: '#D4AF37',
  },
  mapsBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },
  // Preview bar (dummy drops)
  previewBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
  },
  previewBarText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#D4AF37' },
  // Not found
  notFound: { flex: 1, alignItems: 'center', gap: 14, paddingHorizontal: 40 },
  notFoundTitle: { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  backBtn: { paddingVertical: 10, paddingHorizontal: 24 },
  backBtnText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
});
