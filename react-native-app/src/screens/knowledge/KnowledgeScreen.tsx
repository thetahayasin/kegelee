import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, NavigationProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Rect } from 'react-native-svg';
import { Chevron } from '../../components/Chevron';
import { DISABLED_OPACITY, SPACE, TYPE, Palette } from '../../theme/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Watermark } from '../../components/Watermark';
import { FadeIn } from '../../components/FadeIn';
import { BASICS_LESSONS } from '../../constants/basics';
import { RootStackParamList } from '../../navigation/AppNavigator';


// Lesson glyphs (heart / drop / play), matching knowledge/index.blade.
const lessonIconPath = (i: number) =>
  [
    'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    'M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 14.5v-9l7 4.5-7 4.5z',
  ][i % 3];

export const KnowledgeScreen = () => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { isAuthenticated, updateUserFields, markBasicsDone, basicsDone, user, logout } = useAuth();
  const [done, setDone] = useState<string[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);

  // Same shape as the paywall's: the tap has a network round trip behind it,
  // so it shows it is working rather than looking inert.
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };
  useFocusEffect(
    useCallback(() => {
      const key = user ? `@basics_done_${user.id}` : '@basics_done_guest';
      AsyncStorage.getItem(key)
        .then(v => setDone(v ? JSON.parse(v) : []))
        .catch(() => {});
    }, [user]),
  );

  const allCompleted = done.includes('why') && done.includes('find') && done.includes('first');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <Watermark />

      {/* Three columns, not a centred title with buttons floating over it.
          The sides were position:absolute, so nothing reserved room for them
          and the title simply ran underneath - "Learn the basics" is short in
          English and long in most other languages, and this header carries a
          control on BOTH edges, so it collided first and worst. Real columns
          cannot overlap at any string length. */}
      <View style={styles.header}>
        <View style={styles.headerSide}>
        {navigation.canGoBack() ? (
          <TouchableOpacity
            style={styles.backBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={() => navigation.goBack()}
          >
            <Chevron direction="back" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
        </View>

        <Text
          style={styles.headerTitle}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {t('knowledge.learnTheBasics')}
        </Text>

        <View style={[styles.headerSide, styles.headerSideEnd]}>
        {/* The corner opposite Back is the identity control: Log in for a
            guest, Log out for an account still held on the basics.

            An account that has not finished the basics is on a stack
            containing only Knowledge and KnowledgeLesson - no Settings, no
            Profile - so without this there is no way to sign out at all, and
            no way to hand the phone to a second account.

            The test used to be `!subscribed || !basicsDone`, from when a
            subscription gate sat in front of the basics one. There is no such
            gate any more: a free account is inside the app with Profile one
            tap away, so keeping the subscription half of that test would put a
            second Log out on a page that is now ordinary reading. */}
        {!isAuthenticated ? (
          <TouchableOpacity style={styles.loginLink} onPress={() => (navigation as any).navigate('Login')}>
            <Text style={styles.loginLinkText}>{t('knowledge.logIn')}</Text>
          </TouchableOpacity>
        ) : !basicsDone ? (
          <TouchableOpacity
            style={styles.loginLink}
            onPress={handleLogout}
            disabled={loggingOut}
            accessibilityRole="button"
            accessibilityLabel={t('settings.logOut')}
          >
            {loggingOut ? (
              <ActivityIndicator size="small" color={COLORS.textMuted} />
            ) : (
              <Text style={styles.logoutLinkText}>{t('settings.logOut')}</Text>
            )}
          </TouchableOpacity>
        ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
      >
        {BASICS_LESSONS.map((lesson, i) => {
          const isDone = done.includes(lesson.slug);
          const locked = i > 0 && !done.includes(BASICS_LESSONS[i - 1].slug);
          const isLast = i === BASICS_LESSONS.length - 1;
          return (
            // Staggered, 70ms apart. This is the first screen a new reader
            // lands on and it used to be three cards simply present on the
            // frame it mounted, which is the stiffest possible introduction to
            // an app whose whole subject is taking things gently.
            <FadeIn key={lesson.slug} delay={i * 70}>
            <View style={styles.step}>
              {/* The rail.
                  A numbered node per lesson and a line joining them, so the
                  sequence is visible before any of the cards are read. The
                  segment below a FINISHED lesson is drawn in the accent - the
                  path fills in behind you, which is the one thing that makes a
                  progress rail worth having over three plain rows. */}
              <View style={styles.rail}>
                <View
                  style={[
                    styles.node,
                    isDone && styles.nodeDone,
                    !isDone && !locked && styles.nodeCurrent,
                  ]}
                >
                  {isDone ? (
                    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M5 13l4 4L19 7"
                        stroke={COLORS.onAccent}
                        strokeWidth={3.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  ) : (
                    <Text style={[styles.nodeText, !locked && styles.nodeTextCurrent]}>
                      {i + 1}
                    </Text>
                  )}
                </View>
                {!isLast && (
                  <View style={[styles.railLine, isDone && styles.railLineDone]} />
                )}
              </View>

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={locked}
              style={[styles.card, styles.cardInStep, isDone && styles.cardDone, locked && styles.cardLocked]}
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
                  <Svg width={30} height={30} viewBox="0 0 24 24" fill={COLORS.accentText}>
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
            </View>
            </FadeIn>
          );
        })}

        {/* Guests: the way on is an account, not a price.
            Training is free inside the first three exercises, so there is
            nothing to sell to someone who has not signed up yet - they simply
            need somewhere for the progress to live. */}
        {!isAuthenticated && allCompleted && (
          <TouchableOpacity
            style={styles.tryBtn}
            accessibilityRole="button"
            onPress={() => (navigation as any).navigate('Register')}
          >
            <Text
              style={styles.tryBtnText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={1.2}
            >
              {t('progress.continue')}
            </Text>
          </TouchableOpacity>
        )}

        {/* A signed-in account that has finished the basics but not yet had
            the gate flipped. Nothing to do with subscriptions any more. */}
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

    </SafeAreaView>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.lg,
  },
  // Both gutters reserve a touch target's worth of space even when empty, so
  // the title stays centred whether or not there is a back button.
  headerSide: { minWidth: 44, alignItems: 'flex-start', justifyContent: 'center' },
  headerSideEnd: { alignItems: 'flex-end' },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginLink: {
    minHeight: 44,
    justifyContent: 'center',
    paddingStart: SPACE.xs,
  },
  loginLinkText: { fontSize: 15, fontWeight: '600', color: COLORS.accentText },
  // Muted, not accent. Log in is an invitation and earns the lime; log out is
  // an escape hatch, and dressing it in the app's one "act here" colour would
  // make leaving the loudest thing in the header.
  logoutLinkText: { fontSize: 15, fontWeight: '600', color: COLORS.textMuted },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 16 },
  /** One row of the path: the rail on the left, the lesson card on the right. */
  step: { flexDirection: 'row', alignItems: 'stretch' },
  rail: { width: 34, alignItems: 'center' },
  node: {
    width: 26,
    height: 26,
    borderRadius: 13,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  nodeCurrent: { borderColor: COLORS.accentText, backgroundColor: COLORS.accentWash },
  nodeDone: { backgroundColor: COLORS.accentText, borderColor: COLORS.accentText },
  nodeText: { ...TYPE.caption, fontWeight: '700', color: COLORS.textDim },
  nodeTextCurrent: { color: COLORS.accentText },
  // flex: 1 so the line always reaches the next node, whatever height the
  // card beside it turns out to be.
  railLine: { flex: 1, width: 2, marginTop: 4, backgroundColor: COLORS.border },
  railLineDone: { backgroundColor: COLORS.accentText },
  // The card no longer owns the full width; the rail takes its gutter.
  cardInStep: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 24,
    ...COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 20,
  },
  cardDone: { borderColor: COLORS.accentEdge },
  cardLocked: { opacity: DISABLED_OPACITY, borderColor: COLORS.whiteFaint },
  tile: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIdle: { backgroundColor: COLORS.accentWash },
  tileDone: { backgroundColor: COLORS.accent },
  cardInfo: { flex: 1 },
  lessonKicker: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
  },
  lessonKickerDone: { color: COLORS.accentText },
  lessonTitle: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    lineHeight: 24,
  },
  tryBtn: {
    marginTop: 24,
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
  // The buy path while the free session is still the better next step: present
  // and tappable, but not competing with the accent button above it.
  secondaryBtn: {
    marginTop: -4,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: COLORS.textMuted,
    fontWeight: '600',
    fontSize: 15,
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
