/**
 * The three fixed subscription tiers - the exact catalogue the backend seeds
 * (database/seeders/PlanSeeder.php). Google Play owns billing, renewals,
 * cancellations and proration; these entries only map Play product IDs to
 * plans and drive the paywall display. The Play Console holds matching
 * subscription products with these IDs.
 */
export interface PlanDef {
  name: string;
  slug: string;
  price: number;
  currency: 'USD';
  interval: 'day' | 'week' | 'month' | 'year' | 'lifetime';
  interval_count: number;
  description: string;
  store_product_id: string;
  is_featured: boolean;
  sort_order: number;
}

export const PLANS: PlanDef[] = [
  {
    name: '1 Month',
    slug: 'premium-monthly',
    price: 5.99,
    currency: 'USD',
    interval: 'month',
    interval_count: 1,
    description: 'Full access, billed monthly.',
    store_product_id: 'premium_monthly',
    is_featured: false,
    sort_order: 1,
  },
  {
    name: '3 Months',
    slug: 'premium-quarterly',
    price: 15.99,
    currency: 'USD',
    interval: 'month',
    interval_count: 3,
    description: 'Save 11%, billed every 3 months.',
    store_product_id: 'premium_quarterly',
    is_featured: true,
    sort_order: 2,
  },
  {
    name: '1 Year',
    slug: 'premium-yearly',
    price: 65.99,
    currency: 'USD',
    interval: 'year',
    interval_count: 1,
    description: 'One payment for the whole year.',
    store_product_id: 'premium_yearly',
    is_featured: false,
    sort_order: 3,
  },
];

/**
 * Free-trial length shown on the plan cards. The backend's
 * subscription_trial_days setting defaults to 0 (real trial offers are
 * configured in Google Play, not here); 0 hides the trial line.
 */
export const TRIAL_DAYS = 0;

export const featuredPlan = (): PlanDef =>
  PLANS.find((p) => p.is_featured) ?? PLANS[0];

export const planBySlug = (slug: string | null | undefined): PlanDef | null =>
  PLANS.find((p) => p.slug === slug) ?? null;

export const planByProductId = (productId: string): PlanDef | null =>
  PLANS.find((p) => p.store_product_id === productId) ?? null;

/** Interval label as the subscribe sheet renders it (subscribe-sheet.blade.php). */
export const sheetIntervalLabel = (plan: PlanDef): string => {
  if (plan.interval === 'lifetime') return '';
  if (plan.interval === 'year') return '/year';
  if (plan.interval === 'month' && plan.interval_count === 3) return '/3 months';
  if (plan.interval === 'month') return '/month';
  if (plan.interval === 'week') return '/week';
  return '/' + plan.interval;
};

/** Interval label as the paywall renders it (paywall.blade.php, pluralised). */
export const paywallIntervalLabel = (plan: PlanDef): string => {
  if (plan.interval === 'lifetime') return '';
  return (
    '/' +
    (plan.interval_count > 1
      ? `${plan.interval_count} ${plan.interval}s`
      : plan.interval)
  );
};

/**
 * Local expiry estimate for an instant-access record right after a purchase
 * (the same interval math as createSubscription() on the web). The backend's
 * verified copy - with Google's real expiryTimeMillis - replaces it on the
 * next pull.
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
      return null; // lifetime: no expiry
  }
  return d.toISOString();
};
