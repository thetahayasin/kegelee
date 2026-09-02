/**
 * The one place a crash reporter gets wired in.
 *
 * There is no Sentry (or Crashlytics, or Bugsnag) in this app yet, and adding
 * one is a decision with a dependency, a DSN, a privacy notice and a Play data
 * disclosure attached to it. What this file buys today is that when that
 * decision is made, it is one function body rather than a hunt through every
 * catch block in the codebase - and, more usefully right now, that the places
 * which swallow an error are marked as such instead of ending in a bare `{}`.
 *
 * Deliberately silent in production. Console output in a release build is
 * stripped by babel-plugin-transform-remove-console anyway, and an error
 * reporter that can itself throw would defeat the point: every caller is
 * already on a failure path.
 */

/** Where the failure happened - a short, stable, greppable label. */
export type ErrorContext = string;

export const reportError = (error: unknown, context: ErrorContext): void => {
  if (__DEV__) {
    console.error(`[${context}]`, error);
  }
  // When a crash reporter is added, this is the only line that changes:
  //   Sentry.captureException(error, { tags: { context } });
};
