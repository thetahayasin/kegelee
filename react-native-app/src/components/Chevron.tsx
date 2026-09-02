import React from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * The one chevron in the app.
 *
 * There were nine hand-drawn copies, in four slightly different path shapes,
 * and none of them mirrored. A chevron is a DIRECTION, not a decoration:
 * "forward" points at the screen you are about to open and "back" at the one
 * you came from, and in Arabic and Hebrew those are the opposite side of the
 * screen. Every one of them pointed right regardless, so in RTL the back
 * button and the disclosure arrow both pointed the way you were not going.
 *
 * React Native already mirrors `start`/`end` layout for us, so only the glyph
 * itself needs flipping. `scaleX: -1` on the wrapper does that for both
 * directions at once and keeps the stroke geometry identical, which a second
 * hand-written path would not.
 */
interface Props {
  /** Where it points in READING order. Mirrored automatically under RTL. */
  direction?: 'forward' | 'back';
  size?: number;
  color: string;
  strokeWidth?: number;
}

const PATHS = {
  forward: 'M9 5l7 7-7 7',
  back: 'M15 5l-7 7 7 7',
} as const;

export const Chevron: React.FC<Props> = ({
  direction = 'forward',
  size = 16,
  color,
  strokeWidth = 2,
}) => (
  <View style={I18nManager.isRTL ? styles.mirrored : null}>
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={PATHS[direction]}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  </View>
);

// Not a themed factory: direction is a device setting, not a palette, and this
// component renders on nearly every screen.
const styles = StyleSheet.create({
  mirrored: { transform: [{ scaleX: -1 }] },
});
