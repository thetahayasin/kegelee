/**
 * @format
 *
 * Writing a trial's price as zero, in the market the price came from.
 *
 * The paywall shows what the tap costs today, and on a trial that is nothing -
 * but "nothing" still has to be written the way that country writes money, or
 * it stops matching the figure sitting directly under it. There is no Intl
 * here on purpose (Hermes ships it inconsistently, and symbol placement and
 * separators vary far more than a currency code implies): the amount inside
 * the store's own string is swapped for a zero and everything else is left
 * exactly as the store wrote it.
 */
import { zeroPriceLike } from '../src/constants/pricing';

describe('zeroPriceLike', () => {
  it('keeps the symbol, its side, and the decimals', () => {
    expect(zeroPriceLike('$5.99')).toBe('$0.00');
    expect(zeroPriceLike('Rs 1,700.00')).toBe('Rs 0.00');
    expect(zeroPriceLike('19,99 zł')).toBe('0,00 zł');
    expect(zeroPriceLike('€1 299,00')).toBe('€0,00');
  });

  it('does not invent decimals a currency does not use', () => {
    // Yen and won are quoted whole. "¥0.00" is not how that price is written.
    expect(zeroPriceLike('¥600')).toBe('¥0');
    expect(zeroPriceLike('₩7,500')).toBe('₩0');
  });

  it('reads a thousands separator as a thousands separator', () => {
    // "PKR 1,999" has three digits after the comma, so it is not a decimal
    // mark. Treating it as one printed "0,99" - a price nobody was quoted.
    expect(zeroPriceLike('PKR 1,999')).toBe('PKR 0');
  });

  it('gives up rather than print a zero in the wrong script', () => {
    // No ASCII digits to swap: the caller falls back to the store's own
    // free-phase string instead.
    expect(zeroPriceLike('٥٫٩٩ ر.س')).toBeNull();
    expect(zeroPriceLike('')).toBeNull();
    expect(zeroPriceLike(null)).toBeNull();
    expect(zeroPriceLike(undefined)).toBeNull();
  });
});
