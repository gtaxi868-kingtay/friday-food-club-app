import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import GlassView from '@/components/GlassView';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';

const LOGO_GOLD = require('@/assets/images/logo-gold-transparent.png');

const TIER_COLORS: { [key: string]: string[] } = {
  Bronze: ['#CD7F32', '#E8A060'],
  Silver: ['#9E9E9E', '#E0E0E0'],
  Gold: ['#9E8028', '#D4AF37', '#F5D060'],
  Platinum: ['#4A4A6A', '#8080C0', '#C0C0FF'],
};

const MENU_ITEMS = [
  { icon: 'notifications-outline', label: 'Drop Alerts', value: 'On' },
  { icon: 'location-outline', label: 'My Region', value: 'Port of Spain' },
  { icon: 'share-social-outline', label: 'Share Profile', value: null },
  { icon: 'shield-checkmark-outline', label: 'Privacy & Security', value: null },
  { icon: 'help-circle-outline', label: 'Help & Support', value: null },
  { icon: 'document-text-outline', label: 'Terms & Club Rules', value: null },
] as const;

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, orders } = useApp();
  const { hasClubPass, clubPassExpiry } = useAuth();

  const tierGradient = TIER_COLORS[profile.tier] ?? TIER_COLORS['Gold'];
  const totalSpent = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((s, o) => s + o.price, 0);

  const initials = profile.name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

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
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Profile</Text>
          <Pressable>
            <GlassView intensity={40} style={styles.settingsBtn}>
              <Ionicons name="settings-outline" size={18} color={colors.gold} />
            </GlassView>
          </Pressable>
        </View>

        {/* User card */}
        <GlassView intensity={50} style={styles.userCard}>
          <LinearGradient
            colors={['rgba(212,175,55,0.06)', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[colors.goldDark, colors.gold, colors.goldLight, colors.gold, colors.goldDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cardTopBorder}
          />

          <View style={styles.userCardInner}>
            <LinearGradient colors={tierGradient as [string, string, ...string[]]} style={styles.avatarRing}>
              <View style={[styles.avatarInner, { backgroundColor: '#0D0D0D' }]}>
                <Text style={[styles.avatarText, { color: colors.gold }]}>{initials}</Text>
              </View>
            </LinearGradient>

            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: colors.foreground }]}>{profile.name}</Text>
              <Text style={[styles.userHandle, { color: colors.mutedForeground }]}>
                {profile.handle}
              </Text>
              <LinearGradient
                colors={tierGradient as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.tierBadge}
              >
                <Ionicons name="trophy" size={10} color="#0A0A0A" />
                <Text style={styles.tierText}>{profile.tier.toUpperCase()} MEMBER</Text>
              </LinearGradient>
            </View>
          </View>

          <View style={[styles.statsRow, { borderTopColor: 'rgba(212,175,55,0.12)' }]}>
            {[
              { label: 'Orders', value: profile.ordersCount },
              { label: 'Points', value: profile.points.toLocaleString() },
              { label: 'Chefs', value: profile.chefsFollowed },
              { label: 'Spent', value: `$${totalSpent}` },
            ].map((stat, i) => (
              <React.Fragment key={stat.label}>
                {i > 0 && (
                  <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.07)' }]} />
                )}
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: colors.gold }]}>{stat.value}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </GlassView>

        {/* Club Pass */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Club Pass</Text>
        </View>

        <View style={styles.clubPassWrap}>
          <LinearGradient
            colors={['#1A1200', '#0D0D0D', '#1A1200']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.clubPassCard}
          >
            <LinearGradient
              colors={['rgba(212,175,55,0.08)', 'transparent']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.clubPassTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.clubPassTitle}>CLUB PASS</Text>
                <Text style={styles.clubPassSub}>
                  Member pricing on every drop, early access, and zero service fees
                </Text>
              </View>
              <MaterialCommunityIcons name="crown-outline" size={30} color="#D4AF37" />
            </View>
            <View style={styles.clubPassBottom}>
              <View>
                <Text style={styles.clubPassPrice}>$5<Text style={styles.clubPassPer}>/month</Text></Text>
                {hasClubPass && clubPassExpiry && (
                  <Text style={styles.clubPassExpiry}>
                    Renews {new Date(clubPassExpiry).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                )}
              </View>
              {hasClubPass ? (
                <View style={styles.clubPassBadge}>
                  <Ionicons name="checkmark-circle" size={13} color="#0A0A0A" />
                  <Text style={styles.clubPassBadgeText}>ACTIVE</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => router.push('/club-pass')}
                  style={styles.subscribeBtn}
                >
                  <Text style={styles.subscribeBtnText}>SUBSCRIBE</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.clubPassBorder} />
          </LinearGradient>
        </View>

        {/* NFC Membership Card */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Membership Card</Text>
        </View>

        <View style={styles.nfcCardWrap}>
          <LinearGradient
            colors={['#0D0D0D', '#161616', '#0A0A0A']}
            style={styles.nfcCard}
          >
            <Image source={LOGO_GOLD} style={styles.nfcLogoBackdrop} resizeMode="contain" />
            <LinearGradient
              colors={['transparent', 'rgba(212,175,55,0.04)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.nfcTop}>
              <View>
                <Text style={styles.nfcClub}>FRIDAY FOOD CLUB</Text>
                <Text style={styles.nfcTagline}>Good Food. Good People. Exclusive Access.</Text>
              </View>
              <MaterialCommunityIcons name="nfc-variant" size={28} color="rgba(212,175,55,0.6)" />
            </View>

            <Text style={styles.nfcMemberName}>{profile.name.toUpperCase()}</Text>

            <View style={styles.nfcBottom}>
              <View>
                <Text style={styles.nfcFieldLabel}>CARD ID</Text>
                <Text style={styles.nfcFieldValue}>{profile.nfcId}</Text>
              </View>
              <View>
                <Text style={styles.nfcFieldLabel}>MEMBER SINCE</Text>
                <Text style={styles.nfcFieldValue}>{profile.memberSince}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.nfcFieldLabel}>TIER</Text>
                <Text style={[styles.nfcTier, { color: colors.gold }]}>
                  {profile.tier.toUpperCase()}
                </Text>
              </View>
            </View>

            <LinearGradient
              colors={[colors.goldDark, colors.gold, colors.goldLight, colors.gold, colors.goldDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.goldStripe}
            />
            <View style={styles.nfcBorder} />
          </LinearGradient>
        </View>

        {/* Become a Chef */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Creator</Text>
        </View>

        <Pressable
          style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1, marginBottom: 28 }]}
          onPress={() => router.push('/apply-chef')}
        >
          <LinearGradient
            colors={['#1A1200', '#0D0D0D']}
            style={styles.chefCta}
          >
            <LinearGradient
              colors={['rgba(212,175,55,0.1)', 'transparent']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.chefCtaLeft}>
              <MaterialCommunityIcons name="chef-hat" size={28} color="#D4AF37" />
              <View>
                <Text style={styles.chefCtaTitle}>Become a Chef</Text>
                <Text style={[styles.chefCtaSub, { color: colors.mutedForeground }]}>
                  Apply to sell your food on Friday Food Club
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(212,175,55,0.6)" />
            <View style={styles.chefCtaBorder} />
          </LinearGradient>
        </Pressable>

        {/* Settings menu */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Settings</Text>
        </View>

        <GlassView intensity={40} style={styles.menuCard}>
          {MENU_ITEMS.map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 && (
                <View style={[styles.menuDivider, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
              )}
              <Pressable style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}>
                <GlassView intensity={25} style={styles.menuIconWrap}>
                  <Ionicons name={item.icon as any} size={17} color={colors.gold} />
                </GlassView>
                <Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text>
                <View style={styles.menuRight}>
                  {item.value && (
                    <Text style={[styles.menuValue, { color: colors.mutedForeground }]}>
                      {item.value}
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.2)" />
                </View>
              </Pressable>
            </React.Fragment>
          ))}
        </GlassView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bgWatermark: {
    position: 'absolute',
    width: 380,
    height: 380,
    top: 20,
    right: -100,
    opacity: 0.055,
    zIndex: 0,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: { fontSize: 32, fontFamily: 'PlayfairDisplay_700Bold' },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.2)',
  },
  userCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.18)',
  },
  cardTopBorder: { height: 1.5 },
  userCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    paddingBottom: 16,
  },
  avatarRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    padding: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  userInfo: { flex: 1, gap: 4 },
  userName: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  userHandle: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  tierText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#0A0A0A', letterSpacing: 1 },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 14,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 0.5 },
  statDivider: { width: 1, marginVertical: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionDot: { width: 4, height: 4, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  clubPassWrap: { marginBottom: 28, borderRadius: 24, overflow: 'hidden' },
  clubPassCard: { borderRadius: 24, padding: 20, gap: 16, overflow: 'hidden' },
  clubPassTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  clubPassTitle: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#D4AF37',
    letterSpacing: 2.5,
  },
  clubPassSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 18,
    marginTop: 5,
  },
  clubPassBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clubPassPrice: { fontSize: 28, fontFamily: 'Inter_700Bold', color: '#FFFFFF', letterSpacing: -0.5 },
  clubPassPer: { fontSize: 13, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.45)' },
  clubPassExpiry: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.4)',
    marginTop: 3,
  },
  clubPassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  clubPassBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#0A0A0A', letterSpacing: 1 },
  subscribeBtn: {
    backgroundColor: 'rgba(212,175,55,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
  },
  subscribeBtnText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#D4AF37',
    letterSpacing: 1.2,
  },
  clubPassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
  },
  nfcCardWrap: { marginBottom: 28, borderRadius: 24, overflow: 'hidden' },
  nfcCard: {
    borderRadius: 24,
    padding: 22,
    gap: 18,
    minHeight: 220,
    overflow: 'hidden',
  },
  nfcLogoBackdrop: {
    position: 'absolute',
    width: 260,
    height: 260,
    right: -50,
    top: -30,
    opacity: 0.12,
  },
  nfcTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nfcClub: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#D4AF37',
    letterSpacing: 2.5,
  },
  nfcTagline: {
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(212,175,55,0.5)',
    letterSpacing: 0.3,
    marginTop: 3,
  },
  nfcMemberName: {
    fontSize: 24,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  nfcBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  nfcFieldLabel: {
    fontSize: 8,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5,
  },
  nfcFieldValue: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.5,
    marginTop: 3,
  },
  nfcTier: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
    marginTop: 3,
  },
  goldStripe: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  nfcBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.28)',
  },
  menuCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.15)',
  },
  menuLabel: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuValue: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  menuDivider: { height: 1, marginLeft: 62 },
  chefCta: {
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
  },
  chefCtaLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  chefCtaTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#D4AF37' },
  chefCtaSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
  chefCtaBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
  },
});
