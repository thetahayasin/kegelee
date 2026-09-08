import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Linking,
  I18nManager,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useNavigation,
  useRoute,
  NavigationProp,
  RouteProp,
} from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { DISABLED_OPACITY, TYPE, SPACE, RADIUS, Palette } from '../../theme/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import { track } from '../../services/events';
import {
  planSwitchDirection,
  purchaseFailureDetail,
} from '../../services/eventClassifiers';
import { useAuth } from '../../context/AuthContext';
import {
  getActiveSubscription,
  subscriptionIsRenewing,
  DBSubscription,
} from '../../db/queries';
import { entitledSubscription } from '../../services/entitlement';
import { planMonths, perMonthLabel, savingsPercent } from '../../constants/pricing';
import {
  PLANS,
  PlanDef,
  featuredPlan,
  planBySlug,
  planNameKey,
  planDescriptionKey,
  planPeriodKey,
  planPeriodNounKey,
} from '../../constants/plans';
import {
  initBilling,
  requestPlanPurchase,
  restoreRevenueCatPurchases,
  recordCompletedPurchase,
  getPlanPricing,
  describePurchaseFailure,
  refreshCustomerInfo,
  manageSubscriptionUrl,
  PlanPricing,
  replacementModeFor,
  CHARGE_FULL_PRICE,
} from '../../services/billing';
import { planSwitchFor } from '../../services/planSwitch';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { syncNow } from '../../services/sync';
import { formatSubscriptionDate } from '../../utils/localDate';
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

/**
 * Whether a subscription row is still inside its free trial.
 *
 * Two sources because either can be stale on its own. `status` is written from
 * the store's periodType at purchase and only changes when something refreshes
 * the row, so it can still read `trialing` after the trial converted - and it
 * can read `active` on a row that arrived from the backend mid-trial.
 * `trial_ends_at` is a date and settles the second case.
 *
 * Both errors point the same way on purpose: this decides whether a plan change
 * is allowed to take money today, so an unsure answer is a yes, and the worst
 * case is a charge that waits until the next renewal instead of one that
 * surprises somebody.
 */
const stillOnTrial = (sub: DBSubscription | null): boolean => {
  if (!sub) return false;
  if (String(sub.status || '').toLowerCase() === 'trialing') return true;

  const ends = sub.trial_ends_at ? Date.parse(sub.trial_ends_at) : NaN;
  return Number.isFinite(ends) && ends > Date.now();
};

