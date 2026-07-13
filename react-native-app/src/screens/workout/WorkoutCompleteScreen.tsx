import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../theme/colors';
import { getDBConnection } from '../../db/sqlite';
import { getPosition, getTodayProgress, getLocalDateString } from '../../services/progression';
import { EXERCISES, LEVELS } from '../../constants/catalogues';
import { syncNow } from '../../services/sync';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Watermark } from '../../components/Watermark';

const { width } = Dimensions.get('window');
const COMPLETED_CIRCLE_SIZE = 208;
const COMPLETED_R = 98;
const COMPLETED_CIRCUMFERENCE = 2 * Math.PI * COMPLETED_R;

type RouteParams = {
  WorkoutComplete: {
    duration: number;
    levelId: number;
  };
};

export const WorkoutCompleteScreen = () => {
  const route = useRoute<RouteProp<RouteParams, 'WorkoutComplete'>>();
  const navigation = useNavigation<NavigationProp<any>>();
  const { user, updateUserFields } = useAuth();

  const { duration } = route.params;

  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [calendarDays, setCalendarDays] = useState<any[]>([]);
  const [askFeedback, setAskFeedback] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Unlocks
  const [unlockedNow, setUnlockedNow] = useState<string[]>([]);
  const [nextUnlock, setNextUnlock] = useState<any>(null);

  const loadData = async () => {
    if (!user) return;
    try {
      const db = await getDBConnection();

      // 1. Fetch training days to compute position and progress
      const daysRes = await db.executeSql(
        'SELECT * FROM training_days WHERE user_id = ? ORDER BY date DESC',
        [user.id]
      );
      const trainingDays = [];
      for (let i = 0; i < daysRes[0].rows.length; i++) {
        trainingDays.push(daysRes[0].rows.item(i));
      }

      const pos = getPosition(user, trainingDays);
      const prog = getTodayProgress(user, trainingDays);
      setPosition(pos);
      setProgress(prog);

      // Build 7 calendar days centered around today
      const todayStr = getLocalDateString(user.timezone);
      const startDay = Math.max(1, pos.day - 4);
      const daysList = [];
      for (let d = startDay; d <= Math.min(pos.plan_length, startDay + 6); d++) {
        daysList.push({
          n: d,
          done: d <= pos.completed,
          today: d === pos.day,
        });
      }
      setCalendarDays(daysList);

      // 2. Fetch workout session count to decide if we ask for feedback
      const sessionCountRes = await db.executeSql(
        'SELECT COUNT(*) as count FROM workout_sessions WHERE user_id = ?',
        [user.id]
      );
      const totalSessions = sessionCountRes[0].rows.item(0).count || 0;
      // Ask feedback if totalSessions is even, matching the Laravel rule
      setAskFeedback(totalSessions > 0 && totalSessions % 2 === 0);

      // 3. Unlocks checks
      // Newly unlocked at the current completed days count
      const newlyUnlocked = Object.values(EXERCISES)
        .filter((ex) => ex.unlock_after_days === pos.completed)
        .map((ex) => ex.name);
      setUnlockedNow(newlyUnlocked);

      // Next unlock candidate
      const nextLocked = Object.values(EXERCISES)
        .filter((ex) => ex.unlock_after_days > pos.completed)
        .sort((a, b) => a.unlock_after_days - b.unlock_after_days);

      if (nextLocked.length > 0) {
        setNextUnlock(nextLocked[0]);
      } else {
        setNextUnlock(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFeedback = async (feedback: 'easy' | 'fine' | 'hard') => {
    if (!user) return;
    try {
      let nextLvl = user.level_id;
      let msg = '';

      if (feedback === 'easy') {
        if (user.level_id < 5) {
          nextLvl = user.level_id + 1;
          msg = `Level up! You're now on ${LEVELS[nextLvl].name}.`;
        } else {
          msg = "You're already at the highest level.";
        }
      } else if (feedback === 'hard') {
        if (user.level_id > 1) {
          nextLvl = user.level_id - 1;
          msg = `Stepped down to ${LEVELS[nextLvl].name}. You got this!`;
        } else {
          msg = "You're already at the easiest level.";
        }
      } else {
        msg = "Awesome! Let's keep going.";
      }

      if (nextLvl !== user.level_id) {
        await updateUserFields({ level_id: nextLvl });
      }

      setFeedbackMessage(msg);
      setAskFeedback(false);

      // Sync updated level to server immediately
      syncNow(user.id).catch(() => {});
    } catch (e) {
      console.error(e);
    }
  };

  if (loading || !position || !progress) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </SafeAreaView>
    );
  }

  // Calculate Dashoffset for today's sessions progress ring
  const pct = Math.min(1, progress.done / progress.required);
  const strokeDashoffset = COMPLETED_CIRCUMFERENCE * (1 - pct);

  // Generate unlock percentage progress
  const unlockPct = nextUnlock
    ? Math.min(100, Math.round((position.completed / nextUnlock.unlock_after_days) * 100))
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      <Watermark />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Celebration Tick Ring */}
        <View style={styles.ringContainer}>
          <View style={styles.ringCircle}>
            <Svg width={COMPLETED_CIRCLE_SIZE} height={COMPLETED_CIRCLE_SIZE} viewBox={`0 0 ${COMPLETED_CIRCLE_SIZE} ${COMPLETED_CIRCLE_SIZE}`}>
              <Circle
                cx={COMPLETED_CIRCLE_SIZE / 2}
                cy={COMPLETED_CIRCLE_SIZE / 2}
                r={COMPLETED_R}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={12}
              />
              <Circle
                cx={COMPLETED_CIRCLE_SIZE / 2}
                cy={COMPLETED_CIRCLE_SIZE / 2}
                r={COMPLETED_R}
                fill="none"
                stroke={COLORS.accent}
                strokeWidth={12}
                strokeLinecap="round"
                strokeDasharray={`${COMPLETED_CIRCUMFERENCE} ${COMPLETED_CIRCUMFERENCE}`}
                strokeDashoffset={strokeDashoffset}
                origin={`${COMPLETED_CIRCLE_SIZE / 2}, ${COMPLETED_CIRCLE_SIZE / 2}`}
                rotation={-90}
              />
            </Svg>
            <View style={styles.tickContainer}>
              <Svg width={72} height={72} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M5 13l4 4L19 7"
                  stroke={COLORS.accent}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          </View>
          <Text style={styles.badgeCountText}>
            {progress.done}/{progress.required} sessions today
          </Text>
        </View>

        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.completeTitle}>
            {progress.complete
              ? 'Training Day Complete!'
              : progress.done > progress.required
              ? 'Extra Session Done!'
              : 'Session Complete'}
          </Text>
        </View>

        {/* Difficulty Feedback (Only if askFeedback is true) */}
        {askFeedback && (
          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackTitle}>How was that?</Text>
            <View style={styles.feedbackRow}>
              <TouchableOpacity style={styles.feedbackBtn} onPress={() => handleFeedback('easy')}>
                <Text style={styles.feedbackBtnText}>Too easy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.feedbackBtn, styles.feedbackBtnActive]} onPress={() => handleFeedback('fine')}>
                <Text style={styles.feedbackBtnTextActive}>Just right</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.feedbackBtn} onPress={() => handleFeedback('hard')}>
                <Text style={styles.feedbackBtnText}>Too hard</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Feedback Response Message */}
        {feedbackMessage && (
          <View style={styles.feedbackBanner}>
            <Text style={styles.feedbackBannerText}>{feedbackMessage}</Text>
          </View>
        )}

        {/* Month Calendar strip */}
        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <Text style={styles.monthLabel}>Month {position.month}</Text>
            <Text style={styles.planProgressText}>
              {position.completed}/{position.plan_length}
            </Text>
          </View>
          <View style={styles.calendarStrip}>
            {calendarDays.map((day) => (
              <View key={day.n} style={styles.stripDayCell}>
                {day.today && day.done ? (
                  <View style={[styles.stripDayRound, styles.stripDayRoundDoneToday]}>
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                      <Path d="M5 13l4 4L19 7" stroke={COLORS.onAccent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  </View>
                ) : day.done ? (
                  <View style={[styles.stripDayRound, styles.stripDayRoundDone]}>
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                      <Path d="M5 13l4 4L19 7" stroke={COLORS.onAccent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  </View>
                ) : day.today ? (
                  <View style={[styles.stripDayRound, styles.stripDayRoundToday]} />
                ) : (
                  <View style={styles.stripDayRoundEmpty} />
                )}
                <Text style={[styles.stripDayText, day.today && styles.stripDayTextToday]}>
                  {day.n}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* New exercise unlocked indicator */}
        {unlockedNow.length > 0 && (
          <View style={styles.unlockCard}>
            <Text style={styles.unlockText}>Unlocked: {unlockedNow.join(', ')}</Text>
          </View>
        )}

        {/* Next exercise unlock progress */}
        {nextUnlock && unlockedNow.length === 0 && (
          <View style={styles.nextUnlockCard}>
            <View style={styles.unlockIconPlaceholder}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                <Rect x={4} y={10} width={16} height={10} rx={1.5} stroke={COLORS.accent} strokeWidth={1.7} />
                <Rect x={3} y={7} width={18} height={3.5} rx={1} stroke={COLORS.accent} strokeWidth={1.7} />
                <Path d="M12 7v13" stroke={COLORS.accent} strokeWidth={1.7} />
                <Path
                  d="M12 7C11 4.5 9.5 4 8.6 4.6 7.2 5.5 8.2 7 9.7 7H12zM12 7c1-2.5 2.4-3 3.4-2.4C16.8 5.5 15.8 7 14.3 7H12z"
                  stroke={COLORS.accent}
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.unlockNameText}>Unlock '{nextUnlock.name}'</Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${unlockPct}%` }]} />
              </View>
            </View>
            <Text style={styles.unlockRatioText}>
              {position.completed}/{nextUnlock.unlock_after_days}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Continue CTA */}
      <View style={styles.ctaContainer}>
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={() => navigation.navigate('MainTabs')}
        >
          <Text style={styles.continueBtnText}>Continue</Text>
        </TouchableOpacity>
      </View>
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
    paddingBottom: 100,
  },
  ringContainer: {
    alignItems: 'center',
    paddingTop: 40,
  },
  ringCircle: {
    width: COMPLETED_CIRCLE_SIZE,
    height: COMPLETED_CIRCLE_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  tickContainer: {
    position: 'absolute',
  },
  badgeCountText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    marginTop: 16,
  },
  titleContainer: {
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 24,
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
  },
  feedbackCard: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
  },
  feedbackTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 14,
  },
  feedbackRow: {
    flexDirection: 'row',
    gap: 8,
  },
  feedbackBtn: {
    flex: 1,
    height: 44,
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedbackBtnActive: {
    backgroundColor: COLORS.accent,
  },
  feedbackBtnText: {
    fontSize: 13,
    fontWeight: 'semibold',
    color: COLORS.white,
  },
  feedbackBtnTextActive: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  feedbackBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: 'rgba(193, 255, 114, 0.1)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  feedbackBannerText: {
    color: COLORS.accentSoft,
    fontSize: 14,
    fontWeight: 'medium',
    textAlign: 'center',
  },
  calendarCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  planProgressText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  calendarStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  stripDayCell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  stripDayRound: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stripDayRoundDoneToday: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
    borderWidth: 2,
  },
  stripDayRoundDone: {
    backgroundColor: COLORS.accent,
  },
  stripDayRoundToday: {
    borderColor: COLORS.accent,
    borderWidth: 2,
  },
  stripDayRoundEmpty: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
  },
  stripDayText: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  stripDayTextToday: {
    fontWeight: 'bold',
    color: COLORS.white,
  },
  unlockCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
  },
  unlockText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.accent,
  },
  nextUnlockCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  unlockIconPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unlockNameText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 4,
  },
  unlockRatioText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
  },
  continueBtn: {
    height: 56,
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
});
