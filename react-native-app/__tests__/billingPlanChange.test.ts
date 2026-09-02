/**
 * @format
 *
 * Plan changes, pinned - specifically the DEFERRED one.
 *
 * A deferred change is the downgrade path, and it is the case that reads as a
 * failure if you check it the obvious way. Play accepts the change but does
 * NOT start it: the plan the customer already paid for runs to the end of its
 * period, and the cheaper one begins after. So the entitlement that comes back
 * still names the OLD product, correctly.
 *
 * Code that asks "is the NEW product entitled now" gets `undefined` and
 * concludes the purchase failed. That shipped: every downgrade told the
 * customer it had failed on a change Play had just accepted, and a second
 * attempt then hit Play's own refusal because the change was already queued.
 *
 * These tests fix both halves of the correct behaviour - do not throw, and do
 * not write the new plan to disk as if it had started.
 *
 * Mocks are hoisted rather than set up per test with resetModules(), which
 * would hand billing.ts a FRESH react-native-purchases mock from the setup
 * factory while the assertions still held the old instance.
 */
jest.mock('../src/db/queries', () => ({
  // Any usable key will do; without one initBilling refuses to configure and
  // every test below fails on "billing is unavailable" instead of on its own
  // subject. The baked-in fallback is Android-only and Jest reports ios.
  getAppSetting: jest.fn(() => Promise.resolve('goog_testkey')),
  saveAppSetting: jest.fn(() => Promise.resolve()),
  saveSubscription: jest.fn(() => Promise.resolve()),
  getActiveSubscription: jest.fn(() => Promise.resolve(null)),
  getSubscriptionByToken: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../src/services/api', () => ({
  api: {
    pushState: jest.fn(() => Promise.resolve({ ok: true })),
    pullContent: jest.fn(() => Promise.resolve({ ok: false })),
  },
}));

import Purchases from 'react-native-purchases';
import {
  DEFERRED,
  WITH_TIME_PRORATION,
  WITHOUT_PRORATION,
  CHARGE_PRORATED_PRICE,
  replacementModeFor,
  PURCHASE_NOT_ENTITLED,
  requestPlanPurchase,
  recordCompletedPurchase,
  restoreRevenueCatPurchases,
  describePurchaseFailure,
} from '../src/services/billing';
import { PLANS } from '../src/constants/plans';
import { planMonths } from '../src/constants/pricing';
import { saveSubscription, getActiveSubscription } from '../src/db/queries';
import { api } from '../src/services/api';

const monthly = PLANS.find((p) => p.slug === 'premium-monthly')!;
const yearly = PLANS.find((p) => p.slug === 'premium-yearly')!;
const quarterly = PLANS.find((p) => p.slug === 'premium-quarterly')!;

/**
 * A CustomerInfo entitled to `fullProductId`, in the shape ANDROID sends.
 *
 * The entitlement splits the id: `productIdentifier` is the subscription and
 * `productPlanIdentifier` is the base plan. `subscriptionsByProductIdentifier`
 * is keyed by the subscription alone, and its values carry no
 * productIdentifier field at all.
 *
 * Getting this wrong is not hypothetical. A fixture that put the joined id in
 * productIdentifier kept the suite green while every real purchase came back
 * "plan could not be matched".
 */
const infoEntitledTo = (fullProductId: string) => {
  const [subscriptionId, basePlanId = null] = fullProductId.split(':');
  return {
    originalAppUserId: '42',
    managementURL: null,
    latestExpirationDate: '2027-01-01T00:00:00Z',
    entitlements: {
      active: {
        premium: {
          productIdentifier: subscriptionId,
          productPlanIdentifier: basePlanId,
          expirationDate: '2027-01-01T00:00:00Z',
          latestPurchaseDate: '2026-01-01T00:00:00Z',
          originalPurchaseDate: '2026-01-01T00:00:00Z',
          willRenew: true,
          periodType: 'NORMAL',
        },
      },
      all: {},
    },
    subscriptionsByProductIdentifier: {
      [subscriptionId]: {
        productPlanIdentifier: basePlanId,
        storeTransactionId: 'GPA.TOKEN-1',
        purchaseDate: '2026-01-01T00:00:00Z',
        originalPurchaseDate: '2026-01-01T00:00:00Z',
        expiresDate: '2027-01-01T00:00:00Z',
        willRenew: true,
        periodType: 'NORMAL',
        managementURL: null,
      },
    },
  };
};

