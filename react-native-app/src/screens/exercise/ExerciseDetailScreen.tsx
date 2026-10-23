import React, { useEffect } from 'react';
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
  useRoute,
  useNavigation,
  RouteProp,
  NavigationProp,
} from '@react-navigation/native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Chevron } from '../../components/Chevron';
import { Palette } from '../../theme/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import {
  EXERCISES,
  exerciseNameKey,
  exerciseDescriptionKey,
  exerciseHowToKey,
} from '../../constants/catalogues';
import { EquipmentIcon } from '../../components/EquipmentIcon';
import { Watermark } from '../../components/Watermark';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useAuth } from '../../context/AuthContext';
import { track } from '../../services/events';

const LockIcon = ({ color, size = 20 }: { color: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={5} y={11} width={14} height={9} rx={2} stroke={color} strokeWidth={1.8} />
    <Path d="M8 11V8a4 4 0 018 0v3" stroke={color} strokeWidth={1.8} />
  </Svg>
);

export const ExerciseDetailScreen = () => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RootStackParamList, 'ExerciseDetail'>>();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { slug, unlocked, daysLeft } = route.params;
  const ex = EXERCISES[slug];

  /**
   * Somebody looked at this exercise, and whether they could do it yet.
   *
   * The locked reads are the interesting half: an exercise people keep opening
   * and cannot start is the strongest signal the app has about what is worth
   * paying for, and the padlock alone could not say which one they came to
   * see. days_left carries how far off the unlock was, so "two days away" and
   * "thirty" are not the same number.
   *
   * Above the missing-exercise early return so the hook is unconditional, and
   * once per mount - this screen is pushed fresh each time.
   */
  useEffect(() => {
    track(user?.id, 'exercise_previewed', slug, unlocked ? 'unlocked' : 'locked', {
      days_left: daysLeft,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ex) {
    // A header and a way out, not a sentence floating at the top of a blank
    // page. This state is reached from a stale deep link or a renamed slug,
    // and the version without the back button was a dead end: no header, no
    // control, nothing but the system gesture.
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        <Watermark />
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={() => navigation.goBack()}
          >
            <Chevron direction="back" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('allExercises.exercises')}
          </Text>
          <View style={styles.headerGutter} />
        </View>
        <View style={styles.notFound}>
          <Text style={styles.description}>{t('exerciseDetail.exerciseNotFound')}</Text>
          <TouchableOpacity
            style={styles.notFoundBtn}
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.notFoundBtnText}>{t('workout.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <Watermark />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => navigation.goBack()}
        >
          <Chevron direction="back" size={24} color={COLORS.textMuted} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t(exerciseNameKey(slug))}
        </Text>
        <View style={styles.headerGutter} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <EquipmentIcon slug={slug} size={128} bare />
        </View>

        <View style={styles.body}>
          {!unlocked && (
            <View style={styles.lockBanner}>
              <LockIcon color={COLORS.accentText} />
              <Text style={styles.lockBannerText}>
                {t('exerciseDetail.completeMoreDaysToUnlock', { count: daysLeft })}
              </Text>
            </View>
          )}

          <Text style={styles.description}>{t(exerciseDescriptionKey(slug))}</Text>
          <Text style={styles.howTo}>{t(exerciseHowToKey(slug))}</Text>
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={styles.cta}>
        {unlocked ? (
          <TouchableOpacity
            style={styles.tryBtn}
            onPress={() => navigation.navigate('Workout', { trialSlug: slug })}
          >
            <Text style={styles.tryBtnText}>{t('exerciseDetail.tryItNow')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.lockedBtn}>
            <LockIcon color={COLORS.textMuted} />
            <Text style={styles.lockedBtnText}>
              {t('exerciseDetail.lockedDaysLeft', { count: daysLeft })}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Balances the back button so the title stays optically centred. */
  headerGutter: {
    width: 44,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  notFoundBtn: {
    marginTop: 20,
    minHeight: 48,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  scroll: {
    paddingBottom: 120,
  },
  hero: {
    marginHorizontal: 16,
    aspectRatio: 16 / 9,
    borderRadius: 24,
    ...COLORS.glass,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  heroGlow: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: COLORS.whiteFaint,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.accentWash,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  lockBannerText: {
    flex: 1,
    color: COLORS.accentText,
    fontSize: 14,
  },
  description: {
    color: COLORS.textMuted,
    fontSize: 15,
    lineHeight: 23,
  },
  howTo: {
    marginTop: 16,
    color: COLORS.textMuted,
    fontSize: 15,
    lineHeight: 23,
  },
  cta: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.navBar,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
  },
  tryBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tryBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  lockedBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  lockedBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
});
