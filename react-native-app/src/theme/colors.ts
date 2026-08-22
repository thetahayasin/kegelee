/**
 * Palette
 *
 * The accent used to BE the text colour: `text`, `white` and `textMuted` were
 * all #c1ff72 at varying alpha, so 215 of the ~479 token references in the app
 * resolved to the same lime. With every element in the accent hue there is no
 * emphasis left to spend — which is what made the UI read as a prototype.
 *
 * There is now a real neutral ramp, and lime carries exactly one meaning:
 * act here / in progress / done. `bg` is unchanged (#060810) so the shipped
 * splash screen and the Play store screenshots still line up.
 */
export const COLORS = {
  bg: '#060810',

  // Cards are SOLID (opaque) - translucent surfaces forced the GPU to blend
  // every card over the full-screen watermark each frame, which stuttered while
  // scrolling. Opaque fills draw once with no blending.
  //
  // These three are now an elevation ramp rather than two arbitrary greys: each
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

  // Neutral text ramp, very slightly warm-green so it sits with the lime rather
  // than reading as a separate cold grey.
  //
  // `white` keeps its name because 97 call sites use it as "primary text"; it
  // now actually resolves to a near-white instead of to the accent.
  text: '#f2f5ee',
  white: '#f2f5ee',
  textMuted: '#9aa39a',
  whiteMuted: '#9aa39a',
  // Third step down, for captions and de-emphasised metadata.
  textDim: '#6e766e',
  whiteFaint: 'rgba(242, 245, 238, 0.10)',

  // Hairlines. Depth comes from the surface ramp, so these stay quiet.
  border: 'rgba(255, 255, 255, 0.065)',
  borderStrong: 'rgba(255, 255, 255, 0.12)',

  // Tint wash for the active-tab capsule and other accent-on-dark fills.
  accentWash: 'rgba(193, 255, 114, 0.14)',
  // The tab bar sits one hair above the ground so it reads as chrome, not page.
  navBar: '#0b0e15',

  onAccent: '#0c1a00',
  danger: '#ff6b6b',
};

// Flat card edge - just a cheap hairline border. The old "glass" look layered a
// drop shadow + elevation on every card, which is expensive to render on Android
// (each elevated, translucent, rounded view re-rasterizes its shadow) and was a
// major cause of scroll stutter. No shadow / no elevation now. Spread onto card
// styles: `card: { ...GLASS, backgroundColor: COLORS.surface, borderRadius: 20 }`.
//
// The border dropped from 8% to 6.5% white: at 8% every card read as outlined,
// which is the look that made the set feel like a wireframe. Still no shadow
// and still no elevation — the ramp above does that work now.
export const GLASS = {
  borderWidth: 1,
  borderColor: COLORS.border,
} as const;

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
