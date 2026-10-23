import { Platform } from 'react-native';

/**
 * The brand typeface, Archivo, applied to every text style in one place.
 *
 * Two families, registered natively in MainApplication:
 *   - "ArchivoExpanded": the wide heavy cut that echoes the KE logo. Titles,
 *     headlines and big numbers only - it is too wide for running text.
 *   - "Archivo": everything else, at whatever fontWeight the style asks for.
 *
 * Applied by `withAppFonts` from useThemedStyles rather than by editing each
 * stylesheet, so every screen picks it up without carrying a fontFamily of
 * its own, and the split between the two families is one rule here instead
 * of a judgement made separately in forty files.
 *
 * Android only: the fonts are bundled in the Android resources. iOS keeps the
 * system font until they are added to its project too, rather than logging
 * an unknown family on every text node.
 */
export const FONT_FAMILY = 'Archivo';
export const DISPLAY_FAMILY = 'ArchivoExpanded';

const enabled = Platform.OS === 'android';

const weightOf = (w: unknown): number => {
  if (w === 'bold') return 700;
  const n = Number(w);
  return Number.isFinite(n) ? n : 400;
};

/** Which family a text style belongs in. */
export const familyFor = (style: { fontSize?: unknown; fontWeight?: unknown }): string => {
  const size = Number(style.fontSize) || 0;
  return size >= 19 && weightOf(style.fontWeight) >= 700 ? DISPLAY_FAMILY : FONT_FAMILY;
};

const isTextStyle = (s: Record<string, unknown>): boolean =>
  'fontSize' in s || 'fontWeight' in s || 'letterSpacing' in s || 'lineHeight' in s;

/**
 * Give every text style in a stylesheet its brand family.
 *
 * A style that already names a fontFamily keeps it, so a screen can still opt
 * out (the watermark's SVG text, for one). Non-text styles are left alone.
 */
export const withAppFonts = <T,>(sheet: T): T => {
  if (!enabled || !sheet || typeof sheet !== 'object') return sheet;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sheet as Record<string, unknown>)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const s = value as Record<string, unknown>;
      out[key] = isTextStyle(s) && !('fontFamily' in s) ? { ...s, fontFamily: familyFor(s) } : s;
    } else {
      out[key] = value;
    }
  }
  return out as T;
};
