import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Animated, StyleSheet, Easing } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { COLORS } from '../theme/colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const ACCENT = COLORS.accent;
const TRACK = 'rgba(255,255,255,0.10)';

/**
 * Onboarding art, built out of the app's OWN training circle.
 *
 * Every slide animates the same ring the user will spend every session looking
 * at, in a state that argues that slide's point: one that cannot hold, one that
 * fills in a single minute, one whose hold time climbs, one that recurs daily.
 * The previous set - a heart, a stopwatch, a bar chart, a calendar - was stock
 * onboarding art that taught nothing about the product. This teaches the core
 * interaction before the user ever reaches it.
 *
 * strokeDashoffset is an SVG attribute, so the native driver cannot carry it.
 * That is the same trade the live workout ring makes, and at one ring per
 * screen it is not a cost worth chasing.
 */

const BOX = 300;
const RING = 216;
const R = 96;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * R;

let _glowId = 0;

const Glow = () => {
  const [id] = useState(() => `obGlow${++_glowId}`);
  return (
    <Svg width={BOX} height={BOX} style={styles.glow} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={ACCENT} stopOpacity="0.16" />
          <Stop offset="55%" stopColor={ACCENT} stopOpacity="0.05" />
          <Stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={BOX / 2} cy={BOX / 2} r={BOX / 2} fill={`url(#${id})`} />
    </Svg>
  );
};

/** The shared ring. `pct` drives the sweep; children sit in the middle. */
const Ring: React.FC<{
  pct: Animated.Value;
  children?: React.ReactNode;
}> = ({ pct, children }) => (
  <View style={styles.ringWrap}>
    <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
      <Circle
        cx={RING / 2}
        cy={RING / 2}
        r={R}
        fill="none"
        stroke={TRACK}
        strokeWidth={STROKE}
      />
      <AnimatedCircle
        cx={RING / 2}
        cy={RING / 2}
        r={R}
        fill="none"
        stroke={ACCENT}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        strokeDashoffset={pct.interpolate({
          inputRange: [0, 1],
          outputRange: [CIRCUMFERENCE, 0],
        })}
        origin={`${RING / 2}, ${RING / 2}`}
        rotation={-90}
      />
    </Svg>
    <View style={styles.ringCenter} pointerEvents="none">
      {children}
    </View>
  </View>
);

