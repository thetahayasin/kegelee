import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { COLORS } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { getActiveSubscription, DBSubscription } from '../../db/queries';
import {
  PLANS,
  PlanDef,
  featuredPlan,
  planBySlug,
  paywallIntervalLabel,
} from '../../constants/plans';
import {
  initBilling,
  listenForPurchases,
  requestPlanPurchase,
  recordCompletedPurchase,
  takePendingPlan,
  WITH_TIME_PRORATION,
  DEFERRED,
} from '../../services/billing';
import { syncNow } from '../../services/sync';
import { Watermark } from '../../components/Watermark';

/**
 * The subscription screen (web: /upgrade, App\Livewire\App\Paywall).
 *
 * For a signed-in user WITHOUT a subscription this is the whole app - the
 * navigator's subscription gate mounts it as the root, and the only way out
 * is purchasing a plan or signing out. For subscribed users (reached from
 * Settings) it is "Manage Plan": switching plans uses Google Play's native
 * proration - upgrades switch immediately with time credit, downgrades defer
 * to the end of the paid period.
 */
export const PaywallScreen = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const { user, logout, markSubscribed } = useAuth();

  const [activeSub, setActiveSub] = useState<DBSubscription | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null); // plan slug
  const [purchasing, setPurchasing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showAutoRenewalNotice, setShowAutoRenewalNotice] = useState(false);
  const [autoRenewing, setAutoRenewing] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const insets = useSafeAreaInsets();

  // The listener callback closes over state; keep the live subscription in a
  // ref so a completion arriving after a re-render still sees the truth.
  const activeSubRef = useRef<DBSubscription | null>(null);

  const subscribed = !!activeSub;

  const subscribe = useCallback(
    async (plan: PlanDef, current: DBSubscription | null) => {
      setMessage(null);
      setPurchasing(true);
      try {
        // Switching from an existing Google Play subscription uses Play's
        // native proration: hand Google the old purchase token + replacement
        // mode and it credits/charges and replaces the old subscription
        // itself. Mode by direction (absolute price, so monthly->yearly is an
        // upgrade), matching Google's recommended behaviour. A first-time
        // subscriber just buys fresh.
        if (
          current &&
          current.store === 'google_play' &&
          current.purchase_token &&
          current.plan_slug !== plan.slug
        ) {
          const currentPlan = planBySlug(current.plan_slug);
          const isUpgrade = !currentPlan || plan.price >= currentPlan.price;
          await requestPlanPurchase(plan, {
            oldPurchaseToken: current.purchase_token,
            replacementMode: isUpgrade ? WITH_TIME_PRORATION : DEFERRED,
          });
        } else {
          await requestPlanPurchase(plan);
        }
        // Success/cancel/failure arrives through the purchase listeners.
      } catch (e) {
        setPurchasing(false);
        setMessage('Purchase failed. Please try again.');
      }
    },
    [],
  );

  // Mount: warm the billing connection, load the current subscription,
  // pre-select the featured plan (or the CURRENT plan for subscribers, so
  // they can switch), then continue a purchase the subscribe sheet started
  // before authentication interrupted it (the web sheet's triggerPurchase()
  // running right after register/login).
  useEffect(() => {
    let mounted = true;
    (async () => {
      initBilling();
      // A subscription can renew (or be bought on another device) while the
      // app is closed, leaving the local rows stale - and no other screen is
      // reachable behind the gate to trigger a sync. Pull here; when the pull
      // reveals an entitlement, AuthContext's onSyncComplete listener reopens
      // the gate live and this screen swaps away by itself.
      if (user) {
        syncNow(user.id).catch(() => {});
      }
      const current = user
        ? await getActiveSubscription(user.id).catch(() => null)
        : null;
      if (!mounted) return;
      setActiveSub(current);
      activeSubRef.current = current;
      setSelectedPlan(current?.plan_slug || featuredPlan().slug);

      const pendingSlug = await takePendingPlan();
      if (!mounted) return;
      const pending = planBySlug(pendingSlug);
      if (pending && !current) {
        setSelectedPlan(pending.slug);
        subscribe(pending, current);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The web's native:InAppPurchase.purchaseCompleted / purchaseFailed /
  // purchaseCancelled handlers.
  useEffect(() => {
    if (!user) return;
    const off = listenForPurchases(
      async ({ purchaseToken, productId, orderId }) => {
        setPurchasing(false);
        const result = await recordCompletedPurchase(user.id, {
          purchaseToken,
          productId,
          orderId,
        });
        if (result === 'unmatched') {
          setMessage('Purchase received but plan could not be matched. Contact support.');
          return;
        }
        // 'duplicate' is a re-delivered completion for a token we already
        // recorded - show the notice again rather than duplicating anything.
        setAutoRenewing(true);
        setShowAutoRenewalNotice(true);
      },
      (userCancelled) => {
        setPurchasing(false);
        if (!userCancelled) {
          setMessage('Purchase failed. Please try again.');
        }
      },
    );
    return off;
  }, [user]);

  const continueToApp = () => {
    setShowAutoRenewalNotice(false);
    // Opens the subscription gate; when this screen is the gate's root the
    // navigator swaps to the app (basics gate next) by itself. When it was
    // pushed from Settings (a plan switch), return into the app like the
    // web's redirect to home.
    markSubscribed();
    if (navigation.canGoBack()) {
      navigation.navigate('MainTabs');
    }
  };

  // The paywall is the only page an unsubscribed user can reach, so it
  // carries the sign-out escape hatch.
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  const selectedPlanDef = planBySlug(selectedPlan);
  const isUpgrade =
    !!activeSub && !!selectedPlan && activeSub.plan_slug !== selectedPlan;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Watermark />

      {/* Header */}
      <View style={styles.header}>
        {subscribed ? (
          <TouchableOpacity
            style={styles.headerLeftBtn}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Close"
          >
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path
                d="M6 6l12 12M18 6L6 18"
                stroke={COLORS.textMuted}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </Svg>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <ActivityIndicator size="small" color={COLORS.textMuted} />
            ) : (
              <Text style={styles.logoutText}>Log out</Text>
            )}
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>{subscribed ? 'Manage Plan' : 'Premium'}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 200 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>
          {subscribed
            ? 'Unlock the full programme'
            : 'Start your transformation journey now'}
        </Text>

        {/* Plan cards */}
        <View style={styles.plansWrap}>
          {PLANS.map((plan) => {
            const selected = selectedPlan === plan.slug;
            const isCurrentPlan = activeSub?.plan_slug === plan.slug;
            return (
              <TouchableOpacity
                key={plan.slug}
                activeOpacity={0.85}
                style={[styles.planCard, selected && styles.planCardSelected]}
                onPress={() => setSelectedPlan(plan.slug)}
              >
                {plan.is_featured && (
                  <View style={styles.featuredBadge}>
                    <Text style={styles.featuredBadgeText}>BEST VALUE</Text>
                  </View>
                )}
                {isCurrentPlan && (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>CURRENT PLAN</Text>
                  </View>
                )}
                <View style={styles.planRow}>
                  <View style={styles.planInfo}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planDescription}>{plan.description}</Text>
                  </View>
                  <View style={styles.planPriceWrap}>
                    <Text style={styles.planPrice}>${plan.price.toFixed(2)}</Text>
                    <Text style={styles.planInterval}>{paywallIntervalLabel(plan)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </ScrollView>

      {/* Fixed bottom CTA bar */}
      <View style={[styles.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
        <TouchableOpacity
          style={[styles.continueBtn, (!selectedPlan || purchasing) && styles.continueBtnDisabled]}
          disabled={!selectedPlan || purchasing}
          onPress={() => selectedPlanDef && subscribe(selectedPlanDef, activeSubRef.current)}
        >
          {purchasing ? (
            <ActivityIndicator color={COLORS.onAccent} />
          ) : (
            <Text style={styles.continueBtnText}>
              {isUpgrade ? `Switch to ${selectedPlanDef?.name}` : 'Continue'}
            </Text>
          )}
        </TouchableOpacity>
        {!purchasing && (
          <Text style={styles.legalText}>
            Payment is charged to your Google Play account on confirmation. Your
            subscription renews automatically at the price shown until you cancel
            it in Google Play; uninstalling the app does not cancel or refund it.
            By continuing you agree to our{' '}
            <Text
              style={styles.legalLink}
              onPress={() => navigation.navigate('LegalPage', { slug: 'terms', title: 'Terms' })}
            >
              Terms
            </Text>{' '}
            and the{' '}
            <Text
              style={styles.legalLink}
              onPress={() => Linking.openURL('https://play.google.com/about/play-terms/')}
            >
              Google Play Terms
            </Text>
            .
          </Text>
        )}
      </View>

      {/* Auto-renewal notice after purchase */}
      <Modal
        visible={showAutoRenewalNotice}
        animationType="fade"
        transparent
        onRequestClose={continueToApp}
      >
        <View style={styles.noticeOverlay}>
          <View style={[styles.noticePanel, { paddingBottom: 24 + insets.bottom }]}>
            <View style={styles.noticeHandle} />
            <View style={styles.noticeCheckCircle}>
              <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M5 13l4 4L19 7"
                  stroke={COLORS.success}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
            <Text style={styles.noticeTitle}>Subscription activated!</Text>
            <Text style={styles.noticeBody}>
              Your subscription is now active and full access has been unlocked.
            </Text>

            <View style={styles.noticeBox}>
              <View style={styles.noticeBoxRow}>
                <Text style={styles.noticeBoxLabel}>Auto-renewal</Text>
                <Text
                  style={[
                    styles.noticeBoxValue,
                    { color: autoRenewing ? COLORS.success : COLORS.accentSoft },
                  ]}
                >
                  {autoRenewing ? 'On' : 'Off'}
                </Text>
              </View>
              <Text style={styles.noticeBoxHint}>
                {autoRenewing
                  ? 'Your subscription renews automatically. You can turn this off anytime in Google Play.'
                  : 'Auto-renewal is off. Your access will end at the expiry date.'}
              </Text>
              {autoRenewing && (
                <TouchableOpacity
                  style={styles.manageBtn}
                  onPress={() =>
                    Linking.openURL('https://play.google.com/store/account/subscriptions')
                  }
                >
                  <Text style={styles.manageBtnText}>Manage in Google Play</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity style={styles.noticeContinueBtn} onPress={continueToApp}>
              <Text style={styles.noticeContinueBtnText}>Continue to App</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerLeftBtn: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtn: {
    position: 'absolute',
    left: 16,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  scroll: {
    paddingTop: 8,
  },
  heading: {
    paddingHorizontal: 24,
    fontSize: 24,
    fontWeight: 'bold',
    lineHeight: 30,
    textAlign: 'center',
    color: COLORS.white,
  },
  plansWrap: {
    marginTop: 24,
    paddingHorizontal: 16,
    gap: 12,
  },
  planCard: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
  },
  planCardSelected: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(193,255,114,0.10)',
  },
  featuredBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  featuredBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.onAccent,
    letterSpacing: 0.5,
  },
  currentBadge: {
    position: 'absolute',
    top: -10,
    left: 16,
    backgroundColor: 'rgba(193,255,114,0.20)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.success,
    letterSpacing: 0.5,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  planDescription: {
    marginTop: 2,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  planPriceWrap: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  planInterval: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  message: {
    marginHorizontal: 16,
    marginTop: 16,
    fontSize: 14,
    color: COLORS.accentSoft,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(6,8,16,0.97)',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  continueBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnDisabled: {
    opacity: 0.5,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.onAccent,
  },
  legalText: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    color: COLORS.textMuted,
  },
  legalLink: {
    color: COLORS.accent,
    textDecorationLine: 'underline',
  },

  // Auto-renewal notice (bottom sheet)
  noticeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  noticePanel: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    padding: 24,
  },
  noticeHandle: {
    alignSelf: 'center',
    width: 48,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  noticeCheckCircle: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(193,255,114,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  noticeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
  },
  noticeBody: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  noticeBox: {
    marginTop: 16,
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    padding: 16,
  },
  noticeBoxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noticeBoxLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  noticeBoxValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  noticeBoxHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textMuted,
  },
  manageBtn: {
    marginTop: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  noticeContinueBtn: {
    marginTop: 16,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeContinueBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.onAccent,
  },
});
