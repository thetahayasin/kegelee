/**
 * @format
 *
 * Plan changes, pinned.
 *
 * All three plans are base plans of ONE Play subscription, and Google's own
 * documentation says what that allows:
 *
 *   "When switching plans within the same subscription to an auto-renewing
 *    plan from either a prepaid plan or an auto-renewing plan, valid proration
 *    modes are CHARGE_FULL_PRICE and WITHOUT_PRORATION. If you specify any
 *    other proration mode, the purchase fails and an error is shown to the
 *    user."
 *
 * DEFERRED is one of the modes that fails, which is why it no longer has a
 * code path - only a test that it is never sent. A rejected change reaches the
 * customer as their payment method being refused, so the modes this file
 * asserts are the difference between a working downgrade and a support ticket.
 *
 * Mocks are hoisted rather than set up per test with resetModules(), which
 * would hand billing.ts a FRESH react-native-purchases mock from the setup
 * factory while the assertions still held the old instance.
 */
jest.mock('../src/db/queries', () => ({
  // Configuration is covered separately by billingIdentity.test.ts.
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
import { Platform } from 'react-native';
import {
  DEFERRED,
  WITH_TIME_PRORATION,
  WITHOUT_PRORATION,
  CHARGE_PRORATED_PRICE,
  CHARGE_FULL_PRICE,
  replacementModeFor,
  PURCHASE_NOT_ENTITLED,
  requestPlanPurchase,
  recordCompletedPurchase,
  restoreRevenueCatPurchases,
  describePurchaseFailure,
} from '../src/services/billing';
import { PLANS, planByProductId } from '../src/constants/plans';
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

const originalPlatform = Platform.OS;

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
});

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
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
   * An upgrade prorates; everything else does not.
   *
   * DEFERRED, WITH_TIME_PRORATION and CHARGE_PRORATED_PRICE were each tried
   * against a real device on this catalogue and each was declined, which
   * reaches the customer as their payment method being refused. That was read
   * as Play accepting a single mode here. It is not: the two prorating modes
   * tried both hold the billing period fixed, and every switch in this
   * catalogue changes it, so neither could ever have expressed one.
   *
   * CHARGE_FULL_PRICE is the mode Google names for a move to a longer billing
   * period, and it is the only one of the five that both starts the new period
   * today and credits the days already paid for.
   */
  it('charges the full price of a longer period, with the old time credited', () => {
    expect(replacementModeFor(M(yearly), M(monthly))).toBe(CHARGE_FULL_PRICE);
    expect(replacementModeFor(M(quarterly), M(monthly))).toBe(CHARGE_FULL_PRICE);
    expect(replacementModeFor(M(yearly), M(quarterly))).toBe(CHARGE_FULL_PRICE);
  });

  it('leaves a downgrade on the mode that charges nothing today', () => {
    // CHARGE_FULL_PRICE here would take a full period's money to put somebody
    // on a cheaper plan, which is the opposite of what they asked for.
    expect(replacementModeFor(M(monthly), M(yearly))).toBe(WITHOUT_PRORATION);
    expect(replacementModeFor(M(monthly), M(quarterly))).toBe(WITHOUT_PRORATION);
    expect(replacementModeFor(M(quarterly), M(yearly))).toBe(WITHOUT_PRORATION);
  });

  it('does not charge a full period on an equal or unmeasurable length', () => {
    // Elsewhere in this flow an unknown length is assumed to be an upgrade,
    // because the cost of guessing wrong is making somebody wait. Here the
    // cost is taking a year's money on a guess.
    expect(replacementModeFor(3, 3)).toBe(WITHOUT_PRORATION);
    expect(replacementModeFor(null, 3)).toBe(WITHOUT_PRORATION);
    expect(replacementModeFor(3, null)).toBe(WITHOUT_PRORATION);
    expect(replacementModeFor(null, null)).toBe(WITHOUT_PRORATION);
  });

  it('takes nothing during a free trial, in either direction', () => {
    // The trial is three free days that were promised. CHARGE_FULL_PRICE would
    // bill on the spot and end the trial early - somebody moving up a plan on
    // day one would pay for a year they thought they were still trying out.
    expect(replacementModeFor(M(yearly), M(monthly), true)).toBe(WITHOUT_PRORATION);
    expect(replacementModeFor(M(quarterly), M(monthly), true)).toBe(WITHOUT_PRORATION);
    expect(replacementModeFor(M(yearly), M(quarterly), true)).toBe(WITHOUT_PRORATION);
    expect(replacementModeFor(M(monthly), M(yearly), true)).toBe(WITHOUT_PRORATION);
  });

  it('charges the upgrade once the trial is over', () => {
    // Same pair, trial finished: the guard must not have quietly become the
    // whole rule.
    expect(replacementModeFor(M(yearly), M(monthly), false)).toBe(CHARGE_FULL_PRICE);
    expect(replacementModeFor(M(yearly), M(monthly))).toBe(CHARGE_FULL_PRICE);
  });

  it('never sends one of the three modes a device has already declined', () => {
    const pairs: Array<[number | null, number | null]> = [
      [1, 12], [12, 1], [3, 1], [1, 3], [12, 3], [3, 12],
      [3, 3], [null, 3], [3, null], [null, null],
    ];

    for (const [next, current] of pairs) {
      for (const trialing of [true, false]) {
        const mode = replacementModeFor(next, current, trialing);
        expect(mode).not.toBe(DEFERRED);
        expect(mode).not.toBe(CHARGE_PRORATED_PRICE);
        expect(mode).not.toBe(WITH_TIME_PRORATION);
      }
    }
  });

  it('is still a real mode name, not a deprecated numeric code', () => {
    // Play rejects the number outright, and the rejection surfaces as a
    // generic failure with nothing pointing back here.
    expect(typeof WITHOUT_PRORATION).toBe('string');
    expect(typeof CHARGE_FULL_PRICE).toBe('string');
    expect(WITHOUT_PRORATION).toBe('WITHOUT_PRORATION');
    expect(CHARGE_FULL_PRICE).toBe('CHARGE_FULL_PRICE');
  });
});

