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
import {
  getActiveSubscription,
  subscriptionIsRenewing,
  DBSubscription,
} from '../../db/queries';
import { planMonths, perMonthLabel, savingsPercent } from '../../constants/pricing';
import {
  PLANS,
  PlanDef,
  featuredPlan,
  planBySlug,
  planNameKey,
  planDescriptionKey,
  planPeriodKey,
} from '../../constants/plans';
import {
  initBilling,
  requestPlanPurchase,
  restoreRevenueCatPurchases,
  recordCompletedPurchase,
  peekPendingPlan,
  clearPendingPlan,
  getPlanPricing,
  describePurchaseFailure,
  refreshCustomerInfo,
  PlanPricing,
  WITH_TIME_PRORATION,
  DEFERRED,
} from '../../services/billing';
import { syncNow } from '../../services/sync';
import { hasUsedFreeSession } from '../../services/freeSession';
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
/**
 * What premium unlocks. Every line maps to something the app actually ships.
 *
 * Keys rather than literals: this list is the sales pitch, and it was the last
 * fully English block on the screen people are asked to pay on.
 */
const PREMIUM_BENEFIT_KEYS = [
  'paywall.benefitExercises',
  'paywall.benefitDaily',
  'paywall.benefitProgress',
  'paywall.benefitReminders',
] as const;

