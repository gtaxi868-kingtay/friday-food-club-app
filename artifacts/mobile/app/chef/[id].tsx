/**
 * Chef Profile Screen — /chef/[id]
 *
 * Chef identity is read straight from AppContext (already in memory —
 * no spinner, works offline with fallback data too).
 * Drop history is fetched from the API separately; only the carousel
 * shows a loader so the header is always instant.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import GlassView from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useApp, type Chef } from '@/contexts/AppContext';
import { API_BASE } from '@/contexts/AppContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DropSummary {
  id: string;
  title: string;
  description: string;
  mealSlot: string;
  price: number;
  inventory: number;
  minOrders: number;
  currentOrders: number;
  status: string;
  imageIndex: number;
  tags: string[];
  pickupLocation: string;
  expiresAt: string;
  createdAt: string;
}

// ── Static assets ─────────────────────────────────────────────────────────────

const DROP_IMAGES: Record<number, ReturnType<typeof require>> = {
  1: require('@/assets/images/drop1.jpg'),
  2: require('@/assets/images/drop2.jpg'),
  3: require('@/assets/images/drop3.jpg'),
};

const MEAL_COLORS: Record<string, string> = {
  Breakfast: '#F5A623',
  Lunch:     '#7ED321',
  Dinner:    '#D4AF37',
};

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  UNLOCKED:  { label: 'LIVE',      color: '#25D366', icon: 'flash' },
  PENDING:   { label: 'PENDING',   color: '#F5A623', icon: 'time-outline' },
  COMPLETED: { label: 'DELIVERED', color: '#4CAF50', icon: 'checkmark-circle' },
  SOLD_OUT:  { label: 'SOLD OUT',  color: '#C41E3A', icon: 'flame' },
  EXPIRED:   { label: 'EXPIRED',   color: '#6B6B6B', icon: 'close-circle-outline' },
  CANCELLED: { label: 'CANCELLED', color: '#6B6B6B', icon: 'ban-outline' },
};

// ── Drop carousel card ────────────────────────────────────────────────────────

function DropHistoryCard({ drop, onPress }: { drop: DropSummary; onPress: () => void }) {
  const colors = useColors();
  const meta     = STATUS_META[drop.status] ?? STATUS_META['EXPIRED']!;
  const slotColor = MEAL_COLORS[drop.mealSlot] ?? colors.gold;
  const date = drop.createdAt
    ? new Date(drop.createdAt).toLocaleDateString('en-TT', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : '';

  return (
    <Pressable
      onPress={async () => { await Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [styles.dropCard, { opacity: pressed ? 0.88 : 1 }]}
    >
      <View style={styles.dropCardImage}>
        <Image
          source={(DROP_IMAGES[drop.imageIndex] ?? DROP_IMAGES[1]) as any}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(10,10,10,0.1)', 'rgba(10,10,10,0.85)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.dropMealBadge, { backgroundColor: slotColor }]}>
          <Text style={styles.dropMealText}>{drop.mealSlot.toUpperCase()}</Text>
        </View>
        <View style={[styles.dropStatusBadge, { borderColor: meta.color + '55', backgroundColor: meta.color + '22' }]}>
          <Ionicons name={meta.icon as any} size={10} color={meta.color} />
          <Text style={[styles.dropStatusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <View style={styles.dropTitleWrap}>
          <Text style={styles.dropTitle} numberOfLines={2}>{drop.title}</Text>
        </View>
      </View>

      <View style={[styles.dropCardBody, { backgroundColor: colors.card, borderColor: 'rgba(212,175,55,0.12)' }]}>
        <Text style={[styles.dropDesc, { color: colors.mutedForeground }]} numberOfLines={3}>
          {drop.description}
        </Text>
        {drop.tags.length > 0 && (
          <View style={styles.dropTags}>
            {drop.tags.slice(0, 3).map(tag => (
              <View key={tag} style={[styles.dropTag, { borderColor: 'rgba(212,175,55,0.2)' }]}>
                <Text style={[styles.dropTagText, { color: colors.gold }]}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={styles.dropMeta}>
          <Text style={[styles.dropPrice, { color: colors.gold }]}>TTD {drop.price.toFixed(2)}</Text>
          {date ? <Text style={[styles.dropDate, { color: colors.mutedForeground }]}>{date}</Text> : null}
        </View>
        <View style={styles.dropFooter}>
          <Ionicons name="people-outline" size={13} color={colors.mutedForeground} />
          <Text style={[styles.dropFooterText, { color: colors.mutedForeground }]}>
            {drop.currentOrders} / {drop.inventory} plates claimed
          </Text>
          <View style={styles.dropTapHint}>
            <Text style={[styles.dropTapHintText, { color: colors.gold }]}>View drop</Text>
            <Ionicons name="arrow-forward" size={11} color={colors.gold} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ── Drop history section (has its own loader so the header is always instant) ─

function DropsSection({ chefId, isRealId }: { chefId: string; isRealId: boolean }) {
  const colors  = useColors();
  const router  = useRouter();
  const [drops, setDrops]         = useState<DropSummary[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isRealId) {
      // Fallback / demo chef — no real DB record
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/chefs/${chefId}/drops?limit=30`);
      if (!res.ok) {
        setError(res.status === 404 ? null : 'Could not load drops');
      } else {
        const data = await res.json();
        setDrops(data.drops ?? []);
      }
    } catch {
      setError('No connection to server');
    } finally {
      setLoading(false);
    }
  }, [chefId, isRealId]);

  useEffect(() => { load(); }, [load]);

  const liveDrops = drops.filter(d => d.status === 'UNLOCKED' || d.status === 'PENDING');
  const pastDrops = drops.filter(d => d.status !== 'UNLOCKED' && d.status !== 'PENDING');

  if (!isRealId) {
    return (
      <View style={styles.emptyHistory}>
        <GlassView intensity={25} style={styles.emptyCard}>
          <MaterialCommunityIcons name="database-off-outline" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Demo chef</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            Drop history is only available for chefs loaded from the live platform. Resume your Neo4j database to see real data.
          </Text>
        </GlassView>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.dropsLoader}>
        <ActivityIndicator color={colors.gold} />
        <Text style={[styles.dropsLoaderText, { color: colors.mutedForeground }]}>Loading drops…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.emptyHistory}>
        <GlassView intensity={25} style={styles.emptyCard}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Drops unavailable</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>{error}</Text>
          <Pressable onPress={load} style={styles.retryBtn}>
            <Text style={[styles.retryText, { color: colors.gold }]}>Try again</Text>
          </Pressable>
        </GlassView>
      </View>
    );
  }

  return (
    <>
      {liveDrops.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: '#25D366' }]} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Live Now</Text>
            <View style={[styles.livePulse, { backgroundColor: '#25D36622' }]}>
              <Text style={[styles.livePulseText, { color: '#25D366' }]}>{liveDrops.length} active</Text>
            </View>
          </View>
          <FlatList
            data={liveDrops}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={d => d.id}
            contentContainerStyle={styles.carousel}
            renderItem={({ item }) => (
              <DropHistoryCard drop={item} onPress={() => router.push(`/drop/${item.id}` as any)} />
            )}
          />
        </>
      )}

      <View style={styles.sectionHeader}>
        <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Drop History</Text>
        {pastDrops.length > 0 && (
          <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
            {pastDrops.length} past drop{pastDrops.length !== 1 ? 's' : ''}
          </Text>
        )}
      </View>

      {pastDrops.length === 0 ? (
        <View style={styles.emptyHistory}>
          <GlassView intensity={25} style={styles.emptyCard}>
            <MaterialCommunityIcons name="chef-hat" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No past drops yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Check back after their first drop completes.
            </Text>
          </GlassView>
        </View>
      ) : (
        <FlatList
          data={pastDrops}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={d => d.id}
          contentContainerStyle={styles.carousel}
          renderItem={({ item }) => (
            <DropHistoryCard drop={item} onPress={() => router.push(`/drop/${item.id}` as any)} />
          )}
        />
      )}
    </>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

// Fallback IDs used when the DB is unreachable — these won't resolve
const DEMO_IDS = new Set(['chef1', 'chef2', 'chef3', 'chef4', 'chef5']);

export default function ChefProfileScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { chefs } = useApp();

  // Find chef immediately from context — no API call, no spinner
  const chef: Chef | undefined = chefs.find(c => c.id === id);

  // Entry animation runs once chef is known
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    if (chef) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 90, friction: 14, useNativeDriver: true }),
      ]).start();
    }
  }, [!!chef]);

  // Chef not found in context at all
  if (!chef) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 12 }]}>
          <GlassView intensity={60} style={styles.backBtnInner}>
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </GlassView>
        </Pressable>
        <View style={styles.centered}>
          <Ionicons name="person-outline" size={44} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>Chef not found</Text>
        </View>
      </View>
    );
  }

  const initials    = chef.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const successRate = chef.totalDrops > 0
    ? Math.round((chef.successfulDrops / chef.totalDrops) * 100)
    : 0;
  const isRealId = !DEMO_IDS.has(id ?? '');

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Back button */}
      <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 12 }]}>
        <GlassView intensity={60} style={styles.backBtnInner}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </GlassView>
      </Pressable>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 72, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor={colors.gold} />}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Chef Identity Card ──────────────────────────────────────── */}
          <View style={styles.identityPadding}>
            <GlassView intensity={50} style={styles.identityCard}>
              <LinearGradient
                colors={['rgba(212,175,55,0.07)', 'transparent']}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={['#9E8028', '#D4AF37', '#F5D060', '#D4AF37', '#9E8028']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.cardTopBorder}
              />

              <View style={styles.identityInner}>
                <LinearGradient colors={['#9E8028', '#D4AF37', '#F5D060']} style={styles.avatarRing}>
                  <View style={[styles.avatarCore, { backgroundColor: '#0D0D0D' }]}>
                    <Text style={[styles.avatarText, { color: colors.gold }]}>{initials}</Text>
                  </View>
                </LinearGradient>

                <View style={styles.identityText}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.chefName, { color: colors.foreground }]} numberOfLines={2}>
                      {chef.name}
                    </Text>
                    {chef.isVerified && (
                      <Ionicons name="checkmark-circle" size={16} color={colors.gold} />
                    )}
                  </View>
                  <Text style={[styles.chefHandle, { color: colors.mutedForeground }]}>{chef.handle}</Text>
                  <View style={styles.cuisineRow}>
                    <MaterialCommunityIcons name="silverware-fork-knife" size={12} color={colors.gold} />
                    <Text style={[styles.chefCuisine, { color: colors.gold }]}>{chef.cuisine}</Text>
                    <Text style={[styles.chefRegion, { color: colors.mutedForeground }]}>· {chef.region}</Text>
                  </View>
                </View>
              </View>

              {/* Stats row */}
              <View style={[styles.statsRow, { borderTopColor: 'rgba(212,175,55,0.12)' }]}>
                {([
                  { label: 'Rating',  value: chef.rating.toFixed(1) },
                  { label: 'Drops',   value: chef.totalDrops },
                  { label: 'Success', value: `${successRate}%` },
                  { label: 'Points',  value: chef.points.toLocaleString() },
                  { label: 'Rank',    value: `#${chef.rank}` },
                ] as const).map((stat, i) => (
                  <React.Fragment key={stat.label}>
                    {i > 0 && <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.07)' }]} />}
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color: colors.gold }]}>{String(stat.value)}</Text>
                      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </GlassView>
          </View>

          {/* ── Drop History ────────────────────────────────────────────── */}
          <DropsSection chefId={id ?? ''} isRealId={isRealId} />

        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const CARD_W = 280;

