/**
 * Which phase of the app a person is in.
 *
 * Two places need this answer and they MUST agree: AppNavigator picks which
 * stack to mount, and App.tsx keys the NavigationContainer so each phase
 * starts from a clean navigation tree at its own initialRouteName. Navigation
 * STATE lives in the container, so a stack swap without a key change hands the
 * old routes to the new navigator - which is how finishing the basics once
 * re-showed the finished lesson.
 *
 * `subscribed` is deliberately NOT a phase any more.
 *
 * It used to be, because the paywall was a gate: an unsubscribed account got a
 * navigator containing nothing but the paywall, so subscribing swapped the
 * whole stack and the container had to be rebuilt with it. The app is freemium
 * now - everyone who is signed in lands in the same app, and a subscription
 * unlocks features inside it rather than opening a door to a different one.
 * Nothing about the navigator changes when someone subscribes, so nothing
 * should be remounted when they do. Keying on it would throw away the
 * navigation state of a person who just paid, mid-flow, for no reason.
 */
export type AppPhase = 'guest' | 'gate' | 'app';

export interface PhaseInput {
  isAuthenticated: boolean;
  /** "Learn the basics" gate - the only gate left. */
  basicsDone: boolean;
}

export const appPhase = ({ isAuthenticated, basicsDone }: PhaseInput): AppPhase => {
  if (!isAuthenticated) return 'guest';
  if (!basicsDone) return 'gate';
  return 'app';
};
