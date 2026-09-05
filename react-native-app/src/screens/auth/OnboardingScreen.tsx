import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  BackHandler,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { TouchableOpacity } from '../../components/Touchable';
import { FadeIn } from '../../components/FadeIn';
import type { AuthStackParamList } from '../../navigation/AppNavigator';
import { TYPE, SPACE, RADIUS, Palette } from '../../theme/colors';
import { useTheme, useThemeMode, useThemedStyles } from '../../theme/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ONBOARDING_QUIZ_KEY } from '../../context/AuthContext';
import { OnboardingQuiz, QuizResult } from './OnboardingQuiz';
import { track } from '../../services/events';

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

/**
 * The artwork's height, from the LIVE window rather than a module-load
 * snapshot. `Dimensions.get` runs once when the bundle is required, so a
 * window that changes afterwards - a fold, split screen - left the photograph
 * and the paging width sized for a screen that is no longer there, which on a
 * pager means the slides stop landing on their boundaries.
 */
const artHeightFor = (height: number) => Math.round(height * 0.52);

/**
 * Text drawn ON the photograph.
 *
 * Deliberately outside the palette. The artwork is the same dark image in both
 * appearances, so anything sitting on top of it has to stay light whichever
 * appearance the reader picked - a themed colour here inverts to black ink on
 * a black photo.
 */
const ON_ART = '#f2f5ee';

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
 *
 * The gradient is now CLEAR for the top half and only closes over the bottom.
 * It used to open at 0.5, thin to 0.3 at mid-height, and then climb - a veil
 * across the whole image with a turning point in the middle of it. On the dark
 * palette that passed as atmosphere. On the light one it is a white wash that
 * lightens the top of the photograph, thins into a darker band across its
 * middle, and lightens again: a hard horizontal line through the artwork that
 * belongs to neither the photo nor the page. That band is the "border".
 *
 * The 0.5 at the top existed for one reason - to darken the corner enough for
 * the Skip label to read against it - and Skip carries its own scrim pill now,
 * so nothing needs it. The photograph shows as taken, and dissolves into the
 * page only where it actually has to meet it.
 */
const Scrim = ({ width, artH }: { width: number; artH: number }) => {
  const COLORS = useTheme();
  const { scheme } = useThemeMode();

  /**
   * On a light page there is no dissolve, and there should not be one.
   *
   * The artwork is dark photography. Fading a dark photograph into a near
   * white ground cannot be done cleanly - the gradient has to travel the whole
   * tonal range, and every value in between reads as a grey haze with edges
   * of its own. Three attempts at tuning the stops produced three different
   * visible bands, because the problem is not the stops.
   *
   * So light mode does not try. The photograph ends where it ends, with a
   * rounded lower edge, and sits ON the page as a hero card rather than
   * pretending to melt into it. An edge that is obviously intended reads as
   * design; an edge that is trying and failing to disappear reads as a bug -
   * which is exactly how the fade was being read.
   */
  if (scheme === 'light') return null;

  return (
    <Svg width={width} height={artH} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="obScrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={COLORS.bg} stopOpacity="0" />
          <Stop offset="0.5" stopColor={COLORS.bg} stopOpacity="0" />
          <Stop offset="0.72" stopColor={COLORS.bg} stopOpacity="0.45" />
          <Stop offset="0.88" stopColor={COLORS.bg} stopOpacity="0.9" />
          <Stop offset="1" stopColor={COLORS.bg} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={artH} fill="url(#obScrim)" />
    </Svg>
  );
};

interface OnboardingScreenProps {
  onComplete: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<AuthStackParamList>>();
  const listRef = useRef<FlatList>(null);
  const { width, height } = useWindowDimensions();
  const artH = artHeightFor(height);

  const [index, setIndex] = useState(0);
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