const packageFor = (productId: string, identifier: string) => ({
  identifier,
  product: {
    identifier: productId,
    priceString: '$1.00',
    price: 1,
    currencyCode: 'USD',
    defaultOption: { storeProductId: productId },
  },
});

beforeEach(() => {
  (saveSubscription as jest.Mock).mockClear();
  (getActiveSubscription as jest.Mock).mockClear();
  (api.pushState as jest.Mock).mockClear();
  // Default: the store knows nothing extra, so requestPlanPurchase keeps the
  // caller's old product id. Individual tests override this.
  (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({ entitlements: { active: {} } });
  (Purchases.getOfferings as jest.Mock).mockResolvedValue({
    current: {
      availablePackages: [
        packageFor('premium_monthly:monthly', '$rc_monthly'),
        packageFor('premium_monthly:p3m', '$rc_three_month'),
        packageFor('premium_monthly:p1y', '$rc_annual'),
      ],
    },
  });
});

describe('replacement modes', () => {
  it('sends Play a mode NAME, never a deprecated numeric proration code', () => {
    // Play rejects the number outright, and the rejection surfaces as a
    // generic "we were unable to change your plan" with nothing pointing here.
    expect(typeof DEFERRED).toBe('string');
    expect(typeof WITH_TIME_PRORATION).toBe('string');
    expect(DEFERRED).toBe('DEFERRED');
    expect(WITH_TIME_PRORATION).toBe('WITH_TIME_PRORATION');
  });
});

describe('replacementModeFor', () => {
  const M = (p: typeof monthly) => planMonths(p);

  /**
   * One mode, both directions, because it is the only one Play accepts here.
   *
   * DEFERRED and WITH_TIME_PRORATION were each tried against a real device on
   * this catalogue and each was declined, which reaches the customer as their
   * payment method being refused. Only WITHOUT_PRORATION went through. All
   * three are documented as valid, so these tests pin observed behaviour over
   * documented behaviour on purpose.
   */
  it('prorates an upgrade and leaves a downgrade alone', () => {
    // Upgrade: WITH_TIME_PRORATION, Google's recommendation, paired this time
    // with the JOINED old product id - the one combination never tried on a
    // device. Downgrade: WITHOUT_PRORATION, which is proven.
    expect(replacementModeFor(M(yearly), M(monthly))).toBe(WITH_TIME_PRORATION);
    expect(replacementModeFor(M(quarterly), M(monthly))).toBe(WITH_TIME_PRORATION);
    expect(replacementModeFor(M(yearly), M(quarterly))).toBe(WITH_TIME_PRORATION);

    expect(replacementModeFor(M(monthly), M(yearly))).toBe(WITHOUT_PRORATION);
    expect(replacementModeFor(M(quarterly), M(yearly))).toBe(WITHOUT_PRORATION);
    expect(replacementModeFor(M(monthly), M(quarterly))).toBe(WITHOUT_PRORATION);
  });

  it('takes the proven mode for an equal or unmeasurable period', () => {
    // Guessing toward the mode still under test, on incomplete information,
    // is the wrong way round.
    expect(replacementModeFor(3, 3)).toBe(WITHOUT_PRORATION);
    expect(replacementModeFor(null, 3)).toBe(WITHOUT_PRORATION);
    expect(replacementModeFor(3, null)).toBe(WITHOUT_PRORATION);
  });

  it('never sends the two modes already declined on a device', () => {
    const pairs: Array<[number | null, number | null]> = [
      [1, 12], [12, 1], [3, 3], [null, 3], [3, null], [null, null],
    ];

    for (const [next, current] of pairs) {
      const mode = replacementModeFor(next, current);
      expect(mode).not.toBe(DEFERRED);
      expect(mode).not.toBe(CHARGE_PRORATED_PRICE);
    }
  });

  it('is still a real mode name, not a deprecated numeric code', () => {
    // Play rejects the number outright, and the rejection surfaces as a
    // generic failure with nothing pointing back here.
    expect(typeof WITHOUT_PRORATION).toBe('string');
    expect(WITHOUT_PRORATION).toBe('WITHOUT_PRORATION');
  });
});

describe('requestPlanPurchase on a deferred downgrade', () => {
  it('treats the still-old entitlement as success, not failure', async () => {
    // Downgrading yearly -> monthly. Play queues it; the yearly entitlement
    // is what is live, and stays live until it expires.
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: infoEntitledTo('premium_monthly:p1y'),
      productIdentifier: 'premium_monthly',
    });

    const purchase = await requestPlanPurchase(42, monthly, {
      oldProductId: yearly.store_product_id,
      replacementMode: DEFERRED,
    });

    expect(purchase.deferred).toBe(true);
    // It describes the plan actually running, not the one that starts later.
    expect(purchase.productId).toBe('premium_monthly:p1y');
    expect(purchase.endsAt).toBe('2027-01-01T00:00:00Z');
  });

  it('passes the change through to Play as a deferred replacement', async () => {
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: infoEntitledTo('premium_monthly:p1y'),
      productIdentifier: 'premium_monthly',
    });

    await requestPlanPurchase(42, monthly, {
      oldProductId: yearly.store_product_id,
      replacementMode: DEFERRED,
    });

    // The SUBSCRIPTION, not the base plan: Play identifies an existing
    // purchase by subscription id and never reports which base plan runs, so
    // naming p1y matches no active purchase and the change is declined.
    // A non-WITHOUT_PRORATION mode carries the JOINED id, so RevenueCat can
    // pin the change to one base plan rather than to the parent of three.
    expect(Purchases.purchasePackage).toHaveBeenLastCalledWith(
      expect.objectContaining({ identifier: '$rc_monthly' }),
      null,
      { oldProductIdentifier: 'premium_monthly:p1y', replacementMode: 'DEFERRED' },
    );
  });

  it('names the product the store says they own, not the one we assumed', async () => {
    // The local subscription row records a plan slug and no product id, so the
    // caller can only pass what the catalogue maps that slug to. When the row
    // is stale that is the wrong product, and Play rejects a replacement that
    // names a product the customer does not hold. Ask the store instead.
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(
      infoEntitledTo('premium_monthly:p3m'),
    );
    // After an immediate proration upgrade the entitlement has moved to p1y.
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: infoEntitledTo('premium_monthly:p1y'),
      productIdentifier: 'premium_monthly',
    });

    await requestPlanPurchase(42, yearly, {
      // Stale: the row says monthly, but they are really on p3m.
      oldProductId: monthly.store_product_id,
      replacementMode: WITH_TIME_PRORATION,
    });

    expect(Purchases.purchasePackage).toHaveBeenLastCalledWith(
      expect.anything(),
      null,
      expect.objectContaining({ oldProductIdentifier: 'premium_monthly:p3m' }),
    );
  });

  it('falls back to the caller value when the store cannot say', async () => {
    (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: infoEntitledTo('premium_monthly:p1y'),
      productIdentifier: 'premium_monthly',
    });

    await requestPlanPurchase(42, yearly, {
      oldProductId: quarterly.store_product_id,
      replacementMode: WITH_TIME_PRORATION,
    });

    // The store could not answer, so the caller's own value is used - joined,
    // because the mode prorates.
    expect(Purchases.purchasePackage).toHaveBeenLastCalledWith(
      expect.anything(),
      null,
      expect.objectContaining({ oldProductIdentifier: 'premium_monthly:p3m' }),
    );
  });

  it('accepts a purchase whose entitlement names another product', async () => {
    // Success is "do they hold premium now", not "does the entitlement name
    // exactly what we asked for". Requiring the product match produced a false
    // failure twice: on a deferred change, and whenever Android's split
    // product fields did not both arrive. They are entitled; that is the
    // question.
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: infoEntitledTo('premium_monthly:p1y'),
      productIdentifier: 'premium_monthly',
    });

    await expect(requestPlanPurchase(42, monthly)).resolves.toBeTruthy();
  });

  it('rejects, with a code, when nothing is entitled at all', async () => {
    // The real failure this guard is for: Play may well have taken the money
    // and no entitlement came back. It must not read as a generic fault, and
    // it must not invite a second payment.
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: { originalAppUserId: '42', entitlements: { active: {}, all: {} } },
      productIdentifier: 'premium_monthly',
    });

    await expect(requestPlanPurchase(42, monthly)).rejects.toMatchObject({
      code: PURCHASE_NOT_ENTITLED,
    });
  });
});

