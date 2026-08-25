import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, AccessibilityInfo } from 'react-native';
import { COLORS, RADIUS, SPACE } from '../theme/colors';

/**
 * The card stack used on the first onboarding screen.
 *
 * Replaces an animated SVG ring that crashed the app on launch. That ring drove
 * `strokeDashoffset`, which the native driver cannot carry, so it had to be
 * JS-driven - while the bar inside it animated opacity on the NATIVE driver.
 * Two drivers on one node is an invariant violation in React Native, and it
 * threw on the very first frame of the very first screen.
 *
 * So this deliberately animates NOTHING but `opacity` and `transform`, entirely
 * on the native driver. There is no interpolation shared between drivers here
 * and no SVG attribute in the animation path, which means the class of bug that
 * took the app down cannot reoccur. It also runs off the UI thread, so it stays
 * smooth while the rest of the screen mounts.
 *
 * Visually it is the same language as the lessons: a short stack of cards, one
 * idea to a card, settling into place.
 */

const CARD_W = 240;
const CARD_H = 76;

interface Props {
  /** Cards settle in when this turns true. */
  active?: boolean;
}

const Line: React.FC<{ width: number; accent?: boolean }> = ({ width, accent }) => (
  <View
    style={[
      styles.line,
      { width },
      accent ? styles.lineAccent : null,
    ]}
  />
);

export const OnboardingArt: React.FC<Props> = ({ active = true }) => {
  // One value per card so they can stagger. Each drives translateY, scale and
  // opacity together - all native-driver-safe.
  const cards = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let loop: Animated.CompositeAnimation | null = null;

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (cancelled) return;

        if (reduced) {
          // Show the finished state rather than nothing: the art still reads,
          // it just does not move.
          cards.forEach((c) => c.setValue(1));
          return;
        }

        Animated.stagger(
          110,
          cards.map((c) =>
            Animated.timing(c, {
              toValue: 1,
              duration: 460,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ),
        ).start(() => {
          if (cancelled) return;
          // A slow breath so the screen is not dead once the cards land.
          loop = Animated.loop(
            Animated.sequence([
              Animated.timing(float, {
                toValue: 1,
                duration: 2200,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
              Animated.timing(float, {
                toValue: 0,
                duration: 2200,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
            ]),
          );
          loop.start();
        });
      });

    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [active, cards, float]);

  const drift = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

  return (
    <View style={styles.wrap} pointerEvents="none" accessibilityElementsHidden>
      <Animated.View style={{ transform: [{ translateY: drift }] }}>
        {cards.map((c, i) => {
          // Back cards sit lower, smaller and dimmer, so the stack reads as
          // depth without a shadow (which would cost a real render pass).
          const depth = cards.length - 1 - i;
          return (
            <Animated.View
              key={i}
              style={[
                styles.card,
                {
                  marginTop: i === 0 ? 0 : -CARD_H + 26,
                  zIndex: i,
                  opacity: c.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1 - depth * 0.22],
                  }),
                  transform: [
                    {
                      translateY: c.interpolate({
                        inputRange: [0, 1],
                        outputRange: [22, 0],
                      }),
                    },
                    {
                      scale: c.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.94, 1 - depth * 0.05],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Line width={i === 0 ? 26 : 20} accent={i === 0} />
              <View style={styles.lineGroup}>
                <Line width={i === 0 ? 132 : 108} />
                <Line width={i === 0 ? 86 : 64} />
              </View>
            </Animated.View>
          );
        })}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    height: CARD_H * 2.1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  lineGroup: { gap: 8, flex: 1 },
  line: {
    height: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(242, 245, 238, 0.13)',
  },
  lineAccent: {
    height: 26,
    width: 26,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
  },
});
