import type { PlanPricing } from '../services/billing';
import { PLANS, PlanDef } from './plans';

/**
 * Store-price arithmetic shared by the two surfaces that sell a plan: the
 * paywall and the guest subscribe sheet.
 *
 * It lived inside PaywallScreen, which is why the sheet went without and
 * rendered `$5.99` straight from the catalogue instead - a USD figure shown to
 * every market, next to a Play sheet about to charge something else entirely.
 * Anything that puts a price in front of someone belongs here, on live store
 * data, or it is a number we cannot stand behind.
 */

export const planMonths = (plan: PlanDef): number | null => {
  if (plan.interval === 'year') return 12 * plan.interval_count;
  if (plan.interval === 'month') return plan.interval_count;
  return null;
};

/**
 * The amount inside a store price string: the run of digits with whatever a
 * market puts between them.
 *
 * The separators are not decoration - if one is missing from this class the
 * run stops early and only PART of the amount gets swapped, which is how
 * "CHF 1’699.00" came back as "CHF 141.58’699.00". Covered: the ASCII pair,
 * the space family (\s takes in the non-breaking and narrow no-break spaces
 * that French, Polish, Russian and Ukrainian group with), and the apostrophes
 * Switzerland and Liechtenstein group with.
 */
const NUMERIC_RUN = /\d[\d.,\s'’]*\d|\d/;

/**
 * A plan's price expressed per month, reusing the STORE's own formatting.
 *
 * Rather than reformatting through Intl (symbol position and decimal separator
 * vary by locale, and Hermes ships Intl inconsistently), this swaps the numeric
 * run inside the store's own priceString. Whatever currency symbol, placement
 * and separator that market uses are preserved exactly as the store wrote them.
 */
export const perMonthLabel = (
  pricing: PlanPricing | undefined,
  months: number | null,
): string | null => {
  if (!pricing?.priceString || pricing.price == null || !months || months <= 1) return null;
  const numeric = pricing.priceString.match(NUMERIC_RUN);
  if (!numeric) return null;
  const sample = numeric[0];
  const separator = /,\d{1,2}$/.test(sample) ? ',' : '.';
  return pricing.priceString.replace(
    sample,
    (pricing.price / months).toFixed(2).replace('.', separator),
  );
};

/**
 * Percentage saved per month against the monthly plan, from LIVE store prices.
 *
 * Never derived from the catalogue: those figures are USD-only and would
 * misstate the saving in every other market, which is exactly why plans.ts
 * refuses to carry a hardcoded discount. Returns null unless both real prices
 * are known.
 */
export const savingsPercent = (
  pricing: Record<string, PlanPricing>,
  plan: PlanDef,
  months: number | null,
): number | null => {
  const monthly = PLANS.find((p) => p.interval === 'month' && p.interval_count === 1);
  const base = monthly ? pricing[monthly.slug]?.price : null;
  const own = pricing[plan.slug]?.price;
  if (!base || !own || !months || months <= 1) return null;
  const percent = Math.round((1 - own / months / base) * 100);
  // Anything under ~5% reads as noise and invites "that is not a saving".
  return percent >= 5 ? percent : null;
};

/**
 * The same price with its amount zeroed: "Rs 1,700.00" -> "Rs 0.00".
 *
 * What a free trial costs today, written the way that market writes money.
 * The store's own free-phase string is not usable for this on its own: Play
 * formats a zero phase as the localized word for "free" in some markets and as
 * an amount in others, so the figure under the plan name would change shape
 * from country to country and stop lining up with the price beside it.
 *
 * Swaps the numeric run inside the store's priceString - the same trick
 * perMonthLabel uses, and for the same reason - so the currency symbol, its
 * placement and the decimal separator survive exactly as the store wrote them.
 * The number of decimals is copied too: a market quoted "$5.99" gets "$0.00",
 * one quoted "¥600" gets "¥0".
 *
 * Returns null when the price carries no ASCII digits to swap (Arabic-Indic
 * numerals, for one), leaving the caller to fall back rather than print a zero
 * in the wrong script.
 */
export const zeroPriceLike = (priceString?: string | null): string | null => {
  const source = priceString || '';
  const numeric = source.match(NUMERIC_RUN);
  if (!numeric) return null;
  const sample = numeric[0];
  // The decimal separator is whichever of . or , has one or two digits after
  // it at the end. "1,700.00" is two decimals; "1,999" is none, and reading
  // its thousands separator as one would print "0,99" for a rupee price.
  const decimals = /[.,](\d{1,2})$/.exec(sample);
  const zero = decimals
    ? `0${sample[decimals.index]}${'0'.repeat(decimals[1].length)}`
    : '0';
  const zeroed = source.replace(sample, zero);

  /**
   * Every digit has to be a zero now, or the run stopped short of the whole
   * amount and what is left is not free - it is a smaller price. This screen
   * gets one thing wrong at a time: a null sends the caller to the store's own
   * free-phase string, while "CHF 0’699.00" under "3 days free" is a figure
   * somebody would hold us to.
   */
  return /[1-9]/.test(zeroed) ? null : zeroed;
};
