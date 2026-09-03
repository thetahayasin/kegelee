import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { api } from './api';
import {
  getActiveSubscription,
  getSubscriptionByToken,
  saveSubscription,
  getAppSetting,
  saveAppSetting,
} from '../db/queries';
import {
  PLANS,
  PlanDef,
  planByProductId,
  planBySlug,
  playSubscriptionId,
} from '../constants/plans';
/**
 * The grant stamp and the stored verdict live with the entitlement rule, not
 * here: they are two of the things that rule reads, and keeping them beside it
 * is what lets the resolver stay free of a dependency on the billing SDK.
 * Re-exported so the existing importers of this module keep working.
 */
import { clearNegativeVerdict, markPurchaseRecorded } from './entitlement';

export { markPurchaseRecorded, purchaseRecordedAt } from './entitlement';

/**
 * RevenueCat-backed subscriptions for the mobile paywall.
 *
 * RevenueCat owns transaction validation, acknowledgement, renewals,
 * cancellations and product changes. The app keeps the existing local
 * subscription mirror for instant access; Laravel verifies RevenueCat state
 * and remains authoritative after sync/webhooks.
 */
const REVENUECAT_ENTITLEMENT_ID = 'premium';

/**
 * Compiled-in RevenueCat *public* SDK keys - the per-store client keys from the
 * RevenueCat dashboard. These are designed to ship inside the app binary and
 * grant no write access to the account; the secret v2 key stays on the Laravel
 * side (app_settings.revenuecat_api_key) and is never bundled here.
 *
 * The synced backend copy still wins when the device has one, so a key can be
 * rotated from the dashboard without shipping a build. These constants only
 * exist so a first launch - or an offline one - can still configure the SDK
 * and open the paywall instead of failing with "not configured".
 */
const REVENUECAT_ANDROID_PUBLIC_SDK_KEY = 'goog_mOSmpWsMRRLEZoLcWvRqOencyMq';
const REVENUECAT_IOS_PUBLIC_SDK_KEY = '';

/**
 * The Play applicationId, from android/app/build.gradle.
 *
 * Only used to build the manage-subscription deep link, which needs the
 * package name to open THIS app's subscription rather than the account-wide
 * list. The synced `google_play_package_name` setting still wins where the
 * device has one; this is the value that makes the link work on a first or
 * offline launch.
 */
const PLAY_PACKAGE_NAME = 'com.kegelee.app';

// STORE_REPLACEMENT_MODE members are STRINGS ("WITH_TIME_PRORATION", "DEFERRED").
// These previously fell back to 1 and 6 - values from the long-deprecated
// numeric PRORATION_MODE enum. Whenever the SDK static was not populated at
// module-eval time, the app sent a number where Play expects a mode name and
// the product change was rejected, which is what broke downgrades.
//
// Only two of the five are ever SENT (see replacementModeFor). The other
// three are exported so the tests can assert they never are - a mode name is
// a string either way, so nothing but a test can tell a forbidden one from an
// allowed one before Play declines the payment.
export const WITH_TIME_PRORATION =
  (Purchases as any)?.STORE_REPLACEMENT_MODE?.WITH_TIME_PRORATION ?? 'WITH_TIME_PRORATION';
export const DEFERRED =
  (Purchases as any)?.STORE_REPLACEMENT_MODE?.DEFERRED ?? 'DEFERRED';
export const WITHOUT_PRORATION =
  (Purchases as any)?.STORE_REPLACEMENT_MODE?.WITHOUT_PRORATION ?? 'WITHOUT_PRORATION';
export const CHARGE_PRORATED_PRICE =
  (Purchases as any)?.STORE_REPLACEMENT_MODE?.CHARGE_PRORATED_PRICE ?? 'CHARGE_PRORATED_PRICE';
export const CHARGE_FULL_PRICE =
  (Purchases as any)?.STORE_REPLACEMENT_MODE?.CHARGE_FULL_PRICE ?? 'CHARGE_FULL_PRICE';

// Real SDK types rather than `any`: this file decides who is entitled and what
// gets charged, so it is the last place that should opt out of type checking.
import type {
  CustomerInfo,
  PurchasesPackage,
  PurchasesSubscriptionInfo,
} from 'react-native-purchases';

/**
 * Two separate facts, deliberately not one flag.
 *
 * `sdkConfigured` is about the SDK PROCESS: Purchases.configure() is a
 * once-per-process call. `configuredAppUserId` is about the identity that
 * configured SDK currently holds, which moves with logIn/logOut.
 *
 * One variable answering both got logout wrong in the expensive direction:
 * clearing it after logOut() said "the SDK is not configured", so the next
 * sign-in went back into configure() on an already-configured SDK instead of
 * logging the new person in. The SDK keeps the anonymous id it was left with,
 * and a purchase made straight after would attach to that anonymous customer
 * rather than to the account that paid for it.
 */
let sdkConfigured = false;
let configuredAppUserId: string | null = null;
/**
 * The attempt currently in flight and the identity it is FOR.
 *
 * Both are needed: a second caller may join an in-flight attempt only when it
 * wants the same identity, and a failed attempt may only clear the memo while
 * it is still the memoized one (see initBilling).
 */
let configurePromise: Promise<boolean> | null = null;
let configureForId: string | null = null;

/** Rejects empty values and the unreplaced placeholder literals. */
const isUsableKey = (key: string): boolean =>
  Boolean(key) && !key.startsWith('REVENUECAT_');

const configuredApiKey = async (): Promise<string> => {
  const keyName = Platform.OS === 'ios'
    ? 'revenuecat_ios_public_sdk_key'
    : 'revenuecat_android_public_sdk_key';
  const baked = (Platform.OS === 'ios'
    ? REVENUECAT_IOS_PUBLIC_SDK_KEY
    : REVENUECAT_ANDROID_PUBLIC_SDK_KEY).trim();

  // 1. The synced backend value, so keys stay rotatable server-side.
  let key = (await getAppSetting(keyName, '').catch(() => '')).trim();

  // 2. The compiled-in key, so an unsynced or offline device still works.
  if (!isUsableKey(key)) {
    key = baked;
  }

  // 3. Nothing on the device: ask the public content endpoint and cache it.
  if (!isUsableKey(key)) {
    try {
      const res = await api.pullContent();
      const fetched = res.ok ? String(res.data?.settings?.[keyName] || '').trim() : '';
      if (isUsableKey(fetched)) {
        await saveAppSetting(keyName, fetched, 'string').catch(() => {});
        key = fetched;
      }
    } catch {}
  }

  if (!isUsableKey(key)) {
    throw new Error(`RevenueCat public SDK key for ${Platform.OS} is not configured.`);
  }

  return key;
};

/**
 * Configure the SDK once, then move identity with logIn.
 *
 * Never called directly: initBilling serializes callers onto it so two
 * concurrent configures - or a logIn overlapping a configure - cannot leave
 * the SDK holding an identity nobody asked for.
 */
