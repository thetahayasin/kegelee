import React, { useMemo, useRef } from 'react';
import { View, PanResponder, StyleSheet, Animated } from 'react-native';

/**
 * Horizontal swipe between lesson steps.
 *
 * The lessons only moved on a Next button, which meant the one gesture every
 * phone user already has for "show me the next thing" did nothing here.
 *
 * Deliberately a PanResponder rather than a paging ScrollView. Paging would
 * require all three steps to be mounted side by side, and the steps are not
 * inert: they run timers, count taps and drive a hold measurement. Mounting
 * them all would leave two lessons ticking off-screen. This keeps exactly one
 * step alive and just adds the gesture.
 *
 * The responder claims a touch only once horizontal movement clearly dominates,
 * so the vertical ScrollView inside each step keeps working normally and a
 * press-and-hold on the circle is never stolen mid-gesture.
 */

interface Props {
  step: number;
  count: number;
  onChange: (next: number) => void;
  children: React.ReactNode;
}

const H_THRESHOLD = 52;   // px of travel before it counts as a swipe
const H_DOMINANCE = 1.7;  // how much more horizontal than vertical it must be

export const SwipeSteps: React.FC<Props> = ({ step, count, onChange, children }) => {
  const nudge = useRef(new Animated.Value(0)).current;

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Never claim the touch down: a tap on the circle has to reach it.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * H_DOMINANCE,

        onPanResponderMove: (_e, g) => {
          // A little give, so the swipe is felt before it commits.
          nudge.setValue(Math.max(-28, Math.min(28, g.dx * 0.22)));
        },

        onPanResponderRelease: (_e, g) => {
          const far = Math.abs(g.dx) > H_THRESHOLD;
          const fast = Math.abs(g.vx) > 0.35;
          if (far || fast) {
            const dir = g.dx < 0 ? 1 : -1;
            const next = step + dir;
            if (next >= 0 && next < count) onChange(next);
          }
          Animated.spring(nudge, {
            toValue: 0,
            useNativeDriver: true,
            speed: 20,
            bounciness: 6,
          }).start();
        },

        onPanResponderTerminate: () => {
          Animated.spring(nudge, {
            toValue: 0,
            useNativeDriver: true,
            speed: 20,
            bounciness: 6,
          }).start();
        },
      }),
    [step, count, onChange, nudge],
  );

  return (
    <Animated.View
      style={[styles.fill, { transform: [{ translateX: nudge }] }]}
      {...responder.panHandlers}
    >
      <View style={styles.fill}>{children}</View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
});
