/**
 * @format
 *
 * The three rules that decide what a report GROUPs BY.
 *
 * Pure functions, so these are exhaustive rather than representative: a bucket
 * that quietly changes meaning does not surface as a bug, it surfaces as a
 * change in user behaviour that nobody can explain.
 */

import {
  abandonQuarter,
  planSwitchDirection,
  purchaseFailureDetail,
} from '../src/services/eventClassifiers';

describe('where a session was quit', () => {
  it('buckets by how much of the playlist was done', () => {
    expect(abandonQuarter(0, 8)).toBe('p00');
    expect(abandonQuarter(1, 8)).toBe('p00');
    expect(abandonQuarter(2, 8)).toBe('p25');
    expect(abandonQuarter(4, 8)).toBe('p50');
    expect(abandonQuarter(6, 8)).toBe('p75');
  });

  it('puts the last step in the last quarter, not past it', () => {
    // Seven of eight done is still the final quarter. Anyone who reached the
    // end is a completion, and never reaches this function at all.
    expect(abandonQuarter(7, 8)).toBe('p75');
  });

  it('reads a boundary as having reached it', () => {
    expect(abandonQuarter(1, 4)).toBe('p25');
    expect(abandonQuarter(2, 4)).toBe('p50');
    expect(abandonQuarter(3, 4)).toBe('p75');
  });

  it('calls a session with nothing in it "never started"', () => {
    expect(abandonQuarter(0, 0)).toBe('p00');
    expect(abandonQuarter(3, 0)).toBe('p00');
    expect(abandonQuarter(NaN, 8)).toBe('p00');
  });

  it('clamps an index past the end instead of inventing a bucket', () => {
    expect(abandonQuarter(99, 8)).toBe('p75');
    expect(abandonQuarter(-3, 8)).toBe('p00');
  });
});

describe('why a purchase did not complete', () => {
  const failure = (over: Partial<Parameters<typeof purchaseFailureDetail>[0]>) => ({
    code: null,
    cancelled: false,
    pending: false,
    restorable: false,
    messageKey: 'billing.unknown',
    ...over,
  });

  it('names the outcomes that are not really failures', () => {
    expect(purchaseFailureDetail(failure({ cancelled: true, code: '1' }))).toBe('cancelled');
    expect(purchaseFailureDetail(failure({ pending: true, code: '20' }))).toBe('pending');
    expect(purchaseFailureDetail(failure({ restorable: true, code: '6' }))).toBe(
      'already_owned',
    );
  });

  it('separates the network from the store', () => {
    expect(purchaseFailureDetail(failure({ messageKey: 'billing.network', code: '10' }))).toBe(
      'network',
    );
    expect(
      purchaseFailureDetail(failure({ messageKey: 'billing.storeProblem', code: '2' })),
    ).toBe('store_error');
  });

  it('keeps the raw code for anything it has no bucket for', () => {
    // The point of the fallthrough: a failure mode nobody has seen yet shows
    // up as itself rather than disappearing into "other".
    expect(purchaseFailureDetail(failure({ code: '23' }))).toBe('23');
    expect(purchaseFailureDetail(failure({ messageKey: 'billing.configuration', code: '24' }))).toBe(
      '24',
    );
  });

  it('says "unknown" only when the store gave no code at all', () => {
    expect(purchaseFailureDetail(failure({}))).toBe('unknown');
  });

  it('reads cancelled before anything else', () => {
    // A cancellation carrying a code that also matches another branch is still
    // a cancellation - it is the reader's own decision, not a fault.
    expect(
      purchaseFailureDetail(
        failure({ cancelled: true, restorable: true, messageKey: 'billing.network' }),
      ),
    ).toBe('cancelled');
  });
});

describe('which way a plan changed', () => {
  it('calls a purchase with nothing before it new', () => {
    expect(planSwitchDirection(12, null)).toBe('new');
    expect(planSwitchDirection(null, null)).toBe('new');
  });

  it('ranks by billing period, not by price', () => {
    // Monthly -> yearly is the upgrade even though the yearly plan is the
    // cheapest per month. See the comment on replacementModeFor.
    expect(planSwitchDirection(12, 1)).toBe('upgrade');
    expect(planSwitchDirection(3, 1)).toBe('upgrade');
    expect(planSwitchDirection(1, 12)).toBe('downgrade');
    expect(planSwitchDirection(1, 3)).toBe('downgrade');
  });

  it('treats an unknown length as a downgrade, like the billing layer does', () => {
    // "Upgrade" is the branch where money moves today, so it is the branch
    // that has to be certain.
    expect(planSwitchDirection(null, 3)).toBe('downgrade');
  });

  it('does not call an unchanged period an upgrade', () => {
    expect(planSwitchDirection(3, 3)).toBe('downgrade');
  });
});
