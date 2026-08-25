import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  AccessibilityInfo,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TouchableOpacity } from '../../components/Touchable';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import type { AuthStackParamList } from '../../navigation/AppNavigator';
import { COLORS, TYPE, SPACE, RADIUS, GLASS } from '../../theme/colors';
import { FalteringVisual } from '../../components/OnboardingVisuals';
import { Watermark } from '../../components/Watermark';
import { SubscribeSheet } from '../../components/SubscribeSheet';
import { ONBOARDING_QUIZ_KEY } from '../../context/AuthContext';

/**
 * First run: a hook, three taps, and a plan.
 *
 * This replaced four swipeable slides. Slides ask someone who has just
 * installed an app to read four paragraphs about a muscle before they are
 * allowed to do anything, and the only interaction on offer is "next" - so the
 * screens got skipped and the app started cold, with the person no more
 * invested than before they opened it.
 *
 * Questions invert that. Each one is a single tap, the whole quiz is under ten
 * seconds, and at the end the answers produce a real starting level rather than
 * a congratulations screen: the LEVELS catalogue runs 1-5 minutes per session,
 * so "how long can you give this" maps straight onto it. Someone who has
 * answered three questions about their own body has also decided something,
 * which is the point - the plans screen that follows is asking them to continue
 * rather than to start.
 */

// The key lives in AuthContext, which is what consumes it after sign-up.

type QuestionKey = 'goal' | 'experience' | 'minutes';

interface Question {
  key: QuestionKey;
  titleKey: string;
  captionKey: string;
  options: { value: string; labelKey: string }[];
}

const QUESTIONS: Question[] = [
  {
    key: 'goal',
    titleKey: 'quiz.goalTitle',
    captionKey: 'quiz.goalCaption',
    options: [
      { value: 'bladder', labelKey: 'quiz.goalBladder' },
      { value: 'performance', labelKey: 'quiz.goalPerformance' },
      { value: 'recovery', labelKey: 'quiz.goalRecovery' },
      { value: 'strength', labelKey: 'quiz.goalStrength' },
    ],
  },
  {
    key: 'experience',
    titleKey: 'quiz.experienceTitle',
    captionKey: 'quiz.experienceCaption',
    options: [
      { value: 'never', labelKey: 'quiz.experienceNever' },
      { value: 'some', labelKey: 'quiz.experienceSome' },
      { value: 'regular', labelKey: 'quiz.experienceRegular' },
    ],
  },
  {
    key: 'minutes',
    titleKey: 'quiz.minutesTitle',
    captionKey: 'quiz.minutesCaption',
    options: [
      { value: '1', labelKey: 'quiz.minutes1' },
      { value: '2', labelKey: 'quiz.minutes2' },
      { value: '3', labelKey: 'quiz.minutes3' },
      { value: '5', labelKey: 'quiz.minutes5' },
    ],
  },
];

/**
 * Turn the answers into a starting level.
 *
 * Minutes decide it outright, because a level IS its session length here.
 * Experience only ever pulls DOWN: someone who has never done this and picks
 * five minutes gets level 2, not level 5. Erring low is deliberate - a first
 * session that feels easy gets repeated, one that feels impossible does not,
 * and the app raises the level on its own once "too easy" comes back.
 */
const levelFromAnswers = (answers: Partial<Record<QuestionKey, string>>): number => {
  const fromMinutes = Number(answers.minutes ?? '2');
  const level = Number.isFinite(fromMinutes) ? Math.min(5, Math.max(1, fromMinutes)) : 2;
  if (answers.experience === 'never') return Math.min(level, 2);
  if (answers.experience === 'some') return Math.min(level, 4);
  return level;
};

interface OnboardingScreenProps {
  onComplete: () => void;
}

const CheckIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 13l4 4L19 7"
      stroke={COLORS.onAccent}
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<AuthStackParamList>>();

  // 0 = the hook, 1..3 = questions, 4 = the plan.
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<Record<QuestionKey, string>>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const fade = useRef(new Animated.Value(1)).current;

  // Asked once on mount, not on every render - it is a native round trip, and
  // in the body it fired again on each of the three answer taps.
  const reduceMotion = useRef(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) reduceMotion.current = v;
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const question = step >= 1 && step <= QUESTIONS.length ? QUESTIONS[step - 1] : null;
  const isResult = step === QUESTIONS.length + 1;
  const level = levelFromAnswers(answers);

  // Cross-fade between steps. Sliding the whole screen would fight the back
  // gesture, and a hard cut makes three fast taps feel like a flicker.
  const goTo = useCallback(
    (next: number) => {
      if (reduceMotion.current) {
        setStep(next);
        return;
      }
      Animated.timing(fade, {
        toValue: 0,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setStep(next);
        Animated.timing(fade, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
    },
    [fade],
  );

  const choose = (key: QuestionKey, value: string) => {
    setPending(value);
    const next = { ...answers, [key]: value };
    setAnswers(next);
    // Let the selected state paint before moving on, so the tap is
    // acknowledged rather than the screen just changing under the finger.
    setTimeout(() => {
      setPending(null);
      if (step === QUESTIONS.length) {
        AsyncStorage.setItem(
          ONBOARDING_QUIZ_KEY,
          JSON.stringify({ ...next, level: levelFromAnswers(next) }),
        ).catch(() => {});
      }
      goTo(step + 1);
    }, 220);
  };

  // Finishing lands on the plans. Dismissing the sheet drops the guest into the
  // free basics, which becomes the stack root.
  const finish = () => {
    onComplete();
    setSheetVisible(true);
  };
  const finishToBasics = () => {
    setSheetVisible(false);
    onComplete();
    navigation.reset({ index: 0, routes: [{ name: 'Knowledge' }] });
  };
  const goToLogin = () => {
    onComplete();
    navigation.reset({ index: 1, routes: [{ name: 'Knowledge' }, { name: 'Login' }] });
  };
  const goToVerify = (email: string) => {
    onComplete();
    navigation.reset({
      index: 1,
      routes: [{ name: 'Knowledge' }, { name: 'VerifyEmail', params: { email } }],
    });
  };

  const back = () => goTo(Math.max(0, step - 1));

  return (
    <SafeAreaView style={styles.container}>
      <Watermark />

      <View style={styles.header}>
        {step > 0 ? (
          <TouchableOpacity onPress={back} style={styles.headerBtn} hitSlop={10}
            accessibilityRole="button" accessibilityLabel={t('quiz.back')}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path d="M15 6l-6 6 6 6" stroke={COLORS.textMuted} strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}

        {/* Progress across the three questions only - the hook and the plan are
            not steps the user is working through. */}
        {question ? (
          <View style={styles.progressTrack}>
            {QUESTIONS.map((q, i) => (
              <View
                key={q.key}
                style={[styles.progressSeg, i < step && styles.progressSegDone]}
              />
            ))}
          </View>
        ) : (
          <View style={styles.progressTrack} />
        )}

        <TouchableOpacity onPress={finish} style={styles.headerBtn} hitSlop={10}
          accessibilityRole="button" accessibilityLabel={t('quiz.skip')}>
          <Text style={styles.skipText}>{t('quiz.skip')}</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={[styles.body, { opacity: fade }]}>
        {step === 0 && (
          <View style={styles.introWrap}>
            <View style={styles.introVisual}>
              <FalteringVisual active />
            </View>
            <Text style={styles.introTitle}>{t('onboarding.slide1Title')}</Text>
            <Text style={styles.introBody}>{t('onboarding.slide1Body')}</Text>
          </View>
        )}

        {question && (
          <View style={styles.questionWrap}>
            <Text style={styles.stepCount}>
              {t('quiz.stepOf', { current: step, total: QUESTIONS.length })}
            </Text>
            <Text style={styles.questionTitle}>{t(question.titleKey)}</Text>
            <Text style={styles.questionCaption}>{t(question.captionKey)}</Text>

            <View style={styles.options}>
              {question.options.map((opt) => {
                const selected =
                  pending === opt.value || answers[question.key] === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => choose(question.key, opt.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[styles.optionText, selected && styles.optionTextSelected]}
                    >
                      {t(opt.labelKey)}
                    </Text>
                    {selected ? (
                      <View style={styles.optionCheck}>
                        <CheckIcon />
                      </View>
                    ) : (
                      <View style={styles.optionDot} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {isResult && (
          <View style={styles.resultWrap}>
            <Text style={styles.resultEyebrow}>{t('quiz.resultEyebrow')}</Text>
            <Text style={styles.resultTitle}>
              {t('quiz.resultLevel', { level })}
            </Text>

            <View style={styles.resultCard}>
              <View style={styles.resultRow}>
                <Text style={styles.resultRowLabel}>{t('quiz.resultPerDay')}</Text>
                <Text style={styles.resultRowValue}>{t('quiz.resultTwoSessions')}</Text>
              </View>
              <View style={styles.resultDivider} />
              <View style={styles.resultRow}>
                <Text style={styles.resultRowLabel}>{t('quiz.resultEachSession')}</Text>
                <Text style={styles.resultRowValue}>
                  {t('quiz.resultMinutes', { count: level })}
                </Text>
              </View>
              <View style={styles.resultDivider} />
              <View style={styles.resultRow}>
                <Text style={styles.resultRowLabel}>{t('quiz.resultAdjusts')}</Text>
                <Text style={styles.resultRowValue}>{t('quiz.resultAutomatic')}</Text>
              </View>
            </View>

            <Text style={styles.resultNote}>{t('quiz.resultNote')}</Text>
          </View>
        )}
      </Animated.View>

      <View style={styles.footer}>
        {step === 0 && (
          <TouchableOpacity style={styles.cta} onPress={() => goTo(1)}>
            <Text style={styles.ctaText}>{t('quiz.startCta')}</Text>
          </TouchableOpacity>
        )}
        {isResult && (
          <TouchableOpacity style={styles.cta} onPress={finish}>
            <Text style={styles.ctaText}>{t('quiz.resultCta')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.loginLink} onPress={goToLogin}>
          <Text style={styles.loginLinkText}>
            {t('onboarding.alreadyHaveAnAccount')}{' '}
            <Text style={styles.loginLinkStrong}>{t('onboarding.logIn')}</Text>
          </Text>
        </TouchableOpacity>
      </View>

      <SubscribeSheet
        visible={sheetVisible}
        showBar={false}
        onClose={finishToBasics}
        onNavigateToVerify={goToVerify}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.sm,
    gap: SPACE.md,
  },
  headerBtn: {
    minWidth: 56,
    height: 44,
    justifyContent: 'center',
  },
  skipText: { ...TYPE.bodySm, color: COLORS.textMuted, textAlign: 'right' },

  progressTrack: { flex: 1, flexDirection: 'row', gap: 6 },
  progressSeg: {
    flex: 1,
    height: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(242, 245, 238, 0.12)',
  },
  progressSegDone: { backgroundColor: COLORS.accent },

  body: { flex: 1, paddingHorizontal: SPACE.xl },

  introWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  introVisual: { marginBottom: SPACE.xl },
  introTitle: {
    ...TYPE.display,
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: SPACE.md,
  },
  introBody: {
    ...TYPE.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 340,
  },

  questionWrap: { flex: 1, justifyContent: 'center' },
  stepCount: {
    ...TYPE.overline,
    color: COLORS.accent,
    marginBottom: SPACE.sm,
  },
  questionTitle: { ...TYPE.title, color: COLORS.white, marginBottom: SPACE.xs },
  questionCaption: {
    ...TYPE.bodySm,
    color: COLORS.textMuted,
    marginBottom: SPACE.xl,
  },
  options: { gap: SPACE.md },
  option: {
    minHeight: 60,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface2,
    ...GLASS,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  optionSelected: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(193, 255, 114, 0.12)',
  },
  optionText: { ...TYPE.section, color: COLORS.white, flex: 1 },
  optionTextSelected: { color: COLORS.white },
  optionDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(242, 245, 238, 0.22)',
  },
  optionCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  resultWrap: { flex: 1, justifyContent: 'center' },
  resultEyebrow: { ...TYPE.overline, color: COLORS.accent, marginBottom: SPACE.sm },
  resultTitle: { ...TYPE.display, color: COLORS.white, marginBottom: SPACE.xl },
  resultCard: {
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface2,
    ...GLASS,
    paddingHorizontal: SPACE.lg,
  },
  resultRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  resultRowLabel: { ...TYPE.body, color: COLORS.textMuted, flex: 1 },
  resultRowValue: { ...TYPE.section, color: COLORS.white },
  resultDivider: { height: 1, backgroundColor: COLORS.border },
  resultNote: {
    ...TYPE.bodySm,
    color: COLORS.textDim,
    marginTop: SPACE.lg,
    lineHeight: 20,
  },

  footer: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.lg, gap: SPACE.md },
  cta: {
    height: 56,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...TYPE.section, color: COLORS.onAccent },
  loginLink: { alignItems: 'center', paddingVertical: SPACE.sm },
  loginLinkText: { ...TYPE.bodySm, color: COLORS.textMuted },
  loginLinkStrong: { color: COLORS.accent, fontWeight: '700' },
});
