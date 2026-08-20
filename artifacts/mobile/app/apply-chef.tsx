/**
 * Become a Chef — multi-step application flow
 *
 * Gate: user must be logged in (AuthContext). If not, shows a login form.
 *
 * Step 0 → Login (if not already authenticated)
 * Step 1 → Kitchen details (name, area, cuisine)
 * Step 2 → Food Badge photo upload
 * Step 3 → National ID upload
 * Step 4 → Review & submit
 * Step 5 → Under review confirmation
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import GlassView from '@/components/GlassView';
import { API_BASE } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';

const LOGO_GOLD = require('@/assets/images/logo-gold-transparent.png');

const TRINIDAD_AREAS = [
  'Port of Spain', 'San Fernando', 'Chaguanas', 'Arima', 'Point Fortin',
  'Diego Martin', 'Woodbrook', 'Westmoorings', 'Maraval', 'St. Clair',
  'Couva', 'Debe', 'Siparia', 'Rio Claro', 'Sangre Grande', 'Princes Town',
  'Tunapuna', 'Curepe', 'Barataria', 'Morvant', 'Laventille', 'Fyzabad',
];

const CUISINE_OPTIONS = [
  'Trinidadian Fusion', 'Indo-Trini', 'Caribbean Fine Dining',
  'Street Food', 'BBQ & Smoke', 'Seafood', 'Bake & Shark',
  'Vegetarian / Vegan', 'Doubles & Roti', 'Chinese-Trini', 'Creole',
  'Home Cooking',
];

type UploadState = { uri: string | null; objectPath: string | null; uploading: boolean };

// ── Upload helper ─────────────────────────────────────────────────────────────

async function uploadImage(
  uri: string,
  fileName: string,
  mimeType: string,
  headers: Record<string, string>,
): Promise<string> {
  // 1. Fetch file bytes to determine size
  const fileRes = await fetch(uri);
  const blob = await fileRes.blob();
  const size = blob.size;

  // 2. Request a presigned PUT URL from the API (authenticated)
  const urlRes = await fetch(`${API_BASE}/uploads/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ name: fileName, size, contentType: mimeType }),
  });
  if (!urlRes.ok) {
    const err = await urlRes.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Upload failed (${urlRes.status})`);
  }
  const { uploadURL, objectPath } = (await urlRes.json()) as {
    uploadURL: string;
    objectPath: string;
  };

  // 3. PUT file bytes directly to GCS presigned URL (no auth needed here)
  const putRes = await fetch(uploadURL, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: blob,
  });
  if (!putRes.ok) throw new Error('Storage upload failed — please try again');

  return objectPath;
}

// ── Login Gate ────────────────────────────────────────────────────────────────

function LoginGate({ colors, insets }: { colors: ReturnType<typeof useColors>; insets: ReturnType<typeof useSafeAreaInsets> }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: any) {
      Alert.alert('Login Failed', err.message ?? 'Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Image source={LOGO_GOLD} style={styles.bgWatermark} resizeMode="contain" />
      <View style={[styles.loginWrap, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Pressable onPress={() => router.back()} style={styles.loginBack}>
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </Pressable>

        <View style={styles.loginHeader}>
          <MaterialCommunityIcons name="chef-hat" size={52} color={colors.gold} />
          <Text style={[styles.loginTitle, { color: colors.foreground }]}>Become a Chef</Text>
          <Text style={[styles.loginSub, { color: colors.mutedForeground }]}>
            Sign in to your Friday Food Club account to start your application.
            Don't have an account? Register on fridayfood.club.
          </Text>
        </View>

        <GlassView intensity={40} style={[styles.loginCard, { borderColor: 'rgba(212,175,55,0.15)' }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Email</Text>
          <GlassView intensity={25} style={styles.inputWrap}>
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="your@email.com"
              placeholderTextColor={colors.mutedForeground}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </GlassView>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Password</Text>
          <GlassView intensity={25} style={styles.inputWrap}>
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </GlassView>

          <Pressable
            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, marginTop: 20 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            <LinearGradient
              colors={loading ? ['#555', '#444'] : [colors.goldDark, colors.gold]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaBtn}
            >
              {loading
                ? <ActivityIndicator color="#0A0A0A" />
                : <Text style={styles.ctaBtnText}>Sign In & Apply</Text>}
            </LinearGradient>
          </Pressable>
        </GlassView>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ApplyChefScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token, authHeaders, logout } = useAuth();

  const [step, setStep] = useState(0);

  // Step 1 fields
  const [kitchenName, setKitchenName] = useState('');
  const [area, setArea] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [showAreaPicker, setShowAreaPicker] = useState(false);
  const [showCuisinePicker, setShowCuisinePicker] = useState(false);

  // Step 2/3 uploads
  const [foodBadge, setFoodBadge] = useState<UploadState>({ uri: null, objectPath: null, uploading: false });
  const [nationalId, setNationalId] = useState<UploadState>({ uri: null, objectPath: null, uploading: false });

  // Submit
  const [submitting, setSubmitting] = useState(false);

  // ── Success screen — checked BEFORE auth gate ─────────────────────────────
  // logout() is called on successful submit, which clears the token.
  // We must render the confirmation before the auth gate re-evaluates,
  // otherwise the login form appears instead of the success screen.
  if (step === 4) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Image source={LOGO_GOLD} style={styles.bgWatermark} resizeMode="contain" />
        <View style={[styles.successWrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
          <LinearGradient colors={['rgba(212,175,55,0.15)', 'transparent']} style={styles.successGlow} />
          <MaterialCommunityIcons name="shield-check-outline" size={72} color={colors.gold} />
          <Text style={[styles.successTitle, { color: colors.foreground }]}>Application Submitted</Text>
          <Text style={[styles.successSub, { color: colors.mutedForeground }]}>
            Our team will review your Food Badge and National ID within 1–3 business days.
            Once approved, sign back in to access your chef tools — your session has been cleared so your next login grants full chef access.
          </Text>
          <LinearGradient colors={[colors.goldDark, colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.successBtn}>
            <Pressable style={styles.successBtnInner} onPress={() => router.replace('/(tabs)')}>
              <Text style={styles.successBtnText}>Done</Text>
            </Pressable>
          </LinearGradient>
        </View>
      </View>
    );
  }

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (!token || !user) {
    return <LoginGate colors={colors} insets={insets} />;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const pickAndUpload = async (field: 'foodBadge' | 'nationalId') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to upload documents.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const fileName = asset.fileName ?? `${field}_${Date.now()}.jpg`;

    const setter = field === 'foodBadge' ? setFoodBadge : setNationalId;
    setter(s => ({ ...s, uri, uploading: true }));

    try {
      const objectPath = await uploadImage(uri, fileName, mimeType, authHeaders());
      setter({ uri, objectPath, uploading: false });
    } catch (err: any) {
      setter(s => ({ ...s, uploading: false }));
      Alert.alert('Upload Failed', err.message ?? 'Could not upload. Try again.');
    }
  };

  const handleSubmit = async () => {
    if (!foodBadge.objectPath || !nationalId.objectPath) {
      Alert.alert('Missing Documents', 'Please upload both your Food Badge and National ID.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/chefs/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          kitchenName,
          area,
          cuisine: cuisine || 'Home Cooking',
          foodBadgeUrl: foodBadge.objectPath,
          nationalIdUrl: nationalId.objectPath,
        }),
      });
      if (res.status === 409) {
        const e = await res.json().catch(() => ({}));
        Alert.alert('Already Applied', (e as any).error ?? 'Application is already under review.');
        return;
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as any).error ?? 'Submission failed');
      }
      // Clear the BUYER token — the next login will produce a CHEF token
      // once the admin approves the application. This prevents stale role access.
      await logout();
      setStep(4);
    } catch (err: any) {
      Alert.alert('Submission Failed', err.message ?? 'Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const canNext0 = kitchenName.trim().length >= 2 && area.length > 0;
  const canNext1 = !!foodBadge.objectPath && !foodBadge.uploading;
  const canNext2 = !!nationalId.objectPath && !nationalId.uploading;

  // ── Application Flow ──────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Image source={LOGO_GOLD} style={styles.bgWatermark} resizeMode="contain" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => (step > 0 ? setStep(s => s - 1) : router.back())}>
          <GlassView intensity={30} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={18} color={colors.foreground} />
          </GlassView>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Become a Chef</Text>
          <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>Step {step + 1} of 4</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
        <LinearGradient
          colors={[colors.goldDark, colors.gold]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: `${((step + 1) / 4) * 100}%` }]}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Step 0: Kitchen Details ── */}
        {step === 0 && (
          <View style={styles.stepWrap}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>Your Kitchen</Text>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Tell us about your culinary identity. This becomes your public creator profile.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Kitchen Name *</Text>
              <GlassView intensity={30} style={[styles.inputWrap, { borderColor: kitchenName ? colors.gold + '55' : 'rgba(255,255,255,0.08)' }]}>
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="e.g. Marcus's Pelau Kitchen"
                  placeholderTextColor={colors.mutedForeground}
                  value={kitchenName}
                  onChangeText={setKitchenName}
                  maxLength={100}
                />
              </GlassView>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Area *</Text>
              <Pressable onPress={() => setShowAreaPicker(p => !p)}>
                <GlassView intensity={30} style={[styles.inputWrap, { borderColor: area ? colors.gold + '55' : 'rgba(255,255,255,0.08)' }]}>
                  <Text style={[styles.input, { color: area ? colors.foreground : colors.mutedForeground }]}>
                    {area || 'Select your area'}
                  </Text>
                  <Ionicons name={showAreaPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
                </GlassView>
              </Pressable>
              {showAreaPicker && (
                <GlassView intensity={40} style={styles.picker}>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                    {TRINIDAD_AREAS.map(a => (
                      <Pressable
                        key={a}
                        style={[styles.pickerItem, area === a && { backgroundColor: 'rgba(212,175,55,0.12)' }]}
                        onPress={() => { setArea(a); setShowAreaPicker(false); }}
                      >
                        <Text style={[styles.pickerItemText, { color: area === a ? colors.gold : colors.foreground }]}>{a}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </GlassView>
              )}

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Cuisine Style</Text>
              <Pressable onPress={() => setShowCuisinePicker(p => !p)}>
                <GlassView intensity={30} style={[styles.inputWrap, { borderColor: cuisine ? colors.gold + '55' : 'rgba(255,255,255,0.08)' }]}>
                  <Text style={[styles.input, { color: cuisine ? colors.foreground : colors.mutedForeground }]}>
                    {cuisine || 'Select cuisine style (optional)'}
                  </Text>
                  <Ionicons name={showCuisinePicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
                </GlassView>
              </Pressable>
              {showCuisinePicker && (
                <GlassView intensity={40} style={styles.picker}>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                    {CUISINE_OPTIONS.map(c => (
                      <Pressable
                        key={c}
                        style={[styles.pickerItem, cuisine === c && { backgroundColor: 'rgba(212,175,55,0.12)' }]}
                        onPress={() => { setCuisine(c); setShowCuisinePicker(false); }}
                      >
                        <Text style={[styles.pickerItemText, { color: cuisine === c ? colors.gold : colors.foreground }]}>{c}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </GlassView>
              )}
            </View>
          </View>
        )}

        {/* ── Step 1: Food Badge ── */}
        {step === 1 && (
          <View style={styles.stepWrap}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>Food Badge</Text>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Upload a clear photo of your valid Food Handler's Badge or Food Safety Certificate issued by the T&T government.
            </Text>
            <DocUploadCard
              label="Food Handler's Badge"
              hint="Front of badge — all text must be legible"
              icon="id-card-outline"
              state={foodBadge}
              colors={colors}
              onPress={() => pickAndUpload('foodBadge')}
            />
          </View>
        )}

        {/* ── Step 2: National ID ── */}
        {step === 2 && (
          <View style={styles.stepWrap}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>National ID</Text>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Upload a photo of your National ID Card, Passport (photo page), or Driver's Permit. This confirms your identity.
            </Text>
            <DocUploadCard
              label="Government ID"
              hint="Photo must be clear — no blurs or glare"
              icon="person-circle-outline"
              state={nationalId}
              colors={colors}
              onPress={() => pickAndUpload('nationalId')}
            />
          </View>
        )}

        {/* ── Step 3: Review ── */}
        {step === 3 && (
          <View style={styles.stepWrap}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>Review & Submit</Text>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Double-check your application. Our team reviews within 1–3 business days.
            </Text>
            <GlassView intensity={40} style={styles.reviewCard}>
              <LinearGradient colors={['rgba(212,175,55,0.06)', 'transparent']} style={StyleSheet.absoluteFill} />
              <ReviewRow label="Signed in as" value={user.email} colors={colors} />
              <View style={[styles.reviewDivider, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
              <ReviewRow label="Kitchen Name" value={kitchenName} colors={colors} />
              <View style={[styles.reviewDivider, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
              <ReviewRow label="Area" value={area} colors={colors} />
              <View style={[styles.reviewDivider, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
              <ReviewRow label="Cuisine" value={cuisine || 'Home Cooking'} colors={colors} />
              <View style={[styles.reviewDivider, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
              <ReviewRow
                label="Food Badge"
                value={foodBadge.objectPath ? '✓ Uploaded' : '— Missing'}
                valueColor={foodBadge.objectPath ? '#4ADE80' : '#F87171'}
                colors={colors}
              />
              <View style={[styles.reviewDivider, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
              <ReviewRow
                label="National ID"
                value={nationalId.objectPath ? '✓ Uploaded' : '— Missing'}
                valueColor={nationalId.objectPath ? '#4ADE80' : '#F87171'}
                colors={colors}
              />
            </GlassView>
            <GlassView intensity={20} style={styles.disclaimerBox}>
              <Ionicons name="information-circle-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
                By submitting you confirm your documents are genuine. Fraudulent applications result in permanent account suspension.
              </Text>
            </GlassView>
          </View>
        )}
      </ScrollView>

      {/* Footer CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {step < 3 ? (
          <Pressable
            onPress={() => setStep(s => s + 1)}
            disabled={
              (step === 0 && !canNext0) ||
              (step === 1 && !canNext1) ||
              (step === 2 && !canNext2)
            }
          >
            <LinearGradient
              colors={
                (step === 0 && !canNext0) || (step === 1 && !canNext1) || (step === 2 && !canNext2)
                  ? ['#555', '#444']
                  : [colors.goldDark, colors.gold]
              }
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.ctaBtn}
            >
              <Text style={styles.ctaBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={16} color="#0A0A0A" />
            </LinearGradient>
          </Pressable>
        ) : (
          <Pressable onPress={handleSubmit} disabled={submitting}>
            <LinearGradient
              colors={submitting ? ['#555', '#444'] : [colors.goldDark, colors.gold]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.ctaBtn}
            >
              {submitting
                ? <ActivityIndicator color="#0A0A0A" />
                : (<><Text style={styles.ctaBtnText}>Submit Application</Text><Ionicons name="checkmark" size={16} color="#0A0A0A" /></>)}
            </LinearGradient>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DocUploadCard({
  label, hint, icon, state, colors, onPress,
}: {
  label: string;
  hint: string;
  icon: string;
  state: UploadState;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1, marginTop: 24 }]}>
      <GlassView intensity={40} style={[styles.uploadCard, {
        borderColor: state.objectPath ? 'rgba(74,222,128,0.4)' : 'rgba(212,175,55,0.2)',
      }]}>
        {state.uri ? (
          <>
            <Image source={{ uri: state.uri }} style={styles.uploadPreview} resizeMode="cover" />
            {state.uploading && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color="#D4AF37" size="large" />
                <Text style={styles.uploadingText}>Uploading…</Text>
              </View>
            )}
            {!state.uploading && state.objectPath && (
              <View style={styles.uploadSuccessOverlay}>
                <View style={styles.uploadSuccessBadge}>
                  <Ionicons name="checkmark-circle" size={24} color="#4ADE80" />
                  <Text style={styles.uploadSuccessText}>Uploaded</Text>
                </View>
                <Text style={styles.uploadReplaceHint}>Tap to replace</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.uploadPlaceholder}>
            <View style={[styles.uploadIconWrap, { borderColor: 'rgba(212,175,55,0.25)' }]}>
              <Ionicons name={icon as any} size={36} color={colors.gold} />
            </View>
            <Text style={[styles.uploadLabel, { color: colors.foreground }]}>{label}</Text>
            <Text style={[styles.uploadHint, { color: colors.mutedForeground }]}>{hint}</Text>
            <View style={[styles.uploadActionBtn, { borderColor: 'rgba(212,175,55,0.35)' }]}>
              <Ionicons name="camera-outline" size={14} color={colors.gold} />
              <Text style={[styles.uploadActionText, { color: colors.gold }]}>Choose Photo</Text>
            </View>
          </View>
        )}
      </GlassView>
    </Pressable>
  );
}

function ReviewRow({ label, value, valueColor, colors }: {
  label: string;
  value: string;
  valueColor?: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.reviewRow}>
      <Text style={[styles.reviewLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.reviewValue, { color: valueColor ?? colors.foreground }]}>{value}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bgWatermark: {
    position: 'absolute', width: 340, height: 340, top: 0, right: -80, opacity: 0.045, zIndex: 0,
  },
  // Login gate
  loginWrap: { flex: 1, paddingHorizontal: 24, gap: 24 },
  loginBack: { marginBottom: 8 },
  loginHeader: { alignItems: 'center', gap: 12 },
  loginTitle: { fontSize: 28, fontFamily: 'PlayfairDisplay_700Bold', textAlign: 'center' },
  loginSub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
  loginCard: {
    borderRadius: 20, overflow: 'hidden', borderWidth: 1, padding: 20,
  },
  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  stepLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  progressTrack: { height: 2, marginHorizontal: 16, borderRadius: 1 },
  progressFill: { height: 2, borderRadius: 1 },
  // Content
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 28 },
  stepWrap: { gap: 0 },
  stepTitle: { fontSize: 28, fontFamily: 'PlayfairDisplay_700Bold', marginBottom: 8 },
  stepDesc: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 22, marginBottom: 28 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 4, marginTop: 12 },
  inputWrap: {
    borderRadius: 14, overflow: 'hidden', borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 50,
  },
  input: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  picker: {
    borderRadius: 14, overflow: 'hidden', borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.15)', marginTop: 4,
  },
  pickerItem: { paddingHorizontal: 16, paddingVertical: 12 },
  pickerItemText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  // Upload
  uploadCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, minHeight: 220 },
  uploadPreview: { width: '100%', height: 260, borderRadius: 20 },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  uploadingText: { color: '#D4AF37', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  uploadSuccessOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  uploadSuccessBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadSuccessText: { color: '#4ADE80', fontFamily: 'Inter_700Bold', fontSize: 16 },
  uploadReplaceHint: { color: 'rgba(255,255,255,0.55)', fontFamily: 'Inter_400Regular', fontSize: 12 },
  uploadPlaceholder: { padding: 32, alignItems: 'center', gap: 10 },
  uploadIconWrap: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  uploadLabel: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  uploadHint: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
  uploadActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginTop: 8,
  },
  uploadActionText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  // Review
  reviewCard: {
    borderRadius: 20, overflow: 'hidden', borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.15)', padding: 4, marginBottom: 16,
  },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  reviewLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  reviewValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold', maxWidth: '60%', textAlign: 'right' },
  reviewDivider: { height: 1, marginHorizontal: 16 },
  disclaimerBox: {
    borderRadius: 14, overflow: 'hidden', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)', padding: 14,
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
  },
  disclaimerText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  // Footer
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  ctaBtn: {
    borderRadius: 16, height: 52, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  ctaBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },
  // Success
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  successGlow: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150, top: '20%', alignSelf: 'center',
  },
  successTitle: { fontSize: 32, fontFamily: 'PlayfairDisplay_700Bold', textAlign: 'center' },
  successSub: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 24, marginBottom: 16 },
  successBtn: { borderRadius: 16, width: '100%', marginTop: 8 },
  successBtnInner: { height: 52, alignItems: 'center', justifyContent: 'center' },
  successBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },
});
