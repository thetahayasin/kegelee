import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal,
  Animated,
  Easing,
  AccessibilityInfo,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { track } from '../../services/events';
import { Palette } from '../../theme/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import { getDBConnection } from '../../db/sqlite';
import { getPosition, getTodayProgress } from '../../services/progression';
import {
  EXERCISES,
  ExerciseDef,
  exerciseNameKey,
  levelNameKey,
  FREE_DAY_CAP,
  unlockedAtDay,
  isFreeExercise,
} from '../../constants/catalogues';
import { syncNow } from '../../services/sync';
import { getReminders, saveReminder } from '../../db/queries';
import { scheduleReminders } from '../../services/reminders';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Path } from 'react-native-svg';

// strokeDashoffset is an SVG attribute, so the sweep has to be JS-driven -
// the native driver cannot carry it. The tick is animated on its OWN node
// for the same reason the onboarding art was rewritten: two drivers on one
// node is an invariant violation, and it crashed the app once already.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { Watermark } from '../../components/Watermark';
import { EquipmentIcon } from '../../components/EquipmentIcon';

const COMPLETED_CIRCLE_SIZE = 208;
const COMPLETED_R = 98;
const COMPLETED_CIRCUMFERENCE = 2 * Math.PI * COMPLETED_R;

export const WorkoutCompleteScreen = () => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<any>>();
  const { user, updateUserFields, subscribed } = useAuth();


  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);

  // Both animations are JS-driven. strokeDashoffset forces it for the ring,
  // and the tick follows suit rather than mixing drivers - separate nodes make
  // that safe, but the one time this app mixed them it crashed on launch, so
  // the rule here is simply: one driver per screen.
  const ringAnim = useRef(new Animated.Value(0)).current;
  const tickAnim = useRef(new Animated.Value(0)).current;
  const [calendarDays, setCalendarDays] = useState<any[]>([]);
  const [askFeedback, setAskFeedback] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  // Whether that message is the paywall one, which makes it a route rather
  // than a note.
  const [feedbackLocked, setFeedbackLocked] = useState(false);

  // Unlocks
  const [unlockedNow, setUnlockedNow] = useState<ExerciseDef[]>([]);
  const [nextUnlock, setNextUnlock] = useState<ExerciseDef | null>(null);
  // "Try the new exercise" prompt, shown when Continue is pressed on the
  // session that just unlocked something.
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);

  /**
   * The reminder offer.
   *
   * Reminders were opt-in behind five deliberate actions - find the Schedule
   * tab, tap the card, open a modal, pick weekdays, pick times, save - and
   * nothing in the app ever suggested taking any of them. For a twice-a-day
   * habit product that is the only mechanism that causes a return visit, and
   * it was switched off for everyone who never went looking.
   *
   * Offered here because this is the moment the habit is most obviously worth
   * having: they have just finished a session, unprompted. Accepting takes one
   * tap and fills in the plan's own shape - every day, two sessions - rather
   * than handing them an empty form.
   */
  const [offerReminders, setOfferReminders] = useState(false);
  const [savingReminders, setSavingReminders] = useState(false);
  const [remindersSaved, setRemindersSaved] = useState(false);

  // Asked at most once per account. A prompt that returns after every session
  // until it gets the answer it wants is nagging, not offering.
  const reminderOfferKey = (userId: number) => `@reminder_offer_seen_${userId}`;

  /** Every day, at the two times the plan already asks for. */
  const DEFAULT_REMINDER_TIMES = ['08:00', '20:00'];

  const acceptReminders = async () => {
    if (!user) return;
    setSavingReminders(true);
    try {
      // weekday here is the DB index (0 = Monday .. 6 = Sunday), matching
      // ScheduleScreen's own save loop.
      for (let weekday = 0; weekday < 7; weekday++) {
        await saveReminder(user.id, weekday, DEFAULT_REMINDER_TIMES, 1, 0);
      }
      // Requests notification permission itself, which is the whole point of
      // asking here: the system dialog now follows a tap that plainly means
      // "yes, remind me" instead of arriving cold at sign-in.
      await scheduleReminders(
        Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          times: DEFAULT_REMINDER_TIMES,
          isEnabled: true,
        })),
        { requestPermission: true },
      );
      setRemindersSaved(true);
      syncNow(user.id).catch(() => {});
    } catch (e) {
      console.warn('Failed to save reminders from the completion offer', e);
      // Leave the card up so the tap can be repeated; the Schedule tab is the
      // other way in and is unaffected.
    } finally {
      setSavingReminders(false);
      AsyncStorage.setItem(reminderOfferKey(user.id), '1').catch(() => {});
    }
  };

  const declineReminders = () => {
    setOfferReminders(false);
    if (user) AsyncStorage.setItem(reminderOfferKey(user.id), '1').catch(() => {});
  };

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

      // 3. Unlocks checks. See unlockedAtDay for why this is not a filter
      // written out here - it was, and it announced the starting set.
      setUnlockedNow(unlockedAtDay(pos.completed));

      // Next unlock candidate
      const nextLocked = Object.values(EXERCISES)
        .filter((ex) => ex.unlock_after_days > pos.completed)
        .sort((a, b) => a.unlock_after_days - b.unlock_after_days);

      if (nextLocked.length > 0) {
        setNextUnlock(nextLocked[0]);
      } else {
        setNextUnlock(null);
      }

      // 4. Offer reminders, if they have none and have not been asked before.
      // Deliberately not on the very first session - the offer lands better
      // once finishing one is a thing they have chosen to do twice - and never
      // alongside the feedback question, which already owns this screen's
      // attention on even-numbered sessions.
      try {
        const asked = await AsyncStorage.getItem(reminderOfferKey(user.id));
        if (!asked) {
          const existing = await getReminders(user.id);
          const hasAny = existing.some((r) => r.is_enabled === 1);
          // Odd counts only, which is precisely when askFeedback above is
          // false - so the two prompts can never share the screen - and from
          // the third session, by which point finishing one is something they
          // have chosen to do more than once.
          // Never offered to a free account: reminders are behind the
          // subscription, so the offer would open a locked screen.
          setOfferReminders(
            subscribed && !hasAny && totalSessions >= 3 && totalSessions % 2 === 1,
          );
        }
      } catch {
        // Never let the offer's own bookkeeping break the completion screen.
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Intentionally keyed to focus/mount only: loadData is recreated every
    // render, so listing it here would refetch in a loop. Wrap it in
    // useCallback before adding it to these deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFeedback = async (feedback: 'easy' | 'fine' | 'hard') => {
    if (!user) return;

    /**
     * Moving a level is part of the subscription.
     *
     * Profile's difficulty row is padlocked and routes to the plans, and this
     * screen asked the same question every other session and just did it - so
     * the paid control had a free door beside it, and a lapsed subscriber
     * could still steer their difficulty from here.
     *
     * "Just right" stays open to everybody: it changes nothing, and taking the
     * question away entirely would hide that levels exist at all.
     */
    if (!subscribed && feedback !== 'fine') {
      track(user.id, 'lock_tapped', 'difficulty');
      setFeedbackLocked(true);
      setFeedbackMessage(t('workoutComplete.subscribeToChangeLevel'));
      setAskFeedback(false);
      return;
    }

    setFeedbackLocked(false);
    try {
      let nextLvl = user.level_id;
      let msg = '';

      if (feedback === 'easy') {
        if (user.level_id < 5) {
          nextLvl = user.level_id + 1;
          msg = t('workoutComplete.levelUp', { level: t(levelNameKey(nextLvl)) });
        } else {
          msg = t('workoutComplete.alreadyHighestLevel');
        }
      } else if (feedback === 'hard') {
        if (user.level_id > 1) {
          nextLvl = user.level_id - 1;
          msg = t('workoutComplete.steppedDown', { level: t(levelNameKey(nextLvl)) });
        } else {
          msg = t('workoutComplete.alreadyEasiestLevel');
        }
      } else {
        msg = t('workoutComplete.keepGoing');
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

  /**
   * Run the ring from where the day stood before this session to where it
   * stands now, then land the tick on the session just finished.
   *
   * Sequenced rather than parallel: the tick is the payoff, and arriving while
   * the ring is still travelling gives away the ending. Honours reduce-motion
   * by jumping to the final state, which still shows the right numbers.
   */
  useEffect(() => {
    if (!progress) return;
    const to = Math.min(1, progress.done / progress.required);
    const from = Math.max(0, Math.min(1, (progress.done - 1) / progress.required));
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (cancelled) return;
        if (reduced) {
          ringAnim.setValue(to);
          tickAnim.setValue(1);
          return;
        }
        ringAnim.setValue(from);
        tickAnim.setValue(0);
        Animated.sequence([
          Animated.timing(ringAnim, {
            toValue: to,
            duration: 850,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.spring(tickAnim, {
            toValue: 1,
            friction: 5,
            tension: 90,
            useNativeDriver: false,
          }),
        ]).start();
      });

    return () => {
      cancelled = true;
    };
  }, [progress, ringAnim, tickAnim]);

  if (loading || !position || !progress) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </SafeAreaView>
    );
  }

  /**
   * What THIS session opened - not what happens to be open.
   *
   * The inline card used to render on `unlockedNow.length > 0` alone, with no
   * check that the session had anything to do with it, so the announcement
   * reappeared on every session taken at the same day count. The modal already
   * had this guard; now both read the same value and cannot disagree.
   *
   * `done === required` rather than `>=`: an extra session past the day's
   * requirement must not re-announce it.
   */
  const justUnlocked =
    !user?.is_admin &&
    progress.complete &&
    progress.done === progress.required
      ? unlockedNow
      : [];

  /**
   * A free account whose plan has stopped moving.
   *
   * All three free exercises are open, the day count is frozen at
   * FREE_DAY_CAP, and every further session now lands in exactly the same
   * place. That is the moment the subscription is worth raising - on the way
   * out, once the work is done, rather than as a panel sitting on the screen
   * contradicting the words "Training Day Complete" while they read it.
   */
  const freeAllowanceSpent = !subscribed && position.completed >= FREE_DAY_CAP;

  /**
   * Whether the next exercise is held by the SUBSCRIPTION rather than by days.
   *
   * Admins excepted, and free exercises excepted: the third one still arrives
   * on a day count a free account can actually reach.
   */
  const nextUnlockLocked =
    !!nextUnlock && !subscribed && !user?.is_admin && !isFreeExercise(nextUnlock.slug);

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
                stroke={COLORS.borderStrong}
                strokeWidth={12}
              />
              <AnimatedCircle
                cx={COMPLETED_CIRCLE_SIZE / 2}
                cy={COMPLETED_CIRCLE_SIZE / 2}
                r={COMPLETED_R}
                fill="none"
                stroke={COLORS.accentText}
                strokeWidth={12}
                strokeLinecap="round"
                strokeDasharray={`${COMPLETED_CIRCUMFERENCE} ${COMPLETED_CIRCUMFERENCE}`}
                strokeDashoffset={ringAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [COMPLETED_CIRCUMFERENCE, 0],
                })}
                origin={`${COMPLETED_CIRCLE_SIZE / 2}, ${COMPLETED_CIRCLE_SIZE / 2}`}
                rotation={-90}
              />
            </Svg>
            {/* The tick lands after EVERY finished session, first and second
                alike - it marks the session you just did, which is the thing
                this screen exists to confirm. The day's own state is not lost
                to it: the ring behind the tick is still only half filled after
                session one, and the count under it and the title below both
                say so in words. */}
            <Animated.View
              style={[
                styles.tickContainer,
                {
                  opacity: tickAnim,
                  transform: [
                    {
                      scale: tickAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.4, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Svg width={72} height={72} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M5 13l4 4L19 7"
                  stroke={COLORS.accentText}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Animated.View>
          </View>
          <Text style={styles.badgeCountText}>
            {t('workoutComplete.sessionsToday', {
              done: progress.done,
              required: progress.required,
            })}
          </Text>
        </View>

        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.completeTitle}>
            {progress.complete
              ? t('workoutComplete.trainingDayComplete')
              : progress.done > progress.required
              ? t('workoutComplete.extraSessionDone')
              : t('workoutComplete.sessionComplete')}
          </Text>
        </View>

        {/* Difficulty Feedback (Only if askFeedback is true) */}
        {askFeedback && (
          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackTitle}>{t('workoutComplete.howWasThat')}</Text>
            <View style={styles.feedbackRow}>
              <TouchableOpacity style={styles.feedbackBtn} onPress={() => handleFeedback('easy')}>
                <Text style={styles.feedbackBtnText}>{t('workoutComplete.tooEasy')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.feedbackBtn, styles.feedbackBtnActive]} onPress={() => handleFeedback('fine')}>
                <Text style={styles.feedbackBtnTextActive}>{t('workoutComplete.justRight')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.feedbackBtn} onPress={() => handleFeedback('hard')}>
                <Text style={styles.feedbackBtnText}>{t('workoutComplete.tooHard')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Feedback Response Message */}
        {feedbackMessage && (
          feedbackLocked ? (
            <TouchableOpacity
              style={styles.feedbackBanner}
              accessibilityRole="button"
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Paywall')}
            >
              <Text style={styles.feedbackBannerText}>{feedbackMessage}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.feedbackBanner}>
              <Text style={styles.feedbackBannerText}>{feedbackMessage}</Text>
            </View>
          )
        )}

        {/* The reminder offer. One tap sets every day at the plan's own two
            times; the Schedule tab remains the place to change any of it. */}
        {offerReminders && (
          <View style={styles.reminderCard}>
            {remindersSaved ? (
              <View style={styles.reminderSavedRow}>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M5 13l4 4L19 7"
                    stroke={COLORS.accentText}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
                <Text style={styles.reminderSavedText}>
                  {t('schedule.remindersSavedBody')}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.reminderTitle}>{t('schedule.reminders')}</Text>
                <Text style={styles.reminderBody}>{t('schedule.setTimesForYourWeek')}</Text>
                <TouchableOpacity
                  style={styles.reminderAcceptBtn}
                  onPress={acceptReminders}
                  disabled={savingReminders}
                  accessibilityRole="button"
                >
                  {savingReminders ? (
                    <ActivityIndicator color={COLORS.onAccent} />
                  ) : (
                    <Text
                      style={styles.reminderAcceptText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {t('schedule.saveAddReminders')}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.reminderDeclineBtn}
                  onPress={declineReminders}
                  disabled={savingReminders}
                  accessibilityRole="button"
                >
                  <Text style={styles.reminderDeclineText}>
                    {t('workoutComplete.notNow')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Month Calendar strip */}
        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <Text style={styles.monthLabel}>{t('workoutComplete.monthNumber', { number: position.month })}</Text>
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

        {/* New exercise unlocked indicator (admins have everything unlocked) */}
        {justUnlocked.length > 0 && (
          <View style={styles.unlockCard}>
            <Text style={styles.unlockText}>
              {t('workoutComplete.unlockedList', {
                names: justUnlocked.map((ex) => t(exerciseNameKey(ex.slug))).join(', '),
              })}
            </Text>
          </View>
        )}

        {/* What is coming next, and how it arrives.
            For a subscriber that is a day count, and the bar fills as the days
            add up. For a free account it is not: the day count is frozen at
            FREE_DAY_CAP, so "1/3" was a progress bar that could never move and
            a promise that could never be kept. Same card, honest content. */}
        {!user?.is_admin && nextUnlock && (
          <TouchableOpacity
            style={styles.nextUnlockCard}
            activeOpacity={nextUnlockLocked ? 0.85 : 1}
            disabled={!nextUnlockLocked}
            accessibilityRole={nextUnlockLocked ? 'button' : undefined}
            onPress={() => navigation.navigate('Paywall')}
          >
            <EquipmentIcon slug={nextUnlock.slug} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.unlockNextLabel}>
                {nextUnlockLocked
                  ? t('premium.unlockMore')
                  : t('workoutComplete.nextToUnlock')}
              </Text>
              <Text style={styles.unlockNameText}>{t(exerciseNameKey(nextUnlock.slug))}</Text>
              {!nextUnlockLocked && (
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${unlockPct}%` }]} />
                </View>
              )}
            </View>
            <Text
              style={[styles.unlockRatioText, nextUnlockLocked && styles.unlockRatioCta]}
              numberOfLines={1}
            >
              {nextUnlockLocked
                ? t('premium.badge')
                : `${position.completed}/${nextUnlock.unlock_after_days}`}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Continue CTA */}
      <View style={styles.ctaContainer}>
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={() => {
            // A new exercise wins: the reader has just earned something and
            // the offer to try it is the better moment.
            if (justUnlocked.length > 0) {
              setShowUnlockPrompt(true);
            } else if (freeAllowanceSpent) {
              // Nothing new opened and nothing more will until they pay. The
              // ask happens here, on the way out, once the session is banked.
              //
              // RESET, not navigate. `navigate` left this screen on the stack
              // underneath the paywall, so closing the paywall came straight
              // back to it - and the only button on it opens the paywall
              // again. Continue, close, Continue, close: a loop with no way
              // out but the system back gesture, on the screen that is meant
              // to be the reward for finishing a session.
              //
              // The completion screen is DONE once Continue is pressed. What
              // should be behind the paywall is the app.
              navigation.reset({
                index: 1,
                routes: [{ name: 'MainTabs' }, { name: 'Paywall' }],
              });
            } else {
              navigation.navigate('MainTabs');
            }
          }}
        >
          <Text style={styles.continueBtnText}>{t('workoutComplete.continue')}</Text>
        </TouchableOpacity>
      </View>

      {/* New-exercise prompt: told it's unlocked, offered a first try. The
          trial runs the single-exercise session, same as Try it now on the
          exercise detail screen. */}
      <Modal
        visible={showUnlockPrompt}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setShowUnlockPrompt(false);
          navigation.navigate('MainTabs');
        }}
      >
        <View style={styles.unlockOverlay}>
          <View style={styles.unlockModal}>
            <View style={styles.unlockIconTile}>
              {unlockedNow[0] && <EquipmentIcon slug={unlockedNow[0].slug} size={44} />}
            </View>
            <Text style={styles.unlockModalTitle}>{t('workoutComplete.newExerciseUnlocked')}</Text>
            <Text style={styles.unlockModalExercise}>
              {unlockedNow.map((ex) => t(exerciseNameKey(ex.slug))).join(', ')}
            </Text>
            <View style={styles.unlockModalButtons}>
              <TouchableOpacity
                style={[styles.unlockModalBtn, styles.unlockLaterBtn]}
                onPress={() => {
                  setShowUnlockPrompt(false);
                  navigation.navigate('MainTabs');
                }}
              >
                <Text style={styles.unlockLaterBtnText}>{t('workoutComplete.notNow')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.unlockModalBtn, styles.unlockTryBtn]}
                onPress={() => {
                  setShowUnlockPrompt(false);
                  // replace, not navigate: the completion screen leaves the
                  // stack, so quitting/finishing the trial lands back on the
                  // training tab instead of this page.
                  (navigation as any).replace('Workout', { trialSlug: unlockedNow[0].slug });
                }}
              >
                <Text style={styles.unlockTryBtnText}>{t('workoutComplete.tryItNow')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
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
    backgroundColor: COLORS.accentWash,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },

  /* Reminder offer ------------------------------------------------------- */
  reminderCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 20,
  },
  reminderTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: COLORS.white,
  },
  reminderBody: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 19,
    color: COLORS.textMuted,
  },
  reminderAcceptBtn: {
    marginTop: 16,
    height: 50,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderAcceptText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.onAccent,
  },
  reminderDeclineBtn: {
    marginTop: 4,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderDeclineText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  reminderSavedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reminderSavedText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    color: COLORS.textMuted,
  },
  feedbackBannerText: {
    color: COLORS.accentText,
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
    borderColor: COLORS.borderStrong,
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
    color: COLORS.accentText,
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
  unlockRatioCta: { color: COLORS.accentText, fontWeight: '700' },
  unlockNextLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  unlockNameText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: COLORS.whiteFaint,
    borderRadius: 4,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.accentText,
    borderRadius: 4,
  },
  unlockRatioText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  unlockOverlay: {
    flex: 1,
    backgroundColor: COLORS.scrim,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  unlockModal: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  unlockIconTile: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: COLORS.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  unlockModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
  },
  unlockModalExercise: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.accentText,
    textAlign: 'center',
  },
  unlockModalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    alignSelf: 'stretch',
  },
  unlockModalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unlockLaterBtn: {
    backgroundColor: COLORS.surface2,
  },
  unlockLaterBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  unlockTryBtn: {
    backgroundColor: COLORS.accent,
  },
  unlockTryBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 24,
    start: 20,
    end: 20,
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
