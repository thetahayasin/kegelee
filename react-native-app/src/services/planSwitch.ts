/**
 * Is this tap a plan CHANGE, or a fresh purchase?
 *
 * Pulled out of PaywallScreen because it is the question the whole billing
 * flow hangs off - it decides whether Play is sent a product change with an
 * old product id and a replacement mode, or a plain purchase - and because it
 * was being answered by two different rules on the same screen.
 *
 * Pure, and structurally typed rather than taking DBSubscription, so it can be
 * tested without dragging in SQLite.
 */

/** The parts of a local subscription row this decision actually reads. */
export interface SubscriptionLike {
  plan_slug: string | null;
  status: string;
  ends_at: string | null;
  auto_renewing: number;
}

export interface PlanSwitch {
  /**
   * Play must be sent a product change rather than a plain purchase.
   *
   * True whenever a DIFFERENT plan is chosen and the Google account still
   * holds a subscription - including a cancelled one that has not run out.
   *
   * That last case is the fix. This used to require the row to be renewing, on
   * the reasoning that a cancelled subscription has no renewal left to swap.
   * It has something better: the purchase is still live in Play, so buying the
   * new plan plainly is buying a subscription the account already owns, which
   * Play declines with "we were unable to change your plan" - the exact error
   * the guard was written to avoid, produced by the guard itself. A product
   * change is the path that works, and it also un-cancels them, which is what
   * somebody tapping a plan on the renew screen is asking for.
   */
  switching: boolean;
  /**
   * Whether the subscription being replaced is still set to renew.
   *
   * For COPY only - "your plan changes at the next renewal on the 14th"
   * against "your access ends on the 14th". It must never decide whether a
   * switch happens.
   */
  renewing: boolean;
  /** The plan being left, or null when there is nothing to leave. */
  fromSlug: string | null;
  /** When the current plan's paid period runs out, if it is known. */
  endsAt: string | null;
}

/**
 * Whether this row still grants access right now.
 *
 * Mirrors getActiveSubscription: a cancelled row keeps its access until the
 * paid period ends, and a null expiry is open-ended rather than expired. The
 * screen is normally handed a row that already passed that filter; this is
 * here so the answer cannot silently depend on which caller asked.
 */
export const subscriptionStillGrantsAccess = (
  sub: SubscriptionLike | null | undefined,
  now: number = Date.now(),
): boolean => {
  if (!sub) return false;

  const status = String(sub.status || '').toLowerCase();
  if (status === 'expired' || status === 'refunded') return false;

  const ends = sub.ends_at ? Date.parse(sub.ends_at) : NaN;
  if (Number.isFinite(ends) && ends <= now) return false;

  return true;
};

export const planSwitchFor = (
  current: SubscriptionLike | null | undefined,
  nextSlug: string | null | undefined,
  now: number = Date.now(),
): PlanSwitch => {
  const live = subscriptionStillGrantsAccess(current, now);
  const fromSlug = live ? current?.plan_slug ?? null : null;

  return {
    switching: !!fromSlug && !!nextSlug && fromSlug !== nextSlug,
    renewing:
      live
      && Number(current?.auto_renewing) === 1
      && String(current?.status || '').toLowerCase() !== 'canceled',
    fromSlug,
    endsAt: live ? current?.ends_at ?? null : null,
  };
};
