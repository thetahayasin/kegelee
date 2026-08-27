import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Animated, Easing, BackHandler } from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, CommonActions, NavigationProp } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, TYPE, SPACE, RADIUS } from '../../theme/colors';
import { LESSON_TEXT } from '../../components/LessonLine';
import { Watermark } from '../../components/Watermark';
import { useAuth } from '../../context/AuthContext';
import { freeSessionExitReset } from '../../services/freeSession';

/**
 * Offers the free session rather than starting it.
 *
 * The lessons used to hand straight off into a running workout. Landing in a
 * live timer you did not ask for is disorienting - there was no moment where
 * the reader could see what was about to happen, decide to do it, or know it
 * was a one-off. An offer costs one tap and buys all three.
 *
 * Nothing here spends the session. Declining an offer is not the same as
 * having seen the product, and neither is being interrupted halfway - only
 * FINISHING one is. A guest who says "not now" can still start it from the
 * basics list, which keeps offering it until it has actually been completed
 * once. Spending it on a decline would burn the whole point of the feature on
 * a tap someone made before they knew what it was.
 */
export const FreeSessionOfferScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<any>>();
  const { isAuthenticated } = useAuth();

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [fade]);

  const start = () =>
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'Workout', params: { freeSession: true } }] }),
    );

  // Both identities land on the basics list. The difference is what is left
  // underneath: an account keeps its paywall in the stack, so Back, the
  // Subscribe button and the Log out escape hatch all still lead somewhere.
  // See freeSessionExitReset - resetting to a bare [Knowledge] here was what
  // stranded signed-in accounts with no way to pay and no way out.
  const decline = useCallback(() => {
    navigation.dispatch(CommonActions.reset(freeSessionExitReset(isAuthenticated)));
  }, [navigation, isAuthenticated]);

  // Android back is a decline, not an escape hatch: this screen is the root of
  // a reset stack, so without this it would close the app.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        decline();
        return true;
      });
      return () => sub.remove();
    }, [decline]),
  );

  const translateY = fade.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <SafeAreaView style={styles.container}>
      <Watermark />
      <Animated.View style={[styles.body, { opacity: fade, transform: [{ translateY }] }]}>
        {/* The circle they are about to follow, drawn once and still. It is the
            one thing that makes the offer concrete rather than a claim. */}
        <View style={styles.mark}>
          <Svg width={96} height={96} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 3a9 9 0 1 1-9 9"
              stroke={COLORS.accent}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <Path
              d="M12 8v4l3 2"
              stroke={COLORS.accent}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
        {/* Up to 25% longer than English (Polish), and it sits above a fixed
            button row. Shrink rather than push the buttons off screen. */}
        <Text
          style={styles.line}
          numberOfLines={4}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          maxFontSizeMultiplier={1.3}
        >
          {t('why.thenYouDoYourFirst')}
        </Text>
      </Animated.View>

      <View style={styles.cta}>
        <TouchableOpacity style={styles.primary} onPress={start}>
          <Text style={styles.primaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.2}>{t('workoutComplete.tryItNow')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={decline}>
          <Text style={styles.secondaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.2}>{t('workoutComplete.notNow')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  mark: { marginBottom: SPACE.xl, opacity: 0.9 },
  line: { ...LESSON_TEXT, color: COLORS.white, textAlign: 'center' },
  cta: { paddingHorizontal: 24, paddingBottom: 24, gap: SPACE.xs },
  primary: {
    height: 56,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...TYPE.section, color: COLORS.onAccent },
  secondary: { height: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...TYPE.body, color: COLORS.textMuted },
});
