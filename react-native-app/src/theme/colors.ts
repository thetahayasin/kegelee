/**
 * Palettes
 *
 * The accent used to BE the text colour: `text`, `white` and `textMuted` were
 * all #c1ff72 at varying alpha, so 215 of the ~479 token references in the app
 * resolved to the same lime. With every element in the accent hue there is no
 * emphasis left to spend - which is what made the UI read as a prototype.
 *
 * There is now a real neutral ramp, and lime carries exactly one meaning:
 * act here / in progress / done.
 *
 * TWO palettes, one key set. Nothing reads a palette directly: screens take
 * one as an argument (`makeStyles`) or from `useTheme()`, so the same
 * stylesheet is rebuilt in whichever palette is live. The key set is pinned by
 * the `Palette` type below and by a test, because a key that exists in one
 * palette and not the other is a screen that renders `undefined` as a colour
 * in exactly one appearance - the kind of bug nobody sees until a user with
 * the other setting reports it.
 *
 * Note on names: `white` means "primary text", not the colour white. Ninety
 * seven call sites use it that way and renaming them all would be noise, so in
 * the light palette it correctly resolves to near-black ink.
 */
export const DARK = {
  // Unchanged (#060810) so the shipped splash screen and the Play store
  // screenshots still line up.
  bg: '#060810',

  // Cards are SOLID (opaque) - translucent surfaces forced the GPU to blend
  // every card over the full-screen watermark each frame, which stuttered while
  // scrolling. Opaque fills draw once with no blending.
  //
  // These three are an elevation ramp rather than two arbitrary greys: each
  // step lightens as it comes forward, so depth is carried by fill instead of
  // by a drawn outline on every card.
  surface: '#12151d',
  // Buttons, inputs, and interactive components.
  surface2: '#1a1f29',
  // Sheets, modals and anything sitting above surface2.
  surface3: '#232937',
  surfaceSolid: '#12151d',

  accent: '#c1ff72',
  accentSoft: '#d6ffa1',
  success: '#c1ff72',
  /**
   * The accent as INK - text, thin strokes, small icons.
   *
   * On this ground it is simply the accent, and always was. It exists as a
   * separate token for the light palette, where the same lime measures 1.3:1
   * against a white card: a 2pt ring or a caption in it is not low contrast,
   * it is invisible. See LIGHT.
   */
  accentText: '#c1ff72',

  // Neutral text ramp, very slightly warm-green so it sits with the lime rather
  // than reading as a separate cold grey.
  text: '#f2f5ee',
  white: '#f2f5ee',
  textMuted: '#9aa39a',
  whiteMuted: '#9aa39a',
  // Third step down, for captions and de-emphasised metadata.
  //
  // Was #6e766e, which measured 4.1:1 against the tab bar - under the 4.5
  // minimum, and it is the colour of every inactive tab label. Nudged up two
  // steps; still clearly the quietest of the three text values.
  textDim: '#7a827a',
  whiteFaint: 'rgba(242, 245, 238, 0.10)',

  // Hairlines. Depth comes from the surface ramp, so these stay quiet.
  border: 'rgba(255, 255, 255, 0.065)',
  borderStrong: 'rgba(255, 255, 255, 0.12)',

  // Tint wash for the active-tab capsule and other accent fills, and the
  // matching edge for anything outlined in the accent.
  //
  // Both existed as hand-written rgba() in a dozen screens - which is how the
  // light palette shipped with the DARK lime in it: `rgba(193,255,114,0.12)`
  // does not stop being #c1ff72 just because the ground under it turned white,
  // so every accent-tinted card came out a washed pale yellow.
  accentWash: 'rgba(193, 255, 114, 0.14)',
  accentEdge: 'rgba(193, 255, 114, 0.28)',
  /**
   * The halo behind a training circle. Its own colour, not `accent`.
   *
   * A glow reads as light coming off something, and light on a DARK ground can
   * simply be the accent - brighter than what is behind it, which is what
   * makes it look lit. On a light ground nothing can be brighter than the
   * page, so the same trick produces the opposite result: the deep green
   * accent at 42% over white is a muddy dark ring, which is not a glow at all.
   * The light palette uses a pale, high-key green instead, so the halo lands
   * as a soft tint rather than as a stain.
   */
  glow: '#c1ff72',
  dangerWash: 'rgba(255, 107, 107, 0.12)',
  dangerEdge: 'rgba(255, 107, 107, 0.30)',
  // The tab bar sits one hair above the ground so it reads as chrome, not page.
  navBar: '#0b0e15',

  onAccent: '#0c1a00',
  danger: '#ff6b6b',
  // Text ON the danger fill. White on #ff6b6b is about 2.5:1 - it was the
  // least readable label in the app, on the button with the worst consequences
  // (delete account). Dark ink on the bright red clears 8:1.
  onDanger: '#2a0505',

  // Modal grounds. A scrim is black in both appearances - it is the absence of
  // the page, not a colour - but it needs less of it over a light page, where
  // the same 70% reads as a blackout rather than a dimming.
  scrim: 'rgba(0, 0, 0, 0.7)',
  scrimSoft: 'rgba(0, 0, 0, 0.35)',

  // Flat card edge - a cheap hairline border. The old "glass" look layered a
  // drop shadow + elevation on every card, which is expensive to render on
  // Android (each elevated, translucent, rounded view re-rasterizes its
  // shadow) and was a major cause of scroll stutter. No shadow, no elevation.
  // Spread onto card styles:
  //   card: { ...COLORS.glass, backgroundColor: COLORS.surface }
  //
  // The border dropped from 8% to 6.5% white: at 8% every card read as
  // outlined, which is the look that made the set feel like a wireframe.
  glass: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.065)',
  },
};

