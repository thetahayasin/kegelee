import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { COLORS, GLASS } from '../../../theme/colors';

interface Props {
  step: number;
  onFinished: () => void;
}

const GOAL = 3;
const SIZE = 220;
const R = (SIZE - 16) / 2;
const CIRC = 2 * Math.PI * R;

// Animating strokeDashoffset directly on the SVG circle, rather than feeding it
// from React state, is what makes the ring sweep smoothly.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const FLOW = [
  { icon: 'M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z', label: 'You pee' },
  { icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4 13H8V9h8v6z', label: 'Stop midway' },
  { icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z', label: 'That squeeze!' },
];

export const FindLesson: React.FC<Props> = ({ step, onFinished }) => {
  const [holding, setHolding] = useState(false);
  const [doneHold, setDoneHold] = useState(false);
  // Hold progress as 0..1. Previously this was React state ticked by a 100ms
  // setInterval, so the ring only moved 10 times a second - one visible jump
  // every 6 frames at 60Hz, which is the stepping this replaces. An
  // Animated.Value interpolates every frame and writes the prop directly,
  // without re-rendering the component 30 times per hold.
  const progress = useRef(new Animated.Value(0)).current;
  // Mirrors `progress` so a released-and-resumed hold continues from where it
  // stopped instead of restarting, matching the previous behaviour.
  const progressRef = useRef(0);
  const glow = useRef(new Animated.Value(0.25)).current;
  const glowScale = useRef(new Animated.Value(0.9)).current;

  const stopHold = () => {
    setHolding(false);
    progress.stopAnimation((value) => {
      progressRef.current = value;
    });
  };

  const startHold = () => {
    if (doneHold) {
      return;
    }
    setHolding(true);
    Animated.timing(progress, {
      toValue: 1,
      // Only the time still owed, so resuming a partial hold does not restart.
      duration: Math.max(0, GOAL * 1000 * (1 - progressRef.current)),
      easing: Easing.linear,
      // strokeDashoffset is an SVG attribute, not a transform or opacity, so
      // the native driver cannot carry it. Animated still drives it per frame,
      // which is the fix; the old code was frame-starved, not thread-starved.
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }
      progressRef.current = 1;
      setHolding(false);
      setDoneHold(true);
      onFinished();
    });
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(glow, { toValue: holding || doneHold ? 1 : 0.25, duration: 300, useNativeDriver: true }),
      Animated.timing(glowScale, { toValue: holding || doneHold ? 1.15 : 0.9, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [holding, doneHold, glow, glowScale]);

  // Stop the animation itself on unmount rather than calling stopHold, which
  // would also setState on an unmounted component. Depending only on the
  // Animated.Value keeps this effect stable across renders.
  useEffect(() => () => progress.stopAnimation(), [progress]);

  if (step === 0) {
    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>The easiest way to find them</Text>
        <Text style={styles.p}>
          Next time you pee, gently stop the flow midway. The muscles you just used are your pelvic floor.
        </Text>
        <View style={styles.flowRow}>
          {FLOW.map(f => (
            <View key={f.label} style={styles.flowCard}>
              <Svg width={40} height={40} viewBox="0 0 24 24" fill={COLORS.accent}>
                <Path d={f.icon} />
              </Svg>
              <Text style={styles.flowLabel}>{f.label}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.p}>That exact squeeze is the move you will train.</Text>
      </ScrollView>
    );
  }

  if (step === 1) {
    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Two quick rules</Text>
        <View style={{ gap: 12, marginTop: 22 }}>
          <View style={styles.ruleCard}>
            <View style={[styles.ruleIcon, { backgroundColor: 'rgba(255,77,77,0.15)' }]}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path d="M18 6L6 18M6 6l12 12" stroke={COLORS.danger} strokeWidth={2.5} strokeLinecap="round" />
              </Svg>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ruleTitle}>Only do the pee test once</Text>
              <Text style={styles.ruleDesc}>
                It is just a way to find the muscles, not an exercise. Stopping your pee often is not good
                for your bladder.
              </Text>
            </View>
          </View>
          <View style={styles.ruleCard}>
            <View style={[styles.ruleIcon, { backgroundColor: 'rgba(193,255,114,0.15)' }]}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path d="M5 13l4 4L19 7" stroke={COLORS.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ruleTitle}>Squeeze only those muscles</Text>
              <Text style={styles.ruleDesc}>
                Another cue: squeeze as if holding back gas. Your belly, legs and buttocks stay completely
                relaxed.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.center}>
      <Text style={styles.h1}>{doneHold ? 'You found them!' : 'Try it now'}</Text>
      <Text style={styles.p}>
        {doneHold
          ? 'That squeeze and release is all a Kegel is. You are ready for your first exercise.'
          : 'Press and hold the circle. While you hold it, squeeze those muscles. Let go together.'}
      </Text>

      <Pressable
        onPressIn={startHold}
        onPressOut={stopHold}
        style={styles.holdArea}
      >
        <Animated.View
          style={[styles.holdGlow, { opacity: glow, transform: [{ scale: glowScale }] }]}
        />
        <View style={[styles.holdCircle, holding && { transform: [{ scale: 0.95 }] }]}>
          <Svg width={SIZE} height={SIZE} style={styles.holdRing}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={8} />
            <AnimatedCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={COLORS.accent}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={progress.interpolate({
                inputRange: [0, 1],
                outputRange: [CIRC, 0],
              })}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </Svg>
          {doneHold ? (
            <Svg width={64} height={64} viewBox="0 0 24 24" fill="none">
              <Path d="M5 13l4 4L19 7" stroke={COLORS.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.holdLabel}>{holding ? 'Squeeze!' : 'Press & hold'}</Text>
              {holding ? <Text style={styles.holdSub}>Keep going...</Text> : null}
            </View>
          )}
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 12 },
  h1: { fontSize: 28, fontWeight: 'bold', color: COLORS.white, textAlign: 'center', lineHeight: 34 },
  p: { marginTop: 14, fontSize: 16, lineHeight: 24, color: COLORS.textMuted, textAlign: 'center', maxWidth: 360 },
  flowRow: { flexDirection: 'row', gap: 12, marginTop: 26 },
  flowCard: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    ...GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: COLORS.surface,
    paddingVertical: 20,
    paddingHorizontal: 6,
  },
  flowLabel: { marginTop: 12, fontSize: 14, fontWeight: 'bold', color: COLORS.white, textAlign: 'center' },
  ruleCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    borderRadius: 16,
    ...GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: COLORS.surface,
    padding: 18,
  },
  ruleIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ruleTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.white },
  ruleDesc: { marginTop: 4, fontSize: 14, lineHeight: 21, color: COLORS.textMuted },
  holdArea: { marginTop: 30, width: 250, height: 250, alignItems: 'center', justifyContent: 'center' },
  holdGlow: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(193,255,114,0.22)',
  },
  holdCircle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdRing: { position: 'absolute' },
  holdLabel: { fontSize: 18, fontWeight: 'bold', color: COLORS.white },
  holdSub: { marginTop: 4, fontSize: 12, color: COLORS.textMuted },
});
