/**
 * @format
 *
 * Resolving a store product id to a plan.
 *
 * All three plans are base plans of the single `premium_monthly` Play
 * subscription, which is what makes the free trial once per account rather
 * than once per plan: Play scopes trial eligibility to the subscription.
 *
 * The consequence worth pinning is that the parent id alone identifies
 * nothing. `premium_monthly` is not the monthly plan, it is the subscription
 * all three live under, so anything that strips the suffix would answer
 * "1 Month" for a yearly purchase and record a customer on a tenth of what
 * they paid.
 */
import { PLANS, planByProductId } from '../src/constants/plans';

describe('planByProductId', () => {
  it('resolves each base plan', () => {
    expect(planByProductId('premium_monthly:monthly')?.slug).toBe('premium-monthly');
    expect(planByProductId('premium_monthly:p3m')?.slug).toBe('premium-quarterly');
    expect(planByProductId('premium_monthly:p1y')?.slug).toBe('premium-yearly');
  });

  it('carries the right price with the right plan', () => {
    expect(planByProductId('premium_monthly:monthly')?.price).toBe(5.99);
    expect(planByProductId('premium_monthly:p3m')?.price).toBe(15.99);
    expect(planByProductId('premium_monthly:p1y')?.price).toBe(59.99);
  });

  it('refuses to guess from the parent subscription', () => {
    // The failure this exists to prevent. `premium_monthly` is the parent of
    // all three, so resolving it to any one of them is a coin flip on money.
    expect(planByProductId('premium_monthly')).toBeNull();
  });

  it('declines anything it does not recognise', () => {
    expect(planByProductId('')).toBeNull();
    expect(planByProductId('   ')).toBeNull();
    expect(planByProductId(null)).toBeNull();
    expect(planByProductId(undefined)).toBeNull();
    expect(planByProductId('premium_monthly:nope')).toBeNull();
    expect(planByProductId('something_else')).toBeNull();
  });
});

describe('the catalogue itself', () => {
  it('matches the base plans configured in Play', () => {
    // Verified against the live Play catalogue. A base plan id can never be
    // renamed once created, so these are fixed for the life of the app.
    expect(PLANS.map((p) => p.store_product_id)).toEqual([
      'premium_monthly:monthly',
      'premium_monthly:p3m',
      'premium_monthly:p1y',
    ]);
  });

  it('keeps every plan under one subscription, which is what shares the trial', () => {
    const parents = new Set(PLANS.map((p) => p.store_product_id.split(':')[0]));
    expect(parents).toEqual(new Set(['premium_monthly']));
  });

  it('gives every plan a distinct product and package', () => {
    expect(new Set(PLANS.map((p) => p.store_product_id)).size).toBe(PLANS.length);
    expect(new Set(PLANS.map((p) => p.revenuecat_package_id)).size).toBe(PLANS.length);
  });
});
