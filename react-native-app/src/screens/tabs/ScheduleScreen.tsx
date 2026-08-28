import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Watermark } from '../../components/Watermark';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS, GLASS, TYPE, SPACE, RADIUS } from '../../theme/colors';
import {
  getReminders,
  saveReminder,
} from '../../db/queries';
import { getDBConnection } from '../../db/sqlite';
import { getPosition } from '../../services/progression';
import { scheduleReminders, showTimePicker, isExactAlarmAllowed, openExactAlarmSettings, ReminderConfig } from '../../services/reminders';
import { syncNow } from '../../services/sync';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

// Last-resort labels only. The real ones come from Intl below, because
// hardcoding seven English abbreviations left the repeat-on picker in
// English for all 29 languages.
const WEEKDAYS_FALLBACK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Short weekday names in the reader's language, Sunday first.
 *
 * Derived from Intl rather than 7 translated keys per locale: the platform
 * already knows every language's abbreviation and its capitalisation rules,
 * and a translator cannot get those wrong here. 2024-01-07 was a Sunday, so
 * adding the index walks Sun..Sat while matching the numeric day indexes
 * `selectedDays` stores.
 *
 * Hermes ships Intl inconsistently, so a throw falls back to English rather
 * than taking the screen down.
 */
const weekdayLabels = (locale: string): string[] => {
  try {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(Date.UTC(2024, 0, 7 + i))),
    );
  } catch {
    return WEEKDAYS_FALLBACK;
  }
};

