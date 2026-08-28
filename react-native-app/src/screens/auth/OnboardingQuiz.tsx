import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  AccessibilityInfo,
  BackHandler,
  I18nManager,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import Svg, { Circle, Path } from 'react-native-svg';
import { COLORS, TYPE, SPACE, RADIUS, GLASS } from '../../theme/colors';
import { LEVELS, levelNameKey, levelDescriptionKey } from '../../constants/catalogues';

/**
 * Two questions and a measurement, ending on the reader's own numbers.
 *
 * A tap-through quiz was tried here before and removed, and the note left
 * behind says exactly why: it ended in a generated "plan" screen that read as
 * filler standing between the user and the product. That criticism was right,
 * and it is worth being precise about what is different now, because the shape
 * looks similar.
 *
 * The old version's payoff was fabricated - a plan assembled out of the
 * answers, which is a thing the app made up and the reader could tell. This
 * one ends on a number measured from their own body, live, in the seconds
 * before they see it. It cannot read as filler because nothing here was
 * invented: the hold is theirs, and the level it produces is the session
 * length they are actually about to train at - including the free session,
 * which now runs at it too.
 *
 * Everything here is optional. Skip lands on level 1 with no baseline, which
 * is exactly where every user landed before this screen existed, so refusing
 * to answer can never be worse than not being asked.
 */

export interface QuizResult {
  /** 1-5, matching LEVELS. Feeds level_id on the account. */
  level: number;
  /** Seconds held, to a tenth. 0 when skipped - never recorded as a measurement. */
  baselineSeconds: number;
  /**
   * The raw answers, carried so the backend can hold the whole picture
   * rather than only the level they produced. A level alone cannot tell you
   * whether someone was a beginner with ten minutes a day or a regular
   * trainer with two, and those are different people to sell to.
   */
  experience: number | null;
  dailyTime: number | null;
  /** They declined to answer, as distinct from answering the lowest option. */
  skipped: boolean;
}

interface Props {
  onDone: (result: QuizResult) => void;
}

type Phase = 'experience' | 'time' | 'measure' | 'building' | 'result';

const ORDER: Phase[] = ['experience', 'time', 'measure', 'building', 'result'];

/**
 * How long the building step holds before the result.
 *
 * Short on purpose. A progress bar that crawls for eight seconds pretending to
 * do arithmetic is the exact filler this screen was deleted for once before,
 * and people can tell. Two seconds reads as the app taking a breath, and gives
 * the two figures underneath a moment to land rather than appearing the
 * instant a finger lifts.
 */
const BUILD_MS = 2000;

/**
 * A hold has to be long enough to be a contraction and short enough to be one
 * attempt.
 *
 * Neither bound is cosmetic. This number becomes the account's permanent
 * baseline, and every later "you have improved" is measured against it - so a
 * stray 0.1s tap would both cap the starting level at 2 and make the day-seven
 * comparison meaninglessly flattering forever. A finger left resting on the
 * button records minutes and does the opposite.
 */
const MIN_HOLD_S = 1;
const MAX_HOLD_S = 60;

/** Points per answer. Both questions run 0..2, so the pair is 0..4. */
const EXPERIENCE_OPTIONS = [
  { key: 'never', labelKey: 'onboarding.quizExperienceNever', points: 0 },
  { key: 'some', labelKey: 'onboarding.quizExperienceSome', points: 1 },
  { key: 'regular', labelKey: 'onboarding.quizExperienceRegular', points: 2 },
] as const;

const TIME_OPTIONS = [
  { key: 'short', labelKey: 'onboarding.quizTimeShort', points: 0 },
  { key: 'medium', labelKey: 'onboarding.quizTimeMedium', points: 1 },
  { key: 'long', labelKey: 'onboarding.quizTimeLong', points: 2 },
] as const;

const MAX_LEVEL = Object.keys(LEVELS).length;

/**
 * Turn two answers and a hold into a starting level.
 *
 * The answers set the ambition and the hold sets the ceiling, in that order.
 * A level here IS a session length - 1 through 5 run 60s to 300s - so putting
 * someone who cannot hold a contraction for three seconds onto five-minute
 * sessions would not be encouraging, it would be a plan they fail on day one.
 * The measurement is the only honest input of the three, so it gets the final
 * say downwards, and only a modest one upwards.
 *
 * A hold of 0 means "not measured" (skipped), and applies no ceiling at all -
 * a missing measurement must not read as a failed one.
 */