export const PaywallScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<any>>();
  const { user, logout, markSubscribed, subscribed: gateOpen } = useAuth();

  const [activeSub, setActiveSub] = useState<DBSubscription | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null); // plan slug
  // Localized store prices + real trial eligibility, keyed by plan slug.
  // Empty until RevenueCat offerings load (or when they can't - offline, store
  // unavailable), in which case the catalogue USD price shows and no trial is
  // ever advertised.
  const [pricing, setPricing] = useState<Record<string, PlanPricing>>({});
  const [purchasing, setPurchasing] = useState(false);
  const [billingReady, setBillingReady] = useState(true);
  // Where the store lookup got to.
  //
  // This was a single `offeringsUnavailable` boolean, which conflated three
  // very different states and got two of them wrong. While the lookup was
  // still in flight the cards printed the catalogue's USD figure, so a reader
  // in Delhi or Warsaw watched the price change under them a second later -
  // the one screen where a number that moves costs you the sale. And a single
  // transient failure (mount while the phone was still finding the network)
  // latched "unavailable" for the life of the screen: prices stuck at "--",
  // CTA disabled, no retry short of killing the app, on the only screen an
  // unsubscribed account can reach.
  const [pricingState, setPricingState] =
    useState<'loading' | 'ready' | 'failed'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  // Not every message is a failure: a pending Play payment and "you already
  // own this, restoring now" are both good news. Colouring those like errors
  // reads as "your money did not go through", which is how you get a second
  // charge attempt and a support ticket.
  const [messageTone, setMessageTone] = useState<'info' | 'error'>('error');
  /**
   * Whether the one free session is still this account's to spend.
   *
   * It decides where dismissing the paywall goes. Previously it always went to
   * the basics list, which meant three lessons of reading stood between an
   * account and the single strongest argument this app has for subscribing -
   * a real session, finished. The whole free-session flow exists because
   * asking for money before someone has used the product is the weakest
   * moment to ask; gating the demo behind the longest stretch of text in the
   * app was working against that.
   */
  const [freeSessionLeft, setFreeSessionLeft] = useState(false);
  const [showAutoRenewalNotice, setShowAutoRenewalNotice] = useState(false);
  const [autoRenewing, setAutoRenewing] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  // Measured height of the fixed bottom bar, used as the scroll view's bottom
  // padding. It was a hardcoded 200, which the bar outgrew as soon as the CTA
  // disclosure wrapped to more lines ("3-day free trial, then ... unless you
  // cancel before the trial ends"), so the last plan card slid underneath it.
  // The estimate is only for the first frame; onLayout reports the truth.
  // 160 now the legal paragraph and Restore have moved into the page.
  const [bottomBarHeight, setBottomBarHeight] = useState(160);
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
  // Same reason: the backoff poll is created once per [user, gateOpen] and has
  // to reach the CURRENT price loader and the CURRENT lookup state, or it
  // would either retry forever or never retry at all.
  const loadPricingRef = useRef<(() => void) | null>(null);
  const pricingStateRef = useRef<'loading' | 'ready' | 'failed'>('loading');
  // One mounted flag for the async work that outlives a fast dismissal, rather
  // than a local per-effect one that the retry path cannot see.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Deliberately no plain `subscribed` here any more. "Holds an
  // entitlement" and "has a plan to manage" are different questions, and
  // one boolean answering both is what showed a cancelled customer
  // "Manage Plan" when they had come to buy one back.
  /**
   * Whether this screen is a plan MANAGER or a shop.
   *
   * Not the same question as "do they hold an entitlement", and conflating
   * the two is what greeted a cancelled subscriber - arriving from the home
   * screen's own "your access ends soon, resubscribe" prompt - with a header
   * reading "Manage Plan" and a heading reading "Change your plan". They have
   * no plan to change. They came to buy one back, and the screen answered a
   * question they had not asked.
   *
   * getActiveSubscription deliberately keeps returning a cancelled row until
   * its paid period ends, because that access is real. Renewal is the line
   * that matters for framing, and the CTA and the plan list were already
   * drawn on it - only the words at the top were not.
   */
  const managingLivePlan = subscriptionIsRenewing(activeSub);
  /**
   * Cancelled, but the paid period has not run out yet.
   *
   * The third state, and it needs its own words. Collapsing it into the
   * brand-new case got the framing less wrong - it stopped saying "Change
   * your plan" to someone with no plan to change - but it still greeted a
   * returning customer as a stranger, on a screen they reached by tapping
   * "your access ends soon" on their own home screen. They know what the app
   * is. They are here to renew, and the screen should say so.
   */
  const renewingLapsedPlan = !!activeSub && !managingLivePlan;
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

  /**
   * Open the gate only if the row we just wrote actually grants access.
   *
   * markSubscribed() used to be called on any recordCompletedPurchase that
   * did not come back 'unmatched'. That is a different question from the one
   * the gate asks, and the two could disagree: restoring a subscription that
   * had already run out wrote an 'active' row with an expiry in the past,
   * this screen let the customer in, and the next sync called
   * getActiveSubscription - which correctly refuses a past expiry - and threw
   * them straight back out. Two seconds inside the app, repeatable on every
   * tap of Restore.
   *
   * Asking getActiveSubscription here means the screen and the gate cannot
   * reach different conclusions: it is literally the same function.
   */
  const openGateIfEntitled = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    const row = await getActiveSubscription(user.id).catch(() => null);
    if (!row) return false;
    setActiveSub(row);
    activeSubRef.current = row;
    markSubscribed();
    return true;
  }, [user, markSubscribed]);

  const subscribe = useCallback(
    async (plan: PlanDef, current: DBSubscription | null) => {
      setMessage(null);
      setPurchasing(true);
      try {
        // Switching from an existing RevenueCat subscription passes the old
        // product id plus a replacement mode. Mode is chosen by absolute
        // price, so monthly->yearly is treated as an upgrade.
        if (!user) throw new Error(t('paywall.signInFirst'));
        const currentPlan = current ? planBySlug(current.plan_slug) : null;
        // A cancelled-but-unexpired subscription is still an entitlement, but
        // it is NOT something Play will let us replace - there is no renewal
        // left to swap. Sending the change flow anyway is what produced Play's
        // "we were unable to change your plan" for anyone who cancelled and
        // then came back. Buying plainly is the resubscribe path.
        const switching =
          !!currentPlan && currentPlan.slug !== plan.slug && subscriptionIsRenewing(current);
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
          setMessageTone('error');
          setMessage(t('paywall.purchaseReceivedButPlanCould'));
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
        if (!(await openGateIfEntitled())) {
          // Play took the money but what came back does not entitle anyone.
          // Say so instead of opening a door that shuts again on the next
          // sync; support can sort out a purchase we can see, and cannot
          // sort out one the customer never mentioned because the app
          // appeared to work for two seconds.
          setMessageTone('error');
          setMessage(t('paywall.purchaseReceivedButPlanCould'));
          return;
        }
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
        // "Play is still processing your payment" and "you already own this,
        // restoring it now" are outcomes, not errors. Both mean the money is
        // fine and nothing needs doing again.
        setMessageTone(failure.pending || failure.restorable ? 'info' : 'error');
        setMessage(t(failure.messageKey));
        if (failure.restorable) {
          // They already own it. Restoring is the fix; asking them to buy
          // again would take a second payment for the same thing.
          await handleRestoreRef.current?.();
        }
      } finally {
        setPurchasing(false);
      }
    },
    // The gate is now opened through openGateIfEntitled rather than by
    // calling markSubscribed here, and that helper is memoised on the same
    // stable [user, markSubscribed] - so this handler is not re-created on
    // every render either.
    [user, openGateIfEntitled, t],
  );

  // Keep looking for an entitlement for as long as this screen is the whole
  // app (`!gateOpen`), rather than only once on mount.
  //
  // A renewal does not arrive when this screen opens; it arrives whenever
  // Google gets round to charging the card, which can be minutes after the old
  // period lapsed. The mount sync above fires far too early to see it, and
  // behind the gate there is no other screen left mounted to sync later - so
  // without this the user sat on the paywall, already charged, until they
  // force-killed the app. Asking RevenueCat as well as our own backend matters
  // because RevenueCat knows about the renewal well before our webhook has
  // been processed.
  //
  // The interval backs off (15s up to 5 min) so a paywall left open all day
  // does not sit there hammering the network on a phone in someone's pocket.
  // Not needed for a subscriber who reached this screen as "Manage Plan",
  // hence the `gateOpen` guard (AuthContext's gate value, distinct from this
  // screen's own `subscribed`, which is derived from the local row).
  useEffect(() => {
    if (!user || gateOpen) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 15_000;

    const tick = () => {
      if (cancelled) return;
      // Both paths raise the gate through AuthContext: the sync via its
      // onSyncComplete listener, RevenueCat via onCustomerInfoChange. This
      // screen unmounts by itself the moment either lands.
      syncNow(user.id).catch(() => {});
      refreshCustomerInfo(user.id).catch(() => {});
      // Same network coming back is the same reason to re-ask the store. A
      // paywall that opened while the phone had no signal is otherwise stuck
      // showing "--" behind a dead button for as long as it stays open, which
      // on the gate root means for as long as the app is running.
      if (pricingStateRef.current !== 'ready') {
        loadPricingRef.current?.();
      }
      delay = Math.min(delay * 2, 300_000);
      timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user, gateOpen]);

  // Ask the store for prices and trial eligibility, and be re-runnable.
  //
  // Kept out of the mount effect precisely so it can be called again: from the
  // backoff poll above when the network returns, and from the retry the
  // customer can tap. One failed lookup used to be final.
  const loadPricing = useCallback(async () => {
    if (!user) return;
    setPricingState((s) => (s === 'ready' ? s : 'loading'));
    try {
      const ready = await initBilling(user.id);
      if (!mountedRef.current) return;
      setBillingReady(ready);
      if (!ready) {
        setMessageTone('error');
        setMessage(t('paywall.billingIsNotAvailableOn'));
        setPricingState('failed');
        return;
      }
      // A retry that succeeds has to clear the notice the failure put up, or
      // the screen tells someone billing is unavailable on a device that has
      // just quoted them three prices.
      setMessage((m) => (m === t('paywall.billingIsNotAvailableOn') ? null : m));
      const p = await getPlanPricing(user.id);
      if (!mountedRef.current) return;
      pricingRef.current = p;
      setPricing(p);
      // No package matched any plan: the store or RevenueCat has no
      // purchasable products for this build (empty/misconfigured offering,
      // wrong SDK key, product not live). Say so and block the CTA rather
      // than showing catalogue prices behind a button that can only fail
      // once tapped.
      setPricingState(Object.keys(p).length === 0 ? 'failed' : 'ready');
    } catch {
      if (mountedRef.current) setPricingState('failed');
    }
  }, [user, t]);
  loadPricingRef.current = loadPricing;

  // Mount: warm the billing connection, load the current subscription,
  // pre-select the featured plan (or the CURRENT plan for subscribers, so
  // they can switch), then continue a purchase the subscribe sheet started
  // before authentication interrupted it (the web sheet's triggerPurchase()
  // running right after register/login).
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (user) {
        loadPricing();
        hasUsedFreeSession(user.id)
          .then((used) => {
            if (mounted) setFreeSessionLeft(!used);
          })
          .catch(() => {});
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
      // Never preselect the plan a RENEWING subscriber already owns: there is
      // nothing to buy there. Once they have cancelled it is the opposite -
      // the plan they just lost is the one they are most likely coming back
      // for, so it leads.
      const renewing = subscriptionIsRenewing(current);
      const notCurrent = PLANS.filter((p) => p.slug !== current?.plan_slug);
      setSelectedPlan(
        !current
          ? featuredPlan().slug
          : renewing
            ? (notCurrent.find((p) => p.is_featured) ?? notCurrent[0])?.slug ?? null
            : current.plan_slug ?? featuredPlan().slug,
      );

      // PEEK, then clear only once it has been acted on.
      //
      // Consuming on read threw the choice away whenever this screen was torn
      // down mid-await, which is exactly what happens when the gate opens
      // underneath it. Someone who picked a plan in the sheet, created an
      // account and typed a verification code to buy THAT plan would come back
      // to a paywall that had forgotten which one - and to a purchase flow
      // that never resumed.
      const pendingSlug = await peekPendingPlan();
      if (!mounted) return;
      const pending = planBySlug(pendingSlug);
      if (!pending) {
        return;
      }
      if (current) {
        // Nothing left to resume - they already hold a subscription. Drop it
        // so it cannot fire at some unrelated moment later.
        clearPendingPlan();
        return;
      }
      clearPendingPlan();
      setSelectedPlan(pending.slug);
      subscribe(pending, current);
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
        setMessageTone('info');
        setMessage(t('paywall.noActiveSubscriptionWasFound'));
        return;
      }
      const result = await recordCompletedPurchase(user.id, purchase);
      if (result === 'unmatched') {
        setMessageTone('error');
        setMessage(t('paywall.restoredPurchaseCouldNotBe'));
        return;
      }
      // 'expired' means the store handed back a subscription that has already
      // finished. There is nothing to restore, and it is the same answer as
      // finding nothing at all.
      if (result === 'expired' || !(await openGateIfEntitled())) {
        setMessageTone('info');
        setMessage(t('paywall.noActiveSubscriptionWasFound'));
        return;
      }
      setAutoRenewing(purchase.autoRenewing);
      setShowAutoRenewalNotice(true);
    } catch (e: any) {
      const failure = describePurchaseFailure(e);
      if (!failure.cancelled) {
        console.warn('[billing] restore failed', failure.code, failure.detail);
        setMessageTone(failure.pending ? 'info' : 'error');
        setMessage(t(failure.messageKey));
      }
    } finally {
      setPurchasing(false);
    }
  };
  handleRestoreRef.current = handleRestore;
  pricingStateRef.current = pricingState;
  // Purchasing is impossible only when the store told us so. While the lookup
  // is still in flight the cards show a placeholder rather than a price we
  // would have to correct, and the CTA waits with them.
  const pricesPending = pricingState === 'loading';
  const offeringsUnavailable = pricingState === 'failed';
  const selectedPlanDef = planBySlug(selectedPlan);
  // "Switch to X" only describes a real product change. After a cancellation
  // any purchase is a fresh one, so the CTA must not promise a switch that
  // Play will refuse to perform.
  const isUpgrade =
    !!activeSub
    && subscriptionIsRenewing(activeSub)
    && !!selectedPlan
    && activeSub.plan_slug !== selectedPlan;
  const selectedPricing = selectedPlanDef ? pricing[selectedPlanDef.slug] : undefined;
  // Advertise a trial only when the store actually serves one to THIS customer
  // (see getPlanPricing) and there is no current subscription - a plan switch
  // is a product change, never a new trial.
  const trialDays = !activeSub ? selectedPricing?.freeTrialDays ?? null : null;
  // Stated once above the cards rather than badged on each. Read from live
  // store data like every other trial claim here: if the offer is withdrawn, or
  // this customer has subscribed before and is therefore ineligible, Play
  // returns no free phase and this simply does not render. We never advertise a
  // trial the store will not actually grant.
  //
  // The sentence is "EVERY plan starts with...", so it may only appear when
  // that is literally true. It used to take `.find()` - the first plan that
  // happened to have a trial - and print that one number as though it covered
  // all three, which is a promise the other two plans would not have kept.
  const perPlanTrials = PLANS.map((plan) => pricing[plan.slug]?.freeTrialDays ?? null);
  const everyPlanTrialDays =
    !activeSub
    && perPlanTrials.length > 0
    && perPlanTrials.every((d) => d != null && d === perPlanTrials[0])
      ? perPlanTrials[0]
      : null;
  // Feeds the renewal disclosure, so the period must be the reader's own, not
  // an English suffix concatenated on.
  const selectedPriceLabel = selectedPlanDef
    ? `${selectedPricing?.priceString || `$${selectedPlanDef.price.toFixed(2)}`}${t(planPeriodKey(selectedPlanDef.slug))}`
    : '';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Watermark />

      {/* Header: three real columns.
          The left control was position:absolute over a centred title, so
          nothing reserved room for it and "Log out" ran straight under the
          title - harmless in English, plainly broken in Hungarian
          ("Kijelentkezés") and every other language where the word is long.
          A column cannot overlap its neighbour. */}
      <View style={styles.header}>
        <View style={styles.headerSide}>
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
              <Text
                style={styles.logoutText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {t('paywall.logOut')}
              </Text>
            )}
          </TouchableOpacity>
        )}
        </View>
        {/* Some of these run long once translated ("Előfizetés
            kezelése", "Reînnoiește planul"), and the header centres the
            title between an absolutely positioned left button and the edge,
            so it shrinks rather than sliding under the button. */}
        <Text
          style={styles.headerTitle}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {managingLivePlan
            ? t('paywall.managePlan')
            : renewingLapsedPlan
              ? t('paywall.renewPlan')
              : t('paywall.premium')}
        </Text>
        {/* Balances the left column so the title reads as centred. */}
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>
          {managingLivePlan
            ? t('paywall.changeYourPlan')
            : renewingLapsedPlan
              ? t('paywall.renewYourPlan')
              : t('paywall.startYourJourney')}
        </Text>

        {everyPlanTrialDays ? (
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
              {t('paywall.everyPlanStartsWithTrial', { count: everyPlanTrialDays })}
            </Text>
          </View>
        ) : null}

        {/* What premium unlocks. Hidden for subscribers, who reach this screen
            as "Manage Plan" and are being asked to switch, not to buy in. */}
        {!managingLivePlan && (
          <View style={styles.benefits}>
            {PREMIUM_BENEFIT_KEYS.map((benefit) => (
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
                <Text style={styles.benefitText}>{t(benefit)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Plan cards */}
        <View style={styles.plansWrap}>
          {(activeSub && subscriptionIsRenewing(activeSub)
            // Managing a live plan: show only what they can move TO. Rendering
            // the plan they already own as a purchasable card invites a tap
            // that cannot succeed.
            //
            // Once cancelled, that reasoning inverts. Hiding their old plan
            // left the one thing they came to do - take it back - with no
            // button anywhere on the screen, and pushed them onto a different
            // plan whose change flow Play then refused outright.
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
                // The cards ARE a radio group - one of three, exactly one
                // chosen - and only the guest sheet said so. A screen reader
                // on the paywall announced three unrelated buttons and never
                // which one was selected, on the screen where the selection
                // decides what gets charged.
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${t(planNameKey(plan.slug))}, ${
                  pricing[plan.slug]?.priceString ?? ''
                }`}
                style={[styles.planCard, selected && styles.planCardSelected]}
                onPress={() => setSelectedPlan(plan.slug)}
              >
                {plan.is_featured && (
                  <View style={styles.featuredBadge}>
                    <Text style={styles.featuredBadgeText}>{t('paywall.bestValue')}</Text>
                  </View>
                )}
                <View style={styles.planRow}>
                  <View style={styles.planInfo}>
                    <Text style={styles.planName}>{t(planNameKey(plan.slug))}</Text>
                    <Text style={styles.planDescription}>
                      {t(planDescriptionKey(plan.slug))}
                    </Text>
                    {savings ? (
                      <View style={styles.savingsPill}>
                        <Text style={styles.savingsPillText}>
                          {t('paywall.savePercent', { percent: savings })}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.planPriceWrap}>
                    {/* Never a price we would have to take back. The store's
                        own localized string, or a placeholder while we are
                        still asking - not the USD catalogue figure, which is
                        the wrong number in every market but one and reads as
                        a bait-and-switch when it changes a second later. */}
                    {pricing[plan.slug]?.priceString ? (
                      <Text style={styles.planPrice}>
                        {pricing[plan.slug]?.priceString}
                      </Text>
                    ) : pricesPending ? (
                      <View style={styles.pricePlaceholder} />
                    ) : (
                      <Text style={styles.planPrice}>--</Text>
                    )}
                    {perMonth ? (
                      <Text style={styles.planPerMonth}>
                        {t('common.perMonth', { price: perMonth })}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* A store lookup that failed is usually the network, not a broken
            catalogue, so it gets a retry rather than a dead end. Without one
            the only cure for opening the paywall a second too early was
            force-killing the app. */}
        {offeringsUnavailable ? (
          <View style={styles.retryWrap}>
            <Text style={styles.message}>{t('paywall.offeringsUnavailable')}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadPricing}>
              {/* Borrowed rather than minted: this exact word already exists,
                  translated, in all 29 locales. */}
              <Text style={styles.retryBtnText}>{t('progress.tryAgain')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {message ? (
          <Text
            style={[
              styles.message,
              messageTone === 'error' ? styles.messageError : styles.messageInfo,
            ]}
          >
            {message}
          </Text>
        ) : null}

        {/* The fine print and the recovery action, moved off the fixed bar.
            They were pinned to the bottom of the screen, where three
            sentences of legal text plus a Restore link grew the bar past
            200px - a third of a small phone - and pushed the plan cards, the
            only thing on this screen anyone is deciding between, below the
            fold. Both belong in the page; neither is what the reader is here
            to do. The renewal disclosure stays on the bar, next to the button
            it describes, which is where Play requires it.

            Still shown to subscribers, as it always was: switching a plan is
            still a purchase, and these are the only links to those pages from
            this screen.

            The trailing "and the app store terms." went with the move. It was
            a bare English literal at the end of an otherwise fully translated
            paragraph, printed verbatim into all 29 locales - and the sentence
            before it already names the app store. */}
        <Text style={styles.legalText}>
          {t('paywall.paymentProcessedSecurely')}{' '}
          {t('paywall.uninstallingDoesNotCancel')}{' '}
          {t('paywall.byContinuingYouAgree')}
        </Text>
        {/* Real buttons, not onPress on a nested <Text>.
            The links used to be words inside an 11px paragraph, so the tap
            target was eleven pixels tall - four times smaller than the 44pt
            minimum. Most taps missed, which reads as "the link does not
            work"; then a later one landed and opened a page after the reader
            had given up and moved on. Nested Text presses inside a ScrollView
            also have to win the responder from the scroll, which makes the
            same tiny target worse again. Two proper controls on their own
            row, each a full touch target. */}
        <View style={styles.legalLinkRow}>
          <TouchableOpacity
            style={styles.legalLinkBtn}
            accessibilityRole="link"
            onPress={() =>
              navigation.navigate('LegalPage', { slug: 'terms', title: t('paywall.terms') })
            }
          >
            <Text style={styles.legalLink}>{t('paywall.terms')}</Text>
          </TouchableOpacity>
          <Text style={styles.legalDot}>·</Text>
          <TouchableOpacity
            style={styles.legalLinkBtn}
            accessibilityRole="link"
            onPress={() =>
              navigation.navigate('LegalPage', {
                slug: 'privacy-policy',
                title: t('paywall.privacyPolicy'),
              })
            }
          >
            <Text style={styles.legalLink}>{t('paywall.privacyPolicy')}</Text>
          </TouchableOpacity>
        </View>
        {/* Only when there is genuinely nothing on this device to lose.
            Restore exists for someone whose entitlement is missing - a
            reinstall, a new phone, a purchase made on another device. A
            cancelled subscriber still inside their paid period has their
            entitlement right here; there is nothing to restore, and offering
            it on the renew screen just adds a second, wrong-looking answer
            next to the one they came for. Keyed on the row itself rather
            than on renewal, which is the distinction that actually matters
            for this control. */}
        {!activeSub && (
          <TouchableOpacity
            style={styles.restoreBtn}
            onPress={handleRestore}
            disabled={purchasing}
          >
            <Text style={styles.restoreBtnText}>{t('paywall.restorePurchases')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Fixed bottom CTA bar */}
      <View
        style={[styles.bottomBar, { paddingBottom: 16 + insets.bottom }]}
        onLayout={(e) => setBottomBarHeight(e.nativeEvent.layout.height)}
      >
        <TouchableOpacity
          style={[
            styles.continueBtn,
            (!selectedPlan || purchasing || !billingReady || offeringsUnavailable || pricesPending) &&
              styles.continueBtnDisabled,
          ]}
          disabled={
            !selectedPlan || purchasing || !billingReady || offeringsUnavailable || pricesPending
          }
          onPress={() => selectedPlanDef && subscribe(selectedPlanDef, activeSubRef.current)}
        >
          {purchasing ? (
            <ActivityIndicator color={COLORS.onAccent} />
          ) : (
            <Text style={styles.continueBtnText}>
              {isUpgrade
                ? t('paywall.switchToPlan', {
                    plan: selectedPlanDef ? t(planNameKey(selectedPlanDef.slug)) : '',
                  })
                : trialDays
                  ? t('paywall.startFreeTrialCta', { count: trialDays })
                  : t('paywall.subscribe')}
            </Text>
          )}
        </TouchableOpacity>
        {/* The renewal disclosure sits DIRECTLY under the button it describes,
            with nothing between them. Play requires the terms at the point of
            purchase, and a reader should not have to step over an alternative
            action to find out what the button charges them. */}
        {!purchasing && selectedPlanDef && !offeringsUnavailable && !pricesPending ? (
          <Text style={styles.renewalText}>
            {trialDays
              ? t('paywall.trialThenPrice', { count: trialDays, price: selectedPriceLabel })
              : t('paywall.priceRenewsAutomatically', { price: selectedPriceLabel })}{' '}
            {t('paywall.manageOrCancelAnytime')}
          </Text>
        ) : null}
        {/* Kept on the bar rather than buried under the fine print - a new
            account needs a visible way past the price, or the only exit it can
            find is the one that uninstalls the app.

            Quiet, though. Bold white at body size directly beside the primary
            CTA reads as the second half of a pair of equal choices, and this
            one is not: it is the way out for someone who is not ready. Muted
            weight keeps it findable without competing with the button the
            screen exists for.

            Only on the gate root; opened from Settings as Manage Plan the
            header X already does this. */}
        {!purchasing && !managingLivePlan && !canClose && (
          <TouchableOpacity
            style={styles.exploreBtn}
            accessibilityRole="button"
            // Straight to the session while there is still one to give. The
            // offer screen's own decline drops into the basics with the
            // paywall kept underneath, so nothing is lost by going here first
            // - and the label stops being a bare refusal and starts naming
            // what is actually on the other side of the tap.
            onPress={() =>
              navigation.navigate(
                (freeSessionLeft ? 'FreeSessionOffer' : 'Knowledge') as never,
              )
            }
          >
            <Text style={styles.exploreBtnText}>
              {freeSessionLeft ? t('workoutComplete.tryItNow') : t('workoutComplete.notNow')}
            </Text>
          </TouchableOpacity>
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
                  {autoRenewing ? t('paywall.on') : t('paywall.off')}
                </Text>
              </View>
              <Text style={styles.noticeBoxHint}>
                {autoRenewing
                  ? t('paywall.autoRenewOnHint')
                  : t('paywall.autoRenewOffHint')}
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
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.lg,
  },
  // Capped so a long "Log out" shrinks its own column instead of eating the
  // title's; empty on the right, where it only reserves matching space.
  headerSide: { minWidth: 44, maxWidth: '32%', justifyContent: 'center' },
  headerLeftBtn: {
    // 36px sat under both the iOS HIG and Material minimum target.
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtn: {
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
    flex: 1,
    textAlign: 'center',
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
  message: {
    marginHorizontal: 16,
    marginTop: 16,
    fontSize: 14,
  },
  // A store or payment failure is not a promotion. It was rendered in the
  // accent tint, which on this screen is the colour of every good thing -
  // trial banners, savings pills, the buy button - so "Google Play declined
  // the payment" arrived looking like an offer.
  messageError: { color: COLORS.danger },
  messageInfo: { color: COLORS.accentSoft },
  retryWrap: {
    alignItems: 'center',
  },
  retryBtn: {
    marginTop: SPACE.md,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  retryBtnText: {
    ...TYPE.bodySm,
    fontWeight: '700',
    color: COLORS.white,
  },
  // Stands in for the price while the store is still answering. Sized to the
  // text it replaces so the card does not resize when the real figure lands.
  pricePlaceholder: {
    width: 62,
    height: 19,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface2,
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
  exploreBtn: { alignItems: 'center', paddingVertical: SPACE.md, minHeight: 44 },
  exploreBtnText: { ...TYPE.body, color: COLORS.textMuted, fontWeight: '600' },
  restoreBtn: {
    marginTop: SPACE.lg,
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
    marginTop: SPACE.xl,
    paddingHorizontal: SPACE.xl,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    color: COLORS.textDim,
  },
  legalLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
    marginTop: SPACE.xs,
  },
  legalLinkBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACE.sm,
  },
  legalDot: { fontSize: 12, color: COLORS.textDim },
  legalLink: {
    fontSize: 12,
    fontWeight: '600',
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




