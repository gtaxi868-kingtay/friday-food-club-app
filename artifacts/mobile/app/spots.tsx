/**
 * Pickup Spots — user-facing browse screen for registered pickup venues.
 * Read-only mirror of the admin Spots panel's data (name/address/region/
 * coordinates) via locations.listPublic, grouped by region.
 */
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '@workspace/convex-backend/convex/_generated/api';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import GlassView from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { openInMaps } from '@/lib/maps';

export default function SpotsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const spots = useQuery(api.locations.listPublic, {});
  const isLoading = spots === undefined;

  const byRegion = (spots ?? []).reduce<Record<string, typeof spots>>((acc, s) => {
    (acc[s.region] ??= []).push(s);
    return acc;
  }, {});

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()}>
          <GlassView intensity={30} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={18} color={colors.foreground} />
          </GlassView>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Pickup Spots</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? null : (spots ?? []).length === 0 ? (
          <GlassView intensity={30} style={styles.emptyCard}>
            <Ionicons name="location-outline" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No spots registered yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Pickup venues are added by the Friday Food Club team — check back soon.
            </Text>
          </GlassView>
        ) : (
          Object.entries(byRegion).sort(([a], [b]) => a.localeCompare(b)).map(([region, regionSpots]) => (
            <View key={region} style={styles.regionSection}>
              <Text style={[styles.regionLabel, { color: colors.gold }]}>{region.toUpperCase()}</Text>
              {regionSpots!.map(spot => (
                <GlassView key={spot.id} intensity={30} style={styles.spotCard}>
                  <View style={styles.spotHeader}>
                    <View style={[styles.spotIconWrap, { backgroundColor: 'rgba(212,175,55,0.1)' }]}>
                      <MaterialCommunityIcons name="map-marker-radius" size={18} color={colors.gold} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.spotName, { color: colors.foreground }]}>{spot.name}</Text>
                      <Text style={[styles.spotAddress, { color: colors.mutedForeground }]}>{spot.address}</Text>
                    </View>
                  </View>
                  {spot.lat != null && spot.lng != null && (
                    <Pressable
                      onPress={async () => {
                        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        openInMaps(spot.lat!, spot.lng!, spot.name);
                      }}
                      style={({ pressed }) => [styles.mapsBtn, { opacity: pressed ? 0.75 : 1 }]}
                    >
                      <Ionicons name="navigate" size={13} color="#0A0A0A" />
                      <Text style={styles.mapsBtnText}>Open in Maps</Text>
                    </Pressable>
                  )}
                </GlassView>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontFamily: 'Inter_700Bold' },
  content: { paddingHorizontal: 16, paddingTop: 12 },
  regionSection: { marginBottom: 20 },
  regionLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginBottom: 10 },
  spotCard: {
    borderRadius: 16, overflow: 'hidden', padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(212,175,55,0.12)', gap: 10,
  },
  spotHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  spotIconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  spotName: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  spotAddress: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  mapsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: 10, backgroundColor: '#D4AF37',
  },
  mapsBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },
  emptyCard: {
    alignItems: 'center', gap: 12, padding: 40, borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginTop: 20,
  },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
});
