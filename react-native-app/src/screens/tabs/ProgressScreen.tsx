import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Animated,
  I18nManager,
  useWindowDimensions,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Watermark } from '../../components/Watermark';
import { TourOverlay } from '../../components/TourOverlay';
import { PremiumNotice } from '../../components/PremiumNotice';
import { PROGRESS_TOUR, hasSeenTour, markTourSeen } from '../../services/tours';
import { useIsFocused, useNavigation, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { tabBarClearance, Palette, SPACE } from '../../theme/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import {
  getMeasurements,
  insertMeasurement,
} from '../../db/queries';
import { getLocalDateString } from '../../services/progression';
import { syncNow } from '../../services/sync';
import Svg, { Path } from 'react-native-svg';
import { Chevron } from '../../components/Chevron';
import { track } from '../../services/events';

/**
 * The three concentric rings behind the hold button.
 *
 * They were 380, 300 and 230 flat. 380 is wider than a 360pt phone, so the
 * outermost ring ran off both sides of the screen - and being a border-only
 * circle, what showed was two arcs cut off at the edges.
 *
 * Proportional now, with the old sizes as the cap so nothing changes on a
 * phone that always had room. The 0.86 leaves a margin at the widest ring;
 * the inner two keep their original ratios to it.
 */
const RING_MAX = 380;
/**
 * Derived from the LIVE window, not from a module-load snapshot.
 *
 * `Dimensions.get` runs once when the bundle is required, so the whole point
 * of making these proportional was lost on any window that changes after
 * launch - a fold, split screen, a rotation - which is exactly when the
 * outermost ring runs off the edges again.
 */
const ringSizesFor = (width: number) => {
  const outer = Math.min(RING_MAX, Math.round(width * 0.86));
  return [
    outer,
    Math.round(outer * (300 / RING_MAX)),
    Math.round(outer * (230 / RING_MAX)),
  ];
};

/** Kept in one place so the button's height and the scroll padding cannot drift. */
const CTA_HEIGHT = 56;

