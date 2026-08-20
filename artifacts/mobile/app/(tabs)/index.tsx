import React, { useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import GlassView from '@/components/GlassView';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useApp, type Drop } from '@/contexts/AppContext';
import HeroDropCard from '@/components/HeroDropCard';
import DropCard from '@/components/DropCard';

const LOGO_GOLD = require('@/assets/images/logo-gold-transparent.png');
const LOGO_WHITE = require('@/assets/images/logo-white-transparent.png');

const FILTERS = ['All Drops', 'Secret', 'Ending Soon', 'Near Full', 'Breakfast', 'Lunch', 'Dinner'] as const;
type Filter = (typeof FILTERS)[number];

function filterDrops(drops: Drop[], filter: Filter): Drop[] {
  switch (filter) {
    case 'Secret':
      return drops.filter(d => d.isSecret === true);
    case 'Ending Soon':
      return [...drops]
        .filter(d => new Date(d.expiresAt).getTime() - Date.now() < 3 * 60 * 60 * 1000)
        .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
    case 'Near Full':
      return drops.filter(d => d.currentOrders / d.minOrders >= 0.6);
    case 'Breakfast':
      return drops.filter(d => d.mealSlot === 'Breakfast');
    case 'Lunch':
      return drops.filter(d => d.mealSlot === 'Lunch');
    case 'Dinner':
      return drops.filter(d => d.mealSlot === 'Dinner');
    default:
      return drops;
  }
}

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { drops, orderedDropIds } = useApp();
  const [activeFilter, setActiveFilter] = useState<Filter>('All Drops');
  const [refreshing, setRefreshing] = useState(false);

  const liveDrops = filterDrops(drops, activeFilter);
  // Only show server-backed drops. Fake preview posts looked orderable but
  // intentionally had no preorder action, which confused members.
  const visibleDrops = liveDrops;
  const heroDropRaw = visibleDrops[0];
  const restDrops = visibleDrops.slice(1);

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 800));
    setRefreshing(false);
  };

  const handleDropPress = (drop: Drop) => {
    router.push(`/drop/${drop.id}`);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* ── Global gold logo watermark ── */}
      <Image source={LOGO_GOLD} style={styles.bgWatermark} resizeMode="contain" />

      <FlatList
        data={restDrops}
        keyExtractor={d => d.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.gold}
          />
        }
        ListHeaderComponent={
          <>
            {/* ── Floating glass header ── */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
              <Image source={LOGO_WHITE} style={styles.logo} resizeMode="contain" />
              <GlassView intensity={60} style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </GlassView>
            </View>

            {/* ── Filter tabs ── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTERS.map(f => (
                <Pressable
                  key={f}
                  onPress={() => setActiveFilter(f)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
                >
                  {activeFilter === f ? (
                    <LinearGradient
                      colors={['#F5D060', '#D4AF37', '#9E8028']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.filterActive}
                    >
                      <Text style={styles.filterTextActive}>{f}</Text>
                    </LinearGradient>
                  ) : (
                    <GlassView intensity={30} style={styles.filterInactive}>
                      <Text style={[styles.filterTextInactive, { color: colors.mutedForeground }]}>
                        {f}
                      </Text>
                    </GlassView>
                  )}
                </Pressable>
              ))}
            </ScrollView>

            {/* ── Drop count row ── */}
            <View style={styles.countRow}>
              <Text style={[styles.countText, { color: colors.mutedForeground }]}>
                {visibleDrops.length} active drop{visibleDrops.length !== 1 ? 's' : ''}
              </Text>
              <View style={styles.exclusiveRow}>
                <Ionicons name="lock-closed" size={11} color={colors.gold} />
                <Text style={[styles.exclusiveText, { color: colors.gold }]}>EXCLUSIVE ACCESS</Text>
              </View>
            </View>

            {/* ── Hero drop ── */}
            {heroDropRaw && (
              <HeroDropCard
                drop={heroDropRaw}
                hasOrdered={orderedDropIds.has(heroDropRaw.id)}
                onPress={handleDropPress}
              />
            )}

            {/* ── Section label ── */}
            {restDrops.length > 0 && (
              <View style={styles.sectionLabel}>
                <View style={[styles.sectionLine, { backgroundColor: colors.goldBorder }]} />
                <Text style={[styles.sectionLabelText, { color: colors.mutedForeground }]}>
                  MORE DROPS
                </Text>
                <View style={[styles.sectionLine, { backgroundColor: colors.goldBorder }]} />
              </View>
            )}
          </>
        }
        renderItem={({ item }) => (
          <DropCard
            drop={item}
            hasOrdered={orderedDropIds.has(item.id)}
            onPress={handleDropPress}
          />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 90 },
        ]}
        ListEmptyComponent={
          !heroDropRaw ? (
            <View style={styles.empty}>
              <Ionicons name="restaurant-outline" size={44} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No drops right now</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Chefs drop at all hours — check back soon
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bgWatermark: {
    position: 'absolute',
    width: 380,
    height: 380,
    top: -40,
    right: -100,
    opacity: 0.05,
    zIndex: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  logo: { width: 80, height: 80 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(196,30,58,0.4)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#C41E3A',
  },
  liveText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterActive: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 24,
  },
  filterTextActive: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#0A0A0A',
    letterSpacing: 0.3,
  },
  filterInactive: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  filterTextInactive: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  countText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  exclusiveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  exclusiveText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 14,
    gap: 12,
  },
  sectionLine: { flex: 1, height: 1 },
  sectionLabelText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 },
  list: { paddingTop: 0 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptySub: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
