/**
 * @format
 *
 * Whether a tap on a plan card is a product CHANGE or a fresh purchase.
 *
 * The case this exists for is the cancelled-but-still-running subscription.
 * It reads like "no subscription" - auto-renew off, status 'canceled' - and
 * the screen treated it that way, sending a plain purchase. But the purchase
 * is still live in Play until the paid period ends, so buying plainly is
 * buying a subscription the Google account already owns, and Play declines it
 * with "we were unable to change your plan". The guard that existed to avoid
 * that error was producing it.
 */
import { planSwitchFor, subscriptionStillGrantsAccess } from '../src/services/planSwitch';

const NOW = Date.parse('2026-06-01T00:00:00Z');
const FUTURE = '2026-09-01T00:00:00Z';
const PAST = '2026-01-01T00:00:00Z';

const row = (over: Partial<Parameters<typeof planSwitchFor>[0] & object> = {}) => ({
  plan_slug: 'premium-quarterly',
  status: 'active',
  ends_at: FUTURE,
  auto_renewing: 1,
  ...over,
});

describe('planSwitchFor', () => {
  it('is a switch for an ordinary renewing subscriber choosing another plan', () => {
    const s = planSwitchFor(row(), 'premium-yearly', NOW);

    expect(s.switching).toBe(true);
    expect(s.renewing).toBe(true);
    expect(s.fromSlug).toBe('premium-quarterly');
    expect(s.endsAt).toBe(FUTURE);
  });

  it('is STILL a switch when the subscription is cancelled but not finished', () => {
    // The regression. Play has a live purchase for this account either way, so
    // this must go through the product-change flow, not a plain purchase.
    const s = planSwitchFor(
      row({ status: 'canceled', auto_renewing: 0 }),
      'premium-yearly',
      NOW,
    );

    expect(s.switching).toBe(true);
    // ...but the COPY is different: there is no renewal to move the change to.
    expect(s.renewing).toBe(false);
  });

  it('is a switch for a row that says active with auto-renew already off', () => {
    // Cancellation reaches the row by two different routes (a status from the
    // backend, an auto_renewing flag from the store) and they do not always
    // arrive together. Neither may decide whether a change is attempted.
    const s = planSwitchFor(row({ auto_renewing: 0 }), 'premium-monthly', NOW);

    expect(s.switching).toBe(true);
    expect(s.renewing).toBe(false);
  });

  it('is not a switch when the same plan is chosen', () => {
    // Play rejects replacing a product with itself outright rather than
    // treating it as a resubscribe.
    expect(planSwitchFor(row(), 'premium-quarterly', NOW).switching).toBe(false);
  });

  it('is not a switch when there is no subscription at all', () => {
    const s = planSwitchFor(null, 'premium-yearly', NOW);

    expect(s.switching).toBe(false);
    expect(s.renewing).toBe(false);
    expect(s.fromSlug).toBeNull();
    expect(s.endsAt).toBeNull();
  });

  it('is not a switch once the paid period has actually run out', () => {
    // Now there is nothing for Play to replace, and a product change naming a
    // finished purchase is declined. This is the genuine resubscribe path.
    const s = planSwitchFor(
      row({ status: 'canceled', auto_renewing: 0, ends_at: PAST }),
      'premium-yearly',
      NOW,
    );

    expect(s.switching).toBe(false);
    expect(s.fromSlug).toBeNull();
  });

  it('is not a switch when the row names no plan', () => {
    // A row written before the plan slug was known cannot say what is being
    // switched away from, and Play needs that to be a real product.
    expect(planSwitchFor(row({ plan_slug: null }), 'premium-yearly', NOW).switching)
      .toBe(false);
  });

  it('needs a plan to switch TO', () => {
    expect(planSwitchFor(row(), null, NOW).switching).toBe(false);
  });
});

describe('subscriptionStillGrantsAccess', () => {
  it('keeps a cancelled subscription until its paid period ends', () => {
    expect(subscriptionStillGrantsAccess(row({ status: 'canceled' }), NOW)).toBe(true);
    expect(
      subscriptionStillGrantsAccess(row({ status: 'canceled', ends_at: PAST }), NOW),
    ).toBe(false);
  });

  it('treats a null expiry as open-ended, not as expired', () => {
    // Matches getActiveSubscription. Reading a missing date as "finished"
    // would shut the gate on a product that simply has no expiry.
    expect(subscriptionStillGrantsAccess(row({ ends_at: null }), NOW)).toBe(true);
  });

  it('refuses a row the backend has marked finished', () => {
    expect(subscriptionStillGrantsAccess(row({ status: 'expired' }), NOW)).toBe(false);
    expect(subscriptionStillGrantsAccess(row({ status: 'refunded' }), NOW)).toBe(false);
  });

  it('refuses nothing at all', () => {
    expect(subscriptionStillGrantsAccess(null, NOW)).toBe(false);
    expect(subscriptionStillGrantsAccess(undefined, NOW)).toBe(false);
  });
});