export const ProgressScreen = () => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const { user, subscribed } = useAuth();
  const navigation = useNavigation<NavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const ringSizes = useMemo(() => ringSizesFor(windowWidth), [windowWidth]);
  const holdBtnSize = useMemo(() => {
    const size = Math.min(208, ringSizes[2] - 16);
    return { width: size, height: size, borderRadius: size / 2 };
  }, [ringSizes]);

  // tabBarClearance already carries one SPACE.lg of breathing room above the
  // floating bar; the button sits in that gap rather than adding a second one.
  const ctaBottom = tabBarClearance(insets.bottom) - SPACE.lg;
  const scrollPadBottom = ctaBottom + CTA_HEIGHT + SPACE.xl;

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
  /**
   * This tab's tour, shown the first time it is opened.
   *
   * Gated on the screen having finished loading: the tour measures real
   * elements, and pointing at a spinner spotlights nothing.
   */
  const [showTour, setShowTour] = useState(false);
  /** Whether this mount has already opened (or completed) the tour. */
  const tourHandledRef = useRef(false);
  const tourMeasureRef = useRef<View>(null);
  const tourChartRef = useRef<View>(null);
  /**
   * This screen scrolls now, and the tour has to be told.
   *
   * It did not when the tour was written - everything was on one fixed screen,
   * so a target could always be measured where it stood. Once the screen was
   * made scroll-safe the Take measurement button moved below the fold on most
   * phones, and a spotlight is measured in WINDOW coordinates: the tour was
   * pointing confidently at the part of the screen where the button would have
   * been if it were visible.
   */
  const scrollRef = useRef<ScrollView>(null);


  const timerRef = useRef<any | null>(null);
  const startRef = useRef<number>(0);
  /** Mirrors `holding` for the press handlers - see beginMeasure. */
  const holdingRef = useRef(false);
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
        // Readable, not numeric. The bare toLocaleDateString gave "27/08/2026"
        // - a date the reader has to decode, and one whose day/month order is
        // ambiguous the moment the locale is not the one they expect. Asking
        // for a named month is both clearer and unambiguous, and Intl renders
        // it in the device language with that language's own field order, so
        // no string of ours needs translating.
        // In the READER's timezone, matching the "Today" comparison below.
        // Without it, the printed date and the day the app calls today are
        // derived from two different clocks, so a measurement could be
        // labelled with yesterday's date and still be counted as today.
        const dateFormat: Intl.DateTimeFormatOptions = {
          timeZone: user.timezone || undefined,
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        };
        let label = (() => {
          try {
            return dateObj.toLocaleDateString(i18n.language, dateFormat);
          } catch {
            try {
              return dateObj.toLocaleDateString(undefined, dateFormat);
            } catch {
              return dateObj.toLocaleDateString();
            }
          }
        })();
        // Both sides in the READER's timezone.
        //
        // The left-hand side already was; the right-hand side was the raw
        // date part of a UTC timestamp. For anyone far enough from UTC those
        // are different days for several hours out of every twenty-four, so a
        // measurement taken minutes ago was labelled with yesterday's or
        // tomorrow's date instead of "Today".
        const todayStr = getLocalDateString(user.timezone);
        const itemDateStr = getLocalDateString(user.timezone, dateObj);
        if (todayStr === itemDateStr) {
          label = t('progress.today');
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

      // Runs for everybody now. The guard here existed because the screen
      // used to be a wall for a free account, and there is no point touring a
      // wall; the tracker is visible to everyone.
      // Guarded on a ref as well as on the stored flag: loadData runs on
      // every focus, and the flag is only written when the tour is DISMISSED,
      // so leaving the tab mid-tour and returning restarted it from step one.
      if (user && !tourHandledRef.current && !(await hasSeenTour('progress', user.id))) {
        tourHandledRef.current = true;
        setShowTour(true);
      }
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

  /**
   * Bucket the chart in the READER's timezone, not the device's.
   *
   * Every boundary here was built with `new Date(y, m, d)`, which is midnight
   * on the DEVICE. A user whose stored timezone differs from the phone's - who
   * travelled, or whose phone is set to something else - had each session
   * counted into whichever bar the device's calendar put it in, so the same
   * hold could appear on the wrong day and the "last 7 days" window could be
   * off by one at both ends. Comparing YYYY-MM-DD strings produced in the
   * user's zone removes the device from the question entirely.
   */
  const calculateBuckets = (measurements: any[], currentMode: 'days' | 'weeks' | 'months') => {
    const tz = user?.timezone;
    const localDay = (d: Date) => getLocalDateString(tz, d);
    // "Now", as a date the reader would recognise. Parsed back at UTC noon so
    // the setDate arithmetic below cannot land on a DST boundary and repeat or
    // skip a day - the same trick getStreak uses.
    const today = new Date(`${getLocalDateString(tz)}T12:00:00Z`);
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
      // Inclusive YYYY-MM-DD bounds rather than millisecond instants, so a
      // measurement lands in the bucket the reader would put it in.
      let bucketFrom: string;
      let bucketTo: string;
      let label = '';
      // Formatted in UTC, because the bucket dates are BUILT in UTC (noon, to
      // dodge DST). Letting the label render in the device zone would print a
      // different day from the one the bucket actually covers wherever the
      // offset is far enough from zero - at UTC+14, noon UTC is already
      // tomorrow. The language still comes from the reader.
      const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => {
        const withZone = { ...opts, timeZone: 'UTC' };
        try {
          return d.toLocaleDateString(i18n.language, withZone);
        } catch {
          try {
            return d.toLocaleDateString('en-US', withZone);
          } catch {
            return d.toLocaleDateString();
          }
        }
      };

      if (unit === 'day') {
        const d = new Date(today);
        d.setUTCDate(today.getUTCDate() - i);
        bucketFrom = d.toISOString().slice(0, 10);
        bucketTo = bucketFrom;
        label = fmt(d, { day: 'numeric', month: 'short' });
      } else if (unit === 'month') {
        const d = new Date(
          Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1, 12),
        );
        const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));
        bucketFrom = d.toISOString().slice(0, 10);
        bucketTo = end.toISOString().slice(0, 10);
        label = fmt(d, { month: 'short' });
      } else {
        // week, starting Sunday
        const d = new Date(today);
        d.setUTCDate(today.getUTCDate() - i * 7);
        const startDay = new Date(d);
        startDay.setUTCDate(d.getUTCDate() - d.getUTCDay());
        const endDay = new Date(startDay);
        endDay.setUTCDate(startDay.getUTCDate() + 6);
        bucketFrom = startDay.toISOString().slice(0, 10);
        bucketTo = endDay.toISOString().slice(0, 10);
        label = fmt(startDay, { day: 'numeric', month: 'short' });
      }

      // Filter max seconds in bucket
      const value = measurements
        .filter((m) => {
          const day = localDay(new Date(m.measured_at));
          return day >= bucketFrom && day <= bucketTo;
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
      const yearStr = today.getUTCFullYear();
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
    // Guarded on the REF, not on `holding`. State does not update within the
    // same tick, so a second onPressIn arriving before React re-rendered - a
    // second finger, a fast double press - passed this check and started a
    // second interval. The first was then orphaned, ticking against the same
    // state for as long as the screen lived, and `endMeasure` could only ever
    // clear the last one.
    if (holdingRef.current || done) return;
    holdingRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
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

  // The measure timer only stopped when the hold ENDED. Navigating away
  // mid-hold - which the back button invites - left an 80ms interval running
  // against an unmounted screen, setting state forever.
  useEffect(() => () => {
    holdingRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const endMeasure = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setHolding(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
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
      track(user.id, 'measurement_taken', null, null, { seconds: result });
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
      {/* Scroll-safe.
          Nothing in this stack flexes - the chart area is a fixed 176 and
          everything else is intrinsic - so the screen is exactly as tall as
          its content and clips whatever does not fit. That put the Take
          measurement button off the bottom on a short phone, and the premium
          notice above made it worse by adding another row. */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: scrollPadBottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title Row */}
        <View style={styles.titleRow}>
          <Text style={styles.pageTitle}>{t('progress.progressTracker')}</Text>
        </View>

        {/* Summary stats */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <View style={styles.trophyIcon}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill={COLORS.accentText}>
                <Path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v3c0 2.2 1.8 4 4 4h1.7c.6 1.4 1.7 2.5 3.1 3v2H8v2h8v-2h-3.8v-2c1.4-.5 2.5-1.6 3.1-3H17c2.2 0 4-1.8 4-4V7c0-1.1-.9-2-2-2zM7 10c-1.1 0-2-.9-2-2V7h2v3zm10 0V7h2v1c0 1.1-.9 2-2 2z" />
              </Svg>
            </View>
            <View>
              <Text style={styles.summaryLabel}>{t('progress.bestResult')}</Text>
              <Text style={styles.summaryValue}>
                {best > 0 ? t('progress.seconds', { count: best }) : '-'}
              </Text>
            </View>
          </View>

          <View style={styles.summaryBoxRight}>
            <Text style={styles.summaryLabel}>{t('progress.lastMeasurement')}</Text>
            <Text style={styles.summaryValue}>
              {last ? `${t('progress.seconds', { count: last.seconds })} (${last.label})` : '-'}
            </Text>
          </View>
        </View>

        {!subscribed && <PremiumNotice textKey="premium.noticeProgress" />}

        {/* Chart Section */}
        <View ref={tourChartRef} collapsable={false} style={styles.chartCard}>
          <Text style={styles.chartTitle}>{rangeLabel}</Text>
          <Text style={styles.chartSubtitle}>{t('progress.topResult', { count: best })}</Text>

          <View style={styles.chartArea}>
            {/* Y Axis Gridlines */}
            {[maxScale, Math.floor(maxScale * 2 / 3), Math.floor(maxScale / 3), 0].map((gVal) => {
              const topPct = `${(1 - gVal / maxScale) * 100}%`;
              return (
                <View key={gVal} style={[styles.gridlineRow, { top: topPct as any }]}>
                  <View style={styles.gridline} />
                  <Text style={styles.yLabel}>{t('progress.seconds', { count: gVal })}</Text>
                </View>
              );
            })}

            {/* Bar Chart Bars
                Each column is its own accessible element carrying its period
                and its value. The trend WAS the content of this screen and had
                no accessible representation at all - a screen reader met a set
                of unlabelled views and moved on, so the only thing it could
                report was the best and last figures in the summary above. */}
            <View style={styles.barsContainer}>
              {bars.map((bar, idx) => {
                const heightPct = bar.value > 0 ? `${Math.min(100, Math.max(8, (bar.value / maxScale) * 100))}%` : '0%';
                return (
                  <View
                    key={idx}
                    style={styles.barColumn}
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={`${bar.label}: ${
                      bar.value > 0 ? t('progress.seconds', { count: bar.value }) : '-'
                    }`}
                  >
                    <View style={[styles.bar, { height: heightPct as any }]} />
                  </View>
                );
              })}
            </View>
          </View>

          {/* X Axis Labels */}
          {/* Visual only: each bar above now announces its own period, so
              leaving these readable would repeat every label twice. */}
          <View style={styles.xLabelsContainer} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {bars.map((bar, idx) => (
              <Text key={idx} style={styles.xLabel} numberOfLines={1}>
                {bar.label}
              </Text>
            ))}
          </View>
        </View>

        {/* Range Toggles */}
        {/* One choice out of three, which is a radio group. Unlabelled
            Touchables announced only their own text, so nothing said the three
            were alternatives or which one was currently in force. */}
        <View style={styles.toggleRow} accessibilityRole="radiogroup">
          {(['days', 'weeks', 'months'] as const).map((tMode) => (
            <TouchableOpacity
              key={tMode}
              style={[styles.toggleBtn, mode === tMode && styles.toggleBtnActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: mode === tMode, checked: mode === tMode }}
              onPress={() => setMode(tMode)}
            >
              <Text style={[styles.toggleText, mode === tMode && styles.toggleTextActive]}>
                {t(`progress.range${tMode.charAt(0).toUpperCase()}${tMode.slice(1)}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>

      {/* Measure CTA.
          A sibling of the ScrollView, not a child of it. It was absolutely
          positioned INSIDE the scroll content, which anchors it to the content
          rather than to the screen: it sat at the bottom of the scrollable
          area and slid away the moment anyone scrolled, so the one action on
          this tab was only reachable at one scroll position. The content pads
          itself by the same amount below so nothing ends up underneath it. */}
      <View style={[styles.ctaContainer, { bottom: ctaBottom }]}>
        <View ref={tourMeasureRef} collapsable={false}>
        {/* The ask, at the point of use.
            A free account sees the whole tracker - the chart, the best
            result, the range tabs - and only meets the subscription when it
            reaches for the one thing that writes to it. That is a far more
            honest offer than a page that refuses to show itself, and it is
            the moment the reader actually wants the feature. */}
        <TouchableOpacity
          style={styles.ctaBtn}
          accessibilityRole="button"
          onPress={() => {
            if (subscribed) {
              setMeasuring(true);
              return;
            }
            track(user?.id, 'lock_tapped', 'measure');
            navigation.navigate('Paywall', { source: 'measure' });
          }}
        >
          <Text style={styles.ctaBtnText}>{t('progress.takeMeasurement')}</Text>
        </TouchableOpacity>
        </View>
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
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              onPress={() => {
                setMeasuring(false);
                setDone(false);
                setResult(0);
                setElapsed(0);
              }}
            >
              <Chevron direction="back" size={24} color={COLORS.textMuted} strokeWidth={2.5} />
            </TouchableOpacity>
            <Text
              style={styles.overlayHeaderTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {t('progress.progressTracker')}
            </Text>
          </View>

          <View style={styles.overlayCenter}>
            <View style={styles.ringsContainer}>
              {ringSizes.map((ring) => (
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
                    style={[styles.holdBtn, holdBtnSize]}
                    accessibilityRole="button"
                    accessibilityLabel={t('progress.pressAndHold')}
                    onPressIn={beginMeasure}
                    onPressOut={endMeasure}
                  >
                    {!holding ? (
                      <Text style={styles.holdBtnText}>{t('progress.pressAndHold')}</Text>
                    ) : (
                      <Text style={styles.elapsedText}>{Math.floor(elapsed)}s</Text>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                <View style={styles.resultBox}>
                  <Text style={styles.resultValue}>{Math.floor(result)}s</Text>
                  <Text style={styles.resultLabel}>{t('progress.yourHold')}</Text>
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
                      stroke={COLORS.accentText}
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

      <TourOverlay
        visible={showTour}
        steps={PROGRESS_TOUR}
        targets={{ measure: tourMeasureRef, chart: tourChartRef }}
        onStep={(id) =>
          scrollRef.current?.scrollTo({ y: id === 'measure' ? 9999 : 0, animated: true })
        }
        onDone={(completed) => {
          setShowTour(false);
          tourHandledRef.current = true;
          if (user) markTourSeen('progress', user.id, completed);
        }}
      />
    </SafeAreaView>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
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
    flexShrink: 1,
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
    ...COLORS.glass,
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
    ...COLORS.glass,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.whiteFaint,
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
    ...COLORS.glass,
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
    fontWeight: '500',
    color: COLORS.textMuted,
    textTransform: 'capitalize',
  },
  toggleTextActive: {
    color: COLORS.white,
  },
  ctaContainer: {
    position: 'absolute',
    // `bottom` is supplied inline: it depends on the live safe-area inset,
    // which the memoised stylesheet must not close over.
    start: 20,
    end: 20,
  },
  ctaBtn: {
    height: CTA_HEIGHT,
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
    flex: 1,
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
    // borderStrong, matching every other training circle in the app - the
    // session ring, the two lesson rings. These were on `border`, which is the
    // hairline weight meant for card edges: about 6% on dark and 10% on light,
    // so on a light page the outer rings were all but gone while the same
    // circles elsewhere were clearly drawn.
    borderColor: COLORS.borderStrong,
    borderWidth: 1,
  },
  // Sized against the innermost ring rather than fixed at 208, so the button
  // keeps its place inside them on a narrow phone instead of swallowing them.
  // The dimensions themselves are applied inline from the live window; only
  // the palette-dependent parts belong in the memoised stylesheet.
  holdBtn: {
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
    ...COLORS.glass,
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
    ...COLORS.glass,
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
    ...COLORS.glass,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retakeBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
});
