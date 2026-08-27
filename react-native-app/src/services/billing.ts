import AsyncStorage from '@react-native-async-storage/async-storage';
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
  normalizeStoreProductId,
} from '../constants/plans';

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

// STORE_REPLACEMENT_MODE members are STRINGS ("WITH_TIME_PRORATION", "DEFERRED").
// These previously fell back to 1 and 6 - values from the long-deprecated
// numeric PRORATION_MODE enum. Whenever the SDK static was not populated at
// module-eval time, the app sent a number where Play expects a mode name and
// the product change was rejected, which is what broke downgrades.
export const WITH_TIME_PRORATION =
  (Purchases as any)?.STORE_REPLACEMENT_MODE?.WITH_TIME_PRORATION ?? 'WITH_TIME_PRORATION';
export const DEFERRED =
  (Purchases as any)?.STORE_REPLACEMENT_MODE?.DEFERRED ?? 'DEFERRED';

// Real SDK types rather than `any`: this file decides who is entitled and what
// gets charged, so it is the last place that should opt out of type checking.
import type {
  CustomerInfo,
  PurchasesPackage,
  PurchasesSubscriptionInfo,
} from 'react-native-purchases';

let configuredAppUserId: string | null = null;
let configurePromise: Promise<boolean> | null = null;

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

export const initBilling = async (userId?: number | string | null): Promise<boolean> => {
  const appUserId = userId ? String(userId) : null;

  if (configurePromise && (!appUserId || configuredAppUserId === appUserId)) {
    return configurePromise;
  }

  const attempt = (async () => {
    try {
      const apiKey = await configuredApiKey();
      if (!configuredAppUserId) {
        try {
          if ((Purchases as any)?.LOG_LEVEL?.WARN) {
            Purchases.setLogLevel((Purchases as any).LOG_LEVEL.WARN);
          }
        } catch {}
        Purchases.configure({ apiKey, appUserID: appUserId || undefined });
        configuredAppUserId = appUserId;
      } else if (appUserId && configuredAppUserId !== appUserId) {
        // A failed identity switch must NOT be swallowed: purchasing while the
        // SDK still holds the previous account's identity would attach the
        // subscription to the wrong RevenueCat customer.
        await Purchases.logIn(appUserId);
        configuredAppUserId = appUserId;
      }
      return true;
    } catch {
      // A FAILED attempt must not be remembered. The memo above returns the
      // cached promise for any anonymous caller (`!appUserId`), so one
      // configure that lost a race with the network - the very first thing the
      // guest subscribe sheet does on open - used to answer `false` for the
      // rest of the process. Every later getPlanPricing() short-circuited, the
      // sheet showed the USD catalogue figure to every market on earth, and
      // the paywall said billing was unavailable on a perfectly good phone,
      // until the app was force-killed. Clearing it makes the next call retry.
      configurePromise = null;
      return false;
    }
  })();

  configurePromise = attempt;
  return attempt;
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
    if (configuredAppUserId) {
      await Purchases.logOut();
    }
  } catch {
    // Never block sign-out on the billing SDK.
  } finally {
    configuredAppUserId = null;
    configurePromise = null;
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
}

const activeEntitlement = (customerInfo: CustomerInfo, productId?: string) => {
  const active = customerInfo?.entitlements?.active || {};
  const premium = active[REVENUECAT_ENTITLEMENT_ID];
  if (premium && (!productId || sameProduct(premium.productIdentifier, productId))) {
    return premium;
  }

  return Object.values(active).find((ent: any) =>
    !productId || sameProduct(ent?.productIdentifier, productId),
  ) as any;
};

const sameProduct = (left?: string | null, right?: string | null): boolean =>
  normalizeStoreProductId(left) === normalizeStoreProductId(right);

