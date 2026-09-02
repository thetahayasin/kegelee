import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { TouchableOpacity } from '../../../components/Touchable';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { exerciseNameKey } from '../../../constants/catalogues';
import { Palette } from '../../../theme/colors';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';
import { LessonLine, LESSON_TEXT } from '../../../components/LessonLine';
import { getSteps } from '../../../constants/catalogues';

interface Props {
  step: number;
  onFinished: () => void;
}

const SIZE = 185;
const TRACK = 12;
const R = (SIZE - TRACK) / 2;
const CIRC = 2 * Math.PI * R;
const GLOW = Math.round(SIZE * 1.7);
const TREMBLING = getSteps('trembling', 10);
const TOTAL = TREMBLING.reduce((s, x) => s + x.seconds, 0);
/**
 * Seconds elapsed at the END of each segment.
 *
 * The ring is aimed at one of these per segment rather than recomputed from
 * whatever is left, so a slow frame cannot leave it short: every segment ends
 * on an exact fraction of the whole.
 */
const CUM = TREMBLING.reduce<number[]>((acc, x) => {
  acc.push((acc.length ? acc[acc.length - 1] : 0) + x.seconds);
  return acc;
}, []);

// Hoisted to module scope: defining this inside FirstLesson made React see a
// new component type on every render and remount the whole SVG subtree.
// It only reads module-level constants, so it lifts out cleanly.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const Ring = ({ offset }: { offset: Animated.AnimatedInterpolation<number> }) => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  return (
    <Svg width={SIZE} height={SIZE} style={styles.ring} pointerEvents="none">
      <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={COLORS.borderStrong} strokeWidth={TRACK} />
      {/* The accent, matching the session's ring - see WorkoutScreen. */}
      <AnimatedCircle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke={COLORS.accentText}
        strokeWidth={TRACK}
        strokeLinecap="round"
        strokeDasharray={CIRC}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
      />
    </Svg>
  );
};