const styles = StyleSheet.create({
  screen:  { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 40 },

  backBtn: { position: 'absolute', left: 16, zIndex: 100 },
  backBtnInner: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },

  identityPadding: { paddingHorizontal: 16, marginBottom: 24 },
  identityCard: { borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(212,175,55,0.18)' },
  cardTopBorder: { height: 2, position: 'absolute', top: 0, left: 0, right: 0 },
  identityInner: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20 },
  avatarRing: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarCore: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  identityText: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chefName: { fontSize: 19, fontFamily: 'PlayfairDisplay_700Bold', flexShrink: 1 },
  chefHandle: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  cuisineRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  chefCuisine: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  chefRegion: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  statsRow: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 14 },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 9, fontFamily: 'Inter_500Medium', letterSpacing: 0.5 },
  statDivider: { width: 1, marginVertical: 4 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingHorizontal: 16, marginBottom: 14,
  },
  sectionDot: { width: 4, height: 4, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', flex: 1 },
  sectionCount: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  livePulse: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  livePulseText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  carousel: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },

  dropCard: { width: CARD_W, borderRadius: 18, overflow: 'hidden' },
  dropCardImage: { height: 175, position: 'relative', overflow: 'hidden' },
  dropMealBadge: {
    position: 'absolute', top: 10, left: 10,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12,
  },
  dropMealText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#0A0A0A', letterSpacing: 1.5 },
  dropStatusBadge: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1,
  },
  dropStatusText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  dropTitleWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12 },
  dropTitle: { fontSize: 15, fontFamily: 'PlayfairDisplay_700Bold', color: '#FFFFFF' },
  dropCardBody: {
    padding: 14, gap: 10,
    borderWidth: 1, borderTopWidth: 0,
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
  },
  dropDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  dropTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dropTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  dropTagText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  dropMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dropPrice: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  dropDate: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  dropFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dropFooterText: { fontSize: 11, fontFamily: 'Inter_400Regular', flex: 1 },
  dropTapHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dropTapHintText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  dropsLoader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 24 },
  dropsLoaderText: { fontSize: 13, fontFamily: 'Inter_400Regular' },

  emptyHistory: { paddingHorizontal: 16, marginBottom: 24 },
  emptyCard: {
    borderRadius: 18, padding: 28, alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden',
  },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
  retryBtn: { marginTop: 4, paddingVertical: 8, paddingHorizontal: 20 },
  retryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
