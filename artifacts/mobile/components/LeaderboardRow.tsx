import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { Chef } from '@/contexts/AppContext';

interface Props {
  chef: Chef;
  onPress?: (chef: Chef) => void;
}

export default function LeaderboardRow({ chef, onPress }: Props) {
  const colors = useColors();
  const isTop3 = chef.rank <= 3;

  const initials = chef.name
    .split(' ')
    .filter((_, i) => i === 1 || i === 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  const rankColors: { [k: number]: [string, string, ...string[]] } = {
    1: [colors.goldLight, colors.gold],
    2: ['#C0C0C0', '#E8E8E8'],
    3: ['#CD7F32', '#E8A060'],
  };

  return (
    <Pressable
      onPress={() => onPress?.(chef)}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: isTop3 ? colors.goldBorder : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* Rank */}
      <View style={styles.rankContainer}>
        {isTop3 ? (
          <LinearGradient
            colors={rankColors[chef.rank]}
            style={styles.rankBadge}
          >
            <Text style={[styles.rankText, { color: '#0A0A0A' }]}>
              {chef.rank}
            </Text>
          </LinearGradient>
        ) : (
          <View style={[styles.rankBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.rankText, { color: colors.mutedForeground }]}>
              {chef.rank}
            </Text>
          </View>
        )}
      </View>

      {/* Avatar */}
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: colors.goldBorder,
            borderColor: isTop3 ? colors.gold : colors.border,
          },
        ]}
      >
        <Text style={[styles.avatarText, { color: colors.gold }]}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.foreground }]}>
            {chef.name.replace('Chef ', '')}
          </Text>
          {chef.isVerified && (
            <Ionicons
              name="checkmark-circle"
              size={13}
              color={colors.gold}
              style={{ marginLeft: 4 }}
            />
          )}
        </View>
        <Text style={[styles.cuisine, { color: colors.mutedForeground }]}>
          {chef.cuisine}
        </Text>
      </View>

      {/* Points */}
      <View style={styles.pointsContainer}>
        {isTop3 && (
          <Ionicons name="trophy" size={12} color={colors.gold} style={{ marginBottom: 2 }} />
        )}
        <Text style={[styles.points, { color: isTop3 ? colors.gold : colors.foreground }]}>
          {(chef.points / 1000).toFixed(1)}k
        </Text>
        <Text style={[styles.pointsLabel, { color: colors.mutedForeground }]}>pts</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  rankContainer: { width: 32, alignItems: 'center' },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  cuisine: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  pointsContainer: { alignItems: 'center' },
  points: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  pointsLabel: { fontSize: 10, fontFamily: 'Inter_400Regular' },
});
