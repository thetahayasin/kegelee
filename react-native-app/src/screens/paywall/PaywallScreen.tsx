import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, DISABLED_OPACITY, TYPE, SPACE, RADIUS } from '../../theme/colors';
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
  recordCompletedPurchase,
  takePendingPlan,
  getPlanPricing,
  describePurchaseFailure,
  PlanPricing,
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
/** Billable months in a plan period, or null for periods with no monthly equivalent. */
const planMonths = (plan: PlanDef): number | null => {
  if (plan.interval === 'year') return 12 * plan.interval_count;
  if (plan.interval === 'month') return plan.interval_count;
  return null;
};

/**
 * A plan's price expressed per month, reusing the STORE's own formatting.
 *
 * Rather than reformatting through Intl (symbol position and decimal separator
 * vary by locale, and Hermes ships Intl inconsistently), this swaps the numeric
 * run inside the store's own priceString. Whatever currency symbol, placement
 * and separator that market uses are preserved exactly as the store wrote them.
 */
const perMonthLabel = (pricing: PlanPricing | undefined, months: number | null): string | null => {
  if (!pricing?.priceString || pricing.price == null || !months || months <= 1) return null;
  const numeric = pricing.priceString.match(/\d[\d.,\s]*\d|\d/);
  if (!numeric) return null;
  const sample = numeric[0];
  const separator = /,\d{1,2}$/.test(sample) ? ',' : '.';
  return pricing.priceString.replace(sample, (pricing.price / months).toFixed(2).replace('.', separator));
};

/**
 * Percentage saved per month against the monthly plan, from LIVE store prices.
 *
 * Never derived from the catalogue: those figures are USD-only and would
 * misstate the saving in every other market, which is exactly why plans.ts
 * refuses to carry a hardcoded discount. Returns null unless both real prices
 * are known, so the badge silently does not render rather than guessing.
 */
const savingsPercent = (
  pricing: Record<string, PlanPricing>,
  plan: PlanDef,
  months: number | null,
): number | null => {
  const monthly = PLANS.find((p) => p.interval === 'month' && p.interval_count === 1);
  const base = monthly ? pricing[monthly.slug]?.price : null;
  const own = pricing[plan.slug]?.price;
  if (!base || !own || !months || months <= 1) return null;
  const percent = Math.round((1 - own / months / base) * 100);
  // Anything under ~5% reads as noise and invites "that is not a saving".
  return percent >= 5 ? percent : null;
};

/** What premium unlocks. Every line maps to something the app actually ships. */
const PREMIUM_BENEFITS = [
  'Build real pelvic floor strength',
  'Measure your progress',
  'Set reminders that fit your day',
  'Feel the difference',
];