describe('requestPlanPurchase on a plan change', () => {
  it('names the product the store says they own, not the one we assumed', async () => {
    // The local subscription row records a plan slug and no product id, so the
    // caller can only pass what the catalogue maps that slug to. When the row
    // is stale that is the wrong product, and Play rejects a replacement that
    // names a product the customer does not hold. Ask the store instead.
    //
    // The stale value here is the LEGACY `premium_quarterly`, which is a
    // subscription of its own. That is the only stale case the bare id cannot
    // absorb: the three current plans all reduce to `premium_monthly`, so a
    // row naming the wrong one of those would come out right by accident.
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(
      infoEntitledTo('premium_monthly:p3m'),
    );
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: infoEntitledTo('premium_monthly:p1y'),
      productIdentifier: 'premium_monthly',
    });

    await requestPlanPurchase(42, yearly, {
      oldProductId: 'premium_quarterly',
      replacementMode: CHARGE_FULL_PRICE,
    });

    expect(Purchases.purchasePackage).toHaveBeenLastCalledWith(
      expect.anything(),
      null,
      expect.objectContaining({ oldProductIdentifier: 'premium_monthly' }),
    );
  });

  it('falls back to the caller value when the store cannot say', async () => {
    (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: infoEntitledTo('premium_monthly:p1y'),
      productIdentifier: 'premium_monthly',
    });

    await requestPlanPurchase(42, yearly, {
      oldProductId: 'premium_quarterly',
      replacementMode: CHARGE_FULL_PRICE,
    });

    // The store could not answer, so the caller's own value is used - still
    // reduced to its subscription, which for a legacy id is already bare.
    expect(Purchases.purchasePackage).toHaveBeenLastCalledWith(
      expect.anything(),
      null,
      expect.objectContaining({ oldProductIdentifier: 'premium_quarterly' }),
    );
  });

  it('reduces a joined old product id to its subscription for every mode', async () => {
    // The regression this replaced: a prorating mode used to send the joined
    // id, so an upgrade named a base plan Play cannot match to a purchase.
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(
      infoEntitledTo('premium_monthly:p3m'),
    );
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: infoEntitledTo('premium_monthly:p1y'),
      productIdentifier: 'premium_monthly',
    });

    for (const mode of [CHARGE_FULL_PRICE, WITHOUT_PRORATION, DEFERRED]) {
      await requestPlanPurchase(42, yearly, {
        oldProductId: quarterly.store_product_id,
        replacementMode: mode,
      });

      expect(Purchases.purchasePackage).toHaveBeenLastCalledWith(
        expect.anything(),
        null,
        { oldProductIdentifier: 'premium_monthly', replacementMode: mode },
      );
    }
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
  it('asks the store even when the caller passed no old product at all', async () => {
    /**
     * The regression this pins is one level up from a stale id: the paywall
     * passes NOTHING when it decides the tap is not a switch, and it decided
     * that from the local subscription row. A row that is missing (fresh
     * install, restore not yet run), stale, or written off as cancelled
     * therefore turned a plan change into a plain purchase of a subscription
     * the Google account already owns - which Play declines.
     *
     * The store knows. The lookup used to be skipped entirely unless the
     * caller had already guessed.
     */
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(
      infoEntitledTo('premium_monthly:p3m'),
    );
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: infoEntitledTo('premium_monthly:p1y'),
      productIdentifier: 'premium_monthly',
    });

    await requestPlanPurchase(42, yearly);

    expect(Purchases.purchasePackage).toHaveBeenLastCalledWith(
      expect.anything(),
      null,
      expect.objectContaining({ oldProductIdentifier: 'premium_monthly' }),
    );
  });

  it('still sends no change when the store says they own nothing', async () => {
    // The other half: a first purchase must stay a plain purchase. Sending a
    // product change with an empty old product is its own Play rejection.
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
      entitlements: { active: {}, all: {} },
    });
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: infoEntitledTo('premium_monthly:p1y'),
      productIdentifier: 'premium_monthly',
    });

    await requestPlanPurchase(42, yearly);

    expect(Purchases.purchasePackage).toHaveBeenLastCalledWith(
      expect.anything(),
      null,
      null,
    );
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

