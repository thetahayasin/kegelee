import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useNavigation,
  useFocusEffect,
  useRoute,
  NavigationProp,
  RouteProp,
} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Rect } from 'react-native-svg';
import { COLORS, GLASS, DISABLED_OPACITY } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { Watermark } from '../../components/Watermark';
import { SubscribeSheet } from '../../components/SubscribeSheet';
import { BASICS_LESSONS } from '../../constants/basics';
import { hasUsedFreeSession } from '../../services/freeSession';
import { RootStackParamList, AuthStackParamList } from '../../navigation/AppNavigator';


// Lesson glyphs (heart / drop / play), matching knowledge/index.blade.
const lessonIconPath = (i: number) =>
  [
    'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    'M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 14.5v-9l7 4.5-7 4.5z',
  ][i % 3];

export const KnowledgeScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'Knowledge'>>();
  const { isAuthenticated, updateUserFields, markBasicsDone, basicsDone, user } = useAuth();
  const [done, setDone] = useState<string[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  // Whether the one free session is still available. Re-read on focus, not
  // once on mount: this screen is what the guest returns to after declining
  // the offer, after quitting the workout, and after finishing it, and only
  // the last of those spends it.
  const [freeSessionLeft, setFreeSessionLeft] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const key = user ? `@basics_done_${user.id}` : '@basics_done_guest';
      AsyncStorage.getItem(key)
        .then(v => setDone(v ? JSON.parse(v) : []))
        .catch(() => {});
      hasUsedFreeSession()
        .then(used => setFreeSessionLeft(!used))
        .catch(() => setFreeSessionLeft(false));
    }, [user]),
  );

  const allCompleted = done.includes('why') && done.includes('find') && done.includes('first');

  // Show the plans as soon as a guest has run out of free material.
  //
  // This used to fire only on { subscribe: true }, the param the last lesson
  // passes on its way back here. That covered someone finishing in one sitting
  // and nothing else: a guest who closed the app and reopened it landed on a
  // fully ticked lesson list with no next step and no way to buy anything. The
  // condition that actually matters is "finished everything free, still cannot
  // train", so key on that instead of on how they arrived.
  //
  // Signed-in users never reach this branch - the navigator sends an
  // unsubscribed account to the paywall stack, which has no Knowledge route -
  // so `isAuthenticated` is the whole entitlement check here.
  //
  // The ref makes it once per mount: dismissing the sheet has to mean
  // dismissed, or the screen becomes a trap. The 350ms lets the list settle
  // first, matching the web funnel.
  const promptedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated || !allCompleted || promptedRef.current) return;
    promptedRef.current = true;
    if (route.params?.subscribe) {
      navigation.setParams({ subscribe: undefined } as any);
    }
    const timer = setTimeout(() => setSheetVisible(true), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, allCompleted]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Watermark />

      <View style={styles.header}>
        {navigation.canGoBack() ? (
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path d="M15 6l-6 6 6 6" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.headerTitle}>{t('knowledge.learnTheBasics')}</Text>
        {!isAuthenticated ? (
          <TouchableOpacity style={styles.loginLink} onPress={() => (navigation as any).navigate('Login')}>
            <Text style={styles.loginLinkText}>{t('knowledge.logIn')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          // Clear the sticky Subscribe bar on the guest funnel - and the free
          // session button too when it is showing, or the last lesson card
          // ends up underneath it.
          !isAuthenticated && {
            paddingBottom: allCompleted && freeSessionLeft ? 190 : 120,
          },
        ]}
      >
        {BASICS_LESSONS.map((lesson, i) => {
          const isDone = done.includes(lesson.slug);
          const locked = i > 0 && !done.includes(BASICS_LESSONS[i - 1].slug);
          return (
            <TouchableOpacity
              key={lesson.slug}
              activeOpacity={0.85}
              disabled={locked}
              style={[styles.card, isDone && styles.cardDone, locked && styles.cardLocked]}
              onPress={() =>
                navigation.navigate('KnowledgeLesson', { slug: lesson.slug, index: i })
              }
            >
              <View style={[styles.tile, isDone ? styles.tileDone : styles.tileIdle]}>
                {isDone ? (
                  <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
                    <Path d="M5 13l4 4L19 7" stroke={COLORS.onAccent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                ) : locked ? (
                  <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
                    <Rect x={5} y={11} width={14} height={9} rx={2} stroke={COLORS.textMuted} strokeWidth={1.8} />
                    <Path d="M8 11V8a4 4 0 018 0v3" stroke={COLORS.textMuted} strokeWidth={1.8} />
                  </Svg>
                ) : (
                  <Svg width={30} height={30} viewBox="0 0 24 24" fill={COLORS.accent}>
                    <Path d={lessonIconPath(i)} />
                  </Svg>
                )}
              </View>

              <View style={styles.cardInfo}>
                <Text style={[styles.lessonKicker, isDone && styles.lessonKickerDone]}>
                  {t('knowledge.lessonNumber', { number: i + 1 })}
                </Text>
                <Text style={styles.lessonTitle}>{t(lesson.titleKey)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Only while still gated: once basics are done this screen is a review
            page (opened from Training), where the button is noise. */}
        {isAuthenticated && allCompleted && !basicsDone && (
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={() => {
              // Flip the gate FIRST - that swaps the navigator to the main app
              // (MainTabs) immediately; no manual reset needed (MainTabs isn't
              // in this gated navigator anyway). Persist in the background so a
              // slow/failing DB write can't make the button do nothing.
              markBasicsDone();
              updateUserFields({ onboarded: true }).catch(() => {});
            }}
          >
            <Text style={styles.continueBtnText}>{t('knowledge.continueToTraining')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* The way back to the free session.
          The offer appears once, at the end of the last lesson. Someone who
          taps "Not now" there - or who quits the workout partway, or who closes
          the app mid-lesson and comes back later - would otherwise never see it
          again, having never actually used the product. It is only spent by
          FINISHING a session, so it keeps being offered here until then. */}
      {!isAuthenticated && allCompleted && freeSessionLeft && (
        <View style={styles.tryBar}>
          <TouchableOpacity
            style={styles.tryBtn}
            onPress={() => (navigation as any).navigate('FreeSessionOffer')}
          >
            <Text
              style={styles.tryBtnText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={1.2}
            >
              {t('workoutComplete.tryItNow')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Guest sales funnel: sticky Subscribe bar + plans/auth bottom sheet
          (web: @livewire('app.subscribe-sheet') on knowledge.index). */}
      {!isAuthenticated && (
        <SubscribeSheet
          visible={sheetVisible}
          onOpen={() => setSheetVisible(true)}
          onClose={() => setSheetVisible(false)}
          onNavigateToVerify={(email) =>
            (navigation as any).navigate('VerifyEmail', { email })
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backBtn: {
    position: 'absolute',
    start: 16,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginLink: {
    position: 'absolute',
    end: 16,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  loginLinkText: { fontSize: 15, fontWeight: '600', color: COLORS.accent },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.white },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 24,
    ...GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: COLORS.surface,
    padding: 20,
  },
  cardDone: { borderColor: 'rgba(193,255,114,0.35)' },
  cardLocked: { opacity: DISABLED_OPACITY, borderColor: 'rgba(255,255,255,0.05)' },
  tile: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIdle: { backgroundColor: 'rgba(193,255,114,0.12)' },
  tileDone: { backgroundColor: COLORS.accent },
  cardInfo: { flex: 1 },
  lessonKicker: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
  },
  lessonKickerDone: { color: COLORS.accent },
  lessonTitle: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    lineHeight: 24,
  },
  // Sits above the sticky Subscribe bar the SubscribeSheet renders, so the
  // free session is offered before the price rather than under it.
  tryBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 84,
    paddingHorizontal: 20,
  },
  tryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 24,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tryBtnText: {
    color: COLORS.onAccent,
    fontWeight: 'bold',
    fontSize: 16,
  },
  continueBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 24,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  continueBtnText: {
    color: COLORS.onAccent,
    fontWeight: 'bold',
    fontSize: 16,
  },
});
