import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Alert,
  ActivityIndicator,
  BackHandler,
  Easing,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp, NavigationProp, useFocusEffect } from '@react-navigation/native';
import KeepAwake from 'react-native-keep-awake';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../theme/colors';
import { buildDailySession, buildSingleSession, PlaylistStep } from '../../services/sessionBuilder';
import { getDBConnection } from '../../db/sqlite';
import { recordCompletedSession } from '../../db/queries';
import { syncNow } from '../../services/sync';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Watermark } from '../../components/Watermark';

const { width } = Dimensions.get('window');
// The contract glow halo extends to 1.7x this, so keep 1.7*CIRCLE_SIZE within
// the screen width (with margin) - otherwise the glow overflows the screen.
const CIRCLE_SIZE = Math.min(width * 0.52, 200);
const TRACK_WIDTH = 12;
const R = (CIRCLE_SIZE - TRACK_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

type RouteParams = {
  Workout: {
    trialSlug?: string;
  };
};

export const WorkoutScreen = () => {
  const route = useRoute<RouteProp<RouteParams, 'Workout'>>();
  const navigation = useNavigation<NavigationProp<any>>();
  const { user } = useAuth();

  const trialSlug = route.params?.trialSlug || null;
  const isTrial = !!trialSlug;

  const [playlist, setPlaylist] = useState<PlaylistStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showQuitModal, setShowQuitModal] = useState(false);
  // Help sheet (per-exercise tutorial) shown during a real session.
  const [showHelp, setShowHelp] = useState(false);
  // Trial/tutorial finished: show a simple "Great job! / Try again" instead of
  // the day-complete session screen.
  const [trialDone, setTrialDone] = useState(false);

  // Animated values for smooth glow/pulsing contraction indicator
  const glowScale = useRef(new Animated.Value(0.58)).current;
  const glowOpacity = useRef(new Animated.Value(0.08)).current;

  // Stable refs to prevent back button loops and stale state in callback
  const showHelpRef = useRef(false);
  const showQuitModalRef = useRef(false);
  showHelpRef.current = showHelp;
  showQuitModalRef.current = showQuitModal;

  const handleQuitRef = useRef<() => void>(() => {});

  // Refs for tracking timer states
  const timerRef = useRef<any | null>(null);
  const playlistRef = useRef<PlaylistStep[]>([]);
  const indexRef = useRef(0);
  const remainingRef = useRef(0);
  const elapsedRef = useRef(0);
  const pausedRef = useRef(false);

  // Keep ref sync
  playlistRef.current = playlist;
  indexRef.current = index;
  remainingRef.current = remaining;
  elapsedRef.current = elapsed;
  pausedRef.current = paused;

  const hapticOptions = {
    enableVibrateFallback: true,
    ignoreAndroidSystemSettings: false,
  };

  useEffect(() => {
    // Keep screen awake during active workout session
    KeepAwake.activate();

    const initWorkout = async () => {
      if (!user) return;
      try {
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
          session = buildDailySession(completedDays, user.level_id);
        }

        if (session.steps.length === 0) {
          Alert.alert('No Exercises', 'No exercises unlocked for this workout.');
          navigation.goBack();
          return;
        }

        setPlaylist(session.steps);
        setRemaining(session.steps[0].seconds);
        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };

    initWorkout();

    return () => {
      KeepAwake.deactivate();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Main high-performance countdown timer loop (runs every 50ms)
  useEffect(() => {
    if (loading || playlist.length === 0) return;

    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;

      const dt = 0.05; // 50ms step size
      const newRemaining = Math.max(0, remainingRef.current - dt);
      const newElapsed = elapsedRef.current + dt;

      remainingRef.current = newRemaining;
      elapsedRef.current = newElapsed;

      setRemaining(newRemaining);
      setElapsed(newElapsed);

      // Perform smooth glow updates
      updateGlowAnimation();

      if (newRemaining <= 0.0001) {
        advanceStep();
      }
    }, 50);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading, playlist]);

  const advanceStep = () => {
    const nextIdx = indexRef.current + 1;
    if (nextIdx >= playlistRef.current.length) {
      finishWorkout();
    } else {
      const nextStep = playlistRef.current[nextIdx];
      setIndex(nextIdx);
      remainingRef.current = nextStep.seconds;
      setRemaining(nextStep.seconds);

      // Trigger cues with Haptics based on current target transition
      try {
        if (nextStep.phase === 'contract') {
          ReactNativeHapticFeedback.trigger('impactMedium', hapticOptions);
        } else {
          ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
        }
      } catch (e) {}
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

    // Direct animate calls with native driver for fluid 60FPS transitions
    Animated.parallel([
      Animated.timing(glowScale, {
        toValue: targetScale,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: targetOpacity,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const finishWorkout = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    KeepAwake.deactivate();

    // A tutorial / try-it-now preview is throwaway: it records nothing and ends
    // on a simple "Great job!" with a Try again, NOT the day-complete session
    // screen (which is only for real training sessions).
    if (isTrial) {
      setTrialDone(true);
      return;
    }

    const secs = Math.max(0, Math.round(elapsedRef.current));

    if (user) {
      try {
        // Save session locally to SQLite
        await recordCompletedSession(user.id, currentStep?.slug || null, secs, user.level_id);
        // Sync with Laravel server in background
        syncNow(user.id).catch(() => {});
      } catch (e) {
        console.error('Failed to save workout session results locally', e);
      }
    }

    // Go to workout complete celebration page
    (navigation as any).replace('WorkoutComplete', { duration: secs, levelId: user?.level_id || 1 });
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
    setRemaining(session.steps[0].seconds);
    setElapsed(0);
    setPaused(false);
    setTrialDone(false);
    // New array reference re-runs the timer effect and starts a fresh loop.
    setPlaylist([...session.steps]);
    KeepAwake.activate();
  };

  const handleQuit = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    KeepAwake.deactivate();
    navigation.goBack();
  };
  handleQuitRef.current = handleQuit;

  const currentStep = playlist[index];

  // Exercise-block carousel (Past · Current · Next): collapse consecutive
  // same-exercise steps into one labelled block, matching the web carousel.
  const blocks = useMemo(() => {
    const out: { label: string; rest: boolean; startIndex: number }[] = [];
    playlist.forEach((step, i) => {
      const label = step.slug === 'rest' ? 'Rest' : step.exerciseName;
      const last = out[out.length - 1];
      if (!last || last.label !== label) {
        out.push({ label, rest: step.slug === 'rest', startIndex: i });
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
        if (showHelpRef.current) {
          setShowHelp(false);
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

  // Helper functions for circular ring percentage representation
  const getBlockRemaining = () => {
    if (!currentStep) return 0;
    if (currentStep.slug === 'rest') return Math.max(0, Math.ceil(remaining));

    let rem = remaining;
    for (let k = index + 1; k < playlist.length; k++) {
      const s = playlist[k];
      if (s.slug === 'rest' || s.exerciseName !== currentStep.exerciseName) break;
      rem += s.seconds;
    }
    return Math.max(0, Math.ceil(rem));
  };

  const getBlockRemainingRaw = () => {
    if (!currentStep) return 0;
    if (currentStep.slug === 'rest') return Math.max(0, remaining);

    let rem = remaining;
    for (let k = index + 1; k < playlist.length; k++) {
      const s = playlist[k];
      if (s.slug === 'rest' || s.exerciseName !== currentStep.exerciseName) break;
      rem += s.seconds;
    }
    return Math.max(0, rem);
  };

  const getBlockTotal = () => {
    if (!currentStep) return 1;
    if (currentStep.slug === 'rest') return Math.max(1, currentStep.seconds);

    let start = index;
    while (
      start > 0 &&
      playlist[start - 1].slug !== 'rest' &&
      playlist[start - 1].exerciseName === currentStep.exerciseName
    ) {
      start--;
    }

    let total = 0;
    for (let k = start; k < playlist.length; k++) {
      const s = playlist[k];
      if (s.slug === 'rest' || s.exerciseName !== currentStep.exerciseName) break;
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
    let rem = remaining;
    for (let k = index + 1; k < playlist.length; k++) {
      rem += playlist[k].seconds;
    }
    return Math.ceil(rem);
  };

  const getTimeLabel = () => {
    const s = getTotalRemaining();
    if (s > 30) {
      return `${Math.ceil(s / 60)}m left`;
    }
    return `${s}s left`;
  };

  // Determine center circle offset
  const strokeDashoffset = CIRCUMFERENCE * (1 - getBlockPct());

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
              <Path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke={COLORS.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M22 4L12 14.01l-3-3" stroke={COLORS.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <Text style={styles.trialDoneTitle}>Great job!</Text>
        </View>
        <View style={styles.trialDoneCta}>
          <TouchableOpacity style={styles.tryAgainBtn} onPress={restartTrial}>
            <Text style={styles.tryAgainBtnText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backToExerciseBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backToExerciseBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Watermark />
      {/* Top header - hidden in trial/tutorial mode */}
      {!isTrial && (
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setShowQuitModal(true)}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path d="M18 6L6 18M6 6l12 12" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
          <Text style={styles.timeText}>{getTimeLabel()}</Text>
          <View style={{ width: 36 }} />
        </View>
      )}

      {/* Main Circular Player View */}
      <View style={styles.playerContainer}>
        <View style={styles.circleContainer}>
          {/* Animated contract glow: a soft accent radial-gradient halo behind
              the circle (matches the web .contract-glow), scaling out and
              brightening with squeeze intensity. */}
          <Animated.View
            style={[
              styles.contractGlow,
              {
                opacity: glowOpacity,
                transform: [{ scale: glowScale }],
              },
            ]}
          >
            <Svg width={CIRCLE_SIZE * 1.7} height={CIRCLE_SIZE * 1.7}>
              <Defs>
                <RadialGradient id="contractGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="56%" stopColor={COLORS.accent} stopOpacity="0" />
                  <Stop offset="66%" stopColor={COLORS.accent} stopOpacity="0.08" />
                  <Stop offset="90%" stopColor={COLORS.accent} stopOpacity="0.42" />
                  <Stop offset="100%" stopColor={COLORS.accent} stopOpacity="0.24" />
                </RadialGradient>
              </Defs>
              <Circle
                cx={(CIRCLE_SIZE * 1.7) / 2}
                cy={(CIRCLE_SIZE * 1.7) / 2}
                r={(CIRCLE_SIZE * 1.7) / 2}
                fill="url(#contractGlow)"
              />
            </Svg>
          </Animated.View>

          {/* Central progress ring */}
          <View style={styles.progressRing}>
            <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} viewBox={`0 0 ${CIRCLE_SIZE} ${CIRCLE_SIZE}`}>
              <Circle
                cx={CIRCLE_SIZE / 2}
                cy={CIRCLE_SIZE / 2}
                r={R}
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={TRACK_WIDTH}
              />
              <Circle
                cx={CIRCLE_SIZE / 2}
                cy={CIRCLE_SIZE / 2}
                r={R}
                fill="none"
                stroke={COLORS.white}
                strokeWidth={TRACK_WIDTH}
                strokeLinecap="round"
                strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                strokeDashoffset={strokeDashoffset}
                // transform to start draw from top (12 o'clock)
                origin={`${CIRCLE_SIZE / 2}, ${CIRCLE_SIZE / 2}`}
                rotation={-90}
              />
            </Svg>
            <View style={styles.ringLabelContainer}>
              <Text style={styles.counterText}>{getBlockRemaining()}</Text>
              <Text style={styles.phaseLabel}>{currentStep.label}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Per-exercise help: pause and open the tutorial for the current move.
          Kept in the layout (placeholder when hidden) so the ring never shifts. */}
      <View style={styles.helpRow}>
        {!isTrial && currentStep.slug !== 'rest' ? (
          <TouchableOpacity
            style={styles.helpBtn}
            onPress={() => {
              pausedRef.current = true;
              setPaused(true);
              setShowHelp(true);
            }}
            accessibilityLabel="Exercise tutorial"
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
              {b.label}
            </Text>
          ))}
        </Animated.View>
      </View>

      {/* Footer controls */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.pauseBtn}
          onPress={() => {
            pausedRef.current = !paused;
            setPaused(!paused);
          }}
        >
          {paused ? (
            <View style={styles.playTextContainer}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill={COLORS.accent}>
                <Path d="M8 5v14l11-7z" />
              </Svg>
              <Text style={[styles.pauseBtnText, { color: COLORS.accent }]}>Resume</Text>
            </View>
          ) : (
            <View style={styles.playTextContainer}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill={COLORS.white}>
                <Path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </Svg>
              <Text style={styles.pauseBtnText}>Pause</Text>
            </View>
          )}
        </TouchableOpacity>
        {isTrial && (
          <TouchableOpacity style={styles.skipBtn} onPress={handleQuit}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Help / tutorial bottom sheet */}
      {showHelp && (
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowHelp(false);
          }}
        >
          <TouchableWithoutFeedback>
            <SafeAreaView style={styles.modalContent}>
              <View style={styles.handleBar} />
              <Text style={styles.modalTitle}>{currentStep.exerciseName}</Text>
              <Text style={styles.modalBody}>
                Watch the quick tutorial for this exercise, then come back to your session.
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.quitBtn]}
                  onPress={() => {
                    setShowHelp(false);
                    navigation.navigate('ExerciseDetail', {
                      slug: currentStep.slug,
                      unlocked: true,
                      daysLeft: 0,
                    });
                  }}
                >
                  <Text style={styles.quitBtnText}>Watch tutorial</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.backToTrainingBtn]}
                  onPress={() => {
                    setShowHelp(false);
                    pausedRef.current = false;
                    setPaused(false);
                  }}
                >
                  <Text style={styles.backToTrainingBtnText}>Resume</Text>
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
          onPress={() => setShowQuitModal(false)}
        >
          <TouchableWithoutFeedback>
            <SafeAreaView style={styles.modalContent}>
              <View style={styles.handleBar} />
              <Text style={styles.modalTitle}>Leave training?</Text>
              <Text style={styles.modalBody}>
                If you leave, this session will not be counted towards your daily progress.
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.quitBtn]}
                  onPress={handleQuit}
                >
                  <Text style={styles.quitBtnText}>Yes, quit training</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.backToTrainingBtn]}
                  onPress={() => setShowQuitModal(false)}
                >
                  <Text style={styles.backToTrainingBtnText}>No, go back</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  closeBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: 'medium',
  },
  playerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  circleContainer: {
    width: CIRCLE_SIZE * 1.7,
    height: CIRCLE_SIZE * 1.7,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  contractGlow: {
    position: 'absolute',
    width: CIRCLE_SIZE * 1.7,
    height: CIRCLE_SIZE * 1.7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRing: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: COLORS.surface,
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  ringLabelContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    left: 0,
    right: 0,
  },
  counterText: {
    fontSize: 54,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  phaseLabel: {
    fontSize: 15,
    fontWeight: 'semibold',
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
    left: 0,
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
    color: 'rgba(255,255,255,0.35)',
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBtnPlaceholder: {
    width: 40,
    height: 40,
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
    backgroundColor: 'rgba(193,255,114,0.10)',
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
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
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
  quitBtn: {
    backgroundColor: COLORS.accent,
  },
  quitBtnText: {
    color: COLORS.onAccent,
    fontWeight: 'bold',
    fontSize: 15,
  },
  backToTrainingBtn: {
    backgroundColor: COLORS.surface2,
  },
  backToTrainingBtnText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 15,
  },
});
