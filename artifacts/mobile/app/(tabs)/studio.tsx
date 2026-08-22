/**
 * Studio — Chef dashboard tab
 *
 * Shows the chef's wallet balance with a red/amber banner when the balance
 * is negative, and disables the "Create Drop" button when the wallet is
 * frozen (below the platform's walletFreezeThreshold).
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '@workspace/convex-backend/convex/_generated/api';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import GlassView from '@/components/GlassView';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChefWallet {
  walletBalance: number;
  freezeThreshold: number;
  isFrozen: boolean;
}

interface DemoChef {
  id: string;
  name: string;
  handle: string;
  cuisine: string;
  region: string;
  isVerified: boolean;
  totalDrops: number;
  successfulDrops: number;
  points: number;
  rank: number;
}

// ── Real chef data hook ────────────────────────────────────────────────────

/**
 * 'unauthenticated' — not signed in at all
 * 'no-profile'     — signed in as BUYER with no chef application on file
 * 'pending'        — chef application is PENDING_REVIEW
 * 'rejected'       — chef application was REJECTED
 * 'ok'             — verified CHEF, full Studio access
 * 'unavailable'    — network / server error
 */
type ChefLoadState = 'loading' | 'ok' | 'unauthenticated' | 'no-profile' | 'pending' | 'rejected' | 'unavailable';

