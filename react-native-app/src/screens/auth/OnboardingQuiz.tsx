import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  AccessibilityInfo,
  BackHandler,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { Chevron } from '../../components/Chevron';
import { TYPE, SPACE, RADIUS, Palette } from '../../theme/colors';
import { LESSON_TEXT } from '../../components/LessonLine';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import { LEVELS } from '../../constants/catalogues';

/**
 * Two questions, then the plan.
 *
 * It used to end on a press-and-hold measurement and a screen showing the
 * level that produced. Both are gone, and for the same reason: this is the
 * first ninety seconds of the app, and neither earned its place there.
 *
 * The measurement asked someone who has not yet been told what a pelvic floor
 * contraction is to perform one, correctly, against a stopwatch - before they
 * have read the basics that explain it. A number gathered under those
 * conditions is not a baseline, it is a guess with a decimal point on it, and
 * every later "you have improved" was going to be measured against it. The
 * Progress tab still measures, after the lessons, which is where it belongs.
 *
 * The level display went with it. "Starting level 3" is the app's internal
 * unit - it is a session length - and naming it to someone who has not
 * trained yet is asking them to be pleased about a number they have no scale
 * for. What they actually want to know is that something was made for them.
 *
 * So the answers still set the level, and the level still sets the session
 * length. It just happens quietly now.
 *
 * Everything here is optional. Skip lands on level 1, which is exactly where
 * every user landed before this screen existed, so refusing to answer can
 * never be worse than not being asked.
 */

