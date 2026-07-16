import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import {
  getActiveSubscription,
  getSubscriptionByToken,
  saveSubscription,
} from '../db/queries';
import { PlanDef, planByProductId, computeEndsAt } from '../constants/plans';

/**
 * Google Play Billing for the subscription paywall, mirroring the web app's
 * App\Livewire\App\Paywall / SubscribeSheet purchase flow:
 *
 * - The device launches the Play purchase sheet and, on completion, records
 *   the subscription locally for INSTANT access.
 * - The purchase token is reported to the backend, which verifies it with the
 *   Play Developer API (and acknowledges it) before storing its authoritative
 *   copy - a forged token can never grant server-side access. Offline at that
 *   moment is fine: the sync engine pushes every local Play token until the
 *   backend knows it.
 * - Google keeps re-delivering an unacknowledged purchase on app start; the
 *   known-token check makes that idempotent, exactly like the web handlers.
 */

// react-native-iap is a native module; require lazily so a bundle running
// against a binary built before the module was added still boots - purchases
// then fail with the standard failure message instead of crashing at import.
let iap: any = null;
try {
  iap = require('react-native-iap');
} catch (e) {
  iap = null;
}

/**
 * Google Play replacement modes for plan switches (Billing Library values).
 * - WITH_TIME_PRORATION (upgrade): switch immediately and credit the unused
 *   portion of the old plan as extra time on the new one.
 * - DEFERRED (downgrade): keep the current plan until the paid period ends,
 *   then start the new (cheaper) plan - the user keeps what they paid for.
 */
export const WITH_TIME_PRORATION = 1;
export const DEFERRED = 6;

let connected = false;

export const initBilling = async (): Promise<boolean> => {
  if (!iap) return false;
  if (connected) return true;
  try {
    await iap.initConnection();
    connected = true;
    return true;
  } catch (e) {
    return false;
  }
};

export interface CompletedPurchase {
  purchaseToken: string;
  productId: string;
  orderId: string | null;
}

/**
 * Wire the Play purchase listeners; returns a cleanup function. The screens
 * treat these as the web's native:InAppPurchase.purchaseCompleted /
 * purchaseFailed / purchaseCancelled events.
 */
export const listenForPurchases = (
  onCompleted: (purchase: CompletedPurchase) => void,
  onError: (userCancelled: boolean) => void,
): (() => void) => {
  if (!iap) return () => {};

  const updateSub = iap.purchaseUpdatedListener((purchase: any) => {
    const purchaseToken: string =
      purchase?.purchaseToken || purchase?.purchaseTokenAndroid || '';
    const productId: string =
      purchase?.productId || purchase?.productIds?.[0] || '';
    if (purchaseToken && productId) {
      onCompleted({
        purchaseToken,
        productId,
        orderId: purchase?.transactionId || null,
      });
    }
  });

  const errorSub = iap.purchaseErrorListener((e: any) => {
    onError(e?.code === 'E_USER_CANCELLED');
  });

  return () => {
    try {
      updateSub?.remove();
      errorSub?.remove();
    } catch (e) {}
  };
};

/**
 * Launch the Google Play purchase sheet for a plan. For a plan SWITCH pass
 * the current subscription's purchase token: Play then prorates natively
 * (credits/charges and replaces the old subscription itself) using the given
 * replacement mode, the same choice the web Paywall makes. A first-time
 * subscriber just buys fresh.
 */
export const requestPlanPurchase = async (
  plan: PlanDef,
  opts?: { oldPurchaseToken?: string; replacementMode?: number },
): Promise<void> => {
  if (!(await initBilling())) {
    throw new Error('Google Play Billing is unavailable on this device.');
  }

  const sku = plan.store_product_id;

  // Billing 5+ products carry offers; the purchase call needs the base-plan
  // offer token. Missing catalog data surfaces as a purchase failure below.
  let offerToken: string | undefined;
  try {
    const subs = await iap.getSubscriptions({ skus: [sku] });
    offerToken = subs?.[0]?.subscriptionOfferDetails?.[0]?.offerToken;
  } catch (e) {}

  await iap.requestSubscription({
    sku,
    ...(offerToken ? { subscriptionOffers: [{ sku, offerToken }] } : {}),
    ...(opts?.oldPurchaseToken
      ? {
          purchaseTokenAndroid: opts.oldPurchaseToken,
          replacementModeAndroid: opts.replacementMode ?? WITH_TIME_PRORATION,
          prorationModeAndroid: opts.replacementMode ?? WITH_TIME_PRORATION,
        }
      : {}),
  });
};

export type RecordResult = 'recorded' | 'duplicate' | 'unmatched';

/**
 * Handle a completed Play purchase the way the web onPurchaseCompleted does:
 * match the plan, ignore re-delivered tokens, retire the old record on a plan
 * switch, store the subscription locally for instant access, and report the
 * token so the backend can verify it with Google.
 */
export const recordCompletedPurchase = async (
  userId: number,
  purchase: CompletedPurchase,
): Promise<RecordResult> => {
  const plan = planByProductId(purchase.productId);
  if (!plan) return 'unmatched';

  // Idempotency: a re-delivered completion for a token we already recorded
  // must not create a duplicate subscription.
  if (await getSubscriptionByToken(purchase.purchaseToken)) {
    return 'duplicate';
  }

  // Plan switch: Play has already replaced the old subscription server-side
  // (native proration); just retire our local record. The backend also learns
  // about it through the RTDN webhooks.
  const current = await getActiveSubscription(userId).catch(() => null);
  if (current && current.purchase_token && current.plan_slug !== plan.slug) {
    await saveSubscription(userId, {
      purchase_token: current.purchase_token,
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      auto_renewing: 0,
    });
  }

  const startedAt = new Date().toISOString();
  await saveSubscription(userId, {
    plan_id: null, // backend numeric id lands with the next pull; slug is the mapping key
    plan_slug: plan.slug,
    status: 'active',
    store: 'google_play',
    purchase_token: purchase.purchaseToken,
    google_order_id: purchase.orderId,
    trial_ends_at: null,
    started_at: startedAt,
    ends_at: computeEndsAt(plan, startedAt),
    canceled_at: null,
    auto_renewing: 1,
  });

  // Report the token; the backend verifies it with Google before storing its
  // authoritative copy. Offline right now - the background sync delivers it.
  try {
    await api.pushState({
      subscriptions: [
        {
          purchase_token: purchase.purchaseToken,
          plan_slug: plan.slug,
          google_order_id: purchase.orderId,
          started_at: startedAt,
        },
      ],
    });
  } catch (e) {}

  return 'recorded';
};

/**
 * Plan chosen in the subscribe sheet before authentication interrupted the
 * purchase (register -> email code -> sign in). The paywall - the first
 * screen an authenticated, unsubscribed user reaches - takes it and launches
 * the Play purchase immediately, which is the web sheet's triggerPurchase()
 * continuing after auth.
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