function useChefProfile(token: string | null) {
  const status = useQuery(api.chefs.myStatus, token ? { sessionToken: token } : 'skip');
  const isVerifiedChef = status?.role === 'CHEF' || status?.role === 'ADMIN';
  const chefDetail = useQuery(api.chefs.get, isVerifiedChef && status?.chefId ? { chefId: status.chefId as any } : 'skip');

  let loadState: ChefLoadState;
  let chef: DemoChef | null = null;
  if (!token) {
    loadState = 'unauthenticated';
  } else if (status === undefined) {
    loadState = 'loading';
  } else if (!status.chefId) {
    loadState = 'no-profile';
  } else if (status.verificationStatus === 'PENDING_REVIEW') {
    loadState = 'pending';
  } else if (status.verificationStatus === 'REJECTED') {
    loadState = 'rejected';
  } else if (chefDetail === undefined) {
    loadState = 'loading';
  } else if (!chefDetail) {
    loadState = 'unavailable';
  } else {
    loadState = 'ok';
    chef = {
      id: chefDetail._id, name: chefDetail.name, handle: chefDetail.handle,
      cuisine: chefDetail.cuisine, region: chefDetail.region, isVerified: chefDetail.isVerified,
      totalDrops: chefDetail.totalDrops, successfulDrops: chefDetail.successfulDrops,
      points: chefDetail.points, rank: chefDetail.rank,
    };
  }

  return { chef, loadState, rejectionReason: status?.rejectionReason ?? null };
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

type WalletLoadState = 'loading' | 'ok' | 'unauthenticated' | 'unavailable';

function useChefWallet(token: string | null, isVerifiedChef: boolean) {
  const raw = useQuery(api.chefs.myWallet, token && isVerifiedChef ? { sessionToken: token } : 'skip');
  const loadState: WalletLoadState = !token ? 'unauthenticated' : !isVerifiedChef ? 'unavailable' : raw === undefined ? 'loading' : 'ok';
  const wallet: ChefWallet | null = raw ? { walletBalance: raw.walletBalance, freezeThreshold: raw.freezeThreshold, isFrozen: raw.isFrozen } : null;
  return { wallet, loadState };
}

// ── Components ────────────────────────────────────────────────────────────────

function WalletBanner({ wallet }: { wallet: ChefWallet }) {
  const { walletBalance, freezeThreshold, isFrozen } = wallet;

  if (walletBalance >= 0) return null;

  const isWarning = !isFrozen; // negative but above threshold

  return (
    <View
      style={[
        styles.walletBanner,
        isFrozen ? styles.bannerFrozen : styles.bannerWarning,
      ]}
    >
      <Ionicons
        name={isFrozen ? 'lock-closed' : 'warning'}
        size={18}
        color={isFrozen ? '#FF4444' : '#F5A623'}
      />
      <View style={styles.bannerTextWrap}>
        {isFrozen ? (
          <>
            <Text style={[styles.bannerTitle, styles.bannerTitleFrozen]}>
              Wallet Frozen
            </Text>
            <Text style={[styles.bannerBody, styles.bannerBodyFrozen]}>
              Your balance is{' '}
              <Text style={styles.bannerAmount}>
                {walletBalance.toFixed(2)} TTD
              </Text>{' '}
              — below the {freezeThreshold.toFixed(0)} TTD platform limit. Settle
              your cash fees to post new drops.
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.bannerTitle, styles.bannerTitleWarning]}>
              Negative Balance
            </Text>
            <Text style={[styles.bannerBody, styles.bannerBodyWarning]}>
              Your balance is{' '}
              <Text style={styles.bannerAmount}>
                {walletBalance.toFixed(2)} TTD
              </Text>
              . Settle outstanding cash fees before your wallet is frozen.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function CreateDropButton({ wallet }: { wallet: ChefWallet }) {
  const colors = useColors();
  const router = useRouter();
  const { isFrozen } = wallet;

  const handlePress = () => {
    if (isFrozen) return; // safety guard — shouldn't be reachable, button is visually disabled
    router.push('/create-drop');
  };

  if (isFrozen) {
    return (
      <View style={styles.createBtnWrap}>
        <View style={[styles.createBtn, styles.createBtnDisabled]}>
          <Ionicons name="lock-closed" size={18} color="rgba(255,255,255,0.35)" />
          <Text style={[styles.createBtnText, styles.createBtnTextDisabled]}>
            Create Drop
          </Text>
        </View>
        <View style={styles.frozenTooltip}>
          <Ionicons name="information-circle" size={13} color="#FF6B6B" />
          <Text style={styles.frozenTooltipText}>
            Posting is blocked while your wallet is frozen. Contact support to resolve your debt.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.createBtnWrap}>
      <Pressable
        style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
        onPress={handlePress}
      >
        <LinearGradient
          colors={['#F5D060', '#D4AF37', '#9E8028']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.createBtn}
        >
          <Ionicons name="add-circle" size={20} color="#0A0A0A" />
          <Text style={[styles.createBtnText, { color: '#0A0A0A' }]}>Create Drop</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ── Application-status cards ──────────────────────────────────────────────────

function PendingCard() {
  const colors = useColors();
  return (
    <GlassView intensity={30} style={styles.statusCard}>
      <LinearGradient
        colors={['rgba(245,166,35,0.08)', 'transparent']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.statusCardAccent, { backgroundColor: 'rgba(245,166,35,0.25)' }]}>
        <Ionicons name="time-outline" size={22} color="#F5A623" />
      </View>
      <View style={styles.statusCardBody}>
        <Text style={[styles.statusCardTitle, { color: '#F5A623' }]}>Application Under Review</Text>
        <Text style={[styles.statusCardText, { color: colors.mutedForeground }]}>
          Your chef application has been submitted and is being reviewed by the Friday Food Club
          team. You'll receive a notification once a decision has been made — usually within 2–3
          business days.
        </Text>
      </View>
    </GlassView>
  );
}

function RejectedCard({
  reason,
  onReapply,
}: {
  reason: string | null;
  onReapply: () => void;
}) {
  const colors = useColors();
  return (
    <GlassView intensity={30} style={styles.statusCard}>
      <LinearGradient
        colors={['rgba(255,68,68,0.08)', 'transparent']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.statusCardAccent, { backgroundColor: 'rgba(255,68,68,0.2)' }]}>
        <Ionicons name="close-circle-outline" size={22} color="#FF6B6B" />
      </View>
      <View style={styles.statusCardBody}>
        <Text style={[styles.statusCardTitle, { color: '#FF6B6B' }]}>Application Not Approved</Text>
        {reason ? (
          <View style={styles.rejectionReasonBox}>
            <Text style={[styles.rejectionReasonLabel, { color: colors.mutedForeground }]}>
              REASON FROM ADMIN
            </Text>
            <Text style={[styles.rejectionReasonText, { color: colors.foreground }]}>{reason}</Text>
          </View>
        ) : (
          <Text style={[styles.statusCardText, { color: colors.mutedForeground }]}>
            Your application did not meet the current requirements. Please review the guidelines and
            reapply when you're ready.
          </Text>
        )}
        <Pressable
          style={({ pressed }) => [styles.reapplyBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={onReapply}
        >
          <Ionicons name="refresh" size={15} color="#0A0A0A" />
          <Text style={styles.reapplyBtnText}>Reapply Now</Text>
        </Pressable>
      </View>
    </GlassView>
  );
}

function NoProfileCard({ onApply, signedIn }: { onApply: () => void; signedIn: boolean }) {
  const colors = useColors();
  return (
    <GlassView intensity={30} style={styles.statusCard}>
      <LinearGradient
        colors={['rgba(212,175,55,0.08)', 'transparent']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.statusCardAccent, { backgroundColor: 'rgba(212,175,55,0.18)' }]}>
        <MaterialCommunityIcons name="chef-hat" size={22} color="#D4AF37" />
      </View>
      <View style={styles.statusCardBody}>
        <Text style={[styles.statusCardTitle, { color: colors.gold }]}>Become a Chef</Text>
        <Text style={[styles.statusCardText, { color: colors.mutedForeground }]}>
          {signedIn
            ? 'Post your own drops, build a following, and get paid — apply to unlock Studio.'
            : 'Sign in, then apply to become a chef to unlock Studio.'}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.reapplyBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={onApply}
        >
          <MaterialCommunityIcons name="chef-hat" size={15} color="#0A0A0A" />
          <Text style={styles.reapplyBtnText}>
            {signedIn ? 'Apply Now' : 'Sign In & Apply'}
          </Text>
        </Pressable>
      </View>
    </GlassView>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function StudioScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();

  const { chef, loadState: chefState, rejectionReason } = useChefProfile(token);
  const { wallet, loadState: walletState } = useChefWallet(token, chefState === 'ok');
  const [refreshing, setRefreshing] = useState(false);

  // Convex's queries above are already reactive/live — pull-to-refresh just
  // gives the gesture its expected brief visual response.
  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 300));
    setRefreshing(false);
  };

  const initials = chef
    ? chef.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '??';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.gold}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Studio</Text>
          <GlassView intensity={40} style={styles.headerBadge}>
            <MaterialCommunityIcons name="chef-hat" size={16} color={colors.gold} />
            <Text style={[styles.headerBadgeText, { color: colors.gold }]}>CHEF</Text>
          </GlassView>
        </View>

        {/* Chef card / application-status card */}
        {chefState === 'loading' ? (
          <GlassView intensity={50} style={[styles.chefCard, { alignItems: 'center', justifyContent: 'center', height: 120 }]}>
            <ActivityIndicator color={colors.gold} />
          </GlassView>
        ) : chefState === 'unauthenticated' ? (
          <NoProfileCard signedIn={false} onApply={() => router.push('/apply-chef')} />
        ) : chefState === 'no-profile' ? (
          <NoProfileCard signedIn={true} onApply={() => router.push('/apply-chef')} />
        ) : chefState === 'pending' ? (
          <PendingCard />
        ) : chefState === 'rejected' ? (
          <RejectedCard
            reason={rejectionReason}
            onReapply={() => router.push('/apply-chef')}
          />
        ) : chef ? (
        <GlassView intensity={50} style={styles.chefCard}>
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
          <View style={styles.chefCardInner}>
            <LinearGradient
              colors={['#9E8028', '#D4AF37', '#F5D060']}
              style={styles.avatarRing}
            >
              <View style={[styles.avatarInner, { backgroundColor: '#0D0D0D' }]}>
                <Text style={[styles.avatarText, { color: colors.gold }]}>{initials}</Text>
              </View>
            </LinearGradient>
            <View style={styles.chefInfo}>
              <Text style={[styles.chefName, { color: colors.foreground }]}>{chef.name}</Text>
              <Text style={[styles.chefHandle, { color: colors.mutedForeground }]}>{chef.handle}</Text>
              <View style={styles.verifiedRow}>
                {chef.isVerified && (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark-circle" size={12} color="#D4AF37" />
                    <Text style={styles.verifiedText}>VERIFIED</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={[styles.statsRow, { borderTopColor: 'rgba(212,175,55,0.12)' }]}>
            {[
              { label: 'Drops', value: chef.totalDrops },
              { label: 'Sold', value: chef.successfulDrops },
              { label: 'Points', value: chef.points.toLocaleString() },
              { label: 'Rank', value: `#${chef.rank}` },
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
        ) : null}

        {/* Wallet and Actions — only for verified chefs */}
        {chefState === 'ok' && (
          <>
            {/* Wallet section */}
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Wallet</Text>
            </View>

            {walletState === 'loading' ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={colors.gold} />
              </View>
            ) : walletState === 'unavailable' ? (
              <GlassView intensity={30} style={styles.walletUnavailable}>
                <Ionicons name="cloud-offline-outline" size={20} color={colors.mutedForeground} />
                <Text style={[styles.walletUnavailableText, { color: colors.mutedForeground }]}>
                  Could not load wallet status. Pull down to retry.
                </Text>
              </GlassView>
            ) : wallet ? (
              <>
                {/* Balance card */}
                <GlassView intensity={40} style={styles.walletCard}>
                  <LinearGradient
                    colors={['rgba(212,175,55,0.04)', 'transparent']}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={[styles.walletCardBorder, { borderColor: 'rgba(212,175,55,0.18)' }]} />
                  <View style={styles.walletCardInner}>
                    <View>
                      <Text style={[styles.walletLabel, { color: colors.mutedForeground }]}>
                        BALANCE
                      </Text>
                      <Text
                        style={[
                          styles.walletAmount,
                          {
                            color: wallet.walletBalance < 0
                              ? wallet.isFrozen ? '#FF4444' : '#F5A623'
                              : '#4CAF50',
                          },
                        ]}
                      >
                        {wallet.walletBalance >= 0 ? '+' : ''}
                        {wallet.walletBalance.toFixed(2)}{' '}
                        <Text style={styles.walletCurrency}>TTD</Text>
                      </Text>
                    </View>
                    <View style={styles.walletStatus}>
                      {wallet.isFrozen ? (
                        <View style={styles.statusBadgeFrozen}>
                          <Ionicons name="lock-closed" size={11} color="#FF4444" />
                          <Text style={styles.statusTextFrozen}>FROZEN</Text>
                        </View>
                      ) : wallet.walletBalance < 0 ? (
                        <View style={styles.statusBadgeWarning}>
                          <Ionicons name="warning" size={11} color="#F5A623" />
                          <Text style={styles.statusTextWarning}>OVERDUE</Text>
                        </View>
                      ) : (
                        <View style={styles.statusBadgeOk}>
                          <Ionicons name="checkmark-circle" size={11} color="#4CAF50" />
                          <Text style={styles.statusTextOk}>CLEAR</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Threshold indicator */}
                  <View style={[styles.thresholdRow, { borderTopColor: 'rgba(255,255,255,0.05)' }]}>
                    <Text style={[styles.thresholdLabel, { color: colors.mutedForeground }]}>
                      Freeze limit
                    </Text>
                    <Text style={[styles.thresholdValue, { color: colors.mutedForeground }]}>
                      {wallet.freezeThreshold.toFixed(2)} TTD
                    </Text>
                  </View>
                </GlassView>

                {/* Wallet warning / frozen banner */}
                <WalletBanner wallet={wallet} />
              </>
            ) : null}

            {/* Actions section */}
            <View style={[styles.sectionHeader, { marginTop: 24 }]}>
              <View style={[styles.sectionDot, { backgroundColor: colors.gold }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Actions</Text>
            </View>

            {wallet && <CreateDropButton wallet={wallet} />}

            {/* Manage drops row */}
            <GlassView intensity={30} style={styles.actionCard}>
              <View style={[styles.actionCardBorder, { borderColor: 'rgba(255,255,255,0.06)' }]} />
              <Pressable
                style={({ pressed }) => [styles.actionRow, { opacity: pressed ? 0.7 : 1 }]}
                onPress={() => router.push('/my-drops')}
              >
                <GlassView intensity={25} style={styles.actionIconWrap}>
                  <Ionicons name="list" size={18} color={colors.gold} />
                </GlassView>
                <View style={styles.actionTextWrap}>
                  <Text style={[styles.actionLabel, { color: colors.foreground }]}>My Drops</Text>
                  <Text style={[styles.actionSub, { color: colors.mutedForeground }]}>
                    View and manage your active drops
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
              </Pressable>

              <View style={[styles.actionDivider, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />

              <Pressable
                style={({ pressed }) => [styles.actionRow, { opacity: pressed ? 0.7 : 1 }]}
                onPress={() => router.push('/earnings')}
              >
                <GlassView intensity={25} style={styles.actionIconWrap}>
                  <Ionicons name="bar-chart" size={18} color={colors.gold} />
                </GlassView>
                <View style={styles.actionTextWrap}>
                  <Text style={[styles.actionLabel, { color: colors.foreground }]}>Earnings</Text>
                  <Text style={[styles.actionSub, { color: colors.mutedForeground }]}>
                    Revenue, payouts, and cash reconciliation
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
              </Pressable>
            </GlassView>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: { fontSize: 32, fontFamily: 'PlayfairDisplay_700Bold' },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.2)',
  },
  headerBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },

  // Chef card
  chefCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.18)',
  },
  cardTopBorder: { height: 1.5 },
  chefCardInner: {
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
  chefInfo: { flex: 1, gap: 4 },
  chefName: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  chefHandle: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  verifiedRow: { flexDirection: 'row', marginTop: 4 },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(212,175,55,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  verifiedText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#D4AF37', letterSpacing: 1 },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 14,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 0.5 },
  statDivider: { width: 1, marginVertical: 4 },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionDot: { width: 4, height: 4, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },

  // Loading / unavailable
  loadingWrap: { alignItems: 'center', paddingVertical: 24 },
  walletUnavailable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  walletUnavailableText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },

  // Wallet card
  walletCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
  },
  walletCardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
  },
  walletCardInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
  },
  walletLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  walletAmount: { fontSize: 32, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  walletCurrency: { fontSize: 16, fontFamily: 'Inter_400Regular' },
  walletStatus: { alignItems: 'flex-end' },
  statusBadgeFrozen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,68,68,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.25)',
  },
  statusTextFrozen: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#FF4444', letterSpacing: 1 },
  statusBadgeWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245,166,35,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.25)',
  },
  statusTextWarning: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#F5A623', letterSpacing: 1 },
  statusBadgeOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(76,175,80,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.25)',
  },
  statusTextOk: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#4CAF50', letterSpacing: 1 },
  thresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  thresholdLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  thresholdValue: { fontSize: 11, fontFamily: 'Inter_500Medium' },

  // Wallet banner
  walletBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
  },
  bannerFrozen: {
    backgroundColor: 'rgba(255,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.25)',
  },
  bannerWarning: {
    backgroundColor: 'rgba(245,166,35,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.25)',
  },
  bannerTextWrap: { flex: 1 },
  bannerTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  bannerTitleFrozen: { color: '#FF4444' },
  bannerTitleWarning: { color: '#F5A623' },
  bannerBody: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  bannerBodyFrozen: { color: 'rgba(255,68,68,0.8)' },
  bannerBodyWarning: { color: 'rgba(245,166,35,0.8)' },
  bannerAmount: { fontFamily: 'Inter_700Bold' },

  // Create Drop button
  createBtnWrap: { marginBottom: 16 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  createBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  createBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  createBtnTextDisabled: { color: 'rgba(255,255,255,0.3)' },
  frozenTooltip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  frozenTooltipText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,107,107,0.7)',
    lineHeight: 17,
  },

  // Application status cards (pending / rejected)
  statusCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 20,
    gap: 16,
  },
  statusCardAccent: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  statusCardBody: { gap: 10 },
  statusCardTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  statusCardText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  rejectionReasonBox: {
    backgroundColor: 'rgba(255,68,68,0.07)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.18)',
    gap: 4,
  },
  rejectionReasonLabel: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.2,
  },
  rejectionReasonText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  reapplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F5A623',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'stretch',
    marginTop: 4,
  },
  reapplyBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#0A0A0A' },

  // Action card
  actionCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  actionCardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.15)',
  },
  actionTextWrap: { flex: 1 },
  actionLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  actionSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  actionDivider: { height: 1, marginLeft: 64 },
});
