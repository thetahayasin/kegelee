import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import type { AuthStackParamList } from '../../navigation/AppNavigator';
import { COLORS } from '../../theme/colors';
import { HeartVisual, StopwatchVisual, ProgressVisual, HabitVisual } from '../../components/OnboardingVisuals';
import { Watermark } from '../../components/Watermark';
import { SubscribeSheet } from '../../components/SubscribeSheet';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: 1,
    title: 'Get stronger, naturally',
    body: 'You train your pelvic floor like any other muscle. No pills, no side effects. You put in a few minutes, you keep the strength.',
    cta: 'Next',
  },
  {
    id: 2,
    title: 'You only need a minute',
    body: 'Your first sessions take one minute. Do them on the couch, at your desk, anywhere.',
    cta: 'Next',
  },
  {
    id: 3,
    title: 'Watch yourself get stronger',
    body: 'You finish your sessions, your streak grows, and new exercises unlock as you improve. You will feel the difference week after week.',
    cta: 'Next',
  },
  {
    id: 4,
    title: 'Make it your habit',
    body: 'Set reminders that fit your day. A few minutes daily, and you get results that last.',
    cta: 'Get Started',
  },
];

interface OnboardingScreenProps {
  onComplete: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const navigation = useNavigation<NavigationProp<AuthStackParamList>>();

  // Finishing / skipping the slides ends on the subscription plans (the web
  // Onboarding::finish() dispatching open-subscribe-sheet). The sheet handles
  // plan pick + inline register/login; DISMISSING it drops the guest to the
  // free basics preview (the sheet's closeTo), which becomes the stack root.
  // "Log in" instead opens sign-in on top of the basics, so closing sign-in
  // falls back to them.
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
  // Registering (or an unverified sign-in) from the sheet continues on the
  // email-code screen, stacked over the basics so backing out lands there.
  const goToVerify = (email: string) => {
    onComplete();
    navigation.reset({
      index: 1,
      routes: [{ name: 'Knowledge' }, { name: 'VerifyEmail', params: { email } }],
    });
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollOffset / width);
    setActiveIndex(index);
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: activeIndex + 1,
        animated: true,
      });
    } else {
      finish();
    }
  };

  const handleBack = () => {
    if (activeIndex > 0) {
      flatListRef.current?.scrollToIndex({
        index: activeIndex - 1,
        animated: true,
      });
    }
  };

  const renderVisual = (index: number) => {
    const active = activeIndex === index;
    switch (index) {
      case 0:
        return <HeartVisual active={active} />;
      case 1:
        return <StopwatchVisual active={active} />;
      case 2:
        return <ProgressVisual active={active} />;
      case 3:
        return <HabitVisual active={active} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Watermark />
      {/* Top bar: back (left) + close (right) */}
      <View style={styles.header}>
        {activeIndex > 0 ? (
          <TouchableOpacity onPress={handleBack} style={styles.headerBtn}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path d="M15 6l-6 6 6 6" stroke={COLORS.white} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}
        <TouchableOpacity onPress={finish} style={styles.headerBtn}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M18 6L6 18M6 6l12 12" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      </View>

      {/* Slide Carousel */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item, index }) => (
          <View style={styles.slide}>
            <View style={styles.visualContainer}>{renderVisual(index)}</View>
            <View style={styles.textContainer}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>
          </View>
        )}
      />

      {/* Footer / CTA and Indicators */}
      <View style={styles.footer}>
        {/* Pagination Dots */}
        <View style={styles.dotsContainer}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                activeIndex === i ? styles.activeDot : styles.inactiveDot,
              ]}
            />
          ))}
        </View>

        {activeIndex < SLIDES.length - 1 ? (
          <View style={styles.navRow}>
            <TouchableOpacity style={styles.arrowButton} onPress={handleNext}>
              <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                <Path d="M9 6l6 6-6 6" stroke={COLORS.onAccent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.ctaButton} onPress={handleNext}>
            <Text style={styles.ctaButtonText}>{SLIDES[activeIndex].cta}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.loginLink} onPress={goToLogin}>
          <Text style={styles.loginLinkText}>
            {t('onboarding.alreadyHaveAnAccount')} <Text style={styles.loginLinkStrong}>{t('onboarding.logIn')}</Text>
          </Text>
        </TouchableOpacity>
      </View>

      {/* Google Play plans shown after the slides; dismissing goes to the
          basics (web: <livewire:app.subscribe-sheet :show-bar="false" />). */}
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
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    height: 50,
  },
  logoText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.accent,
    letterSpacing: 2,
  },
  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  skipText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  slide: {
    width: width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  visualContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 36,
  },
  body: {
    fontSize: 17,
    color: COLORS.textMuted,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  activeDot: {
    width: 20,
    backgroundColor: COLORS.accent,
  },
  inactiveDot: {
    width: 8,
    backgroundColor: COLORS.whiteFaint,
  },
  ctaButton: {
    backgroundColor: COLORS.accent,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navRow: {
    alignItems: 'center',
  },
  arrowButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginLink: {
    marginTop: 18,
    alignItems: 'center',
  },
  loginLinkText: {
    color: COLORS.whiteMuted,
    fontSize: 14,
  },
  loginLinkStrong: {
    color: COLORS.accent,
    fontWeight: 'bold',
    paddingLeft: 4,
  },
});
export default OnboardingScreen;