export const levelFromQuiz = (points: number, holdSeconds: number): number => {
  let level = Math.min(MAX_LEVEL, Math.max(1, 1 + points));

  if (holdSeconds > 0) {
    if (holdSeconds >= 15) level += 1;
    if (holdSeconds < 6) level = Math.min(level, 3);
    if (holdSeconds < 3) level = Math.min(level, 2);
  }

  return Math.min(MAX_LEVEL, Math.max(1, level));
};

export const OnboardingQuiz: React.FC<Props> = ({ onDone }) => {
  const { t } = useTranslation();

  const [phase, setPhase] = useState<Phase>('experience');

  /**
   * The ANSWERS, not a running total.
   *
   * Points were accumulated with `setPoints(p => p + earned)`, which is only
   * correct in a flow nobody can walk backwards through. Back exists now, so a
   * total would double-count the moment someone changed their mind. Storing
   * what they chose also lets the buttons show which one is currently theirs.
   */
  const [experience, setExperience] = useState<number | null>(null);
  const [time, setTime] = useState<number | null>(null);

  // Hold measurement, same interaction as the Progress tab's.
  const [holding, setHolding] = useState(false);
  const [heldDone, setHeldDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(0);
  // Set when a hold was too short to count, so the instruction can say so
  // rather than the screen silently ignoring the attempt.
  const [holdTooShort, setHoldTooShort] = useState(false);

  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const buildProgress = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  // One mounted flag for every async hand-off on this screen. Both the phase
  // transition and the building timer resolve after an await, and a screen the
  // user backed out of must not still be setting state.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const goTo = useCallback(
    (next: Phase) => {
      AccessibilityInfo.isReduceMotionEnabled()
        .catch(() => false)
        .then((reduced) => {
          if (!mountedRef.current) return;
          if (reduced) {
            setPhase(next);
            return;
          }
          Animated.timing(fade, {
            toValue: 0,
            duration: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start(() => {
            if (!mountedRef.current) return;
            setPhase(next);
            Animated.timing(fade, {
              toValue: 1,
              duration: 180,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }).start();
          });
        });
    },
    [fade],
  );

  /**
   * Step back one question.
   *
   * Building and result both return to the measurement, because that is the
   * only step on either of them worth redoing - and returning INTO a two
   * second timer would just bounce the reader forward again.
   */
  const goBack = useCallback((): boolean => {
    if (phase === 'experience') return false;
    if (phase === 'building' || phase === 'result') {
      setHeldDone(true);
      goTo('measure');
      return true;
    }
    goTo(ORDER[Math.max(0, ORDER.indexOf(phase) - 1)]);
    return true;
  }, [phase, goTo]);

  // Android back walks the quiz rather than closing the app. Onboarding is the
  // stack root, so without this a mis-tap on Back at question two quits.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  }, [goBack]);

  // The building step runs itself and hands over to the result.
  useEffect(() => {
    if (phase !== 'building') return;
    buildProgress.setValue(0);
    Animated.timing(buildProgress, {
      toValue: 1,
      duration: BUILD_MS,
      easing: Easing.inOut(Easing.quad),
      // A width cannot run on the native driver.
      useNativeDriver: false,
    }).start();
    const timer = setTimeout(() => {
      if (mountedRef.current) goTo('result');
    }, BUILD_MS);
    return () => clearTimeout(timer);
  }, [phase, buildProgress, goTo]);

  const beginHold = () => {
    if (holding || heldDone) return;
    setHolding(true);
    setHoldTooShort(false);
    setElapsed(0);
    startRef.current = Date.now();
    Animated.timing(scaleAnim, {
      toValue: 1.08,
      duration: 150,
      useNativeDriver: true,
    }).start();
    timerRef.current = setInterval(() => {
      const secs = (Date.now() - startRef.current) / 1000;
      // Stop the clock at the cap rather than counting into the minutes; the
      // release below clamps to the same number.
      setElapsed(Math.min(secs, MAX_HOLD_S));
    }, 80);
  };

  const endHold = () => {
    if (!holding) return;
    setHolding(false);
    if (timerRef.current) clearInterval(timerRef.current);
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();

    const held = Math.min((Date.now() - startRef.current) / 1000, MAX_HOLD_S);
    if (held < MIN_HOLD_S) {
      // Too short to be a contraction. Say so and let them go again rather
      // than writing a stray tap into their record for good.
      setHoldTooShort(true);
      setElapsed(0);
      return;
    }
    // Stored to a tenth, and the result screen shows exactly this number - the
    // figure they are shown and the figure that is kept must be the same one.
    setResult(Math.round(held * 10) / 10);
    setHeldDone(true);
  };

  const retake = () => {
    setHeldDone(false);
    setHoldTooShort(false);
    setElapsed(0);
    setResult(0);
  };

  const answer = (which: 'experience' | 'time', points: number, next: Phase) => {
    if (which === 'experience') setExperience(points);
    else setTime(points);
    goTo(next);
  };

  const points = (experience ?? 0) + (time ?? 0);
  const level = levelFromQuiz(points, result);
  const shownSeconds = heldDone ? result : Math.round(elapsed * 10) / 10;
  const stepIndex = phase === 'experience' ? 0 : phase === 'time' ? 1 : phase === 'result' ? 3 : 2;

  const skip = () =>
    onDone({
      level: levelFromQuiz(points, 0),
      baselineSeconds: 0,
      experience,
      dailyTime: time,
      skipped: true,
    });

  const renderOptions = (
    promptKey: string,
    options: readonly { key: string; labelKey: string; points: number }[],
    which: 'experience' | 'time',
    chosen: number | null,
    next: Phase,
  ) => (
    <View style={styles.body}>
      <Text style={styles.prompt}>{t(promptKey)}</Text>
      <View style={styles.options}>
        {options.map((o) => {
          const selected = chosen === o.points;
          return (
            <TouchableOpacity
              key={o.key}
              style={[styles.option, selected && styles.optionSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => answer(which, o.points, next)}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {t(o.labelKey)}
              </Text>
              {/* Mirrored in RTL - a "go on" chevron pointing right in Arabic
                  points backwards. */}
              <Svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                style={I18nManager.isRTL ? styles.flip : undefined}
              >
                <Path
                  d="M9 6l6 6-6 6"
                  stroke={selected ? COLORS.accent : COLORS.textMuted}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.topSide}>
          {phase !== 'experience' && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel={t('subscribeSheet.back')}
            >
              <Svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                style={I18nManager.isRTL ? styles.flip : undefined}
              >
                <Path
                  d="M15 6l-6 6 6 6"
                  stroke={COLORS.textMuted}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </TouchableOpacity>
          )}
        </View>

        {/* Where they are, without a percentage nobody asked for. */}
        <View
          style={styles.steps}
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: 4, now: stepIndex + 1 }}
        >
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.step, i <= stepIndex && styles.stepOn]} />
          ))}
        </View>

        <View style={[styles.topSide, styles.topSideEnd]}>
          {phase !== 'result' && (
            <TouchableOpacity style={styles.skipBtn} onPress={skip} accessibilityRole="button">
              <Text style={styles.skipText}>{t('quiz.skip')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Animated.View style={[styles.phase, { opacity: fade }]}>
        {phase === 'experience' &&
          renderOptions(
            'onboarding.quizExperienceQ',
            EXPERIENCE_OPTIONS,
            'experience',
            experience,
            'time',
          )}

        {phase === 'time' &&
          renderOptions('onboarding.quizTimeQ', TIME_OPTIONS, 'time', time, 'measure')}

        {phase === 'measure' && (
          <View style={styles.body}>
            <Text style={styles.prompt}>{t('onboarding.baselineTitle')}</Text>
            <Text style={[styles.hint, holdTooShort && styles.hintAlert]}>
              {t('progress.holdTheButtonAndContract')}
            </Text>

            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.holdBtn, holding && styles.holdBtnActive]}
                onPressIn={beginHold}
                onPressOut={endHold}
                disabled={heldDone}
                accessibilityRole="button"
                accessibilityLabel={t('progress.pressAndHold')}
              >
                <Svg width={200} height={200} style={StyleSheet.absoluteFill}>
                  <Circle
                    cx={100}
                    cy={100}
                    r={94}
                    fill="none"
                    stroke={holding ? COLORS.accent : COLORS.borderStrong}
                    strokeWidth={3}
                  />
                </Svg>
                {holding || heldDone ? (
                  <Text style={styles.holdSeconds}>
                    {t('progress.seconds', { count: shownSeconds })}
                  </Text>
                ) : (
                  <Text style={styles.holdLabel}>{t('progress.pressAndHold')}</Text>
                )}
              </TouchableOpacity>
            </Animated.View>

            {heldDone && (
              <View style={styles.measureActions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={retake}>
                  <Text style={styles.secondaryText}>{t('progress.tryAgain')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => goTo('building')}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryText}>{t('progress.continue')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {phase === 'building' && (
          <View style={styles.body}>
            <Text style={styles.prompt} accessibilityLiveRegion="polite">
              {t('onboarding.buildingPlan')}
            </Text>
            <View style={styles.buildTrack}>
              <Animated.View
                style={[
                  styles.buildFill,
                  {
                    width: buildProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            {/* The thing it is actually working from, stated plainly. Naming a
                real input is what keeps this from being a spinner with a
                sentence over it. */}
            <Text style={styles.hint}>
              {t('progress.yourHold')} · {t('progress.seconds', { count: result })}
            </Text>
          </View>
        )}

        {phase === 'result' && (
          <View style={styles.body}>
            <Text style={styles.prompt}>{t('onboarding.resultTitle')}</Text>

            {/* Their numbers, neither of them invented. */}
            <View style={styles.resultCard}>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>{t('progress.yourHold')}</Text>
                <Text style={styles.resultValue}>
                  {t('progress.seconds', { count: result })}
                </Text>
              </View>
              <View style={styles.resultDivider} />
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>{t('onboarding.resultLevelLabel')}</Text>
                <Text style={[styles.resultValue, styles.resultValueAccent]}>
                  {t(levelNameKey(level))}
                </Text>
              </View>
              <Text style={styles.resultDescription}>{t(levelDescriptionKey(level))}</Text>
            </View>

            <Text style={styles.hint}>{t('onboarding.resultBody')}</Text>
          </View>
        )}
      </Animated.View>

      {phase === 'result' && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.primaryBtn}
            accessibilityRole="button"
            onPress={() =>
              onDone({
                level,
                baselineSeconds: result,
                experience,
                dailyTime: time,
                skipped: false,
              })
            }
          >
            <Text style={styles.primaryText}>{t('onboarding.getStarted')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  flip: { transform: [{ scaleX: -1 }] },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingTop: SPACE.lg,
    paddingHorizontal: SPACE.md,
  },
  topSide: { minWidth: 56, justifyContent: 'center' },
  topSideEnd: { alignItems: 'flex-end' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  skipBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACE.sm },
  skipText: { ...TYPE.bodySm, fontWeight: '600', color: COLORS.textMuted },

  steps: { flex: 1, flexDirection: 'row', gap: SPACE.xs, justifyContent: 'center' },
  step: { flex: 1, height: 3, borderRadius: 2, backgroundColor: COLORS.border, maxWidth: 56 },
  stepOn: { backgroundColor: COLORS.accent },

  phase: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.xl, gap: SPACE.lg },
  prompt: { ...TYPE.title, color: COLORS.white, textAlign: 'center' },
  hint: { ...TYPE.bodySm, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
  hintAlert: { color: COLORS.accent },

  options: { gap: SPACE.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
    minHeight: 60,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.lg,
    ...GLASS,
    backgroundColor: COLORS.surface,
  },
  optionSelected: { borderColor: COLORS.accent, backgroundColor: COLORS.accentWash },
  optionText: { ...TYPE.body, flexShrink: 1, color: COLORS.white },
  optionTextSelected: { color: COLORS.accent },

  holdBtn: {
    alignSelf: 'center',
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  holdBtnActive: { backgroundColor: COLORS.accentWash },
  holdLabel: { ...TYPE.section, color: COLORS.textMuted, textAlign: 'center' },
  holdSeconds: { ...TYPE.display, color: COLORS.accent, fontVariant: ['tabular-nums'] },
  measureActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },

  buildTrack: { height: 4, borderRadius: 2, backgroundColor: COLORS.border, overflow: 'hidden' },
  buildFill: { height: 4, borderRadius: 2, backgroundColor: COLORS.accent },

  resultCard: {
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.xl,
    gap: SPACE.md,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  resultLabel: { ...TYPE.bodySm, color: COLORS.textMuted, flexShrink: 1 },
  resultValue: { ...TYPE.section, color: COLORS.white, fontVariant: ['tabular-nums'] },
  resultValueAccent: { color: COLORS.accent },
  resultDivider: { height: 1, backgroundColor: COLORS.border },
  resultDescription: { ...TYPE.bodySm, color: COLORS.textMuted, lineHeight: 19 },

  footer: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.xl },
  primaryBtn: {
    flex: 1,
    height: 56,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...TYPE.section, color: COLORS.onAccent },
  secondaryBtn: {
    flex: 1,
    height: 56,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...GLASS,
    backgroundColor: COLORS.surface,
  },
  secondaryText: { ...TYPE.section, color: COLORS.textMuted },
});
