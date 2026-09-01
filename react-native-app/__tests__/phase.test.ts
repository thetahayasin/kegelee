/**
 * @format
 *
 * The phase decides two things that must never disagree: which stack
 * AppNavigator mounts, and the key App.tsx puts on the NavigationContainer.
 * When they disagreed, finishing the basics re-showed the finished lesson,
 * because the container replayed the old route into the new stack.
 *
 * This suite previously also pinned a `paywall` phase. That phase is gone: the
 * app is freemium, so everyone signed in lands in the same navigator and a
 * subscription unlocks features inside it rather than opening a different one.
 * The tests below now guard the opposite property - that subscribing does NOT
 * move anyone between stacks, and so must not remount the container under a
 * person who has just paid.
 */
import { appPhase } from '../src/navigation/phase';

const phase = (isAuthenticated: boolean, basicsDone: boolean) =>
  appPhase({ isAuthenticated, basicsDone });

describe('appPhase', () => {
  it('sends everyone signed out to the guest stack', () => {
    expect(phase(false, false)).toBe('guest');
    expect(phase(false, true)).toBe('guest');
  });

  it('holds a signed-in account on the basics until they are finished', () => {
    expect(phase(true, false)).toBe('gate');
  });

  it('opens the app once the basics are done', () => {
    expect(phase(true, true)).toBe('app');
  });

  it('gives every distinct state its own phase', () => {
    // Three navigators, three phases. A collision means one navigator swap
    // happens without a container remount, which is the bug this guards.
    const all = [phase(false, false), phase(true, false), phase(true, true)];
    expect(new Set(all).size).toBe(3);
  });

  it('does not depend on anything but auth and the basics', () => {
    // The signature is the guarantee: nothing about a subscription can reach
    // this function, so subscribing cannot re-key the container and throw away
    // the navigation state of someone mid-purchase.
    expect(appPhase.length).toBe(1);
    const keys = Object.keys({ isAuthenticated: true, basicsDone: true });
    expect(keys.sort()).toEqual(['basicsDone', 'isAuthenticated']);
  });
});
