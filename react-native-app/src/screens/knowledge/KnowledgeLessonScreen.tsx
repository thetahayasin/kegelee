import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useRoute,
  useNavigation,
  RouteProp,
  NavigationProp,
  CommonActions,
  StackActions,
} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { Palette } from '../../theme/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import { BASICS_LESSONS } from '../../constants/basics';
import { RootStackParamList } from '../../navigation/AppNavigator';

import { WhyLesson } from './lessons/WhyLesson';
import { FindLesson } from './lessons/FindLesson';
import { FirstLesson } from './lessons/FirstLesson';
import { Watermark } from '../../components/Watermark';
import { SwipeSteps } from '../../components/SwipeSteps';

import { useAuth } from '../../context/AuthContext';
import { track } from '../../services/events';

const LAST = 2;

/**
 * One progress dot.
 *
 * Width is not animatable on the native driver, but this is a 6pt view and
 * there are at most five of them, so the JS-driven interpolation is cheaper
 * than the alternative of faking it with a scale transform that would also
 * squash the rounded ends.
 */
const StepDot: React.FC<{ active: boolean }> = ({ active }) => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const t = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(t, {
      toValue: active ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [active, t]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          width: t.interpolate({ inputRange: [0, 1], outputRange: [6, 24] }),
          backgroundColor: t.interpolate({
            inputRange: [0, 1],
            outputRange: [COLORS.borderStrong, COLORS.accent],
          }),
        },
      ]}
    />
  );
};

export const KnowledgeLessonScreen = () => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RootStackParamList, 'KnowledgeLesson'>>();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { isAuthenticated, updateUserFields, markBasicsDone, basicsDone, user } = useAuth();
  const { slug, index } = route.params;

  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const isLastLesson = index >= BASICS_LESSONS.length - 1;

  const go = (n: number) => setStep(Math.max(0, Math.min(LAST, n)));

  const complete = async () => {
    try {
      const key = user ? `@basics_done_${user.id}` : '@basics_done_guest';
      const raw = await AsyncStorage.getItem(key);
      const done: string[] = raw ? JSON.parse(raw) : [];
      if (!done.includes(slug)) {
        done.push(slug);
        await AsyncStorage.setItem(key, JSON.stringify(done));
      }
    } catch {}
    track(user?.id, 'lesson_completed', slug);

    track(user?.id, 'lesson_completed', slug);

    if (isLastLesson) {
      // There is no subscription gate in front of the basics any more, so
      // there is no separate unsubscribed path here: training is free inside
      // the first three exercises and the ask arrives after a session rather
      // than before one. The branch that used to sit here returned early and
      // skipped the `basicsDone` test below, which meant a free account
      // re-reading a lesson from the Training tab flipped a gate that was
      // already open and never went back - a Done button that did nothing.
      if (isAuthenticated) {
        if (basicsDone) {
          // Reviewing after onboarding (opened from Training): the gate is
          // already open, so flipping it again is a no-op - just return to the
          // basics list.
          navigation.goBack();
        } else {
          // Flip the basics gate FIRST - that remounts the keyed
          // NavigationContainer into the main-app phase (landing on MainTabs)
          // immediately, so no manual navigation is needed here (and 'MainTabs'
          // isn't even part of the gated navigator this screen is mounted in).
          // The onboarded marker persists in the background: a slow or failing
          // DB write must never leave the Done button doing nothing.
          markBasicsDone();
          updateUserFields({ onboarded: true }).catch(() => {});
        }
      } else {
        // Guest finished the free lessons.
        //
        // The way on is an account, not a price. Training is free inside the
        // first three exercises, so there is nothing to sell yet - the guest
        // just cannot train without somewhere to keep the progress. Back to
        // the list, where the button now reads Continue and leads to sign-up.
        //
        // RESET rather than navigate: navigate() only pops when Knowledge is
        // already below this screen, which depends on how the guest arrived.
        // Straight from onboarding it is the root; reaching it from Login
        // leaves that screen underneath. Either way a back button survived on
        // the end of the funnel and walked back into a finished lesson.
        navigation.dispatch(
          CommonActions.reset({ index: 0, routes: [{ name: 'Knowledge' }] }),
        );
      }
    } else {
      // Match the original's `navigate-replace`: REPLACE this lesson with the
      // next one so it mounts fresh (step 0, not finished) instead of reusing
      // this screen's state, and native Back returns to the basics list rather
      // than the just-finished lesson. A plain navigate() to the same route
      // name only swaps params and leaves step/finished stuck at the last step.
      const next = BASICS_LESSONS[index + 1];
      navigation.dispatch(
        StackActions.replace('KnowledgeLesson', { slug: next.slug, index: index + 1 }),
      );
    }
  };

  const onFinished = () => setFinished(true);
  const lessonProps = { step, onFinished };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <Watermark />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M15 6l-6 6 6 6" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t(BASICS_LESSONS[index].titleKey)}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Step dots.
          Each one grows into its active width rather than switching to it.
          They are the only thing on the screen that reports progress, and a
          hard cut between 6pt and 24pt reads as a redraw rather than as
          movement through the lesson. */}
      <View style={styles.dots}>
        {Array.from({ length: LAST + 1 }).map((_, i) => (
          <StepDot key={i} active={i <= step} />
        ))}
      </View>

      {/* Swipe left/right between steps as well as the buttons below - the
          gesture every phone user already has for "next" previously did
          nothing on these screens. */}
      <SwipeSteps step={step} count={LAST + 1} onChange={go}>
        <View style={styles.body}>
          {slug === 'why' ? (
            <WhyLesson {...lessonProps} />
          ) : slug === 'find' ? (
            <FindLesson {...lessonProps} />
          ) : (
            <FirstLesson {...lessonProps} />
          )}
        </View>
      </SwipeSteps>

      {/* Navigation */}
      <View style={styles.nav}>
        {step > 0 ? (
          <TouchableOpacity style={styles.navCircle} onPress={() => go(step - 1)}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path d="M15 6l-6 6 6 6" stroke={COLORS.text} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        ) : (
          <View style={styles.navSpacer} />
        )}
        <View style={{ flex: 1 }} />
        {step < LAST ? (
          <TouchableOpacity style={[styles.navCircle, styles.navNext]} onPress={() => go(step + 1)}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path d="M9 6l6 6-6 6" stroke={COLORS.onAccent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        ) : finished ? (
          <TouchableOpacity style={styles.completeBtn} onPress={complete}>
            <Text style={styles.completeBtnText}>{isLastLesson ? t('knowledge.done') : t('knowledge.nextLesson')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.navSpacer} />
        )}
      </View>
    </SafeAreaView>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginHorizontal: -4,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 'bold', color: COLORS.white },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: { height: 6, borderRadius: 3 },
  dotActive: { width: 24, backgroundColor: COLORS.accentText },
  dotIdle: { width: 6, backgroundColor: COLORS.borderStrong },
  body: { flex: 1 },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
    paddingBottom: 20,
  },
  navSpacer: { width: 56, height: 56 },
  navCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    ...COLORS.glass,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navNext: { backgroundColor: COLORS.accent },
  completeBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBtnText: { fontSize: 16, fontWeight: 'bold', color: COLORS.onAccent },
});