  /**
   * Which slides have already been counted.
   *
   * A ref, not state: onScroll fires on every frame of a swipe, so the guard
   * has to be readable and writable synchronously inside the handler. Without
   * it a single slow drag would record the same slide a dozen times and the
   * "where do people stop" step counts would be a measure of scroll velocity.
   */
  const seenSlides = useRef(new Set<string>());

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      setIndex((cur) => (cur === next ? cur : next));
      // Once the slide has SETTLED on a boundary, and once per slide. The
      // subject is the position rather than the key, so renaming or reordering
      // the artwork cannot silently redefine step 2 in an existing report.
      const slide = SLIDES[next];
      if (!slide) return;
      const step = `slide${next + 1}`;
      if (seenSlides.current.has(step)) return;
      seenSlides.current.add(step);
      track(null, 'onboarding_step', step);
    },
    [width],
  );

  // The first slide is on screen before anything scrolls, so nothing would
  // ever report it - and a step nobody reaches is indistinguishable from a
  // step nobody records. This is the denominator the rest are read against.
  useEffect(() => {
    if (seenSlides.current.has('slide1')) return;
    seenSlides.current.add('slide1');
    track(null, 'onboarding_step', 'slide1');
  }, []);

  // Finishing the slides opens the quiz.
  //
  // Nothing here names a price any more. Training is free inside the first
  // three exercises, so a guest has nothing to buy yet - what they need is an
  // account for the progress to live in, and the ask for that comes at the end
  // of the basics rather than four slides into an app they have not used.
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
    // The last step of the sequence, recorded beside the other three so the
    // funnel reads as one list rather than three slides plus a special case.
    track(null, 'onboarding_step', 'quiz');
    // Recorded here rather than in the quiz, because this is where the result
    // is known - including whether it was answered or skipped, which is the
    // only interesting thing about it.
    //
    // There is no account yet, so this is queued against the id the sync layer
    // resolves once one exists; a guest quiz that never becomes an account is
    // genuinely not attributable and is not counted.
    track(
      null,
      result.skipped ? 'quiz_skipped' : 'quiz_completed',
      null,
      null,
      { level: result.level, experience: result.experience, dailyTime: result.dailyTime },
    );
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
    // Straight into the lessons. The result screen has just told them their
    // level and their opening hold; a price on top of that would be asking
    // for money from someone who still has not used the thing.
    navigation.reset({ index: 0, routes: [{ name: 'Knowledge' }] });
  };
  /**
   * Skip skips the SLIDES, and then asks the quiz.
   *
   * This went the other way for a while: Skip jumped to the quiz's end state
   * and recorded a default level, on the reasoning that a control labelled
   * Skip should not put three more questions in front of the reader. The
   * reasoning is fine and the cost was not. The quiz is the only thing that
   * ever sets a starting level, and a level is not decoration - it is the
   * session length, and it is the level a lapsed subscriber is returned to.
   * Every account that took this route reached the server with a default level
   * that described nobody.
   *
   * So the questions are asked. The quiz carries its own Skip for anyone who
   * genuinely does not want to answer, which is the honest place for that
   * choice: it is offered once, next to the questions being declined, instead
   * of being taken on the reader's behalf by a button on a photograph.
   */
  const skipToQuiz = () => {
    setQuizVisible(true);
  };

  /**
   * "Already have an account" pushes Login ON TOP of the slides.
   *
   * It used to call onComplete() first, which stores `@onboarded` forever, and
   * then reset the stack so Knowledge was the root. Both were wrong for the
   * person who taps this by mistake - and on a screen whose other two controls
   * are Continue and Skip, mistaking it is easy. They had not onboarded, but
   * the app recorded that they had, so the slides never came back and the quiz
   * behind them was never asked again. Their account reached the server with
   * no onboarding_level at all.
   *
   * Nothing is recorded here now. A push means Back returns to the slides they
   * were actually on, and a real returning user is marked as onboarded by
   * signing in (see handleAuthResponse), which is the event that genuinely
   * proves this device is past its first run.
   */
  const goToLogin = () => {
    navigation.navigate('Login');
  };

  const advance = () => {
    if (isLast) {
      finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  /**
   * Android back steps BACK through the slides.
   *
   * Onboarding is the stack root, so an unhandled back quits the app - from
   * slide three, on a first run, with no warning. The quiz already guards
   * against exactly this (see OnboardingQuiz); the slides in front of it did
   * not. Returning false on the first slide is deliberate: back out of the
   * first screen of the app IS quit, and that one is the reader's to make.
   */
  useEffect(() => {
    if (quizVisible) return;
    const onBack = () => {
      if (index <= 0) return false;
      listRef.current?.scrollToIndex({ index: index - 1, animated: true });
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [index, quizVisible]);

  if (quizVisible) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        <OnboardingQuiz onDone={finishQuiz} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.skipRow} pointerEvents="box-none">
        <TouchableOpacity
          onPress={skipToQuiz}
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
          <View style={[styles.slide, { width }]}>
            <View style={[styles.art, { width, height: artH }]}>
              <Image
                source={item.art}
                style={{ width, height: artH }}
                resizeMode="cover"
                accessibilityRole="image"
                accessible={false}
              />
              <Scrim width={width} artH={artH} />
            </View>
            {/* The photograph pages with the swipe; the words did not, so
                they were simply present the moment the slide arrived. Rising
                them a few points behind the image is what makes the slide feel
                like it lands rather than like it cuts. */}
            <FadeIn style={styles.copy} delay={90} resetKey={item.key}>
              <Text style={styles.title}>{t(item.titleKey)}</Text>
              <Text style={styles.body}>{t(item.bodyKey)}</Text>
            </FadeIn>
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

    </SafeAreaView>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // Floats over the photograph, inside the top safe area.
  //
  // It used to be a bare label in COLORS.white and nothing else, on the
  // reasoning that the scrim already darkens that corner. That held for
  // exactly as long as there was one appearance: in the light palette
  // COLORS.white resolves to near-black ink, which put dark text on a dark
  // photograph and made Skip disappear.
  //
  // The label is now fixed light and sits on its own scrim pill, so it does
  // not depend on the palette OR on how bright a particular photograph
  // happens to be in its top-right corner.
  skipRow: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 5,
    paddingTop: SPACE.xxl,
    paddingRight: SPACE.lg,
  },
  skipBtn: {
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.scrimSoft,
  },
  // ON_ART, not COLORS.white: this text is over a photograph, not over the
  // page, so it takes its colour from what is behind it rather than from the
  // appearance the reader chose.
  skipText: { ...TYPE.bodySm, color: ON_ART, fontWeight: '600' },

  // Width comes from the live window; only what does not depend on it is here.
  slide: { flex: 1 },
  /**
   * The photograph block.
   *
   * COLORS.bg behind it, matching what the dark scrim fades into, so the two
   * cannot disagree the way `surface` did.
   *
   * The rounded lower corners are what light mode gets instead of a fade. The
   * artwork runs full bleed to the top and both sides - it is the first thing
   * on the screen and should be - and stops at the bottom with a deliberate
   * radius, which reads as a hero card on the page. In dark mode the scrim
   * covers the same corners before they can show, so the radius costs nothing
   * there.
   */
  art: {
    backgroundColor: COLORS.bg,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
    overflow: 'hidden',
  },

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
    backgroundColor: COLORS.borderStrong,
  },
  // Sits below the photograph on the page ground, so it follows the palette.
  dotOn: { backgroundColor: COLORS.accentText, width: 22 },

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
  loginLinkStrong: { color: COLORS.accentText, fontWeight: '700' },
});