const runConfigure = async (appUserId: string | null): Promise<boolean> => {
  try {
    const apiKey = await configuredApiKey();

    if (!sdkConfigured) {
      try {
        if ((Purchases as any)?.LOG_LEVEL?.WARN) {
          Purchases.setLogLevel((Purchases as any).LOG_LEVEL.WARN);
        }
      } catch {}

      // Belt and braces. Our own flag is the only thing that knows configure()
      // has run, and that is a claim about the whole process which a module
      // reload (Fast Refresh, a second copy of this module in the bundle)
      // silently invalidates. Ask the SDK itself where it can answer.
      let alreadyUp = false;
      try {
        alreadyUp = typeof (Purchases as any).isConfigured === 'function'
          ? Boolean(await (Purchases as any).isConfigured())
          : false;
      } catch {
        alreadyUp = false;
      }

      if (!alreadyUp) {
        Purchases.configure({ apiKey, appUserID: appUserId || undefined });
      }
      sdkConfigured = true;

      // configure() only applied our appUserID when WE were the ones calling
      // it. If the SDK was already up it is holding whatever identity that
      // earlier call left behind, so say who we are explicitly rather than
      // assuming.
      if (alreadyUp && appUserId) {
        await Purchases.logIn(appUserId);
      }
      configuredAppUserId = appUserId;
      return true;
    }

    if (appUserId && configuredAppUserId !== appUserId) {
      // A failed identity switch must NOT be swallowed: purchasing while the
      // SDK still holds the previous account's identity would attach the
      // subscription to the wrong RevenueCat customer.
      await Purchases.logIn(appUserId);
      configuredAppUserId = appUserId;
    }
    return true;
  } catch {
    return false;
  }
};

export const initBilling = async (userId?: number | string | null): Promise<boolean> => {
  const appUserId = userId ? String(userId) : null;

  // Already where we need to be. An anonymous caller (`!appUserId`) only needs
  // the SDK up and never forces an identity change - the paywall's price
  // lookup must not log anybody out of anything.
  if (sdkConfigured && (!appUserId || configuredAppUserId === appUserId)) return true;

  // Join the attempt already running, but only when it is asking for the same
  // identity. Keyed on the REQUESTED id rather than on the settled one: an
  // attempt for user 7 answers nothing about a caller asking for user 9.
  if (configurePromise && (!appUserId || configureForId === appUserId)) {
    return configurePromise;
  }

  // Otherwise queue behind whatever is in flight instead of racing it.
  const previous = configurePromise;
  const attempt = (previous ? previous.catch(() => false) : Promise.resolve(false))
    .then(() => runConfigure(appUserId));

  configurePromise = attempt;
  configureForId = appUserId;

  const ok = await attempt;

  /**
   * A FAILED attempt must not be remembered - and must not erase a newer one.
   *
   * The memo answers any anonymous caller, so one configure that lost a race
   * with the network - the very first thing the paywall does on open - used to
   * answer `false` for the rest of the process. Every later getPlanPricing()
   * short-circuited, prices stuck at the USD catalogue figure for every market
   * on earth, and the paywall said billing was unavailable on a perfectly good
   * phone until the app was force-killed. Clearing it makes the next call
   * retry.
   *
   * The identity check is the other half. Clearing unconditionally meant a
   * slow failing attempt could null out the memo belonging to a LATER attempt
   * that had already succeeded, sending the next caller back through configure
   * on an SDK that was already fine.
   */
  if (!ok && configurePromise === attempt) {
    configurePromise = null;
    configureForId = null;
  }

  return ok;
};

/**
 * Drop the RevenueCat identity at logout. Without this the SDK keeps the
 * previous account's app user id and its cached CustomerInfo, so the next
 * person on this device could be read as still entitled before their own
 * logIn lands. Returns the SDK to an anonymous id, which is the documented
 * counterpart to logIn().
 */
export const logoutBilling = async (): Promise<void> => {
  try {
    if (sdkConfigured && configuredAppUserId) {
      await Purchases.logOut();
    }
  } catch {
    // Never block sign-out on the billing SDK.
  } finally {
    // `sdkConfigured` deliberately survives. The SDK is anonymous now, not
    // gone, and configure() is a once-per-process call - saying otherwise
    // would send the next sign-in into configure() instead of logIn(), leaving
    // the SDK on the anonymous id while the app believed it had switched.
    configuredAppUserId = null;
    configurePromise = null;
    configureForId = null;
  }
};

/**
 * Whether this CustomerInfo carries a live premium entitlement.
 *
 * Checks the NAMED entitlement only. This previously also returned true for any
 * active entitlement at all (`|| Object.keys(active).length > 0`), which made
 * the entitlement id decorative: the moment a second entitlement exists for
 * anything else, holding it would silently unlock premium.
 */
export const hasActiveEntitlement = (customerInfo: CustomerInfo): boolean =>
  Boolean(customerInfo?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_ID]);

/**
 * Subscribe to RevenueCat's own entitlement pushes. RevenueCat emits a fresh
 * CustomerInfo when a subscription renews, expires, hits a billing problem or
 * is restored on another device - none of which the app would otherwise notice
 * until its next backend sync. Returns an unsubscribe function.
 */
export const onCustomerInfoChange = (
  listener: (customerInfo: CustomerInfo) => void,
): (() => void) => {
  try {
    Purchases.addCustomerInfoUpdateListener(listener);
  } catch {
    return () => {};
  }
  return () => {
    try {
      Purchases.removeCustomerInfoUpdateListener(listener);
    } catch {
      // The SDK may already be torn down; nothing to release.
    }
  };
};

/**
 * Force RevenueCat to go and ask the server what this customer owns right now.
 *
 * `onCustomerInfoChange` only hears about a renewal when the SDK actually
 * fetches, and the SDK decides that for itself - it will happily serve a cached
 * CustomerInfo for the whole time an app sits open. That is exactly the window
 * in which a subscription renews and the app never notices, so a caller that
 * has reason to believe the entitlement moved (app came back to the
 * foreground, user is staring at the paywall) needs a way to say "check now".
 *
 * Dropping the cache first is the point: without it the SDK can answer from
 * the same stale copy that caused the problem. Returns whether premium is live
 * so the caller can act on the answer directly rather than only through the
 * listener, and never throws - a billing hiccup must not take a screen down.
 */
export const refreshCustomerInfo = async (
  userId?: number | string | null,
): Promise<boolean> => {
  try {
    if (!(await initBilling(userId))) return false;
    await Purchases.invalidateCustomerInfoCache().catch(() => {});
    const info = await Purchases.getCustomerInfo();
    return hasActiveEntitlement(info);
  } catch {
    return false;
  }
};

