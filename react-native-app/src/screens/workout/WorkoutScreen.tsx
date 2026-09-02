import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Alert,
  AppState,
  ActivityIndicator,
  BackHandler,
  Easing,
  TouchableWithoutFeedback,
  useWindowDimensions,
  Vibration,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp, NavigationProp, useFocusEffect } from '@react-navigation/native';
import KeepAwake from 'react-native-keep-awake';
import { useAuth } from '../../context/AuthContext';
import { exerciseNameKey, REST_LABEL_KEY, FREE_DAY_CAP } from '../../constants/catalogues';
import { Palette } from '../../theme/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import { buildDailySession, buildSingleSession, PlaylistStep } from '../../services/sessionBuilder';
import { scheduleLapseNudge } from '../../services/reminders';
import { getDBConnection } from '../../db/sqlite';
import { recordCompletedSession, getTrainingDay } from '../../db/queries';
import { getLocalDateString } from '../../utils/localDate';
import { track } from '../../services/events';
import { abandonQuarter } from '../../services/eventClassifiers';
import { syncNow } from '../../services/sync';
import { getAppSetting } from '../../db/queries';
import Svg, { Circle, Path } from 'react-native-svg';
import { ContractGlow } from '../../components/ContractGlow';
import { Watermark } from '../../components/Watermark';
import { TourOverlay } from '../../components/TourOverlay';
import { SESSION_TOUR, hasSeenTour, markTourSeen } from '../../services/tours';

/**
 * The ring is sized from the LIVE window, not from a module-load snapshot.
 *
 * `Dimensions.get('window')` is read once when the bundle is first required,
 * so the circle was sized for whatever the window happened to be at launch and
 * stayed there. On a foldable, in split screen, or after any configuration
 * change, the ring and its glow kept the old geometry: on the narrow half of a
 * fold the 1.7x halo overflowed the screen it was explicitly sized to fit.
 *
 * The contract glow halo extends to 1.7x this, so keep 1.7*size within the
 * screen width (with margin).
 */
const circleSizeFor = (width: number) => Math.min(width * 0.52, 200);
const TRACK_WIDTH = 12;

// The sweep is animated, not re-rendered, so it needs an animatable Circle.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type RouteParams = {
  Workout: {
    trialSlug?: string;
  };
};

type RingDisplay = { count: number; pct: number };

/**
 * The only part of the screen that must repaint on every 50ms tick: the
 * counter, phase label and progress ring. It subscribes to the timer via
 * `register` instead of receiving props, so the tick re-renders just this
 * ~8-element subtree instead of the whole workout screen 20x per second.
 */