/**
 * The light palette.
 *
 * Not an inversion. Two things genuinely change rather than flip:
 *
 * 1. The ramp runs the other way. In the dark palette a surface comes forward
 *    by getting lighter than the ground; on a light ground it comes forward by
 *    getting lighter too - white cards on an off-white page - so `surface` is
 *    the brightest value here and the ground is the tinted one.
 *
 * 2. The accent cannot stay #c1ff72. That lime is about 1.3:1 against white,
 *    and `accent` is not only a button fill - it is the colour of the "forgot
 *    password" link, the padlock captions on locked exercises and the Subscribe
 *    labels, all of which are TEXT. A deep lime keeps the brand hue and clears
 *    4.5:1 as text, while still taking white on top when it is a fill.
 */
export const LIGHT: Palette = {
  bg: '#f4f6f0',

  // The ramp runs the OTHER way here, and the first version got it backwards:
  // surface3 - sheets and modals, the layer furthest forward - was the darkest
  // value in the set, so a modal receded into the page instead of rising off
  // it, and accent text on one measured 4.1:1.
  //
  // On a light ground a layer comes forward by getting closer to white and by
  // carrying an edge, not by getting darker. So the page is the tinted value,
  // cards and sheets are white, and the one step that recedes is surface2 -
  // inputs and pressed states, which SHOULD sit into the page.
  surface: '#ffffff',
  surface2: '#f7f8f4',
  surface3: '#ffffff',
  surfaceSolid: '#ffffff',

  /**
   * The logo lime, taken down until it can be seen on a white page.
   *
   * The brand lime itself was tried here and it does not work: #c1ff72 is
   * 1.08:1 against this ground. Not dim - not there. A ring, a progress bar or
   * a filled button in it simply is not visible, which is what "too bright" on
   * a light screen actually means.
   *
   * This is the SAME hue - 86 degrees, the logo's own - at 3.0:1 on the page,
   * which clears the threshold for graphics: rings, glows, fills, the active
   * tab capsule, anything with dark ink on top. Still plainly a lime, and as
   * close to the brand as a light ground permits.
   */
  accent: '#5f9e0a',
  /**
   * And the same lime as INK.
   *
   * #c1ff72 is 1.3:1 on white. Not "a bit weak" - a caption or a 2pt stroke in
   * it simply cannot be seen. This is that exact colour taken down its OWN hue
   * (86 degrees, the logo's) until it reads: same colour, more of it. It is
   * what the eye accepts as "the lime, written down".
   */
  accentText: '#4d7c0f',  // and one step darker again for type - 4.99:1.
  accentSoft: '#3f6212',
  success: '#4d7c0f',

  // The same warm-green neutral family as the dark ramp, read as ink.
  text: '#14181a',
  white: '#14181a',
  textMuted: '#585f59',
  whiteMuted: '#585f59',
  // Matched to the dark palette's step: 4.7:1 on the page and 5.1:1 on a
  // card, so an inactive tab label is legible rather than merely present.
  textDim: '#68706a',
  whiteFaint: 'rgba(20, 24, 26, 0.06)',

  border: 'rgba(20, 24, 26, 0.10)',
  borderStrong: 'rgba(20, 24, 26, 0.20)',

  accentWash: 'rgba(95, 158, 10, 0.14)',
  accentEdge: 'rgba(95, 158, 10, 0.34)',
  // The accent again. A halo is soft and large, but it is still drawn ON a
  // white page - the brand lime at 42% over white is indistinguishable from
  // the page, which made the training circles look like they had no glow at
  // all rather than a gentle one.
  glow: '#5f9e0a',
  dangerWash: 'rgba(192, 57, 43, 0.10)',
  dangerEdge: 'rgba(192, 57, 43, 0.32)',
  navBar: '#ffffff',

  // Dark ink, because the fill is the bright lime again - the same pairing
  // the dark palette uses. White on #c1ff72 is 1.4:1.
  onAccent: '#0c1a00',
  danger: '#c0392b',
  onDanger: '#ffffff',

  scrim: 'rgba(0, 0, 0, 0.5)',
  scrimSoft: 'rgba(0, 0, 0, 0.25)',

  glass: {
    borderWidth: 1,
    borderColor: 'rgba(20, 24, 26, 0.10)',
  },
};

