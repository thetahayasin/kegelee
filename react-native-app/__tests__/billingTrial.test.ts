/**
 * @format
 *
 * When the paywall is allowed to say "3 days free".
 *
 * This has to fail CLOSED, and the reason is asymmetric: promising a trial the
 * store then refuses charges somebody on the spot who was told they had three
 * free days, which is a refund, a one-star review and a Play policy problem.
 * Staying quiet about a trial somebody was entitled to costs a little
 * conversion. So every uncertainty resolves to "no trial".
 *
 * The hard part is that on Android checkTrialOrIntroductoryPriceEligibility
 * answers UNKNOWN for everyone, always - Play does not expose per-customer
 * trial eligibility to the SDK. The real test there is two facts together:
 * Play served an offer with a free phase (it only serves offers this Google
 * account can actually take), AND this RevenueCat customer has never bought
 * anything.
 */
jest.mock('../src/db/queries', () => ({
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
import { getPlanPricing } from '../src/services/billing';
import { PLANS } from '../src/constants/plans';

const INTRO_UNKNOWN = 0;
const INTRO_INELIGIBLE = 1;

/**
 * A package as PLAY describes it: the free trial lives on the free pricing
 * phase of the option the purchase flow will use, not on introPrice.
 */
const packageFor = (
  productId: string,
  identifier: string,
  freePhaseIso?: string,
) => ({
  identifier,
  product: {
    identifier: productId,
    priceString: '$1.00',
    price: 1,
    currencyCode: 'USD',
    defaultOption: {
      storeProductId: productId,
      ...(freePhaseIso ? { freePhase: { billingPeriod: { iso8601: freePhaseIso } } } : {}),
    },
  },
});

const offeringsWithTrial = (freePhaseIso?: string) => ({
  current: {
    availablePackages: [
      packageFor('premium_monthly:monthly', '$rc_monthly', freePhaseIso),
      packageFor('premium_monthly:p3m', '$rc_three_month', freePhaseIso),
      packageFor('premium_monthly:p1y', '$rc_annual', freePhaseIso),
    ],
  },
});

/** Nothing ever bought on this RevenueCat customer. */
const virginCustomer = {
  originalAppUserId: '42',
  entitlements: { active: {}, all: {} },
  allPurchaseDates: {},
  subscriptionsByProductIdentifier: {},
};

/** Took the trial once, cancelled, and came back. */
const returningCustomer = {
  originalAppUserId: '42',
  entitlements: {
    active: {},
    // `all` includes lapsed entitlements, which is the case that matters here.
    all: {
      premium: {
        productIdentifier: 'premium_monthly',
        productPlanIdentifier: 'p3m',
        expirationDate: '2024-01-01T00:00:00Z',
      },
    },
  },
  allPurchaseDates: { 'premium_monthly:p3m': '2023-10-01T00:00:00Z' },
  subscriptionsByProductIdentifier: {},
};

const eligibilityFor = (status: number) =>
  Object.fromEntries(
    PLANS.map((p) => [p.store_product_id, { status }]),
  );

beforeEach(() => {
  (Purchases.getOfferings as jest.Mock).mockResolvedValue(offeringsWithTrial('P3D'));
  (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(virginCustomer);
  (Purchases as any).checkTrialOrIntroductoryPriceEligibility = jest.fn(() =>
    Promise.resolve(eligibilityFor(INTRO_UNKNOWN)),
  );
});

describe('trial eligibility', () => {
  it('advertises the trial on UNKNOWN when nothing has ever been purchased', async () => {
    // The ordinary Android path for a brand new customer: the eligibility call
    // cannot answer, Play served an offer with a free phase, and the purchase
    // history is empty. That combination is the only "yes" Android gives.
    const pricing = await getPlanPricing(42);

    expect(pricing['premium-quarterly'].freeTrialDays).toBe(3);
  });

  it('refuses the trial on UNKNOWN when this customer has bought before', async () => {
    // Play returns the offer's phases whether or not the trial has been used,
    // so the free phase alone is not proof. A returning subscriber was shown
    // "3 days free" and then charged at once.
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(returningCustomer);

    const pricing = await getPlanPricing(42);

    expect(pricing['premium-quarterly'].freeTrialDays).toBeNull();
    // The PRICE must still come through: this is not a reason to break the
    // paywall, only a reason to stop promising a free trial.
    expect(pricing['premium-quarterly'].priceString).toBe('$1.00');
  });

  it('refuses the trial when the eligibility call throws', async () => {
    // Nothing was asked of anybody, so there is no ground to advertise on.
    (Purchases as any).checkTrialOrIntroductoryPriceEligibility = jest.fn(() =>
      Promise.reject(new Error('offline')),
    );

    const pricing = await getPlanPricing(42);

    expect(pricing['premium-quarterly'].freeTrialDays).toBeNull();
    expect(pricing['premium-quarterly'].priceString).toBe('$1.00');
  });

  it('refuses the trial when the eligibility call answers with nothing', async () => {
    // An empty map is not the same fact as a per-product UNKNOWN, and used to
    // be flattened into one.
    (Purchases as any).checkTrialOrIntroductoryPriceEligibility = jest.fn(() =>
      Promise.resolve({}),
    );

    const pricing = await getPlanPricing(42);

    expect(pricing['premium-quarterly'].freeTrialDays).toBeNull();
  });

  it('refuses the trial when the store serves no free phase at all', async () => {
    // Play only returns offers this Google account is eligible for, so a
    // missing free phase IS the store saying no - even for a customer with no
    // purchase history of their own.
    (Purchases.getOfferings as jest.Mock).mockResolvedValue(offeringsWithTrial(undefined));

    const pricing = await getPlanPricing(42);

    expect(pricing['premium-quarterly'].freeTrialDays).toBeNull();
  });

  it('refuses the trial when the store says INELIGIBLE, whatever the offer shows', async () => {
    (Purchases as any).checkTrialOrIntroductoryPriceEligibility = jest.fn(() =>
      Promise.resolve(eligibilityFor(INTRO_INELIGIBLE)),
    );

    const pricing = await getPlanPricing(42);

    expect(pricing['premium-quarterly'].freeTrialDays).toBeNull();
  });

  it('never derives a trial from introPrice alone', async () => {
    /**
     * introPrice is a property of the PRODUCT, not of the customer: it is
     * there whether or not this person has used their trial. Reading it as
     * eligibility is exactly how a returning subscriber gets promised three
     * free days. It is only ever consulted on iOS, and only once StoreKit has
     * said ELIGIBLE - which UNKNOWN is not.
     */
    (Purchases.getOfferings as jest.Mock).mockResolvedValue({
      current: {
        availablePackages: PLANS.map((p) => ({
          identifier: p.revenuecat_package_id,
          product: {
            identifier: p.store_product_id,
            priceString: '$1.00',
            price: 1,
            currencyCode: 'USD',
            defaultOption: { storeProductId: p.store_product_id },
            introPrice: {
              price: 0,
              periodNumberOfUnits: 7,
              periodUnit: 'DAY',
              cycles: 1,
            },
          },
        })),
      },
    });

    const pricing = await getPlanPricing(42);

    expect(pricing['premium-quarterly'].freeTrialDays).toBeNull();
  });
});

/**
 * What the paywall prints where a price goes, once it IS allowed to say
 * "free". The figure has to be the same money written the same way - the
 * store's own currency, symbol placement and decimals, at zero - because it
 * sits directly above the price it turns into.
 */
describe('trial price', () => {
  it('quotes the trial at zero in the plan\'s own currency', async () => {
    const pricing = await getPlanPricing(42);

    expect(pricing['premium-quarterly'].trialPriceString).toBe('$0.00');
  });

  it('never quotes a zero without a trial behind it', async () => {
    // Same refusal as everywhere else in this file: no eligibility, no free
    // days, and therefore no free price either. A zero on a card the store
    // would charge for on the spot is the whole failure this fails closed on.
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(returningCustomer);

    const pricing = await getPlanPricing(42);

    expect(pricing['premium-quarterly'].freeTrialDays).toBeNull();
    expect(pricing['premium-quarterly'].trialPriceString).toBeNull();
  });

  it('falls back to the store\'s own free phase where the digits are not ASCII', async () => {
    // Arabic-Indic numerals: there is no numeric run to swap, so the amount
    // Play formatted for that market is used as it stands rather than a zero
    // printed in the wrong script.
    (Purchases.getOfferings as jest.Mock).mockResolvedValue({
      current: {
        availablePackages: PLANS.map((p) => ({
          identifier: p.revenuecat_package_id,
          product: {
            identifier: p.store_product_id,
            priceString: '٥٫٩٩ ر.س',
            price: 5.99,
            currencyCode: 'SAR',
            defaultOption: {
              storeProductId: p.store_product_id,
              freePhase: {
                billingPeriod: { iso8601: 'P3D' },
                price: { formatted: '٠٫٠٠ ر.س', amountMicros: 0, currencyCode: 'SAR' },
              },
            },
          },
        })),
      },
    });

    const pricing = await getPlanPricing(42);

    expect(pricing['premium-quarterly'].freeTrialDays).toBe(3);
    expect(pricing['premium-quarterly'].trialPriceString).toBe('٠٫٠٠ ر.س');
  });
});
