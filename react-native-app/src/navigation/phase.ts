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

/**
 * Where a GUEST's stack starts.
 *
 * A guest who has not seen the slides gets the slides. A guest who HAS gets
 * Learn the basics, which is the whole of what the freemium app offers before
 * there is an account: the lessons are what a guest is given, and creating an
 * account is the way on from them.
 *
 * It used to answer 'Login', which is not a smaller version of that funnel but
 * the opposite of it - the app asked a returning guest to sign in before
 * showing them anything, on every launch, and the onboarding quiz sits behind
 * the slides so it was never offered again either. An account created down
 * that route reaches the server with no onboarding_level at all, which is its
 * own bug (see User::freeLevelId on the backend).
 *
 * Login and Register still exist in the same stack and sit ON TOP of Knowledge,
 * so "Log in" from the slides or the lessons pushes onto it and closes back
 * down to it. Only the ROOT changes here.
 *
 * Pure and separate from the navigator for one reason: the navigator said one
 * thing in its comment and did another in its code, and nothing could catch
 * that. This can be asserted.
 */
export type GuestRoute = 'Onboarding' | 'Knowledge';

export const guestInitialRoute = (onboarded: boolean): GuestRoute =>
  onboarded ? 'Knowledge' : 'Onboarding';
