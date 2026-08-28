/**
 * @format
 *
 * The phase decides two things that must never disagree: which stack
 * AppNavigator mounts, and the key App.tsx puts on the NavigationContainer.
 * When they disagreed, buying a subscription left the customer looking at the
 * paywall until they force-quit the app - the container replayed the Paywall
 * route into the new stack, where a Paywall route also happens to exist.
 *
 * Both now call appPhase, so the only way back to that bug is changing this
 * function's answers. Every one of the eight input combinations is pinned.
 */
import { appPhase } from '../src/navigation/phase';

const phase = (isAuthenticated: boolean, subscribed: boolean, basicsDone: boolean) =>
  appPhase({ isAuthenticated, subscribed, basicsDone });

describe('appPhase', () => {
  it('sends everyone signed out to the guest stack, whatever else is true', () => {
    expect(phase(false, false, false)).toBe('guest');
    expect(phase(false, false, true)).toBe('guest');
    expect(phase(false, true, false)).toBe('guest');
    expect(phase(false, true, true)).toBe('guest');
  });

  it('gates on the subscription BEFORE the basics', () => {
    // Both gates shut: the paywall wins, matching the web middleware order
    // ['subscribed', 'basics'] and AppNavigator's own branch order.
    expect(phase(true, false, false)).toBe('paywall');
    // Basics already done but unsubscribed is still the paywall.
    expect(phase(true, false, true)).toBe('paywall');
  });

  it('holds a subscriber on the basics until they are finished', () => {
    expect(phase(true, true, false)).toBe('gate');
  });

  it('opens the app only when authenticated, subscribed and past the basics', () => {
    expect(phase(true, true, true)).toBe('app');
  });

  it('changes phase the moment a subscription is bought', () => {
    // This is the transition that was broken. Before: 'paywall'. After: a
    // DIFFERENT phase, which is what forces the container to remount and drop
    // the stale Paywall route.
    const before = phase(true, false, true);
    const after = phase(true, true, true);
    expect(before).toBe('paywall');
    expect(after).not.toBe(before);
  });

  it('changes phase for a subscriber who has not done the basics either', () => {
    const before = phase(true, false, false);
    const after = phase(true, true, false);
    expect(before).toBe('paywall');
    expect(after).not.toBe(before);
  });

  it('gives every distinct gate combination its own phase', () => {
    // Four navigators, four phases. A collision here means one navigator swap
    // happens without a container remount, which is precisely the bug.
    const authed = [
      phase(true, false, false),
      phase(true, false, true),
      phase(true, true, false),
      phase(true, true, true),
    ];
    // The two unsubscribed rows share 'paywall' by design - AppNavigator
    // mounts the same stack for both - so three distinct phases is correct.
    expect(new Set(authed).size).toBe(3);
    expect(new Set([...authed, phase(false, false, false)]).size).toBe(4);
  });
});
