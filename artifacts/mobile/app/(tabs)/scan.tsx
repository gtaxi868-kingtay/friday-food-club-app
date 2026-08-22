import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import GlassView from '@/components/GlassView';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from 'convex/react';
import { api } from '@workspace/convex-backend/convex/_generated/api';
import { useColors } from '@/hooks/useColors';
import { type Drop } from '@/contexts/AppContext';
import DropCard from '@/components/DropCard';
import * as Haptics from 'expo-haptics';

function mapNfcDrop(d: any): Drop {
  return {
    id: d._id,
    title: d.title,
    description: d.description,
    chef: d.chef
      ? {
          id: d.chef.id, name: d.chef.name, handle: d.chef.handle, rating: d.chef.rating,
          totalDrops: d.chef.totalDrops, successfulDrops: d.chef.successfulDrops,
          isVerified: d.chef.isVerified, cuisine: d.chef.cuisine, region: d.chef.region,
          points: d.chef.points, rank: d.chef.rank,
        }
      : { id: '', name: '', handle: '', rating: 0, totalDrops: 0, successfulDrops: 0, isVerified: false, cuisine: '', region: '', points: 0, rank: 0 },
    price: d.price,
    inventory: d.inventory,
    minOrders: d.minOrders,
    currentOrders: d.currentOrders,
    remaining: d.remaining ?? Math.max(0, d.inventory - d.currentOrders),
    soldOut: d.status === 'SOLD_OUT',
    pickupLocation: d.pickupLocation,
    expiresAt: new Date(d.expiresAt).toISOString(),
    cuisine: d.chef?.cuisine ?? 'Caribbean',
    mealSlot: d.mealSlot,
    imageIndex: d.imageIndex ?? 1,
    imageUrl: null,
    tags: d.tags ?? [],
    status: d.status,
    isSecret: d.isSecret ?? false,
  };
}

const LOGO_GOLD = require('@/assets/images/logo-gold-transparent.png');

type ScanMode = 'location' | 'keychain';
type ScanState = 'idle' | 'scanning' | 'results' | 'empty' | 'error';

interface NfcResult {
  type: 'location' | 'keychain';
  drops: Drop[];
  location?: { id: string; name: string; address: string; region: string };
  member?: { id: string; name: string };
  total: number;
}

