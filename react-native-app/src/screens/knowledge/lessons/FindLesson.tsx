import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { COLORS, GLASS } from '../../../theme/colors';
import { LessonLine, LESSON_TEXT } from '../../../components/LessonLine';

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

export const FindLesson: React.FC<Props> = ({ step, onFinished }) => {
  const { t } = useTranslation();
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

  // Where the muscles are, then the rule that keeps the pee test safe. Both
  // are statements, so both are just read - the doing happens on step 2, which
  // is the one thing in this lesson worth demonstrating.
  if (step === 0) {
    return <LessonLine step={step} text={t('find.stopTheFlowBody')} />;
  }

  if (step === 1) {
    return <LessonLine step={step} text={t('find.onlyDoThePeeTestDesc')} />;
  }

  return (
    <View style={styles.center}>
      <Text style={styles.h1} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.3}>
        {doneHold ? t('find.youFoundThem') : t('find.tryItNow')}
      </Text>
      <Text style={styles.p} numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3}>
        {doneHold ? t('find.youFoundThemBody') : t('find.tryItNowBody')}
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
              <Text style={styles.holdLabel}>
                {holding ? t('find.squeezeNow') : t('find.pressAndHold')}
              </Text>
              {holding ? <Text style={styles.holdSub}>{t('find.keepGoing')}</Text> : null}
            </View>
          )}
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // One scale across all three lessons. 28px bold read as a slogan rather than
  // a heading, especially on the steps where the heading is most of the step.
  // Same scale as the text-only steps. This step still leads with a line of
  // text; it just has something to do underneath it.
  h1: { ...LESSON_TEXT, color: COLORS.white, textAlign: 'center' },
  // The instruction for the thing you are about to do, so it is read, not
  // skimmed. 16 under a 28px heading looked like fine print next to it.
  p: { marginTop: 14, fontSize: 19, lineHeight: 27, color: COLORS.textMuted, textAlign: 'center', maxWidth: 360 },
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
