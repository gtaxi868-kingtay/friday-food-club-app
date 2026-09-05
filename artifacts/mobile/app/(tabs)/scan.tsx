import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  Platform,
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from 'convex/react';
import { api } from '@workspace/convex-backend/convex/_generated/api';
import { useColors } from '@/hooks/useColors';
import { isExpoGo } from '@/lib/nativeCompatibility';
import { type Drop } from '@/contexts/AppContext';
import DropCard from '@/components/DropCard';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';

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

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scanMutation = useMutation(api.nfc.scan);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [mode, setMode] = useState<ScanMode>('location');
  const [state, setState] = useState<ScanState>('idle');
  const [result, setResult] = useState<NfcResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [qrOpen, setQrOpen] = useState(false);
  const [manualId, setManualId] = useState('');

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

  const showResult = async (raw: any) => {
    const data: NfcResult = { ...raw, drops: raw.drops.map(mapNfcDrop) };
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
  };

  const resolveIdentifier = async (identifier: string) => {
    const normalized = identifier.trim();
    if (!normalized) throw new Error('The tag did not contain an identifier');
    await showResult(await scanMutation({ nfcId: normalized, type: mode }));
  };

  const handleTap = async () => {
    if (state === 'scanning') return;
    if (state !== 'idle') { resetScan(); return; }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setState('scanning');
    startPulse();
    let nfcManager: typeof import('react-native-nfc-manager').default | null = null;
    try {
      if (Platform.OS === 'web') {
        throw new Error('NFC is unavailable in the web preview — use QR fallback');
      }
      if (isExpoGo()) {
        throw new Error('NFC requires a custom development build — use QR fallback in Expo Go');
      }
      // NFC is a native-only enhancement. Loading it on demand keeps Expo Go
      // able to launch; a custom development build provides the native module.
      const nfc = require('react-native-nfc-manager') as typeof import('react-native-nfc-manager');
      nfcManager = nfc.default;
      await nfcManager.start();
      await nfcManager.requestTechnology(nfc.NfcTech.Ndef);
      const tag = await nfcManager.getTag();
      const identifier = tag?.id ?? (tag as any)?.serialNumber;
      if (!identifier) throw new Error('No NFC identifier was found on that tag');
      await resolveIdentifier(String(identifier));
    } catch (err: any) {
      if (err?.data?.code === 'NOT_FOUND') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setState('empty');
      } else {
        setErrorMsg(err?.data?.message ?? err?.message ?? 'NFC is unavailable on this device');
        setState('error');
      }
    } finally {
      stopPulse();
      await nfcManager?.cancelTechnologyRequest().catch(() => undefined);
    }
  };

  useEffect(() => { return () => stopPulse(); }, []);

  const openQrFallback = async () => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setErrorMsg('Camera permission is needed for QR fallback');
        setState('error');
        return;
      }
    }
    setQrOpen(true);
  };

  const handleQrData = async (data: string) => {
    setQrOpen(false);
    setState('scanning');
    try {
      await resolveIdentifier(data);
    } catch (err: any) {
      setErrorMsg(err?.data?.message ?? err?.message ?? 'QR tag was not recognized');
      setState('error');
    }
  };

  const handleManualIdentifier = async () => {
    setQrOpen(false);
    setState('scanning');
    try {
      await resolveIdentifier(manualId);
      setManualId('');
    } catch (err: any) {
      setErrorMsg(err?.data?.message ?? err?.message ?? 'Tag was not recognized');
      setState('error');
    }
  };

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
          {(state === 'idle' || state === 'error') && (
            <Pressable onPress={openQrFallback} style={styles.fallbackButton}>
              <Ionicons name="qr-code-outline" size={16} color={colors.gold} />
              <Text style={[styles.fallbackText, { color: colors.gold }]}>Use QR fallback</Text>
            </Pressable>
          )}
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

      <Modal visible={qrOpen} animationType="slide" onRequestClose={() => setQrOpen(false)}>
        <View style={[styles.qrModal, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.qrHeader}>
            <View>
              <Text style={[styles.qrTitle, { color: colors.foreground }]}>Scan tag QR</Text>
              <Text style={[styles.qrSubtitle, { color: colors.mutedForeground }]}>
                This QR resolves to the same venue or keychain identifier as NFC.
              </Text>
            </View>
            <Pressable onPress={() => setQrOpen(false)} style={styles.qrClose}>
              <Ionicons name="close" size={22} color={colors.foreground} />
            </Pressable>
          </View>
          <View style={styles.cameraFrame}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }: BarcodeScanningResult) => handleQrData(data)}
            />
            <View style={styles.qrCorner} />
          </View>
          <Text style={[styles.orText, { color: colors.mutedForeground }]}>or enter the tag identifier</Text>
          <View style={styles.manualRow}>
            <TextInput
              value={manualId}
              onChangeText={setManualId}
              placeholder="FFC-LOC-..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoCapitalize="characters"
              style={[styles.manualInput, { color: colors.foreground }]}
            />
            <Pressable onPress={handleManualIdentifier} style={styles.manualButton}>
              <Text style={styles.manualButtonText}>Find</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  fallbackButton: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, padding: 8 },
  fallbackText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  qrModal: { flex: 1, backgroundColor: '#0A0A0A', paddingHorizontal: 18 },
  qrHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, marginBottom: 24 },
  qrTitle: { fontSize: 28, fontFamily: 'PlayfairDisplay_700Bold' },
  qrSubtitle: { fontSize: 13, lineHeight: 19, marginTop: 5, maxWidth: 290 },
  qrClose: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  cameraFrame: { height: 330, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(212,175,55,0.5)', backgroundColor: '#141414', alignItems: 'center', justifyContent: 'center' },
  qrCorner: { width: 190, height: 190, borderWidth: 2, borderColor: '#D4AF37', borderRadius: 18 },
  orText: { textAlign: 'center', marginTop: 22, marginBottom: 10, fontSize: 13 },
  manualRow: { flexDirection: 'row', gap: 9 },
  manualInput: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 14, backgroundColor: 'rgba(255,255,255,0.06)' },
  manualButton: { height: 48, borderRadius: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D4AF37' },
  manualButtonText: { color: '#0A0A0A', fontFamily: 'Inter_700Bold', fontSize: 14 },
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