export interface CompletedPurchase {
  revenuecatAppUserId: string;
  productId: string;
  storeTransactionId: string | null;
  managementURL: string | null;
  startedAt: string;
  endsAt: string | null;
  autoRenewing: boolean;
  periodType: string | null;
  /**
   * Play is retrying a failed charge and access continues meanwhile.
   *
   * A grace period is the one state where `endsAt` is in the past (or about to
   * be) and the customer is still entitled, so anything that reads the expiry
   * alone concludes they have lapsed and shuts the gate on somebody Google is
   * still trying to bill. Carried so the row can say "we know, it is being
   * retried until this date" instead.
   */
  gracePeriodEndsAt: string | null;
  /**
   * When RevenueCat first saw a billing problem on this subscription, or null
   * once it clears. The reason to show "update your payment method" rather
   * than to change what anybody is entitled to.
   */
  billingIssueAt: string | null;
}

/**
 * The Play product id, joined from the two fields RevenueCat splits it across.
 *
 * On Android an entitlement reports `productIdentifier` as the SUBSCRIPTION
 * (`premium_monthly`) and the base plan separately as `productPlanIdentifier`
 * (`p3m`). Only the StoreProduct side hands back the joined form. Reading
 * productIdentifier on its own yields the bare parent, which names all three
 * plans at once and so resolves to none of them - that is a real purchase
 * landing as "plan could not be matched".
 */
const joinProductId = (
  productId?: string | null,
  planId?: string | null,
): string => {
  const base = (productId || '').trim();
  const plan = (planId || '').trim();
  if (!base || !plan || base.includes(':')) return base;
  return `${base}:${plan}`;
};

const entitlementProductId = (ent: any): string =>
  joinProductId(ent?.productIdentifier, ent?.productPlanIdentifier);

const activeEntitlement = (customerInfo: CustomerInfo, productId?: string) => {
  const active = customerInfo?.entitlements?.active || {};
  const premium = active[REVENUECAT_ENTITLEMENT_ID];
  if (premium && (!productId || sameProduct(entitlementProductId(premium), productId))) {
    return premium;
  }

  return Object.values(active).find((ent: any) =>
    !productId || sameProduct(entitlementProductId(ent), productId),
  ) as any;
};

/**
 * Exact comparison. The store product id is the identifier, so there is
 * nothing to normalize - and stripping the base plan suffix would make all
 * three plans compare equal, which is how a monthly-to-yearly upgrade gets
 * mistaken for "already on this plan".
 */
const sameProduct = (left?: string | null, right?: string | null): boolean =>
  (left || '').trim() === (right || '').trim() && !!(left || '').trim();

const subscriptionInfoFor = (
  customerInfo: CustomerInfo,
  productId: string,
): PurchasesSubscriptionInfo | null => {
  const subscriptions = customerInfo?.subscriptionsByProductIdentifier || {};

  // Keyed by the product identifier, which on Android is the bare
  // subscription; the base plan lives on the value as productPlanIdentifier.
  // So the joined id has to be rebuilt per entry rather than looked up
  // directly. PurchasesSubscriptionInfo does carry a productIdentifier of its
  // own, but on Android it holds that same bare subscription id, so matching
  // on it is no better than matching on the key.
  const direct = subscriptions[productId];
  if (direct) return direct;

  const entry = Object.entries(subscriptions).find(([key, sub]) =>
    sameProduct(joinProductId(key, (sub as any)?.productPlanIdentifier), productId));

  return entry ? entry[1] : null;
};

const packageProductId = (pkg: PurchasesPackage): string =>
  pkg?.product?.defaultOption?.storeProductId
    || pkg?.product?.identifier
    || '';

const findPackageForPlan = (
  packages: PurchasesPackage[],
  plan: PlanDef,
): PurchasesPackage | undefined =>
  packages.find((pkg: PurchasesPackage) =>
    pkg?.identifier === plan.revenuecat_package_id
      || pkg?.identifier === plan.slug
      || sameProduct(packageProductId(pkg), plan.store_product_id),
  );

const packageForPlan = async (plan: PlanDef): Promise<PurchasesPackage> => {
  const offerings = await Purchases.getOfferings();
  const packages = offerings?.current?.availablePackages || [];
  const found = findPackageForPlan(packages, plan);

  if (!found) {
    throw new Error(`RevenueCat package for ${plan.slug} is not configured.`);
  }

  return found;
};

/**
 * Store-derived paywall display data, so the UI never shows a hardcoded price
 * or a trial the store won't actually grant. Google Play only returns offers
 * the current customer is eligible for, and RevenueCat's defaultOption is the
 * option the purchase flow will use - so a free phase here IS the trial the
 * user gets, and its absence means no trial may be advertised.
 */
export interface PlanPricing {
  priceString: string;
  /** Numeric store price, used to rank plans for upgrade/downgrade decisions. */
  price: number | null;
  currencyCode: string | null;
  freeTrialDays: number | null;
}

const iso8601PeriodDays = (iso?: string | null): number | null => {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(iso || '');
  if (!m) return null;
  const [y, mo, w, d] = [m[1], m[2], m[3], m[4]].map((v) => parseInt(v || '0', 10));
  const days = y * 365 + mo * 30 + w * 7 + d;
  return days > 0 ? days : null;
};

/**
 * How many free days this package's offer actually carries.
 *
 * The two shapes are NOT interchangeable, and treating them as one is how a
 * returning subscriber got promised a trial Play had no intention of granting.
 *
 * `defaultOption.freePhase` is the Android answer and it is the trustworthy
 * one: Play only returns offers the signed-in Google account is eligible for,
 * so a free phase being present at all is the store having already decided.
 *
 * `introPrice` is the iOS/cross-platform shape and is a property of the
 * PRODUCT, not of the customer - it is there whether or not this person has
 * used their trial. It is therefore read only on iOS, and only once
 * checkTrialOrIntroductoryPriceEligibility has said ELIGIBLE, which is a
 * question StoreKit can genuinely answer.
 */
const freeTrialDaysFor = (
  pkg: PurchasesPackage,
  introStatus: number,
): number | null => {
  // Android (Billing 5+ base plans/offers): the free pricing phase of the
  // option the purchase flow will use.
  const freePhase = pkg?.product?.defaultOption?.freePhase;
  const fromPhase = iso8601PeriodDays(freePhase?.billingPeriod?.iso8601);
  if (fromPhase) return fromPhase;

  if (Platform.OS === 'ios' && introStatus === INTRO_ELIGIBLE) {
    const intro = pkg?.product?.introPrice;
    if (intro && Number(intro.price) === 0) {
      const units = Number(intro.periodNumberOfUnits || 0) * Number(intro.cycles || 1);
      const perUnit: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };
      const days = units * (perUnit[String(intro.periodUnit || '').toUpperCase()] || 0);
      if (days > 0) return days;
    }
  }

  return null;
};

// INTRO_ELIGIBILITY_STATUS, pinned rather than imported.
//
// Same reason as the RC error-code map above: the enum is re-exported through
// the native module, so reading it off the SDK object before native init
// yields undefined and every comparison silently becomes false - which here
// would mean "unknown" for everyone.
const INTRO_UNKNOWN = 0;
const INTRO_INELIGIBLE = 1;
const INTRO_ELIGIBLE = 2;
const INTRO_NO_OFFER = 3;

