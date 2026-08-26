import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LessonCards } from '../../../components/LessonCards';
import { COLORS, GLASS } from '../../../theme/colors';

interface Props {
  step: number;
  onFinished: () => void;
}

// Icons here, words in the locale files.
const BENEFITS = [
  { icon: 'M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z', key: 'bladder' },
  { icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z', key: 'performance' },
  { icon: 'M12 2l8 3v6c0 5.25-3.4 9.74-8 11-4.6-1.26-8-5.75-8-11V5l8-3z', key: 'core' },
  { icon: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z', key: 'confidence' },
];

export const WhyLesson: React.FC<Props> = ({ step, onFinished }) => {
  const { t } = useTranslation();

  // Step 1: which benefits the reader has opened.
  const [revealed, setRevealed] = useState<string[]>([]);
  const toggle = (key: string) =>
    setRevealed(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));

  useEffect(() => {
    if (step === 2) {
      onFinished();
    }
  }, [step, onFinished]);

  if (step === 0) {
    // Opens on the claim itself rather than on a toy.
    //
    // This step used to be a tap-to-squeeze circle: a glass ring with a sling
    // drawn across it that straightened over three taps while a tinted panel
    // rose behind it. It asked for taps on a shape that represents nothing the
    // reader recognises, and paid each one off with a movement too small to
    // read as a response - so it landed as a control that does not work rather
    // than as an idea, and it held the copy hostage behind three taps besides.
    // The sentences were always carrying this step. They now carry it outright,
    // and LessonCards' staggered rise is motion that means something: one idea
    // arriving after another, in the order the argument needs them.
    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>{t('why.aMuscleYouCanTrain')}</Text>
        <LessonCards lines={[t('why.cardRealMuscle'), t('why.cardAnywhere')]} />
      </ScrollView>
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
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 12 },
  h1: {
    marginBottom: 20,
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    lineHeight: 34,
  },
  lead: {
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  // Sits directly under h1, which carries the gap in its own marginBottom.
  tapHint: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
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
  benefitCardOpen: { borderColor: 'rgba(193, 255, 114, 0.35)' },
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
});