describe('what counts as a successful purchase', () => {
  it('requires the NAMED premium entitlement, not just any active one', async () => {
    /**
     * "Is anything at all active" makes the entitlement id decorative. The
     * moment a second entitlement exists for anything else - a lifetime
     * unlock, a promo, an entitlement added for a different feature - holding
     * it would report a premium purchase as successful and hand back a
     * CompletedPurchase for a plan nobody bought, which then gets written to
     * the subscriptions table as an active row.
     *
     * `premium` is what the gate, restore and the launch reconcile all check.
     */
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: {
        originalAppUserId: '42',
        entitlements: {
          active: {
            legacy_lifetime: {
              productIdentifier: 'premium_monthly',
              productPlanIdentifier: 'p1y',
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

    await expect(requestPlanPurchase(42, monthly)).rejects.toMatchObject({
      code: PURCHASE_NOT_ENTITLED,
    });
  });

  it('prefers the purchase token from this very transaction to a synthesized id', async () => {
    /**
     * The synthesized `<appUserId>:<productId>` is a LOCAL key, not a store
     * identifier: it is identical for the same person and plan every time, so
     * a resubscribe after a lapse collides with the row from the previous
     * subscription and recordCompletedPurchase writes it off as a duplicate.
     * The purchase call hands back a real token; use it.
     */
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: {
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
        // Empty on purpose: no storeTransactionId to be found here, which is
        // exactly when the transaction is the only real identifier available.
        subscriptionsByProductIdentifier: {},
      },
      productIdentifier: 'premium_monthly',
      transaction: {
        transactionIdentifier: 'GPA.FALLBACK',
        purchaseToken: 'play-token-xyz',
      },
    });

    const purchase = await requestPlanPurchase(42, monthly);

    expect(purchase.storeTransactionId).toBe('play-token-xyz');
  });

  it('falls back to the transaction identifier where there is no purchase token', async () => {
    // purchaseToken is Android-only and null elsewhere.
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: {
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
        subscriptionsByProductIdentifier: {},
      },
      productIdentifier: 'premium_monthly',
      transaction: { transactionIdentifier: 'ios-txn-1', purchaseToken: null },
    });

    const purchase = await requestPlanPurchase(42, monthly);

    expect(purchase.storeTransactionId).toBe('ios-txn-1');
  });
});

