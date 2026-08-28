/**
 * Which phase of the app a person is in.
 *
 * Two places need this answer and they MUST agree: AppNavigator picks which
 * stack to mount, and App.tsx keys the NavigationContainer so each phase
 * starts from a clean navigation tree at its own initialRouteName.
 *
 * They did not agree, and it cost real money. AppNavigator gated on the
 * subscription; the container key did not mention it. So a completed purchase
 * swapped `paywall-gate` for `main-app` while the container held onto its
 * state - `{ routes: [{ name: 'Paywall' }] }` - and handed it straight back to
 * the incoming navigator. `Paywall` exists in the main stack too, because
 * subscribers reach it from Settings as "Manage Plan", so the route resolved
 * perfectly and the customer sat looking at the paywall they had just paid
 * from. The gate itself was fine the whole time. Only force-quitting cleared
 * it, because only that rebuilt the container from nothing.
 *
 * One function, imported by both, so the orderings cannot drift apart again.
 * Adding a gate means adding a phase here and a branch there, and the compiler
 * will not let the second one be forgotten.
 */
export type AppPhase = 'guest' | 'paywall' | 'gate' | 'app';

export interface PhaseInput {
  isAuthenticated: boolean;
  /** Subscription gate. Checked BEFORE basics, matching the web middleware. */
  subscribed: boolean;
  /** "Learn the basics" gate. */
  basicsDone: boolean;
}

export const appPhase = ({
  isAuthenticated,
  subscribed,
  basicsDone,
}: PhaseInput): AppPhase => {
  if (!isAuthenticated) return 'guest';
  if (!subscribed) return 'paywall';
  if (!basicsDone) return 'gate';
  return 'app';
};
