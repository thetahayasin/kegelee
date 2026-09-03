/**
 * @format
 *
 * The one rule that decides whether an account is entitled.
 *
 * It exists because the gate used to be a piece of React state that five
 * things could RAISE and one thing could LOWER, so an account whose
 * subscription had ended kept its premium features until a sync completed -
 * while the Settings screen, reading the local rows directly, already said
 * there was no subscription. The two disagreed because they were answering
 * from different places.
 *
 * What is pinned here is the layering (admin, then the server's stored
 * verdict, then the local rows, then the unverified-purchase window), that
 * every layer EXPIRES, and that each answer carries the deadline at which it
 * could change - which is what lets the caller close the gate on its own clock
 * instead of waiting for an event that may never come.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../src/db/queries', () => ({
  getActiveSubscription: jest.fn(async () => null),
  subscriptionEntitlementEndsAt: jest.fn(() => null),
}));

import {
  getActiveSubscription,
  subscriptionEntitlementEndsAt,
} from '../src/db/queries';
import {
  UNVERIFIED_GRACE_MS,
  VERDICT_TTL_MS,
  forgetEntitlementState,
  forgetServerVerdict,
  markPurchaseRecorded,
  rememberServerVerdict,
  resolveEntitlement,
} from '../src/services/entitlement';

const USER = 7;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const mockedActive = getActiveSubscription as jest.Mock;
const mockedEndsAt = subscriptionEntitlementEndsAt as jest.Mock;

const row = (over: Record<string, any> = {}) => ({
  id: 1,
  user_id: USER,
  plan_id: 1,
  plan_slug: 'monthly',
  status: 'active',
  auto_renewing: 1,
  ends_at: new Date(Date.now() + 20 * DAY).toISOString(),
  ...over,
});

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockedActive.mockResolvedValue(null);
  mockedEndsAt.mockReturnValue(null);
});

describe('the admin bypass', () => {
  it('lets an admin in without reading anything', async () => {
    const entitlement = await resolveEntitlement(USER, true);

    expect(entitlement.active).toBe(true);
    expect(entitlement.source).toBe('admin');
    // No deadline: nothing about an admin expires, so nothing should arm a
    // timer for one.
    expect(entitlement.expiresAt).toBeNull();
    expect(mockedActive).not.toHaveBeenCalled();
  });
});

describe('the server verdict', () => {
  it("closes the gate on a stale local row the backend has already expired", async () => {
    // The exact shape the mirror gets wrong: the subscriptions section of a
    // pull is applied inside a try/catch, so a device can hold a row the
    // server has retired and go on granting access off it forever - through
    // restarts, because the bootstrap reads the same copy.
    mockedActive.mockResolvedValue(row());
    mockedEndsAt.mockReturnValue(Date.now() + 20 * DAY);
    await rememberServerVerdict(USER, false);

    const entitlement = await resolveEntitlement(USER, false);

    expect(entitlement.active).toBe(false);
    expect(entitlement.source).toBe('server');
  });

  it('opens the gate when the rows have not landed yet', async () => {
    // The other direction, and just as real: a pull whose subscriptions
    // section failed leaves the backend saying yes and this device holding
    // nothing. Absence of a row is not evidence against it.
    await rememberServerVerdict(USER, true);

    const entitlement = await resolveEntitlement(USER, false);

    expect(entitlement.active).toBe(true);
    expect(entitlement.source).toBe('server');
  });

  it('stops counting once it goes stale, in both directions', async () => {
    const stale = Date.now() - VERDICT_TTL_MS - HOUR;

    // A `false` recorded during a backend incident must not lock a paying
    // customer out for good.
    await AsyncStorage.setItem(
      `@entitlement_verdict_${USER}`,
      JSON.stringify({ subscribed: false, at: stale }),
    );
    mockedActive.mockResolvedValue(row());
    mockedEndsAt.mockReturnValue(Date.now() + 20 * DAY);
    expect((await resolveEntitlement(USER, false)).source).toBe('subscription');

    // And a `true` recorded on the day somebody cancelled must not keep the
    // app unlocked for as long as it sits unused.
    await AsyncStorage.setItem(
      `@entitlement_verdict_${USER}`,
      JSON.stringify({ subscribed: true, at: stale }),
    );
    mockedActive.mockResolvedValue(null);
    expect((await resolveEntitlement(USER, false)).active).toBe(false);
  });

  it('treats silence from an older backend as silence, not a no', async () => {
    await rememberServerVerdict(USER, true);
    // The field is absent; the last real answer must survive it.
    await rememberServerVerdict(USER, undefined);

    expect((await resolveEntitlement(USER, false)).active).toBe(true);
  });

  it('is forgotten on demand, so a purchase is not outranked by it', async () => {
    // A `false` recorded moments before somebody paid would otherwise sit on
    // top of the row they have just bought until the next sync corrected it.
    await rememberServerVerdict(USER, false);
    await forgetServerVerdict(USER);
    mockedActive.mockResolvedValue(row());

    expect((await resolveEntitlement(USER, false)).active).toBe(true);
  });

  it('cannot be made immortal by a clock set into the future', async () => {
    await AsyncStorage.setItem(
      `@entitlement_verdict_${USER}`,
      JSON.stringify({ subscribed: true, at: Date.now() + 365 * DAY }),
    );

    const entitlement = await resolveEntitlement(USER, false);

    // Still honoured - it is the only answer we have - but re-stamped to now,
    // so it runs out one TTL from here rather than a year after that.
    expect(entitlement.active).toBe(true);
    expect(entitlement.expiresAt).toBeLessThanOrEqual(Date.now() + VERDICT_TTL_MS + 1000);
  });
});

describe('the local rows', () => {
  it('reports the row and the moment it stops entitling', async () => {
    const deadline = Date.now() + 3 * DAY;
    mockedActive.mockResolvedValue(row());
    mockedEndsAt.mockReturnValue(deadline);

    const entitlement = await resolveEntitlement(USER, false);

    expect(entitlement.active).toBe(true);
    expect(entitlement.source).toBe('subscription');
    expect(entitlement.expiresAt).toBe(deadline);
    expect(entitlement.subscription).not.toBeNull();
  });

  it('wakes at whichever runs out first, the period or the verdict', async () => {
    // The caller arms one timer off this. Reporting the later of the two would
    // leave the gate open past the moment the answer actually changes.
    const verdictAt = Date.now();
    await rememberServerVerdict(USER, true);
    mockedActive.mockResolvedValue(row());
    mockedEndsAt.mockReturnValue(verdictAt + DAY);

    const entitlement = await resolveEntitlement(USER, false);

    expect(entitlement.expiresAt).toBeLessThanOrEqual(verdictAt + DAY);
  });
});

describe('a purchase the server has not confirmed', () => {
  const stampGrantAt = (at: number) =>
    AsyncStorage.setItem(`@purchase_recorded_at_${USER}`, String(at));

  it('grants access for the grace window and then stops', async () => {
    await markPurchaseRecorded(USER);

    const entitlement = await resolveEntitlement(USER, false);

    expect(entitlement.active).toBe(true);
    expect(entitlement.source).toBe('unverified');
    expect(entitlement.expiresAt).toBeGreaterThan(Date.now());

    // Past the window, with the backend still never having acknowledged it.
    await stampGrantAt(Date.now() - UNVERIFIED_GRACE_MS - HOUR);
    expect((await resolveEntitlement(USER, false)).active).toBe(false);
  });

  it('does not become an open-ended grant on a clock set into the future', async () => {
    // `now - grantedAt` goes negative, which is also "inside the window" no
    // matter how old the grant is. Clamping caps it at one window.
    await stampGrantAt(Date.now() + 365 * DAY);

    const entitlement = await resolveEntitlement(USER, false);

    expect(entitlement.active).toBe(true);
    expect(entitlement.expiresAt).toBeLessThanOrEqual(Date.now() + UNVERIFIED_GRACE_MS + 1000);
  });
});

describe('nothing at all', () => {
  it('is not entitled, and has no deadline to wait for', async () => {
    const entitlement = await resolveEntitlement(USER, false);

    expect(entitlement.active).toBe(false);
    expect(entitlement.source).toBe('none');
    expect(entitlement.expiresAt).toBeNull();
  });

  it('survives a database that will not answer', async () => {
    mockedActive.mockRejectedValue(new Error('db closed'));

    await expect(resolveEntitlement(USER, false)).resolves.toMatchObject({
      active: false,
    });
  });
});

describe('signing out', () => {
  it('takes both the verdict and the purchase window with it', async () => {
    // On a shared device the next person signs in against the same resolver,
    // and it cannot tell a re-used id from a returning customer.
    await rememberServerVerdict(USER, true);
    await markPurchaseRecorded(USER);

    await forgetEntitlementState(USER);

    expect((await resolveEntitlement(USER, false)).active).toBe(false);
  });
});

describe('one verdict per account', () => {
  it('does not let one person s answer decide another s access', async () => {
    await rememberServerVerdict(USER, true);

    expect((await resolveEntitlement(USER, false)).active).toBe(true);
    expect((await resolveEntitlement(USER + 1, false)).active).toBe(false);
  });
});
