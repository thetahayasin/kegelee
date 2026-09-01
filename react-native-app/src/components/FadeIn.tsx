import React, { useEffect, useRef } from 'react';
import { Animated, Easing, AccessibilityInfo, ViewStyle, StyleProp } from 'react-native';

/**
 * Arrive, rather than appear.
 *
 * The teaching screens - the basics list, the onboarding copy - were built as
 * plain views that were simply there on the frame the screen mounted. Nothing
 * about that is broken, and that is exactly why it reads as stiff: every other
 * moving part of the app eases, so the screens that are meant to be the gentle
 * ones were the only ones that snapped into place.
 *
 * A short rise and fade, staggered when there is a list of them, is enough.
 * Deliberately small numbers: this is the difference between a screen that
 * settles and a screen that performs, and the second is worse than nothing.
 *
 * Opacity and transform only, both on the native driver, so it costs nothing
 * on the JS thread - which matters on the basics list, where three of these
 * run while a screen is still doing its first data read.
 */
interface Props {
  children: React.ReactNode;
  /** Milliseconds to wait before starting. Use i * 70 for a list. */
  delay?: number;
  /** How far below its resting place it starts. */
  offset?: number;
  /** Re-runs the animation whenever this changes. */
  resetKey?: string | number;
  style?: StyleProp<ViewStyle>;
}

const DURATION = 320;

export const FadeIn: React.FC<Props> = ({
  children,
  delay = 0,
  offset = 10,
  resetKey,
  style,
}) => {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    t.setValue(0);

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (cancelled) return;
        // Reduce motion means no movement, not no content. Snap it on.
        if (reduced) {
          t.setValue(1);
          return;
        }
        Animated.timing(t, {
          toValue: 1,
          duration: DURATION,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });

    return () => {
      cancelled = true;
    };
  }, [t, delay, resetKey]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t,
          transform: [
            {
              translateY: t.interpolate({
                inputRange: [0, 1],
                outputRange: [offset, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};