const LiveProgressRing = React.memo(
  ({
    label,
    register,
    size,
  }: {
    label: string;
    register: (fn: (d: RingDisplay) => void) => () => void;
    size: number;
  }) => {
    const radius = (size - TRACK_WIDTH) / 2;
    const circumference = 2 * Math.PI * radius;
    const styles = useThemedStyles(makeStyles);
    const COLORS = useTheme();
    // Only the counter needs React state; it changes about once a second.
    const [count, setCount] = useState(0);
    // The sweep does NOT. The timer pushes a new pct at most 20x a second, so
    // binding strokeDashoffset straight to state moved the arc in 20 visible
    // steps per second. An Animated.Value chases each pushed value across the
    // gap until the next one arrives, filling in every frame between.
    const pct = useRef(new Animated.Value(0)).current;
    const lastPushAt = useRef(0);
    useEffect(
      () =>
        register((next) => {
          setCount((prev) => (prev === next.count ? prev : next.count));
          const now = Date.now();
          const gap = lastPushAt.current ? now - lastPushAt.current : 50;
          lastPushAt.current = now;
          Animated.timing(pct, {
            toValue: next.pct,
            // Span exactly the interval since the previous push (clamped), so
            // the arc is still travelling when the next value lands rather
            // than arriving early and waiting. Pushes are throttled to real
            // movement, so that interval is not a fixed 50ms.
            duration: Math.min(250, Math.max(50, gap)),
            easing: Easing.linear,
            // strokeDashoffset is an SVG attribute, so the native driver
            // cannot carry it; the win here is per-frame interpolation.
            useNativeDriver: false,
          }).start();
        }),
      [register, pct],
    );
    const dashoffset = pct.interpolate({
      inputRange: [0, 1],
      outputRange: [circumference, 0],
    });
    return (
      <View style={[styles.progressRing, { width: size, height: size, borderRadius: size / 2 }]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={COLORS.borderStrong}
            strokeWidth={TRACK_WIDTH}
          />
            {/* COLORS.accent, not COLORS.white.
                `white` is the PRIMARY TEXT token - it only happens to be a
                near-white in the dark palette, and in the light one it
                resolves to near-black ink. So the arc came out dark on a
                light page while the track behind it stayed pale: the two
                swapped over, which is the inversion. The accent is what this
                should always have been - the palette gives it exactly one
                meaning, "act here / in progress / done", and a filling
                progress arc is all three. */}
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={COLORS.accentText}
            strokeWidth={TRACK_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashoffset}
            // transform to start draw from top (12 o'clock)
            origin={`${size / 2}, ${size / 2}`}
            rotation={-90}
          />
        </Svg>
        <View style={styles.ringLabelContainer}>
          <Text style={styles.counterText}>{count}</Text>
          <Text style={styles.phaseLabel}>{label}</Text>
        </View>
      </View>
    );
  },
);

/** Header "Xm left" label - subscribes to the timer, updates at most 1x/sec. */
const LiveTimeLabel = React.memo(
  ({ register }: { register: (fn: (s: string) => void) => () => void }) => {
    const styles = useThemedStyles(makeStyles);
    const [label, setLabel] = useState('');
    useEffect(() => register(setLabel), [register]);
    return <Text style={styles.timeText}>{label}</Text>;
  },
);

/**
 * How many EXERCISES a playlist holds, as a person would count them.
 *
 * Not the step count: one exercise is many contract/relax steps, and the rests
 * between them are not exercises at all. The two numbers are reported
 * separately (exercise_count here, total_steps on an abandon) because a
 * session that was quit "three exercises in" and one quit "forty steps in"
 * answer different questions.
 */
const countExercises = (steps: PlaylistStep[]): number =>
  new Set(steps.filter((s) => s.slug !== 'rest').map((s) => s.slug)).size;

export const WorkoutScreen = () => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RouteParams, 'Workout'>>();
  const navigation = useNavigation<NavigationProp<any>>();
  const { user, subscribed } = useAuth();
  const { width } = useWindowDimensions();
  const circleSize = circleSizeFor(width);
  const haloSize = circleSize * 1.7;

  const trialSlug = route.params?.trialSlug || null;
  const isTrial = !!trialSlug;

  const [playlist, setPlaylist] = useState<PlaylistStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  // remaining/elapsed live ONLY in refs: the 50ms tick pushes display values to
  // the LiveProgressRing / LiveTimeLabel subscribers, so ticking never re-renders
  // this (large) screen component.
  const [paused, setPaused] = useState(false);
  const [showQuitModal, setShowQuitModal] = useState(false);
  // The session could not be built. Distinct from `loading`: loading ends,
  // this does not, and the screen used to sit on the spinner for ever with no
  // way out but the hardware back button, which the back handler then swallowed.
  const [initFailed, setInitFailed] = useState(false);
  // Help sheet (per-exercise tutorial) shown during a real session.
  const [showHelp, setShowHelp] = useState(false);
  // Trial/tutorial finished: show a simple "Great job! / Try again" instead of
  // the day-complete session screen.
  const [trialDone, setTrialDone] = useState(false);

  /**
   * The session tour, shown on the free demo only.
   *
   * This is the first time most people have seen a guided pelvic floor
   * exercise, and the circle - which is the entire product - explains
   * nothing on its own. A ring that fills and empties means squeeze and
   * relax only once somebody says so.
   *
   * Not shown on a real session: by then they have done this, and
   * interrupting a workout someone is paying for to explain it is worse than
   * saying nothing.
   */
  const [showTour, setShowTour] = useState(false);
  const tourRingRef = useRef<View>(null);
  const tourListRef = useRef<View>(null);
  const tourPauseRef = useRef<View>(null);

  // Animated values for smooth glow/pulsing contraction indicator
  const glowScale = useRef(new Animated.Value(0.58)).current;
  const glowOpacity = useRef(new Animated.Value(0.08)).current;

  // Stable refs to prevent back button loops and stale state in callback
  const showHelpRef = useRef(false);
  const showQuitModalRef = useRef(false);
  showHelpRef.current = showHelp;
  showQuitModalRef.current = showQuitModal;

  const handleQuitRef = useRef<() => void>(() => {});
  const loadingRef = useRef(true);
  /**
   * The session already reached its end.
   *
   * A finished PREVIEW stays on this screen showing "Great job!", and its
   * close button and the hardware back key both route through handleQuit - so
   * without this every completed preview was also recorded as abandoned, in
   * the last quarter, by the reader tapping X on the congratulations. A real
   * session cannot hit this (finishWorkout replaces the route), but it is set
   * on both paths so the rule reads as "an ended session cannot be
   * abandoned" rather than as a preview quirk.
   */
  const finishedRef = useRef(false);

  // Refs for tracking timer states
  const timerRef = useRef<any | null>(null);
  const playlistRef = useRef<PlaylistStep[]>([]);
  const indexRef = useRef(0);
  const remainingRef = useRef(0);
  const elapsedRef = useRef(0);
  const pausedRef = useRef(false);

  // Keep ref sync (remaining/elapsed are ref-only, owned by the tick)
  playlistRef.current = playlist;
  indexRef.current = index;
  pausedRef.current = paused;
  loadingRef.current = loading;

  /**
   * Close the help sheet AND resume.
   *
   * Opening it pauses the session, so every way out of it has to unpause. Only
   * the Resume button did: dismissing by tapping the overlay or by hardware
   * back left the workout paused behind a sheet that was no longer there, and
   * the ring simply stopped with no indication why.
   */
  const closeHelp = () => {
    setShowHelp(false);
    pausedRef.current = false;
    setPaused(false);
  };
  const closeHelpRef = useRef<() => void>(() => {});
  closeHelpRef.current = closeHelp;

  /**
   * The three values finishWorkout reads, mirrored the same way.
   *
   * finishWorkout is reached from `advanceStep`, which is called by the 50ms
   * interval. That interval closes over the render in which it was created and
   * is only rebuilt when `loading` or `playlist` change, so by the last step of
   * a session its `currentStep` was the FIRST step of the playlist. Every
   * completed session was therefore recorded against the wrong exercise slug -
   * always the one the session opened with. `subscribed` was stale in the same
   * closure, so an account that subscribed from the paywall mid-session still
   * had its day capped at the free limit until the next launch.
   *
   * Same mechanism as playlistRef/indexRef above, for the same reason.
   */
  const currentStepRef = useRef<PlaylistStep | undefined>(undefined);
  const userRef = useRef(user);
  const subscribedRef = useRef(subscribed);
  userRef.current = user;
  subscribedRef.current = subscribed;

  // Tick display subscribers (ring + header time label) and change-detection so
  // we only push when something visible actually changed.
  const ringSubRef = useRef<((d: RingDisplay) => void) | null>(null);
  const timeSubRef = useRef<((s: string) => void) | null>(null);
  const lastPushedRef = useRef({ count: -1, pct: -1, time: '' });

  /**
   * How long the contract cue buzzes.
   *
   * Long enough to read through clothing while your eyes are off the screen,
   * short enough not to smear into the next beat of a staircase exercise,
   * whose steps are one second apart.
   */
  const CUE_MS = 60;

  /**
   * Fire the contract cue.
   *
   * Extracted because the FIRST step never went through advanceStep - that
   * only runs on a transition - so the opening Contract of every session, the
   * one cue the user is actually waiting for, was silent.
   *
   * Uses the plain vibrator rather than react-native-haptic-feedback. That
   * library stamps every Android vibration VibrationAttributes.USAGE_TOUCH,
   * and from Android 13 the OS drops USAGE_TOUCH outright when system touch
   * feedback is off - the exact setting this cue must not depend on.
   * ignoreAndroidSystemSettings does not rescue it: that flag only skips the
   * library's own ringer-mode check and its performHapticFeedback path, and
   * the effect it sends instead is still stamped USAGE_TOUCH. Which is why the
   * buzz stayed silent on the circle expanding, and on every step of the
   * staircase exercises, even after the flag was turned on. Vibration.vibrate
   * sends an untagged one-shot that the touch-feedback setting does not
   * govern.
   *
   * This is not UI polish. It tells you when to squeeze while your eyes may be
   * off the screen, which is closer to an alarm than to a keypress, and the
   * Profile switch read into hapticsOn is the consent for it.
   */
  const cueStep = (step: { phase: string } | undefined) => {
    // `subscribed` as well as the switch: the cue is part of the
    // subscription, and a lapsed account must stop being buzzed even though
    // its stored preference still says yes.
    if (!step || !hapticsOn.current || !subscribed || step.phase !== 'contract') return;
    try {
      Vibration.vibrate(CUE_MS);
    } catch {}
  };

  // `haptics_enabled` shipped in the schema defaults but nothing ever read it,
  // so the toggle did nothing and every user got buzzed whether they wanted it
  // or not. Loaded once into a ref because the step-transition path this feeds
  // runs inside the timer loop, where a DB read per tick would be absurd.
  //
  // Starts FALSE. The read below is async, so a `true` here meant the first
  // contraction of every session buzzed before the stored preference had even
  // been looked at - which is the one buzz somebody who turned it off would
  // most notice.
  const hapticsOn = useRef(false);
  useEffect(() => {
    getAppSetting('haptics_enabled', '0')
      .then((v) => {
        hapticsOn.current = v === '1';
      })
      .catch(() => {});
  }, []);

  const initWorkout = useCallback(async () => {
    try {
      // Inside the try. A bare `return` here left `loading` true for ever, so
      // a screen reached without a signed-in account sat on the spinner with
      // the back handler swallowing every attempt to leave it.
      if (!user) throw new Error('No signed-in user on the workout screen');
      const db = await getDBConnection();
      // Get completed days count
      const daysRes = await db.executeSql(
        'SELECT COUNT(*) as count FROM training_days WHERE user_id = ? AND completed_at IS NOT NULL',
        [user.id]
      );
      const completedDays = daysRes[0].rows.item(0).count || 0;

      let session;
      if (trialSlug) {
        session = buildSingleSession(trialSlug, user.level_id);
      } else {
        // A free account trains with the first three exercises only. The
        // day cap below already stops its day count short of the fourth
        // unlock, so this is belt to that braces - a day count arriving
        // from anywhere else still cannot widen the session.
        session = buildDailySession(completedDays, user.level_id, {
          freeOnly: !subscribed,
        });
      }

      if (session.steps.length === 0) {
        Alert.alert(t('workout.noExercisesTitle'), t('workout.noExercisesBody'));
        navigation.goBack();
        return;
      }

      remainingRef.current = session.steps[0].seconds;
      elapsedRef.current = 0;
      setPlaylist(session.steps);
      setLoading(false);
      /**
       * A session that was actually built and shown.
       *
       * After setPlaylist rather than at the top of this function, so the two
       * ways it can end without a session - no steps to build, or a throw -
       * are not counted as training that started. Paired with
       * workout_completed and workout_abandoned, this is the denominator for
       * "how many sessions get finished".
       */
      track(
        user.id,
        'workout_started',
        trialSlug ? 'preview' : 'daily',
        subscribed ? 'paid' : 'free',
        {
          level_id: user.level_id,
          exercise_count: countExercises(session.steps),
          trial_slug: trialSlug,
        },
      );
      // The opening Contract of a full session. advanceStep only runs on a
      // transition, so without this the very first cue - the one the user is
      // actually waiting for - never fired. Trials already had it.
      cueStep(session.steps[0]);

      // The session tour, once per account, on whichever session comes
      // first. It used to run on the demo; the demo is gone, so this IS the
      // first time most people see the circle - and the circle explains
      // nothing on its own.
      //
      // Held paused while the cards are up: three explanations of a ring
      // are worthless if the ring is running behind them, and the reader
      // would finish the tour having missed the exercise it described.
      if (!isTrial && !(await hasSeenTour('session', user.id))) {
        pausedRef.current = true;
        setPaused(true);
        setShowTour(true);
      }
    } catch (e) {
      console.error('Failed to build the workout session', e);
      // The screen has nothing to show and no way to recover on its own, so
      // say so and offer the two things worth offering. Leaving `loading`
      // true here left a spinner that never resolved.
      setInitFailed(true);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, subscribed, trialSlug, isTrial]);

  useEffect(() => {
    // Keep screen awake during active workout session
    KeepAwake.activate();
    initWorkout();

    return () => {
      KeepAwake.deactivate();
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // Intentionally keyed to mount only: re-running this would rebuild the
    // playlist mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retryInit = () => {
    setInitFailed(false);
    setLoading(true);
    initWorkout();
  };

  /**
   * Pause when the app leaves the foreground.
   *
   * The timer is a setInterval, and Android keeps JS timers running for a
   * while after the app is backgrounded. So answering a call in the middle of
   * a session came back to a ring that had counted down through several
   * exercises without anyone doing them, and the tick's own 250ms stall clamp
   * only softens that, it does not prevent it. A session you were not present
   * for is not a session, so it waits.
   *
   * Only ever pauses. Resuming automatically would start the next contraction
   * while the phone is still on its way back into the pocket; the Resume
   * button is one tap and it is the reader's call.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        pausedRef.current = true;
        setPaused(true);
      }
    });
    return () => sub.remove();
  }, []);

  // Push the tick-driven display values to the ring / time-label subscribers.
  // Skips pushes that would not change anything visible (int counter, ~0.2% ring
  // movement, same label string) so long steps update well below 20fps.
  const pushTickDisplays = (force = false) => {
    const count = getBlockRemaining();
    const pct = getBlockPct();
    const time = getTimeLabel();
    const last = lastPushedRef.current;
    if (force || count !== last.count || Math.abs(pct - last.pct) > 0.002) {
      last.count = count;
      last.pct = pct;
      ringSubRef.current?.({ count, pct });
    }
    if (force || time !== last.time) {
      last.time = time;
      timeSubRef.current?.(time);
    }
  };

  // Stable registration callbacks for the subscriber components. Hydrate the
  // subscriber immediately so its first frame shows real values, not zeros.
  const registerRing = useCallback((fn: (d: RingDisplay) => void) => {
    ringSubRef.current = fn;
    fn({ count: getBlockRemaining(), pct: getBlockPct() });
    return () => {
      if (ringSubRef.current === fn) ringSubRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const registerTime = useCallback((fn: (s: string) => void) => {
    timeSubRef.current = fn;
    fn(getTimeLabel());
    return () => {
      if (timeSubRef.current === fn) timeSubRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Main high-performance countdown timer loop (runs every 50ms). Works purely
  // on refs + subscriber pushes: no React state updates in the hot path.
  const lastTickAtRef = useRef(0);
  useEffect(() => {
    if (loading || playlist.length === 0) return;

    lastTickAtRef.current = Date.now();
    timerRef.current = setInterval(() => {
      if (pausedRef.current) {
        // Keep the clock anchored while paused so resuming doesn't jump.
        lastTickAtRef.current = Date.now();
        return;
      }

      // Wall-clock step, not a fixed 50ms: setInterval drifts under JS-thread
      // load, and assuming 50ms per tick made real sessions run LONGER than the
      // displayed time. Clamp the step so a long stall (app backgrounded, GC
      // pause) advances at most 250ms instead of skipping half an exercise.
      const now = Date.now();
      const dt = Math.min(0.25, Math.max(0, (now - lastTickAtRef.current) / 1000));
      lastTickAtRef.current = now;
      remainingRef.current = Math.max(0, remainingRef.current - dt);
      elapsedRef.current = elapsedRef.current + dt;

      // Perform smooth glow updates
      updateGlowAnimation();
      pushTickDisplays();

      if (remainingRef.current <= 0.0001) {
        advanceStep();
      }
    }, 50);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, playlist]);

  const advanceStep = () => {
    const nextIdx = indexRef.current + 1;
    if (nextIdx >= playlistRef.current.length) {
      finishWorkout();
    } else {
      const nextStep = playlistRef.current[nextIdx];
      indexRef.current = nextIdx;
      remainingRef.current = nextStep.seconds;
      setIndex(nextIdx);
      pushTickDisplays(true);

      // Buzz on CONTRACT only. Relax used to get its own lighter buzz, which
      // made the cue useless: something vibrated at every transition, so the
      // phone stopped telling you which phase you were entering. Silence on
      // relax is the signal - a buzz means squeeze, and nothing else does.
      cueStep(nextStep);
    }
  };

  // Mathematical smoothstep implementation matching Laravel Blade:
  // ease(t) = t * t * (3 - 2 * t)
  const ease = (t: number) => {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped * clamped * (3 - 2 * clamped);
  };

  const updateGlowAnimation = () => {
    const cur = playlistRef.current[indexRef.current];
    if (!cur) return;

    const total = cur.seconds;
    const progress = Math.max(0, Math.min(1, (total - remainingRef.current) / Math.max(0.001, total)));

    let intensity = 0;
    if (cur.phase !== 'relax' && cur.slug !== 'rest') {
      if (cur.from !== undefined && cur.to !== undefined) {
        intensity = cur.from + (cur.to - cur.from) * ease(progress);
      } else {
        // Fallback to slowly transition
        intensity = ease(progress);
      }
    } else {
      if (cur.from !== undefined && cur.to !== undefined) {
        intensity = cur.from + (cur.to - cur.from) * ease(progress);
      } else {
        // Fallback to release transition
        intensity = 1 - ease(progress);
      }
    }

    // Ensure intensity bounds
    intensity = Math.max(0, Math.min(1, intensity));

    const targetScale = 0.58 + intensity * 0.42;
    const targetOpacity = cur.slug === 'rest' ? 0 : 0.08 + intensity * 0.92;

    // Smooth-pursuit toward the target on the native driver. The tick restarts
    // this every 50ms, so the eased timing acts as a low-pass filter: gradual
    // ramps (e.g. "Contract slowly") track with negligible lag, while
    // step-boundary jumps (e.g. Front Clamp's full squeeze -> instant "Release")
    // ease out instead of snapping in a single tick. The pursuit scales with
    // the step length: long ramps keep the smooth 240ms chase, but sub-second
    // moves (Reverse Clamp's 0.3s squeeze, Front Clamp's release beat, Flash
    // flicks) get a faster one - a fixed 240ms filter swallowed most of a 0.3s
    // step, which read as a dead pause between reps.
    // How far the circle must travel ENTERING this step. A hold has from === to,
    // so its own span is zero, yet entering it can still be a full-scale move
    // from wherever the previous step ended: Front Clamp builds to full over 3s
    // then holds at zero, and the 1s "Relax" beats after a long hold do the
    // same. Sizing the chase only by step LENGTH treated those identically to a
    // step that barely moves, so a full-height drop collapsed in a couple of
    // frames and then sat dead for the rest of the beat.
    const prevStep = playlistRef.current[indexRef.current - 1];
    const entryFrom = prevStep ? (prevStep.to ?? prevStep.from ?? 0) : 0;
    const entryJump = Math.abs((cur.from ?? 0) - entryFrom);
    const basePursuit = Math.min(240, Math.max(80, total * 400));
    // Only real jumps earn extra time. The graded Upstairs / Downstairs /
    // Elevator steps move 0.25 at a time and should stay crisp, which is the
    // point of those exercises. Capped at 60% of the step so the circle always
    // settles before the next one begins.
    const settleMs =
      entryJump > 0.3 ? Math.min(entryJump * 520, total * 1000 * 0.6) : 0;
    const pursuitMs = Math.max(basePursuit, settleMs);
    Animated.parallel([
      Animated.timing(glowScale, {
        toValue: targetScale,
        duration: pursuitMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: targetOpacity,
        duration: pursuitMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const finishWorkout = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    KeepAwake.deactivate();
    finishedRef.current = true;

    // A tutorial / try-it-now preview is throwaway: it records nothing and ends
    // on a simple "Great job!" with a Try again, NOT the day-complete session
    // screen (which is only for real training sessions).
    if (isTrial) {
      // Still a completion, and still counted - it is the one session a
      // curious reader finishes before they have any training record at all,
      // so leaving it out would make the preview look like something nobody
      // ever gets to the end of. No day can close on it, hence the constant.
      track(
        userRef.current?.id,
        'workout_completed',
        'preview',
        subscribedRef.current ? 'paid' : 'free',
        {
          level_id: userRef.current?.level_id ?? null,
          seconds: Math.max(0, Math.round(elapsedRef.current)),
          exercise_count: countExercises(playlistRef.current),
          day_completed: false,
        },
      );
      setTrialDone(true);
      return;
    }

    const secs = Math.max(0, Math.round(elapsedRef.current));

    // Live values, not the ones this closure captured - see currentStepRef.
    const finishedUser = userRef.current;
    const finishedStep = currentStepRef.current;
    const finishedSubscribed = subscribedRef.current;

    if (finishedUser) {
      try {
        // Save session locally to SQLite
        // The workout is always recorded. The DAY only closes while the
        // account is still inside the free allowance, which is what freezes
        // plan position, unlocks and the streak for a free tier - and what
        // lets a subscription pick the plan up exactly where it stopped
        // rather than restarting it.
        await recordCompletedSession(
          finishedUser.id,
          finishedStep?.slug || null,
          secs,
          finishedUser.level_id,
          finishedSubscribed ? undefined : { maxCompletedDays: FREE_DAY_CAP },
        );
        // Push the lapse check-in back another 72 hours. Doing this on every
        // completed session means an active user perpetually postpones it and
        // never sees it - it only ever arrives for someone who has actually
        // gone quiet, which until now was someone the app had no way of
        // contacting at all.
        scheduleLapseNudge().catch(() => {});

        /**
         * Whether this session was the one that CLOSED the day.
         *
         * Read back from the row recordCompletedSession just wrote rather than
         * guessed from a session count, because the rule it applies is not
         * simple: two sessions close a day, but a free account past the day
         * cap records the session and deliberately leaves the day open. The
         * row is the only thing that knows which happened, and "sessions done"
         * against "days completed" is the pair the training report is built
         * on. Its own try: a failed read must not cost the sync below.
         */
        let dayCompleted = false;
        try {
          const today = await getTrainingDay(
            finishedUser.id,
            getLocalDateString(finishedUser.timezone ?? null),
          );
          dayCompleted = !!today?.completed_at;
        } catch {}

        track(finishedUser.id, 'workout_completed', 'daily', finishedSubscribed ? 'paid' : 'free', {
          level_id: finishedUser.level_id,
          seconds: secs,
          exercise_count: countExercises(playlistRef.current),
          day_completed: dayCompleted,
        });

        // Sync with Laravel server in background
        syncNow(finishedUser.id).catch(() => {});
      } catch (e) {
        console.error('Failed to save workout session results locally', e);
      }
    }

    // Go to workout complete celebration page
    (navigation as any).replace('WorkoutComplete', {
      duration: secs,
      levelId: finishedUser?.level_id || 1,
    });
  };

  // Replay the same single-exercise tutorial from the start (Try again).
  const restartTrial = () => {
    if (!trialSlug) return;
    const session = buildSingleSession(trialSlug, user?.level_id || 1);
    if (session.steps.length === 0) {
      navigation.goBack();
      return;
    }
    indexRef.current = 0;
    remainingRef.current = session.steps[0].seconds;
    elapsedRef.current = 0;
    pausedRef.current = false;
    setIndex(0);
    setPaused(false);
    setTrialDone(false);
    // Running again from the top, so quitting it is a real abandon again.
    finishedRef.current = false;
    // New array reference re-runs the timer effect and starts a fresh loop.
    setPlaylist([...session.steps]);
    pushTickDisplays(true);
    cueStep(session.steps[0]);
    KeepAwake.activate();
  };

  /**
   * The single non-finish exit.
   *
   * Every way out that is not the last step arrives here - the quit modal, the
   * trial's Skip, and the hardware back button through handleQuitRef - so this
   * is the one place that can say a session was abandoned, and the quarter it
   * was abandoned in is the answer to "where do people give up".
   *
   * Live refs throughout, for the same reason finishWorkout uses them: this
   * function is re-created every render but is also reached through a ref held
   * by a listener registered once.
   */
  const handleQuit = () => {
    if (finishedRef.current) {
      if (timerRef.current) clearInterval(timerRef.current);
      KeepAwake.deactivate();
      navigation.goBack();
      return;
    }
    const steps = playlistRef.current;
    const stepIndex = indexRef.current;
    const step = steps[stepIndex];
    track(
      userRef.current?.id,
      'workout_abandoned',
      isTrial ? 'preview' : 'daily',
      abandonQuarter(stepIndex, steps.length),
      {
        level_id: userRef.current?.level_id ?? null,
        seconds_elapsed: Math.max(0, Math.round(elapsedRef.current)),
        step_index: stepIndex,
        total_steps: steps.length,
        // Which exercise was on screen when they stopped, and whether they
        // were mid-squeeze or resting. A session quit during a contract and
        // one quit during a rest are different complaints.
        exercise_slug: step?.slug ?? null,
        phase: step?.phase ?? null,
      },
    );
    if (timerRef.current) clearInterval(timerRef.current);
    KeepAwake.deactivate();
    navigation.goBack();
  };
  handleQuitRef.current = handleQuit;

  const currentStep = playlist[index];
  currentStepRef.current = currentStep;

  // Exercise-block carousel (Past · Current · Next): collapse consecutive
  // same-exercise steps into one labelled block, matching the web carousel.
  // Grouped by SLUG, and the label resolved at render. Grouping on the visible
  // text would merge two genuinely different exercises in any language where
  // their names happen to collide, and would rebuild the whole carousel on a
  // language change.
  const blocks = useMemo(() => {
    const out: { slug: string; rest: boolean; startIndex: number }[] = [];
    playlist.forEach((step, i) => {
      const last = out[out.length - 1];
      if (!last || last.slug !== step.slug) {
        out.push({ slug: step.slug, rest: step.slug === 'rest', startIndex: i });
      }
    });
    return out;
  }, [playlist]);

  const currentBlockIndex = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].startIndex <= index) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [blocks, index]);

  // Smoothly slide the carousel so the active exercise block stays centered.
  const trackX = useRef(new Animated.Value(0)).current;
  const itemLayoutsRef = useRef<{ x: number; width: number }[]>([]);
  const carouselWidthRef = useRef(0);
  const recenter = () => {
    const l = itemLayoutsRef.current[currentBlockIndex];
    if (l && carouselWidthRef.current) {
      Animated.timing(trackX, {
        toValue: carouselWidthRef.current / 2 - (l.x + l.width / 2),
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  };
  useEffect(() => {
    recenter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBlockIndex]);

  // Hardware back opens (or closes) the quit-training confirmation instead of
  // leaving the workout outright.
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        // Nothing to quit yet. Swallowing back here trapped anyone whose
        // session was still building or had failed to build: the screen showed
        // a spinner, the quit sheet talks about losing progress that does not
        // exist, and the only other control on screen was the X. Let the
        // navigator take it.
        if (loadingRef.current || !currentStepRef.current) {
          return false;
        }
        if (showHelpRef.current) {
          closeHelpRef.current();
          return true;
        }
        // A trial/tutorial run isn't a real training session - just exit it.
        if (isTrial) {
          handleQuitRef.current();
          return true;
        }
        if (showQuitModalRef.current) {
          setShowQuitModal(false);
        } else {
          setShowQuitModal(true);
        }
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [isTrial])
  );

  // Helper functions for circular ring percentage representation. These read
  // refs (not state) so the 50ms tick can call them without the screen
  // re-rendering, and registration-time hydration gets current values too.
  const getBlockRemaining = () => {
    const pl = playlistRef.current;
    const idx = indexRef.current;
    const cur = pl[idx];
    if (!cur) return 0;
    if (cur.slug === 'rest') return Math.max(0, Math.ceil(remainingRef.current));

    let rem = remainingRef.current;
    for (let k = idx + 1; k < pl.length; k++) {
      const s = pl[k];
      if (s.slug !== cur.slug) break;
      rem += s.seconds;
    }
    return Math.max(0, Math.ceil(rem));
  };

  const getBlockRemainingRaw = () => {
    const pl = playlistRef.current;
    const idx = indexRef.current;
    const cur = pl[idx];
    if (!cur) return 0;
    if (cur.slug === 'rest') return Math.max(0, remainingRef.current);

    let rem = remainingRef.current;
    for (let k = idx + 1; k < pl.length; k++) {
      const s = pl[k];
      if (s.slug !== cur.slug) break;
      rem += s.seconds;
    }
    return Math.max(0, rem);
  };

  const getBlockTotal = () => {
    const pl = playlistRef.current;
    const idx = indexRef.current;
    const cur = pl[idx];
    if (!cur) return 1;
    if (cur.slug === 'rest') return Math.max(1, cur.seconds);

    let start = idx;
    while (
      start > 0 &&
      pl[start - 1].slug !== 'rest' &&
      pl[start - 1].slug === cur.slug
    ) {
      start--;
    }

    let total = 0;
    for (let k = start; k < pl.length; k++) {
      const s = pl[k];
      if (s.slug !== cur.slug) break;
      total += s.seconds;
    }
    return Math.max(1, total);
  };

  const getBlockPct = () => {
    const total = getBlockTotal();
    const blockRem = getBlockRemainingRaw();
    return Math.min(1, Math.max(0, (total - blockRem) / total));
  };

  const getTotalRemaining = () => {
    const pl = playlistRef.current;
    let rem = remainingRef.current;
    for (let k = indexRef.current + 1; k < pl.length; k++) {
      rem += pl[k].seconds;
    }
    return Math.ceil(rem);
  };

  const getTimeLabel = () => {
    const s = getTotalRemaining();
    if (s > 30) {
      // ROUND, not ceil.
      //
      // buildDailySession deliberately overshoots its target when landing just
      // over is closer than stopping short - the steps have to complete whole
      // contract/relax cycles - so a level-3 session aiming at 180s is built as
      // ~186s. Ceiling that announced "4 min" for the first few seconds of
      // every session, a whole minute more than the length Training had just
      // advertised, before dropping to 3 once the clock passed 180.
      //
      // Rounding rather than flooring: floor would fix the opening number but
      // then report the minute BELOW the one remaining for most of the session
      // (179s reading "2 min"), and drop a minute earlier than the reader
      // expects. Rounding is right at both ends - it absorbs the few seconds of
      // build slack without under-reporting the rest of the way.
      //
      // Cannot reach zero: this branch only runs above 30s, and 31/60 rounds
      // to 1.
      return t('workout.minutesLeft', { count: Math.round(s / 60) });
    }
    return t('workout.secondsLeft', { count: s });
  };

  if (initFailed) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Watermark />
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>{t('workout.couldNotStartTitle')}</Text>
          <Text style={styles.errorBody}>{t('workout.couldNotStartBody')}</Text>
          <TouchableOpacity
            style={styles.errorPrimaryBtn}
            accessibilityRole="button"
            onPress={retryInit}
          >
            <Text style={styles.errorPrimaryBtnText}>{t('common.tryAgain')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.errorSecondaryBtn}
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.errorSecondaryBtnText}>{t('workout.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading || !currentStep) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </SafeAreaView>
    );
  }

  // Tutorial / try-it-now completion: celebrate and offer a replay.
  if (isTrial && trialDone) {
    return (
      <SafeAreaView style={styles.container}>
        <Watermark />
        <View style={styles.trialDoneContainer}>
          <View style={styles.trialDoneIcon}>
            <Svg width={52} height={52} viewBox="0 0 24 24" fill="none">
              <Path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke={COLORS.accentText} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M22 4L12 14.01l-3-3" stroke={COLORS.accentText} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <Text style={styles.trialDoneTitle}>{t('workout.greatJob')}</Text>
        </View>
        <View style={styles.trialDoneCta}>
          <TouchableOpacity style={styles.tryAgainBtn} onPress={restartTrial}>
            <Text style={styles.tryAgainBtnText}>{t('workout.tryAgain')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backToExerciseBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backToExerciseBtnText}>{t('workout.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Either sheet is a modal in intent, so everything under it must leave the
  // accessibility tree. Without this a screen reader walks straight past the
  // sheet into the ring, the carousel and the pause button behind it, which is
  // the one part of the screen that is not currently operable.
  const sheetOpen = showHelp || showQuitModal;

  return (
    <SafeAreaView style={styles.container}>
      <Watermark />
      <View
        style={styles.screenBody}
        importantForAccessibility={sheetOpen ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={sheetOpen}
      >
      {/* Top header. Real sessions: X opens the quit confirmation + live time
          label. Trials/tutorials: just the X, exiting immediately - a trial
          records nothing, so there is nothing to confirm. */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isTrial ? t('workout.back') : t('workout.leaveTraining')}
          onPress={() => (isTrial ? handleQuit() : setShowQuitModal(true))}
        >
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M18 6L6 18M6 6l12 12" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
        {!isTrial && <LiveTimeLabel register={registerTime} />}
        {/* Balances the close button so the time label stays centred. */}
        <View style={styles.headerGutter} />
      </View>

      {/* Main Circular Player View */}
      <View style={styles.playerContainer}>
        <View
          ref={tourRingRef}
          collapsable={false}
          style={[styles.circleContainer, { width: haloSize, height: haloSize }]}
        >
          {/* Animated contract glow: a soft accent radial-gradient halo behind
              the circle (matches the web .contract-glow), scaling out and
              brightening with squeeze intensity. */}
          <Animated.View
            style={[
              styles.contractGlow,
              {
                width: haloSize,
                height: haloSize,
                opacity: glowOpacity,
                transform: [{ scale: glowScale }],
              },
            ]}
          >
            <ContractGlow size={circleSize} />
          </Animated.View>

          {/* Central progress ring: tick-subscribed so only it repaints */}
          <LiveProgressRing
            label={t(currentStep.labelKey)}
            register={registerRing}
            size={circleSize}
          />
        </View>
      </View>

      {/* Per-exercise help: pause and open the tutorial for the current move.
          Kept in the layout (placeholder when hidden) so the ring never shifts. */}
      <View style={styles.helpRow}>
        {/* Hidden for the free session. Its "Watch tutorial" button opens
            ExerciseDetail, which is not registered in the guest stack - and
            registering it would not help, because its own "Try it now" starts
            a trialSlug workout whose init path returns early without a user
            and hangs on the loading state. A guest tapping help would have hit
            a dead control in the middle of the one session meant to sell them
            the app. */}
        {!isTrial && currentStep.slug !== 'rest' ? (
          <TouchableOpacity
            style={styles.helpBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('workout.exerciseTutorial')}
            onPress={() => {
              pausedRef.current = true;
              setPaused(true);
              setShowHelp(true);
            }}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Circle cx={12} cy={12} r={9} stroke={COLORS.textMuted} strokeWidth={1.8} />
              <Path d="M9.5 9a2.5 2.5 0 113.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01" stroke={COLORS.textMuted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        ) : (
          // Borderless spacer keeps the ring from shifting on rest steps / trials
          // without drawing an empty circle where the help button would be.
          <View style={styles.helpBtnPlaceholder} />
        )}
      </View>

      {/* Exercise carousel - all blocks in a row, smoothly auto-centering on the
          active item (matches the web workout carousel). */}
      <View
        ref={tourListRef}
        collapsable={false}
        style={styles.carouselContainer}
        onLayout={e => {
          carouselWidthRef.current = e.nativeEvent.layout.width;
          recenter();
        }}
      >
        <Animated.View
          style={[styles.carouselTrack, { transform: [{ translateX: trackX }] }]}
        >
          {blocks.map((b, i) => (
            <Text
              key={i}
              onLayout={e => {
                const { x, width: w } = e.nativeEvent.layout;
                itemLayoutsRef.current[i] = { x, width: w };
                if (i === currentBlockIndex) {
                  recenter();
                }
              }}
              style={[
                styles.carouselItem,
                i === currentBlockIndex
                  ? b.rest
                    ? styles.carouselItemRest
                    : styles.carouselItemActive
                  : styles.carouselItemInactive,
              ]}
              numberOfLines={1}
            >
              {t(b.rest ? REST_LABEL_KEY : exerciseNameKey(b.slug))}
            </Text>
          ))}
        </Animated.View>
      </View>

      {/* Footer controls */}
      <View ref={tourPauseRef} collapsable={false} style={styles.footer}>
        <TouchableOpacity
          style={styles.pauseBtn}
          accessibilityRole="button"
          accessibilityLabel={paused ? t('workout.resume') : t('workout.pause')}
          accessibilityState={{ selected: paused }}
          onPress={() => {
            pausedRef.current = !paused;
            setPaused(!paused);
          }}
        >
          {paused ? (
            <View style={styles.playTextContainer}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill={COLORS.accentText}>
                <Path d="M8 5v14l11-7z" />
              </Svg>
              <Text style={[styles.pauseBtnText, { color: COLORS.accentText }]}>{t('workout.resume')}</Text>
            </View>
          ) : (
            <View style={styles.playTextContainer}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill={COLORS.white}>
                <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </Svg>
              <Text style={styles.pauseBtnText}>{t('workout.pause')}</Text>
            </View>
          )}
        </TouchableOpacity>
        {isTrial && (
          <TouchableOpacity style={styles.skipBtn} onPress={handleQuit}>
            <Text style={styles.skipBtnText}>{t('workout.skip')}</Text>
          </TouchableOpacity>
        )}
      </View>
      </View>

      {/* Help / tutorial bottom sheet */}
      {showHelp && (
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          accessibilityViewIsModal
          onPress={closeHelp}
        >
          <TouchableWithoutFeedback>
            <SafeAreaView style={styles.modalContent}>
              <View style={styles.handleBar} />
              <Text style={styles.modalTitle}>{t(exerciseNameKey(currentStep.slug))}</Text>
              <Text style={styles.modalBody}>
                {t('workout.watchTheQuickTutorialFor')}
              </Text>
              {/* Resume first and in the accent, because it is what almost
                  everyone wants next: the sheet was opened mid-session to
                  glance at a description, and leaving for the tutorial screen
                  abandons the session. The leaving action stays available,
                  just not dressed as the recommendation. */}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.primarySheetBtn]}
                  accessibilityRole="button"
                  onPress={closeHelp}
                >
                  <Text style={styles.primarySheetBtnText}>{t('workout.resume')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.mutedSheetBtn]}
                  accessibilityRole="button"
                  onPress={() => {
                    setShowHelp(false);
                    navigation.navigate('ExerciseDetail', {
                      slug: currentStep.slug,
                      unlocked: true,
                      daysLeft: 0,
                    });
                  }}
                >
                  <Text style={styles.mutedSheetBtnText}>{t('workout.watchTutorial')}</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      )}

      {/* Quit Confirmation Modal */}
      {showQuitModal && (
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          accessibilityViewIsModal
          onPress={() => setShowQuitModal(false)}
        >
          <TouchableWithoutFeedback>
            <SafeAreaView style={styles.modalContent}>
              <View style={styles.handleBar} />
              <Text style={styles.modalTitle}>{t('workout.leaveTraining')}</Text>
              <Text style={styles.modalBody}>
                {t('workout.ifYouLeaveThisSession')}
              </Text>
              {/* Staying is the accent button and comes first. This sheet is a
                  confirmation, so the destructive answer must never be the one
                  dressed as the recommendation - and losing the session is
                  exactly what the body text has just warned about. */}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.primarySheetBtn]}
                  accessibilityRole="button"
                  onPress={() => setShowQuitModal(false)}
                >
                  <Text style={styles.primarySheetBtnText}>{t('workout.noGoBack')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.mutedSheetBtn]}
                  accessibilityRole="button"
                  onPress={handleQuit}
                >
                  <Text style={styles.mutedSheetBtnText}>{t('workout.yesQuitTraining')}</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      )}

      <TourOverlay
        visible={showTour}
        steps={SESSION_TOUR}
        targets={{
          ring: tourRingRef,
          list: tourListRef,
          pause: tourPauseRef,
        }}
        onDone={(completed) => {
          setShowTour(false);
          // Straight back into the session they came for.
          pausedRef.current = false;
          setPaused(false);
          markTourSeen('session', user?.id, completed);
        }}
      />
    </SafeAreaView>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  // One wrapper so the whole session can be hidden from assistive tech in a
  // single place while a sheet is up.
  screenBody: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  closeBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerGutter: {
    width: 44,
  },
  timeText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  playerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  // Sized inline from the live window - see circleSizeFor. Only the parts that
  // do not depend on it stay here, so the memoised stylesheet keeps its
  // palette-only identity.
  circleContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  contractGlow: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRing: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  ringLabelContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    start: 0,
    end: 0,
  },
  counterText: {
    fontSize: 54,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  phaseLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  carouselContainer: {
    height: 40,
    marginVertical: 20,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  carouselTrack: {
    position: 'absolute',
    start: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  carouselItem: {
    paddingHorizontal: 18, // gap between items
    fontSize: 15,
    textAlign: 'center',
  },
  carouselItemActive: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  carouselItemRest: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  carouselItemInactive: {
    color: COLORS.textDim,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  pauseBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipBtn: {
    height: 48,
    marginTop: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipBtnText: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  playTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pauseBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  helpRow: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  helpBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBtnPlaceholder: {
    width: 44,
    height: 44,
  },

  // Trial / tutorial completion
  trialDoneContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  trialDoneIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  trialDoneTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  trialDoneCta: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 12,
  },
  tryAgainBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tryAgainBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  backToExerciseBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backToExerciseBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },

  // Modal styling
  modalOverlay: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    backgroundColor: COLORS.scrim,
    justifyContent: 'flex-end',
    zIndex: 9999,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.borderStrong,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 10,
  },
  modalBody: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButtons: {
    gap: 12,
  },
  modalBtn: {
    height: 54,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Named for their ROLE in the sheet rather than for one sheet's wording.
  // They were `quitBtn` and `backToTrainingBtn`, which is how the accent came
  // to be on "Yes, quit training" in one sheet and on the leaving action in
  // the other: the names described where they were first used, not what they
  // mean, so the recommended answer followed the position instead of the
  // intent.
  primarySheetBtn: {
    backgroundColor: COLORS.accent,
  },
  primarySheetBtnText: {
    color: COLORS.onAccent,
    fontWeight: 'bold',
    fontSize: 15,
  },
  mutedSheetBtn: {
    backgroundColor: COLORS.surface2,
  },
  mutedSheetBtnText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 15,
  },
  errorCard: {
    marginHorizontal: 24,
    padding: 24,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
  },
  errorBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  errorPrimaryBtn: {
    marginTop: 20,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorPrimaryBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  errorSecondaryBtn: {
    marginTop: 10,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorSecondaryBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.white,
  },
});
