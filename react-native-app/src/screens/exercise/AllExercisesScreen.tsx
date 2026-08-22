import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused, NavigationProp } from '@react-navigation/native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { COLORS, GLASS, TYPE, SPACE, RADIUS } from '../../theme/colors';
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
      <View style={!row.unlocked && styles.lockedArt}>
        <EquipmentIcon slug={row.slug} size={56} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowName, !row.unlocked && styles.rowNameLocked]}>{row.name}</Text>
        {row.unlocked ? (
          <Text style={styles.rowAvailable}>Available</Text>
        ) : (
          <>
            <View style={styles.lockRow}>
              <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                <Rect x={4} y={10} width={16} height={11} rx={2.5} stroke={COLORS.textDim} strokeWidth={2.2} />
                <Path d="M8 10V7a4 4 0 1 1 8 0v3" stroke={COLORS.textDim} strokeWidth={2.2} strokeLinecap="round" />
              </Svg>
              <Text style={styles.rowMuted}>
                Complete {row.daysLeft} more training days
              </Text>
            </View>
            <View
              style={styles.progressBarBg}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${row.name} unlock progress`}
              accessibilityValue={{ min: 0, max: row.threshold, now: row.completed }}
            >
              <View style={[styles.progressBarFill, { width: `${row.pct}%` }]} />
            </View>
          </>
        )}
      </View>
      {row.unlocked ? (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path d="M9 6l6 6-6 6" stroke={COLORS.textDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
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
        <TouchableOpacity
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={() => navigation.goBack()}
        >
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M15 6l-6 6 6 6" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Exercises</Text>
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
            <View key={row.slug} style={styles.row}>
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
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.lg,
  },
  backBtn: {
    position: 'absolute',
    left: SPACE.md,
    // 36px was under both the iOS HIG and Material minimum target.
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...TYPE.title, color: COLORS.white },
  scroll: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, paddingBottom: 40, gap: SPACE.md },
  row: {
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.lg,
    paddingVertical: 14,
  },
  // The card keeps full opacity; only the artwork dims. A whole row at
  // opacity 0.5 reads as broken rather than as not yet earned.
  lockedArt: { opacity: 0.4 },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4, color: COLORS.white, lineHeight: 22 },
  rowNameLocked: { color: COLORS.textMuted },
  rowAvailable: { ...TYPE.bodySm, color: COLORS.accent, fontWeight: '600', marginTop: 2 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  rowMuted: { ...TYPE.bodySm, color: COLORS.textMuted },
  progressBarBg: {
    height: 6,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 3,
    marginTop: SPACE.sm,
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
    fontWeight: '700',
    color: COLORS.textDim,
  },
});

export default AllExercisesScreen;