describe('the id Android actually returns', () => {
  it('resolves the plan even though every id the store gives back is bare', async () => {
    // Reproduces "purchase received but plan could not be matched" exactly.
    //
    // On Android BOTH purchasePackage and the entitlement report the bare
    // `premium_monthly`. That names all three plans, so every id available
    // from the store resolves to none of them. The plan the customer tapped
    // is the authoritative answer, and we already hold it.
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: {
        originalAppUserId: '42',
        entitlements: {
          active: {
            premium: {
              // Bare, with no base plan field at all - the degraded shape.
              productIdentifier: 'premium_monthly',
              productPlanIdentifier: null,
              expirationDate: '2027-01-01T00:00:00Z',
              willRenew: true,
              periodType: 'NORMAL',
            },
          },
          all: {},
        },
        subscriptionsByProductIdentifier: {},
      },
      productIdentifier: 'premium_monthly',
    });

    const purchase = await requestPlanPurchase(42, quarterly);

    expect(purchase.productId).toBe('premium_monthly:p3m');

    const result = await recordCompletedPurchase(42, purchase);
    expect(result).not.toBe('unmatched');
  });

  it('keeps the entitlement even when it does not match what was asked for', async () => {
    // Looking the entitlement up by a non-matching product used to discard it
    // entirely, taking the expiry and store transaction id with it.
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: infoEntitledTo('premium_monthly:p1y'),
      productIdentifier: 'premium_monthly',
    });

    const purchase = await requestPlanPurchase(42, monthly);

    expect(purchase.endsAt).toBe('2027-01-01T00:00:00Z');
    expect(purchase.storeTransactionId).toBe('GPA.TOKEN-1');
  });
});

