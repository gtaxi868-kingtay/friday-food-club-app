import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import type { Chef } from '@/contexts/AppContext';

interface Props {
  chef: Chef;
  onPress?: (chef: Chef) => void;
  compact?: boolean;
}

const CUISINE_ICONS: { [key: string]: string } = {
  'Trinidadian Fusion': 'silverware-fork-knife',
  'Caribbean Fine Dining': 'food-drumstick',
  'Indo-Trini': 'food-variant',
  'BBQ & Smoke': 'fire',
  'Street Food Elite': 'storefront',
};

export default function ChefCard({ chef, onPress, compact }: Props) {
  const colors = useColors();

  const handlePress = async () => {
    await Haptics.selectionAsync();
    onPress?.(chef);
  };

  const initials = chef.name
    .split(' ')
    .filter((_, i) => i === 1 || i === 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  const iconName = (CUISINE_ICONS[chef.cuisine] ?? 'silverware-fork-knife') as any;

  if (compact) {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.compactContainer,
          { borderColor: colors.goldBorder, backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View style={[styles.avatar, { backgroundColor: colors.goldBorder, borderColor: colors.gold }]}>
          <Text style={[styles.avatarText, { color: colors.gold }]}>{initials}</Text>
        </View>
        <Text style={[styles.compactName, { color: colors.foreground }]} numberOfLines={1}>
          {chef.name.replace('Chef ', '')}
        </Text>
        <Text style={[styles.compactHandle, { color: colors.mutedForeground }]}>{chef.handle}</Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={11} color={colors.gold} />
          <Text style={[styles.compactRating, { color: colors.gold }]}>{chef.rating}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { borderColor: colors.goldBorder, backgroundColor: colors.card, opacity: pressed ? 0.88 : 1 },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: colors.goldBorder, borderColor: colors.gold }]}>
          <Text style={[styles.avatarText, { color: colors.gold }]}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.foreground }]}>{chef.name}</Text>
            {chef.isVerified && (
              <Ionicons name="checkmark-circle" size={15} color={colors.gold} style={{ marginLeft: 4 }} />
            )}
          </View>
          <Text style={[styles.handle, { color: colors.mutedForeground }]}>{chef.handle}</Text>
          <Text style={[styles.cuisine, { color: colors.gold }]}>{chef.cuisine}</Text>
        </View>
        <View style={styles.stats}>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={12} color={colors.gold} />
            <Text style={[styles.rating, { color: colors.gold }]}>{chef.rating}</Text>
          </View>
          <Text style={[styles.dropCount, { color: colors.mutedForeground }]}>
            {chef.successfulDrops} drops
          </Text>
        </View>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <MaterialCommunityIcons name={iconName} size={14} color={colors.gold} />
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{chef.region}</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="trophy-outline" size={14} color={colors.gold} />
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
            {chef.points.toLocaleString()} pts
          </Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="layers-outline" size={14} color={colors.gold} />
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
            {chef.totalDrops} total
          </Text>
        </View>
      </View>
    </Pressable>
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
  compactContainer: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    width: 120,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  handle: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  cuisine: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  stats: { alignItems: 'flex-end', gap: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rating: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  dropCount: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  divider: { height: 1 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  // compact
  compactName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  compactHandle: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  compactRating: { fontSize: 12, fontFamily: 'Inter_700Bold' },
});
