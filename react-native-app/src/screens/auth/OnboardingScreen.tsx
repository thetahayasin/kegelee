import React, { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { TouchableOpacity } from '../../components/Touchable';
import type { AuthStackParamList } from '../../navigation/AppNavigator';
import { COLORS, TYPE, SPACE, RADIUS } from '../../theme/colors';
import { SubscribeSheet } from '../../components/SubscribeSheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ONBOARDING_QUIZ_KEY } from '../../context/AuthContext';
import { OnboardingQuiz, QuizResult } from './OnboardingQuiz';

/**
 * First run: three photographs, three lines, one button.
 *
 * Two earlier versions failed for opposite reasons. Animated SVG art looked
 * synthetic and crashed the app on launch; a tap-through quiz ending in a
 * generated "plan" screen read as filler standing between the user and the
 * product. What is left is the oldest and most reliable shape there is - a
 * photo, a headline, a sentence - because there is nothing in it to get wrong.
 *
 * The motion is a paging FlatList, so swiping uses the platform's own scroll
 * physics rather than anything hand-rolled. That is the whole reason it feels
 * right: no easing curve invented here beats the one the OS already ships.
 *
 * The photographs are quiet interiors, not people. Stock images of models in
 * workout clothes are exactly what "generic app" looks like, and in a category
 * Play treats as sensitive a cropped torso is a listing risk as well. These
 * read as private, ordinary places, which is the actual promise: you can do
 * this anywhere and nobody can tell.
 *
 * Images are Pexels, free for commercial use, no attribution required.
 * Bundled rather than fetched, so the first screen never waits on a network
 * that might not be there.
 */

const { width, height } = Dimensions.get('window');
const ART_H = Math.round(height * 0.52);

const SLIDES = [
  {
    key: 'private',
    art: require('../../assets/onboarding/private.jpg'),
    titleKey: 'onboarding.slide1Title',
    bodyKey: 'onboarding.slide1Body',
  },
  {
    key: 'anywhere',
    art: require('../../assets/onboarding/anywhere.jpg'),
    titleKey: 'onboarding.slide2Title',
    bodyKey: 'onboarding.slide2Body',
  },
  {
    key: 'routine',
    art: require('../../assets/onboarding/routine.jpg'),
    titleKey: 'onboarding.slide3Title',
    bodyKey: 'onboarding.slide3Body',
  },
];

/**
 * Fades the photograph into the page rather than cutting it off.
 *
 * A hard edge between a photo and a solid ground is the detail that makes an
 * app look assembled instead of designed. Drawn with react-native-svg because
 * no gradient package is installed, and adding a native dependency for one
 * rectangle is not worth the build risk.
 */
const Scrim = () => (
  <Svg width={width} height={ART_H} style={StyleSheet.absoluteFill} pointerEvents="none">
    <Defs>
      <LinearGradient id="obScrim" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={COLORS.bg} stopOpacity="0.5" />
        <Stop offset="0.45" stopColor={COLORS.bg} stopOpacity="0.3" />
        <Stop offset="0.82" stopColor={COLORS.bg} stopOpacity="0.92" />
        <Stop offset="1" stopColor={COLORS.bg} stopOpacity="1" />
      </LinearGradient>
    </Defs>
    <Rect width={width} height={ART_H} fill="url(#obScrim)" />
  </Svg>
);

interface OnboardingScreenProps {
  onComplete: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<AuthStackParamList>>();
  const listRef = useRef<FlatList>(null);

  const [index, setIndex] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(false);
  const isLast = index === SLIDES.length - 1;
  /**
   * The slides hand off to the quiz, and the quiz to the plans sheet.
   *
   * Kept as a phase inside this screen rather than a route of its own: the
   * guest stack's reset targets and this screen's onComplete handshake are
   * already wired, and threading a second route through them buys nothing
   * except two more places for the back button to land somewhere wrong.
   */
  const [quizVisible, setQuizVisible] = useState(false);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex((cur) => (cur === next ? cur : next));
  }, []);

  // Finishing the slides opens the quiz, not the plans.
  //
  // The sheet used to open here, four slides in, which is the weakest moment
  // there is to name a price: nothing has been established about the reader,
  // so there is nothing for the number to attach to. It opens after the
  // result instead, where the reader has just been shown two figures of their
  // own - the seconds they held, and the level that produces.
  const finish = () => {
    setQuizVisible(true);
  };

  /**
   * Stash the result for the account that does not exist yet.
   *
   * AuthContext already reads this key on first sign-in and applies the level,
   * with a guard so a stale answer cannot pull a returning user's real level
   * down - that half was written and nothing ever wrote the other. The hold
   * travels with it and becomes the account's first measurement, which is what
   * every later 'you have improved' depends on having.
   */
  const finishQuiz = (result: QuizResult) => {
    AsyncStorage.setItem(
      ONBOARDING_QUIZ_KEY,
      JSON.stringify({
        level: result.level,
        baseline: result.baselineSeconds,
        experience: result.experience,
        dailyTime: result.dailyTime,
        skipped: result.skipped,
      }),
    ).catch(() => {
      // A failed write costs a personalised starting level, not the run.
    });
    setQuizVisible(false);
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

  const advance = () => {
    if (isLast) {
      finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  if (quizVisible) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        <OnboardingQuiz onDone={finishQuiz} />
        <SubscribeSheet
          visible={sheetVisible}
          showBar={false}
          onClose={finishToBasics}
          onNavigateToVerify={goToVerify}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.skipRow} pointerEvents="box-none">
        <TouchableOpacity
          onPress={finish}
          hitSlop={12}
          style={styles.skipBtn}
          accessibilityRole="button"
        >
          <Text style={styles.skipText}>{t('quiz.skip')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(s) => s.key}
        getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={styles.art}>
              <Image
                source={item.art}
                style={styles.artImage}
                resizeMode="cover"
                accessibilityRole="image"
                accessible={false}
              />
              <Scrim />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>{t(item.titleKey)}</Text>
              <Text style={styles.body}>{t(item.bodyKey)}</Text>
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>

        <TouchableOpacity style={styles.cta} onPress={advance} accessibilityRole="button">
          {/* "Continue" on the way through, not "Skip" - the button advances,
              and labelling an advance control Skip is a lie about what it does.
              Reuses progress.continue rather than minting a second key holding
              the identical word in 29 locales. */}
          <Text style={styles.ctaText}>
            {isLast ? t('onboarding.getStarted') : t('progress.continue')}
          </Text>
        </TouchableOpacity>

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

  // Floats over the photograph, inside the top safe area. The scrim already
  // darkens that corner, so the label reads without a chip behind it.
  skipRow: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 5,
    paddingTop: SPACE.xxl,
    paddingRight: SPACE.lg,
  },
  skipBtn: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  skipText: { ...TYPE.bodySm, color: COLORS.white, fontWeight: '600' },

  slide: { width, flex: 1 },
  art: { height: ART_H, width, backgroundColor: COLORS.surface },
  artImage: { height: ART_H, width },

  copy: {
    flex: 1,
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.xl,
    gap: SPACE.md,
  },
  title: { ...TYPE.display, color: COLORS.white },
  // Body weight, not a muted decorative grey: this is the only sentence on the
  // screen, so it has to clear the text contrast threshold on a near-black
  // ground rather than the 3:1 allowed for large or non-text elements.
  body: { ...TYPE.body, color: COLORS.textMuted, lineHeight: 23, maxWidth: 380 },

  footer: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.lg, gap: SPACE.lg },
  dots: { flexDirection: 'row', gap: 7, justifyContent: 'center' },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(242, 245, 238, 0.18)',
  },
  dotOn: { backgroundColor: COLORS.accent, width: 22 },

  cta: {
    height: 56,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...TYPE.section, color: COLORS.onAccent },
  loginLink: { alignItems: 'center' },
  loginLinkText: { ...TYPE.bodySm, color: COLORS.textMuted },
  loginLinkStrong: { color: COLORS.accent, fontWeight: '700' },
});