export const PaywallScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<any>>();
  const { user, logout, markSubscribed } = useAuth();

  const [activeSub, setActiveSub] = useState<DBSubscription | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null); // plan slug
  // Localized store prices + real trial eligibility, keyed by plan slug.
  // Empty until RevenueCat offerings load (or when they can't - offline, store
  // unavailable), in which case the catalogue USD price shows and no trial is
  // ever advertised.
  const [pricing, setPricing] = useState<Record<string, PlanPricing>>({});
  const [purchasing, setPurchasing] = useState(false);
  const [billingReady, setBillingReady] = useState(true);
  // True once offerings have loaded and matched no plan - purchasing is
  // impossible until the store/RevenueCat catalogue is fixed.
  const [offeringsUnavailable, setOfferingsUnavailable] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showAutoRenewalNotice, setShowAutoRenewalNotice] = useState(false);
  const [autoRenewing, setAutoRenewing] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  // Measured height of the fixed bottom bar, used as the scroll view's bottom
  // padding. It was a hardcoded 200, which the bar outgrew as soon as the CTA
  // disclosure wrapped to more lines ("3-day free trial, then ... unless you
  // cancel before the trial ends"), so the last plan card slid underneath it.
  // 200 stays as the first-render estimate until onLayout reports the truth.
  const [bottomBarHeight, setBottomBarHeight] = useState(200);
  const insets = useSafeAreaInsets();

  // Keep the live subscription in a ref so CTA presses after a re-render still
  // use the current subscription when switching plans.
  const activeSubRef = useRef<DBSubscription | null>(null);
  // Same reason as activeSubRef: `subscribe` is memoised on [user], so it must
  // read live store prices rather than the `pricing` captured at creation.
  const pricingRef = useRef<Record<string, PlanPricing>>({});
  // `subscribe` is memoised on [user] but needs to trigger a restore when the
  // store reports the plan is already owned. Reaching it through a ref keeps
  // that call pointed at the current handler instead of the one captured when
  // the callback was created.
  const handleRestoreRef = useRef<(() => Promise<void>) | null>(null);

  const subscribed = !!activeSub;
  // Whether this screen was pushed onto an existing stack (Settings -> Manage
  // Plan), or IS the subscription gate's root.
  //
  // Deliberately derived from real navigation history rather than from
  // `subscribed`: the navigator mounts the gate using AuthContext's value,
  // while this screen computes its own from the local subscriptions row. When
  // those two disagree the header used to show a close button on the gate root,
  // where goBack() silently does nothing - a dead X, and no Log out escape
  // either, because the X replaced it.
  const canClose = navigation.canGoBack();

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
        // Rank the two plans by their REAL store prices where we have them.
        // The catalogue price is only an offline fallback: it is USD-only and
        // can drift from Play, which would otherwise pick the wrong
        // replacement mode (charging immediately on what is really a
        // downgrade, or deferring a genuine upgrade).
        const priceOf = (p: PlanDef) => pricingRef.current[p.slug]?.price ?? p.price;
        const purchase = await requestPlanPurchase(user.id, plan, switching ? {
          oldProductId: currentPlan.store_product_id,
          replacementMode:
            priceOf(plan) >= priceOf(currentPlan) ? WITH_TIME_PRORATION : DEFERRED,
        } : undefined);

        const result = await recordCompletedPurchase(user.id, purchase);
        if (result === 'unmatched') {
          setMessage('Purchase received but plan could not be matched. Contact support.');
          return;
        }
        // Open the gate the moment the purchase is on disk, NOT when the
        // auto-renewal notice is acknowledged.
        //
        // Hanging the flip off that one tap meant any path that skipped it -
        // backing out of the notice, the notice failing to mount, the screen
        // being torn down first - left someone who had just paid staring at
        // the paywall until the next cold start recomputed the gate from
        // SQLite. That is the "it unblocks after a restart" report. The row
        // is the same evidence the restart would use, so act on it now.
        //
        // On the gate root this swaps the navigator and the notice below
        // never renders; that is fine, the pre-purchase disclosure under the
        // CTA and Play's own sheet both already stated the renewal terms.
        // Reached from Settings the navigator does not move, so the notice
        // still shows as the confirmation it was written to be.
        markSubscribed();
        setAutoRenewing(purchase.autoRenewing);
        setShowAutoRenewalNotice(true);
      } catch (e: any) {
        const failure = describePurchaseFailure(e);
        if (failure.cancelled) {
          // They backed out of the store sheet. Saying anything at all here
          // reads as an error they did not cause.
          return;
        }
        // The raw code and SDK string are for us, not for the customer.
        console.warn('[billing] purchase failed', failure.code, failure.detail);
        setMessage(failure.message);
        if (failure.restorable) {
          // They already own it. Restoring is the fix; asking them to buy
          // again would take a second payment for the same thing.
          await handleRestoreRef.current?.();
        }
      } finally {
        setPurchasing(false);
      }
    },
    // markSubscribed is useCallback-stable in AuthContext, so listing it does
    // not re-create this handler on every render.
    [user, markSubscribed],
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
        if (ready) {
          getPlanPricing(user.id)
            .then((p) => {
              if (!mounted) return;
              setPricing(p);
              pricingRef.current = p;
              // No package matched any plan: the store or RevenueCat has no
              // purchasable products for this build (empty/misconfigured
              // offering, wrong SDK key, product not live). Say so and block
              // the CTA rather than showing catalogue prices behind a button
              // that can only fail once tapped.
              setOfferingsUnavailable(Object.keys(p).length === 0);
            })
            .catch(() => {
              if (mounted) setOfferingsUnavailable(true);
            });
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
      // Never preselect the plan they already own: subscribe() decides it is
      // not a switch when old and new slugs match, and re-buys it instead.
      // A subscriber lands on the featured plan, or the first one that is not
      // theirs if the featured plan IS theirs.
      const notCurrent = PLANS.filter((p) => p.slug !== current?.plan_slug);
      setSelectedPlan(
        current
          ? (notCurrent.find((p) => p.is_featured) ?? notCurrent[0])?.slug ?? null
          : featuredPlan().slug,
      );

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
      // Same as the purchase path: the entitlement is real and on disk, so
      // the gate opens now rather than on a tap that may never come.
      markSubscribed();
      setAutoRenewing(purchase.autoRenewing);
      setShowAutoRenewalNotice(true);
    } catch (e: any) {
      const failure = describePurchaseFailure(e);
      if (!failure.cancelled) {
        console.warn('[billing] restore failed', failure.code, failure.detail);
        setMessage(failure.message);
      }
    } finally {
      setPurchasing(false);
    }
  };
  handleRestoreRef.current = handleRestore;
  const selectedPlanDef = planBySlug(selectedPlan);
  const isUpgrade =
    !!activeSub && !!selectedPlan && activeSub.plan_slug !== selectedPlan;
  const selectedPricing = selectedPlanDef ? pricing[selectedPlanDef.slug] : undefined;
  // Advertise a trial only when the store actually serves one to THIS customer
  // (see getPlanPricing) and there is no current subscription - a plan switch
  // is a product change, never a new trial.
  const trialDays = !activeSub ? selectedPricing?.freeTrialDays ?? null : null;
  // The trial is the same on every plan, so it is stated once above the cards
  // rather than badged on each. Read from live store data like every other
  // trial claim here: if the offer is withdrawn, or this customer has
  // subscribed before and is therefore ineligible, Play returns no free phase
  // and this simply does not render. We never advertise a trial the store
  // will not actually grant.
  const anyTrialDays = !activeSub
    ? PLANS.map((plan) => pricing[plan.slug]?.freeTrialDays).find((days) => !!days) ?? null
    : null;
  const selectedPriceLabel = selectedPlanDef
    ? `${selectedPricing?.priceString || `$${selectedPlanDef.price.toFixed(2)}`}${paywallIntervalLabel(selectedPlanDef)}`
    : '';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Watermark />

      {/* Header */}
      <View style={styles.header}>
        {canClose ? (
          <TouchableOpacity
            style={styles.headerLeftBtn}
            onPress={() => navigation.goBack()}
            accessibilityLabel={t('paywall.close')}
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
              <Text style={styles.logoutText}>{t('paywall.logOut')}</Text>
            )}
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>{subscribed ? 'Manage Plan' : 'Premium'}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>
          {subscribed
            ? 'Change your plan'
            : 'Start your transformation journey now'}
        </Text>

        {anyTrialDays ? (
          <View style={styles.trialBanner}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 6v6l4 2"
                stroke={COLORS.accent}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M12 3a9 9 0 1 0 9 9"
                stroke={COLORS.accent}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            </Svg>
            <Text style={styles.trialBannerText}>
              {`Every plan starts with a ${anyTrialDays}-day free trial`}
            </Text>
          </View>
        ) : null}

        {/* What premium unlocks. Hidden for subscribers, who reach this screen
            as "Manage Plan" and are being asked to switch, not to buy in. */}
        {!subscribed && (
          <View style={styles.benefits}>
            {PREMIUM_BENEFITS.map((benefit) => (
              <View key={benefit} style={styles.benefitRow}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M20 6L9 17l-5-5"
                    stroke={COLORS.accent}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Plan cards */}
        <View style={styles.plansWrap}>
          {(activeSub
            // Managing a plan: show only what they can move TO. Rendering the
            // plan they already own as a purchasable card invites a tap that
            // cannot succeed.
            ? PLANS.filter((plan) => plan.slug !== activeSub.plan_slug)
            : PLANS
          ).map((plan) => {
            const selected = selectedPlan === plan.slug;
            const months = planMonths(plan);
            const perMonth = perMonthLabel(pricing[plan.slug], months);
            const savings = savingsPercent(pricing, plan, months);
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
                <View style={styles.planRow}>
                  <View style={styles.planInfo}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planDescription}>{plan.description}</Text>
                    {savings ? (
                      <View style={styles.savingsPill}>
                        <Text style={styles.savingsPillText}>SAVE {savings}%</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.planPriceWrap}>
                    <Text style={styles.planPrice}>
                      {pricing[plan.slug]?.priceString
                        || (offeringsUnavailable ? '--' : `$${plan.price.toFixed(2)}`)}
                    </Text>
                    <Text style={styles.planInterval}>{paywallIntervalLabel(plan)}</Text>
                    {perMonth ? (
                      <Text style={styles.planPerMonth}>{perMonth}/mo</Text>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {offeringsUnavailable ? (
          <Text style={styles.message}>
            Subscriptions aren't available on this device right now. Please try again
            later, or restore a previous purchase below.
          </Text>
        ) : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </ScrollView>

      {/* Fixed bottom CTA bar */}
      <View
        style={[styles.bottomBar, { paddingBottom: 16 + insets.bottom }]}
        onLayout={(e) => setBottomBarHeight(e.nativeEvent.layout.height)}
      >
        <TouchableOpacity
          style={[
            styles.continueBtn,
            (!selectedPlan || purchasing || !billingReady || offeringsUnavailable) &&
              styles.continueBtnDisabled,
          ]}
          disabled={!selectedPlan || purchasing || !billingReady || offeringsUnavailable}
          onPress={() => selectedPlanDef && subscribe(selectedPlanDef, activeSubRef.current)}
        >
          {purchasing ? (
            <ActivityIndicator color={COLORS.onAccent} />
          ) : (
            <Text style={styles.continueBtnText}>
              {isUpgrade
                ? `Switch to ${selectedPlanDef?.name}`
                : trialDays
                  ? `Start ${trialDays}-Day Free Trial`
                  : 'Subscribe'}
            </Text>
          )}
        </TouchableOpacity>
        {!purchasing && (
          <>
            {selectedPlanDef && !offeringsUnavailable ? (
              <Text style={styles.renewalText}>
                {trialDays
                  ? `${trialDays}-day free trial, then ${selectedPriceLabel}. Renews automatically unless you cancel before the trial ends.`
                  : `${selectedPriceLabel}, renews automatically until cancelled.`}{' '}
                Manage or cancel anytime in Google Play.
              </Text>
            ) : null}
            <Text style={styles.legalText}>
              Payment is processed securely through RevenueCat and the app store on confirmation.
              Uninstalling the app does not cancel or refund a subscription.
              By continuing you agree to our{' '}
              <Text
                style={styles.legalLink}
                onPress={() => navigation.navigate('LegalPage', { slug: 'terms', title: 'Terms' })}
              >
                {t('paywall.terms')}
              </Text>
              {', '}
              <Text
                style={styles.legalLink}
                onPress={() =>
                  navigation.navigate('LegalPage', { slug: 'privacy-policy', title: 'Privacy Policy' })
                }
              >
                {t('paywall.privacyPolicy')}
              </Text>{' '}
              and the app store terms.
            </Text>
            {!subscribed && (
              <TouchableOpacity
                style={styles.restoreBtn}
                onPress={handleRestore}
                disabled={purchasing}
              >
                <Text style={styles.restoreBtnText}>{t('paywall.restorePurchases')}</Text>
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
            <Text style={styles.noticeTitle}>{t('paywall.subscriptionActivated')}</Text>
            <Text style={styles.noticeBody}>
              {t('paywall.yourSubscriptionIsNowActive')}
            </Text>

            <View style={styles.noticeBox}>
              <View style={styles.noticeBoxRow}>
                <Text style={styles.noticeBoxLabel}>{t('paywall.autoRenewal')}</Text>
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
              {/* No management shortcut here on purpose: this panel fires in the
                  seconds after a successful purchase, where offering a cancel
                  route is odd UX. Managing and cancelling stay one tap away in
                  Settings, and in Google Play itself. The auto-renewal wording
                  above STAYS: Play policy requires the renewal terms be
                  disclosed at purchase, so it is not ours to remove. */}
            </View>

            <TouchableOpacity style={styles.noticeContinueBtn} onPress={continueToApp}>
              <Text style={styles.noticeContinueBtnText}>{t('paywall.continueToApp')}</Text>
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
    start: SPACE.md,
    // 36px sat under both the iOS HIG and Material minimum target.
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtn: {
    position: 'absolute',
    start: SPACE.md,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.md,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  headerTitle: {
    ...TYPE.heading,
    color: COLORS.white,
  },
  scroll: {
    paddingTop: 8,
  },
  heading: {
    paddingHorizontal: SPACE.xl,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 30,
    textAlign: 'center',
    color: COLORS.white,
  },
  plansWrap: {
    marginTop: 24,
    paddingHorizontal: 16,
    gap: 12,
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 7,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accentWash,
  },
  trialBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.accent,
  },
  benefits: {
    marginTop: 20,
    paddingHorizontal: 24,
    gap: 10,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    color: COLORS.textMuted,
  },
  savingsPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accentWash,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  savingsPillText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.3,
    color: COLORS.accent,
  },
  planPerMonth: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.textDim,
    fontVariant: ['tabular-nums'],
  },
  planCard: {
    // Was 2px at 10% white on every card, which read as an unfilled form field
    // rather than a choice. The unselected state is now a quiet hairline and
    // the selected state carries the weight.
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md + 2,
    padding: SPACE.lg,
  },
  planCardSelected: {
    borderWidth: 2,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(193,255,114,0.07)',
    // Compensate for the extra border pixel so the card does not shift when
    // selection moves between plans.
    padding: SPACE.lg - 1,
  },
  featuredBadge: {
    position: 'absolute',
    top: -10,
    end: 16,
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
    fontWeight: '700',
    letterSpacing: -0.3,
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
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: COLORS.white,
    // Prices sit in a right-aligned column across stacked plan cards, so the
    // digits need to line up rather than jitter per glyph width.
    fontVariant: ['tabular-nums'],
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
    start: 0,
    end: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: 'rgba(6,8,16,0.97)',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  continueBtn: {
    height: 56,
    borderRadius: RADIUS.md + 2,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnDisabled: {
    opacity: DISABLED_OPACITY,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: COLORS.onAccent,
  },
  restoreBtn: {
    marginTop: 10,
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
  },
  restoreBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    textDecorationLine: 'underline',
  },
  renewalText: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    color: COLORS.textMuted,
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
    borderTopColor: COLORS.borderStrong,
    padding: SPACE.xl,
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




