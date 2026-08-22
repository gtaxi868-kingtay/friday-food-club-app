/**
 * Create Drop — Chef drop creation form with AI marketing assistant
 *
 * Fetches the chef's real chefId from /chefs/me/status, then presents
 * the full drop creation form. "Generate with AI" calls POST /ai/marketing
 * and auto-fills the title, description, and tags fields.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useAction, useQuery } from 'convex/react';
import { api } from '@workspace/convex-backend/convex/_generated/api';
import type { Id } from '@workspace/convex-backend/convex/_generated/dataModel';
import GlassView from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';

// ── Upload helper (shared pattern with apply-chef.tsx) ────────────────────────
async function uploadImage(
  uri: string,
  fileName: string,
  mimeType: string,
  sessionToken: string,
  generateUploadUrl: (args: { sessionToken: string }) => Promise<string>,
  finalize: (args: { sessionToken: string; storageId: Id<'_storage'>; fileName: string; contentType: string; size: number }) => Promise<{ uploadId: Id<'uploads'>; url: string | null }>,
): Promise<Id<'uploads'>> {
  const fileRes = await fetch(uri);
  const blob = await fileRes.blob();
  const size = blob.size;

  const postUrl = await generateUploadUrl({ sessionToken });
  const putRes = await fetch(postUrl, {
    method: 'POST',
    headers: { 'Content-Type': mimeType },
    body: blob,
  });
  if (!putRes.ok) throw new Error('Storage upload failed — please try again');
  const { storageId } = (await putRes.json()) as { storageId: Id<'_storage'> };

  const { uploadId } = await finalize({ sessionToken, storageId, fileName, contentType: mimeType, size });
  return uploadId;
}

const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Dinner'] as const;
type MealSlot = (typeof MEAL_SLOTS)[number];

const AI_TONES = [
  { value: 'luxury', label: 'Luxury', icon: 'diamond-outline' },
  { value: 'street', label: 'Street', icon: 'flame-outline' },
  { value: 'playful', label: 'Playful', icon: 'happy-outline' },
] as const;
type AiTone = 'luxury' | 'street' | 'playful';

interface AiResult {
  title?: string;
  caption?: string;
  adCopy?: string;
  hashtags?: string[];
}

function SectionLabel({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{label}</Text>
    </View>
  );
}

function Field({
  label, value, onChangeText, placeholder, keyboardType, multiline, hint,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: 'numeric' | 'default'; multiline?: boolean; hint?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          { color: colors.foreground, borderColor: 'rgba(212,175,55,0.18)' },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.25)"
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        textAlignVertical={multiline ? 'top' : 'center'}
        autoCapitalize="sentences"
      />
      {hint && (
        <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>{hint}</Text>
      )}
    </View>
  );
}

export default function CreateDropScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { user, token } = useAuth();
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl);
  const finalizeUpload = useMutation(api.uploads.finalize);
  const createDropMutation = useMutation(api.drops.create);
  const marketingAction = useAction(api.ai.marketing);

  // ── Chef identity ────────────────────────────────────────────────────────
  const status = useQuery(api.chefs.myStatus, token ? { sessionToken: token } : 'skip');
  const chefId = status?.chefId ?? null;
  const loadingChef = !!token && status === undefined;

  // ── Drop fields ──────────────────────────────────────────────────────────
  const [title, setTitle]           = useState('');
  const [description, setDesc]      = useState('');
  const [mealSlot, setMealSlot]     = useState<MealSlot>('Dinner');
  const [price, setPrice]           = useState('');
  const [inventory, setInventory]   = useState('');
  const [minOrders, setMinOrders]   = useState('');
  const [pickupLoc, setPickupLoc]   = useState('');
  const [hoursOpen, setHoursOpen]   = useState('6');   // how many hours until expiry
  const [imageIndex, setImageIndex] = useState<1 | 2 | 3>(1);
  const [tags, setTags]             = useState('');    // comma-separated

  // ── Secret drop toggle ───────────────────────────────────────────────────
  const [isSecretDrop, setIsSecretDrop] = useState(false);

  // ── Photo upload ──────────────────────────────────────────────────────────
  const [photoUri, setPhotoUri]         = useState<string | null>(null);  // local preview
  const [photoUploadId, setPhotoUploadId] = useState<Id<'uploads'> | null>(null);
  const [photoUploading, setPhotoUpload] = useState(false);

  const handlePickPhoto = async () => {
    const { status: permStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permStatus !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to upload a food photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const uri      = asset.uri;
    const fileName = asset.fileName ?? `drop-photo-${Date.now()}.jpg`;
    const mimeType = asset.mimeType ?? 'image/jpeg';

    setPhotoUri(uri);
    setPhotoUploadId(null);
    setPhotoUpload(true);
    try {
      const uploadId = await uploadImage(uri, fileName, mimeType, token!, generateUploadUrl, finalizeUpload);
      setPhotoUploadId(uploadId);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message ?? 'Could not upload photo — try again.');
      setPhotoUri(null);
    } finally {
      setPhotoUpload(false);
    }
  };

  // ── AI assistant ─────────────────────────────────────────────────────────
  const [aiNotes, setAiNotes]     = useState('');
  const [aiTone, setAiTone]       = useState<AiTone>('luxury');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult]   = useState<AiResult | null>(null);
  const [aiError, setAiError]     = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!aiNotes.trim()) {
      setAiError('Add some notes about your dish first');
      return;
    }
    if (!token) { setAiError('Not signed in'); return; }
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await marketingAction({
        sessionToken: token, rawDescription: aiNotes, tone: aiTone,
        dishName: title || aiNotes, isSecret: isSecretDrop,
      });
      setAiResult({
        title: result.suggestedTitle, adCopy: result.adCopy,
        caption: result.caption, hashtags: result.hashtags,
      });
    } catch (err: any) {
      setAiError(err?.data?.message ?? err?.message ?? 'AI generation failed');
    } finally {
      setAiLoading(false);
    }
  }, [aiNotes, aiTone, title, token, isSecretDrop, marketingAction]);

  const applyAiResult = () => {
    if (!aiResult) return;
    if (aiResult.title)      setTitle(aiResult.title);
    if (aiResult.adCopy)     setDesc(aiResult.adCopy);
    else if (aiResult.caption) setDesc(aiResult.caption);
    if (aiResult.hashtags?.length) {
      setTags(aiResult.hashtags.map((h: string) => h.replace(/^#/, '')).join(', '));
    }
    setAiResult(null);
    setAiNotes('');
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!chefId || !token) { Alert.alert('Not a chef', 'Your chef profile is not linked.'); return; }

    const priceNum    = parseFloat(price);
    const invNum      = parseInt(inventory, 10);
    const minNum      = parseInt(minOrders, 10);
    const hoursNum    = parseInt(hoursOpen, 10);

    if (!title.trim())         { Alert.alert('Missing', 'Enter a drop title.'); return; }
    if (!description.trim())   { Alert.alert('Missing', 'Enter a description.'); return; }
    if (isNaN(priceNum) || priceNum <= 0) { Alert.alert('Invalid', 'Enter a valid price.'); return; }
    if (isNaN(invNum)  || invNum < 1)     { Alert.alert('Invalid', 'Enter a valid plate limit (≥ 1).'); return; }
    if (isNaN(minNum)  || minNum < 1)     { Alert.alert('Invalid', 'Enter a valid minimum orders (≥ 1).'); return; }
    if (minNum > invNum) { Alert.alert('Invalid', 'Minimum orders cannot exceed plate limit.'); return; }
    if (!pickupLoc.trim()) { Alert.alert('Missing', 'Enter a pickup location.'); return; }
    if (isNaN(hoursNum) || hoursNum < 1)  { Alert.alert('Invalid', 'Drop must be open for at least 1 hour.'); return; }

    const expiresAt = Date.now() + hoursNum * 3_600_000;
    const tagsArr   = tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 5);

    setSubmitting(true);
    try {
      const drop = await createDropMutation({
        sessionToken: token, chefId: chefId as Id<'chefs'>, title, description,
        mealSlot, price: priceNum, inventory: invNum, minOrders: minNum,
        pickupLocation: pickupLoc, expiresAt,
        imageIndex, imageUploadId: photoUploadId ?? undefined, tags: tagsArr,
        isSecret: isSecretDrop,
      });
      Alert.alert('Drop live! 🔥', `"${drop?.title}" is now active. Plates: ${drop?.inventory}`, [
        { text: 'Back to Studio', onPress: () => router.replace('/(tabs)/studio') },
      ]);
    } catch (err: any) {
      if (err?.data?.code === 'WALLET_FROZEN') {
        // Wallet fell below the freeze threshold since this screen was opened.
        // Send the chef back to Studio, which re-fetches wallet state on focus
        // and shows the frozen banner with the Create Drop button disabled.
        Alert.alert(
          'Wallet Frozen',
          err.data.message ?? 'Your wallet is frozen. Settle your cash fees before posting new drops.',
          [{ text: 'Back to Studio', onPress: () => router.replace('/(tabs)/studio') }],
        );
        return;
      }
      Alert.alert('Error', err?.data?.message ?? err?.message ?? 'Failed to create drop');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loadingChef) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  if (!user || !chefId) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 12 }]}>
          <GlassView intensity={60} style={styles.backBtnInner}>
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </GlassView>
        </Pressable>
        <View style={[styles.centered, { paddingTop: insets.top + 80 }]}>
          <Ionicons name="person-outline" size={44} color={colors.mutedForeground} />
          <Text style={[styles.gateTitle, { color: colors.foreground }]}>Chef account required</Text>
          <Text style={[styles.gateSub, { color: colors.mutedForeground }]}>
            Sign in as a verified chef to post drops.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Back */}
      <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 12 }]}>
        <GlassView intensity={60} style={styles.backBtnInner}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </GlassView>
      </Pressable>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 72, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>New Drop</Text>

        {/* ── AI Marketing Assistant ─────────────────────────────────── */}
        <SectionLabel label="AI Marketing Assistant" />
        <GlassView intensity={30} style={styles.aiCard}>
          <LinearGradient
            colors={['rgba(212,175,55,0.05)', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.aiCardBorder} />

          <TextInput
            style={[styles.input, styles.inputMultiline, { color: colors.foreground, borderColor: 'rgba(212,175,55,0.18)', marginBottom: 12 }]}
            value={aiNotes}
            onChangeText={setAiNotes}
            placeholder="Describe your dish in your own words — Chef Marcus might write: 'slow-cooked oxtail, Sunday vibes, rich gravy, rice and peas…'"
            placeholderTextColor="rgba(255,255,255,0.25)"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Tone selector */}
          <View style={styles.toneRow}>
            {AI_TONES.map(t => (
              <Pressable
                key={t.value}
                onPress={() => setAiTone(t.value)}
                style={[
                  styles.toneBtn,
                  aiTone === t.value && styles.toneBtnActive,
                ]}
              >
                <Ionicons
                  name={t.icon as any}
                  size={14}
                  color={aiTone === t.value ? '#D4AF37' : colors.mutedForeground}
                />
                <Text style={[
                  styles.toneBtnText,
                  { color: aiTone === t.value ? '#D4AF37' : colors.mutedForeground },
                ]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {aiError && (
            <Text style={styles.aiError}>{aiError}</Text>
          )}

          {/* AI result */}
          {aiResult && (
            <View style={styles.aiResult}>
              {aiResult.title && (
                <View style={styles.aiResultItem}>
                  <Text style={[styles.aiResultLabel, { color: colors.gold }]}>TITLE</Text>
                  <Text style={[styles.aiResultText, { color: colors.foreground }]}>{aiResult.title}</Text>
                </View>
              )}
              {(aiResult.adCopy || aiResult.caption) && (
                <View style={styles.aiResultItem}>
                  <Text style={[styles.aiResultLabel, { color: colors.gold }]}>COPY</Text>
                  <Text style={[styles.aiResultText, { color: colors.foreground }]}>
                    {aiResult.adCopy ?? aiResult.caption}
                  </Text>
                </View>
              )}
              {aiResult.hashtags?.length ? (
                <View style={styles.aiResultItem}>
                  <Text style={[styles.aiResultLabel, { color: colors.gold }]}>HASHTAGS</Text>
                  <Text style={[styles.aiResultText, { color: colors.mutedForeground }]}>
                    {aiResult.hashtags.join('  ')}
                  </Text>
                </View>
              ) : null}
              <Pressable onPress={applyAiResult} style={({ pressed }) => [styles.applyBtn, { opacity: pressed ? 0.8 : 1 }]}>
                <LinearGradient
                  colors={['#F5D060', '#D4AF37', '#9E8028']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.applyBtnGrad}
                >
                  <Ionicons name="checkmark" size={16} color="#0A0A0A" />
                  <Text style={styles.applyBtnText}>Apply to Form</Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}

          <Pressable
            onPress={handleGenerate}
            disabled={aiLoading}
            style={({ pressed }) => [{ opacity: pressed || aiLoading ? 0.8 : 1 }]}
          >
            <LinearGradient
              colors={aiLoading
                ? ['#2A2A2A', '#1A1A1A']
                : ['rgba(212,175,55,0.2)', 'rgba(212,175,55,0.1)']}
              style={styles.generateBtn}
            >
              {aiLoading ? (
                <ActivityIndicator color="#D4AF37" size="small" />
              ) : (
                <>
                  <MaterialCommunityIcons name="star-four-points" size={16} color="#D4AF37" />
                  <Text style={[styles.generateBtnText, { color: '#D4AF37' }]}>
                    Generate with AI
                  </Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </GlassView>

        {/* ── Drop Details ─────────────────────────────────────────── */}
        <SectionLabel label="Drop Details" />

        <Field label="Title *" value={title} onChangeText={setTitle}
          placeholder="Sunday Oxtail & Rice" />
        <Field label="Description *" value={description} onChangeText={setDesc}
          placeholder="Slow-braised for 6 hours in a rich Creole gravy…" multiline />

        {/* Meal Slot */}
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Meal Slot *</Text>
          <View style={styles.slotRow}>
            {MEAL_SLOTS.map(slot => (
              <Pressable
                key={slot}
                onPress={() => setMealSlot(slot)}
                style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1, flex: 1 }]}
              >
                {mealSlot === slot ? (
                  <LinearGradient
                    colors={['#F5D060', '#D4AF37', '#9E8028']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.slotBtnActive}
                  >
                    <Text style={styles.slotTextActive}>{slot}</Text>
                  </LinearGradient>
                ) : (
                  <GlassView intensity={25} style={styles.slotBtnInactive}>
                    <Text style={[styles.slotTextInactive, { color: colors.mutedForeground }]}>{slot}</Text>
                  </GlassView>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Field label="Price (TTD) *" value={price} onChangeText={setPrice}
              placeholder="120" keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Plate Limit *" value={inventory} onChangeText={setInventory}
              placeholder="20" keyboardType="numeric" />
          </View>
        </View>

        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Field label="Min Orders *" value={minOrders} onChangeText={setMinOrders}
              placeholder="8" keyboardType="numeric"
              hint="Unlock threshold — must be ≤ plate limit" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Open for (hours) *" value={hoursOpen} onChangeText={setHoursOpen}
              placeholder="6" keyboardType="numeric" />
          </View>
        </View>

        <Field label="Pickup Location *" value={pickupLoc} onChangeText={setPickupLoc}
          placeholder="34 Queen St, Port of Spain" />
        <Field label="Tags" value={tags} onChangeText={setTags}
          placeholder="oxtail, sunday, trinidadian, comfort food"
          hint="Comma-separated — up to 5 tags" />

        {/* Drop Photo */}
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Drop Photo</Text>

          {/* Upload button / status */}
          <Pressable
            onPress={handlePickPhoto}
            disabled={photoUploading}
            style={({ pressed }) => [{ opacity: pressed || photoUploading ? 0.75 : 1 }]}
          >
            <GlassView intensity={25} style={[
              styles.photoPickerBtn,
              photoUploadId ? { borderColor: 'rgba(74,222,128,0.4)' } : { borderColor: 'rgba(212,175,55,0.2)' },
            ]}>
              {photoUploading ? (
                <>
                  <ActivityIndicator color="#D4AF37" size="small" />
                  <Text style={[styles.photoPickerText, { color: colors.mutedForeground }]}>Uploading…</Text>
                </>
              ) : photoUploadId ? (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#4ADE80" />
                  <Text style={[styles.photoPickerText, { color: '#4ADE80' }]}>Photo uploaded — tap to change</Text>
                </>
              ) : (
                <>
                  <Ionicons name="camera-outline" size={20} color="#D4AF37" />
                  <Text style={[styles.photoPickerText, { color: colors.mutedForeground }]}>
                    {photoUri ? 'Uploading…' : 'Choose from camera roll'}
                  </Text>
                </>
              )}
            </GlassView>
          </Pressable>

          {/* Preview thumbnail */}
          {photoUri && (
            <View style={styles.photoPreviewWrap}>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
              {!photoUploadId && !photoUploading && (
                <View style={styles.photoPreviewError}>
                  <Text style={styles.photoPreviewErrorText}>Upload failed — tap above to retry</Text>
                </View>
              )}
            </View>
          )}

          {/* Fallback image selector — shown when no photo is uploaded */}
          {!photoUploadId && (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.fieldHint, { color: colors.mutedForeground, marginBottom: 8 }]}>
                Or pick a stock image (used when no photo is uploaded):
              </Text>
              <View style={styles.slotRow}>
                {([1, 2, 3] as const).map(idx => (
                  <Pressable key={idx} onPress={() => setImageIndex(idx)}
                    style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1, flex: 1 }]}>
                    {imageIndex === idx ? (
                      <LinearGradient colors={['#F5D060', '#D4AF37', '#9E8028']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.slotBtnActive}>
                        <Text style={styles.slotTextActive}>Image {idx}</Text>
                      </LinearGradient>
                    ) : (
                      <GlassView intensity={25} style={styles.slotBtnInactive}>
                        <Text style={[styles.slotTextInactive, { color: colors.mutedForeground }]}>Image {idx}</Text>
                      </GlassView>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* ── Secret Drop Toggle ─────────────────────────────────── */}
        <SectionLabel label="Drop Type" />
        <Pressable
          onPress={() => setIsSecretDrop(v => !v)}
          style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1, marginBottom: 24 }]}
        >
          <GlassView intensity={25} style={[
            styles.secretToggle,
            isSecretDrop && { borderColor: 'rgba(212,175,55,0.5)', backgroundColor: 'rgba(212,175,55,0.07)' },
          ]}>
            <LinearGradient
              colors={isSecretDrop ? ['#9E8028', '#D4AF37'] : ['#2A2A2A', '#1A1A1A']}
              style={styles.secretToggleIcon}
            >
              <MaterialCommunityIcons
                name={isSecretDrop ? 'lock' : 'lock-open-variant'}
                size={18}
                color={isSecretDrop ? '#0A0A0A' : 'rgba(255,255,255,0.4)'}
              />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.secretToggleTitle, { color: isSecretDrop ? colors.gold : colors.foreground }]}>
                {isSecretDrop ? 'Secret Drop — Friday Only' : 'Regular Drop'}
              </Text>
              <Text style={[styles.secretToggleSub, { color: colors.mutedForeground }]}>
                {isSecretDrop
                  ? 'Only orderable on Fridays. AI will write mystery copy. Members-only.'
                  : 'Tap to make this a Friday-exclusive secret drop.'}
              </Text>
            </View>
            <View style={[
              styles.secretToggleCheckbox,
              { borderColor: isSecretDrop ? colors.gold : 'rgba(255,255,255,0.15)' },
              isSecretDrop && { backgroundColor: 'rgba(212,175,55,0.2)' },
            ]}>
              {isSecretDrop && <Ionicons name="checkmark" size={14} color={colors.gold} />}
            </View>
          </GlassView>
        </Pressable>

        {/* Submit */}
        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [{ opacity: pressed || submitting ? 0.85 : 1, marginTop: 8 }]}
        >
          <LinearGradient
            colors={['#F5D060', '#D4AF37', '#B8961E', '#9E8028']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.submitBtn}
          >
            {submitting ? (
              <ActivityIndicator color="#0A0A0A" size="small" />
            ) : (
              <>
                <Ionicons name="flash" size={20} color="#0A0A0A" />
                <Text style={styles.submitBtnText}>Launch Drop</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  backBtn: { position: 'absolute', left: 16, zIndex: 100 },
  backBtnInner: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  content: { paddingHorizontal: 16 },
  pageTitle: { fontSize: 32, fontFamily: 'PlayfairDisplay_700Bold', marginBottom: 20 },
  centered: { flex: 1, alignItems: 'center', paddingHorizontal: 40, gap: 12 },
  gateTitle: { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  gateSub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, marginTop: 8 },
  sectionDot: { width: 4, height: 4, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  // AI Card
  aiCard: {
    borderRadius: 20, overflow: 'hidden', padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(212,175,55,0.18)',
  },
  aiCardBorder: { ...StyleSheet.absoluteFillObject, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(212,175,55,0.18)' },
  toneRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  toneBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  toneBtnActive: { backgroundColor: 'rgba(212,175,55,0.12)', borderColor: 'rgba(212,175,55,0.3)' },
  toneBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  aiError: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#FF6B6B', marginBottom: 10 },
  aiResult: {
    backgroundColor: 'rgba(212,175,55,0.05)', borderRadius: 12,
    padding: 12, marginBottom: 12, gap: 10,
    borderWidth: 1, borderColor: 'rgba(212,175,55,0.15)',
  },
  aiResultItem: { gap: 4 },
  aiResultLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  aiResultText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  applyBtn: { marginTop: 8 },
  applyBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 10, borderRadius: 12,
  },
  applyBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(212,175,55,0.25)',
  },
  generateBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  // Fields
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 8 },
  fieldHint: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: 'Inter_400Regular',
  },
  inputMultiline: { minHeight: 90, paddingTop: 12 },
  rowFields: { flexDirection: 'row', gap: 12 },
  slotRow: { flexDirection: 'row', gap: 8 },
  slotBtnActive: { paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  slotTextActive: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },
  slotBtnInactive: {
    paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  slotTextInactive: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  // Photo picker
  photoPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12,
    overflow: 'hidden', borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  photoPickerText: { fontSize: 14, fontFamily: 'Inter_500Medium', flex: 1 },
  photoPreviewWrap: {
    marginTop: 10, borderRadius: 12, overflow: 'hidden',
    height: 160,
  },
  photoPreview: { width: '100%', height: '100%' },
  photoPreviewError: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoPreviewErrorText: {
    color: '#FF6B6B', fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'center',
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 18, borderRadius: 18,
  },
  submitBtnText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },
  // Secret drop toggle
  secretToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  secretToggleIcon: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  secretToggleTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  secretToggleSub: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  secretToggleCheckbox: {
    width: 24, height: 24, borderRadius: 8, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
});
