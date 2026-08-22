import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS, GLASS, TYPE, SPACE, RADIUS } from '../../theme/colors';
import {
  getMaxMeasurement,
} from '../../db/queries';
import { getDBConnection } from '../../db/sqlite';
import { getPosition, getTodayProgress, getLocalDateString } from '../../services/progression';
import { EXERCISES, LEVELS } from '../../constants/catalogues';
import { syncNow, syncIfStale } from '../../services/sync';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { EquipmentIcon } from '../../components/EquipmentIcon';
import { Watermark } from '../../components/Watermark';

export const TrainingScreen = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const isFocused = useIsFocused();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [done, setDone] = useState(0);
  const [required, setRequired] = useState(2);
  const [complete, setComplete] = useState(false);
  const [month, setMonth] = useState(1);
  const [day, setDay] = useState(1);
  const [completedDays, setCompletedDays] = useState(0);
  const [bestMeasurement, setBestMeasurement] = useState<number | null>(null);

  // Exercise list with unlocked state
  const [exerciseItems, setExerciseItems] = useState<any[]>([]);

  const loadData = async () => {
    if (!user) return;
    try {
      const db = await getDBConnection();

      // Training days and best hold are independent reads - run them together.
      const [daysRes, best] = await Promise.all([
        db.executeSql(
          'SELECT * FROM training_days WHERE user_id = ? ORDER BY date DESC',
          [user.id]
        ),
        getMaxMeasurement(user.id),
      ]);
      const trainingDays = [];
      for (let i = 0; i < daysRes[0].rows.length; i++) {
        trainingDays.push(daysRes[0].rows.item(i));
      }

      // Calculate progress
      const progress = getTodayProgress(user, trainingDays);
      setDone(progress.done);
      setRequired(progress.required);
      setComplete(progress.complete);

      const pos = getPosition(user, trainingDays);
      setMonth(pos.month);
      setDay(pos.day);
      setCompletedDays(pos.completed);

      setBestMeasurement(best > 0 ? best : null);

      // Map exercises. Admins bypass the day-gating and get the full catalogue.
      const exList = Object.values(EXERCISES).map((ex) => {
        const unlocked = user.is_admin || pos.completed >= ex.unlock_after_days;
        const daysLeft = unlocked ? 0 : Math.max(0, ex.unlock_after_days - pos.completed);
        return {
          ...ex,
          unlocked,
          daysLeft,
        };
      });
      setExerciseItems(exList);
    } catch (e) {
      console.error('Failed to load training screen data', e);
    } finally {
      setLoading(false);
    }
  };

  // Sync with backend in background. Focus-triggered, so use the staleness
  // window: hopping between tabs within a minute costs zero network and zero
  // DB churn. Pull-to-refresh below still forces a full sync.
  const triggerSync = async () => {
    if (!user) return;
    try {
      const res = await syncIfStale(user.id);
      if (res.success && !res.skipped) {
        await loadData();
      }
    } catch (e) {
      console.error('Background sync failed', e);
    }
  };

  useEffect(() => {
    if (isFocused) {
      loadData();
      triggerSync();
    }
  }, [isFocused]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (user) {
      await syncNow(user.id);
      await loadData();
    }
    setRefreshing(false);
  };

  const levelDef = user ? LEVELS[user.level_id] : null;
  const sessionLength = levelDef ? `${Math.floor(levelDef.total_session_seconds / 60)} min` : '1 min';

  // Gauge geometry. An 80% arc (288deg) with the 72deg gap rotated to the
  // bottom - the +126deg puts the gap's centre at 90deg, i.e. straight down.
  const R = 58;
  const arcLength = 2 * Math.PI * R * 0.8;
  const pct = Math.min(1, Math.max(0, done / Math.max(1, required)));
  const strokeDashoffset = arcLength * (1 - pct);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Watermark />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.accent} />
        }
      >
        {/* Header */}
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.brandOverline}>KEGELEE</Text>
            <Text style={styles.pageTitle}>Training</Text>
          </View>
          <TouchableOpacity
            style={styles.infoBtnInline}
            accessibilityRole="button"
            accessibilityLabel="Knowledge"
            hitSlop={8}
            onPress={() => navigation.navigate('Knowledge')}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Circle cx={12} cy={12} r={9} stroke={COLORS.textMuted} strokeWidth={1.8} />
              <Path d="M12 11.5v4.5" stroke={COLORS.textMuted} strokeWidth={1.8} strokeLinecap="round" />
              <Circle cx={12} cy={8} r={1} fill={COLORS.textMuted} />
            </Svg>
          </TouchableOpacity>
        </View>

        {/* Hero. The ring is the one thing a returning user opens the app to
            check, so it is the screen's single focal point rather than a
            68px circle sharing a row with a decorative dumbbell. */}
        <View style={styles.heroCard}>
          <View style={styles.heroBody}>
            <View
              style={styles.ringWrap}
              accessible
              accessibilityRole="image"
              accessibilityLabel={
                complete
                  ? `Today complete, ${done} of ${required} sessions done`
                  : `${done} of ${required} sessions done today`
              }
            >
              <View style={{ transform: [{ rotate: '126deg' }] }}>
                <Svg width={132} height={132} viewBox="0 0 132 132">
                  <Circle
                    cx={66}
                    cy={66}
                    r={R}
                    fill="none"
                    stroke="rgba(255,255,255,0.07)"
                    strokeWidth={9}
                    strokeDasharray={`${arcLength} 999`}
                    strokeLinecap="round"
                  />
                  <Circle
                    cx={66}
                    cy={66}
                    r={R}
                    fill="none"
                    stroke={COLORS.accent}
                    strokeWidth={9}
                    strokeDasharray={`${arcLength} 999`}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                </Svg>
              </View>
              <View style={styles.ringCentre} pointerEvents="none">
                <Text style={styles.ringCount}>
                  {done}
                  <Text style={styles.ringSlash}>/</Text>
                  <Text style={styles.ringTotal}>{required}</Text>
                </Text>
                <Text style={styles.ringLabel}>SESSIONS</Text>
              </View>
            </View>

            <Text style={styles.heroOverline}>
              MONTH {month}   /   DAY {day}
            </Text>
            <Text style={styles.heroHeadline}>
              {complete ? 'Today is done' : 'Ready when you are'}
            </Text>
          </View>

          {/* Action strip, seated on the card one elevation step forward. */}
          <View style={styles.actionStrip}>
            <View style={styles.actionMetaRow}>
              <View style={styles.durationRow}>
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <Circle cx={12} cy={12} r={9} stroke={COLORS.textMuted} strokeWidth={1.8} />
                  <Path d="M12 8v4l3 2" stroke={COLORS.textMuted} strokeWidth={1.8} strokeLinecap="round" />
                </Svg>
                <Text style={styles.durationText}>{sessionLength}</Text>
              </View>

              {complete && (
                <View style={styles.completeBadge}>
                  <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
                    <Path d="M5 13l4 4L19 7" stroke={COLORS.accent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                  <Text style={styles.completeBadgeText}>COMPLETE</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.startBtn}
              accessibilityRole="button"
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Workout')}
            >
              <Text style={styles.startBtnText}>
                {complete ? 'Train again' : 'Start workout'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.helperText}>
              {complete
                ? 'Extra sessions are optional'
                : `${required} session${required > 1 ? 's' : ''} completes today`}
            </Text>
          </View>
        </View>

        {/* Exercises. Was a horizontal rail, which hid most of the set
            off-screen and gave no sense of how much there is to unlock. */}
        <View style={styles.railHeader}>
          <Text style={styles.sectionTitleCompact}>Exercises</Text>
          <TouchableOpacity
            style={styles.seeAllBtn}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => navigation.navigate('AllExercises')}
          >
            <Text style={styles.seeAllText}>See all</Text>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M9 6l6 6-6 6" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </View>

        <View style={styles.exerciseGrid}>
          {exerciseItems.slice(0, 8).map((ex) => (
            <TouchableOpacity
              key={ex.slug}
              disabled={!ex.unlocked}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={
                ex.unlocked ? ex.name : `${ex.name}, unlocks in ${ex.daysLeft} days`
              }
              style={styles.exerciseCard}
              onPress={() =>
                navigation.navigate('ExerciseDetail', {
                  slug: ex.slug,
                  unlocked: ex.unlocked,
                  daysLeft: ex.daysLeft,
                })
              }
            >
              <View style={!ex.unlocked && styles.lockedArt}>
                <EquipmentIcon slug={ex.slug} size={72} />
              </View>
              <Text
                style={[styles.exerciseName, !ex.unlocked && styles.exerciseNameLocked]}
                numberOfLines={1}
              >
                {ex.name}
              </Text>
              {ex.unlocked ? (
                <Text style={styles.exerciseStatus}>Available</Text>
              ) : (
                <View style={styles.lockRow}>
                  <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
                    <Rect x={4} y={10} width={16} height={11} rx={2.5} stroke={COLORS.textDim} strokeWidth={2.4} />
                    <Path d="M8 10V7a4 4 0 1 1 8 0v3" stroke={COLORS.textDim} strokeWidth={2.4} strokeLinecap="round" />
                  </Svg>
                  <Text style={styles.exerciseStatusLocked}>{ex.daysLeft} days</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Progress */}
        <TouchableOpacity
          style={styles.progressRowLink}
          activeOpacity={0.85}
          accessibilityRole="button"
          onPress={() => navigation.navigate('Progress')}
        >
          <View style={styles.progressIconTile}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path
                d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-7"
                stroke={COLORS.accent}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
          <View style={styles.progressCopy}>
            <Text style={styles.progressLinkTitle}>Progress Tracker</Text>
            <Text style={styles.progressLinkDesc}>
              {bestMeasurement !== null
                ? `Best hold ${Math.floor(bestMeasurement)}s`
                : 'Measure daily to track progress'}
            </Text>
          </View>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="M9 5l7 7-7 7" stroke={COLORS.textDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: { paddingBottom: 40 },

  /* Header ------------------------------------------------------------- */
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.xl,
    paddingBottom: SPACE.lg,
  },
  brandOverline: { ...TYPE.overline, color: COLORS.textDim, marginBottom: 2 },
  pageTitle: { ...TYPE.display, color: COLORS.white },
  infoBtnInline: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    ...GLASS,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Hero --------------------------------------------------------------- */
  heroCard: {
    marginHorizontal: SPACE.lg,
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  heroBody: { paddingHorizontal: SPACE.xl, paddingTop: 28, paddingBottom: SPACE.xl, alignItems: 'center' },
  ringWrap: { width: 132, height: 132, justifyContent: 'center', alignItems: 'center' },
  ringCentre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringCount: { fontSize: 36, fontWeight: '800', letterSpacing: -1.4, color: COLORS.white },
  ringSlash: { color: COLORS.textDim, fontWeight: '800' },
  ringTotal: { color: COLORS.textMuted, fontWeight: '800' },
  ringLabel: { ...TYPE.overline, fontSize: 10, color: COLORS.textDim, marginTop: 3 },
  heroOverline: { ...TYPE.overline, color: COLORS.textDim, marginTop: SPACE.xl },
  heroHeadline: { ...TYPE.heading, color: COLORS.white, marginTop: 6 },

  /* Action strip -------------------------------------------------------- */
  actionStrip: {
    backgroundColor: COLORS.surface2,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.lg,
  },
  actionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
  },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  durationText: { ...TYPE.bodySm, color: COLORS.textMuted },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentWash,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    gap: 5,
  },
  completeBadgeText: { ...TYPE.overline, fontSize: 10, color: COLORS.accent },
  startBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startBtnText: { color: COLORS.onAccent, fontWeight: '700', fontSize: 15, letterSpacing: -0.2 },
  helperText: { ...TYPE.caption, color: COLORS.textDim, textAlign: 'center', marginTop: 10 },

  /* Exercises ----------------------------------------------------------- */
  railHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: SPACE.lg + 4,
    paddingTop: SPACE.xxl,
    paddingBottom: SPACE.md,
  },
  sectionTitleCompact: { ...TYPE.section, color: COLORS.white },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { ...TYPE.bodySm, color: COLORS.textMuted, fontWeight: '600' },
  exerciseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACE.lg,
    gap: SPACE.md,
  },
  exerciseCard: {
    // Two per row, accounting for the 12px gap between them.
    width: '48%',
    flexGrow: 1,
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 14,
    alignItems: 'center',
  },
  // Locked art is dimmed but the card itself stays at full opacity, so a
  // locked row reads as "not yet earned" rather than as a broken card.
  lockedArt: { opacity: 0.4 },
  exerciseName: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
    width: '100%',
    marginTop: SPACE.md,
  },
  exerciseNameLocked: { color: COLORS.textMuted },
  exerciseStatus: { ...TYPE.caption, color: COLORS.accent, fontWeight: '600', marginTop: 2 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  exerciseStatusLocked: { ...TYPE.caption, color: COLORS.textDim, fontWeight: '600' },

  /* Progress ------------------------------------------------------------ */
  progressRowLink: {
    marginHorizontal: SPACE.lg,
    marginTop: SPACE.md,
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
  },
  progressIconTile: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.accentWash,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCopy: { flex: 1 },
  progressLinkTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, color: COLORS.white },
  progressLinkDesc: { ...TYPE.bodySm, color: COLORS.textMuted, marginTop: 2 },
});
