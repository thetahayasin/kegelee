import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Rect,
  Circle,
  Path,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { Palette } from '../theme/colors';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

/**
 * Per-exercise equipment glyph, ported 1:1 from equipment-icon.blade.php.
 * Each exercise slug maps to a distinct glyph drawn with the accent gradient,
 * sitting in a translucent glass tile.
 */

const SLUG_TO_GLYPH: Record<string, string> = {
  trembling: 'dumbbell',
  holding: 'kettlebell',
  'front-clamp': 'clamp',
  'reverse-clamp': 'clamp-flip',
  flash: 'gripper',
  'steady-trembling': 'barbell',
  clamp: 'plates',
  starter: 'ring',
  'short-holding': 'disc',
  waves: 'coil',
  pulsation: 'pulse',
  push: 'press',
  upstairs: 'stairs-up',
  'steady-clamp': 'collar',
  downstairs: 'stairs-down',
  'long-steady-clamp': 'tower',
  elevator: 'elevator',
};

const Glyph = ({ glyph, g }: { glyph: string; g: string }) => {
  switch (glyph) {
    case 'kettlebell':
      return (
        <>
          <Path
            d="M26 14c0-4 12-4 12 0 0 2-1 3-1 5 6 3 9 9 9 17 0 7-5 12-14 12s-14-5-14-12c0-8 3-14 9-17-1-2-1-3-1-5z"
            fill={g}
            stroke="#5b606b"
            strokeWidth={1.2}
          />
          <Circle cx={32} cy={36} r={7} fill="#5b606b" opacity={0.35} />
        </>
      );
    case 'clamp':
      return (
        <>
          <Rect x={6} y={26} width={10} height={12} rx={2} fill={g} />
          <Rect x={48} y={26} width={10} height={12} rx={2} fill={g} />
          <Rect x={16} y={29} width={32} height={6} rx={3} fill={g} />
          <Circle cx={24} cy={32} r={9} fill={g} stroke="#5b606b" strokeWidth={1.2} />
        </>
      );
    case 'gripper':
      return (
        <>
          <Path
            d="M24 12c8 6 8 28 0 40M40 12c-8 6-8 28 0 40"
            stroke={g}
            strokeWidth={5}
            strokeLinecap="round"
          />
          <Rect x={20} y={30} width={24} height={5} rx={2.5} fill={g} />
        </>
      );
    case 'disc':
      return (
        <>
          <Circle cx={32} cy={32} r={20} fill={g} stroke="#5b606b" strokeWidth={1.2} />
          <Circle cx={32} cy={32} r={7} fill="#2a2d34" />
        </>
      );
    case 'plates':
      return (
        <>
          <Rect x={14} y={14} width={8} height={36} rx={3} fill={g} />
          <Rect x={26} y={10} width={8} height={44} rx={3} fill={g} />
          <Rect x={38} y={18} width={8} height={28} rx={3} fill={g} />
        </>
      );
    case 'barbell':
      return (
        <>
          <Rect x={4} y={27} width={8} height={10} rx={2} fill={g} />
          <Rect x={12} y={23} width={6} height={18} rx={2} fill={g} />
          <Rect x={46} y={23} width={6} height={18} rx={2} fill={g} />
          <Rect x={52} y={27} width={8} height={10} rx={2} fill={g} />
          <Rect x={18} y={30} width={28} height={4} rx={2} fill={g} />
        </>
      );
    case 'ring':
      return <Circle cx={32} cy={32} r={18} fill="none" stroke={g} strokeWidth={7} />;
    case 'coil':
      return (
        <Path
          d="M10 32 Q18 14 26 32 T42 32 T58 32"
          fill="none"
          stroke={g}
          strokeWidth={6}
          strokeLinecap="round"
        />
      );
    case 'pulse':
      return (
        <>
          <Circle cx={32} cy={32} r={20} fill="none" stroke={g} strokeWidth={3} opacity={0.5} />
          <Circle cx={32} cy={32} r={12} fill="none" stroke={g} strokeWidth={4} />
          <Circle cx={32} cy={32} r={4} fill={g} />
        </>
      );
    case 'press':
      return (
        <>
          <Rect x={28} y={8} width={8} height={34} rx={3} fill={g} />
          <Rect x={16} y={42} width={32} height={6} rx={3} fill={g} />
          <Path
            d="M22 20l10-10 10 10"
            fill="none"
            stroke={g}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case 'stairs-up':
      return (
        <Path
          d="M10 50h12V38h12V26h12V14"
          fill="none"
          stroke={g}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'stairs-down':
      return (
        <Path
          d="M10 14h12v12h12v12h12v12"
          fill="none"
          stroke={g}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'elevator':
      return (
        <>
          <Rect x={18} y={10} width={28} height={44} rx={4} fill="none" stroke={g} strokeWidth={4} />
          <Path
            d="M32 40V20M26 26l6-6 6 6"
            fill="none"
            stroke={g}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case 'collar':
      return (
        <>
          <Rect x={8} y={28} width={48} height={8} rx={4} fill={g} />
          <Circle cx={22} cy={32} r={11} fill="none" stroke={g} strokeWidth={5} />
          <Circle cx={42} cy={32} r={11} fill="none" stroke={g} strokeWidth={5} />
        </>
      );
    case 'tower':
      return (
        <>
          <Rect x={10} y={24} width={8} height={20} rx={2} fill={g} />
          <Rect x={46} y={24} width={8} height={20} rx={2} fill={g} />
          <Rect x={20} y={16} width={6} height={32} rx={2} fill={g} />
          <Rect x={38} y={16} width={6} height={32} rx={2} fill={g} />
          <Rect x={26} y={30} width={12} height={6} rx={3} fill={g} />
        </>
      );
    default: // dumbbell
      return (
        <>
          <Rect x={6} y={26} width={9} height={12} rx={2} fill={g} />
          <Rect x={15} y={22} width={7} height={20} rx={2} fill={g} />
          <Rect x={42} y={22} width={7} height={20} rx={2} fill={g} />
          <Rect x={49} y={26} width={9} height={12} rx={2} fill={g} />
          <Rect x={22} y={30} width={20} height={6} rx={3} fill={g} />
        </>
      );
  }
};

let _uid = 0;

// Memoized: rendered per-row in the Training rail and All Exercises list with
// primitive props, so parent re-renders (focus reloads, sync refreshes) should
// never re-reconcile these SVG trees.
export const EquipmentIcon = React.memo(({
  slug,
  size = 56,
  bare = false,
}: {
  slug: string;
  size?: number;
  bare?: boolean;
}) => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  // Unique gradient id per instance so multiple icons don't share/collide defs.
  const [gradId] = useState(() => `eqGrad${++_uid}`);
  const mapped = SLUG_TO_GLYPH[slug] || 'dumbbell';
  const flip = mapped.endsWith('-flip');
  const glyph = flip ? mapped.slice(0, -5) : mapped;
  // The glyph's share of its tile. At 0.66 the drawn equipment was swimming in
  // its own container - on the Training grid the tile was already under half
  // the card's inner width, and two thirds of THAT left a glyph occupying
  // barely a third of the card, which is what made those icons read as
  // undersized next to their labels. 0.72 keeps a clear inset on all four
  // sides while giving the artwork the room the tile was always reserving.
  const inner = Math.round(size * (bare ? 0.9 : 0.72));

  return (
    <View
      style={[
        styles.tile,
        bare && styles.tileBare,
        { width: size, height: size, borderRadius: bare ? 0 : size * 0.28 },
      ]}
    >
      <Svg
        width={inner}
        height={inner}
        viewBox="0 0 64 64"
        style={flip ? styles.flip : undefined}
      >
        <Defs>
          {/* accent -> accentText, so the equipment is the same lime family
              whichever appearance is live and legible on either ground.

              It ran accentSoft -> accent. In the dark palette that is a pale
              lime falling to a bright one, which is what it was drawn for. In
              the light palette accentSoft is an INK value, so the same
              gradient ran from a deep olive to a bright lime - a full tonal
              sweep that made the equipment look like a different set of
              objects depending on the setting. */}
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={COLORS.accent} />
            <Stop offset="1" stopColor={COLORS.accentText} />
          </LinearGradient>
        </Defs>
        <Glyph glyph={glyph} g={`url(#${gradId})`} />
      </Svg>
    </View>
  );
});

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.whiteFaint,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  tileBare: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  flip: {
    transform: [{ scaleX: -1 }],
  },
});
