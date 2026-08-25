import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, StyleSheet, Animated, Easing, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LessonCards } from '../../../components/LessonCards';
import { COLORS, GLASS } from '../../../theme/colors';

interface Props {
  step: number;
  onFinished: () => void;
}

const TAPS_NEEDED = 3;

const HEART =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

// Icons here, words in the locale files.
const BENEFITS = [
  { icon: 'M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z', key: 'bladder' },
  { icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z', key: 'performance' },
  { icon: 'M12 2l8 3v6c0 5.25-3.4 9.74-8 11-4.6-1.26-8-5.75-8-11V5l8-3z', key: 'core' },
  { icon: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z', key: 'confidence' },
];

export const WhyLesson: React.FC<Props> = ({ step, onFinished }) => {
  const { t } = useTranslation();
  const breathe = useRef(new Animated.Value(1)).current;

  // Step 0: how full the muscle reads, and the press feedback on the circle.
  const [taps, setTaps] = useState(0);
  const level = useRef(new Animated.Value(0.12)).current;
  const squeezeScale = useRef(new Animated.Value(1)).current;

  // Step 1: which benefits the reader has opened.
  const [revealed, setRevealed] = useState<string[]>([]);
  const toggle = (key: string) =>
    setRevealed(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));

  const squeeze = () => {
    const next = Math.min(TAPS_NEEDED, taps + 1);
    setTaps(next);
    // Overshoot, then settle a notch above where it started - the baseline
    // creeping up is the whole argument of the step.
    Animated.sequence([
      Animated.parallel([
        Animated.timing(level, {
          toValue: 0.35 + next * 0.2,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(squeezeScale, { toValue: 0.94, duration: 120, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(level, {
          toValue: 0.12 + next * 0.2,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(squeezeScale, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]),
    ]).start();
  };

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.05, duration: 1750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 1750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [breathe]);

  useEffect(() => {
    if (step === 2) {
      onFinished();
    }
  }, [step, onFinished]);

  if (step === 0) {
    // Three squeezes, each settling a little higher than the last. Reading
    // "it responds like any other muscle" lands differently once you have
    // just made it happen with your thumb.
    const done = taps >= TAPS_NEEDED;
    return (
      <View style={styles.center}>
        <Pressable
          onPress={squeeze}
          disabled={done}
          accessibilityRole="button"
          accessibilityLabel={t('why.tapToSqueeze')}
          style={styles.squeezeTarget}
        >
          <Animated.View
            style={[
              styles.heartCircle,
              { transform: [{ scale: done ? breathe : squeezeScale }] },
            ]}
          >
            <Animated.View
              style={[styles.squeezeFill, { transform: [{ scaleY: level }] }]}
            />
            <Svg width={64} height={64} viewBox="0 0 24 24" fill={COLORS.accent}>
              <Path d={HEART} />
            </Svg>
          </Animated.View>
        </Pressable>

        <View style={styles.tapPips}>
          {Array.from({ length: TAPS_NEEDED }).map((_, i) => (
            <View key={i} style={[styles.tapPip, i < taps && styles.tapPipOn]} />
          ))}
        </View>

        <Text style={styles.h1}>{t('why.aMuscleYouCanTrain')}</Text>
        {done ? (
          <LessonCards
            lines={[t('why.cardRealMuscle'), t('why.cardAnywhere')]}
          />
        ) : (
          <Text style={styles.tapHint}>{t('why.tapToSqueeze')}</Text>
        )}
      </View>
    );
  }

  if (step === 1) {
    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>{t('why.whatYouGain')}</Text>
        <Text style={styles.tapHint}>{t('why.tapToSeeWhatChanges')}</Text>
        <View style={{ gap: 12, marginTop: 22 }}>
          {BENEFITS.map(b => {
            const open = revealed.includes(b.key);
            return (
              <Pressable
                key={b.key}
                onPress={() => toggle(b.key)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                style={[styles.benefitCard, open && styles.benefitCardOpen]}
              >
                <View style={styles.benefitIcon}>
                  <Svg width={24} height={24} viewBox="0 0 24 24" fill={COLORS.accent}>
                    <Path d={b.icon} />
                  </Svg>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.benefitTitle}>{t(`why.benefit_${b.key}_title`)}</Text>
                  {open ? (
                    <Text style={styles.benefitDesc}>{t(`why.benefit_${b.key}_desc`)}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.h1}>{t('why.doingItRightIsEverything')}</Text>
      <Text style={styles.lead}>{t('why.squeezeTheWrongMusclesAnd')}</Text>
      {/* Existing keys, already one line each in all 29 locales - no reason to
          mint new ones and re-translate what already says exactly this. */}
      <LessonCards
        numbered
        lines={[
          t('why.theNextLessonShowsYou'),
          t('why.thenYouDoYourFirst'),
          t('why.learnItOnceAndEvery'),
        ]}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  lead: {
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  squeezeTarget: { alignItems: 'center', justifyContent: 'center' },
  // Rises from the bottom of the circle as the muscle is trained.
  squeezeFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '100%',
    backgroundColor: 'rgba(193, 255, 114, 0.16)',
    transform: [{ scaleY: 0.12 }],
  },
  tapPips: { flexDirection: 'row', gap: 8, marginTop: 18 },
  tapPip: {
    width: 26,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  tapPipOn: { backgroundColor: COLORS.accent },
  tapHint: {
    marginTop: 12,
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  benefitCardOpen: { borderColor: 'rgba(193, 255, 114, 0.35)' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 12 },
  heartCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    ...GLASS,
    borderWidth: 4,
    borderColor: 'rgba(193,255,114,0.5)',
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  h1: {
    marginTop: 28,
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    lineHeight: 34,
  },
  p: {
    marginTop: 14,
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 16,
    ...GLASS,
    backgroundColor: COLORS.surface,
    padding: 16,
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(193,255,114,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.white },
  benefitDesc: { marginTop: 2, fontSize: 14, color: COLORS.textMuted },
  finalCard: {
    marginTop: 22,
    borderRadius: 24,
    ...GLASS,
    borderWidth: 1,
    borderColor: 'rgba(193,255,114,0.30)',
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  finalCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(193,255,114,0.10)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  finalCardHeadText: { fontSize: 15, fontWeight: 'bold', color: COLORS.accentSoft },
  finalCardBody: { padding: 20, gap: 12 },
  finalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  numBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(193,255,114,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numBadgeText: { fontSize: 14, fontWeight: 'bold', color: COLORS.accent },
  finalRowText: { flex: 1, fontSize: 15, lineHeight: 22, color: COLORS.textMuted },
  finalEmphasis: { fontSize: 15, fontWeight: '600', color: COLORS.white, lineHeight: 22, paddingTop: 4 },
});