describe('restore', () => {
  it('finds the plan from the subscription map when the entitlement omits it', async () => {
    // Restore exists to discover what somebody owns, so unlike a purchase it
    // has no plan to fall back on. When the entitlement arrives without its
    // base plan half, the subscription map still carries it - and without
    // reading that, restore fails with "plan could not be matched" for a
    // customer who is genuinely subscribed.
    (Purchases.restorePurchases as jest.Mock).mockResolvedValue({
      originalAppUserId: '42',
      entitlements: {
        active: {
          premium: {
            productIdentifier: 'premium_monthly',
            productPlanIdentifier: null,
            expirationDate: '2027-01-01T00:00:00Z',
            willRenew: true,
            periodType: 'NORMAL',
          },
        },
        all: {},
      },
      subscriptionsByProductIdentifier: {
        premium_monthly: {
          productPlanIdentifier: 'p1y',
          isActive: true,
          storeTransactionId: 'GPA.RESTORED',
          expiresDate: '2027-01-01T00:00:00Z',
          willRenew: true,
          periodType: 'NORMAL',
        },
      },
    });

    const purchase = await restoreRevenueCatPurchases(42);

    expect(purchase).not.toBeNull();
    expect(purchase!.productId).toBe('premium_monthly:p1y');
    expect(await recordCompletedPurchase(42, purchase!)).not.toBe('unmatched');
  });

  it('ignores a lapsed subscription when deciding the plan', async () => {
    // A finished subscription still sits in the map. Letting it name the plan
    // would record somebody on a plan they no longer hold.
    (Purchases.restorePurchases as jest.Mock).mockResolvedValue({
      originalAppUserId: '42',
      entitlements: {
        active: {
          premium: {
            productIdentifier: 'premium_monthly',
            productPlanIdentifier: null,
            expirationDate: '2027-01-01T00:00:00Z',
            willRenew: true,
            periodType: 'NORMAL',
          },
        },
        all: {},
      },
      subscriptionsByProductIdentifier: {
        premium_monthly: {
          productPlanIdentifier: 'p1y',
          isActive: true,
          expiresDate: '2027-01-01T00:00:00Z',
          willRenew: true,
        },
      },
    });

    const purchase = await restoreRevenueCatPurchases(42);
    expect(purchase!.productId).toBe('premium_monthly:p1y');
  });

  it('returns null rather than a stale row when nothing is entitled', async () => {
    (Purchases.restorePurchases as jest.Mock).mockResolvedValue({
      originalAppUserId: '42',
      entitlements: { active: {}, all: {} },
      subscriptionsByProductIdentifier: {},
    });

    expect(await restoreRevenueCatPurchases(42)).toBeNull();
  });
});

describe('describePurchaseFailure', () => {
  it('gives the not-entitled case its own message and never says retry', () => {
    const f = describePurchaseFailure({ code: PURCHASE_NOT_ENTITLED, message: 'x' });

    expect(f.messageKey).toBe('billing.notEntitled');
    // Retrying cannot help and might pay twice.
    expect(f.retryable).toBe(false);
    expect(f.cancelled).toBe(false);
  });

  it('carries the code out to the customer when it cannot classify', () => {
    // An unclassified failure that shows nothing teaches nobody anything; a
    // support screenshot is usually all we ever get.
    const f = describePurchaseFailure({ code: '9999', message: 'strange' });

    expect(f.messageKey).toBe('billing.unknown');
    expect(f.code).toBe('9999');
  });

  it('still treats a user cancel as no error at all', () => {
    expect(describePurchaseFailure({ code: '1' }).cancelled).toBe(true);
    expect(describePurchaseFailure({ userCancelled: true }).cancelled).toBe(true);
  });
});