export interface QuizResult {
  /** 1-5, matching LEVELS. Feeds level_id on the account. */
  level: number;
  /**
   * Seconds held at onboarding. Always 0 now - the measurement moved to the
   * Progress tab, after the basics. Kept on the shape because the backend
   * column and the sync payload still carry it, and 0 is already how both
   * spell "never measured".
   */
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

type Phase = 'experience' | 'time' | 'building' | 'result';

const ORDER: Phase[] = ['experience', 'time', 'building', 'result'];

/**
 * How long the building step holds before the result.
 *
 * Short on purpose. A progress bar that crawls for eight seconds pretending to
 * do arithmetic is filler, and people can tell. Two seconds reads as the app
 * taking a breath.
 */
const BUILD_MS = 2000;

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
 * Turn the answers, and optionally a hold, into a starting level.
 *
 * A level here IS a session length - 1 through 5 run 60s to 300s - so the two
 * answers set the ambition and a measurement, when there is one, sets the
 * ceiling: putting someone who cannot hold a contraction for three seconds
 * onto five-minute sessions is not encouraging, it is a plan they fail on day
 * one.
 *
 * Onboarding no longer measures, so it always passes 0, and 0 means "not
 * measured" and applies no ceiling at all - a missing measurement must never
 * read as a failed one. The parameter stays because the app still measures on
 * the Progress tab and this is the function that knows what a hold is worth.
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

/**
 * One segment of the progress bar at the top.
 *
 * Eases into the accent instead of switching to it. Three segments changing
 * colour on the same frame the question changes is a lot of instantaneous
 * change at once; letting the bar catch up a beat later is what makes the
 * whole screen feel like it moved rather than redrew.
 */
const QuizStep: React.FC<{ on: boolean }> = ({ on }) => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const t = useRef(new Animated.Value(on ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(t, {
      toValue: on ? 1 : 0,
      duration: 280,
      delay: on ? 80 : 0,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [on, t]);

  return (
    <Animated.View
      style={[
        styles.step,
        {
          backgroundColor: t.interpolate({
            inputRange: [0, 1],
            outputRange: [COLORS.border, COLORS.accent],
          }),
        },
      ]}
    />
  );
};

export const OnboardingQuiz: React.FC<Props> = ({ onDone }) => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
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

  const buildProgress = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  /**
   * Horizontal travel, paired with the fade.
   *
   * -1 is "off to the left", +1 is "off to the right", 0 is home. Going
   * forward, the outgoing question leaves left and the incoming one enters
   * from the right; going back, the reverse. Fading alone gave no direction at
   * all, so answering a question and correcting one looked identical.
   */
  const slide = useRef(new Animated.Value(0)).current;

  // One mounted flag for every async hand-off on this screen. Both the phase
  // transition and the building timer resolve after an await, and a screen the
  // user backed out of must not still be setting state.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const goTo = useCallback(
    (next: Phase, back = false) => {
      AccessibilityInfo.isReduceMotionEnabled()
        .catch(() => false)
        .then((reduced) => {
          if (!mountedRef.current) return;
          if (reduced) {
            // Reduce motion means no travel and no fade - just the next
            // question, immediately.
            slide.setValue(0);
            fade.setValue(1);
            setPhase(next);
            return;
          }
          const away = back ? 1 : -1;
          Animated.parallel([
            Animated.timing(fade, {
              toValue: 0,
              duration: 160,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(slide, {
              toValue: away,
              duration: 160,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]).start(({ finished }) => {
            if (!mountedRef.current || !finished) return;
            setPhase(next);
            // Jump to the far side without animating, then ease home.
            slide.setValue(-away);
            Animated.parallel([
              Animated.timing(fade, {
                toValue: 1,
                duration: 260,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(slide, {
                toValue: 0,
                duration: 300,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
            ]).start();
          });
        });
    },
    [fade, slide],
  );

  /**
   * Step back one question.
   *
   * Building and result both return to the LAST QUESTION rather than to each
   * other: returning into a two second timer would just bounce the reader
   * forward again, and the only thing on either screen worth changing is the
   * answer that produced it.
   */
  const goBack = useCallback((): boolean => {
    if (phase === 'experience') return false;
    if (phase === 'building' || phase === 'result') {
      goTo('time', true);
      return true;
    }
    goTo(ORDER[Math.max(0, ORDER.indexOf(phase) - 1)], true);
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

  const answer = (which: 'experience' | 'time', points: number, next: Phase) => {
    if (which === 'experience') setExperience(points);
    else setTime(points);
    goTo(next);
  };

  const points = (experience ?? 0) + (time ?? 0);
  const level = levelFromQuiz(points, 0);
  // Three dots, not four: building is a two second breath on the way to the
  // result, not a step the reader is asked to do anything on.
  const stepIndex = phase === 'experience' ? 0 : phase === 'time' ? 1 : 2;

  const finish = (skipped: boolean) =>
    onDone({
      level,
      baselineSeconds: 0,
      experience,
      dailyTime: time,
      skipped,
    });

  const renderOptions = (
    promptKey: string,
    options: readonly { key: string; labelKey: string; points: number }[],
    which: 'experience' | 'time',
    chosen: number | null,
    next: Phase,
  ) => (
    <ScrollView
      style={styles.bodyScroll}
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <Text style={styles.statement}>{t(promptKey)}</Text>
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
              <Chevron size={18} color={selected ? COLORS.accent : COLORS.textMuted} />
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
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
              accessibilityLabel={t('allExercises.backA11y')}
            >
              <Chevron direction="back" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View
          style={styles.steps}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: 3, now: stepIndex + 1 }}
        >
          {[0, 1, 2].map((i) => (
            <QuizStep key={i} on={i <= stepIndex} />
          ))}
        </View>

        <View style={[styles.topSide, styles.topSideEnd]}>
          {phase !== 'result' && (
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => finish(true)}
              accessibilityRole="button"
            >
              <Text style={styles.skipText}>{t('quiz.skip')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Animated.View
        style={[
          styles.phase,
          {
            opacity: fade,
            transform: [
              {
                // A short travel, not a full screen width. The question is
                // moving aside, not being swiped away.
                translateX: slide.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [-40, 0, 40],
                }),
              },
            ],
          },
        ]}
      >
        {phase === 'experience' &&
          renderOptions(
            'onboarding.quizExperienceQ',
            EXPERIENCE_OPTIONS,
            'experience',
            experience,
            'time',
          )}

        {phase === 'time' &&
          renderOptions('onboarding.quizTimeQ', TIME_OPTIONS, 'time', time, 'building')}

        {phase === 'building' && (
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={styles.statement} accessibilityLiveRegion="polite">
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
          </ScrollView>
        )}

        {/* The payoff, in one line.
            No level, no numbers, no second paragraph underneath in a smaller
            grey. The lessons in the knowledge base are built this way - one
            statement per screen, at a size that says it is the thing you are
            here to read - and they are the most readable screens in the app.
            This borrows their type outright rather than inventing a heading
            and a caption to sit under it. */}
        {phase === 'result' && (
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={styles.statement} accessibilityLiveRegion="polite">
              {t('onboarding.resultTitle')}
            </Text>
          </ScrollView>
        )}
      </Animated.View>

      {phase === 'result' && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.primaryBtn}
            accessibilityRole="button"
            onPress={() => finish(false)}
          >
            <Text
              style={styles.primaryText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t('onboarding.getStarted')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

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
  stepOn: { backgroundColor: COLORS.accentText },

  phase: { flex: 1 },
  // Scrolls only when it has to. `flex: 1` with `justifyContent: center` and
  // no scroll is a layout that silently eats its own content: once the
  // children are taller than the box, centring pushes the overflow off BOTH
  // ends and there is no way to reach it.
  bodyScroll: { flex: 1 },
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.lg,
    gap: SPACE.xl,
  },

  /**
   * The one piece of text on the screen.
   *
   * LESSON_TEXT, the same 28/38 the knowledge base uses. This screen used to
   * pair TYPE.title with a TYPE.bodySm line underneath it in muted grey, on
   * every step - a heading and a caption where there was only ever one thing
   * to say. Two sizes and two colours to deliver one sentence reads as an
   * unfinished form; one line at reading size reads as someone talking to you.
   */
  statement: { ...LESSON_TEXT, color: COLORS.white, textAlign: 'center' },

  options: { gap: SPACE.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
    minHeight: 62,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.lg,
    ...COLORS.glass,
    backgroundColor: COLORS.surface,
  },
  optionSelected: { borderColor: COLORS.accent, backgroundColor: COLORS.accentWash },
  // Reading size, not label size. These are the answers to the question above
  // and they are the only thing on the screen to act on.
  optionText: { ...TYPE.body, fontSize: 16, flexShrink: 1, color: COLORS.white },
  optionTextSelected: { color: COLORS.accentText },

  buildTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  buildFill: { height: 4, borderRadius: 2, backgroundColor: COLORS.accentText },

  footer: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.xl },
  primaryBtn: {
    height: 56,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...TYPE.section, color: COLORS.onAccent },
});