/**
 * Whether this customer has ever bought anything in this app.
 *
 * Deliberately reads only entitlement and purchase history. `originalPurchaseDate`
 * looks like the obvious signal but RevenueCat falls it back to the first-seen
 * date on Android, so it is non-null for people who have never paid a cent -
 * using it would hide the trial from every new user, which is the opposite
 * mistake and a much more expensive one.
 */
const hasEverPurchased = async (): Promise<boolean> => {
  try {
    const info = await Purchases.getCustomerInfo();
    // entitlements.all includes lapsed ones, which is the case that matters:
    // someone who took the trial, cancelled, and came back.
    if (Object.keys(info?.entitlements?.all || {}).length > 0) return true;
    return Object.values(info?.allPurchaseDates || {}).some(Boolean);
  } catch {
    // Can't tell. Promising a trial the store then refuses is worse than
    // staying quiet about one, so assume it has been used.
    return true;
  }
};

/**
 * Free-phase eligibility per store product, for THIS customer.
 *
 * A free pricing phase on the offer is not proof the person in front of us
 * gets it. Play returns an offer's phases whether or not they have already
 * used the trial, so a returning subscriber who cancelled was still shown
 * "3 days free" and then charged at once. Ask the store about the customer
 * instead of reading the product's shape.
 */
const introEligibility = async (
  productIds: string[],
): Promise<Record<string, number> | null> => {
  if (productIds.length === 0) return null;
  try {
    const res = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
    const entries = Object.entries(res || {});
    // `null`, not `{}`. An empty answer and a per-product UNKNOWN are
    // different facts and the caller treats them differently: UNKNOWN means
    // "ask the purchase history instead", nothing at all means the call did
    // not happen and there is no ground to advertise a trial on.
    if (entries.length === 0) return null;
    const out: Record<string, number> = {};
    for (const [id, entry] of entries) {
      out[id] = Number((entry as any)?.status ?? INTRO_UNKNOWN);
    }
    return out;
  } catch {
    return null;
  }
};

/**
 * Localized store pricing (and real trial eligibility) for every plan the
 * paywall lists, keyed by plan slug. A missing entry means the store or
 * RevenueCat does not serve that product right now: callers must show a
 * placeholder rather than the catalogue price - that figure is USD-only and is
 * the wrong number in every market but one - and must NOT advertise a trial.
 */
export const getPlanPricing = async (
  userId?: number | string | null,
): Promise<Record<string, PlanPricing>> => {
  if (!(await initBilling(userId ?? null))) return {};

  const offerings = await Purchases.getOfferings();
  const packages = offerings?.current?.availablePackages || [];
  const out: Record<string, PlanPricing> = {};

  const matched = PLANS
    .map((plan) => ({ plan, pkg: findPackageForPlan(packages, plan) }))
    .filter((m): m is { plan: PlanDef; pkg: PurchasesPackage } => !!m.pkg?.product?.priceString);

  const productIds = Array.from(
    new Set(matched.map((m) => packageProductId(m.pkg)).filter(Boolean) as string[]),
  );
  // One eligibility call and at most one customer-info read for the whole
  // paywall, not one per plan.
  const eligibility = await introEligibility(productIds);
  /**
   * Fail CLOSED on the trial, in both of the ways this can go wrong.
   *
   * On Android checkTrialOrIntroductoryPriceEligibility answers UNKNOWN for
   * everyone, always - Play does not expose per-customer trial eligibility to
   * the SDK - so the real test there is two facts together: Play served an
   * offer with a free phase (it only serves offers this Google account can
   * take), and this RevenueCat customer has never bought anything.
   *
   * When the eligibility call throws, or comes back with nothing at all, we
   * have not asked anybody anything. That is treated as "has purchased
   * before", because promising three free days and then charging on the spot
   * is a refund, a one-star review and a Play policy problem, while quietly
   * not mentioning a trial somebody was entitled to costs a little conversion.
   */
  const everPurchased = eligibility === null ? true : await hasEverPurchased();

  for (const { plan, pkg } of matched) {
    const status = eligibility?.[packageProductId(pkg) || ''] ?? INTRO_UNKNOWN;
    const trialAllowed =
      status === INTRO_ELIGIBLE
        ? true
        : status === INTRO_INELIGIBLE || status === INTRO_NO_OFFER
          ? false
          : !everPurchased;

    out[plan.slug] = {
      priceString: pkg.product.priceString,
      price: typeof pkg.product?.price === 'number' ? pkg.product.price : null,
      currencyCode: pkg.product?.currencyCode || null,
      freeTrialDays: trialAllowed ? freeTrialDaysFor(pkg, status) : null,
    };
  }

  return out;
};

/**
 * Which plan this CustomerInfo actually describes.
 *
 * Asked in one place because getting it wrong is how a paying customer ends up
 * recorded on the wrong plan, or on none. Android gives two partial answers and
 * neither is reliable alone: the entitlement splits the product across
 * `productIdentifier` and `productPlanIdentifier`, and the subscription map is
 * keyed by the bare subscription with the base plan on the value. Either can
 * arrive without its base plan half, and the bare parent names all three plans
 * so it identifies none of them.
 *
 * Returns '' when nothing resolves, leaving the caller to fall back to the plan
 * it asked to buy - which restore, by its nature, does not have.
 */
const ownedProductId = (customerInfo: CustomerInfo, entitlement: any): string => {
  const fromEntitlement = entitlementProductId(entitlement);
  if (planByProductId(fromEntitlement)) return fromEntitlement;

  // Second source of truth. Prefer a live subscription; a lapsed one still
  // present in the map must not decide the plan.
  const subscriptions: Record<string, any> = customerInfo?.subscriptionsByProductIdentifier || {};
  const entries = Object.entries(subscriptions);

  for (const [key, sub] of entries) {
    if (sub?.isActive === false) continue;
    const joined = joinProductId(key, sub?.productPlanIdentifier);
    if (planByProductId(joined)) return joined;
  }

  return fromEntitlement;
};

