import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, GLASS } from '../../../theme/colors';

interface Props {
  step: number;
  onFinished: () => void;
}

const HEART =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

const BENEFITS = [
  { icon: 'M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z', title: 'Better bladder control', desc: 'Fewer leaks and urgent moments.' },
  { icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z', title: 'Stronger performance', desc: 'More control and stamina in intimacy.' },
  { icon: 'M12 2l8 3v6c0 5.25-3.4 9.74-8 11-4.6-1.26-8-5.75-8-11V5l8-3z', title: 'A supported core', desc: 'Helps posture and lower back.' },
  { icon: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z', title: 'Lasting confidence', desc: 'Gains that build week after week.' },
];

export const WhyLesson: React.FC<Props> = ({ step, onFinished }) => {
  const { t } = useTranslation();
  const breathe = useRef(new Animated.Value(1)).current;

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
    return (
      <View style={styles.center}>
        <Animated.View style={[styles.heartCircle, { transform: [{ scale: breathe }] }]}>
          <Svg width={64} height={64} viewBox="0 0 24 24" fill={COLORS.accent}>
            <Path d={HEART} />
          </Svg>
        </Animated.View>
        <Text style={styles.h1}>{t('why.aMuscleYouCanTrain')}</Text>
        <Text style={styles.p}>
          Your pelvic floor is a real muscle. Train it a few minutes a day and it gets stronger, just
          like any workout. No pills, no side effects, and the results last.
        </Text>
        <Text style={styles.p}>
          {t('why.andYouCanDoIt')}
        </Text>
      </View>
    );
  }

  if (step === 1) {
    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>{t('why.whatYouGain')}</Text>
        <View style={{ gap: 12, marginTop: 22 }}>
          {BENEFITS.map(b => (
            <View key={b.title} style={styles.benefitCard}>
              <View style={styles.benefitIcon}>
                <Svg width={24} height={24} viewBox="0 0 24 24" fill={COLORS.accent}>
                  <Path d={b.icon} />
                </Svg>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitDesc}>{b.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.h1}>{t('why.doingItRightIsEverything')}</Text>
      <Text style={[styles.p, { textAlign: 'center' }]}>
        {t('why.squeezeTheWrongMusclesAnd')}
      </Text>
      <View style={styles.finalCard}>
        <View style={styles.finalCardHead}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill={COLORS.accent}>
            <Path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </Svg>
          <Text style={styles.finalCardHeadText}>{t('why.worthTwoMinutesOfYour')}</Text>
        </View>
        <View style={styles.finalCardBody}>
          <View style={styles.finalRow}>
            <View style={styles.numBadge}>
              <Text style={styles.numBadgeText}>2</Text>
            </View>
            <Text style={styles.finalRowText}>{t('why.theNextLessonShowsYou')}</Text>
          </View>
          <View style={styles.finalRow}>
            <View style={styles.numBadge}>
              <Text style={styles.numBadgeText}>3</Text>
            </View>
            <Text style={styles.finalRowText}>{t('why.thenYouDoYourFirst')}</Text>
          </View>
          <Text style={styles.finalEmphasis}>
            {t('why.learnItOnceAndEvery')}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
