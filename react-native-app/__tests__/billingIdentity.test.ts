/**
 * @format
 *
 * Who the RevenueCat SDK thinks it is talking to.
 *
 * Purchases.configure() is a once-per-process call and logIn() is how identity
 * moves afterwards. Getting the two mixed up does not fail loudly - it fails by
 * attaching a purchase to the wrong customer, which nobody notices until
 * somebody pays and does not get access, or gets somebody else's.
 *
 * Every test here reloads billing.ts through jest.isolateModules, because the
 * "configured" flag is module state and the whole point of these tests is what
 * happens across a process's worth of calls. The react-native-purchases mock is
 * re-required inside the same isolated registry, or the assertions would be
 * looking at a different instance from the one billing.ts is calling.
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

import { getAppSetting } from '../src/db/queries';

type Billing = typeof import('../src/services/billing');

/** A billing module and the exact Purchases mock instance it will call. */
const freshBilling = (): { billing: Billing; Purchases: any } => {
  let billing!: Billing;
  let purchases: any;
  jest.isolateModules(() => {
    billing = require('../src/services/billing');
    purchases = require('react-native-purchases').default;
  });
  return { billing, Purchases: purchases };
};

beforeEach(() => {
  (getAppSetting as jest.Mock).mockImplementation(() => Promise.resolve('goog_testkey'));
});

describe('initBilling identity', () => {
  it('configures once, then moves identity with logIn', async () => {
    const { billing, Purchases } = freshBilling();

    expect(await billing.initBilling(1)).toBe(true);
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
    expect(Purchases.logIn).not.toHaveBeenCalled();

    // A second person on the same device. configure() must NOT run again:
    // the SDK is already up, and the only thing that changes is who it is for.
    expect(await billing.initBilling(2)).toBe(true);
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
    expect(Purchases.logIn).toHaveBeenCalledWith('2');
  });

  it('does nothing at all when the identity is already the one asked for', async () => {
    const { billing, Purchases } = freshBilling();

    await billing.initBilling(7);
    await billing.initBilling(7);
    await billing.initBilling(7);

    expect(Purchases.configure).toHaveBeenCalledTimes(1);
    expect(Purchases.logIn).not.toHaveBeenCalled();
  });

  it('never forces an identity change for an anonymous caller', async () => {
    // getPlanPricing and the paywall's price lookup call initBilling() with no
    // id. Treating that as "become anonymous" would log the signed-in customer
    // out of the SDK in the middle of the screen where they are about to buy.
    const { billing, Purchases } = freshBilling();

    await billing.initBilling(3);
    expect(await billing.initBilling(null)).toBe(true);

    expect(Purchases.logOut).not.toHaveBeenCalled();
    expect(Purchases.logIn).not.toHaveBeenCalled();
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
  });

  it('logs in explicitly when the SDK was already configured by someone else', async () => {
    // Our own flag is a claim about the whole process, and a module reload
    // invalidates it. configure() on an already-configured SDK would not apply
    // the appUserID, leaving the purchase attached to whoever it held.
    const { billing, Purchases } = freshBilling();
    Purchases.isConfigured = jest.fn(() => Promise.resolve(true));

    expect(await billing.initBilling(11)).toBe(true);

    expect(Purchases.configure).not.toHaveBeenCalled();
    expect(Purchases.logIn).toHaveBeenCalledWith('11');
  });
});

describe('logoutBilling', () => {
  it('returns the SDK to anonymous but leaves it configured', async () => {
    const { billing, Purchases } = freshBilling();

    await billing.initBilling(1);
    await billing.logoutBilling();
    expect(Purchases.logOut).toHaveBeenCalledTimes(1);

    // The next person signs IN. If logout had also cleared "configured", this
    // would go back through configure() on an already-configured SDK, which
    // does not change the identity - and the next purchase would land on the
    // anonymous customer the logout left behind.
    expect(await billing.initBilling(2)).toBe(true);
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
    expect(Purchases.logIn).toHaveBeenCalledWith('2');
  });

  it('does not call logOut when there was no identity to drop', async () => {
    const { billing, Purchases } = freshBilling();

    await billing.logoutBilling();

    expect(Purchases.logOut).not.toHaveBeenCalled();
  });
});

describe('concurrent initBilling calls', () => {
  it('configures once for a burst of callers', async () => {
    // Mount effects, the price lookup and the backoff poll all call this in
    // the same tick. Two configure() calls racing is how the SDK ends up
    // holding an identity nobody asked for.
    const { billing, Purchases } = freshBilling();

    const results = await Promise.all([
      billing.initBilling(5),
      billing.initBilling(5),
      billing.initBilling(5),
      billing.initBilling(null),
    ]);

    expect(results).toEqual([true, true, true, true]);
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
  });

  it('retries after a failure instead of answering false forever', async () => {
    /**
     * A configure that lost a race with the network - the very first thing the
     * paywall does on open - used to be memoized as `false` for the rest of
     * the process. Every later getPlanPricing() short-circuited and the paywall
     * said billing was unavailable on a perfectly good phone until the app was
     * force-killed.
     */
    const { billing, Purchases } = freshBilling();
    (getAppSetting as jest.Mock).mockImplementationOnce(() => Promise.resolve(''));

    expect(await billing.initBilling(1)).toBe(false);
    expect(Purchases.configure).not.toHaveBeenCalled();

    expect(await billing.initBilling(1)).toBe(true);
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
  });

  it('does not let a failing attempt erase a later successful one', async () => {
    /**
     * The two attempts overlap: the first is still waiting on the key lookup
     * when the second starts. Clearing the memo unconditionally on failure
     * meant the slow loser wiped the winner's answer on its way out, sending
     * the next caller back through configure on an SDK that was already fine.
     */
    const { billing, Purchases } = freshBilling();
    (getAppSetting as jest.Mock).mockImplementationOnce(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('slow')), 20)),
    );

    const first = billing.initBilling(1);
    const second = billing.initBilling(2);

    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
    // Still answered from the identity the successful attempt established.
    expect(await billing.initBilling(2)).toBe(true);
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
  });
});