export const ScheduleScreen = () => {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState<any>({ month: 1, days_left: 30, completed: 0, plan_length: 30, day: 1 });
  const [calendarDays, setCalendarDays] = useState<any[]>([]);
  const [activeRemindersCount, setActiveRemindersCount] = useState(0);

  // Reminders config modal
  const [remindersModalVisible, setRemindersModalVisible] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [savingReminders, setSavingReminders] = useState(false);
  /**
   * Confirmations and validation, said in the app rather than in a native
   * dialog.
   *
   * Every other surface that has something to tell you - the paywall, the
   * subscribe sheet, all the auth screens - says it inline. This tab alone
   * used Alert.alert, so the same class of information arrived in two
   * entirely different shapes depending on which screen you were on, and the
   * more interruptive of the two was being spent on "saved".
   *
   * The exact-alarm prompt comes through here too, with an action. It was a
   * native dialog on the argument that a real either/or leading to a system
   * screen is what dialogs are for - which is true in the abstract and wrong
   * here, because it made the one message in this flow that asks for something
   * look like it came from a different app than the message right before it.
   */
  const [notice, setNotice] = useState<{
    tone: 'ok' | 'error';
    text: string;
    action?: { label: string; onPress: () => void };
  } | null>(null);

  const loadData = async () => {
    if (!user) return;
    try {
      const db = await getDBConnection();

      // Load training days
      const daysRes = await db.executeSql(
        'SELECT * FROM training_days WHERE user_id = ? ORDER BY date DESC',
        [user.id]
      );
      const trainingDays = [];
      for (let i = 0; i < daysRes[0].rows.length; i++) {
        trainingDays.push(daysRes[0].rows.item(i));
      }

      const pos = getPosition(user, trainingDays);
      setPosition(pos);

      // Build 30 calendar days
      const days = [];
      for (let d = 1; d <= pos.plan_length; d++) {
        days.push({
          n: d,
          done: d <= pos.completed,
          today: d === pos.day,
        });
      }
      setCalendarDays(days);

      // Load reminders count
      const localReminders = await getReminders(user.id);
      const enabledCount = localReminders.filter((r) => r.is_enabled === 1).length;
      setActiveRemindersCount(enabledCount);

      // Populate config state
      const activeDays = localReminders
        .filter((r) => r.is_enabled === 1)
        .map((r) => (r.weekday === 6 ? 0 : r.weekday + 1));
      setSelectedDays(activeDays);

      // Find default times
      if (localReminders.length > 0 && localReminders[0].times.length > 0) {
        setTimes(localReminders[0].times);
      } else {
        setTimes(['08:00']);
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
  }, [isFocused]);

  const toggleDay = (dayIndex: number) => {
    if (selectedDays.includes(dayIndex)) {
      setSelectedDays(selectedDays.filter((d) => d !== dayIndex));
    } else {
      setSelectedDays([...selectedDays, dayIndex]);
    }
  };

  const addTime = () => {
    if (times.length >= 5) {
      setNotice({ tone: 'error', text: t('schedule.limitReachedBody') });
      return;
    }
    setNotice(null);
    setTimes([...times, '08:00']);
  };

  const removeTime = (index: number) => {
    if (times.length <= 1) return;
    setTimes(times.filter((_, i) => i !== index));
  };

  const updateTimeValue = (index: number, val: string) => {
    const updated = [...times];
    updated[index] = val;
    setTimes(updated);
  };

  const handleSaveReminders = async () => {
    if (!user) return;
    setSavingReminders(true);
    try {
      // Loop through all 7 days of the week
      const reminderConfigs: ReminderConfig[] = [];
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const isEnabled = selectedDays.includes(dayIndex);

        // Convert JS/UI index (0 = Sunday) to DB index (0 = Monday)
        const dbWeekday = dayIndex === 0 ? 6 : dayIndex - 1;

        // Save to SQLite
        await saveReminder(user.id, dbWeekday, times, isEnabled ? 1 : 0, 0); // synced = 0

        reminderConfigs.push({
          weekday: dbWeekday,
          times,
          isEnabled,
        });
      }

      // Schedule alarms using Notifee helper (exact when permitted, else inexact).
      const exactOk = await isExactAlarmAllowed();
      await scheduleReminders(reminderConfigs, { requestPermission: true });

      setRemindersModalVisible(false);
      await loadData();

      // Trigger background sync to backup to Laravel backend
      syncNow(user.id).catch(() => {});

      // Saved either way - the exact-alarm permission changes the punctuality
      // of the reminders, not whether they exist. So the confirmation is the
      // same sentence in both branches; only the follow-up differs.
      //
      // Android 12+ needs the "Alarms & reminders" special access for on-time
      // delivery. Without it reminders still fire, just a few minutes late,
      // which is why this offers a route to the setting rather than blocking
      // on it.
      setNotice(
        exactOk
          ? { tone: 'ok', text: t('schedule.remindersSavedBody') }
          : {
              tone: 'ok',
              text: `${t('schedule.remindersSavedBody')} ${t('schedule.allowExactBody')}`,
              action: {
                label: t('schedule.openSettings'),
                onPress: () => openExactAlarmSettings(),
              },
            },
      );
    } catch (e) {
      console.error(e);
      setNotice({ tone: 'error', text: t('schedule.failedToSaveReminders') });
    } finally {
      setSavingReminders(false);
    }
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

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Title Row */}
        <View style={styles.titleRow}>
          <Text style={styles.pageTitle}>{t('schedule.schedule')}</Text>
        </View>
        {/* Reminders Card Link */}
        <TouchableOpacity
          style={styles.remindersCard}
          onPress={() => setRemindersModalVisible(true)}
        >
          <View style={styles.bellIconContainer}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Rect x={3} y={5} width={18} height={16} rx={3} stroke={COLORS.accent} strokeWidth={1.7} />
              <Path d="M3 9h18M8 3v4M16 3v4M12 13v3l2 1" stroke={COLORS.accent} strokeWidth={1.7} strokeLinecap="round" />
            </Svg>
          </View>
          <View style={styles.remindersInfo}>
            <Text style={styles.cardTitle}>{t('schedule.reminders')}</Text>
            <Text style={styles.cardSubtitle}>
              {activeRemindersCount > 0
                ? t('schedule.daysSet', { count: activeRemindersCount })
                : t('schedule.setTimesForYourWeek')}
            </Text>
          </View>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="M9 5l7 7-7 7" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>

        {/* Confirmations, validation and the exact-alarm ask, in the page
            and built like every other card on it - same 16pt gutter, same
            surface, same radius. The first version was full-bleed accent
            green, so the one new element on the screen was both wider than
            everything around it and the only thing wearing the accent as a
            background. Colour now carries meaning in one small mark and the
            text, which is how the rest of the app uses it. */}
        {notice && (
          <TouchableOpacity
            style={styles.notice}
            activeOpacity={notice.action ? 1 : 0.85}
            onPress={notice.action ? undefined : () => setNotice(null)}
            accessibilityRole={notice.action ? 'text' : 'button'}
            accessibilityLabel={notice.text}
          >
            <View style={styles.noticeRow}>
              <View
                style={[styles.noticeDot, notice.tone === 'error' && styles.noticeDotError]}
              />
              <Text style={styles.noticeText}>{notice.text}</Text>
            </View>
            {/* Buttons only when there is a real choice to make. "Not now"
                under "Reminders saved" would be answering a question nobody
                asked - a plain confirmation just needs a way to go away, and
                the card itself is that. */}
            {notice.action && (
              <View style={styles.noticeActions}>
                <TouchableOpacity
                  style={styles.noticeDismissBtn}
                  onPress={() => setNotice(null)}
                  accessibilityRole="button"
                >
                  <Text style={styles.noticeDismissText}>{t('schedule.notNow')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.noticeActionBtn}
                  onPress={notice.action.onPress}
                  accessibilityRole="button"
                >
                  <Text style={styles.noticeActionText}>{notice.action.label}</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Month Progress grid */}
        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <View>
              <Text style={styles.monthTitle}>{t('schedule.monthNumber', { number: position.month })}</Text>
              <Text style={styles.monthSubtitle}>
                {t('schedule.daysLeft', { count: position.days_left })}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{t('schedule.active')}</Text>
            </View>
          </View>

          <View style={styles.grid}>
            {calendarDays.map((dayItem) => {
              let dayStyle = styles.dayNormal;
              let textStyle = styles.dayTextMuted;

              if (dayItem.done) {
                dayStyle = styles.dayCompleted;
                textStyle = styles.dayTextCompleted;
              } else if (dayItem.today) {
                dayStyle = styles.dayToday;
                textStyle = styles.dayTextToday;
              }

              return (
                <View key={dayItem.n} style={styles.dayCell}>
                  <View style={[styles.dayBubble, dayStyle]}>
                    <Text style={[styles.dayLabelText, textStyle]}>{dayItem.n}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Reminders Edit Modal */}
      <Modal
        visible={remindersModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRemindersModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setRemindersModalVisible(false)}
        >
          <TouchableWithoutFeedback>
            <SafeAreaView style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setRemindersModalVisible(false)}
                >
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                    <Path d="M18 6L6 18M6 6l12 12" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" />
                  </Svg>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{t('schedule.reminders')}</Text>
                <View style={{ width: 32 }} />
              </View>

              <ScrollView contentContainerStyle={styles.modalScroll}>
                {/* Repeat on weekdays */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionLabel}>{t('schedule.repeatOn')}</Text>
                  <View style={styles.weekdayRow}>
                    {weekdayLabels(i18n.language).map((label, i) => {
                      const active = selectedDays.includes(i);
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[styles.weekdayBtn, active && styles.weekdayBtnActive]}
                          onPress={() => toggleDay(i)}
                        >
                          <Text style={[styles.weekdayBtnText, active && styles.weekdayBtnTextActive]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Times */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionLabel}>{t('schedule.sessionTimes')}</Text>
                  <View style={styles.timesList}>
                    {times.map((time, idx) => (
                      <View key={idx} style={styles.timeRow}>
                        <Text style={styles.timeRowLabel}>{t('schedule.sessionNumber', { number: idx + 1 })}</Text>

                        <TouchableOpacity
                          style={styles.timeInputContainer}
                          onPress={async () => {
                            const picked = await showTimePicker(time);
                            if (picked) {
                              updateTimeValue(idx, picked);
                            }
                          }}
                        >
                          <Svg
                            width={16}
                            height={16}
                            viewBox="0 0 24 24"
                            fill="none"
                            style={styles.timePrefixIcon}
                          >
                            <Circle cx={12} cy={12} r={9} stroke={COLORS.accent} strokeWidth={1.7} />
                            <Path
                              d="M12 7.5V12l3 1.8"
                              stroke={COLORS.accent}
                              strokeWidth={1.7}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </Svg>
                          <Text style={styles.timeInputText}>{time}</Text>
                        </TouchableOpacity>

                        {times.length > 1 && (
                          <TouchableOpacity
                            style={styles.timeRemoveBtn}
                            onPress={() => removeTime(idx)}
                          >
                            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                              <Path d="M6 12h12" stroke={COLORS.danger} strokeWidth={2} strokeLinecap="round" />
                            </Svg>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}

                    <TouchableOpacity style={styles.addTimeBtn} onPress={addTime}>
                      <Text style={styles.addTimeText}>+ {t('schedule.addTime')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Action Button */}
                <TouchableOpacity
                  style={styles.saveActionBtn}
                  onPress={handleSaveReminders}
                  disabled={savingReminders}
                >
                  {savingReminders ? (
                    <ActivityIndicator color={COLORS.onAccent} />
                  ) : (
                    <Text style={styles.saveActionBtnText}>{t('schedule.saveAddReminders')}</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </SafeAreaView>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
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
  scrollContent: {
    paddingBottom: 40,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  remindersCard: {
    marginHorizontal: 16,
    marginTop: 20,
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bellIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(193, 255, 114, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginEnd: 16,
  },
  remindersInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  cardSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  // Matches remindersCard / calendarCard exactly: same gutter, same
  // surface, same radius, same padding.
  notice: {
    marginHorizontal: 16,
    marginTop: 16,
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
  },
  noticeRow: { flexDirection: 'row', gap: SPACE.md },
  // The whole of the accent on this card, deliberately.
  noticeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: COLORS.accent,
  },
  noticeDotError: { backgroundColor: COLORS.danger },
  noticeText: { flex: 1, ...TYPE.bodySm, color: COLORS.white, lineHeight: 20 },
  noticeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACE.sm,
    marginTop: SPACE.md,
  },
  noticeActionBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
  },
  noticeActionText: { ...TYPE.bodySm, fontWeight: '700', color: COLORS.onAccent },
  noticeDismissBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
  },
  noticeDismissText: { ...TYPE.bodySm, fontWeight: '600', color: COLORS.textMuted },
  calendarCard: {
    marginHorizontal: 16,
    marginTop: 16,
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 20,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  monthSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.white,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '16.666%', // exactly 6 columns (matches grid-cols-6)
    aspectRatio: 1,
    padding: 5, // the gap between bubbles
  },
  dayBubble: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayNormal: {
    backgroundColor: COLORS.surface2,
  },
  dayCompleted: {
    backgroundColor: COLORS.accent,
  },
  dayToday: {
    backgroundColor: COLORS.white,
  },
  dayLabelText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  dayTextMuted: {
    color: COLORS.textMuted,
  },
  dayTextCompleted: {
    color: COLORS.onAccent,
  },
  dayTextToday: {
    color: '#000000',
  },

  // Modal styling
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  modalScroll: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionCard: {
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 16,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  weekdayBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.surface2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekdayBtnActive: {
    backgroundColor: COLORS.accent,
  },
  weekdayBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.textMuted,
  },
  weekdayBtnTextActive: {
    color: COLORS.onAccent,
  },
  timesList: {
    gap: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeRowLabel: {
    width: 68,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  timeInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  timePrefixIcon: {
    marginEnd: 6,
  },
  timeInputText: {
    flex: 1,
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },
  timeRemoveBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeRemoveText: {
    color: COLORS.danger,
    fontWeight: 'bold',
    fontSize: 16,
  },
  addTimeBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  addTimeText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: 'bold',
  },
  saveActionBtn: {
    height: 56,
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  saveActionBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
});
