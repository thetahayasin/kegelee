import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { COLORS, GLASS } from '../../../theme/colors';
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

export const FirstLesson: React.FC<Props> = ({ step, onFinished }) => {
  const [i, setI] = useState(0);
  const [remaining, setRemaining] = useState(TREMBLING[0].seconds);
  const [playing, setPlaying] = useState(false);
  const [tried, setTried] = useState(false);

  const iRef = useRef(0);
  const remRef = useRef(TREMBLING[0].seconds);
  const loopRef = useRef(false);
  const timerRef = useRef<any>(null);

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
    timerRef.current = setInterval(() => {
      remRef.current -= 0.05;
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

  const cur = TREMBLING[i] || { label: 'Relax', seconds: 1, from: 0, to: 0 };

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
    if (curStep.label === 'Contract') {
      intensity = ease(progress);
    } else {
      intensity = 1 - ease(progress);
    }

    const targetScale = 0.58 + intensity * 0.42;
    const targetOpacity = 0.08 + intensity * 0.92;

    Animated.parallel([
      Animated.timing(glowScale, { toValue: targetScale, duration: 50, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: targetOpacity, duration: 50, useNativeDriver: true }),
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

  // Step 0: static explainer circle
  if (step === 0) {
    return (
      <View style={styles.center}>
        <View style={styles.circleWrap}>
          <View style={styles.circle}>
            <Ring offset={CIRC * 0.35} />
            <View style={styles.circleCenter}>
              <Text style={styles.count}>12</Text>
              <Text style={styles.label}>Contract</Text>
            </View>
          </View>
        </View>
        <Text style={styles.h1}>The circle is your guide</Text>
        <Text style={styles.p}>
          Every exercise follows this circle. When it glows and swells, squeeze. When the glow fades,
          relax. The word inside always tells you what to do.
        </Text>
      </View>
    );
  }

  // Step 1: live Trembling demo (looping)
  if (step === 1) {
    return (
      <View style={styles.center}>
        <Text style={styles.h1}>This is Trembling</Text>
        <Text style={styles.p}>
          Your first exercise: quick flicks. Squeeze on Contract, let go on Relax.
        </Text>
        <View style={styles.circleWrap}>
          {glowNode}
          <View style={styles.circle}>
            <Ring offset={CIRC * (1 - pct)} />
            <View style={styles.circleCenter}>
              <Text style={styles.count}>{count}</Text>
              <Text style={styles.label}>{cur.label}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Step 2: guided try
  return (
    <View style={styles.center}>
      <Text style={styles.h1}>{tried ? 'Nice work!' : 'Now you try'}</Text>
      <Text style={styles.p}>
        {tried
          ? 'That was a real exercise. Every session works exactly like this, one circle at a time.'
          : playing
          ? 'Follow the circle. Squeeze... and relax.'
          : 'Ten seconds of Trembling. Squeeze on every Contract, let go on Relax. Ready?'}
      </Text>
      <View style={styles.circleWrap}>
        {glowNode}
        <View style={styles.circle}>
          <Ring offset={CIRC * (1 - pct)} />
          {!playing && !tried ? (
            <TouchableOpacity style={styles.startBtn} onPress={() => play(false)}>
              <Text style={styles.startBtnText}>Start</Text>
            </TouchableOpacity>
          ) : tried ? (
            <Svg width={80} height={80} viewBox="0 0 24 24" fill="none">
              <Path d="M5 13l4 4L19 7" stroke={COLORS.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          ) : (
            <View style={styles.circleCenter}>
              <Text style={styles.count}>{count}</Text>
              <Text style={styles.label}>{cur.label}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { marginTop: 24, fontSize: 28, fontWeight: 'bold', color: COLORS.white, textAlign: 'center', lineHeight: 34 },
  p: { marginTop: 12, fontSize: 16, lineHeight: 24, color: COLORS.textMuted, textAlign: 'center', maxWidth: 360 },
  // Extra top margin so the glow halo clears the copy above it instead of
  // bleeding over the last line of text.
  circleWrap: { marginTop: 60, width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
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
