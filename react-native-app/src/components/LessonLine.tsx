import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { COLORS } from '../theme/colors';

/**
 * One line, one slide.
 *
 * The basics lessons used to be headings over body copy over cards over an
 * interaction, three deep on every step. Read on a phone by someone who wanted
 * to know one thing, that is a wall to skim past, and the one thing gets lost
 * in it. A lesson step is now a single sentence, centred in the space, and the
 * step changes by fading the old line out from under the new one - so the
 * lesson reads the way it is actually consumed: line, then the next line.
 *
 * Opacity and translateY only, both on the native driver. An onboarding visual
 * once crashed this app by mixing a JS-driven SVG value with a native-driven
 * opacity on one node; nothing here can repeat that.
 */

interface Props {
  /** Already-resolved string - the caller owns t(). */
  text: string;
  /** Re-runs the fade whenever this changes. The step index. */
  step: number;
}

export const LessonLine: React.FC<Props> = ({ text, step }) => {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 340,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [step, fade]);

  const translateY = fade.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  return (
    <View style={styles.wrap}>
      <Animated.View style={{ opacity: fade, transform: [{ translateY }] }}>
        <Text style={styles.line}>{text}</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Centred in whatever height the step is given, so a short line and a longer
  // one sit in the same place instead of the text jumping between steps.
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  // Big on purpose. This is the entire step - there is no heading above it and
  // no cards below - so it carries the weight a heading would elsewhere. The
  // first pass set it at 22, which read as body copy floating in an empty
  // screen rather than as the thing you are here to read.
  line: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 38,
    letterSpacing: -0.5,
    color: COLORS.white,
    textAlign: 'center',
  },
});