const completedFromCustomerInfo = (
  customerInfo: CustomerInfo,
  fallbackProductId?: string,
  storeTransactionIdHint?: string | null,
): CompletedPurchase | null => {
  // Match on the product when we can, but never let a failed match throw the
  // entitlement away: the expiry, the renewal flag and the store transaction
  // id all hang off it. Right after a purchase there is exactly one active
  // premium entitlement, so falling back to it loses nothing.
  const entitlement = activeEntitlement(customerInfo, fallbackProductId)
    || activeEntitlement(customerInfo);

  // Prefer whichever id actually names a plan; only then the caller's
  // fallback, which is the plan it asked to buy.
  const owned = ownedProductId(customerInfo, entitlement);
  const productId = (planByProductId(owned) ? owned : '')
    || fallbackProductId
    || owned;
  if (!productId) return null;

  const subInfo = subscriptionInfoFor(customerInfo, productId);
  /**
   * The store's own id first, then the one the purchase call handed back, and
   * only then something synthesized.
   *
   * The synthesized `<appUserId>:<productId>` is a LOCAL key, not a store
   * identifier: it is stable per person-and-plan, so a resubscribe after a
   * lapse collides with the row from the previous subscription and is written
   * off as a duplicate. It exists only so a row always has a primary key, and
   * anything real must come ahead of it.
   */
  const transactionId = subInfo?.storeTransactionId
    || storeTransactionIdHint
    || `${customerInfo?.originalAppUserId || configuredAppUserId || 'unknown'}:${productId}`;

  return {
    revenuecatAppUserId: String(customerInfo?.originalAppUserId || configuredAppUserId || ''),
    productId,
    storeTransactionId: transactionId,
    managementURL: subInfo?.managementURL || customerInfo?.managementURL || null,
    startedAt: subInfo?.originalPurchaseDate
      || subInfo?.purchaseDate
      || entitlement?.originalPurchaseDate
      || entitlement?.latestPurchaseDate
      || new Date().toISOString(),
    endsAt: entitlement?.expirationDate || subInfo?.expiresDate || customerInfo?.latestExpirationDate || null,
    autoRenewing: Boolean(entitlement?.willRenew ?? subInfo?.willRenew ?? true),
    /**
     * The subscription's CURRENT period, ahead of the entitlement's.
     *
     * They disagree exactly when it matters. The entitlement reports the
     * period type of the LAST transaction that granted access, so it still
     * reads TRIAL for the first renewal after a trial converts - which is a
     * paying customer written to disk as `trialing`, with trial_ends_at set to
     * their real renewal date. PurchasesSubscriptionInfo.periodType describes
     * the period running right now, which is the question being asked.
     */
    periodType: subInfo?.periodType || entitlement?.periodType || null,
    gracePeriodEndsAt: subInfo?.gracePeriodExpiresDate || null,
    billingIssueAt: subInfo?.billingIssuesDetectedAt || null,
  };
};

/**
 * RevenueCat error codes, pinned by value.
 *
 * Deliberately not read off `Purchases.PURCHASES_ERROR_CODE`: that static is
 * only populated once the native module is available, so it is undefined under
 * Jest and on a device where billing failed to initialise - which are exactly
 * the paths this mapping exists to describe. The values are a stable public
 * contract of the SDK.
 */
const RC = {
  CANCELLED: '1',
  STORE_PROBLEM: '2',
  NOT_ALLOWED: '3',
  PURCHASE_INVALID: '4',
  PRODUCT_NOT_AVAILABLE: '5',
  ALREADY_PURCHASED: '6',
  RECEIPT_ALREADY_IN_USE: '7',
  NETWORK: '10',
  INVALID_CREDENTIALS: '11',
  UNEXPECTED_BACKEND: '12',
  RECEIPT_IN_USE_BY_OTHER: '13',
  INVALID_APP_USER_ID: '14',
  OPERATION_IN_PROGRESS: '15',
  UNKNOWN_BACKEND: '16',
  INELIGIBLE: '18',
  INSUFFICIENT_PERMISSIONS: '19',
  PAYMENT_PENDING: '20',
  CONFIGURATION: '23',
  UNSUPPORTED: '24',
  PRODUCT_REQUEST_TIMED_OUT: '32',
  API_ENDPOINT_BLOCKED: '33',
  OFFLINE_CONNECTION: '35',
} as const;

/**
 * Raised when Play completed a purchase but no entitlement came back.
 *
 * Carries a code so it classifies like any store failure instead of falling
 * into the unknown bucket. A bare `new Error` here was indistinguishable from
 * a genuine store fault, which meant the one case where the customer may have
 * been charged without getting access read exactly like a network blip.
 */
export const PURCHASE_NOT_ENTITLED = 'purchase_not_entitled';

class BillingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'BillingError';
  }
}

/** A store failure, classified so the UI can respond rather than just apologise. */
export interface PurchaseFailure {
  /** Raw RevenueCat code. For logs and support, never shown to the customer. */
  code: string | null;
  /** They backed out of the store sheet. Show nothing at all. */
  cancelled: boolean;
  /**
   * The store took the request but has not settled it. This is NOT a failure.
   * Cash and voucher payments, and parental-approval flows, land here and
   * complete minutes or days later. Telling this person "purchase failed"
   * is how you get charged-twice support tickets.
   */
  pending: boolean;
  /** They already own it; restoring resolves it without a second charge. */
  restorable: boolean;
  /** Whether trying again could plausibly succeed. */
  retryable: boolean;
  /** i18n key for copy safe to put in front of a paying customer. Empty when cancelled. */
  messageKey: string;
  /** SDK detail. Logs only - it leaks internals into the UI otherwise. */
  detail: string | null;
}

/**
 * Classify a RevenueCat purchase/restore rejection.
 *
 * Every branch here was previously collapsed into one "Purchase failed. Please
 * try again." plus the raw SDK string, which is wrong in three expensive ways:
 * it invites a second payment on a pending purchase, it tells someone who
 * already owns the plan to buy it again, and it blames the customer for our own
 * configuration errors.
 */
export const describePurchaseFailure = (e: any): PurchaseFailure => {
  const code = e?.code != null ? String(e.code) : null;
  const base = {
    code,
    detail: e?.underlyingErrorMessage || e?.message || null,
    cancelled: false,
    pending: false,
    restorable: false,
    retryable: false,
  };

  // userCancelled is deprecated in favour of the code, but the Android bridge
  // still sets it, so honour whichever arrives.
  if (code === RC.CANCELLED || e?.userCancelled === true) {
    return { ...base, cancelled: true, messageKey: '' };
  }

  // Ours, not the store's. The money may well have been taken, so this must
  // never read as "try again" - a second attempt cannot help and might pay
  // twice.
  if (code === PURCHASE_NOT_ENTITLED) {
    return { ...base, messageKey: 'billing.notEntitled' };
  }

  switch (code) {
    case RC.PAYMENT_PENDING:
      return {
        ...base,
        pending: true,
        messageKey: 'billing.paymentPending',
      };

    case RC.ALREADY_PURCHASED:
    case RC.RECEIPT_ALREADY_IN_USE:
      return {
        ...base,
        restorable: true,
        messageKey: 'billing.alreadyOwned',
      };

    case RC.RECEIPT_IN_USE_BY_OTHER:
      return {
        ...base,
        messageKey: 'billing.otherAccount',
      };

    case RC.PURCHASE_INVALID:
      return {
        ...base,
        retryable: true,
        messageKey: 'billing.declined',
      };

    case RC.NOT_ALLOWED:
      return {
        ...base,
        messageKey: 'billing.notAllowed',
      };

    case RC.INSUFFICIENT_PERMISSIONS:
      return {
        ...base,
        messageKey: 'billing.noPermission',
      };

    case RC.NETWORK:
    case RC.OFFLINE_CONNECTION:
    case RC.PRODUCT_REQUEST_TIMED_OUT:
    case RC.API_ENDPOINT_BLOCKED:
      return {
        ...base,
        retryable: true,
        messageKey: 'billing.network',
      };

    case RC.STORE_PROBLEM:
    case RC.UNKNOWN_BACKEND:
    case RC.UNEXPECTED_BACKEND:
      return {
        ...base,
        retryable: true,
        messageKey: 'billing.storeProblem',
      };

    case RC.OPERATION_IN_PROGRESS:
      return {
        ...base,
        retryable: true,
        messageKey: 'billing.operationInProgress',
      };

    case RC.INELIGIBLE:
      return { ...base, messageKey: 'billing.ineligible' };

    case RC.PRODUCT_NOT_AVAILABLE:
    case RC.CONFIGURATION:
    case RC.INVALID_CREDENTIALS:
    case RC.UNSUPPORTED:
    case RC.INVALID_APP_USER_ID:
      // Our fault, not theirs. Say so plainly rather than implying they did
      // something wrong; the code still reaches the logs for us to act on.
      return {
        ...base,
        messageKey: 'billing.configuration',
      };

    default:
      // The code goes in front of the customer deliberately. Support cannot
      // act on "something went wrong", and a screenshot is usually all we
      // ever get - this is the difference between diagnosing a failure and
      // guessing at it.
      return {
        ...base,
        retryable: true,
        messageKey: 'billing.unknown',
      };
  }
};

