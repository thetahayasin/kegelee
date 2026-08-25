import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useRoute,
  useNavigation,
  RouteProp,
  NavigationProp,
  StackActions,
} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { COLORS, GLASS } from '../../theme/colors';
import { BASICS_LESSONS } from '../../constants/basics';
import { RootStackParamList } from '../../navigation/AppNavigator';

import { WhyLesson } from './lessons/WhyLesson';
import { FindLesson } from './lessons/FindLesson';
import { FirstLesson } from './lessons/FirstLesson';
import { Watermark } from '../../components/Watermark';

import { useAuth } from '../../context/AuthContext';

const LAST = 2;

export const KnowledgeLessonScreen = () => {
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
    if (isLastLesson) {
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
        // Guest finished the free lessons: return to the lesson list and open
        // the subscription sheet (pick a plan, create the account, purchase)
        // - the web's knowledge.index?subscribe=1 funnel.
        // Knowledge is this stack's root, so navigate pops back to it with the
        // param set; cast past the RootStack param list the same way
        // KnowledgeScreen does.
        (navigation as any).navigate('Knowledge', { subscribe: true });
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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

      {/* Step dots */}
      <View style={styles.dots}>
        {Array.from({ length: LAST + 1 }).map((_, i) => (
          <View key={i} style={[styles.dot, i <= step ? styles.dotActive : styles.dotIdle]} />
        ))}
      </View>

      <View style={styles.body}>
        {slug === 'why' ? (
          <WhyLesson {...lessonProps} />
        ) : slug === 'find' ? (
          <FindLesson {...lessonProps} />
        ) : (
          <FirstLesson {...lessonProps} />
        )}
      </View>

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

const styles = StyleSheet.create({
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
  dotActive: { width: 24, backgroundColor: COLORS.accent },
  dotIdle: { width: 6, backgroundColor: 'rgba(255,255,255,0.15)' },
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
    ...GLASS,
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