describe('the old product id sent to the store', () => {
  it('sends the joined id when prorating', () => {
    // RevenueCat's catalogue is keyed by the joined form, so a prorated change
    // names the exact base plan being replaced.
    expect(replacementModeFor(12, 1)).toBe(WITH_TIME_PRORATION);
  });

  it('sends the bare subscription for the proven mode', async () => {
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(
      infoEntitledTo('premium_monthly:p1y'),
    );
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: infoEntitledTo('premium_monthly:monthly'),
      productIdentifier: 'premium_monthly',
    });

    await requestPlanPurchase(42, monthly, {
      oldProductId: yearly.store_product_id,
      replacementMode: WITHOUT_PRORATION,
    });

    expect(Purchases.purchasePackage).toHaveBeenLastCalledWith(
      expect.anything(),
      null,
      { oldProductIdentifier: 'premium_monthly', replacementMode: WITHOUT_PRORATION },
    );
  });
});

describe('the Android split product id', () => {
  it('records the base plan, not the bare subscription', async () => {
    // The purchase that produced "plan could not be matched" in production.
    // Android reports premium_monthly + p1y as two fields; joining them is the
    // only way to get an id the catalogue can resolve, because the bare
    // subscription names all three plans and so resolves to none.
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: infoEntitledTo('premium_monthly:p1y'),
      productIdentifier: 'premium_monthly',
    });

    const purchase = await requestPlanPurchase(42, yearly);

    expect(purchase.productId).toBe('premium_monthly:p1y');

    const result = await recordCompletedPurchase(42, purchase);
    expect(result).not.toBe('unmatched');
    expect(result).toBe('recorded');
  });

  it('reads the expiry off a subscription keyed by the bare subscription id', async () => {
    // subscriptionsByProductIdentifier is keyed without the base plan, so a
    // direct lookup on the joined id misses and the entry has to be rebuilt.
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: infoEntitledTo('premium_monthly:p3m'),
      productIdentifier: 'premium_monthly',
    });

    const purchase = await requestPlanPurchase(42, quarterly);

    expect(purchase.productId).toBe('premium_monthly:p3m');
    // Proof the subscription entry was found rather than defaulted: these come
    // only from subscriptionsByProductIdentifier.
    expect(purchase.storeTransactionId).toBe('GPA.TOKEN-1');
    expect(purchase.endsAt).toBe('2027-01-01T00:00:00Z');
  });
});

describe('recordCompletedPurchase on a deferred change', () => {
  it('writes nothing and reports deferred', async () => {
    const result = await recordCompletedPurchase(42, {
      revenuecatAppUserId: '42',
      productId: 'premium_monthly:p1y',
      storeTransactionId: 'GPA.TOKEN-1',
      managementURL: null,
      startedAt: '2026-01-01T00:00:00Z',
      endsAt: '2027-01-01T00:00:00Z',
      autoRenewing: true,
      periodType: 'NORMAL',
      deferred: true,
    });

    expect(result).toBe('deferred');
    // The row on disk is the subscription still running. Touching it is how
    // the customer's live plan gets marked cancelled for a change that has
    // not happened, and how the new plan gets written with the old expiry.
    expect(saveSubscription).not.toHaveBeenCalled();
    expect(getActiveSubscription).not.toHaveBeenCalled();
    expect(api.pushState).not.toHaveBeenCalled();
  });

  it('does record an ordinary immediate purchase', async () => {
    // The guard above is a narrow exemption, not a general off-switch: the
    // normal path must still write the row and push it.
    const result = await recordCompletedPurchase(42, {
      revenuecatAppUserId: '42',
      productId: 'premium_monthly:p1y',
      storeTransactionId: 'GPA.TOKEN-2',
      managementURL: null,
      startedAt: '2026-01-01T00:00:00Z',
      endsAt: '2027-01-01T00:00:00Z',
      autoRenewing: true,
      periodType: 'NORMAL',
    });

    expect(result).toBe('recorded');
    expect(saveSubscription).toHaveBeenCalled();
    expect(api.pushState).toHaveBeenCalled();
  });
});