/**
 * Which replacement mode Play should apply when moving between two plans.
 *
 * Play allows only TWO modes when switching between auto-renewing base plans
 * of the SAME subscription, which is exactly what this catalogue is:
 *
 *   CHARGE_FULL_PRICE     allowed - charge now, full new cycle, old time credited
 *   WITHOUT_PRORATION     allowed - no charge today, new price at the old renewal
 *   WITH_TIME_PRORATION   NOT allowed for this transition
 *   CHARGE_PRORATED_PRICE NOT allowed for this transition
 *   DEFERRED              NOT allowed for this transition
 *
 * That is Google's own documented rule, not an inference from our failures.
 * From developer.android.com/google/play/billing/subscriptions:
 *
 *   "When switching plans within the same subscription to an auto-renewing
 *    plan from either a prepaid plan or an auto-renewing plan, valid proration
 *    modes are CHARGE_FULL_PRICE and WITHOUT_PRORATION. If you specify any
 *    other proration mode, the purchase fails and an error is shown to the
 *    user."
 *
 * It also predicts every result we got on a real device: the three disallowed
 * modes were each declined, and the one allowed mode we tried worked. Worth
 * spelling out, because WITH_TIME_PRORATION is Play's DEFAULT replacement
 * behaviour and CHARGE_PRORATED_PRICE is what Google recommends for upgrades
 * between separate subscriptions - both are wrong here, and a declined change
 * reaches the customer as their payment method being refused.
 *
 * UPGRADE: CHARGE_FULL_PRICE. Charged now for a full new cycle, with the
 * unused time from the old plan credited on top, so nothing is lost. It also
 * gives a real renewal date instead of inheriting the old plan's - which is
 * what made a freshly bought 3-month plan display a renewal three minutes away.
 *
 * UPGRADE WHILE ON A FREE TRIAL: WITHOUT_PRORATION. Charging today would end
 * the trial early and take money from someone who was promised three free
 * days. The plan changes immediately, the trial runs its course, and the new
 * price applies when it would have renewed.
 *
 * DOWNGRADE: WITHOUT_PRORATION. Charging full price to move to a cheaper plan
 * would be indefensible.
 */
export const replacementModeFor = (
  nextMonths: number | null,
  currentMonths: number | null,
  isTrialing = false,
): string => {
  // Never take money during a free trial, in either direction. Charging today
  // would end the trial early and bill somebody who was promised three free
  // days - so the plan moves now, the trial runs its course, and the new price
  // applies when it would have renewed.
  if (isTrialing) return WITHOUT_PRORATION;

  // An unknown length is not treated as an upgrade. Everywhere else in this
  // flow the safe default is to assume one, because the cost of guessing
  // wrong is making somebody wait. Here the cost is charging them a year on
  // a guess, so this is the one place that needs to be sure.
  if (nextMonths === null || currentMonths === null) return WITHOUT_PRORATION;

  return nextMonths > currentMonths ? CHARGE_FULL_PRICE : WITHOUT_PRORATION;
};

/**
 * Launch RevenueCat's purchase flow for a plan. For a plan switch, pass the
 * current store product id so RevenueCat/Google can apply the requested
 * replacement mode.
 */
