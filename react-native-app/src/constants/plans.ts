/**
 * The three fixed subscription tiers - the exact catalogue the backend seeds
 * (database/seeders/PlanSeeder.php). RevenueCat owns the purchase flow,
 * renewals, cancellations, product changes and entitlement state; these
 * entries map RevenueCat/Store product IDs to plans and drive the paywall.
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
  revenuecat_package_id: string;
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
    revenuecat_package_id: '$rc_monthly',
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
    // No hardcoded savings percentage: Play prices are localized per market,
    // so a fixed "Save 11%" can be plainly untrue outside the USD catalogue.
    description: 'Billed every 3 months.',
    store_product_id: 'premium_quarterly',
    revenuecat_package_id: '$rc_three_month',
    is_featured: true,
    sort_order: 2,
  },
  {
    name: '1 Year',
    slug: 'premium-yearly',
    price: 59.99,
    currency: 'USD',
    interval: 'year',
    interval_count: 1,
    description: 'One payment for the whole year.',
    store_product_id: 'premium_yearly',
    revenuecat_package_id: '$rc_annual',
    is_featured: false,
    sort_order: 3,
  },
];

export const featuredPlan = (): PlanDef =>
  PLANS.find((p) => p.is_featured) ?? PLANS[0];

export const planBySlug = (slug: string | null | undefined): PlanDef | null =>
  PLANS.find((p) => p.slug === slug) ?? null;

export const normalizeStoreProductId = (productId: string | null | undefined): string =>
  (productId || '').split(':')[0];

export const planByProductId = (productId: string | null | undefined): PlanDef | null => {
  const normalized = normalizeStoreProductId(productId);
  return PLANS.find((p) => p.store_product_id === normalized) ?? null;
};

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