const subscriptionInfoFor = (
  customerInfo: CustomerInfo,
  productId: string,
): PurchasesSubscriptionInfo | null => {
  const subscriptions = customerInfo?.subscriptionsByProductIdentifier || {};
  return subscriptions[productId]
    || subscriptions[normalizeStoreProductId(productId)]
    || Object.values(subscriptions).find((sub) =>
        sameProduct(sub?.productIdentifier, productId))
    || null;
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

const freeTrialDaysFor = (pkg: PurchasesPackage): number | null => {
  // Android (Billing 5+ base plans/offers): the free pricing phase of the
  // option the purchase flow will use.
  const freePhase = pkg?.product?.defaultOption?.freePhase;
  const fromPhase = iso8601PeriodDays(freePhase?.billingPeriod?.iso8601);
  if (fromPhase) return fromPhase;

  // Cross-platform introPrice shape (price 0 = free trial).
  const intro = pkg?.product?.introPrice;
  if (intro && Number(intro.price) === 0) {
    const units = Number(intro.periodNumberOfUnits || 0) * Number(intro.cycles || 1);
    const perUnit: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };
    const days = units * (perUnit[String(intro.periodUnit || '').toUpperCase()] || 0);
    if (days > 0) return days;
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
): Promise<Record<string, number>> => {
  if (productIds.length === 0) return {};
  try {
    const res = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
    const out: Record<string, number> = {};
    for (const [id, entry] of Object.entries(res || {})) {
      out[id] = Number((entry as any)?.status ?? INTRO_UNKNOWN);
    }
    return out;
  } catch {
    return {};
  }
};

/**
 * Localized store pricing (and real trial eligibility) for every plan the
 * paywall lists, keyed by plan slug. Missing entries mean the store/RevenueCat
 * doesn't serve that product right now - callers fall back to showing the
 * catalogue price and must NOT advertise a trial.
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
  const everPurchased = Object.values(eligibility).some((s) => s === INTRO_UNKNOWN)
    ? await hasEverPurchased()
    : false;

  for (const { plan, pkg } of matched) {
    const status = eligibility[packageProductId(pkg) || ''] ?? INTRO_UNKNOWN;
    // UNKNOWN is the usual answer on Android, where Play gives RevenueCat
    // little to go on - fall back to the customer's own purchase history.
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
      freeTrialDays: trialAllowed ? freeTrialDaysFor(pkg) : null,
    };
  }

  return out;
};

const completedFromCustomerInfo = (
  customerInfo: CustomerInfo,
  fallbackProductId?: string,
): CompletedPurchase | null => {
  const entitlement = activeEntitlement(customerInfo, fallbackProductId);
  const productId = entitlement?.productIdentifier || fallbackProductId;
  if (!productId) return null;

  const subInfo = subscriptionInfoFor(customerInfo, productId);
  const transactionId = subInfo?.storeTransactionId
    || `${customerInfo?.originalAppUserId || configuredAppUserId || 'unknown'}:${normalizeStoreProductId(productId)}`;

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
    periodType: entitlement?.periodType || subInfo?.periodType || null,
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
      return {
        ...base,
        retryable: true,
        messageKey: 'billing.unknown',
      };
  }
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
  // Never ask Play to replace a product with itself. Play rejects that outright
  // ("we were unable to change your plan") rather than treating it as a
  // resubscribe, and the caller cannot always tell: plan slugs and store
  // product ids are separate identifiers, so a stale or remapped subscription
  // row can name a different slug that resolves to this very product. Compared
  // on the normalized id because Play reports the purchased product as
  // `productId:basePlanId` while the catalogue stores the bare id.
  const sameAsCurrent =
    !!opts?.oldProductId
    && sameProduct(opts.oldProductId, packageProductId(rcPackage) || plan.store_product_id);
  const productChangeInfo = opts?.oldProductId && !sameAsCurrent
    ? {
        oldProductIdentifier: opts.oldProductId,
        replacementMode: opts.replacementMode ?? WITH_TIME_PRORATION,
      }
    : null;

  const { customerInfo, productIdentifier } = await Purchases.purchasePackage(
    rcPackage,
    null,
    productChangeInfo,
  );

  const completed = completedFromCustomerInfo(customerInfo, productIdentifier || packageProductId(rcPackage));
  if (!completed || !activeEntitlement(customerInfo, completed.productId)) {
    throw new Error('RevenueCat did not return an active entitlement for this purchase.');
  }

  return completed;
};

export const restoreRevenueCatPurchases = async (userId: number): Promise<CompletedPurchase | null> => {
  if (!(await initBilling(userId))) {
    throw new Error('RevenueCat billing is unavailable on this device.');
  }

  const customerInfo = await Purchases.restorePurchases();
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

export type RecordResult = 'recorded' | 'duplicate' | 'unmatched';

/**
 * Store a completed RevenueCat purchase locally for instant access, then push
 * the RevenueCat identifiers so Laravel can verify the customer before saving
 * its authoritative subscription row.
 */
/**
 * When THIS device recorded a purchase, as opposed to when the subscription
 * originally began.
 *
 * The gate grants unconfirmed access for a grace window while the backend
 * catches up, and it used to measure that window from the row's started_at.
 * That field carries RevenueCat's originalPurchaseDate - the FIRST ever
 * purchase on the account - so for anyone resubscribing, restoring, switching
 * plans or reinstalling it is months old. The window was therefore already
 * expired the instant they paid: markSubscribed opened the gate, the next sync
 * read a months-old started_at with a still-null plan_id, and closed it again.
 * The paywall came back, kept polling, and only stuck once the server
 * confirmed the row - which is the "it fixes itself after a few restarts"
 * report.
 *
 * Recorded separately so the grace window measures the thing it is actually
 * about: how long ago we took the money without the server agreeing yet.
 */
const grantKey = (userId: number | string) => `@purchase_recorded_at_${userId}`;

export const markPurchaseRecorded = async (userId: number): Promise<void> => {
  try {
    await AsyncStorage.setItem(grantKey(userId), String(Date.now()));
  } catch {
    // Falls back to started_at in the gate check; never worth throwing here.
  }
};

export const purchaseRecordedAt = async (userId: number): Promise<number | null> => {
  try {
    const v = await AsyncStorage.getItem(grantKey(userId));
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
};

export const recordCompletedPurchase = async (
  userId: number,
  purchase: CompletedPurchase,
): Promise<RecordResult> => {
  const plan = planByProductId(purchase.productId);
  if (!plan) return 'unmatched';

  const token = purchase.storeTransactionId
    || `revenuecat:${purchase.revenuecatAppUserId}:${normalizeStoreProductId(purchase.productId)}`;

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
  const existing = await getSubscriptionByToken(token);
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
  if (current && current.purchase_token && current.plan_slug !== plan.slug) {
    await saveSubscription(userId, {
      purchase_token: current.purchase_token,
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      auto_renewing: 0,
    });
  }

  const startedAt = purchase.startedAt || new Date().toISOString();
  await saveSubscription(userId, {
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
  });

  // Stamp the LOCAL grant, not the subscription's own start date.
  await markPurchaseRecorded(userId);

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
        },
      ],
    });
  } catch {}

  return 'recorded';
};

