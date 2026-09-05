import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlassView from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@workspace/convex-backend/convex/_generated/api';
import type { Id } from '@workspace/convex-backend/convex/_generated/dataModel';

type EditableDrop = {
  id: string;
  title: string;
  description: string;
  price: number;
  inventory: number;
  minOrders: number;
  pickupLocation: string;
  expiresAt: string;
  currentOrders: number;
};

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'numeric';
  multiline?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          multiline && styles.multiline,
          { color: colors.foreground, borderColor: 'rgba(212,175,55,0.18)' },
        ]}
        placeholderTextColor="rgba(255,255,255,0.25)"
      />
    </View>
  );
}

export default function EditDropScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { token } = useAuth();
  const rawDrop = useQuery(api.drops.get, id ? { dropId: id as Id<'drops'> } : 'skip');
  const updateDrop = useMutation(api.drops.update);
  const drop = rawDrop as EditableDrop | null | undefined;
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<EditableDrop | null>(null);
  const formDrop = draft ?? (drop ? {
    id: drop.id,
    title: drop.title,
    description: drop.description,
    price: drop.price,
    inventory: drop.inventory,
    minOrders: drop.minOrders,
    pickupLocation: drop.pickupLocation,
    expiresAt: new Date(drop.expiresAt).toISOString().slice(0, 16),
    currentOrders: drop.currentOrders,
  } : null);

  const setField = <K extends keyof EditableDrop>(key: K, value: EditableDrop[K]) => {
    setDraft((current) => ({ ...(current ?? formDrop!), [key]: value }));
  };

  const save = async () => {
    if (!formDrop || saving || !token) return;
    const priceValue = Number(formDrop.price);
    const inventoryValue = Number.parseInt(String(formDrop.inventory), 10);
    const minOrdersValue = Number.parseInt(String(formDrop.minOrders), 10);
    if (!formDrop.title.trim() || !formDrop.description.trim() || !formDrop.pickupLocation.trim()) {
      Alert.alert('Missing details', 'Title, description, and pickup location are required.');
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      Alert.alert('Invalid price', 'Enter a price greater than zero.');
      return;
    }
    if (!Number.isInteger(inventoryValue) || inventoryValue < formDrop.currentOrders) {
      Alert.alert('Invalid plate limit', `The limit cannot be below ${formDrop.currentOrders} existing orders.`);
      return;
    }
    if (!Number.isInteger(minOrdersValue) || minOrdersValue < 1 || minOrdersValue > inventoryValue) {
      Alert.alert('Invalid minimum', 'Minimum orders must be between 1 and the plate limit.');
      return;
    }
    const expiryIso = new Date(formDrop.expiresAt).toISOString();
    if (new Date(expiryIso).getTime() <= Date.now()) {
      Alert.alert('Invalid expiry', 'The drop expiry must be in the future.');
      return;
    }

    setSaving(true);
    try {
      await updateDrop({
        sessionToken: token,
        dropId: formDrop.id as Id<'drops'>,
        title: formDrop.title.trim(),
        description: formDrop.description.trim(),
        price: priceValue,
        inventory: inventoryValue,
        minOrders: minOrdersValue,
        pickupLocation: formDrop.pickupLocation.trim(),
        expiresAt: new Date(expiryIso).getTime(),
      });
      Alert.alert('Drop updated', 'Your live drop has been updated.', [
        { text: 'Done', onPress: () => router.replace('/my-drops') },
      ]);
    } catch (error: any) {
      Alert.alert('Could not save', error?.data?.message ?? error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (rawDrop === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  if (!formDrop) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.mutedForeground} />
        <Text style={[styles.error, { color: colors.mutedForeground }]}>Drop not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backText, { color: colors.gold }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable onPress={() => router.back()} style={[styles.backButton, { top: insets.top + 12 }]}>
        <GlassView intensity={60} style={styles.backButtonInner}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </GlassView>
      </Pressable>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 72, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.titleText, { color: colors.foreground }]}>Edit Drop</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Changes apply to this live drop immediately.
        </Text>
        <GlassView intensity={30} style={styles.card}>
          <Field label="Title" value={formDrop.title} onChangeText={(value) => setField('title', value)} />
          <Field label="Description" value={formDrop.description} onChangeText={(value) => setField('description', value)} multiline />
          <View style={styles.row}>
            <View style={styles.half}><Field label="Price (TTD)" value={String(formDrop.price)} onChangeText={(value) => setField('price', Number(value))} keyboardType="numeric" /></View>
            <View style={styles.half}><Field label="Plate limit" value={String(formDrop.inventory)} onChangeText={(value) => setField('inventory', Number.parseInt(value, 10) || 0)} keyboardType="numeric" /></View>
          </View>
          <View style={styles.row}>
            <View style={styles.half}><Field label="Minimum orders" value={String(formDrop.minOrders)} onChangeText={(value) => setField('minOrders', Number.parseInt(value, 10) || 0)} keyboardType="numeric" /></View>
            <View style={styles.half}><Field label="Expiry (local time)" value={formDrop.expiresAt} onChangeText={(value) => setField('expiresAt', value)} /></View>
          </View>
          <Field label="Pickup location" value={formDrop.pickupLocation} onChangeText={(value) => setField('pickupLocation', value)} />
          <Pressable onPress={save} disabled={saving} style={{ opacity: saving ? 0.7 : 1 }}>
            <LinearGradient colors={['#F5D060', '#D4AF37', '#9E8028']} style={styles.saveButton}>
              {saving ? <ActivityIndicator color="#0A0A0A" /> : <><Ionicons name="checkmark" size={19} color="#0A0A0A" /><Text style={styles.saveText}>Save Changes</Text></>}
            </LinearGradient>
          </Pressable>
        </GlassView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  error: { fontSize: 15, textAlign: 'center' },
  backText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  backButton: { position: 'absolute', left: 16, zIndex: 10 },
  backButtonInner: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  titleText: { paddingHorizontal: 16, fontSize: 32, fontFamily: 'PlayfairDisplay_700Bold' },
  subtitle: { paddingHorizontal: 16, marginTop: 6, marginBottom: 22, fontSize: 13, lineHeight: 19 },
  card: { marginHorizontal: 16, borderRadius: 20, padding: 16, gap: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  field: { marginBottom: 14 },
  label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, fontFamily: 'Inter_400Regular' },
  multiline: { minHeight: 92, paddingTop: 12 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, paddingVertical: 14, marginTop: 6 },
  saveText: { color: '#0A0A0A', fontSize: 14, fontFamily: 'Inter_700Bold' },
});