import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';

/**
 * The soft halo behind a training circle.
 *
 * Shared because there are two of these in the app and they had drifted. The
 * workout session drew this - a radial gradient that is transparent at the
 * centre and fades up to the accent near its edge, so it reads as light coming
 * off the circle. The "find your pelvic floor" lesson drew a flat disc of
 * solid accent with a border radius instead, which is not a glow: it is a
 * coloured ring sitting behind the circle with a hard edge on it.
 *
 * One component, so the lesson that teaches the movement and the session that
 * runs it look like the same app.
 */
interface Props {
  /** Diameter of the circle this sits behind. */
  size: number;
  /**
   * How far past the circle the halo reaches.
   *
   * The session can afford the full 1.7 - its circle is alone on the screen.
   * A screen with text above and below the circle cannot: at 1.7 the halo
   * reaches 90pt past the box the layout reserved for it and lands on the
   * sentence above, which is exactly what happened when the lesson first
   * borrowed this. Callers in tight space pass a smaller one.
   */
  scale?: number;
}

/** What the session uses, and the default. */
export const GLOW_SCALE = 1.7;

export const ContractGlow: React.FC<Props> = ({ size, scale = GLOW_SCALE }) => {
  const COLORS = useTheme();
  const box = size * scale;

  return (
    <Svg width={box} height={box} style={styles.svg} pointerEvents="none">
      <Defs>
        <RadialGradient id="contractGlow" cx="50%" cy="50%" r="50%">
          {/* Nothing at all where the circle itself sits, or the halo would
              wash out the ring it is meant to be lighting. */}
          <Stop offset="56%" stopColor={COLORS.glow} stopOpacity="0" />
          <Stop offset="66%" stopColor={COLORS.glow} stopOpacity="0.08" />
          <Stop offset="90%" stopColor={COLORS.glow} stopOpacity="0.42" />
          <Stop offset="100%" stopColor={COLORS.glow} stopOpacity="0.24" />
        </RadialGradient>
      </Defs>
      <Circle cx={box / 2} cy={box / 2} r={box / 2} fill="url(#contractGlow)" />
    </Svg>
  );
};

const styles = StyleSheet.create({
  svg: { alignSelf: 'center' },
});
