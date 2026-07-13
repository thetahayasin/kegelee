export const COLORS = {
  bg: '#060810',
  // Cards are SOLID (opaque) - translucent surfaces forced the GPU to blend
  // every card over the full-screen watermark each frame, which stuttered while
  // scrolling. Opaque fills draw once with no blending.
  surface: '#161b26',
  // Buttons, inputs, and interactive components.
  surface2: '#212836',
  surfaceSolid: '#161b26',
  accent: '#c1ff72',
  accentSoft: '#d6ffa1',
  success: '#c1ff72',
  text: '#c1ff72',
  textMuted: 'rgba(193, 255, 114, 0.5)',
  // Map white text styles to theme accent/lime
  white: '#c1ff72',
  whiteMuted: 'rgba(193, 255, 114, 0.6)',
  whiteFaint: 'rgba(193, 255, 114, 0.15)',
  onAccent: '#0c1a00',
  danger: '#ff4d4d',
};

// Flat card edge - just a cheap hairline border. The old "glass" look layered a
// drop shadow + elevation on every card, which is expensive to render on Android
// (each elevated, translucent, rounded view re-rasterizes its shadow) and was a
// major cause of scroll stutter. No shadow / no elevation now. Spread onto card
// styles: `card: { ...GLASS, backgroundColor: COLORS.surface, borderRadius: 20 }`.
export const GLASS = {
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
} as const;

