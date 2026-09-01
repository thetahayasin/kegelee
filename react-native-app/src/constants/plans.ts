/**
 * The three fixed subscription tiers - the exact catalogue the backend seeds
 * (database/seeders/PlanSeeder.php). RevenueCat owns the purchase flow,
 * renewals, cancellations, product changes and entitlement state; these
 * entries map RevenueCat/Store product IDs to plans and drive the paywall.
 */
export interface PlanDef {
  slug: string;
  price: number;
  currency: 'USD';
  interval: 'day' | 'week' | 'month' | 'year' | 'lifetime';
  interval_count: number;
  /**
   * The Play product id, exactly as the store reports it.
   *
   * All three plans are base plans of the single `premium_monthly`
   * subscription, which is what makes the free trial once-per-account rather
   * than once per plan: Play scopes trial eligibility to the subscription.
   */
  store_product_id: string;
  revenuecat_package_id: string;
  is_featured: boolean;
  sort_order: number;
}

/**
 * Display copy lives in the locale files, keyed by slug - the paywall shows
 * these to every reader in their own language, and a name baked in here
 * would be English for all of them.
 */
export const planNameKey = (slug: string) => `plans.${slug}.name`;
export const planDescriptionKey = (slug: string) => `plans.${slug}.description`;

export const PLANS: PlanDef[] = [
  {
    slug: 'premium-monthly',
    price: 5.99,
    currency: 'USD',
    interval: 'month',
    interval_count: 1,
    store_product_id: 'premium_monthly:monthly',
    revenuecat_package_id: '$rc_monthly',
    is_featured: false,
    sort_order: 1,
  },
  {
    slug: 'premium-quarterly',
    price: 15.99,
    currency: 'USD',
    interval: 'month',
    interval_count: 3,
    // No hardcoded savings percentage: Play prices are localized per market,
    // so a fixed "Save 11%" can be plainly untrue outside the USD catalogue.
    store_product_id: 'premium_monthly:p3m',
    revenuecat_package_id: '$rc_three_month',
    is_featured: true,
    sort_order: 2,
  },
  {
    slug: 'premium-yearly',
    price: 59.99,
    currency: 'USD',
    interval: 'year',
    interval_count: 1,
    store_product_id: 'premium_monthly:p1y',
    revenuecat_package_id: '$rc_annual',
    is_featured: false,
    sort_order: 3,
  },
];

export const featuredPlan = (): PlanDef =>
  PLANS.find((p) => p.is_featured) ?? PLANS[0];

export const planBySlug = (slug: string | null | undefined): PlanDef | null =>
  PLANS.find((p) => p.slug === slug) ?? null;

/**
 * Resolve a store product id to a plan.
 *
 * Exact match, because the id IS the identifier. All three plans are base
 * plans of one subscription, so the parent on its own (`premium_monthly`)
 * names no plan and must not resolve to one - answering "monthly" for a
 * yearly purchase would record a customer on a tenth of what they paid.
 */
/**
 * The parent Play SUBSCRIPTION id, without the base plan.
 *
 * Only for Play's manage-subscription deep link, which addresses the
 * subscription rather than the base plan and silently fails to resolve if
 * given the full product id. It is not an identifier for a plan: all three
 * plans share this value, which is the entire point of the catalogue.
 */
export const playSubscriptionId = (plan: PlanDef): string =>
  plan.store_product_id.split(':')[0];

export const planByProductId = (productId: string | null | undefined): PlanDef | null => {
  const raw = (productId || '').trim();
  if (!raw) return null;
  return PLANS.find((p) => p.store_product_id === raw) ?? null;
};

/**
 * The billing period, translated, for the one place it carries weight: the
 * renewal disclosure under the CTA ("$59.99/year, renews automatically until
 * cancelled"). That sentence has to state the real period in the reader's own
 * language.
 *
 * This replaces two functions that built the label in English by string
 * concatenation - '/year', '/3 months' - and printed it into all 29 locales,
 * on the screen people are asked to pay on. Keyed per slug alongside the plan's
 * name and description rather than assembled from interval + count, because
 * each of the three plans has exactly one fixed period: no plural rules to get
 * wrong in Russian, Polish or Arabic.
 *
 * The plan CARDS carry no period suffix at all now. The plan's own name is
 * "1 Month" / "3 Months" / "1 Year" and is already translated, so a period
 * glued to the price beside it only repeated it.
 */
export const planPeriodKey = (slug: string) => `plans.${slug}.period`;

/**
 * Local expiry estimate for an instant-access record right after a purchase.
 * RevenueCat's verified webhook/API copy replaces it on the next pull.
 */
export const computeEndsAt = (plan: PlanDef, fromIso?: string): string | null => {
  const d = fromIso ? new Date(fromIso) : new Date();
  switch (plan.interval) {
    case 'day':
      d.setDate(d.getDate() + plan.interval_count);
      break;
    case 'week':
      d.setDate(d.getDate() + plan.interval_count * 7);
      break;
    case 'month':
      d.setMonth(d.getMonth() + plan.interval_count);
      break;
    case 'year':
      d.setFullYear(d.getFullYear() + plan.interval_count);
      break;
    default:
      return null;
  }
  return d.toISOString();
};
