import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { TouchableOpacity } from '../../../components/Touchable';
import { ContractGlow } from '../../../components/ContractGlow';
import { Palette, SPACE } from '../../../theme/colors';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';
import { LessonLine, LESSON_TEXT } from '../../../components/LessonLine';

interface Props {
  step: number;
  onFinished: () => void;
}

const GOAL = 3;

/**
 * The circle, and the room the whole assembly needs.
 *
 * 220 was a fixed number that happened to fit the phone it was written on. It
 * shares this screen with a sentence above it and a step row below, so on a
 * narrow or short phone it pushed into both - and once the halo arrived it did
 * so at 374pt wide regardless of what the layout had reserved.
 *
 * Sized from the window, and the FOOTPRINT below reserves the halo at its
 * largest - GLOW x the press scale - so nothing it draws can ever land on the
 * text. Capped as well as proportional: on a tablet a circle that keeps
 * growing stops reading as something you press with one thumb.
 */
const sizeFor = (w: number, h: number) => Math.round(Math.min(196, w * 0.46, h * 0.26));
/** Tighter than the session's 1.7 - see ContractGlow. */
const GLOW = 1.35;
/** The halo also scales to 1.15 while held; reserve for that too. */
const footprintFor = (size: number) => Math.round(size * GLOW * 1.15);

// Animating strokeDashoffset directly on the SVG circle, rather than feeding it
// from React state, is what makes the ring sweep smoothly.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const FindLesson: React.FC<Props> = ({ step, onFinished }) => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { t } = useTranslation();
  const { width: winW, height: winH } = useWindowDimensions();
  const SIZE = sizeFor(winW, winH);
  const FOOTPRINT = footprintFor(SIZE);
  const R = (SIZE - 16) / 2;
  const CIRC = 2 * Math.PI * R;
  const [holding, setHolding] = useState(false);
  const [doneHold, setDoneHold] = useState(false);
  /**
   * The way past this step for anyone who cannot complete the hold.
   *
   * A three-second press was the ONLY exit: the lesson would not finish
   * without it, and there is no keyboard, switch-control or voice equivalent
   * of holding a finger down for three seconds. It also assumes the reader can
   * do the thing the lesson is teaching them to do, which is the one
   * assumption a lesson may not make. It appears after 8 seconds on the step,
   * which is long enough that anyone who is simply about to press it is not
   * offered a way out of their own success.
   */
  const [showSkip, setShowSkip] = useState(false);
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

  useEffect(() => {
    if (step !== 2 || doneHold) {
      setShowSkip(false);
      return;
    }
    const timer = setTimeout(() => setShowSkip(true), 8000);
    return () => clearTimeout(timer);
  }, [step, doneHold]);

  const skipHold = () => {
    setShowSkip(false);
    setDoneHold(true);
    onFinished();
  };

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
      {/* One line, same white and same size as every other slide. This step
          used to stack a short label over a smaller muted paragraph, so the
          lesson changed typeface halfway through depending on whether the step
          had something to do. The label was a caption for the sentence under
          it; the sentence says it. */}
      <Text
        style={styles.line}
        numberOfLines={5}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
        maxFontSizeMultiplier={1.3}
      >
        {doneHold ? t('find.youFoundThemBody') : t('find.tryItNowBody')}
      </Text>

      <Pressable
        onPressIn={startHold}
        onPressOut={stopHold}
        accessibilityRole="button"
        accessibilityLabel={t('find.pressAndHold')}
        accessibilityHint={t('find.holdA11yHint', { seconds: GOAL })}
        accessibilityState={{ selected: doneHold, busy: holding }}
        style={[styles.holdArea, { width: FOOTPRINT, height: FOOTPRINT }]}
      >
        {/* The same halo the session draws, not a flat disc.
            This was a solid circle of accent with a border radius, which has
            a hard edge and reads as a coloured ring parked behind the button
            rather than as light coming off it. The session has always used a
            radial gradient; now they are the same component, so the lesson
            that teaches the movement looks like the screen that runs it. */}
        <Animated.View
          style={[styles.holdGlow, { opacity: glow, transform: [{ scale: glowScale }] }]}
          pointerEvents="none"
        >
          <ContractGlow size={SIZE} scale={GLOW} />
        </Animated.View>
        <View
          style={[
            styles.holdCircle,
            { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
            holding && { transform: [{ scale: 0.95 }] },
          ]}
        >
          <Svg width={SIZE} height={SIZE} style={styles.holdRing}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={COLORS.borderStrong} strokeWidth={8} />
            <AnimatedCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={COLORS.accentText}
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
              <Path d="M5 13l4 4L19 7" stroke={COLORS.accentText} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
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

      {showSkip ? (
        <TouchableOpacity
          style={styles.skipBtn}
          accessibilityRole="button"
          onPress={skipHold}
        >
          <Text style={styles.skipText}>{t('basics.skipStep')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // The one text style on this screen, identical to the text-only slides.
  line: {
    ...LESSON_TEXT,
    color: COLORS.white,
    textAlign: 'center',
    maxWidth: 360,
  },
  holdArea: {
    marginTop: SPACE.lg,
    // Width and height are applied inline from the live window.
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtn: {
    marginTop: SPACE.sm,
    minHeight: 44,
    paddingHorizontal: SPACE.lg,
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    textDecorationLine: 'underline',
  },
  // Just the positioner now - ContractGlow draws the halo itself, and
    // sizes itself from the circle it sits behind.
  holdGlow: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdCircle: {
    ...COLORS.glass,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdRing: { position: 'absolute' },
  // Inside the 250px hold circle, so it cannot take the slide's 28px - but it
  // was small enough to read as secondary next to it. Raised, and the sub-line
  // is white rather than muted grey.
  holdLabel: { fontSize: 22, fontWeight: 'bold', color: COLORS.white },
  holdSub: { marginTop: 6, fontSize: 16, fontWeight: '600', color: COLORS.white, opacity: 0.75 },
});
