/**
 * @format
 *
 * The app's own asks to subscribe stay rare: the welcome offer once per
 * account, the post-session offer once per day. A regression here is the
 * difference between a well-timed offer and a paywall twice a day forever.
 */
import {
  claimSessionOffer,
  claimWelcomeOffer,
  forgetUpsellState,
} from '../src/services/upsell';

describe('upsell offers', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('gives the welcome offer once per account, ever', async () => {
    expect(await claimWelcomeOffer(1)).toBe(true);
    expect(await claimWelcomeOffer(1)).toBe(false);
    expect(await claimWelcomeOffer(1)).toBe(false);
    // Another account on the same device still gets its own.
    expect(await claimWelcomeOffer(2)).toBe(true);
  });

  it('gives the post-session offer at most once a day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T09:00:00'));
    expect(await claimSessionOffer(7)).toBe(true);
    expect(await claimSessionOffer(7)).toBe(false);

    jest.setSystemTime(new Date('2026-10-23T20:00:00'));
    expect(await claimSessionOffer(7)).toBe(false);

    jest.setSystemTime(new Date('2026-10-24T09:00:00'));
    expect(await claimSessionOffer(7)).toBe(true);
  });

  it('starts fresh after sign-out', async () => {
    expect(await claimWelcomeOffer(9)).toBe(true);
    await forgetUpsellState(9);
    expect(await claimWelcomeOffer(9)).toBe(true);
  });
});
