/**
 * Whether THIS account can still start a free trial, and how long it is.
 *
 * The free-plan prompts lead with the trial when there is one to offer - a
 * free first step is a far easier yes than "Subscribe" - and fall back to
 * plain Subscribe when there is not. The answer comes from the same
 * getPlanPricing the paywall uses, so a prompt can never promise a trial the
 * paywall then refuses (getPlanPricing fails closed: unknown means no trial).
 *
 * Cached per account for a few minutes: the Training tab asks on every focus,
 * and the store answer does not change between two taps.
 */
import { useEffect, useState } from 'react';
import { getPlanPricing } from './billing';

const TTL_MS = 10 * 60 * 1000;
let cache: { userId: number; days: number | null; at: number } | null = null;

export const trialDaysFor = async (userId: number): Promise<number | null> => {
  if (cache && cache.userId === userId && Date.now() - cache.at < TTL_MS) return cache.days;
  try {
    const pricing = await getPlanPricing(userId);
    const days = Object.values(pricing)
      .map((p) => p.freeTrialDays)
      .filter((d): d is number => typeof d === 'number' && d > 0);
    const best = days.length ? Math.max(...days) : null;
    cache = { userId, days: best, at: Date.now() };
    return best;
  } catch {
    // Offline or the store is unreachable: no trial claim rather than a wrong one.
    return null;
  }
};

/** Trial length for the signed-in free account, or null. Only asks when `enabled`. */
export const useTrialDays = (userId: number | null | undefined, enabled: boolean): number | null => {
  const [days, setDays] = useState<number | null>(
    cache && cache.userId === userId ? cache.days : null,
  );
  useEffect(() => {
    if (!enabled || !userId) {
      setDays(null);
      return;
    }
    let alive = true;
    trialDaysFor(userId).then((d) => {
      if (alive) setDays(d);
    });
    return () => {
      alive = false;
    };
  }, [userId, enabled]);
  return days;
};

/** Forget the cached answer, e.g. after a purchase or sign-out. */
export const forgetTrialOffer = (): void => {
  cache = null;
};
