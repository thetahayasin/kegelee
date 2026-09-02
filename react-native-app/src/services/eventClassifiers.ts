/**
 * The rules that turn a moment in the app into one short `detail` word.
 *
 * Separate from the screens that call them, and pure, for one reason: these
 * are the values every report GROUPs BY. A bucket that quietly changes meaning
 * - a quarter counted from the wrong total, a failure code that lands under
 * "store problem" one release and under its raw number the next - does not
 * look like a bug in a chart, it looks like a change in user behaviour. So
 * they are written where they can be tested rather than inline in a handler
 * that needs a store, a navigator and a signed-in user to reach.
 */

/** How far into the playlist somebody got before they quit. */
export type AbandonQuarter = 'p00' | 'p25' | 'p50' | 'p75';

/**
 * Which quarter of a session was reached, by step.
 *
 * Reported as a bucket rather than as a percentage because the question is
 * "where do sessions get quit", and four labelled buckets answer it in a bar
 * chart that a percentage column never would. `p75` is anyone past three
 * quarters: a session that actually finished is workout_completed, so there is
 * no p100 to reach.
 *
 * Deliberately floors: someone on the last step of eight has done seven of
 * them, which is the last quarter, not the end.
 */
export const abandonQuarter = (
  stepIndex: number,
  totalSteps: number,
): AbandonQuarter => {
  // A playlist of nothing, or a nonsense index, is "they never started".
  if (!Number.isFinite(stepIndex) || !Number.isFinite(totalSteps) || totalSteps <= 0) {
    return 'p00';
  }
  const done = Math.max(0, Math.min(stepIndex, totalSteps));
  const ratio = done / totalSteps;
  if (ratio >= 0.75) return 'p75';
  if (ratio >= 0.5) return 'p50';
  if (ratio >= 0.25) return 'p25';
  return 'p00';
};

/**
 * The shape of billing.ts's PurchaseFailure that this needs.
 *
 * Structural rather than the imported type so the classifier can be tested
 * without pulling the RevenueCat SDK into the suite - and so a store failure
 * can be described in a test by what it MEANS rather than by which numeric
 * code happens to produce that meaning today.
 */
export interface FailureFacts {
  code: string | null;
  cancelled: boolean;
  pending: boolean;
  restorable: boolean;
  messageKey: string;
}

/**
 * One word for why a purchase did not complete.
 *
 * Keyed off the classification billing.ts already made, not off the raw code,
 * because that mapping lives in exactly one place and this must not become a
 * second copy of it that drifts. The named buckets are the ones a report acts
 * on: "cancelled" is not a problem at all, "pending" resolves itself, "already
 * owned" means restore, "network" and "store error" are the two that should be
 * watched. Anything else keeps its raw code, so a failure mode nobody has seen
 * yet shows up as itself instead of disappearing into "other".
 */
export const purchaseFailureDetail = (failure: FailureFacts): string => {
  if (failure.cancelled) return 'cancelled';
  if (failure.pending) return 'pending';
  if (failure.restorable) return 'already_owned';
  if (failure.messageKey === 'billing.network') return 'network';
  if (failure.messageKey === 'billing.storeProblem') return 'store_error';
  return failure.code || 'unknown';
};

/** A purchase against what the account already had. */
export type SwitchDirection = 'new' | 'upgrade' | 'downgrade';

/**
 * Whether this purchase is a first one, a step up or a step down.
 *
 * Ranked by BILLING PERIOD, which is the same input replacementModeFor uses to
 * pick what Play is actually asked to do. Ranking by price here instead would
 * eventually report an "upgrade" for a change Play processed as a downgrade,
 * and the money reports would then disagree with the customer's bank
 * statement.
 *
 * An unknown length counts as a downgrade for the same reason billing.ts
 * refuses to charge on one: "upgrade" is the branch where money moves today,
 * so it is the branch that has to be certain.
 */
export const planSwitchDirection = (
  nextMonths: number | null,
  currentMonths: number | null,
): SwitchDirection => {
  if (currentMonths === null) return 'new';
  if (nextMonths === null) return 'downgrade';
  return nextMonths > currentMonths ? 'upgrade' : 'downgrade';
};