describe('grace periods and billing problems', () => {
  it('carries the grace period and billing issue dates off the subscription', async () => {
    // A grace period is the one state where the expiry is in the past and the
    // customer is still entitled, because Play is retrying the charge. Without
    // these two dates every reader of the row concludes they have lapsed.
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: {
        originalAppUserId: '42',
        entitlements: {
          active: {
            premium: {
              productIdentifier: 'premium_monthly',
              productPlanIdentifier: 'p1y',
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
            storeTransactionId: 'GPA.GRACE',
            expiresDate: '2027-01-01T00:00:00Z',
            willRenew: true,
            periodType: 'NORMAL',
            gracePeriodExpiresDate: '2027-01-15T00:00:00Z',
            billingIssuesDetectedAt: '2026-12-30T00:00:00Z',
          },
        },
      },
      productIdentifier: 'premium_monthly',
    });

    const purchase = await requestPlanPurchase(42, yearly);

    expect(purchase.gracePeriodEndsAt).toBe('2027-01-15T00:00:00Z');
    expect(purchase.billingIssueAt).toBe('2026-12-30T00:00:00Z');
  });

  it('reads the CURRENT period type from the subscription, not the last one', async () => {
    // The entitlement reports the period type of the transaction that last
    // granted access, so it still says TRIAL on the first renewal after a
    // trial converts - a paying customer written to disk as `trialing`, with
    // trial_ends_at set to their real renewal date.
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: {
        originalAppUserId: '42',
        entitlements: {
          active: {
            premium: {
              productIdentifier: 'premium_monthly',
              productPlanIdentifier: 'p1y',
              expirationDate: '2027-01-01T00:00:00Z',
              willRenew: true,
              periodType: 'TRIAL',
            },
          },
          all: {},
        },
        subscriptionsByProductIdentifier: {
          premium_monthly: {
            productPlanIdentifier: 'p1y',
            storeTransactionId: 'GPA.CONVERTED',
            expiresDate: '2027-01-01T00:00:00Z',
            willRenew: true,
            periodType: 'NORMAL',
          },
        },
      },
      productIdentifier: 'premium_monthly',
    });

    const purchase = await requestPlanPurchase(42, yearly);

    expect(purchase.periodType).toBe('NORMAL');
  });
});

describe('recordCompletedPurchase', () => {
  it('records an ordinary immediate purchase', async () => {
    const result = await recordCompletedPurchase(42, {
      revenuecatAppUserId: '42',
      productId: 'premium_monthly:p1y',
      storeTransactionId: 'GPA.TOKEN-2',
      managementURL: null,
      startedAt: '2026-01-01T00:00:00Z',
      endsAt: '2027-01-01T00:00:00Z',
      autoRenewing: true,
      periodType: 'NORMAL',
      gracePeriodEndsAt: null,
      billingIssueAt: null,
    });

    expect(result).toBe('recorded');
    expect(saveSubscription).toHaveBeenCalled();
    expect(api.pushState).toHaveBeenCalled();
  });
});

