/**
 * @format
 *
 * The two palettes, pinned against each other.
 *
 * A colour that exists in one palette and not the other renders as
 * `undefined` in exactly one appearance - which React Native treats as "no
 * colour" rather than as an error, so the screen does not crash, it just comes
 * out wrong for whichever half of the users have the other setting. Nobody
 * finds that in review; it arrives as a support message with a screenshot.
 *
 * TypeScript catches a MISSING key, because LIGHT is declared as `Palette`.
 * It cannot catch the rest of what matters here.
 */
import { DARK, LIGHT } from '../src/theme/colors';

const KEYS = Object.keys(DARK) as (keyof typeof DARK)[];

describe('the palettes', () => {
  it('have exactly the same keys', () => {
    expect(Object.keys(LIGHT).sort()).toEqual(Object.keys(DARK).sort());
  });

  it('define every key in both', () => {
    for (const k of KEYS) {
      expect(DARK[k]).toBeDefined();
      expect(LIGHT[k]).toBeDefined();
    }
  });

  it('actually differ - a copied palette is not a light mode', () => {
    // Guards against LIGHT being pasted from DARK and half-edited. The glass
    // object is compared by its border, not by identity.
    // `onAccent` is shared: both palettes put dark ink on their accent fill.
    // Everything else has to differ.
    const shared = ['onAccent'];
    const differing = KEYS.filter(
      (k) => JSON.stringify(DARK[k]) !== JSON.stringify(LIGHT[k]),
    );
    expect(differing.length).toBe(KEYS.length - shared.length);
  });

  it('keeps the ground and the ink on opposite sides in each', () => {
    // The one relationship every screen depends on: text has to be the far end
    // of the range from the page it sits on. Comparing luminance rather than
    // eyeballing hex means a future edit that lightens the ink cannot quietly
    // land on a light ground.
    expect(luminance(DARK.bg)).toBeLessThan(0.2);
    expect(luminance(DARK.text)).toBeGreaterThan(0.7);
    expect(luminance(LIGHT.bg)).toBeGreaterThan(0.7);
    expect(luminance(LIGHT.text)).toBeLessThan(0.2);
  });

  it('gives the accent AS INK enough contrast in both palettes', () => {
    // `accent` is the brand lime in both palettes now - a fill colour, always
    // with dark ink on top of it, so its own contrast against the page is not
    // the thing that matters.
    //
    // `accentText` is the one that has to be read: the "forgot password" link,
    // the Premium labels, every thin stroke and every progress bar. On dark it
    // is the lime itself; on light it is the same hue taken down until it can
    // be seen, because #c1ff72 on white is 1.3:1 - invisible, not merely weak.
    for (const p of [DARK, LIGHT]) {
      expect(contrast(p.accentText, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.accentText, p.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the accent VISIBLE as a graphic in both palettes', () => {
    // `accent` is the fill and stroke colour - rings, glows, progress bars,
    // buttons. It does not need the 4.5:1 that text needs, but it does need
    // the 3:1 that a non-text mark needs, and the brand lime does not have it
    // on a white page: #c1ff72 is 1.08:1 there. Shipping that made the light
    // theme look like the circles had simply not been drawn.
    for (const p of [DARK, LIGHT]) {
      expect(contrast(p.accent, p.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.accent, p.surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.glow, p.bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps label text readable on the accent fill', () => {
    for (const p of [DARK, LIGHT]) {
      expect(contrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps label text readable on the accent and danger fills', () => {
    expect(contrast(DARK.onAccent, DARK.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(LIGHT.onAccent, LIGHT.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(DARK.onDanger, DARK.danger)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(LIGHT.onDanger, LIGHT.danger)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps body and muted text readable on both grounds', () => {
    for (const p of [DARK, LIGHT]) {
      expect(contrast(p.text, p.bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(p.textMuted, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.textMuted, p.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the quietest text step readable on the page and the tab bar', () => {
    // textDim is not decoration: it is the colour of every INACTIVE TAB LABEL,
    // which is four of the app's most-read words. It was below 4.5:1 in the
    // dark palette before this test existed.
    for (const p of [DARK, LIGHT]) {
      expect(contrast(p.textDim, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.textDim, p.navBar)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/** #rrggbb -> relative luminance, per WCAG. */
const luminance = (hex: string): number => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not an opaque hex colour: ${hex}`);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const n = parseInt(m[1], 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
