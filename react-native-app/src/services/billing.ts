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

  configurePromise = (async () => {
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
      return false;
    }
  })();

  return configurePromise;
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

/** Whether this CustomerInfo carries a live premium entitlement. */
export const hasActiveEntitlement = (customerInfo: CustomerInfo): boolean => {
  const active = customerInfo?.entitlements?.active || {};
  return Boolean(active[REVENUECAT_ENTITLEMENT_ID]) || Object.keys(active).length > 0;
};

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
    throw new Error(`RevenueCat package for ${plan.name} is not configured.`);
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

  for (const plan of PLANS) {
    const pkg = findPackageForPlan(packages, plan);
    const priceString = pkg?.product?.priceString;
    if (!pkg || !priceString) continue;
    out[plan.slug] = {
      priceString,
      price: typeof pkg.product?.price === 'number' ? pkg.product.price : null,
      currencyCode: pkg.product?.currencyCode || null,
      freeTrialDays: freeTrialDaysFor(pkg),
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
  /** Copy safe to put in front of a paying customer. */
  message: string;
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
    return { ...base, cancelled: true, message: '' };
  }

  switch (code) {
    case RC.PAYMENT_PENDING:
      return {
        ...base,
        pending: true,
        message:
          'Your payment is being processed by Google Play. Cash and voucher payments can take a while. Your access unlocks automatically once it clears, so please do not pay again.',
      };

    case RC.ALREADY_PURCHASED:
    case RC.RECEIPT_ALREADY_IN_USE:
      return {
        ...base,
        restorable: true,
        message: 'You already have an active subscription. Restoring it now.',
      };

    case RC.RECEIPT_IN_USE_BY_OTHER:
      return {
        ...base,
        message:
          'This subscription belongs to a different account. Sign in with that account, or contact support and we can move it across.',
      };

    case RC.PURCHASE_INVALID:
      return {
        ...base,
        retryable: true,
        message:
          'Google Play declined the payment. Check the payment method on your Google account, then try again.',
      };

    case RC.NOT_ALLOWED:
      return {
        ...base,
        message:
          'This device or Google account is not allowed to make purchases. That is usually parental controls, or no payment method on the account.',
      };

    case RC.INSUFFICIENT_PERMISSIONS:
      return {
        ...base,
        message:
          'Your Google account does not have permission to make purchases on this device.',
      };

    case RC.NETWORK:
    case RC.OFFLINE_CONNECTION:
    case RC.PRODUCT_REQUEST_TIMED_OUT:
    case RC.API_ENDPOINT_BLOCKED:
      return {
        ...base,
        retryable: true,
        message:
          'We could not reach the store. Check your connection and try again. If you were charged, your access will appear on its own.',
      };

    case RC.STORE_PROBLEM:
    case RC.UNKNOWN_BACKEND:
    case RC.UNEXPECTED_BACKEND:
      return {
        ...base,
        retryable: true,
        message: 'Google Play is having trouble right now. Please try again in a few minutes.',
      };

    case RC.OPERATION_IN_PROGRESS:
      return {
        ...base,
        retryable: true,
        message: 'A purchase is already in progress. Give it a moment before trying again.',
      };

    case RC.INELIGIBLE:
      return { ...base, message: 'You are not eligible for this offer. Please choose another plan.' };

    case RC.PRODUCT_NOT_AVAILABLE:
    case RC.CONFIGURATION:
    case RC.INVALID_CREDENTIALS:
    case RC.UNSUPPORTED:
    case RC.INVALID_APP_USER_ID:
      // Our fault, not theirs. Say so plainly rather than implying they did
      // something wrong; the code still reaches the logs for us to act on.
      return {
        ...base,
        message:
          'This plan cannot be purchased right now. This is a problem on our side - please try again later or contact support.',
      };

    default:
      return {
        ...base,
        retryable: true,
        message:
          'Something went wrong completing your purchase. Please try again. If you were charged, your access will appear on its own.',
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
  const productChangeInfo = opts?.oldProductId
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
export const recordCompletedPurchase = async (
  userId: number,
  purchase: CompletedPurchase,
): Promise<RecordResult> => {
  const plan = planByProductId(purchase.productId);
  if (!plan) return 'unmatched';

  const token = purchase.storeTransactionId
    || `revenuecat:${purchase.revenuecatAppUserId}:${normalizeStoreProductId(purchase.productId)}`;

  if (await getSubscriptionByToken(token)) {
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