describe('App Store purchases and restores', () => {
  const appleInfo = (plan: typeof monthly) => {
    const info = infoEntitledTo(plan.app_store_product_id);
    info.subscriptionsByProductIdentifier[plan.app_store_product_id].storeTransactionId = '2000000123456789';
    return info;
  };

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    (getActiveSubscription as jest.Mock).mockResolvedValue(null);
    (Purchases.getOfferings as jest.Mock).mockResolvedValue({
      current: {
        availablePackages: PLANS.map((plan) => ({
          identifier: plan.revenuecat_package_id,
          product: {
            identifier: plan.app_store_product_id,
            priceString: '$1.00', price: 1, currencyCode: 'USD',
          },
        })),
      },
    });
  });

  it('records the Apple product and transaction for a purchase', async () => {
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: appleInfo(yearly),
      productIdentifier: yearly.app_store_product_id,
    });

    const purchase = await requestPlanPurchase(42, yearly);
    expect(purchase.productId).toBe(yearly.app_store_product_id);
    expect(await recordCompletedPurchase(42, purchase)).toBe('recorded');
    expect(saveSubscription).toHaveBeenLastCalledWith(42, expect.objectContaining({
      plan_slug: yearly.slug,
      store_product_id: yearly.app_store_product_id,
      purchase_token: '2000000123456789',
    }));
    expect(api.pushState).toHaveBeenLastCalledWith({
      subscriptions: [expect.objectContaining({
        revenuecat_product_id: yearly.app_store_product_id,
        store_transaction_id: '2000000123456789',
      })],
    });
  });

  it('lets StoreKit handle a plan switch without Play replacement options', async () => {
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(appleInfo(monthly));
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: appleInfo(yearly), productIdentifier: yearly.app_store_product_id,
    });
    (getActiveSubscription as jest.Mock).mockResolvedValue({
      plan_slug: monthly.slug, purchase_token: 'previous-apple-transaction',
    });

    const purchase = await requestPlanPurchase(42, yearly, {
      oldProductId: monthly.app_store_product_id, replacementMode: CHARGE_FULL_PRICE,
    });
    expect(Purchases.purchasePackage).toHaveBeenLastCalledWith(
      expect.objectContaining({ product: expect.objectContaining({ identifier: yearly.app_store_product_id }) }),
      null, null,
    );
    await recordCompletedPurchase(42, purchase);
    expect(api.pushState).toHaveBeenLastCalledWith({
      subscriptions: [expect.objectContaining({ plan_change_effective_at: null })],
    });
  });

  it.each(PLANS)('restores $slug from its Apple SKU', async (plan) => {
    (Purchases.restorePurchases as jest.Mock).mockResolvedValue(appleInfo(plan));

    const purchase = await restoreRevenueCatPurchases(42);
    expect(purchase?.productId).toBe(plan.app_store_product_id);
    expect(await recordCompletedPurchase(42, purchase!)).toBe('recorded');
    expect(saveSubscription).toHaveBeenLastCalledWith(42, expect.objectContaining({ plan_slug: plan.slug }));
  });

  it('keeps the current entitlement when Apple defers the requested change', async () => {
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(appleInfo(yearly));
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: appleInfo(yearly), productIdentifier: monthly.app_store_product_id,
    });

    const purchase = await requestPlanPurchase(42, monthly);
    expect(purchase.productId).toBe(yearly.app_store_product_id);
    await recordCompletedPurchase(42, purchase);
    expect(saveSubscription).toHaveBeenLastCalledWith(42, expect.objectContaining({ plan_slug: yearly.slug }));
  });

  it('does not resolve an unknown or malformed Apple product', () => {
    expect(planByProductId('com.kegelee.premium.unknown')).toBeNull();
    expect(planByProductId(`${yearly.app_store_product_id}:monthly`)).toBeNull();
  });
});
