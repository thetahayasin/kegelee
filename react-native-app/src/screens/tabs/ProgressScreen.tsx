import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Animated,
  I18nManager,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Watermark } from '../../components/Watermark';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS, GLASS } from '../../theme/colors';
import {
  getMeasurements,
  insertMeasurement,
} from '../../db/queries';
import { getLocalDateString } from '../../services/progression';
import { syncNow } from '../../services/sync';
import Svg, { Path } from 'react-native-svg';

export const ProgressScreen = () => {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'days' | 'weeks' | 'months'>('weeks');
  const [best, setBest] = useState(0);
  const [last, setLast] = useState<{ seconds: number; label: string } | null>(null);
  const [bars, setBars] = useState<any[]>([]);
  const [maxScale, setMaxScale] = useState(6);
  const [rangeLabel, setRangeLabel] = useState('');

  // Measuring Overlay State
  const [measuring, setMeasuring] = useState(false);
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(0);
  
  const timerRef = useRef<any | null>(null);
  const startRef = useRef<number>(0);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const loadData = async () => {
    if (!user) return;
    try {
      const items = await getMeasurements(user.id, 500); // fetch all history to group
      
      // Calculate best
      const maxSec = items.reduce((max, item) => (item.seconds > max ? item.seconds : max), 0);
      setBest(Math.floor(maxSec));

      // Calculate last
      if (items.length > 0) {
        const lastItem = items[0];
        const dateObj = new Date(lastItem.measured_at);
        let label = dateObj.toLocaleDateString();
        // Check if today
        const todayStr = getLocalDateString(user.timezone);
        const itemDateStr = lastItem.measured_at.split('T')[0];
        if (todayStr === itemDateStr) {
          label = 'Today';
        }
        setLast({
          seconds: Math.floor(lastItem.seconds),
          label,
        });
      } else {
        setLast(null);
      }

      // Calculate buckets
      const calculated = calculateBuckets(items, mode);
      setBars(calculated.bars);
      setMaxScale(calculated.maxScale);
      setRangeLabel(calculated.rangeLabel);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
    // Intentionally keyed to focus/mount only: loadData is recreated every
    // render, so listing it here would refetch in a loop. Wrap it in
    // useCallback before adding it to these deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, mode]);

  const calculateBuckets = (measurements: any[], currentMode: 'days' | 'weeks' | 'months') => {
    const today = new Date();
    let count = 6;
    let unit: 'day' | 'week' | 'month' = 'week';
    if (currentMode === 'days') {
      count = 7;
      unit = 'day';
    } else if (currentMode === 'months') {
      count = 6;
      unit = 'month';
    }

    const barsList = [];

    for (let i = count - 1; i >= 0; i--) {
      let bucketStart: Date;
      let bucketEnd: Date;
      let label = '';

      if (unit === 'day') {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        bucketStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
        bucketEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
        label = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      } else if (unit === 'month') {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        bucketStart = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);
        bucketEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
        label = d.toLocaleDateString('en-US', { month: 'short' });
      } else {
        // week
        const d = new Date(today);
        d.setDate(today.getDate() - i * 7);
        // Start of week (Sunday)
        const dayOfWeek = d.getDay();
        const startDay = new Date(d);
        startDay.setDate(d.getDate() - dayOfWeek);
        bucketStart = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate(), 0, 0, 0);
        
        const endDay = new Date(startDay);
        endDay.setDate(startDay.getDate() + 6);
        bucketEnd = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), 23, 59, 59);
        
        label = bucketStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      }

      // Filter max seconds in bucket
      const value = measurements
        .filter((m) => {
          const t = new Date(m.measured_at).getTime();
          return t >= bucketStart.getTime() && t <= bucketEnd.getTime();
        })
        .reduce((max, m) => (m.seconds > max ? m.seconds : max), 0);

      barsList.push({
        label,
        value: Math.floor(value),
      });
    }

    // Range label
    let rangeLbl = '';
    if (barsList.length > 0) {
      const yearStr = today.getFullYear();
      rangeLbl = `${barsList[0].label} - ${barsList[barsList.length - 1].label} ${yearStr}`;
    }

    const maxVal = barsList.reduce((max, b) => (b.value > max ? b.value : max), 0);
    const calculatedMaxScale = Math.max(6, Math.ceil(maxVal / 2) * 2);

    return {
      bars: barsList,
      maxScale: calculatedMaxScale,
      rangeLabel: rangeLbl,
    };
  };

  // Measuring Hold interaction
  const beginMeasure = () => {
    if (holding || done) return;
    setHolding(true);
    setDone(false);
    setElapsed(0);
    setResult(0);
    startRef.current = Date.now();
    
    Animated.timing(scaleAnim, {
      toValue: 1.08,
      duration: 150,
      useNativeDriver: true,
    }).start();

    timerRef.current = setInterval(() => {
      setElapsed((Date.now() - startRef.current) / 1000);
    }, 80);
  };

  const endMeasure = () => {
    if (!holding) return;
    setHolding(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    const finalSecs = (Date.now() - startRef.current) / 1000;
    setResult(finalSecs);
    setDone(true);

    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  const handleSaveResult = async () => {
    if (saving || !user) return;
    setSaving(true);
    try {
      await insertMeasurement(user.id, result, 0); // saved with synced = 0
      setMeasuring(false);
      setDone(false);
      setResult(0);
      setElapsed(0);
      
      // Refresh list
      await loadData();
      // Background Sync trigger
      syncNow(user.id).catch(() => {});
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const retake = () => {
    setDone(false);
    setElapsed(0);
    setResult(0);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Watermark />
      {/* Title Row */}
      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>{t('progress.progressTracker')}</Text>
      </View>

      {/* Summary stats */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <View style={styles.trophyIcon}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill={COLORS.accent}>
              <Path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v3c0 2.2 1.8 4 4 4h1.7c.6 1.4 1.7 2.5 3.1 3v2H8v2h8v-2h-3.8v-2c1.4-.5 2.5-1.6 3.1-3H17c2.2 0 4-1.8 4-4V7c0-1.1-.9-2-2-2zM7 10c-1.1 0-2-.9-2-2V7h2v3zm10 0V7h2v1c0 1.1-.9 2-2 2z" />
            </Svg>
          </View>
          <View>
            <Text style={styles.summaryLabel}>best result</Text>
            <Text style={styles.summaryValue}>{best > 0 ? `${best} sec` : '-'}</Text>
          </View>
        </View>

        <View style={styles.summaryBoxRight}>
          <Text style={styles.summaryLabel}>last measurement</Text>
          <Text style={styles.summaryValue}>
            {last ? `${last.seconds} sec (${last.label})` : '-'}
          </Text>
        </View>
      </View>

      {/* Chart Section */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>{rangeLabel}</Text>
        <Text style={styles.chartSubtitle}>top result: {best} sec</Text>

        <View style={styles.chartArea}>
          {/* Y Axis Gridlines */}
          {[maxScale, Math.floor(maxScale * 2 / 3), Math.floor(maxScale / 3), 0].map((gVal) => {
            const topPct = `${(1 - gVal / maxScale) * 100}%`;
            return (
              <View key={gVal} style={[styles.gridlineRow, { top: topPct as any }]}>
                <View style={styles.gridline} />
                <Text style={styles.yLabel}>{gVal} sec</Text>
              </View>
            );
          })}

          {/* Bar Chart Bars */}
          <View style={styles.barsContainer}>
            {bars.map((bar, idx) => {
              const heightPct = bar.value > 0 ? `${Math.min(100, Math.max(8, (bar.value / maxScale) * 100))}%` : '0%';
              return (
                <View key={idx} style={styles.barColumn}>
                  <View style={[styles.bar, { height: heightPct as any }]} />
                </View>
              );
            })}
          </View>
        </View>

        {/* X Axis Labels */}
        <View style={styles.xLabelsContainer}>
          {bars.map((bar, idx) => (
            <Text key={idx} style={styles.xLabel} numberOfLines={1}>
              {bar.label}
            </Text>
          ))}
        </View>
      </View>

      {/* Range Toggles */}
      <View style={styles.toggleRow}>
        {(['days', 'weeks', 'months'] as const).map((tMode) => (
          <TouchableOpacity
            key={tMode}
            style={[styles.toggleBtn, mode === tMode && styles.toggleBtnActive]}
            onPress={() => setMode(tMode)}
          >
            <Text style={[styles.toggleText, mode === tMode && styles.toggleTextActive]}>
              {tMode}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Measure CTA */}
      <View style={styles.ctaContainer}>
        <TouchableOpacity style={styles.ctaBtn} onPress={() => setMeasuring(true)}>
          <Text style={styles.ctaBtnText}>{t('progress.takeMeasurement')}</Text>
        </TouchableOpacity>
      </View>

      {/* Measurement Overlay Modal */}
      <Modal
        visible={measuring}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setMeasuring(false);
          setDone(false);
          setResult(0);
          setElapsed(0);
        }}
      >
        <SafeAreaView style={styles.overlayContainer}>
          <View style={styles.overlayHeader}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                setMeasuring(false);
                setDone(false);
                setResult(0);
                setElapsed(0);
              }}
            >
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path d="M15 19l-7-7 7-7" stroke={COLORS.textMuted} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </TouchableOpacity>
            <Text style={styles.overlayHeaderTitle}>{t('progress.progressTracker')}</Text>
          </View>

          <View style={styles.overlayCenter}>
            <View style={styles.ringsContainer}>
              {[380, 300, 230].map((ring) => (
                <View
                  key={ring}
                  style={[
                    styles.ringBackground,
                    { width: ring, height: ring, borderRadius: ring / 2 },
                  ]}
                />
              ))}

              {!done ? (
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                  <TouchableOpacity
                    activeOpacity={1}
                    style={styles.holdBtn}
                    onPressIn={beginMeasure}
                    onPressOut={endMeasure}
                  >
                    {!holding ? (
                      <Text style={styles.holdBtnText}>Press{'\n'}& Hold</Text>
                    ) : (
                      <Text style={styles.elapsedText}>{Math.floor(elapsed)}s</Text>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                <View style={styles.resultBox}>
                  <Text style={styles.resultValue}>{Math.floor(result)}s</Text>
                  <Text style={styles.resultLabel}>your hold</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.overlayBottom}>
            {!done ? (
              <View style={styles.instructionsBox}>
                <View style={styles.infoAlertIcon}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M12 9v4M12 17h.01M10.3 4.3 2.5 18a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z"
                      stroke={COLORS.accent}
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </View>
                <Text style={styles.instructionsText}>
                  {t('progress.holdTheButtonAndContract')}
                </Text>
              </View>
            ) : (
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveResult}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color={COLORS.onAccent} />
                  ) : (
                    <Text style={styles.saveBtnText}>{t('progress.continue')}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.retakeBtn} onPress={retake} disabled={saving}>
                  <Text style={styles.retakeBtnText}>{t('progress.tryAgain')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  summaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  trophyIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    ...GLASS,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
    marginTop: 2,
  },
  summaryBoxRight: {
    alignItems: 'flex-end',
  },
  chartCard: {
    marginHorizontal: 16,
    marginTop: 24,
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  chartSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  chartArea: {
    height: 176,
    marginTop: 20,
    position: 'relative',
  },
  gridlineRow: {
    position: 'absolute',
    start: 0,
    end: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridline: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  yLabel: {
    marginStart: 8,
    width: 48,
    // Hugs the chart, so it must flip with the layout. RN's textAlign has no
    // start/end, and 'auto' would left-align in LTR - the opposite of what
    // this label needs. Read once at style-creation time, which is safe
    // because changing direction requires an app restart anyway.
    textAlign: I18nManager.isRTL ? 'left' : 'right',
    fontSize: 10,
    color: COLORS.textMuted,
  },
  barsContainer: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 56, // matches y-label offset
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
    marginHorizontal: 4,
  },
  bar: {
    width: 24,
    backgroundColor: COLORS.accent,
    borderRadius: 6,
  },
  xLabelsContainer: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingEnd: 56,
    paddingHorizontal: 8,
  },
  xLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    color: COLORS.textMuted,
    marginHorizontal: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 4,
    marginTop: 24,
  },
  toggleBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  toggleBtnActive: {
    backgroundColor: COLORS.surface2,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: 'medium',
    color: COLORS.textMuted,
    textTransform: 'capitalize',
  },
  toggleTextActive: {
    color: COLORS.white,
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 24,
    start: 20,
    end: 20,
  },
  ctaBtn: {
    height: 56,
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },

  // Measuring overlay styles
  overlayContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayHeaderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    marginStart: 8,
  },
  overlayCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringsContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringBackground: {
    position: 'absolute',
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
  },
  holdBtn: {
    width: 208,
    height: 208,
    borderRadius: 104,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  holdBtnText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.onAccent,
    textAlign: 'center',
    lineHeight: 28,
  },
  elapsedText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  resultBox: {
    width: 208,
    height: 208,
    borderRadius: 104,
    ...GLASS,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  resultLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  overlayBottom: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  instructionsBox: {
    flexDirection: 'row',
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    alignItems: 'flex-start',
  },
  infoAlertIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.surface2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionsText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  actionButtons: {
    gap: 12,
  },
  saveBtn: {
    height: 56,
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  retakeBtn: {
    height: 48,
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retakeBtnText: {
    fontSize: 16,
    fontWeight: 'semibold',
    color: COLORS.white,
  },
});