/**
 * The shape both palettes must have.
 *
 * Derived from DARK rather than written out, so adding a colour to one palette
 * is a type error in the other rather than a silent `undefined`.
 */
export type Palette = typeof DARK;

// Opacity for disabled buttons and locked cards.
//
// These sat at 0.5 / 0.55, which against this dark ground pushed lime text far
// enough down that it became genuinely hard to read rather than merely
// unavailable. 0.65 still clearly signals "you cannot use this yet" while
// leaving the label legible - which matters most for locked exercises, where
// the whole point is that the user can see what they are working towards.
export const DISABLED_OPACITY = 0.65;
/**
 * Type scale. The screens were setting ad-hoc sizes inline (11, 12, 13, 14, 15,
 * 16, 18, 20, 22, 28, 34...) with no shared rhythm and no letter-spacing, which
 * is a large part of why the app read as unresolved next to a shipping product.
 * Large sizes tighten — optical correction, big text needs less tracking.
 */
export const TYPE = {
  display: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -1.1 },
  title: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.7 },
  heading: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.4 },
  section: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '500' as const, letterSpacing: -0.1 },
  bodySm: { fontSize: 13.5, fontWeight: '500' as const, letterSpacing: 0 },
  caption: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0 },
  // Uppercase metadata rows ("MONTH 1 / DAY 3"). Tracking opens up because
  // uppercase runs need more air between letters to stay readable.
  overline: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.4 },
} as const;

/** Spacing rhythm, so screens stop inventing 7s and 13s. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Corner radii. Cards are softer than controls; pills are fully round. */
export const RADIUS = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/**
 * The floating tab bar's own geometry.
 *
 * The bar no longer sits in the layout: it is absolutely positioned, detached
 * from all three edges, so the screens behind it run the full height of the
 * window and would otherwise end underneath it. Every tab screen pads its
 * bottom by `tabBarClearance()` instead, and these are the numbers both sides
 * agree on - the bar is drawn from them and the padding is computed from them,
 * so the two cannot drift apart.
 */
export const TAB_BAR = {
  /** The bar itself, excluding anything below it. */
  height: 66,
  /** Gap between the bar and the bottom of the window, before insets. */
  gap: 12,
  /**
   * Width of one tab, and therefore of the bar: four of these plus its own
   * padding.
   *
   * The bar is no longer positioned from the screen edges at all. It had a
   * `side` inset instead - 16, then 32, then 48 - and none of them worked,
   * because setting both `left` and `right` fully determines a width: every
   * value just produced a full-width slab with bigger margins. It is sized by
   * its content now and centred, so the only number that decides how wide it
   * is happens to be this one.
   *
   * Fixed rather than intrinsic so the four tabs come out even. Left to size
   * themselves each would be as wide as its own label, which differs by word
   * and by language.
   *
   * 78 fits the 52pt icon capsule with room around it, and the longest tab
   * label across the 29 locales at 10.5pt. Four tabs make the bar ~320pt,
   * which leaves a clear band of page down both sides even on a 360pt phone.
   */
  itemWidth: 78,
} as const;

/**
 * How much room a tab screen must leave at the bottom for the floating bar.
 *
 * `insetBottom` is the safe-area inset - the Android navigation bar or the
 * home indicator. The bar floats above it rather than behind it, so the
 * clearance is the bar, the larger of the inset and the design gap, and one
 * more gutter so the last card is not touching the bar's underside.
 */
export const tabBarClearance = (insetBottom: number): number =>
  TAB_BAR.height + Math.max(insetBottom, TAB_BAR.gap) + SPACE.lg;
