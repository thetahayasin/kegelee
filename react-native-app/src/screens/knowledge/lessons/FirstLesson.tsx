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
import { COLORS } from '../../../theme/colors';
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

// Hoisted to module scope: defining this inside FirstLesson made React see a
// new component type on every render and remount the whole SVG subtree.
// It only reads module-level constants, so it lifts out cleanly.
const Ring = ({ offset }: { offset: number }) => (
  <Svg width={SIZE} height={SIZE} style={styles.ring} pointerEvents="none">
    <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={TRACK} />
    <Circle
      cx={SIZE / 2}
      cy={SIZE / 2}
      r={R}
      fill="none"
      stroke={COLORS.white}
      strokeWidth={TRACK}
      strokeLinecap="round"
      strokeDasharray={CIRC}
      strokeDashoffset={offset}
      transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
    />
  </Svg>
);

export const FirstLesson: React.FC<Props> = ({ step, onFinished }) => {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const [remaining, setRemaining] = useState(TREMBLING[0].seconds);
  const [playing, setPlaying] = useState(false);
  const [tried, setTried] = useState(false);

  const iRef = useRef(0);
  const remRef = useRef(TREMBLING[0].seconds);
  const loopRef = useRef(false);
  const timerRef = useRef<any>(null);
  const lastTickAtRef = useRef(0);

  const glowScale = useRef(new Animated.Value(0.58)).current;
  const glowOpacity = useRef(new Animated.Value(0.08)).current;

  const stop = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPlaying(false);
  };

  const play = (loop: boolean) => {
    stop();
    loopRef.current = loop;
    iRef.current = 0;
    remRef.current = TREMBLING[0].seconds;
    setI(0);
    setRemaining(TREMBLING[0].seconds);
    setPlaying(true);
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
          } else {
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
      }
      setRemaining(Math.max(0, remRef.current));
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

  const ease = (t: number) => {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  };

  useEffect(() => {
    if (!playing) {
      Animated.parallel([
        Animated.timing(glowScale, { toValue: 0.58, duration: 150, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
      return;
    }

    const curStep = TREMBLING[i];
    if (!curStep) return;

    const total = curStep.seconds;
    const progress = Math.max(0, Math.min(1, (total - remaining) / Math.max(0.001, total)));

    let intensity = 0;
    if (curStep.phase === 'contract') {
      intensity = ease(progress);
    } else {
      intensity = 1 - ease(progress);
    }

    const targetScale = 0.58 + intensity * 0.42;
    const targetOpacity = 0.08 + intensity * 0.92;

    // 240ms eased pursuit (restarted every tick) so instant relax steps ease out
    // instead of snapping - same low-pass treatment as the workout screen glow.
    Animated.parallel([
      Animated.timing(glowScale, { toValue: targetScale, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: targetOpacity, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [remaining, playing, i, glowScale, glowOpacity]);

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

  let rawRem = remaining;
  for (let k = i + 1; k < TREMBLING.length; k++) {
    rawRem += TREMBLING[k].seconds;
  }
  const count = Math.max(0, Math.ceil(rawRem));
  const pct = TOTAL > 0 ? Math.min(1, Math.max(0, (TOTAL - rawRem) / TOTAL)) : 0;


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
            <Ring offset={CIRC * (1 - pct)} />
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
          <Ring offset={CIRC * (1 - pct)} />
          {!playing && !tried ? (
            <TouchableOpacity style={styles.startBtn} onPress={() => play(false)}>
              <Text style={styles.startBtnText}>{t('first.start')}</Text>
            </TouchableOpacity>
          ) : tried ? (
            <Svg width={80} height={80} viewBox="0 0 24 24" fill="none">
              <Path d="M5 13l4 4L19 7" stroke={COLORS.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
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

const styles = StyleSheet.create({
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
    borderColor: 'rgba(255,255,255,0.1)',
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
