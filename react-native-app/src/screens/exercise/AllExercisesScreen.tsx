import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused, NavigationProp } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { COLORS, GLASS, DISABLED_OPACITY } from '../../theme/colors';
import { getDBConnection } from '../../db/sqlite';
import { getPosition } from '../../services/progression';
import { EXERCISES } from '../../constants/catalogues';
import { EquipmentIcon } from '../../components/EquipmentIcon';
import { Watermark } from '../../components/Watermark';
import { RootStackParamList } from '../../navigation/AppNavigator';

type Row = {
  slug: string;
  name: string;
  unlocked: boolean;
  daysLeft: number;
  completed: number;
  threshold: number;
  pct: number;
};

// Full catalogue with per-exercise unlock progress bars, mirroring the web
// exercises/index page reached from the Training rail's "See All".
export const AllExercisesScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;

    const load = async () => {
      if (!user) return;
      try {
        const db = await getDBConnection();
        const daysRes = await db.executeSql(
          'SELECT * FROM training_days WHERE user_id = ? ORDER BY date DESC',
          [user.id],
        );
        const trainingDays = [];
        for (let i = 0; i < daysRes[0].rows.length; i++) {
          trainingDays.push(daysRes[0].rows.item(i));
        }

        const pos = getPosition(user, trainingDays);
        const completedDays = pos.completed;

        const list: Row[] = Object.values(EXERCISES)
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((ex) => {
            const threshold = ex.unlock_after_days;
            // Admins bypass the day-gating and get the full catalogue.
            const unlocked = user.is_admin || completedDays >= threshold;
            const completed = Math.min(completedDays, threshold);
            const pct = unlocked
              ? 100
              : threshold > 0 ? Math.min(100, Math.round((completed / threshold) * 100)) : 100;
            return {
              slug: ex.slug,
              name: ex.name,
              unlocked,
              daysLeft: unlocked ? 0 : Math.max(0, threshold - completedDays),
              completed,
              threshold,
              pct,
            };
          });

        if (!cancelled) setRows(list);
      } catch (e) {
        console.error('Failed to load exercises list', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isFocused, user]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </SafeAreaView>
    );
  }

  const renderRow = (row: Row) => (
    <View style={styles.rowInner}>
      <EquipmentIcon slug={row.slug} size={56} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>{row.name}</Text>
        {row.unlocked ? (
          <Text style={styles.rowMuted}>{t('allExercises.available')}</Text>
        ) : (
          <>
            <Text style={styles.rowMuted}>complete {row.daysLeft} training days</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${row.pct}%` }]} />
            </View>
          </>
        )}
      </View>
      {row.unlocked ? (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path d="M9 6l6 6-6 6" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ) : (
        <Text style={styles.rowRatio}>
          {row.completed}/{row.threshold}
        </Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Watermark />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M15 6l-6 6 6 6" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('allExercises.exercises')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {rows.map((row) =>
          row.unlocked ? (
            <TouchableOpacity
              key={row.slug}
              activeOpacity={0.85}
              style={styles.row}
              onPress={() =>
                navigation.navigate('ExerciseDetail', {
                  slug: row.slug,
                  unlocked: true,
                  daysLeft: 0,
                })
              }
            >
              {renderRow(row)}
            </TouchableOpacity>
          ) : (
            <View key={row.slug} style={[styles.row, styles.rowLocked]}>
              {renderRow(row)}
            </View>
          ),
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.white },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 12 },
  row: {
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLocked: { opacity: DISABLED_OPACITY },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 18, fontWeight: 'bold', color: COLORS.white, lineHeight: 22 },
  rowMuted: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  progressBarBg: {
    height: 6,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 3,
  },
  rowRatio: {
    alignSelf: 'flex-start',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
});

export default AllExercisesScreen;
