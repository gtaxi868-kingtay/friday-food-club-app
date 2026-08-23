import React, { useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import GlassView from '@/components/GlassView';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useApp, type Chef } from '@/contexts/AppContext';
import LeaderboardRow from '@/components/LeaderboardRow';
import ChefCard from '@/components/ChefCard';

const LOGO_GOLD = require('@/assets/images/logo-gold-transparent.png');

const CUISINES = [
  { label: 'Trinidadian', icon: 'restaurant-outline' },
  { label: 'Indo-Trini', icon: 'leaf-outline' },
  { label: 'Seafood', icon: 'fish-outline' },
  { label: 'BBQ & Smoke', icon: 'flame-outline' },
  { label: 'Fusion', icon: 'sparkles-outline' },
  { label: 'Street Food', icon: 'storefront-outline' },
  { label: 'Bakery & Pastries', icon: 'cafe-outline' },
  { label: 'Confectionery & Sweets', icon: 'ice-cream-outline' },
] as const;

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { chefs } = useApp();
  const [search, setSearch] = useState('');
  const [activeCuisine, setActiveCuisine] = useState<string | null>(null);

  const handleChefPress = (chef: Chef) => router.push(`/chef/${chef.id}` as any);

  const filteredChefs = chefs.filter(c => {
    const matchSearch =
      search.length === 0 ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.handle.toLowerCase().includes(search.toLowerCase());
    const matchCuisine = !activeCuisine || c.cuisine.includes(activeCuisine);
    return matchSearch && matchCuisine;
  });

  const topChefs = [...chefs].sort((a, b) => b.points - a.points).slice(0, 5);

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
        <View style={styles.heroHeader}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Discover</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {chefs.length} verified chefs in the club
          </Text>
        </View>

        {/* Search */}
        <GlassView intensity={50} style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search chefs, handles..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </GlassView>

        {/* Cuisine chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {CUISINES.map(({ label, icon }) => {
            const isActive = activeCuisine === label;
            return (
              <Pressable
                key={label}
                onPress={() => setActiveCuisine(isActive ? null : label)}
                style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
              >
                {isActive ? (
                  <LinearGradient
                    colors={['#F5D060', '#D4AF37', '#9E8028']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.chipActive}
                  >
                    <Ionicons name={icon as any} size={13} color="#0A0A0A" />
                    <Text style={styles.chipTextActive}>{label}</Text>
                  </LinearGradient>
                ) : (
                  <GlassView intensity={35} style={styles.chipInactive}>
                    <Ionicons name={icon as any} size={13} color={colors.mutedForeground} />
                    <Text style={[styles.chipTextInactive, { color: colors.mutedForeground }]}>
                      {label}
                    </Text>
                  </GlassView>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Leaderboard */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Top Chefs This Week
          </Text>
        </View>

        <GlassView intensity={40} style={styles.leaderboardCard}>
          <LinearGradient
            colors={[colors.goldDark, colors.gold, colors.goldLight, colors.gold, colors.goldDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.leaderboardBorder}
          />
          {topChefs.map((chef, i) => (
            <React.Fragment key={chef.id}>
              {i > 0 && (
                <View style={[styles.leaderDivider, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
              )}
              <LeaderboardRow chef={{ ...chef, rank: i + 1 }} onPress={handleChefPress} />
            </React.Fragment>
          ))}
        </GlassView>

        {/* All Chefs */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>All Chefs</Text>
          <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
            {filteredChefs.length}
          </Text>
        </View>

        {filteredChefs.length === 0 ? (
          <GlassView intensity={35} style={styles.emptyCard}>
            <Ionicons name="search-outline" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No chefs match your search
            </Text>
          </GlassView>
        ) : (
          filteredChefs.map(chef => (
            <ChefCard key={chef.id} chef={chef} onPress={handleChefPress} />
          ))
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
    top: 0,
    right: -80,
    opacity: 0.05,
    zIndex: 0,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16 },
  heroHeader: { marginBottom: 20 },
  headerTitle: { fontSize: 32, fontFamily: 'PlayfairDisplay_700Bold' },
  headerSub: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 4 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  chipRow: { paddingBottom: 20, gap: 8 },
  chipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
  },
  chipTextActive: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },
  chipInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipTextInactive: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionDot: { width: 4, height: 4, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', flex: 1 },
  sectionCount: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  leaderboardCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.15)',
  },
  leaderboardBorder: { height: 1.5 },
  leaderDivider: { height: 1, marginLeft: 52 },
  emptyCard: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: 36,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
});
