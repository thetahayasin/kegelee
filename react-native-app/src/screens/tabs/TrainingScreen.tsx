import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS, GLASS, TYPE, SPACE, RADIUS } from '../../theme/colors';
import {
  getMaxMeasurement,
  getActiveSubscription,
} from '../../db/queries';
import { getDBConnection } from '../../db/sqlite';
import { formatSubscriptionDate } from '../../utils/localDate';
import { getPosition, getTodayProgress, getStreak } from '../../services/progression';
import { EXERCISES, LEVELS, exerciseNameKey, levelNameKey } from '../../constants/catalogues';
import { syncNow, syncIfStale } from '../../services/sync';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

// strokeDashoffset is an SVG attribute the native driver cannot carry, so
// this arc is JS-driven - the same trade the workout ring makes.
// Half the space between two cards; each cell carries it on every side, so
// adjacent cells add up to a full gutter and the outer edges get half.
const GRID_GUTTER = 6;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { EquipmentIcon } from '../../components/EquipmentIcon';
import { Watermark } from '../../components/Watermark';

export const TrainingScreen = () => {
  const { t } = useTranslation();
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
  // The chain, not the total. See getStreak.
  const [streak, setStreak] = useState(0);
  // A load that failed, rather than a load that returned nothing.
  //
  // This screen used to catch its own failure, write it to console.error and
  // leave the person looking at an empty home screen with no message and no
  // way to try again - on the one screen they open every day. Same defect the
  // paywall had with its price lookup: a transient error becoming a
  // permanently broken screen.
  const [loadFailed, setLoadFailed] = useState(false);
  // Whether a load has ever succeeded, so a failed background refresh can be
  // told apart from a cold screen with nothing on it.
  const hasDataRef = useRef(false);

  /**
   * The two subscription states that need saying out loud, on the screen the
   * subscriber actually opens.
   *
   * Both were known to the app and told to nobody. A trial's end date sat in
   * Settings as a passive line that required going to look for it, so the
   * conversion was a surprise - which is the charge people dispute. And a
   * cancelled subscriber carried on exactly as before right up to the day
   * access died, never once asked to reconsider, despite being the cheapest
   * subscriber there is to win back: already paid, already part-way into the
   * habit, and having told us their exact deadline.
   */
  const [subNotice, setSubNotice] = useState<
    { kind: 'trial' | 'cancelled'; text: string } | null
  >(null);

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
      setStreak(getStreak(user, trainingDays));

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

      // Subscription notice. Read here rather than in its own effect so it
      // refreshes with everything else - on focus, and on pull-to-refresh
      // after a sync has had a chance to change the answer.
      const sub = await getActiveSubscription(user.id).catch(() => null);
      const status = String(sub?.status || '').toLowerCase();
      if (status === 'canceled') {
        const endsOn = formatSubscriptionDate(sub?.ends_at ?? null);
        setSubNotice({
          kind: 'cancelled',
          text: endsOn
            ? t('settings.cancelledUntilDate', { date: endsOn })
            : t('settings.cancelledUntilPeriodEnd'),
        });
      } else if (status === 'trialing') {
        const trialEndsAt = Date.parse(sub?.trial_ends_at || sub?.ends_at || '');
        // Only in the closing stretch. A banner that sits there for the whole
        // trial is furniture by day two, and the point is to be noticed on the
        // day it matters.
        const withinTwoDays =
          Number.isFinite(trialEndsAt) && trialEndsAt - Date.now() < 2 * 24 * 60 * 60 * 1000;
        const endsOn = formatSubscriptionDate(sub?.trial_ends_at ?? sub?.ends_at ?? null);
        setSubNotice(
          withinTwoDays && endsOn
            ? {
                kind: 'trial',
                text: Number(sub?.auto_renewing) === 1
                  ? t('settings.trialEndsThenBilling', { date: endsOn })
                  : t('settings.trialEndsNoRenew', { date: endsOn }),
              }
            : null,
        );
      } else {
        setSubNotice(null);
      }

      hasDataRef.current = true;
      setLoadFailed(false);
    } catch (e) {
      console.error('Failed to load training screen data', e);
      // Only raise the error card when there is nothing on screen to keep. A
      // background refresh that fails over an already-rendered day should
      // leave the day where it is rather than replacing good data with an
      // apology.
      if (!hasDataRef.current) setLoadFailed(true);
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

  /**
   * The next exercise the user will earn, and how close they are.
   *
   * The soonest LOCKED one, not simply the next in the catalogue: unlock days
   * are not evenly spaced, so ordering by the threshold is the only way to get
   * the one that actually arrives next.
   */
  const nextUnlock = exerciseItems
    .filter((ex) => !ex.unlocked)
    .sort((a, b) => a.unlock_after_days - b.unlock_after_days)[0];

  const unlockPct = nextUnlock?.unlock_after_days
    ? Math.min(100, Math.round((completedDays / nextUnlock.unlock_after_days) * 100))
    : 0;
  const sessionLength = t('training.minutes', {
    count: levelDef ? Math.floor(levelDef.total_session_seconds / 60) : 1,
  });

  // Gauge geometry. An 80% arc (288deg) with the 72deg gap rotated to the
  // bottom - the +126deg puts the gap's centre at 90deg, i.e. straight down.
  /**
   * The day arc fills on arrival rather than being drawn already finished.
   *
   * Its own comment calls this "the one thing a returning user opens the app
   * to check", and a number that is simply present states a fact where the
   * same number arriving reads as progress. Re-runs whenever the count
   * changes, so finishing a session and coming back animates the new value in
   * rather than snapping to it.
   */
  const dayArc = useRef(new Animated.Value(0)).current;

  const R = 58;
  const arcLength = 2 * Math.PI * R * 0.8;
  const pct = Math.min(1, Math.max(0, done / Math.max(1, required)));

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (cancelled) return;
        if (reduced) {
          dayArc.setValue(pct);
          return;
        }
        Animated.timing(dayArc, {
          toValue: pct,
          duration: 750,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      });
    return () => {
      cancelled = true;
    };
  }, [pct, dayArc]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </SafeAreaView>
    );
  }

  // Nothing loaded and the attempt failed. Say so and offer the retry, rather
  // than presenting an empty day as though it were the truth.
  if (loadFailed) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Watermark />
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{t('errorBoundary.theAppHitAnUnexpected')}</Text>
          <TouchableOpacity
            style={styles.errorRetryBtn}
            accessibilityRole="button"
            onPress={() => {
              setLoading(true);
              setLoadFailed(false);
              loadData();
            }}
          >
            <Text style={styles.errorRetryText}>{t('progress.tryAgain')}</Text>
          </TouchableOpacity>
        </View>
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
            <Text style={styles.pageTitle}>{t('training.training')}</Text>
          </View>
          <TouchableOpacity
            style={styles.infoBtnInline}
            accessibilityRole="button"
            accessibilityLabel={t('training.knowledge')}
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

        {/* Subscription notice. Above the hero because both cases are about a
            date that is coming, and neither is worth saying quietly. The
            cancelled one carries the way back; the trial one is information,
            not an upsell, and gets no button. */}
        {subNotice && (
          <View
            style={[
              styles.subNotice,
              subNotice.kind === 'cancelled' && styles.subNoticeCancelled,
            ]}
          >
            <Text style={styles.subNoticeText}>{subNotice.text}</Text>
            {subNotice.kind === 'cancelled' && (
              <TouchableOpacity
                style={styles.subNoticeBtn}
                accessibilityRole="button"
                onPress={() => navigation.navigate('Paywall')}
              >
                <Text style={styles.subNoticeBtnText}>{t('settings.subscribe')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

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
                  ? t('training.ringDoneA11y', { done, required })
                  : t('training.ringA11y', { done, required })
              }
            >
              <View style={{ transform: [{ rotate: '126deg' }] }}>
                <Svg width={108} height={108} viewBox="0 0 132 132">
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
                  <AnimatedCircle
                    cx={66}
                    cy={66}
                    r={R}
                    fill="none"
                    stroke={COLORS.accent}
                    strokeWidth={9}
                    strokeDasharray={`${arcLength} 999`}
                    strokeDashoffset={dayArc.interpolate({
                      inputRange: [0, 1],
                      outputRange: [arcLength, 0],
                    })}
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
                <Text style={styles.ringLabel}>{t('training.sessions')}</Text>
              </View>
            </View>

            <Text style={styles.heroOverline}>
              {t('training.monthDay', { month, day })}
            </Text>
            <Text style={styles.heroHeadline}>
              {complete ? t('training.todayIsDone') : t('training.readyWhenYouAre')}
            </Text>

            {/* The chain. Only once there is one to lose - a "0-day streak" on
                a brand new account is a discouraging way to open an app, and
                the ring above already carries day one.

                Deliberately not a fourth cell in the strip below: those three
                are facts about TODAY, and this is the only thing on the screen
                that says anything about the days behind it. */}
            {streak > 0 && (
              <View style={styles.streakPill}>
                <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-1.6.7-3.1 1.5-4.3"
                    stroke={COLORS.accent}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
                <Text style={styles.streakText} numberOfLines={1}>
                  {t('training.streakDays', { count: streak })}
                </Text>
              </View>
            )}
          </View>

          {/* Action strip, seated on the card one elevation step forward. */}
          <View style={styles.actionStrip}>
            {/* Three columns, evenly divided, rather than three differently
                shaped chips pushed to the edges of a row. A pill, a bordered
                chip and a badge each styled to their own rules read as three
                unrelated objects that happened to land on the same line - and
                when the day was not complete the third simply vanished,
                leaving the other two re-spaced. Equal cells with a rule
                between them hold their positions and read as one strip of
                facts about today. No new copy: the same values, arranged. */}
            <View style={styles.metaColumns}>
              <View style={styles.metaCell}>
                <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
                  <Circle cx={12} cy={12} r={9} stroke={COLORS.textMuted} strokeWidth={1.8} />
                  <Path d="M12 8v4l3 2" stroke={COLORS.textMuted} strokeWidth={1.8} strokeLinecap="round" />
                </Svg>
                <Text style={styles.metaValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {sessionLength}
                </Text>
              </View>

              <View style={styles.metaDivider} />

              <View style={styles.metaCell}>
                <Text
                  style={[styles.metaValue, styles.metaValueAccent]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {levelDef ? t(levelNameKey(levelDef.number)) : '-'}
                </Text>
              </View>

              <View style={styles.metaDivider} />

              {/* Always occupied: the cell shows the count until the day is
                  done, then the tick. Nothing moves when it flips. */}
              <View style={styles.metaCell}>
                {complete ? (
                  <>
                    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                      <Path d="M5 13l4 4L19 7" stroke={COLORS.accent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                    <Text style={[styles.metaValue, styles.metaValueAccent]} numberOfLines={1}>
                      {t('training.complete')}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.metaValue} numberOfLines={1}>
                    {done}/{required}
                  </Text>
                )}
              </View>
            </View>

            <TouchableOpacity
              style={styles.startBtn}
              accessibilityRole="button"
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Workout')}
            >
              <Text style={styles.startBtnText}>
                {complete ? t('training.trainAgain') : t('training.startWorkout')}
              </Text>
            </TouchableOpacity>

            <Text style={styles.helperText}>
              {complete
                ? t('training.extraSessionsOptional')
                : t('training.sessionsCompleteToday', { count: required })}
            </Text>
          </View>
        </View>

        {/* What you are working towards.
            The grid shows locked exercises with a day count, but a bare "6
            days" says nothing about how far along you are - 6 days left out of
            7 and out of 30 read identically. This is the one exercise coming
            next, with the distance actually travelled. */}
        {nextUnlock && (
          <View style={styles.unlockCard}>
            <View style={styles.unlockArt}>
              <EquipmentIcon slug={nextUnlock.slug} size={44} />
            </View>
            <View style={styles.unlockBody}>
              <Text style={styles.unlockOverline}>{t('workoutComplete.nextToUnlock')}</Text>
              <Text style={styles.unlockName} numberOfLines={1}>
                {t(exerciseNameKey(nextUnlock.slug))}
              </Text>
              <View style={styles.unlockBarBg}>
                <View style={[styles.unlockBarFill, { width: `${unlockPct}%` }]} />
              </View>
            </View>
            <Text style={styles.unlockDays}>
              {t('training.daysLeft', { count: nextUnlock.daysLeft })}
            </Text>
          </View>
        )}

        {/* Exercises. Was a horizontal rail, which hid most of the set
            off-screen and gave no sense of how much there is to unlock. */}
        <View style={styles.railHeader}>
          <Text style={styles.sectionTitleCompact}>{t('training.exercises')}</Text>
          <TouchableOpacity
            style={styles.seeAllBtn}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => navigation.navigate('AllExercises')}
          >
            <Text style={styles.seeAllText}>{t('training.seeAll')}</Text>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M9 6l6 6-6 6" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </View>

        <View style={styles.exerciseGrid}>
          {exerciseItems.slice(0, 9).map((ex) => (
            <TouchableOpacity
              key={ex.slug}
              disabled={!ex.unlocked}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={
                ex.unlocked
                  ? t(exerciseNameKey(ex.slug))
                  : t('training.unlocksInA11y', {
                      name: t(exerciseNameKey(ex.slug)),
                      count: ex.daysLeft,
                    })
              }
              style={styles.exerciseCell}
              onPress={() =>
                navigation.navigate('ExerciseDetail', {
                  slug: ex.slug,
                  unlocked: ex.unlocked,
                  daysLeft: ex.daysLeft,
                })
              }
            >
              <View style={styles.exerciseCard}>
                <View style={!ex.unlocked && styles.lockedArt}>
                  {/* Sized against the card: at three per row the tile carries
                      the identification and the label underneath is a
                      confirmation, so it takes most of the width without
                      dominating the screen the way 104 did at two per row. */}
                  <EquipmentIcon slug={ex.slug} size={62} />
                </View>
                <Text
                  style={[styles.exerciseName, !ex.unlocked && styles.exerciseNameLocked]}
                  numberOfLines={1}
                >
                  {t(exerciseNameKey(ex.slug))}
                </Text>
                {ex.unlocked ? (
                  <Text style={styles.exerciseStatus}>{t('training.available')}</Text>
                ) : (
                  <View style={styles.lockRow}>
                    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
                      <Rect x={4} y={10} width={16} height={11} rx={2.5} stroke={COLORS.textDim} strokeWidth={2.4} />
                      <Path d="M8 10V7a4 4 0 1 1 8 0v3" stroke={COLORS.textDim} strokeWidth={2.4} strokeLinecap="round" />
                    </Svg>
                    <Text style={styles.exerciseStatusLocked}>{t('training.daysLeft', { count: ex.daysLeft })}</Text>
                  </View>
                )}
              </View>
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
            <Text style={styles.progressLinkTitle}>{t('training.progressTracker')}</Text>
            <Text style={styles.progressLinkDesc}>
              {bestMeasurement !== null
                ? t('training.bestHold', { seconds: Math.floor(bestMeasurement) })
                : t('training.measureDaily')}
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
  unlockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    // Same inset as heroCard above and the exercise grid below. Without it
    // this card alone ran edge to edge, so the one element whose job is to
    // sit between those two was the only one out of line with them.
    marginHorizontal: SPACE.lg,
    marginTop: 20,
    padding: 14,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  unlockArt: { opacity: 0.55 },
  unlockBody: { flex: 1, gap: 5 },
  unlockOverline: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: COLORS.textDim,
  },
  unlockName: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  unlockBarBg: {
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(242, 245, 238, 0.10)',
    overflow: 'hidden',
  },
  unlockBarFill: { height: 5, borderRadius: 999, backgroundColor: COLORS.accent },
  unlockDays: {
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
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
  // Tightened: the card opened the screen and took most of it, pushing the
  // exercises below the fold on a short phone.
  heroBody: { paddingHorizontal: SPACE.xl, paddingTop: 18, paddingBottom: SPACE.lg, alignItems: 'center' },
  ringWrap: { width: 108, height: 108, justifyContent: 'center', alignItems: 'center' },
  ringCentre: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringCount: { fontSize: 30, fontWeight: '800', letterSpacing: -1.2, color: COLORS.white },
  ringSlash: { color: COLORS.textDim, fontWeight: '800' },
  ringTotal: { color: COLORS.textMuted, fontWeight: '800' },
  ringLabel: { ...TYPE.overline, fontSize: 10, color: COLORS.textDim, marginTop: 3 },
  heroOverline: { ...TYPE.overline, color: COLORS.textDim, marginTop: SPACE.xl },
  heroHeadline: { ...TYPE.heading, color: COLORS.white, marginTop: 6 },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginTop: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accentWash,
  },
  streakText: {
    ...TYPE.caption,
    fontWeight: '700',
    color: COLORS.accent,
    fontVariant: ['tabular-nums'],
  },

  /* Subscription notice --------------------------------------------------- */
  subNotice: {
    marginHorizontal: SPACE.lg,
    marginBottom: SPACE.lg,
    padding: SPACE.lg,
    borderRadius: RADIUS.md + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    gap: SPACE.md,
  },
  subNoticeCancelled: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentWash,
  },
  subNoticeText: { ...TYPE.bodySm, color: COLORS.white, lineHeight: 19 },
  subNoticeBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
  },
  subNoticeBtnText: { ...TYPE.bodySm, fontWeight: '700', color: COLORS.onAccent },

  /* Load failure --------------------------------------------------------- */
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
    gap: SPACE.lg,
  },
  errorText: {
    ...TYPE.body,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  errorRetryBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  errorRetryText: { ...TYPE.bodySm, fontWeight: '700', color: COLORS.white },

  /* Action strip -------------------------------------------------------- */
  actionStrip: {
    backgroundColor: COLORS.surface2,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.lg,
  },
  metaColumns: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACE.md,
  },
  metaCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 20,
  },
  metaDivider: { width: 1, height: 18, backgroundColor: COLORS.border },
  metaValue: { ...TYPE.bodySm, fontWeight: '700', color: COLORS.textMuted },
  metaValueAccent: { color: COLORS.accent },
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
  // Thirds that cannot drift.
  //
  // This was three cards at 31.5% inside a row with a 12px `gap`. Percentage
  // widths measure against the container and gaps do not, so the row needed
  // 94.5% PLUS 24px, only ever fitted two, and left every third slot empty.
  // Computing an exact pixel width in JS fixed that but bought a hidden
  // coupling: the arithmetic had to know this container's padding, and would
  // have silently drifted the moment any parent changed.
  //
  // A cell of exactly one third, with the gutter as padding INSIDE it, needs
  // no measurement and no knowledge of its surroundings - three of them are
  // 100% by definition, on any width, in split screen, at any font scale. The
  // grid's own padding is reduced by one gutter so the visible card edges
  // still line up with the sections above and below.
  exerciseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACE.lg - GRID_GUTTER,
  },
  exerciseCell: {
    width: '33.333%',
    padding: GRID_GUTTER,
  },
  exerciseCard: {
    // The visual surface only; the cell above owns the width. Two-up with a
    // 104pt tile made each card nearly half the screen, so four exercises
    // filled a phone and the rest of the set was a scroll away - the grid
    // existed precisely to show how much there is to unlock.
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  // Locked art is dimmed but the card itself stays at full opacity, so a
  // locked row reads as "not yet earned" rather than as a broken card.
  lockedArt: { opacity: 0.4 },
  exerciseName: {
    color: COLORS.white,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
    width: '100%',
    marginTop: SPACE.sm,
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