export const FirstLesson: React.FC<Props> = ({ step, onFinished }) => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  // Whole seconds only. This is what the middle of the circle prints, and it
  // is the only reason the timer needs to touch React at all now.
  const [count, setCount] = useState(Math.ceil(TOTAL));
  const [playing, setPlaying] = useState(false);
  const [tried, setTried] = useState(false);

  const iRef = useRef(0);
  const remRef = useRef(TREMBLING[0].seconds);
  const loopRef = useRef(false);
  const timerRef = useRef<any>(null);
  const lastTickAtRef = useRef(0);
  const countRef = useRef(Math.ceil(TOTAL));

  /** 0..1 across the whole demo. Drives the ring. */
  const progress = useRef(new Animated.Value(0)).current;
  /** 0..1 within the current segment: 1 fully contracted. Drives the glow. */
  const intensity = useRef(new Animated.Value(0)).current;
  /** Fades the whole glow out when the demo is not running. */
  const active = useRef(new Animated.Value(0)).current;

  /**
   * Point the ring and the glow at where this segment ENDS, over exactly how
   * long the segment lasts.
   *
   * Called once per segment from the timer, so the two can never disagree
   * about which phase is showing, and nothing is recomputed per frame in JS -
   * Animated interpolates both.
   */
  const aimAtSegment = (k: number) => {
    const seg = TREMBLING[k];
    if (!seg) return;

    Animated.timing(progress, {
      toValue: TOTAL > 0 ? CUM[k] / TOTAL : 0,
      duration: seg.seconds * 1000,
      easing: Easing.linear,
      // strokeDashoffset is an SVG attribute; the native driver cannot carry
      // it. Animated still writes it every frame, which is the part that was
      // missing.
      useNativeDriver: false,
    }).start();

    Animated.timing(intensity, {
      toValue: seg.phase === 'contract' ? 1 : 0,
      duration: seg.seconds * 1000,
      // Smoothstep, the same shape the old per-tick `ease` applied, but now
      // spread across the segment instead of restarted twenty times inside it.
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const stop = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    progress.stopAnimation();
    intensity.stopAnimation();
    Animated.parallel([
      Animated.timing(intensity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(active, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start();
    setPlaying(false);
  };

  // Leaving the lesson while the demo is playing has to stop it. stop() only
  // runs on the pause control and at the end of a loop, so without this the
  // interval outlives the screen.
  useEffect(() => () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    progress.stopAnimation();
    intensity.stopAnimation();
    active.stopAnimation();
  }, [progress, intensity, active]);

  const play = (loop: boolean) => {
    stop();
    loopRef.current = loop;
    iRef.current = 0;
    remRef.current = TREMBLING[0].seconds;
    countRef.current = Math.ceil(TOTAL);
    setI(0);
    setCount(Math.ceil(TOTAL));
    setPlaying(true);

    progress.setValue(0);
    intensity.setValue(0);
    Animated.timing(active, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    aimAtSegment(0);

    lastTickAtRef.current = Date.now();
    timerRef.current = setInterval(() => {
      // Wall-clock step, matching the real session's timer.
      //
      // This subtracted a flat 0.05 per tick, which assumes setInterval fires
      // exactly every 50ms. It does not - it slips under JS-thread load - so
      // the demo's "ten seconds" took longer than ten real seconds and the
      // rhythm it taught was slower than the exercise it is teaching. The
      // workout screen hit this same bug and fixed it by measuring elapsed
      // time instead; the demo has to agree with the session, not approximate
      // it. Clamped at 250ms for the same reason: a GC pause or a backgrounded
      // app should cost one step, not skip half the demo.
      const now = Date.now();
      const dt = Math.min(0.25, Math.max(0, (now - lastTickAtRef.current) / 1000));
      lastTickAtRef.current = now;
      remRef.current = Math.max(0, remRef.current - dt);
      if (remRef.current <= 0.0001) {
        if (iRef.current >= TREMBLING.length - 1) {
          if (loopRef.current) {
            iRef.current = 0;
            remRef.current = TREMBLING[0].seconds;
            progress.setValue(0);
          } else {
            // Land the ring exactly full before stopping. stop() freezes the
            // animation wherever the last frame left it, which is a hair short
            // of the end and shows as a ring that never quite closes.
            progress.setValue(1);
            stop();
            setTried(true);
            onFinished();
            return;
          }
        } else {
          iRef.current += 1;
          remRef.current = TREMBLING[iRef.current].seconds;
        }
        setI(iRef.current);
        aimAtSegment(iRef.current);
      }

      // The ring and the glow are already moving on their own. All that is
      // left for React is the number in the middle, and only when it changes.
      let rawRem = Math.max(0, remRef.current);
      for (let k = iRef.current + 1; k < TREMBLING.length; k++) {
        rawRem += TREMBLING[k].seconds;
      }
      const next = Math.max(0, Math.ceil(rawRem));
      if (next !== countRef.current) {
        countRef.current = next;
        setCount(next);
      }
    }, 50);
  };

  useEffect(() => {
    if (step === 1) {
      play(true);
    } else {
      stop();
    }
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Fallback must carry a labelKey like a real segment: the circle renders
  // t(cur.labelKey), and a stray `label` here resolved to t(undefined).
  const cur = TREMBLING[i] || {
    phase: 'relax' as const,
    labelKey: 'catalogue.steps.relax',
    seconds: 1,
    from: 0,
    to: 0,
  };

  // Same numbers the per-tick pursuit aimed at, read straight off `intensity`
  // instead of recomputed in JS: 0.58..1 of scale, 0.08..1 of opacity, times
  // `active` so a stopped demo fades the halo out completely.
  const glowScale = intensity.interpolate({ inputRange: [0, 1], outputRange: [0.58, 1] });
  const glowOpacity = Animated.multiply(
    intensity.interpolate({ inputRange: [0, 1], outputRange: [0.08, 1] }),
    active,
  );

  const ringOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRC, 0],
  });

  const glowNode = (
    <Animated.View
      style={[
        styles.glow,
        {
          opacity: glowOpacity,
          transform: [{ scale: glowScale }],
        },
      ]}
      pointerEvents="none"
    >
      <Svg width={GLOW} height={GLOW}>
        <Defs>
          <RadialGradient id="contractGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="56%" stopColor={COLORS.accent} stopOpacity="0" />
            <Stop offset="66%" stopColor={COLORS.accent} stopOpacity="0.08" />
            <Stop offset="90%" stopColor={COLORS.accent} stopOpacity="0.42" />
            <Stop offset="100%" stopColor={COLORS.accent} stopOpacity="0.24" />
          </RadialGradient>
        </Defs>
        <Circle
          cx={GLOW / 2}
          cy={GLOW / 2}
          r={GLOW / 2}
          fill="url(#contractGlow)"
        />
      </Svg>
    </Animated.View>
  );



  // Step 0: static explainer circle
  // The instruction, read. Step 0 used to draw a STATIC circle frozen at 12 /
  // Contract with four sentences under it explaining what it would do - a
  // still picture of an animation the next step then plays for real. The
  // sentence does that job on its own, and the demo does the rest.
  if (step === 0) {
    return <LessonLine step={step} text={t('first.followTheCircle')} />;
  }

  // Step 1: live Trembling demo (looping). Circle sits ABOVE the copy so the
  // pulsing glow never overlaps the text.
  if (step === 1) {
    return (
      <View style={styles.center}>
        <View style={styles.circleWrapTop}>
          {glowNode}
          <View style={styles.circle}>
            <Ring offset={ringOffset} />
            <View style={styles.circleCenter}>
              <Text style={styles.count}>{count}</Text>
              <Text style={styles.label}>{t(cur.labelKey)}</Text>
            </View>
          </View>
        </View>
        <Text
          style={styles.line}
          numberOfLines={5}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
          maxFontSizeMultiplier={1.3}
        >
          {t('first.yourFirstExerciseQuickFlicks')}
        </Text>
      </View>
    );
  }

  // Step 2: guided try. Circle above the copy, same as step 1, so the glow has
  // clear space above it and never covers the instructions.
  return (
    <View style={styles.center}>
      <View style={styles.circleWrapTop}>
        {glowNode}
        <View style={styles.circle}>
          <Ring offset={ringOffset} />
          {!playing && !tried ? (
            <TouchableOpacity style={styles.startBtn} onPress={() => play(false)}>
              <Text style={styles.startBtnText}>{t('first.start')}</Text>
            </TouchableOpacity>
          ) : tried ? (
            <Svg width={80} height={80} viewBox="0 0 24 24" fill="none">
              <Path d="M5 13l4 4L19 7" stroke={COLORS.accentText} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          ) : (
            <View style={styles.circleCenter}>
              <Text style={styles.count}>{count}</Text>
              <Text style={styles.label}>{t(cur.labelKey)}</Text>
            </View>
          )}
        </View>
      </View>
      <Text
        style={styles.line}
        numberOfLines={5}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
        maxFontSizeMultiplier={1.3}
      >
        {tried
          ? t('first.thatWasARealExercise')
          : playing
          ? t('first.followTheCircle')
          : t('first.tenSecondsReady', {
              exercise: t(exerciseNameKey('trembling')),
              contract: t('catalogue.steps.contract'),
              relax: t('catalogue.steps.relax'),
            })}
      </Text>
    </View>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // The one text style on this screen, identical to the text-only slides.
  line: {
    ...LESSON_TEXT,
    marginTop: 72,
    color: COLORS.white,
    textAlign: 'center',
    maxWidth: 360,
  },
  // Step 0 keeps the circle above the copy with a static (non-glowing) ring.
  // Pulse steps (1 & 2) put the circle up top; the glow radiates into the empty
  // space above it (below the step dots) rather than over the reading copy below.
  circleWrapTop: { marginTop: 24, width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    // Centre the oversized glow box on the circle (concentric) so its halo
    // radiates evenly instead of biasing toward a corner.
    top: (SIZE - GLOW) / 2,
    left: (SIZE - GLOW) / 2,
    width: GLOW,
    height: GLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { position: 'absolute' },
  circleCenter: { alignItems: 'center' },
  count: { fontSize: 54, fontWeight: 'bold', color: COLORS.white },
  label: { marginTop: 2, fontSize: 15, fontWeight: '600', color: COLORS.white },
  startBtn: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: { fontSize: 18, fontWeight: 'bold', color: COLORS.onAccent },
});