export const PaywallScreen = () => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<any>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Paywall'>>();
  const { user, logout, markSubscribed, subscribed: gateOpen } = useAuth();

  /**
   * Which door the reader came through.
   *
   * There are six ways onto this screen - a padlocked exercise, the difficulty
   * picker, the reminders row, the measure card, Settings, the end of a
   * session - and until now every one of them arrived as the same anonymous
   * "someone saw the paywall". Which prompt actually sells is the single most
   * useful thing this screen can report, and it costs one route param.
   *
   * 'direct' covers the routes with nothing to say: a deep link, or any push
   * that did not name itself. The param is optional in RootStackParamList for
   * exactly that reason, so this reads it through the navigator's own type
   * rather than asserting a shape of its own.
   */
  const source = route.params?.source ?? 'direct';

  const [activeSub, setActiveSub] = useState<DBSubscription | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null); // plan slug
  // Localized store prices + real trial eligibility, keyed by plan slug.
  // Empty until RevenueCat offerings load (or when they can't - offline, store
  // unavailable), in which case the cards show a placeholder, the disclosure
  // does not render at all, and no trial is ever advertised. The catalogue's
  // USD figure is never put in front of a reader.
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
  // Where to send someone to cancel, change payment method or resume, and
  // whether to show that route to somebody who has no local subscription row.
  // Play answering "you already own this" is proof of a subscription the app
  // cannot see, and the only screen that can settle it is Play's.
  const [manageUrl, setManageUrl] = useState<string | null>(null);
  const [showManageLink, setShowManageLink] = useState(false);
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
  const handleRestoreRef =
    useRef<((opts?: { auto?: boolean }) => Promise<void>) | null>(null);
  /**
   * Synchronous re-entrancy guards for the two handlers that spend money.
   *
   * `purchasing` cannot do this job: it is state, so the button it disables
   * only stops taking taps on the next render. A second tap in the same frame,
   * a tap racing a resumed purchase, or Restore firing while a purchase is
   * mid-flight all got through - and two overlapping Play sheets for the same
   * product is the worst possible place for a race.
   */
  const subscribeInFlightRef = useRef(false);
  const restoreInFlightRef = useRef(false);
  // When this visit started, and what was selected when it ended. Both read
  // from a listener registered once, so neither can be state.
  const openedAtRef = useRef(Date.now());
  const selectedPlanRef = useRef<string | null>(null);
  // Whether this visit ended in a purchase. A reader who paid and then closed
  // the screen did not dismiss the paywall, and counting them as a dismissal
  // would make the number meaningless - every buyer closes it eventually.
  const purchasedRef = useRef(false);
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
  // Whether this screen has somewhere to go back to.
  //
  // Since the app went freemium there is no subscription gate: this screen is
  // always PUSHED - from Settings, from a locked tab, from a padlocked
  // exercise - so in practice this is always true and the header always shows
  // a close button. The Log out fallback below is kept for the case where
  // this screen is ever made a stack root again, so that it can never become
  // a room with no door.
  //
  // Still derived from real navigation history rather than from `subscribed`,
  // which is a different question: that flag is about entitlement, this is
  // about the stack.
  const canClose = navigation.canGoBack();


  /**
   * What will happen if this plan is tapped, in one line, BEFORE it is tapped.
   *
   * An upgrade and a downgrade behave completely differently - one starts now
   * with the unused time credited, the other waits for the current period to
   * run out - and the app knew which and said nothing. The reader met the
   * difference in Play's own confirmation sheet, phrased generically, after
   * they had already decided. Saying it here is also the cheapest way to
   * prevent the "I paid and nothing changed" message about a downgrade
   * working exactly as designed.
   */
  const switchTimingKey = (plan: PlanDef): string | null => {
    // Keyed on planSwitchFor, the same function the CTA and the purchase call
    // use. A cancelled-but-still-running subscription IS a switch, so it gets
    // the notice too - it used to be the one case that silently didn't.
    const { switching } = planSwitchFor(activeSub, plan.slug);
    const from = activeSub ? planBySlug(activeSub.plan_slug) : null;
    if (!from || !switching) {
      return null;
    }
    /**
     * Asked of the function that picks the replacement mode, rather than
     * re-deriving "is this an upgrade" alongside it.
     *
     * There used to be a second copy of that rule right here, and the two
     * drifted apart across several changes of mode - the screen promising
     * credited time while the mode being sent postponed everything to the next
     * renewal, and later one line claiming both directions behaved
     * identically. A notice that contradicts what Play then does is worse than
     * no notice at all.
     */
    // A trial switch takes nothing today, like a downgrade, but "you keep the
    // time you have paid for" describes money a trial user never spent, on the
    // one screen where every sentence is about money.
    if (stillOnTrial(activeSub)) return 'paywall.switchDuringTrial';

    return replacementModeFor(planMonths(plan), planMonths(from)) === CHARGE_FULL_PRICE
      ? 'paywall.switchStartsNow'
      : 'paywall.switchStartsLater';
  };

  /**
   * Recorded on MOUNT, not on the button that navigated here.
   *
   * Those are different numbers: a tap that starts a transition the reader
   * backs out of is not a paywall view, and counting it as one would inflate
   * exactly the metric this exists to measure.
   */
  useEffect(() => {
    track(user?.id, 'paywall_viewed', source, renewingLapsedPlan ? 'renew' : 'new');
    // Once per mount. Re-firing when the lapsed flag resolves would double
    // count every visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Leaving without buying, and how long they stayed.
   *
   * On `beforeRemove` rather than on the close button, because the button is
   * only one of the ways out: the hardware back key and the swipe-back gesture
   * are the other two, and instrumenting the button alone would report every
   * gesture-dismissal as a reader who is still on the screen. The listener
   * fires for all three and for nothing else - a navigator swapped out from
   * underneath this screen unmounts it without a removal, which is right,
   * since that is not somebody walking away.
   */
  useEffect(
    () =>
      navigation.addListener('beforeRemove', () => {
        if (purchasedRef.current) return;
        track(user?.id, 'paywall_dismissed', source, null, {
          seconds: Math.round((Date.now() - openedAtRef.current) / 1000),
          plan_selected: selectedPlanRef.current,
        });
      }),
    [navigation, user?.id, source],
  );

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
      // Synchronous, and a ref rather than the `purchasing` state.
      //
      // setPurchasing only disables the button on the NEXT render, so a double
      // tap - or the CTA and a resumed purchase firing together - both got
      // past it and opened two Play sheets for the same plan. A ref flips
      // before this function yields, which is the only thing a second tap in
      // the same frame can see.
      if (subscribeInFlightRef.current) return;
      subscribeInFlightRef.current = true;
      setMessage(null);
      setPurchasing(true);

      // Switching from an existing RevenueCat subscription passes the old
      // product id plus a replacement mode. Mode is chosen by billing period,
      // so monthly->yearly is treated as an upgrade.
      //
      // Both are computed outside the try because the CATCH needs them: what
      // to do about an "already purchased" rejection depends entirely on
      // whether this was a switch.
      const currentPlan = current ? planBySlug(current.plan_slug) : null;
      // Any subscription the Google account still holds makes this a product
      // CHANGE, cancelled-but-running included. See planSwitchFor: requiring a
      // live renewal here is what sent a returning customer down the plain
      // purchase path, where Play refuses to sell a subscription the account
      // already owns.
      const { switching } = planSwitchFor(current, plan.slug);

      /**
       * Up, down, or their first one - decided the same way the purchase
       * itself is.
       *
       * Only counted as a switch when the caller is actually going to send a
       * product change; a `current` row that planSwitchFor rejects means this
       * is a plain purchase, and reporting it as an upgrade would put it in a
       * bucket whose whole point is "money moved between plans today".
       */
      const direction = planSwitchDirection(
        planMonths(plan),
        switching && currentPlan ? planMonths(currentPlan) : null,
      );

      try {
        track(user?.id, 'purchase_started', plan.slug, direction, {
          from_plan: currentPlan?.slug ?? null,
        });
        if (!user) throw new Error(t('paywall.signInFirst'));
        /**
         * Rank by BILLING PERIOD, not by price.
         *
         * This compared prices, and for today's three plans that happens to
         * give the right answer because monthly < quarterly < yearly in total
         * cost as well as in length. It is still the wrong question, in two
         * directions at once:
         *
         *  - Total price is not the ranking. A discounted yearly priced under
         *    a quarterly - a sale, or a market where the SKUs are priced
         *    independently - would defer a genuine upgrade.
         *  - Price PER MONTH is not the ranking either, and is worse: the
         *    yearly plan is the cheapest per month, so that rule would call
         *    monthly -> yearly a downgrade and make the reader wait a month
         *    for the plan they just paid a year for.
         *
         * What Play's replacement modes actually turn on is how much the
         * reader has committed. A longer period is the upgrade: start it now
         * and credit whatever is left of the old one. A shorter period is the
         * downgrade: let the paid period run out first, so nobody loses time
         * they have already paid for. Length is also the one input that cannot
         * drift with a sale or a currency.
         */
        // Mid-trial switches must not be charged: see replacementModeFor.
        const mode = currentPlan
          ? replacementModeFor(
              planMonths(plan),
              planMonths(currentPlan),
              stillOnTrial(current),
            )
          : null;
        const purchase = await requestPlanPurchase(user.id, plan, switching && currentPlan ? {
          oldProductId: currentPlan.store_product_id,
          replacementMode: mode ?? undefined,
        } : undefined);

        const result = await recordCompletedPurchase(user.id, purchase);
        if (result === 'unmatched') {
          setMessageTone('error');
          setMessage(t('paywall.purchaseReceivedButPlanCould'));
          return;
        }
        // 'expired' is a different failure from 'unmatched' and was reported as
        // one. The plan matched perfectly well; what came back has an expiry in
        // the past, so there is nothing to unlock. Telling that customer their
        // "plan could not be matched" sends them to support with the wrong
        // problem, and sends support looking for a catalogue bug that is not
        // there.
        if (result === 'expired') {
          setMessageTone('error');
          setMessage(t('paywall.purchaseAlreadyEnded'));
          return;
        }

        // Everything that is left is a real purchase: 'duplicate' means the row
        // was already on disk (a resumed purchase, a second push of the same
        // token), which is still money that changed hands.
        purchasedRef.current = true;
        track(
          user.id,
          'purchase_completed',
          plan.slug,
          // A switch is never a new trial, so its direction is the answer even
          // when the store still reports the customer as trialing.
          switching && currentPlan
            ? direction
            : purchase.periodType === 'TRIAL'
              ? 'trial'
              : 'new',
          {
            from_plan: currentPlan?.slug ?? null,
            replacement_mode: mode,
            result,
          },
        );
        // A switch that takes no money today still ends here as a confirmation
        // rather than as an activation: they already had access and keep it,
        // on the plan they are already paying for, until it renews at the new
        // price. The gate is opened below regardless, because the row on disk
        // is what it reads.
        const noChargeSwitch = switching && mode !== CHARGE_FULL_PRICE;
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
        if (noChargeSwitch) {
          const endsOn = formatSubscriptionDate(current?.ends_at);
          // 'info', the same tone as the other outcomes-that-are-not-errors.
          setMessageTone('info');
          setMessage(
            t(endsOn ? 'paywall.switchQueuedOn' : 'paywall.switchQueued', {
              plan: t(planNameKey(plan.slug)),
              date: endsOn,
            }),
          );
          return;
        }
        setAutoRenewing(purchase.autoRenewing);
        setShowAutoRenewalNotice(true);
      } catch (e: any) {
        const failure = describePurchaseFailure(e);
        // Recorded BEFORE the cancelled branch returns. "Changed their mind" is
        // the single most common outcome on this screen and the one it is worth
        // knowing the size of; dropping it would leave the failure report
        // showing only the rare, alarming codes and none of the ordinary ones.
        track(user?.id, 'purchase_failed', plan.slug, purchaseFailureDetail(failure), {
          code: failure.code,
          detail: failure.detail,
        });
        if (failure.cancelled) {
          // They backed out of the store sheet. Saying anything at all here
          // reads as an error they did not cause.
          return;
        }
        // The raw code and SDK string are for us, not for the customer.
        console.warn('[billing] purchase failed', failure.code, failure.detail);
        // "Play is still processing your payment" and "you already own this"
        // are outcomes, not errors. Both mean the money is fine and nothing
        // needs doing again.
        setMessageTone(failure.pending || failure.restorable ? 'info' : 'error');
        // The code rides along for the unclassified case, where it is the
        // only thing that makes a support screenshot actionable.
        const base = t(failure.messageKey, { code: failure.code || 'none' });
        if (failure.restorable && switching) {
          /**
           * They already own something - but NOT this plan, or we would not
           * have been switching.
           *
           * Restore is the wrong answer here and was the one being given
           * automatically. It re-reads the subscription they already have and
           * writes it back down, so the screen refreshed, said nothing had
           * changed, and left the person who just tried to change plans
           * looking at the plan they were trying to leave. Play refused the
           * CHANGE; the place that can settle it is Play.
           */
          setMessage(base);
          setShowManageLink(true);
          return;
        }
        setMessage(failure.restorable ? `${base} ${t('paywall.restoringPurchase')}` : base);
        if (failure.restorable) {
          // They already own it. Restoring is the fix; asking them to buy
          // again would take a second payment for the same thing.
          await handleRestoreRef.current?.({ auto: true });
        }
      } finally {
        subscribeInFlightRef.current = false;
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
      }
      // A subscription can renew (or be bought on another device) while the
      // app is closed, leaving the local rows stale - and no other screen is
      // reachable behind the gate to trigger a sync. Pull here; when the pull
      // reveals an entitlement, AuthContext's onSyncComplete listener reopens
      // the gate live and this screen swaps away by itself.
      if (user) {
        syncNow(user.id).catch(() => {});
      }
      /**
       * The plan this account actually owns, by the same rule the rest of the
       * app uses - NOT a raw read of the local subscriptions table.
       *
       * This screen used to ask `getActiveSubscription`, which is a read of
       * the mirror, and the mirror can still look live for a subscription the
       * backend has already expired. Everything downstream of this value is
       * then wrong in the worst possible direction: the plan gets a "current
       * plan" badge, its card is DISABLED because there is nothing to buy on a
       * plan you already own, and the header offers to change a plan instead
       * of selling one. A lapsed customer arriving to re-subscribe was shown
       * their dead plan and blocked from buying it back, and clearing app
       * storage did not help because the next pull put the same row back.
       */
      const current = user
        ? await entitledSubscription(user.id, !!user.is_admin).catch(() => null)
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

      // The stashed-plan resume went with the guest subscribe sheet that used
      // to set it. Nothing writes @pending_plan_slug any more, so reading it
      // could only ever fire a purchase from a value left on disk by a build
      // several versions old.

      // A subscriber gets the route to Play. Fetched here rather than at press
      // time so the link is ready when the button is, and because RevenueCat's
      // managementURL needs a network round trip that must not sit between a
      // tap and a screen.
      if (user && current) {
        const url = await manageSubscriptionUrl(user.id, current.plan_slug).catch(() => null);
        if (mounted && url) setManageUrl(url);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Play has told us this Google account already owns a subscription that the
   * app has no local row for, so the manage route has to exist without one.
   *
   * Fetched lazily rather than on mount because this is the rare path: almost
   * nobody hits it, and it is not worth a network call on every paywall open
   * for a link that will not be shown.
   */
  useEffect(() => {
    if (!user || !showManageLink || manageUrl) return;
    let alive = true;
    manageSubscriptionUrl(user.id, activeSubRef.current?.plan_slug ?? null)
      .then((url) => {
        if (alive && url) setManageUrl(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, showManageLink, manageUrl]);

  const continueToApp = () => {
    setShowAutoRenewalNotice(false);
    // Flips the entitlement in context, which is what unlocks the progress
    // tab, the schedule, the level picker and the rest of the catalogue - and
    // what lets the training day start counting again from where the free
    // allowance stopped it. Then back into the app.
    markSubscribed();
    if (navigation.canGoBack()) {
      navigation.navigate('MainTabs');
    }
  };

  // The escape hatch for the case described at `canClose`: a paywall with no
  // way back would otherwise trap the account with no way to sign out.
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  /**
   * `auto` means the customer did not ask for this - a purchase came back
   * "you already own it" and we are resolving it for them.
   *
   * It exists because clearing the message unconditionally erased the only
   * explanation on screen. The sequence was: purchase fails with "you already
   * have an active subscription, restoring it now", this handler immediately
   * wipes that sentence, and the restore then either succeeds silently or ends
   * with "no active subscription was found" - which flatly contradicts the
   * message the customer just saw and no longer has. The manual Restore button
   * still clears, because there the message would be stale output from a
   * previous attempt.
   */
  const handleRestore = async (opts?: { auto?: boolean }) => {
    if (!user) return;
    if (restoreInFlightRef.current) return;
    restoreInFlightRef.current = true;
    if (!opts?.auto) setMessage(null);
    setPurchasing(true);
    // Which of the two restores this is. An automatic one follows a store
    // rejection and says something about the purchase flow; a manual one is
    // somebody who believes they already paid, and how often that ends in
    // "nothing found" is a support-load number.
    track(user.id, 'restore_attempted', opts?.auto ? 'auto' : 'manual');
    try {
      const purchase = await restoreRevenueCatPurchases(user.id);
      if (!purchase) {
        track(user.id, 'restore_finished', 'nothing_found');
        setMessageTone('info');
        setMessage(t('paywall.noActiveSubscriptionWasFound'));
        return;
      }
      const result = await recordCompletedPurchase(user.id, purchase);
      if (result === 'unmatched') {
        track(user.id, 'restore_finished', 'unmatched');
        setMessageTone('error');
        setMessage(t('paywall.restoredPurchaseCouldNotBe'));
        return;
      }
      // 'expired' means the store handed back a subscription that has already
      // finished. There is nothing to restore, and it is the same answer as
      // finding nothing at all.
      if (result === 'expired' || !(await openGateIfEntitled())) {
        // Told apart from 'nothing_found' on purpose even though the customer
        // sees the same sentence: this one means the store DID hand something
        // back and it had already run out, which is a different conversation
        // with support.
        track(user.id, 'restore_finished', 'expired');
        setMessageTone('info');
        setMessage(t('paywall.noActiveSubscriptionWasFound'));
        return;
      }
      purchasedRef.current = true;
      track(user.id, 'restore_finished', 'succeeded');
      setAutoRenewing(purchase.autoRenewing);
      setShowAutoRenewalNotice(true);
    } catch (e: any) {
      const failure = describePurchaseFailure(e);
      track(user.id, 'restore_finished', 'failed', purchaseFailureDetail(failure));
      if (!failure.cancelled) {
        console.warn('[billing] restore failed', failure.code, failure.detail);
        setMessageTone(failure.pending ? 'info' : 'error');
        // The code rides along for the unclassified case, where it is the
        // only thing that makes a support screenshot actionable.
        setMessage(t(failure.messageKey, { code: failure.code || 'none' }));
      }
    } finally {
      restoreInFlightRef.current = false;
      setPurchasing(false);
    }
  };
  handleRestoreRef.current = handleRestore;
  pricingStateRef.current = pricingState;
  selectedPlanRef.current = selectedPlan;
  // Purchasing is impossible only when the store told us so. While the lookup
  // is still in flight the cards show a placeholder rather than a price we
  // would have to correct, and the CTA waits with them.
  const pricesPending = pricingState === 'loading';
  const offeringsUnavailable = pricingState === 'failed';
  const selectedPlanDef = planBySlug(selectedPlan);
  // One answer for the whole screen: the CTA label, the disclosure under it,
  // and the purchase call all read the same function. Renewal is only ever
  // consulted for wording.
  const selectedSwitch = planSwitchFor(activeSub, selectedPlan);
  const isPlanSwitch = selectedSwitch.switching;
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
  /**
   * The disclosure never quotes the catalogue.
   *
   * It used to fall back to `$5.99` when the store had not answered yet, which
   * is the USD figure for one market printed under a button that is about to
   * charge a reader in Warsaw or Delhi something else entirely - directly
   * beneath the sentence promising it renews at that price. There is no honest
   * placeholder for a price, so the whole disclosure waits for the store and
   * the CTA waits with it (`pricesPending` already disables the button).
   *
   * The period suffix must be the reader's own too, not an English string
   * concatenated on.
   */
  const storePriceKnown = !!selectedPricing?.priceString;
  const selectedPriceLabel = selectedPlanDef && selectedPricing?.priceString
    ? `${selectedPricing.priceString}${t(planPeriodKey(selectedPlanDef.slug))}`
    : '';

  /**
   * What the tap will cost, TODAY, for a plan change - which is the one thing
   * the standard renewal disclosure gets wrong about a switch.
   *
   * "$59.99/year, renews automatically until cancelled" is true of the plan
   * and false about the transaction: under WITHOUT_PRORATION nothing is
   * charged today at all, and under CHARGE_FULL_PRICE the full amount is taken
   * now rather than at the renewal date the reader is looking at. Both are the
   * kind of surprise that arrives as a chargeback.
   */
  const currentPlanDef = planBySlug(selectedSwitch.fromSlug);
  const switchMode = isPlanSwitch && selectedPlanDef && currentPlanDef
    ? replacementModeFor(
        planMonths(selectedPlanDef),
        planMonths(currentPlanDef),
        stillOnTrial(activeSub),
      )
    : null;
  const switchDate = formatSubscriptionDate(selectedSwitch.endsAt);
  const switchDisclosure = !selectedPlanDef || !switchMode
    ? null
    : switchMode === CHARGE_FULL_PRICE
      ? t('paywall.switchChargedNow', {
          price: selectedPricing?.priceString ?? '',
          period: t(planPeriodNounKey(selectedPlanDef.slug)),
        })
      : t(switchDate ? 'paywall.switchNoChargeToday' : 'paywall.switchNoChargeTodayUndated', {
          plan: t(planNameKey(selectedPlanDef.slug)),
          date: switchDate,
        });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
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
                stroke={COLORS.accentText}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M12 3a9 9 0 1 0 9 9"
                stroke={COLORS.accentText}
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
                    stroke={COLORS.accentText}
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
          {/* Every plan, always - including the one they are on.
              It used to be filtered out of the list for a live subscriber, on
              the reasoning that rendering an unbuyable card invites a tap that
              cannot succeed. But the tap is not the only thing a card does: a
              quarterly subscriber opening Manage plan saw monthly and yearly
              and nothing telling them where they stood, no way to compare
              against what they already pay, and a list whose length changed
              depending on the answer. It is shown, badged, and not tappable -
              which says what the filter was trying to say without removing the
              information. */}
          {PLANS.map((plan) => {
            const isCurrent =
              !!activeSub && activeSub.plan_slug === plan.slug && subscriptionIsRenewing(activeSub);
            const selected = selectedPlan === plan.slug && !isCurrent;
            const timingKey = switchTimingKey(plan);
            const months = planMonths(plan);
            const perMonth = perMonthLabel(pricing[plan.slug], months);
            const savings = savingsPercent(pricing, plan, months);
            /**
             * What THIS card is asking for today.
             *
             * Per plan rather than from the selected one: eligibility is the
             * store's answer about a product, and a card must never quote a
             * zero the plan it belongs to would not honour. `trialPriceString`
             * is null unless getPlanPricing also granted the days, and a plan
             * switch is never a new trial - so a subscriber sees prices.
             */
            const cardTrial = activeSub ? null : pricing[plan.slug]?.trialPriceString ?? null;
            // The price the zero turns into, with its period: "$5.99/month".
            // Shown small beside the trial, because "free" without the number
            // that follows it is the half of the offer people get angry about.
            const afterTrial = cardTrial && pricing[plan.slug]?.priceString
              ? `${pricing[plan.slug]?.priceString}${t(planPeriodKey(plan.slug))}`
              : null;
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
                accessibilityState={{ selected, disabled: isCurrent }}
                accessibilityLabel={`${t(planNameKey(plan.slug))}, ${
                  cardTrial && afterTrial
                    ? `${cardTrial}, ${t('paywall.thenPrice', { price: afterTrial })}`
                    : pricing[plan.slug]?.priceString ?? ''
                }${isCurrent ? `, ${t('paywall.currentPlan')}` : ''}`}
                disabled={isCurrent}
                style={[
                  styles.planCard,
                  selected && styles.planCardSelected,
                  isCurrent && styles.planCardCurrent,
                ]}
                onPress={() => setSelectedPlan(plan.slug)}
              >
                {isCurrent && (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>{t('paywall.currentPlan')}</Text>
                  </View>
                )}
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
                        a bait-and-switch when it changes a second later.

                        On a trial the figure is what the tap actually costs
                        TODAY, which is nothing: the same currency written the
                        same way, at zero. The price it becomes is directly
                        under it - the two belong together, and a zero on its
                        own would be an offer of free access. */}
                    {cardTrial && afterTrial ? (
                      <>
                        <Text style={styles.planPrice}>{cardTrial}</Text>
                        <Text style={styles.planThenPrice} numberOfLines={2}>
                          {t('paywall.thenPrice', { price: afterTrial })}
                        </Text>
                      </>
                    ) : pricing[plan.slug]?.priceString ? (
                      <Text style={styles.planPrice}>
                        {pricing[plan.slug]?.priceString}
                      </Text>
                    ) : pricesPending ? (
                      <View style={styles.pricePlaceholder} />
                    ) : (
                      <Text style={styles.planPrice}>--</Text>
                    )}
                    {/* The per-month equivalent stands down during a trial.
                        Three stacked figures in a column this narrow stop
                        being a price and become a table, and the one that
                        matters is what happens when the free days end. */}
                    {perMonth && !cardTrial ? (
                      <Text style={styles.planPerMonth}>
                        {t('common.perMonth', { price: perMonth })}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* When the change would actually happen.
                    Only on a card that represents a real switch, and only for
                    a live subscription. An upgrade and a downgrade behave
                    completely differently and the app knew which - it just
                    never said, so the reader met the difference in Play's own
                    sheet after deciding. */}
                {timingKey ? (
                  <Text style={styles.planTiming} numberOfLines={2}>
                    {t(timingKey)}
                  </Text>
                ) : null}
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

        {/* The purchase/restore message used to sit HERE, in the scroll body,
            below three plan cards and a retry block. On the screen where a
            failure has to be read it was routinely off the bottom of the
            viewport - the customer tapped, the sheet closed, nothing visibly
            happened, and they tapped again. It now renders on the fixed bar
            directly above the CTA, where the button that produced it is. */}

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
            onPress={() => handleRestore()}
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
        {/* Immediately above the button that caused it, and inside the bar so
            it cannot scroll out of view. The bar measures its own height, so
            adding a line here pushes the plan cards up rather than hiding
            under them. */}
        {message ? (
          <Text
            style={[
              styles.barMessage,
              messageTone === 'error' ? styles.messageError : styles.messageInfo,
            ]}
          >
            {message}
          </Text>
        ) : null}
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
              {isPlanSwitch
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
        {!purchasing && selectedPlanDef && !offeringsUnavailable && storePriceKnown ? (
          <Text style={styles.renewalText}>
            {/* A plan CHANGE gets the timing of the change, not the renewal
                terms of the plan. The two say different things about what this
                tap costs today, and the renewal sentence is the one that is
                wrong: it names a price under a button that, on a downgrade or
                a mid-trial switch, takes nothing at all. */}
            {switchDisclosure
              ?? (trialDays
                ? t('paywall.trialThenPrice', { count: trialDays, price: selectedPriceLabel })
                : t('paywall.priceRenewsAutomatically', { price: selectedPriceLabel }))}{' '}
            {t('paywall.manageOrCancelAnytime')}
          </Text>
        ) : null}
        {/* The route to cancel, change payment method, or resume - for anyone
            who has a subscription to manage, and for anyone Play has told us
            has one even though this device cannot see it. Play policy expects
            a subscriber to be able to reach their subscription from the app,
            and Settings is not reachable from here when this screen is the
            root. */}
        {manageUrl && (activeSub || showManageLink) ? (
          <TouchableOpacity
            style={styles.manageBtn}
            accessibilityRole="link"
            onPress={() => {
              // The second door to Play's subscription page, beside the one in
              // Settings. Both record the same event, so "people who went to
              // manage their plan" is one number rather than two that have to
              // be added up by whoever reads the report.
              track(user?.id, 'subscription_managed', 'paywall');
              Linking.openURL(manageUrl).catch(() => {});
            }}
          >
            <Text style={styles.manageBtnText}>{t('paywall.manageInGooglePlay')}</Text>
          </TouchableOpacity>
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
        {/* No dismiss-to-explore route any more. The paywall is never the
            whole app now - it is always pushed on top of an app the person can
            already use - so the way out is simply back, and the header's own
            close button does it. */}
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
                  stroke={COLORS.accentText}
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
                    { color: autoRenewing ? COLORS.success : COLORS.accentText },
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

const makeStyles = (COLORS: Palette) => StyleSheet.create({
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
    color: COLORS.accentText,
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
    color: COLORS.accentText,
  },
  planPerMonth: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.textDim,
    fontVariant: ['tabular-nums'],
  },
  /**
   * The price the trial becomes.
   *
   * Brighter than the per-month aside it stands in for: this one is a
   * disclosure, not a convenience, and it sits under a zero. It may wrap to
   * two lines, so it needs the alignment spelled out - a wrapped second line
   * would otherwise start at the left edge of a right-aligned column.
   */
  planThenPrice: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: I18nManager.isRTL ? 'left' : 'right',
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
  /**
   * The plan already owned. Present so the reader can see where they stand,
   * visibly not a button so they do not try to buy it again.
   */
  planCardCurrent: { opacity: DISABLED_OPACITY },
  planTiming: {
    ...TYPE.caption,
    color: COLORS.textMuted,
    marginTop: SPACE.sm,
    lineHeight: 16,
  },
  currentBadge: {
    position: 'absolute',
    top: -9,
    alignSelf: 'center',
    paddingHorizontal: SPACE.md,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface3,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  currentBadgeText: {
    ...TYPE.caption,
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  planCardSelected: {
    borderWidth: 2,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentWash,
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
    // The trial's "then ..." line is the longest thing this column ever holds
    // and it is allowed to wrap. Without a ceiling it takes the width it wants
    // from the plan name and description sitting beside it.
    maxWidth: '48%',
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
  messageInfo: { color: COLORS.accentText },
  // Same words, on the bar rather than in the page: no side margins (the bar
  // has its own padding) and tighter above the button it belongs to.
  barMessage: {
    marginBottom: SPACE.md,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  manageBtn: {
    marginTop: SPACE.xs,
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
  },
  manageBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.accentText,
    textDecorationLine: 'underline',
  },
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
    backgroundColor: COLORS.surfaceSolid,
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
    color: COLORS.accentText,
    textDecorationLine: 'underline',
  },

  // Auto-renewal notice (bottom sheet)
  noticeOverlay: {
    flex: 1,
    backgroundColor: COLORS.scrim,
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
    backgroundColor: COLORS.whiteFaint,
    marginBottom: 16,
  },
  noticeCheckCircle: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accentWash,
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




