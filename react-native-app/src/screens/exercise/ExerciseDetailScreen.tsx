import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useRoute,
  useNavigation,
  RouteProp,
  NavigationProp,
} from '@react-navigation/native';
import Svg, { Path, Rect } from 'react-native-svg';
import { COLORS, GLASS } from '../../theme/colors';
import { EXERCISES } from '../../constants/catalogues';
import { EquipmentIcon } from '../../components/EquipmentIcon';
import { Watermark } from '../../components/Watermark';
import { RootStackParamList } from '../../navigation/AppNavigator';

const LockIcon = ({ color, size = 20 }: { color: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={5} y={11} width={14} height={9} rx={2} stroke={color} strokeWidth={1.8} />
    <Path d="M8 11V8a4 4 0 018 0v3" stroke={color} strokeWidth={1.8} />
  </Svg>
);

export const ExerciseDetailScreen = () => {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RootStackParamList, 'ExerciseDetail'>>();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { slug, unlocked, daysLeft } = route.params;
  const ex = EXERCISES[slug];

  if (!ex) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.description}>{t('exerciseDetail.exerciseNotFound')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Watermark />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M15 6l-6 6 6 6" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {ex.name}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <EquipmentIcon slug={slug} size={128} bare />
        </View>

        <View style={styles.body}>
          {!unlocked && (
            <View style={styles.lockBanner}>
              <LockIcon color={COLORS.accentSoft} />
              <Text style={styles.lockBannerText}>
                Complete {daysLeft} more training days to unlock.
              </Text>
            </View>
          )}

          <Text style={styles.description}>{ex.description}</Text>
          {ex.how_to ? <Text style={styles.howTo}>{ex.how_to}</Text> : null}
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={styles.cta}>
        {unlocked ? (
          <TouchableOpacity
            style={styles.tryBtn}
            onPress={() => navigation.navigate('Workout', { trialSlug: slug })}
          >
            <Text style={styles.tryBtnText}>{t('exerciseDetail.tryItNow')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.lockedBtn}>
            <LockIcon color={COLORS.textMuted} />
            <Text style={styles.lockedBtnText}>Locked - {daysLeft} days left</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  scroll: {
    paddingBottom: 120,
  },
  hero: {
    marginHorizontal: 16,
    aspectRatio: 16 / 9,
    borderRadius: 24,
    ...GLASS,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroGlow: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(193,255,114,0.10)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  lockBannerText: {
    flex: 1,
    color: COLORS.accentSoft,
    fontSize: 14,
  },
  description: {
    color: COLORS.textMuted,
    fontSize: 15,
    lineHeight: 23,
  },
  howTo: {
    marginTop: 16,
    color: COLORS.textMuted,
    fontSize: 15,
    lineHeight: 23,
  },
  cta: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.navBar,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
  },
  tryBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tryBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  lockedBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  lockedBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
});