/** Run a looping sequence only while the slide is on screen. */
const useLoop = (active: boolean, build: () => Animated.CompositeAnimation) => {
  useEffect(() => {
    if (!active) return;
    const anim = Animated.loop(build());
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
};

interface VisualProps {
  active: boolean;
}

/* ------------------------------------------------------------------ slide 1
 * "Leaks. Urgency. Less control."
 * A ring that climbs, wavers, and gives out before it gets anywhere: a muscle
 * that cannot hold. It never completes, which is the whole point.
 */
export const FalteringVisual: React.FC<VisualProps> = ({ active }) => {
  const pct = useRef(new Animated.Value(0)).current;
  const dim = useRef(new Animated.Value(0.35)).current;

  useLoop(active, () =>
    Animated.sequence([
      Animated.parallel([
        Animated.timing(pct, {
          toValue: 0.58,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(dim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
      // The waver: it is trying to hold, and losing a little each time.
      Animated.timing(pct, { toValue: 0.52, duration: 260, useNativeDriver: false }),
      Animated.timing(pct, { toValue: 0.56, duration: 220, useNativeDriver: false }),
      Animated.timing(pct, { toValue: 0.44, duration: 300, useNativeDriver: false }),
      Animated.timing(pct, { toValue: 0.48, duration: 200, useNativeDriver: false }),
      // Gives out.
      Animated.parallel([
        Animated.timing(pct, {
          toValue: 0,
          duration: 420,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(dim, { toValue: 0.35, duration: 420, useNativeDriver: true }),
      ]),
      Animated.delay(500),
    ]),
  );

  const barScale = pct.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });

  return (
    <View style={styles.container}>
      <Glow />
      <Ring pct={pct}>
        <Animated.View
          style={[styles.holdBar, { opacity: dim, transform: [{ scaleY: barScale }] }]}
        />
      </Ring>
    </View>
  );
};

/* ------------------------------------------------------------------ slide 2
 * "One minute, sitting still"
 * One clean fill with the clock running down beside it. The ask is small, and
 * the ring shows exactly how small.
 */
export const OneMinuteVisual: React.FC<VisualProps> = ({ active }) => {
  const { t } = useTranslation();
  const pct = useRef(new Animated.Value(0)).current;
  const [secondsLeft, setSecondsLeft] = useState(60);

  useEffect(() => {
    if (!active) return;
    // Drive the label off the same value as the sweep so they cannot drift.
    const id = pct.addListener(({ value }) => {
      const next = Math.max(0, Math.round(60 - value * 60));
      setSecondsLeft((prev) => (prev === next ? prev : next));
    });
    return () => pct.removeListener(id);
  }, [active, pct]);

  useLoop(active, () =>
    Animated.sequence([
      Animated.timing(pct, {
        toValue: 1,
        duration: 2600,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.delay(700),
      Animated.timing(pct, { toValue: 0, duration: 400, useNativeDriver: false }),
      Animated.delay(300),
    ]),
  );

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <View style={styles.container}>
      <Glow />
      <Ring pct={pct}>
        <Text style={styles.bigNumber}>{`${mm}:${ss}`}</Text>
        <Text style={styles.caption}>{t('onboarding.perDay')}</Text>
      </Ring>
    </View>
  );
};

/* ------------------------------------------------------------------ slide 3
 * "You feel it before you see it"
 * The same ring, session after session, holding longer each time. The climbing
 * number is the app's real measurement, not a decorative counter.
 */
const HOLDS = [3, 6, 11, 18];

export const GrowingHoldVisual: React.FC<VisualProps> = ({ active }) => {
  const { t } = useTranslation();
  const pct = useRef(new Animated.Value(0)).current;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) {
      setStep(0);
      return;
    }
    let cancelled = false;
    let i = 0;
    const advance = () => {
      if (cancelled) return;
      setStep(i % HOLDS.length);
      Animated.sequence([
        Animated.timing(pct, {
          toValue: (HOLDS[i % HOLDS.length] / HOLDS[HOLDS.length - 1]) * 0.95,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.delay(650),
        Animated.timing(pct, { toValue: 0, duration: 320, useNativeDriver: false }),
      ]).start(({ finished }) => {
        if (!finished || cancelled) return;
        i += 1;
        advance();
      });
    };
    advance();
    return () => {
      cancelled = true;
      pct.stopAnimation();
    };
  }, [active, pct]);

  return (
    <View style={styles.container}>
      <Glow />
      <Ring pct={pct}>
        <Text style={styles.bigNumber}>{HOLDS[step]}</Text>
        <Text style={styles.caption}>{t('onboarding.secondsHeld')}</Text>
      </Ring>
      <View style={styles.pipRow}>
        {HOLDS.map((_, i) => (
          <View key={i} style={[styles.pip, i <= step && styles.pipOn]} />
        ))}
      </View>
    </View>
  );
};

/* ------------------------------------------------------------------ slide 4
 * "It only works if you keep going"
 * The ring completing once a day across a week, then the row emptying and
 * starting over. The copy's argument, shown rather than stated.
 */
export const RhythmVisual: React.FC<VisualProps> = ({ active }) => {
  const pct = useRef(new Animated.Value(0)).current;
  const [day, setDay] = useState(-1);

  useEffect(() => {
    if (!active) {
      setDay(-1);
      return;
    }
    let cancelled = false;
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      Animated.sequence([
        Animated.timing(pct, {
          toValue: 1,
          duration: 620,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.delay(260),
        Animated.timing(pct, { toValue: 0, duration: 240, useNativeDriver: false }),
      ]).start(({ finished }) => {
        if (!finished || cancelled) return;
        i += 1;
        if (i >= 7) {
          i = 0;
          setDay(-1);
        } else {
          setDay(i);
        }
        tick();
      });
    };
    setDay(0);
    tick();
    return () => {
      cancelled = true;
      pct.stopAnimation();
    };
  }, [active, pct]);

  return (
    <View style={styles.container}>
      <Glow />
      <Ring pct={pct} />
      <View style={styles.weekRow}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={[styles.dayDot, i <= day && styles.dayDotOn]} />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: BOX,
    height: BOX,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glow: { position: 'absolute' },
  ringWrap: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigNumber: {
    color: COLORS.white,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1,
  },
  caption: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  // Slide 1: rises with the ring, collapses when it gives out.
  holdBar: {
    width: 10,
    height: 92,
    borderRadius: 5,
    backgroundColor: ACCENT,
  },
  pipRow: {
    position: 'absolute',
    bottom: 18,
    flexDirection: 'row',
    gap: 8,
  },
  pip: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: TRACK,
  },
  pipOn: { backgroundColor: ACCENT },
  weekRow: {
    position: 'absolute',
    bottom: 18,
    flexDirection: 'row',
    gap: 10,
  },
  dayDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: TRACK,
  },
  dayDotOn: { backgroundColor: ACCENT },
});
