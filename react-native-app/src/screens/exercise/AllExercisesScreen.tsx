import React, { useState, useEffect } from 'react';
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
import { useNavigation, useIsFocused, NavigationProp } from '@react-navigation/native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Chevron } from '../../components/Chevron';
import { useAuth } from '../../context/AuthContext';
import { TYPE, SPACE, RADIUS, Palette } from '../../theme/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import { getDBConnection } from '../../db/sqlite';
import { getPosition } from '../../services/progression';
import { EXERCISES, exerciseGateState, exerciseNameKey } from '../../constants/catalogues';
import { EquipmentIcon } from '../../components/EquipmentIcon';
import { Watermark } from '../../components/Watermark';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { track } from '../../services/events';

type Row = {
  slug: string;
  unlocked: boolean;
  /** Held by the subscription rather than by a day count. */
  subLocked: boolean;
  daysLeft: number;
  completed: number;
  threshold: number;
  pct: number;
};

// Full catalogue with per-exercise unlock progress bars, mirroring the web
// exercises/index page reached from the Training rail's "See All".
export const AllExercisesScreen = () => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const { user, subscribed } = useAuth();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  // Bumped by the retry to re-run the load effect.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;

    const load = async () => {
      if (!user) return;
      try {
        const db = await getDBConnection();
        const daysRes = await db.executeSql(
          'SELECT * FROM training_days WHERE user_id = ? ORDER BY date DESC',
          [user.id],
        );
        const trainingDays = [];
        for (let i = 0; i < daysRes[0].rows.length; i++) {
          trainingDays.push(daysRes[0].rows.item(i));
        }

        const pos = getPosition(user, trainingDays);
        const completedDays = pos.completed;

        const list: Row[] = Object.values(EXERCISES)
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((ex) => {
            // The two locks, and why they are different, live in
            // exerciseGateState - this was the third copy of the same
            // decision, and the only one that guarded the day-0 divide by
            // zero.
            const threshold = ex.unlock_after_days;
            const gate = exerciseGateState(ex, completedDays, {
              subscribed,
              isAdmin: !!user.is_admin,
            });
            return {
              slug: ex.slug,
              unlocked: gate.unlocked,
              subLocked: gate.subLocked,
              daysLeft: gate.daysLeft,
              completed: Math.min(completedDays, threshold),
              threshold,
              pct: gate.progressPercent,
            };
          });

        if (!cancelled) {
          setRows(list);
          setLoadFailed(false);
        }
      } catch (e) {
        console.error('Failed to load exercises list', e);
        // Say so and offer the retry rather than presenting an empty
        // catalogue as though the user had simply unlocked nothing.
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // `subscribed` belongs here: the rows are computed from it, so without
    // it the list would keep showing padlocks after a purchase until the
    // screen happened to refocus.
  }, [isFocused, user, reloadKey, subscribed]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </SafeAreaView>
    );
  }

  if (loadFailed) {
    return (
      <SafeAreaView style={styles.loading}>
        {/* Its own copy. A list that did not load is almost always a network
            or database read that did not come back, not a crash, and the crash
            handler's wording sent readers looking for a bug. */}
        <Text style={styles.errorText}>{t('common.couldNotLoad')}</Text>
        <TouchableOpacity
          style={styles.errorRetryBtn}
          accessibilityRole="button"
          onPress={() => {
            setLoading(true);
            setLoadFailed(false);
            setReloadKey((k) => k + 1);
          }}
        >
          <Text style={styles.errorRetryText}>{t('progress.tryAgain')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const renderRow = (row: Row) => (
    <View style={styles.rowInner}>
      <View style={!row.unlocked && styles.lockedArt}>
        <EquipmentIcon slug={row.slug} size={56} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowName, !row.unlocked && styles.rowNameLocked]}>
          {t(exerciseNameKey(row.slug))}
        </Text>
        {row.unlocked ? (
          <Text style={styles.rowAvailable}>{t('allExercises.available')}</Text>
        ) : (
          <>
            <View style={styles.lockRow}>
              <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                <Rect
                  x={4}
                  y={10}
                  width={16}
                  height={11}
                  rx={2.5}
                  stroke={row.subLocked ? COLORS.accent : COLORS.textDim}
                  strokeWidth={2.2}
                />
                <Path
                  d="M8 10V7a4 4 0 1 1 8 0v3"
                  stroke={row.subLocked ? COLORS.accent : COLORS.textDim}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                />
              </Svg>
              {/* This line used to be hardcoded English - the one string on
                  the screen that never went through i18n. It now uses the same
                  key the training grid does, so the two agree word for word.

                  A locked row says "Premium" and nothing else. It said "Part
                  of the subscription", which is a sentence about billing
                  stapled to an exercise - the reader wants to know what the
                  row is, not to be told the terms. */}
              <Text style={[styles.rowMuted, row.subLocked && styles.rowSubLocked]}>
                {row.subLocked
                  ? t('premium.badge')
                  : t('training.daysLeft', { count: row.daysLeft })}
              </Text>
            </View>
            {!row.subLocked && (
              <View
                style={styles.progressBarBg}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={t('allExercises.unlockProgressA11y', {
                  name: t(exerciseNameKey(row.slug)),
                })}
                accessibilityValue={{ min: 0, max: row.threshold, now: row.completed }}
              >
                <View style={[styles.progressBarFill, { width: `${row.pct}%` }]} />
              </View>
            )}
          </>
        )}
      </View>
      {row.unlocked ? (
        <Chevron size={20} color={COLORS.textDim} />
      ) : row.subLocked ? (
        <Text style={styles.rowSubCta} numberOfLines={1}>
          {t('premium.badge')}
        </Text>
      ) : (
        <Text style={styles.rowRatio}>
          {row.completed}/{row.threshold}
        </Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <Watermark />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('allExercises.backA11y')}
          hitSlop={8}
          onPress={() => navigation.goBack()}
        >
          <Chevron direction="back" size={24} color={COLORS.textMuted} />
        </TouchableOpacity>
        {/* Title flexes between the button and the trailing gutter rather
            than being centred underneath an absolutely positioned one. */}
        <Text
          style={styles.headerTitle}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {t('allExercises.exercises')}
        </Text>
        {/* Balances the back button so the title sits centred. */}
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {rows.map((row) =>
          row.unlocked || row.subLocked ? (
            <TouchableOpacity
              key={row.slug}
              activeOpacity={0.85}
              accessibilityRole="button"
              style={styles.row}
              onPress={() => {
                if (row.subLocked) {
                  // WHICH padlock was pressed, in the meta. The subject stays
                  // 'exercise' so this row groups with the other four locks in
                  // the app rather than splintering into one bucket per
                  // exercise, and the slug is still there for the question
                  // "which one is worth unlocking first".
                  track(user?.id, 'lock_tapped', 'exercise', null, { slug: row.slug });
                  navigation.navigate('Paywall', { source: 'exercise' });
                  return;
                }
                navigation.navigate('ExerciseDetail', {
                  slug: row.slug,
                  unlocked: true,
                  daysLeft: 0,
                });
              }}
            >
              {renderRow(row)}
            </TouchableOpacity>
          ) : (
            <View key={row.slug} style={styles.row}>
              {renderRow(row)}
            </View>
          ),
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    ...TYPE.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: SPACE.xl,
  },
  errorRetryBtn: {
    marginTop: SPACE.lg,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  errorRetryText: { ...TYPE.bodySm, fontWeight: '700', color: COLORS.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.lg,
  },
  headerSpacer: { width: 44 },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...TYPE.title, flex: 1, textAlign: 'center', color: COLORS.white },
  scroll: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, paddingBottom: 40, gap: SPACE.md },
  row: {
    ...COLORS.glass,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.lg,
    paddingVertical: 14,
  },
  // The card keeps full opacity; only the artwork dims. A whole row at
  // opacity 0.5 reads as broken rather than as not yet earned.
  lockedArt: { opacity: 0.4 },
  /* A subscription lock wears the accent: it is an offer, not a wait. */
  rowSubLocked: { color: COLORS.accentText },
  rowSubCta: { ...TYPE.caption, color: COLORS.accentText, fontWeight: '700' },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4, color: COLORS.white, lineHeight: 22 },
  rowNameLocked: { color: COLORS.textMuted },
  rowAvailable: { ...TYPE.bodySm, color: COLORS.accentText, fontWeight: '600', marginTop: 2 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  rowMuted: { ...TYPE.bodySm, color: COLORS.textMuted },
  progressBarBg: {
    height: 6,
    width: '100%',
    backgroundColor: COLORS.whiteFaint,
    borderRadius: 3,
    marginTop: SPACE.sm,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.accentText,
    borderRadius: 3,
  },
  rowRatio: {
    alignSelf: 'flex-start',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDim,
  },
});

export default AllExercisesScreen;
