/**
 * Sign In / Sign Up — buyer account screen
 *
 * The app previously had no standalone auth screen at all: AuthContext's
 * login()/register() were only ever invoked from inside the chef-application
 * flow, so a plain buyer had no way to sign into (or create) an account —
 * everyone stayed on the anonymous guest-checkout path. This gives buyers a
 * real entry point, reachable from the Profile tab.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import GlassView from '@/components/GlassView';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';

// Required once at module scope so the OAuth browser redirect resolves
// back into the app instead of leaving the user stranded in the browser.
WebBrowser.maybeCompleteAuthSession();

const LOGO_GOLD = require('@/assets/images/logo-gold-transparent.png');

const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_SIGNIN_CONFIGURED = !!(GOOGLE_IOS_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID);

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, register, loginWithGoogleIdToken, loginWithAppleIdToken } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const [, googleResponse, promptGoogleSignIn] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    const idToken = googleResponse.params.id_token;
    if (!idToken) return;
    setLoading(true);
    loginWithGoogleIdToken(idToken)
      .then(() => router.back())
      .catch((err: any) => Alert.alert('Google Sign-In Failed', err?.data?.message ?? err?.message ?? 'Please try again.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('Apple did not return a sign-in token');
      setLoading(true);
      await loginWithAppleIdToken(credential.identityToken);
      router.back();
    } catch (err: any) {
      if (err?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple Sign-In Failed', err?.data?.message ?? err?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }
    if (mode === 'signup' && name.trim().length < 2) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signin') {
        await login(email.trim().toLowerCase(), password);
      } else {
        await register(name.trim(), email.trim().toLowerCase(), password);
      }
      router.back();
    } catch (err: any) {
      Alert.alert(
        mode === 'signin' ? 'Sign In Failed' : 'Sign Up Failed',
        err?.data?.message ?? err?.message ?? 'Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Image source={LOGO_GOLD} style={styles.bgWatermark} resizeMode="contain" />
      <View style={[styles.wrap, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </Pressable>

        <View style={styles.header}>
          <MaterialCommunityIcons name="crown-outline" size={48} color={colors.gold} />
          <Text style={[styles.title, { color: colors.foreground }]}>
            {mode === 'signin' ? 'Welcome Back' : 'Join the Club'}
          </Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            {mode === 'signin'
              ? 'Sign in to sync your orders, wallet, and Club Pass across devices.'
              : 'Create an account to save your orders and wallet balance.'}
          </Text>
        </View>

        {(GOOGLE_SIGNIN_CONFIGURED || appleAvailable) && (
          <View style={styles.socialWrap}>
            {GOOGLE_SIGNIN_CONFIGURED && (
              <Pressable
                style={({ pressed }) => [styles.socialBtn, { opacity: pressed || loading ? 0.7 : 1 }]}
                onPress={() => promptGoogleSignIn()}
                disabled={loading}
              >
                <Ionicons name="logo-google" size={18} color="#FFFFFF" />
                <Text style={styles.socialBtnText}>Continue with Google</Text>
              </Pressable>
            )}
            {appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={14}
                style={styles.appleBtn}
                onPress={handleAppleSignIn}
              />
            )}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
              <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or use email</Text>
              <View style={[styles.dividerLine, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
            </View>
          </View>
        )}

        <GlassView intensity={40} style={[styles.card, { borderColor: 'rgba(212,175,55,0.15)' }]}>
          {mode === 'signup' && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Name</Text>
              <GlassView intensity={25} style={styles.inputWrap}>
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="Your name"
                  placeholderTextColor={colors.mutedForeground}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </GlassView>
            </>
          )}

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: mode === 'signup' ? 14 : 0 }]}>Email</Text>
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
            onPress={handleSubmit}
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
                : <Text style={styles.ctaBtnText}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>}
            </LinearGradient>
          </Pressable>
        </GlassView>

        <Pressable
          onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          style={styles.switchModeBtn}
        >
          <Text style={[styles.switchModeText, { color: colors.mutedForeground }]}>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <Text style={{ color: colors.gold, fontFamily: 'Inter_700Bold' }}>
              {mode === 'signin' ? 'Sign Up' : 'Sign In'}
            </Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bgWatermark: {
    position: 'absolute', width: 340, height: 340, top: 0, right: -80, opacity: 0.045, zIndex: 0,
  },
  wrap: { flex: 1, paddingHorizontal: 24, gap: 24 },
  back: { marginBottom: 8 },
  header: { alignItems: 'center', gap: 12 },
  title: { fontSize: 28, fontFamily: 'PlayfairDisplay_700Bold', textAlign: 'center' },
  sub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
  card: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, padding: 20 },
  socialWrap: { gap: 12 },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    height: 50, borderRadius: 14, backgroundColor: '#1A1A1A',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  socialBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  appleBtn: { height: 50, width: '100%' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 8 },
  inputWrap: {
    borderRadius: 14, overflow: 'hidden', borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 50,
  },
  input: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  ctaBtn: {
    borderRadius: 16, height: 52, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  ctaBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },
  switchModeBtn: { alignItems: 'center', marginTop: -8 },
  switchModeText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
});
