/**
 * Palettes
 *
 * Black and white, like the KE logo. The brand used to be a lime accent; it
 * is now monochrome in both appearances: white on black in dark mode, black
 * on white in light mode. Emphasis is carried by fill and weight rather than
 * by hue - the accent is the full-strength ink, and a primary button is a
 * solid block of it with the opposite colour on top.
 *
 * Red is the only hue left, and it means one thing: something is wrong or
 * about to be destroyed.
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
  // True black, the logo's own ground, so the splash, the icon and the app
  // are one surface.
  bg: '#000000',

  // Cards are SOLID (opaque) - translucent surfaces forced the GPU to blend
  // every card over the full-screen watermark each frame, which stuttered while
  // scrolling. Opaque fills draw once with no blending.
  //
  // These three are an elevation ramp rather than two arbitrary greys: each
  // step lightens as it comes forward, so depth is carried by fill instead of
  // by a drawn outline on every card.
  surface: '#0e0e0e',
  // Buttons, inputs, and interactive components.
  surface2: '#171717',
  // Sheets, modals and anything sitting above surface2.
  surface3: '#212121',
  surfaceSolid: '#0e0e0e',

  accent: '#ffffff',
  accentSoft: '#e5e5e5',
  success: '#ffffff',
  /**
   * The accent as INK - text, thin strokes, small icons.
   *
   * In a monochrome palette it is simply the accent. Kept as its own token so
   * a future brand hue can differ between fills and type without touching
   * every screen.
   */
  accentText: '#ffffff',

  // Neutral grey text ramp. textDim still clears 4.5:1 on black.
  text: '#ffffff',
  white: '#ffffff',
  textMuted: '#a3a3a3',
  whiteMuted: '#a3a3a3',
  // Third step down, for captions and de-emphasised metadata.
  //
  // Was #6e766e, which measured 4.1:1 against the tab bar - under the 4.5
  // minimum, and it is the colour of every inactive tab label. Nudged up two
  // steps; still clearly the quietest of the three text values.
  textDim: '#8a8a8a',
  whiteFaint: 'rgba(255, 255, 255, 0.10)',

  // Hairlines. Depth comes from the surface ramp, so these stay quiet.
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',

  // Tint wash for the active-tab capsule and other accent fills, and the
  // matching edge for anything outlined in the accent.
  //
  // Tokens rather than hand-written rgba() in each screen, so the light
  // palette can never inherit a tint meant for the dark one.
  accentWash: 'rgba(255, 255, 255, 0.10)',
  accentEdge: 'rgba(255, 255, 255, 0.30)',
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
  glow: '#ffffff',
  dangerWash: 'rgba(255, 107, 107, 0.12)',
  dangerEdge: 'rgba(255, 107, 107, 0.30)',
  // The tab bar sits one hair above the ground so it reads as chrome, not page.
  navBar: '#121212',

  onAccent: '#000000',
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
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
 * 2. The accent flips with the ground: black ink here, white in the dark
 *    palette. It is a fill (buttons, the ring) and also TEXT (links, padlock
 *    captions, Subscribe labels), and black on white clears both easily.
 */
export const LIGHT: Palette = {
  bg: '#f4f4f4',

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
  surface2: '#f6f6f6',
  surface3: '#ffffff',
  surfaceSolid: '#ffffff',

  // Black ink: buttons, rings, the active tab capsule.
  accent: '#000000',
  accentText: '#000000',
  accentSoft: '#262626',
  success: '#000000',

  // The same neutral greys as the dark ramp, read as ink.
  text: '#0a0a0a',
  white: '#0a0a0a',
  textMuted: '#525252',
  whiteMuted: '#525252',
  // Matched to the dark palette's step: 4.7:1 on the page and 5.1:1 on a
  // card, so an inactive tab label is legible rather than merely present.
  textDim: '#6b6b6b',
  whiteFaint: 'rgba(0, 0, 0, 0.06)',

  border: 'rgba(0, 0, 0, 0.10)',
  borderStrong: 'rgba(0, 0, 0, 0.18)',

  accentWash: 'rgba(0, 0, 0, 0.07)',
  accentEdge: 'rgba(0, 0, 0, 0.30)',
  // The accent again, so the training circle's halo reads as a soft shadow
  // on the white page.
  glow: '#000000',
  dangerWash: 'rgba(192, 57, 43, 0.10)',
  dangerEdge: 'rgba(192, 57, 43, 0.32)',
  navBar: '#ffffff',

  // White on the black fill: the dark palette's pairing, inverted.
  onAccent: '#ffffff',
  danger: '#c0392b',
  onDanger: '#ffffff',

  scrim: 'rgba(0, 0, 0, 0.5)',
  scrimSoft: 'rgba(0, 0, 0, 0.25)',

  glass: {
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.10)',
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
// These sat at 0.5 / 0.55, which pushed text far enough down that it became
// genuinely hard to read rather than merely unavailable. 0.65 still clearly signals "you cannot use this yet" while
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
