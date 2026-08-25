import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Animated, StyleSheet, Easing } from 'react-native';
import Svg, { Path, Circle, Line, Defs, RadialGradient, Stop } from 'react-native-svg';
import { COLORS } from '../theme/colors';

const AnimatedPath = Animated.createAnimatedComponent(Path) as any;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Local aliases onto the shared palette. These used to be pinned hexes, so the
// onboarding art kept the pre-revamp surfaces after the theme moved.
const ACCENT = COLORS.accent;
const SURFACE = COLORS.surface;
const WHITE_MUTED = 'rgba(242, 245, 238, 0.22)';

// Soft accent halo (radial gradient fading to transparent). Replaces the old
// solid, hard-edged circle whose rim peeked out from behind the rectangular
// bar-chart card on the progress slide.
let _glowId = 0;
const Glow = () => {
  const [id] = useState(() => `obGlow${++_glowId}`);
  return (
    <Svg width={300} height={300} style={styles.glow} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={ACCENT} stopOpacity="0.16" />
          <Stop offset="55%" stopColor={ACCENT} stopOpacity="0.05" />
          <Stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={150} cy={150} r={150} fill={`url(#${id})`} />
    </Svg>
  );
};

interface VisualProps {
  active: boolean;
}

export const HeartVisual: React.FC<VisualProps> = ({ active }) => {
  const scale = useRef(new Animated.Value(0.15)).current;
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (!active) return;

    // Heart grow and then beat loop
    const animation = Animated.loop(
      Animated.sequence([
        // Grow Phase
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.0,
            duration: 1200,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1.0,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
        // Beat 1
        Animated.timing(scale, {
          toValue: 1.09,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.0,
          duration: 150,
          useNativeDriver: true,
        }),
        // Beat 2
        Animated.timing(scale, {
          toValue: 1.07,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.0,
          duration: 200,
          useNativeDriver: true,
        }),
        // Wait
        Animated.delay(1500),
        // Shrink
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 0.15,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.35,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [active, scale, opacity]);

  return (
    <View style={styles.container}>
      {/* Background radial glow */}
      <Glow />

      <View style={styles.circleContainer}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Svg viewBox="0 0 24 24" width={170} height={170}>
            {/* Outline Heart */}
            <Path
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              fill={WHITE_MUTED}
            />
            {/* Filling Heart */}
            <AnimatedPath
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              fill={ACCENT}
              style={{ opacity } as any}
            />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
};

export const StopwatchVisual: React.FC<VisualProps> = ({ active }) => {
  const { t } = useTranslation();
  const dialSweep = useRef(new Animated.Value(264)).current;
  const colonOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) return;

    // Stopwatch sweep loop
    const sweepAnim = Animated.loop(
      Animated.timing(dialSweep, {
        toValue: 0,
        duration: 3200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    // Colon blink loop
    const blinkAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(colonOpacity, { toValue: 0.2, duration: 500, useNativeDriver: true }),
        Animated.timing(colonOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );

    sweepAnim.start();
    blinkAnim.start();

    return () => {
      sweepAnim.stop();
      blinkAnim.stop();
    };
  }, [active, dialSweep, colonOpacity]);

  return (
    <View style={styles.container}>
      <Glow />

      {/* Crown */}
      <View style={styles.crownTop} />
      <View style={styles.crownRing} />

      <View style={styles.circleContainer}>
        {/* Stopwatch ticks */}
        <Svg viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
          {[...Array(12)].map((_, i) => {
            const isQuarter = i % 3 === 0;
            return (
              <Line
                key={i}
                x1="50"
                y1="8"
                x2="50"
                y2={isQuarter ? "16" : "12"}
                stroke="rgba(255, 255, 255, 0.2)"
                strokeWidth={isQuarter ? "3" : "1.5"}
                strokeLinecap="round"
                transform={`rotate(${i * 30} 50 50)`}
              />
            );
          })}
        </Svg>

        {/* Sweeping dial track */}
        <Svg viewBox="0 0 100 100" style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}>
          <Circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <AnimatedCircle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={ACCENT}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray="251.2" // 2 * PI * r (r=40 -> 251.2)
            strokeDashoffset={dialSweep.interpolate({
              inputRange: [0, 264],
              outputRange: [0, 251.2],
            })}
          />
        </Svg>

        {/* Text readout */}
        <View style={styles.stopwatchText}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Animated.Text style={styles.stopwatchNum}>1</Animated.Text>
            <Animated.Text style={[styles.stopwatchNum, { opacity: colonOpacity }]}>:</Animated.Text>
            <Animated.Text style={styles.stopwatchNum}>00</Animated.Text>
          </View>
          <Animated.Text style={styles.stopwatchLabel}>{t('onboarding.perDay')}</Animated.Text>
        </View>
      </View>
    </View>
  );
};

export const ProgressVisual: React.FC<VisualProps> = ({ active }) => {
  const bar1 = useRef(new Animated.Value(0.12)).current;
  const bar2 = useRef(new Animated.Value(0.12)).current;
  const bar3 = useRef(new Animated.Value(0.12)).current;
  const bar4 = useRef(new Animated.Value(0.12)).current;
  const starScale = useRef(new Animated.Value(0)).current;
  const starRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;

    const createBarAnim = (val: Animated.Value, delay: number, target: number) => {
      return Animated.sequence([
        Animated.delay(delay),
        Animated.timing(val, {
          toValue: target,
          duration: 800,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
      ]);
    };

    const loop = Animated.loop(
      Animated.sequence([
        // Reset state
        Animated.parallel([
          Animated.timing(bar1, { toValue: 0.12, duration: 0, useNativeDriver: true }),
          Animated.timing(bar2, { toValue: 0.12, duration: 0, useNativeDriver: true }),
          Animated.timing(bar3, { toValue: 0.12, duration: 0, useNativeDriver: true }),
          Animated.timing(bar4, { toValue: 0.12, duration: 0, useNativeDriver: true }),
          Animated.timing(starScale, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(starRotate, { toValue: -30, duration: 0, useNativeDriver: true }),
        ]),
        // Climb bars sequentially
        Animated.parallel([
          createBarAnim(bar1, 0, 0.36),
          createBarAnim(bar2, 350, 0.58),
          createBarAnim(bar3, 700, 0.79),
          createBarAnim(bar4, 1050, 1.0),
        ]),
        // Star Pop
        Animated.parallel([
          Animated.timing(starScale, {
            toValue: 1,
            duration: 400,
            easing: Easing.back(1.5),
            useNativeDriver: true,
          }),
          Animated.timing(starRotate, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        // Keep active
        Animated.delay(1800),
        // Collapse
        Animated.parallel([
          Animated.timing(bar1, { toValue: 0.12, duration: 400, useNativeDriver: true }),
          Animated.timing(bar2, { toValue: 0.12, duration: 400, useNativeDriver: true }),
          Animated.timing(bar3, { toValue: 0.12, duration: 400, useNativeDriver: true }),
          Animated.timing(bar4, { toValue: 0.12, duration: 400, useNativeDriver: true }),
          Animated.timing(starScale, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [active, bar1, bar2, bar3, bar4, starScale, starRotate]);

  return (
    <View style={styles.container}>
      <Glow />

      <View style={styles.cardContainer}>
        {/* Star Pop */}
        <Animated.View
          style={[
            styles.starContainer,
            {
              transform: [
                { scale: starScale },
                {
                  rotate: starRotate.interpolate({
                    inputRange: [-30, 20],
                    outputRange: ['-30deg', '20deg'],
                  }),
                },
              ],
            },
          ]}
        >
          <Svg viewBox="0 0 24 24" style={styles.svg}>
            <Path
              d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
              fill={ACCENT}
            />
          </Svg>
        </Animated.View>

        {/* Stair Bars */}
        <View style={styles.barWrapper}>
          <Animated.View style={[styles.bar, { transform: [{ scaleY: bar1 }] }]} />
          <Animated.View style={[styles.bar, { transform: [{ scaleY: bar2 }] }]} />
          <Animated.View style={[styles.bar, { transform: [{ scaleY: bar3 }] }]} />
          <Animated.View style={[styles.bar, { transform: [{ scaleY: bar4 }] }]} />
        </View>
      </View>
    </View>
  );
};

export const HabitVisual: React.FC<VisualProps> = ({ active }) => {
  const bellRotate = useRef(new Animated.Value(0)).current;
  const waveScale = useRef(new Animated.Value(0.75)).current;
  const waveOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;

    // Bell swing loop
    const swingAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(bellRotate, { toValue: 14, duration: 300, easing: Easing.sin, useNativeDriver: true }),
        Animated.timing(bellRotate, { toValue: -12, duration: 400, easing: Easing.sin, useNativeDriver: true }),
        Animated.timing(bellRotate, { toValue: 8, duration: 400, easing: Easing.sin, useNativeDriver: true }),
        Animated.timing(bellRotate, { toValue: -4, duration: 400, easing: Easing.sin, useNativeDriver: true }),
        Animated.timing(bellRotate, { toValue: 2, duration: 350, easing: Easing.sin, useNativeDriver: true }),
        Animated.timing(bellRotate, { toValue: 0, duration: 250, easing: Easing.sin, useNativeDriver: true }),
        Animated.delay(1000),
      ])
    );

    // Wave ripples loop
    const rippleAnim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(waveScale, { toValue: 1.25, duration: 1500, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(waveOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(waveOpacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
          ]),
        ]),
        Animated.delay(600),
      ])
    );

    swingAnim.start();
    rippleAnim.start();

    return () => {
      swingAnim.stop();
      rippleAnim.stop();
    };
  }, [active, bellRotate, waveScale, waveOpacity]);

  return (
    <View style={styles.container}>
      <Glow />

      <View style={styles.circleContainer}>
        {/* Waves left */}
        <Animated.View
          style={[
            styles.waveLeft,
            {
              opacity: waveOpacity,
              transform: [{ scale: waveScale }],
            },
          ]}
        >
          <Svg viewBox="0 0 24 24" style={styles.svg}>
            <Path
              d="M8 6a12 12 0 0 0 0 12M12.5 8.5a8 8 0 0 0 0 7"
              stroke={ACCENT}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Animated.View>

        {/* Waves right */}
        <Animated.View
          style={[
            styles.waveRight,
            {
              opacity: waveOpacity,
              transform: [{ scale: waveScale }],
            },
          ]}
        >
          <Svg viewBox="0 0 24 24" style={styles.svg}>
            <Path
              d="M8 6a12 12 0 0 0 0 12M12.5 8.5a8 8 0 0 0 0 7"
              stroke={ACCENT}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Animated.View>

        {/* Swinging Bell */}
        <Animated.View
          style={[
            styles.bell,
            {
              transform: [
                {
                  rotate: bellRotate.interpolate({
                    inputRange: [-180, 180],
                    outputRange: ['-180deg', '180deg'],
                  }),
                },
              ],
            },
          ]}
        >
          <Svg viewBox="0 0 24 24" style={styles.svg}>
            <Path
              d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
              fill={ACCENT}
            />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 300,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
  },
  circleContainer: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 4,
    borderColor: 'rgba(193, 255, 114, 0.4)',
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  cardContainer: {
    width: 250,
    height: 220,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: SURFACE,
    padding: 16,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  svg: {
    width: '100%',
    height: '100%',
  },
  crownTop: {
    position: 'absolute',
    top: 15,
    width: 32,
    height: 12,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: ACCENT,
    zIndex: 1,
  },
  crownRing: {
    position: 'absolute',
    top: 23,
    width: 44,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(193, 255, 114, 0.7)',
    zIndex: 1,
  },
  stopwatchText: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  stopwatchNum: {
    fontFamily: 'Courier',
    fontSize: 40,
    fontWeight: 'bold',
    color: ACCENT,
  },
  stopwatchLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: WHITE_MUTED,
    letterSpacing: 2,
    marginTop: 4,
  },
  starContainer: {
    position: 'absolute',
    top: 16,
    end: 16,
    width: 40,
    height: 40,
  },
  barWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 100,
  },
  bar: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: ACCENT,
    height: '100%',
    transformOrigin: 'bottom',
  } as any,
  bell: {
    width: 90,
    height: 90,
    transformOrigin: 'top center',
  } as any,
  waveLeft: {
    position: 'absolute',
    start: 10,
    top: '35%',
    width: 44,
    height: 44,
  },
  waveRight: {
    position: 'absolute',
    end: 10,
    top: '35%',
    width: 44,
    height: 44,
    transform: [{ scaleX: -1 }],
  },
});
