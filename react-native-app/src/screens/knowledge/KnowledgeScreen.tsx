import React, { useState, useCallback, useEffect } from 'react';
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

  useFocusEffect(
    useCallback(() => {
      const key = user ? `@basics_done_${user.id}` : '@basics_done_guest';
      AsyncStorage.getItem(key)
        .then(v => setDone(v ? JSON.parse(v) : []))
        .catch(() => {});
    }, [user]),
  );

  // Arriving with { subscribe: true } (a guest just finished the last free
  // lesson) opens the subscription sheet on load - the web's
  // knowledge.index?subscribe=1 funnel, including its 350ms settle delay.
  const promptSubscribe = !isAuthenticated && route.params?.subscribe === true;
  useEffect(() => {
    if (!promptSubscribe) return;
    navigation.setParams({ subscribe: undefined } as any);
    const t = setTimeout(() => setSheetVisible(true), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptSubscribe]);

  const allCompleted = done.includes('why') && done.includes('find') && done.includes('first');

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
          // Clear the sticky Subscribe bar on the guest funnel.
          !isAuthenticated && { paddingBottom: 120 },
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
                  Lesson {i + 1}
                </Text>
                <Text style={styles.lessonTitle}>{lesson.title}</Text>
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
    left: 16,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginLink: {
    position: 'absolute',
    right: 16,
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
