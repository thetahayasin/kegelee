import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Animated, Easing, BackHandler } from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, CommonActions, NavigationProp } from '@react-navigation/native';
import Svg, { Circle, Path } from 'react-native-svg';
import { COLORS, TYPE, SPACE, RADIUS } from '../../theme/colors';
import { Watermark } from '../../components/Watermark';
import { markFreeSessionUsed } from '../../services/freeSession';
import { useAuth } from '../../context/AuthContext';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SIZE = 208;
const R = 98;
const CIRC = 2 * Math.PI * R;

/**
 * End of the guest's one free session.
 *
 * Deliberately NOT WorkoutCompleteScreen. That screen reads a user's training
 * days, streak position, unlocks and level, and offers a feedback prompt that
 * adjusts the next session - every one of which needs an account. Branching it
 * for guests would have meant guarding a dozen paths on a screen that already
 * carries the paid flow. This shows the one thing that matters here - you
 * finished a real session - in the same visual language, and then asks.
 *
 * The ask sits AFTER the ring and tick have landed rather than replacing them.
 * The accomplishment is the argument for subscribing; stepping on it with a
 * price would waste the moment the whole flow was built to reach.
 */
export const FreeSessionCompleteScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<any>>();
  const { isAuthenticated, user } = useAuth();

  const ringAnim = useRef(new Animated.Value(0)).current;
  const tickAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Reaching this screen is what spends the free session. Quitting partway
    // through does not, so a misfire early on does not cost someone the only
    // look at the product they were ever going to get.
    markFreeSessionUsed(user?.id).catch(() => {});

    // One driver for the whole screen. strokeDashoffset cannot run natively,
    // and this app has crashed once before by mixing drivers on one visual.
    Animated.sequence([
      Animated.timing(ringAnim, {
        toValue: 1,
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
  }, [ringAnim, tickAnim, user?.id]);

  // Back to the basics list with the plans sheet open - the same funnel end the
  // third lesson used to jump to directly, now reached having actually trained.
  // Where the ask lives depends on who finished. A guest goes back to the
  // basics list and the plans sheet opens over it; a signed-in account goes to
  // the paywall itself, which is the screen it dismissed to get here - now
  // reached having actually trained rather than before seeing anything.
  //
  // The mark is awaited here as well as fired on mount, because the guest
  // branch races it: the basics list decides whether to open the plans sheet
  // by READING that flag, and if the tap beats the write the funnel arrives at
  // the ask and silently declines to make it. Marking twice writes the same
  // value to the same key, so the only thing this costs is the race.
  const toPlans = async () => {
    await markFreeSessionUsed(user?.id).catch(() => {});
    navigation.dispatch(
      isAuthenticated
        ? CommonActions.reset({ index: 0, routes: [{ name: 'Paywall' }] })
        : CommonActions.reset({
            index: 0,
            routes: [{ name: 'Knowledge', params: { subscribe: true } }],
          }),
    );
  };

  // This screen REPLACED the workout, which was itself the root of a reset
  // stack, so there is nothing beneath it: Android back would close the app on
  // the exact screen the whole flow exists to reach. Send it where the button
  // goes instead.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        toPlans();
        return true;
      });
      return () => sub.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <SafeAreaView style={styles.container}>
      <Watermark />
      <View style={styles.body}>
        <View style={styles.ringWrap}>
          <Svg width={SIZE} height={SIZE}>
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={12}
            />
            <AnimatedCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={COLORS.accent}
              strokeWidth={12}
              strokeLinecap="round"
              strokeDasharray={`${CIRC} ${CIRC}`}
              strokeDashoffset={ringAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [CIRC, 0],
              })}
              origin={`${SIZE / 2}, ${SIZE / 2}`}
              rotation={-90}
            />
          </Svg>
          <Animated.View
            style={[
              styles.tick,
              {
                opacity: tickAnim,
                transform: [
                  { scale: tickAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                ],
              },
            ]}
          >
            <Svg width={72} height={72} viewBox="0 0 24 24" fill="none">
              <Path
                d="M5 13l4 4L19 7"
                stroke={COLORS.accent}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Animated.View>
        </View>

        <Text
          style={styles.title}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          maxFontSizeMultiplier={1.3}
        >
          {t('workoutComplete.sessionComplete')}
        </Text>
        <Text
          style={styles.sub}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.3}
        >
          {t('workoutComplete.keepGoing')}
        </Text>
      </View>

      {/* One button, not two. A "Not now" alongside it would be a fake choice:
          Knowledge opens the plans sheet by itself for any guest who has
          finished the basics, so both buttons led to exactly the same place.
          Offering a decline that does not decline is worse than not offering
          one. */}
      <View style={styles.cta}>
        <TouchableOpacity style={styles.primary} onPress={toPlans}>
          <Text style={styles.primaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.2}>{t('subscribeSheet.subscribe')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  ringWrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  tick: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  title: { ...TYPE.title, color: COLORS.white, textAlign: 'center', marginTop: SPACE.xl },
  sub: { ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACE.sm },
  cta: { paddingHorizontal: 24, paddingBottom: 24, gap: SPACE.sm },
  primary: {
    height: 56,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...TYPE.section, color: COLORS.onAccent },
});
