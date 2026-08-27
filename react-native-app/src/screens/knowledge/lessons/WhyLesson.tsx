import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LessonCards } from '../../../components/LessonCards';
import { COLORS, GLASS, TYPE } from '../../../theme/colors';

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
        {/* Smaller than the other steps' h1. Those carry a list or a stack of
            cards underneath, so a display-sized line reads as a heading over
            content; here it IS most of the step, and at 28px it stopped
            looking like a title and started looking like a slogan. One card,
            not two: the second sold training in public - "on the bus, nobody
            can tell" - which is a pitch, not something to learn, and
            onboarding already makes that point once. */}
        <Text style={styles.h1}>{t('why.aMuscleYouCanTrain')}</Text>
        <LessonCards lines={[t('why.cardRealMuscle')]} />
      </ScrollView>
    );
  }

  if (step === 1) {
    // Titles only, and nothing to tap.
    //
    // Each card used to hide a one-line description behind a press, with a
    // "tap any one to see what changes" hint above telling you to go looking.
    // That is four taps of work to reveal four short sentences, on a step
    // whose whole job is to list what improves - and the titles already say
    // it. The descriptions and the hint are gone; the list reads at a glance.
    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>{t('why.whatYouGain')}</Text>
        <View style={styles.benefitList}>
          {BENEFITS.map(b => (
            <View key={b.key} style={styles.benefitCard}>
              <View style={styles.benefitIcon}>
                <Svg width={24} height={24} viewBox="0 0 24 24" fill={COLORS.accent}>
                  <Path d={b.icon} />
                </Svg>
              </View>
              <Text style={styles.benefitTitle}>{t(`why.benefit_${b.key}_title`)}</Text>
            </View>
          ))}
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
        ]}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 12 },
  h1: {
    ...TYPE.heading,
    marginBottom: 16,
    color: COLORS.white,
    textAlign: 'center',
    lineHeight: 26,
  },
  lead: {
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  benefitList: { gap: 12, marginTop: 22 },
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
  benefitTitle: { flex: 1, fontSize: 17, fontWeight: 'bold', color: COLORS.white },
});
