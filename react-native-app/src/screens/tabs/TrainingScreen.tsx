import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS, GLASS, DISABLED_OPACITY } from '../../theme/colors';
import {
  getMaxMeasurement,
} from '../../db/queries';
import { getDBConnection } from '../../db/sqlite';
import { getPosition, getTodayProgress } from '../../services/progression';
import { EXERCISES, LEVELS } from '../../constants/catalogues';
import { syncNow, syncIfStale } from '../../services/sync';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
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
  const [, setCompletedDays] = useState(0);
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
    // Intentionally keyed to focus/mount only: loadData is recreated every
    // render, so listing it here would refetch in a loop. Wrap it in
    // useCallback before adding it to these deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Circle Arc properties
  const arcLength = 158.336;
  const strokeDashoffset = arcLength * (1 - Math.min(1, Math.max(0, done / Math.max(1, required))));

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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.accent} />
        }
      >
        {/* Title Row */}
        <View style={styles.titleRow}>
          <Text style={styles.pageTitle}>Training</Text>
          <TouchableOpacity
            style={styles.infoBtnInline}
            onPress={() => navigation.navigate('Knowledge')}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Circle cx={12} cy={12} r={9} stroke={COLORS.textMuted} strokeWidth={1.8} />
              <Path d="M12 11.5v4.5" stroke={COLORS.textMuted} strokeWidth={1.8} strokeLinecap="round" />
              <Circle cx={12} cy={8} r={1} fill={COLORS.textMuted} />
            </Svg>
          </TouchableOpacity>
        </View>
        {/* Today Card */}
        <View style={styles.todayCard}>
          {/* Soft accent bloom. The old decoration was a flat 176pt circle at
              3% white, clipped by the card, so it landed as a hard grey arc
              cutting the corner rather than as depth. A radial gradient fading
              to zero has no edge to catch, and carries the brand colour. */}
          <View style={styles.todayCardGlow} pointerEvents="none">
            <Svg width={220} height={220} viewBox="0 0 220 220">
              <Defs>
                <RadialGradient id="todayCardGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={COLORS.accent} stopOpacity={0.16} />
                  <Stop offset="0.55" stopColor={COLORS.accent} stopOpacity={0.05} />
                  <Stop offset="1" stopColor={COLORS.accent} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={110} cy={110} r={110} fill="url(#todayCardGlow)" />
            </Svg>
          </View>
          
          <View style={styles.todayCardTop}>
            {/* SVG Arc Progress Circle */}
            <View style={styles.progressCircleContainer}>
              <View style={{ transform: [{ rotate: '126deg' }] }}>
                <Svg width={68} height={68} viewBox="0 0 68 68">
                  <Circle
                    cx={34}
                    cy={34}
                    r={31.5}
                    fill="none"
                    stroke="rgba(255,255,255,0.10)"
                    strokeWidth={5}
                    strokeDasharray={`${arcLength} 197.920`}
                    strokeLinecap="round"
                  />
                  <Circle
                    cx={34}
                    cy={34}
                    r={31.5}
                    fill="none"
                    stroke={COLORS.accent}
                    strokeWidth={5}
                    strokeDasharray={`${arcLength} 197.920`}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                </Svg>
              </View>
              <View style={styles.progressTextContainer}>
                <Text style={styles.progressText}>{`${done}/${required}`}</Text>
              </View>
            </View>

            {/* Dumbbell Equipment Icon (Inline SVG) */}
            <View style={styles.equipmentIcon}>
              <Svg width={88} height={88} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M6.5 6.5l11 11M3 6.5l3.5-3.5 3.5 3.5-3.5 3.5L3 6.5zm11 11l3.5-3.5 3.5 3.5-3.5 3.5-3.5-3.5z"
                  stroke={COLORS.accent}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          </View>

          {complete && (
            <View style={styles.completeBadge}>
              <Text style={styles.completeBadgeText}>COMPLETED</Text>
              <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                <Path d="M5 13l4 4L19 7" stroke={COLORS.accent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
          )}

          <Text style={styles.todayCardTitle}>
            Month {month} <Text style={styles.dot}>·</Text> Day {day}
          </Text>

          {/* Start Strip */}
          <View style={styles.startStrip}>
            <View style={styles.durationRow}>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Circle cx={12} cy={12} r={9} stroke={COLORS.textMuted} strokeWidth={1.8} />
                <Path d="M12 8v4l3 2" stroke={COLORS.textMuted} strokeWidth={1.8} strokeLinecap="round" />
              </Svg>
              <Text style={styles.durationText}>{sessionLength}</Text>
            </View>
            
            <Text style={styles.infoText}>
              {complete
                ? 'Day complete - extra sessions are optional'
                : `Complete ${required} training session${required > 1 ? 's' : ''} a day to finish a training day`}
            </Text>

            <TouchableOpacity
              style={styles.startBtn}
              onPress={() => navigation.navigate('Workout')}
            >
              <Text style={styles.startBtnText}>Start workout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Exercises Section */}
        <View style={styles.railHeader}>
          <Text style={styles.sectionTitleCompact}>Exercises</Text>
          <TouchableOpacity
            style={styles.seeAllBtn}
            onPress={() => navigation.navigate('AllExercises')}
          >
            <Text style={styles.seeAllText}>See All</Text>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M9 6l6 6-6 6" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.exerciseRail}
        >
          {exerciseItems.slice(0, 8).map((ex) => (
            <TouchableOpacity
              key={ex.slug}
              disabled={!ex.unlocked}
              style={[styles.exerciseCard, !ex.unlocked && styles.exerciseCardLocked]}
              onPress={() =>
                navigation.navigate('ExerciseDetail', {
                  slug: ex.slug,
                  unlocked: ex.unlocked,
                  daysLeft: ex.daysLeft,
                })
              }
            >
              <EquipmentIcon slug={ex.slug} size={84} />
              <Text style={styles.exerciseName} numberOfLines={1}>
                {ex.name}
              </Text>
              <Text style={[styles.exerciseStatus, !ex.unlocked && styles.exerciseStatusLocked]}>
                {ex.unlocked ? 'Available' : `${ex.daysLeft} days`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Progress Tracker Card Link */}
        <TouchableOpacity
          style={styles.progressRowLink}
          onPress={() => navigation.navigate('Progress')}
        >
          <View>
            <Text style={styles.progressLinkTitle}>Progress Tracker</Text>
            <Text style={styles.progressLinkDesc}>
              {bestMeasurement !== null
                ? `Best hold: ${Math.floor(bestMeasurement)} sec`
                : 'Take measurements daily to track progress'}
            </Text>
          </View>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="M9 5l7 7-7 7" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  infoBtnInline: {
    width: 36,
    height: 36,
    borderRadius: 18,
    ...GLASS,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sectionTitleCompact: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  todayCard: {
    marginHorizontal: 16,
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  todayCardGlow: {
    position: 'absolute',
    top: -78,
    right: -78,
  },
  todayCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  progressCircleContainer: {
    width: 68,
    height: 68,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressTextContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  equipmentIcon: {
    marginRight: 4,
    marginTop: 4,
  },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(193, 255, 114, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 6,
    marginBottom: 8,
  },
  completeBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.accent,
  },
  todayCardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  dot: {
    color: 'rgba(193, 255, 114, 0.6)',
  },
  startStrip: {
    marginTop: 20,
    backgroundColor: COLORS.surface2,
    borderRadius: 20,
    padding: 16,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  durationText: {
    color: COLORS.whiteMuted,
    fontSize: 13,
    fontWeight: 'semibold',
  },
  infoText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: 'medium',
    marginTop: 6,
    lineHeight: 20,
  },
  startBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  startBtnText: {
    color: COLORS.onAccent,
    fontWeight: 'bold',
    fontSize: 15,
  },
  railHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 12,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  exerciseRail: {
    paddingLeft: 16,
    paddingRight: 8,
  },
  exerciseCard: {
    width: 150,
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginRight: 12,
    alignItems: 'center',
  },
  exerciseCardLocked: {
    opacity: DISABLED_OPACITY,
  },
  exerciseIconContainer: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  exerciseName: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: 'semibold',
    textAlign: 'center',
    width: '100%',
    marginTop: 12,
  },
  exerciseStatus: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  exerciseStatusLocked: {
    color: COLORS.accentSoft,
  },
  progressRowLink: {
    marginHorizontal: 16,
    marginTop: 28,
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLinkTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  progressLinkDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