export const requestPlanPurchase = async (
  userId: number,
  plan: PlanDef,
  opts?: { oldProductId?: string; replacementMode?: string },
): Promise<CompletedPurchase> => {
  if (!(await initBilling(userId))) {
    throw new Error('RevenueCat billing is unavailable on this device.');
  }

  const rcPackage = await packageForPlan(plan);

  /**
   * Ask the STORE what they own, rather than trusting our catalogue - and ask
   * it EVERY time, not only when the caller already had a guess.
   *
   * The caller passes the old product id from the plan catalogue, which for a
   * legacy row is `premium_quarterly`. Under the shared-subscription catalogue
   * that same customer actually holds `premium_monthly:p3m`, and naming a
   * product they do not own is rejected by Play with "we were unable to change
   * your plan".
   *
   * Gating the lookup on the caller having passed something is the same bug
   * one level up: the paywall passes nothing whenever it decides this is not a
   * switch, and it decides that from the LOCAL subscription row. A row that is
   * missing, stale, or written off as cancelled therefore turned a plan change
   * into a plain purchase of a subscription the Google account already owns,
   * which Play declines. The store knows; ask it first and let the caller's
   * value be the fallback for when it cannot answer.
   */
  let oldProductId = opts?.oldProductId;
  try {
    const currentInfo = await Purchases.getCustomerInfo();
    const owned = entitlementProductId(activeEntitlement(currentInfo));
    if (owned) oldProductId = owned;
  } catch {
    // Keep the caller's value; a failed lookup must not block the purchase.
  }
  // Never ask Play to replace a product with itself. Play rejects that outright
  // ("we were unable to change your plan") rather than treating it as a
  // resubscribe, and the caller cannot always tell: plan slugs and store
  // product ids are separate identifiers, so a stale or remapped subscription
  // row can name a different slug that resolves to this very product.
  //
  // Compared on the FULL id, because all three plans share one subscription -
  // comparing the parent alone would call every switch a no-op.
  const sameAsCurrent =
    !!oldProductId
    && sameProduct(oldProductId, packageProductId(rcPackage) || plan.store_product_id);

  /**
   * The product being replaced is named by its SUBSCRIPTION, not its base plan.
   *
   * Play identifies an existing purchase by subscription id: a Purchase
   * reports `premium_monthly` and never mentions which base plan is running.
   * So RevenueCat can only find the purchase to replace under that id, and a
   * change naming `premium_monthly:p3m` matches nothing - no old purchase
   * token reaches the billing flow, and Play declines what then looks like
   * buying a subscription the account already owns. That is the "Google Play
   * declined the payment" on an ordinary quarterly-to-yearly upgrade.
   *
   * The joined id is still what decides WHETHER this is a change, above; it is
   * only the replacement target that has to be the parent.
   */
  const mode = opts?.replacementMode ?? WITHOUT_PRORATION;

  /**
   * The BARE subscription id, whatever the mode.
   *
   * This used to send the joined `premium_monthly:p1y` for a prorating mode,
   * on the theory that RevenueCat resolves the replaced product against its
   * own catalogue, where the joined form is the product name. That was
   * tested: joined and bare were declined identically under
   * WITH_TIME_PRORATION, so the id form was never what decided it - the mode
   * was. Bare is the only form Play has ever accepted here, and the only one
   * Purchase.getProducts() reports.
   */
  const replacedProductId = (oldProductId || '').split(':')[0];

  const productChangeInfo = replacedProductId && !sameAsCurrent
    ? {
        oldProductIdentifier: replacedProductId,
        replacementMode: mode,
      }
    : null;

  const { customerInfo, productIdentifier, transaction } = await Purchases.purchasePackage(
    rcPackage,
    null,
    productChangeInfo,
  );

  /**
   * The fallback is the plan we were ASKED to buy.
   *
   * Not what the store reports. Android hands back the bare `premium_monthly`
   * from both purchasePackage and the entitlement, and that names all three
   * plans, so every id the store offers here resolves to nothing and the
   * purchase lands as "plan could not be matched" despite having succeeded.
   *
   * The customer tapped a specific plan and we still hold it, so there is no
   * need to ask. `productIdentifier` stays ahead of the package id only for
   * the case where the store genuinely returns a fully qualified product.
   */
  const requestedProductId = planByProductId(productIdentifier)
    ? productIdentifier
    : plan.store_product_id;

  /**
   * The store transaction this very call produced.
   *
   * The CustomerInfo's subscription entry is still the first choice - it is
   * the id RevenueCat's own webhooks quote, so it is what the backend row will
   * be keyed on. But on a product change the CustomerInfo handed back can
   * still describe the previous purchase, and then the only real identifier in
   * the response is this one. Either beats the synthesized local key.
   */
  const storeTransactionId =
    transaction?.purchaseToken ?? transaction?.transactionIdentifier ?? null;

  const completed = completedFromCustomerInfo(
    customerInfo,
    requestedProductId,
    storeTransactionId,
  );

  /**
   * Success is "does this person hold PREMIUM now".
   *
   * Two halves, and both have been wrong before. It is not "does the
   * entitlement name the exact product we asked for": Android splits the
   * entitlement's product across two fields that do not reliably both arrive
   * on the CustomerInfo handed back at purchase time, and a purchase Play had
   * accepted was reported to the customer as an error.
   *
   * Nor is it "is ANY entitlement active", which is what this used to ask.
   * That makes the entitlement id decorative - the moment a second entitlement
   * exists for anything else, holding it would report a premium purchase as
   * successful and hand back a CompletedPurchase for a plan nobody bought.
   * hasActiveEntitlement checks the named one, which is the same function the
   * gate, restore and the launch reconcile all use.
   */
  if (!completed || !hasActiveEntitlement(customerInfo)) {
    throw new BillingError(
      PURCHASE_NOT_ENTITLED,
      'Play completed the purchase but RevenueCat returned no active premium entitlement.',
    );
  }

  return completed;
};

export const restoreRevenueCatPurchases = async (userId: number): Promise<CompletedPurchase | null> => {
  if (!(await initBilling(userId))) {
    throw new Error('RevenueCat billing is unavailable on this device.');
  }

  const customerInfo = await Purchases.restorePurchases();
  // Restore answers one question: does this person hold the entitlement NOW.
  //
  // Without this guard a lapsed subscriber got a CompletedPurchase built from
  // their long-finished subscription, complete with an expiry in the past.
  // The caller wrote it down as active and opened the gate, then the next
  // sync read the same row, saw the past expiry, and shut the gate again -
  // the app let them in for about two seconds, every single time they tapped
  // the button. "No active subscription was found to restore" is the true
  // answer and was always the one they should have got.
  if (!hasActiveEntitlement(customerInfo)) return null;
  return completedFromCustomerInfo(customerInfo);
};

export const getRevenueCatManagementUrl = async (userId: number): Promise<string | null> => {
  try {
    if (!(await initBilling(userId))) return null;
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo?.managementURL || null;
  } catch {
    return null;
  }
};

export type RecordResult = 'recorded' | 'duplicate' | 'unmatched' | 'expired';

/**
 * Store a completed RevenueCat purchase locally for instant access, then push
 * the RevenueCat identifiers so Laravel can verify the customer before saving
 * its authoritative subscription row.
 */
