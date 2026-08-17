import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { api } from './api';
import {
  getActiveSubscription,
  getSubscriptionByToken,
  saveSubscription,
} from '../db/queries';
import { getAppSetting } from '../db/queries';
import {
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
const REVENUECAT_ANDROID_PUBLIC_SDK_KEY = 'REVENUECAT_ANDROID_PUBLIC_SDK_KEY';
const REVENUECAT_IOS_PUBLIC_SDK_KEY = 'REVENUECAT_IOS_PUBLIC_SDK_KEY';

export const WITH_TIME_PRORATION = (Purchases as any)?.STORE_REPLACEMENT_MODE?.WITH_TIME_PRORATION ?? 1;
export const DEFERRED = (Purchases as any)?.STORE_REPLACEMENT_MODE?.DEFERRED ?? 6;

type CustomerInfo = any;
type PurchasesPackage = any;

let configuredAppUserId: string | null = null;
let configurePromise: Promise<boolean> | null = null;

const configuredApiKey = async (): Promise<string> => {
  const keyName = Platform.OS === 'ios'
    ? 'revenuecat_ios_public_sdk_key'
    : 'revenuecat_android_public_sdk_key';
  const fallback = Platform.OS === 'ios'
    ? REVENUECAT_IOS_PUBLIC_SDK_KEY
    : REVENUECAT_ANDROID_PUBLIC_SDK_KEY;
  const key = (await getAppSetting(keyName, fallback).catch(() => fallback)).trim();

  if (!key || key === fallback || key.startsWith('REVENUECAT_')) {
    throw new Error('RevenueCat API key is not configured.');
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
        } catch (e) {}
        Purchases.configure({ apiKey, appUserID: appUserId || undefined });
        configuredAppUserId = appUserId;
      } else if (appUserId && configuredAppUserId !== appUserId) {
        await Purchases.logIn(appUserId).catch(() => {});
        configuredAppUserId = appUserId;
      }
      return true;
    } catch (e) {
      return false;
    }
  })();

  return configurePromise;
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

const subscriptionInfoFor = (customerInfo: CustomerInfo, productId: string) => {
  const subscriptions = customerInfo?.subscriptionsByProductIdentifier || {};
  return subscriptions[productId]
    || subscriptions[normalizeStoreProductId(productId)]
    || Object.values(subscriptions).find((sub: any) => sameProduct(sub?.productIdentifier, productId))
    || null;
};

const packageProductId = (pkg: PurchasesPackage): string =>
  pkg?.product?.defaultOption?.storeProductId
    || pkg?.product?.identifier
    || '';

const packageForPlan = async (plan: PlanDef): Promise<PurchasesPackage> => {
  const offerings = await Purchases.getOfferings();
  const packages = offerings?.current?.availablePackages || [];
  const found = packages.find((pkg: PurchasesPackage) =>
    pkg?.identifier === plan.revenuecat_package_id
      || pkg?.identifier === plan.slug
      || sameProduct(packageProductId(pkg), plan.store_product_id),
  );

  if (!found) {
    throw new Error(`RevenueCat package for ${plan.name} is not configured.`);
  }

  return found;
};

const completedFromCustomerInfo = (
  customerInfo: CustomerInfo,
  fallbackProductId?: string,
): CompletedPurchase | null => {
  const entitlement = activeEntitlement(customerInfo, fallbackProductId);
  const productId = entitlement?.productIdentifier || fallbackProductId;
  if (!productId) return null;

  const subInfo: any = subscriptionInfoFor(customerInfo, productId);
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
  } catch (e) {
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
  } catch (e) {}

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
  } catch (e) {}
};

export const takePendingPlan = async (): Promise<string | null> => {
  try {
    const slug = await AsyncStorage.getItem(PENDING_PLAN_KEY);
    if (slug) await AsyncStorage.removeItem(PENDING_PLAN_KEY);
    return slug;
  } catch (e) {
    return null;
  }
};
