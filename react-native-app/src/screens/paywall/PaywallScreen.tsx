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
  requestPlanPurchase,
  restoreRevenueCatPurchases,
  getRevenueCatManagementUrl,
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
 * Settings) it is "Manage Plan": switching plans uses RevenueCat's product-change flow - upgrades switch
 * immediately with time credit, downgrades defer to the end of the paid period.
 */
export const PaywallScreen = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const { user, logout, markSubscribed } = useAuth();

  const [activeSub, setActiveSub] = useState<DBSubscription | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null); // plan slug
  const [purchasing, setPurchasing] = useState(false);
  const [billingReady, setBillingReady] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [showAutoRenewalNotice, setShowAutoRenewalNotice] = useState(false);
  const [autoRenewing, setAutoRenewing] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const insets = useSafeAreaInsets();

  // Keep the live subscription in a ref so CTA presses after a re-render still
  // use the current subscription when switching plans.
  const activeSubRef = useRef<DBSubscription | null>(null);

  const subscribed = !!activeSub;

  const subscribe = useCallback(
    async (plan: PlanDef, current: DBSubscription | null) => {
      setMessage(null);
      setPurchasing(true);
      try {
        // Switching from an existing RevenueCat subscription passes the old
        // product id plus a replacement mode. Mode is chosen by absolute
        // price, so monthly->yearly is treated as an upgrade.
        if (!user) throw new Error('Sign in before subscribing.');
        const currentPlan = current ? planBySlug(current.plan_slug) : null;
        const switching = !!currentPlan && currentPlan.slug !== plan.slug;
        const purchase = await requestPlanPurchase(user.id, plan, switching ? {
          oldProductId: currentPlan.store_product_id,
          replacementMode: plan.price >= currentPlan.price ? WITH_TIME_PRORATION : DEFERRED,
        } : undefined);

        const result = await recordCompletedPurchase(user.id, purchase);
        if (result === 'unmatched') {
          setMessage('Purchase received but plan could not be matched. Contact support.');
          return;
        }
        setAutoRenewing(purchase.autoRenewing);
        setShowAutoRenewalNotice(true);
      } catch (e: any) {
        if (!e?.userCancelled) {
          const detail = e?.underlyingErrorMessage ? ` (${e.underlyingErrorMessage})` : '';
          setMessage((e?.message || 'Purchase failed. Please try again.') + detail);
        }
      } finally {
        setPurchasing(false);
      }
    },
    [user],
  );

  // Mount: warm the billing connection, load the current subscription,
  // pre-select the featured plan (or the CURRENT plan for subscribers, so
  // they can switch), then continue a purchase the subscribe sheet started
  // before authentication interrupted it (the web sheet's triggerPurchase()
  // running right after register/login).
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (user) {
        const ready = await initBilling(user.id);
        if (mounted && !ready) {
          setBillingReady(false);
          setMessage('Billing is not available on this device. You can restore a previous purchase below.');
        }
      }
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

  const handleRestore = async () => {
    if (!user) return;
    setMessage(null);
    setPurchasing(true);
    try {
      const purchase = await restoreRevenueCatPurchases(user.id);
      if (!purchase) {
        setMessage('No active subscription was found to restore.');
        return;
      }
      const result = await recordCompletedPurchase(user.id, purchase);
      if (result === 'unmatched') {
        setMessage('Restored purchase could not be matched to a plan. Contact support.');
        return;
      }
      setAutoRenewing(purchase.autoRenewing);
      setShowAutoRenewalNotice(true);
    } catch (e: any) {
      setMessage(e?.message || 'Restore failed. Please try again.');
    } finally {
      setPurchasing(false);
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
          style={[styles.continueBtn, (!selectedPlan || purchasing || !billingReady) && styles.continueBtnDisabled]}
          disabled={!selectedPlan || purchasing || !billingReady}
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
          <>
            <Text style={styles.legalText}>
              Payment is processed securely through RevenueCat and the app store on confirmation. Your
              subscription renews automatically at the price shown until you cancel
              it; uninstalling the app does not cancel or refund it.
              By continuing you agree to our{' '}
              <Text
                style={styles.legalLink}
                onPress={() => navigation.navigate('LegalPage', { slug: 'terms', title: 'Terms' })}
              >
                Terms
              </Text>{' '}
              and the app store terms.
            </Text>
            {!subscribed && (
              <TouchableOpacity
                style={styles.restoreBtn}
                onPress={handleRestore}
                disabled={purchasing}
              >
                <Text style={styles.restoreBtnText}>Restore purchases</Text>
              </TouchableOpacity>
            )}
          </>
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
                  ? 'Your subscription renews automatically. You can manage or turn this off anytime from your subscription settings.'
                  : 'Auto-renewal is off. Your access will end at the expiry date.'}
              </Text>
              {autoRenewing && (
                <TouchableOpacity
                  style={styles.manageBtn}
                  onPress={() =>
                    user ? getRevenueCatManagementUrl(user.id).then((url) => url && Linking.openURL(url)) : undefined
                  }
                >
                  <Text style={styles.manageBtnText}>Manage subscription</Text>
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
  restoreBtn: {
    marginTop: 10,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  restoreBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    textDecorationLine: 'underline',
  },  legalText: {
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