/**
 * Plan chosen in the subscribe sheet before authentication interrupted the
 * purchase. The authenticated paywall takes it and starts the RevenueCat
 * purchase flow immediately after verification/sign-in.
 */
const PENDING_PLAN_KEY = '@pending_plan_slug';

export const setPendingPlan = async (slug: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(PENDING_PLAN_KEY, slug);
  } catch {}
};

export const takePendingPlan = async (): Promise<string | null> => {
  try {
    const slug = await AsyncStorage.getItem(PENDING_PLAN_KEY);
    if (slug) await AsyncStorage.removeItem(PENDING_PLAN_KEY);
    return slug;
  } catch {
    return null;
  }
};

/**
 * Read the stashed plan WITHOUT spending it.
 *
 * takePendingPlan() consumes on read, which threw the plan away on every path
 * that read it and then did not act: the paywall unmounting mid-await, or the
 * caller deciding there was nothing to resume. The person had picked a plan,
 * created an account and verified an email specifically to buy that plan, and
 * the funnel quietly forgot which one - dropping them on a paywall they had
 * already filled in once. Peek, act, then clear.
 */
export const peekPendingPlan = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(PENDING_PLAN_KEY);
  } catch {
    return null;
  }
};

export const clearPendingPlan = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(PENDING_PLAN_KEY);
  } catch {}
};
