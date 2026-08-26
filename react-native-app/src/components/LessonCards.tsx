import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, AccessibilityInfo } from 'react-native';
import { COLORS, TYPE, RADIUS, SPACE } from '../theme/colors';

/**
 * One line, one card.
 *
 * The lessons used to carry their argument in paragraphs, which is the wrong
 * shape for a screen someone opened on a phone to learn something in twenty
 * seconds: a block of prose gets skimmed to nothing, and the interaction
 * underneath it gets skipped along with it. Splitting the same argument into
 * single-line cards means each idea gets its own surface, the reader's eye has
 * a place to stop, and the whole step can be taken in at a glance.
 *
 * Cards rise in staggered rather than all at once, so the order reads as
 * sequence rather than as a list that was always there.
 *
 * Animates ONLY opacity and transform on the native driver. An earlier
 * onboarding visual mixed a JS-driven SVG value with a native-driven opacity on
 * one node and crashed the app on launch; nothing here can repeat that.
 */

export interface LessonCardsProps {
  /** Already-resolved strings - the caller owns t(). */
  lines: string[];
  /** Numbered when the order is the point, dotted when it is not. */
  numbered?: boolean;
  /** Hold the cards hidden until the step is actually on screen. */
  active?: boolean;
}

export const LessonCards: React.FC<LessonCardsProps> = ({
  lines,
  numbered = false,
  active = true,
}) => {
  // One value per card. Recreated when the number of lines changes so a step
  // with a different count never reuses the previous step's animations.
  const values = useRef<Animated.Value[]>([]);
  if (values.current.length !== lines.length) {
    values.current = lines.map(() => new Animated.Value(0));
  }

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const anims = values.current;

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (cancelled) return;
        if (reduced) {
          anims.forEach((v) => v.setValue(1));
          return;
        }
        Animated.stagger(
          90,
          anims.map((v) =>
            Animated.timing(v, {
              toValue: 1,
              duration: 380,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ),
        ).start();
      });

    return () => {
      cancelled = true;
    };
  }, [active, lines.length]);

  return (
    <View style={styles.stack}>
      {lines.map((line, i) => (
        <Animated.View
          key={i}
          style={[
            styles.card,
            {
              opacity: values.current[i],
              transform: [
                {
                  translateY: values.current[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [14, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {numbered ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{i + 1}</Text>
            </View>
          ) : (
            <View style={styles.dot} />
          )}
          <Text style={styles.line}>{line}</Text>
        </Animated.View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  stack: { gap: SPACE.md, width: '100%' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    minHeight: 56,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 13, fontWeight: '800', color: COLORS.onAccent },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    marginHorizontal: 9,
  },
  // Body weight, not muted: these lines ARE the lesson, so they must clear the
  // 4.5:1 text threshold on this surface rather than sit at decorative grey.
  line: { ...TYPE.body, color: COLORS.white, flex: 1, lineHeight: 21 },
});
