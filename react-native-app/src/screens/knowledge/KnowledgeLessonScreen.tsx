import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
import { BASICS_DONE_KEY } from './KnowledgeScreen';
import { WhyLesson } from './lessons/WhyLesson';
import { FindLesson } from './lessons/FindLesson';
import { FirstLesson } from './lessons/FirstLesson';
import { Watermark } from '../../components/Watermark';

import { useAuth } from '../../context/AuthContext';

const LAST = 2;

export const KnowledgeLessonScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'KnowledgeLesson'>>();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { isAuthenticated, updateUserFields } = useAuth();
  const { slug, index } = route.params;

  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const isLastLesson = index >= BASICS_LESSONS.length - 1;

  const go = (n: number) => setStep(Math.max(0, Math.min(LAST, n)));

  const complete = async () => {
    try {
      const raw = await AsyncStorage.getItem(BASICS_DONE_KEY);
      const done: string[] = raw ? JSON.parse(raw) : [];
      if (!done.includes(slug)) {
        done.push(slug);
        await AsyncStorage.setItem(BASICS_DONE_KEY, JSON.stringify(done));
      }
    } catch (e) {}
    if (isLastLesson) {
      if (isAuthenticated) {
        await updateUserFields({ onboarded: true });
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      } else {
        navigation.goBack();
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
          {BASICS_LESSONS[index].title}
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
            <Text style={styles.completeBtnText}>{isLastLesson ? 'Done' : 'Next lesson'}</Text>
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