export const recordCompletedPurchase = async (
  userId: number,
  purchase: CompletedPurchase,
): Promise<RecordResult> => {
  const plan = planByProductId(purchase.productId);
  if (!plan) return 'unmatched';

  const token = purchase.storeTransactionId
    || `revenuecat:${purchase.revenuecatAppUserId}:${purchase.productId}`;

  // The same token coming back is NOT automatically the same event.
  // Resubscribing to a cancelled-but-still-running subscription restores the
  // original Play purchase, so the token is unchanged while everything that
  // matters about it has just changed: auto-renew back on, a new expiry, and a
  // status that is no longer 'canceled'. Bailing on the token alone left that
  // customer's row reading "canceled" immediately after they had paid to come
  // back - the gate opened, but the paywall and every renewal check kept
  // treating them as lapsed until a server webhook happened to correct it.
  //
  // So a duplicate is a row that already says exactly what this purchase says.
  const existing = await getSubscriptionByToken(token, userId);
  if (
    existing
    && existing.plan_slug === plan.slug
    && existing.ends_at === purchase.endsAt
    && Number(existing.auto_renewing) === (purchase.autoRenewing ? 1 : 0)
    && existing.status !== 'canceled'
  ) {
    return 'duplicate';
  }

  const current = await getActiveSubscription(userId).catch(() => null);
  /**
   * A plan CHANGE, as opposed to a first purchase or a renewal of the same
   * plan. Worth naming because the row that follows means something different
   * in the two cases.
   */
  const planChanged = !!current && !!current.plan_slug && current.plan_slug !== plan.slug;
  if (current && current.purchase_token && planChanged) {
    await saveSubscription(userId, {
      purchase_token: current.purchase_token,
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      auto_renewing: 0,
    });
  }

  // An entitlement that has already run out is not access, and writing it
  // down as `active` would put a row in the table that every later read has
  // to disagree with. A null expiry is fine - some products have none, and
  // getActiveSubscription treats it as open-ended.
  const expiresAt = purchase.endsAt ? Date.parse(purchase.endsAt) : null;
  if (expiresAt !== null && Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    return 'expired';
  }

  /**
   * The new plan slug against the OLD expiry, and that is correct.
   *
   * Every plan change this app can make under WITHOUT_PRORATION - a downgrade,
   * or any switch during a free trial - takes no money today and leaves the
   * billing date exactly where it was. `purchase.endsAt` comes from the live
   * entitlement, which is still reporting that same date, so the row that
   * lands here says: you are on the new plan from now, and the next charge is
   * when the old one would have renewed. That is the truth in both halves.
   *
   * It reads like a bug precisely because it is the one case where a fresh
   * purchase does not push the expiry out, so it is written down rather than
   * left to be "corrected" by somebody later. CHARGE_FULL_PRICE upgrades do
   * push it out, and the entitlement reports the new date for those.
   */
  const startedAt = purchase.startedAt || new Date().toISOString();
  const row = {
    plan_id: null,
    plan_slug: plan.slug,
    status: purchase.periodType === 'TRIAL' ? 'trialing' : 'active',
    store: 'revenuecat',
    purchase_token: token,
    google_order_id: purchase.storeTransactionId,
    trial_ends_at: purchase.periodType === 'TRIAL' ? purchase.endsAt : null,
    started_at: startedAt,
    ends_at: purchase.endsAt,
    canceled_at: null,
    auto_renewing: purchase.autoRenewing ? 1 : 0,
  };

  if (purchase.gracePeriodEndsAt) {
    /**
     * `grace_period_ends_at` is not on DBSubscription yet - a follow-up pass
     * adds the column and the field. Two deliberate choices until it does:
     *
     * The key is only sent when there IS a grace period, so the ordinary
     * purchase path is byte-for-byte what it was and cannot be broken by a
     * column that has not shipped. And the write falls back to the row
     * without it, because saveSubscription builds its SQL from the keys it is
     * handed: on a device whose schema predates the migration the insert
     * would fail on an unknown column, and losing the whole subscription row
     * to save one nullable date would be a bad trade.
     */
    try {
      await saveSubscription(userId, {
        ...row,
        grace_period_ends_at: purchase.gracePeriodEndsAt,
      } as Parameters<typeof saveSubscription>[1]);
    } catch {
      await saveSubscription(userId, row);
    }
  } else {
    await saveSubscription(userId, row);
  }

  // Stamp the LOCAL grant, not the subscription's own start date.
  await markPurchaseRecorded(userId);

  /**
   * And drop a stored "not subscribed", if that is what the server last said.
   *
   * A stored `false` outranks the local rows by design - it is how a device
   * stops granting access off a row the backend has already expired - but it
   * predates the purchase written on the line above. Left in place it would sit
   * on top of a subscription somebody has just paid for and hold them on the
   * paywall until the next sync corrected it. The purchase is newer evidence.
   *
   * Only the negative one: a stored `true` may be the only thing holding the
   * gate open for this account, and clearing it here would be self-defeating.
   */
  await clearNegativeVerdict(userId);

  try {
    await api.pushState({
      subscriptions: [
        {
          store: 'revenuecat',
          revenuecat_app_user_id: purchase.revenuecatAppUserId || String(userId),
          revenuecat_product_id: purchase.productId,
          purchase_token: token,
          plan_slug: plan.slug,
          google_order_id: purchase.storeTransactionId,
          store_transaction_id: purchase.storeTransactionId,
          started_at: startedAt,
          ends_at: purchase.endsAt,
          auto_renewing: purchase.autoRenewing,
          // Play is retrying a charge; the backend needs this to tell a lapsed
          // subscriber apart from one it should still be serving.
          grace_period_ends_at: purchase.gracePeriodEndsAt,
          billing_issue_at: purchase.billingIssueAt,
          /**
           * When the plan the customer just chose actually starts costing what
           * it costs.
           *
           * Only meaningful on a switch, which under this catalogue is always
           * WITHOUT_PRORATION when it is a downgrade or a mid-trial move: no
           * money changes hands today and the new price applies at the date
           * the old plan would have renewed. That date is `ends_at`. Sent so
           * the backend can say it out loud instead of every surface having to
           * infer it from a plan slug that changed and an expiry that did not.
           */
          plan_change_effective_at: planChanged ? purchase.endsAt : null,
        },
      ],
    });
  } catch {}

  return 'recorded';
};

/**
 * What the store says this person owns, asked once at launch.
 *
 * The local subscriptions table is a mirror, and mirrors go stale in the one
 * direction that costs us: a renewal, a restore on another device, a plan
 * change that took effect while the app was closed, or a reinstall that wiped
 * SQLite while the Google account kept the subscription. In all of those the
 * customer is entitled and the app has nothing on disk to prove it, so the
 * paywall greets a paying subscriber.
 *
 * Deliberately dumb: it asks, it does not write. The caller decides whether to
 * record it, because writing a row is the caller's business (and needs the
 * local row to compare against). Invalidates the cache first for the same
 * reason refreshCustomerInfo does - the SDK will happily serve a cached
 * CustomerInfo from the previous session, which is precisely the copy that is
 * out of date at launch.
 *
 * Never throws. This runs on the bootstrap path, where an exception would take
 * the whole app down over a billing lookup.
 */
export const reconcileEntitlementOnLaunch = async (
  userId: number,
): Promise<CompletedPurchase | null> => {
  try {
    if (!(await initBilling(userId))) return null;
    await Purchases.invalidateCustomerInfoCache().catch(() => {});
    const customerInfo = await Purchases.getCustomerInfo();
    // The NAMED entitlement, same as everywhere else. An expired subscription
    // still sits in the CustomerInfo, and handing it back as a CompletedPurchase
    // is how a lapsed customer gets an 'active' row with an expiry in the past.
    if (!hasActiveEntitlement(customerInfo)) return null;
    return completedFromCustomerInfo(customerInfo);
  } catch {
    return null;
  }
};

/**
 * Where to send someone who wants to cancel, change payment method, or resume.
 *
 * RevenueCat's managementURL first, because it is the one that resolves to the
 * right store for the purchase. The Play deep link is the fallback for when
 * RevenueCat has no URL for us - offline, an API hiccup, a row it does not
 * know about - and it names the SUBSCRIPTION rather than the base plan: Play
 * cannot resolve `premium_monthly:p3m` here and silently drops the reader on
 * the full list of every subscription they own.
 *
 * Never null: an unreachable RevenueCat must not leave the only cancel route
 * in the app missing, which is both a support cost and a Play policy problem.
 */
export const manageSubscriptionUrl = async (
  userId: number,
  planSlug?: string | null,
): Promise<string> => {
  try {
    const rcUrl = await getRevenueCatManagementUrl(userId);
    if (rcUrl) return rcUrl;
  } catch {
    // Fall through to the deep link.
  }

  const packageName = await getAppSetting('google_play_package_name', PLAY_PACKAGE_NAME)
    .catch(() => PLAY_PACKAGE_NAME);
  const plan = planBySlug(planSlug);
  const sku = plan ? playSubscriptionId(plan) : '';

  return 'https://play.google.com/store/account/subscriptions'
    + (sku && packageName ? `?sku=${sku}&package=${packageName}` : '');
};
