import React from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect, Text } from 'react-native-svg';
import { COLORS } from '../theme/colors';

/**
 * Giant faint vertical "KEGELEE" behind the content, hugging the left edge -
 * the RN equivalent of the web .app-watermark (writing-mode vertical, opacity
 * 0.06). Rotating the whole word 90deg reproduces the sideways-stacked letters.
 * Plus, the top and bottom radial gradient glows (flares) matching NativePHP/web.
 * Purely decorative and non-interactive; sits behind all cards.
 */

const { width, height } = Dimensions.get('window');
const FONT = Math.round(height * 0.215);
const systemFont = Platform.OS === 'android' ? 'sans-serif-black' : 'System';

// Memoized: it takes no props and is rendered on every screen, so parent
// re-renders should never re-reconcile this full-screen SVG.
export const Watermark = React.memo(() => (
  <View style={styles.wrap} pointerEvents="none">
    <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
      <Defs>
        {/* Top Glow: radial-gradient flare using the lime accent */}
        <RadialGradient
          id="topGlow"
          cx={width * 0.5}
          cy={-height * 0.05}
          r={width * 1.1}
          fx={width * 0.5}
          fy={-height * 0.05}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.16} />
          <Stop offset="50%" stopColor={COLORS.accent} stopOpacity={0.06} />
          <Stop offset="100%" stopColor={COLORS.accent} stopOpacity={0} />
        </RadialGradient>

        {/* Bottom Glow: radial-gradient flare using the lime accent */}
        <RadialGradient
          id="bottomGlow"
          cx={width * 0.5}
          cy={height * 1.05}
          r={width * 0.9}
          fx={width * 0.5}
          fy={height * 1.05}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.10} />
          <Stop offset="50%" stopColor={COLORS.accent} stopOpacity={0.04} />
          <Stop offset="100%" stopColor={COLORS.accent} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {/* Solid base background */}
      <Rect width={width} height={height} fill={COLORS.bg} />

      {/* Glow layers - disabled to improve rendering performance and keep background solid */}
      {/* <Rect width={width} height={height} fill="url(#topGlow)" /> */}
      {/* <Rect width={width} height={height} fill="url(#bottomGlow)" /> */}

      {/* Giant vertical watermark text */}
      <Text
        fill={COLORS.accent}
        opacity={0.06}
        fontWeight="900"
        fontFamily={systemFont}
        fontSize={FONT}
        letterSpacing={-FONT * 0.06}
        x={FONT * 0.12}
        y={height * 0.5}
        textAnchor="middle"
        transform={`rotate(90, ${FONT * 0.12}, ${height * 0.5})`}
      >
        KEGELEE
      </Text>
    </Svg>
  </View>
));

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: 0,
    backgroundColor: COLORS.bg,
  },
});