// Demo NFC IDs — replaced with real hardware IDs once physical tags are provisioned
const DEMO_NFC_IDS: Record<ScanMode, string> = {
  location: 'FFC-LOC-DEMO-001',
  keychain: 'FFC-KEY-DEMO-001',
};

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scanMutation = useMutation(api.nfc.scan);

  const [mode, setMode] = useState<ScanMode>('location');
  const [state, setState] = useState<ScanState>('idle');
  const [result, setResult] = useState<NfcResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const ring3 = useRef(new Animated.Value(1)).current;
  const ringOpacity1 = useRef(new Animated.Value(0.6)).current;
  const ringOpacity2 = useRef(new Animated.Value(0.4)).current;
  const ringOpacity3 = useRef(new Animated.Value(0.2)).current;
  const resultsOpacity = useRef(new Animated.Value(0)).current;
  const resultsSlide = useRef(new Animated.Value(24)).current;

  const pulseAnimsRef = useRef<Animated.CompositeAnimation[]>([]);

  function startPulse() {
    const makeRing = (scale: Animated.Value, opacity: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(scale, { toValue: 2.4, duration: 1800, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(opacity, { toValue: 0, duration: 1800, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
    const a1 = makeRing(ring1, ringOpacity1, 0);
    const a2 = makeRing(ring2, ringOpacity2, 500);
    const a3 = makeRing(ring3, ringOpacity3, 1000);
    pulseAnimsRef.current = [a1, a2, a3];
    a1.start(); a2.start(); a3.start();
  }

  function stopPulse() {
    pulseAnimsRef.current.forEach(a => a.stop());
    pulseAnimsRef.current = [];
    ring1.setValue(1); ring2.setValue(1); ring3.setValue(1);
    ringOpacity1.setValue(0.6); ringOpacity2.setValue(0.4); ringOpacity3.setValue(0.2);
  }

  const resetScan = () => {
    stopPulse();
    resultsOpacity.setValue(0);
    resultsSlide.setValue(24);
    setResult(null);
    setErrorMsg('');
    setState('idle');
  };

  const handleTap = async () => {
    if (state === 'scanning') return;
    if (state !== 'idle') { resetScan(); return; }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setState('scanning');
    startPulse();

    // Simulate NFC hardware read delay, then call the API
    setTimeout(async () => {
      stopPulse();
      try {
        const nfcId = DEMO_NFC_IDS[mode];
        const raw = await scanMutation({ nfcId, type: mode });
        const data: NfcResult = { ...raw, drops: raw.drops.map(mapNfcDrop) } as NfcResult;
        setResult(data);

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (data.total === 0) {
          setState('empty');
        } else {
          setState('results');
          Animated.parallel([
            Animated.timing(resultsOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
            Animated.spring(resultsSlide, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
          ]).start();
        }
      } catch (err: any) {
        // No location/keychain match is expected in demo mode — show "empty" gracefully
        if (err?.data?.code === 'NOT_FOUND') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setState('empty');
          return;
        }
        setErrorMsg(err?.data?.message ?? err?.message ?? 'Scan failed — try again');
        setState('error');
      }
    }, 2200);
  };

  useEffect(() => { return () => stopPulse(); }, []);

  const isBusy = state === 'scanning';
  const hasResult = state === 'results' || state === 'empty' || state === 'error';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Image source={LOGO_GOLD} style={styles.bgWatermark} resizeMode="contain" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Membeprint</Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {mode === 'location'
                ? 'Tap the venue NFC tag to see active drops'
                : 'Tap your keychain to see drops from chefs you follow'}
            </Text>
          </View>
          <MaterialCommunityIcons name="nfc-variant" size={28} color={colors.gold} />
        </View>

        {/* Mode selector */}
        {!hasResult && (
          <View style={styles.modeRow}>
            {([
              { key: 'location' as const, label: 'Shop Tap', icon: 'map-marker-radius' as const },
              { key: 'keychain' as const, label: 'Keychain', icon: 'key-chain-variant' as const },
            ]).map(m => (
              <Pressable
                key={m.key}
                onPress={() => { if (!isBusy) setMode(m.key); }}
                style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1, flex: 1 }]}
              >
                {mode === m.key ? (
                  <LinearGradient
                    colors={['#F5D060', '#D4AF37', '#9E8028']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.modeBtnActive}
                  >
                    <MaterialCommunityIcons name={m.icon} size={16} color="#0A0A0A" />
                    <Text style={styles.modeTextActive}>{m.label}</Text>
                  </LinearGradient>
                ) : (
                  <GlassView intensity={25} style={styles.modeBtnInactive}>
                    <MaterialCommunityIcons name={m.icon} size={16} color={colors.mutedForeground} />
                    <Text style={[styles.modeTextInactive, { color: colors.mutedForeground }]}>{m.label}</Text>
                  </GlassView>
                )}
              </Pressable>
            ))}
          </View>
        )}

        {/* NFC Tap Zone */}
        <View style={styles.tapZone}>
          {[ring1, ring2, ring3].map((ring, i) => (
            <Animated.View
              key={i}
              style={[
                styles.ring,
                {
                  transform: [{ scale: ring }],
                  opacity: [ringOpacity1, ringOpacity2, ringOpacity3][i],
                  borderColor: isBusy
                    ? 'rgba(212,175,55,0.5)'
                    : 'rgba(212,175,55,0.15)',
                },
              ]}
            />
          ))}

          <Pressable onPress={handleTap} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
            <LinearGradient
              colors={
                state === 'results'
                  ? ['#25D366', '#1DA851']
                  : state === 'error'
                  ? ['#C41E3A', '#8E1528']
                  : state === 'empty'
                  ? ['#2A2A2A', '#1A1A1A']
                  : isBusy
                  ? ['#F5D060', '#D4AF37', '#9E8028']
                  : ['#1A1A1A', '#141414']
              }
              style={styles.tapButton}
            >
              {state === 'results' ? (
                <Ionicons name="checkmark" size={42} color="#FFFFFF" />
              ) : state === 'error' ? (
                <Ionicons name="close" size={42} color="#FFFFFF" />
              ) : state === 'empty' ? (
                <MaterialCommunityIcons name="food-off" size={36} color={colors.mutedForeground} />
              ) : isBusy ? (
                <MaterialCommunityIcons name="nfc-search-variant" size={42} color="#0A0A0A" />
              ) : (
                <>
                  <MaterialCommunityIcons name="nfc-variant" size={42} color={colors.gold} />
                  <Text style={[styles.tapLabel, { color: colors.gold }]}>TAP</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>

          <Text style={[styles.tapStatus, { color: colors.mutedForeground }]}>
            {state === 'idle'
              ? mode === 'location' ? 'Tap the venue NFC tag' : 'Tap your Membeprint keychain'
              : isBusy
              ? 'Reading tag…'
              : state === 'results'
              ? `${result?.total ?? 0} active drop${result?.total !== 1 ? 's' : ''} found — tap to reset`
              : state === 'empty'
              ? 'No active drops right now — tap to try again'
              : `${errorMsg} — tap to try again`}
          </Text>
        </View>

        {/* Results */}
        {state === 'results' && result && result.total > 0 && (
          <Animated.View
            style={{ opacity: resultsOpacity, transform: [{ translateY: resultsSlide }] }}
          >
            {/* Context banner */}
            <View style={styles.resultsBanner}>
              <LinearGradient
                colors={['#9E8028', '#D4AF37', '#F5D060']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.resultsBannerGrad}
              >
                <MaterialCommunityIcons
                  name={result.type === 'location' ? 'map-marker-check' : 'heart-outline'}
                  size={14}
                  color="#0A0A0A"
                />
                <Text style={styles.resultsBannerText}>
                  {result.type === 'location'
                    ? (result.location?.name ?? 'This Spot')
                    : `${result.member?.name ?? 'Your'} favourite chefs`}
                </Text>
              </LinearGradient>
            </View>

            {/* Drop cards */}
            <View style={styles.dropList}>
              {result.drops.map(drop => (
                <DropCard
                  key={drop.id}
                  drop={drop}
                  hasOrdered={false}
                  onPress={d => router.push(`/drop/${d.id}`)}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {/* Empty / error state */}
        {(state === 'empty' || state === 'error') && (
          <GlassView intensity={30} style={styles.emptyCard}>
            <LinearGradient
              colors={state === 'error' ? ['#C41E3A', '#8E1528'] : ['#9E8028', '#D4AF37']}
              style={styles.emptyIconWrap}
            >
              <Ionicons
                name={state === 'error' ? 'alert-circle' : 'time-outline'}
                size={22}
                color="#FFFFFF"
              />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {state === 'error' ? 'Scan failed' : 'No drops right now'}
              </Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                {state === 'error'
                  ? errorMsg
                  : mode === 'location'
                  ? 'No chefs have live drops at this spot right now. Check back later.'
                  : 'Your favourited chefs have no active drops. Follow more chefs to see more here.'}
              </Text>
            </View>
          </GlassView>
        )}

        {/* How it works — shown only when idle */}
        {state === 'idle' && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                How Membeprint Works
              </Text>
            </View>

            {[
              {
                icon: 'map-marker-radius' as const,
                title: mode === 'location' ? 'Shop Tap' : 'Keychain Tap',
                body: mode === 'location'
                  ? 'Every pinned FFC venue has a gold NFC tag. Tap it to instantly see which chefs have live drops there right now.'
                  : 'Your gold Membeprint keychain is linked to your account. Tap it anywhere to see drops from chefs you\'ve favourited.',
              },
              {
                icon: 'lock-open-variant' as const,
                title: 'Instant Drop Feed',
                body: "No searching, no scrolling. One tap surfaces exactly what\u2019s available \u2014 sorted by how soon they close.",
              },
              {
                icon: 'trophy-outline' as const,
                title: 'Secret Drops',
                body: 'Some drops only appear via Membeprint. Friday-only secret menus, private chef dinners — never on the public feed.',
              },
            ].map((item, i) => (
              <GlassView key={i} style={styles.howCard} darkness={0.55}>
                <LinearGradient
                  colors={['#9E8028', '#D4AF37']}
                  style={styles.howIconWrap}
                >
                  <MaterialCommunityIcons name={item.icon} size={20} color="#0A0A0A" />
                </LinearGradient>
                <View style={styles.howText}>
                  <Text style={[styles.howTitle, { color: colors.foreground }]}>{item.title}</Text>
                  <Text style={[styles.howBody, { color: colors.mutedForeground }]}>{item.body}</Text>
                </View>
              </GlassView>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bgWatermark: {
    position: 'absolute',
    width: 360, height: 360, top: 0, right: -80, opacity: 0.05, zIndex: 0,
  },
  content: { paddingHorizontal: 16 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 20,
  },
  headerTitle: { fontSize: 32, fontFamily: 'PlayfairDisplay_700Bold' },
  headerSub: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 4, maxWidth: 260 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  modeBtnActive: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 11, borderRadius: 18,
  },
  modeTextActive: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },
  modeBtnInactive: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 11, borderRadius: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  modeTextInactive: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  tapZone: {
    alignItems: 'center', justifyContent: 'center', height: 290, marginBottom: 28,
  },
  ring: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1.5,
  },
  tapButton: {
    width: 140, height: 140, borderRadius: 70,
    alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(212,175,55,0.3)',
  },
  tapLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  tapStatus: {
    position: 'absolute', bottom: 0, fontSize: 13, fontFamily: 'Inter_400Regular',
    textAlign: 'center', paddingHorizontal: 40,
  },
  resultsBanner: { marginBottom: 16, borderRadius: 16, overflow: 'hidden' },
  resultsBannerGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 11,
  },
  resultsBannerText: {
    fontSize: 13, fontFamily: 'Inter_700Bold', color: '#0A0A0A', flex: 1,
  },
  dropList: { gap: 12 },
  emptyCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    padding: 18, borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.12)', marginBottom: 24,
  },
  emptyIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionDot: { width: 4, height: 4, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  howCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 16,
    borderRadius: 18, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(212,175,55,0.1)',
  },
  howIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  howText: { flex: 1, gap: 5 },
  howTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  howBody: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
});
