import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Watermark } from '../../components/Watermark';
import { SettingsSections } from '../settings/SettingsScreen';
import { getAppSetting, saveAppSetting } from '../../db/queries';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS, GLASS, TYPE, SPACE, RADIUS } from '../../theme/colors';
import { LEVELS, levelNameKey } from '../../constants/catalogues';
import { syncNow } from '../../services/sync';
import {
  getVibrationStatus,
  cueSilencedReason,
  openSystemSoundSettings,
  SilencedReason,
} from '../../services/vibration';
import Svg, { Path } from 'react-native-svg';

export const ProfileScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<any>>();
  const { user, updateUserFields } = useAuth();

  const [levelModalVisible, setLevelModalVisible] = useState(false);
  const [updatingLevel, setUpdatingLevel] = useState(false);

  // Vibration during a session. `haptics_enabled` already existed in the
  // schema defaults but nothing read or wrote it, so it was a setting in name
  // only - this is the control that makes it real.
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  useEffect(() => {
    getAppSetting('haptics_enabled', '1')
      .then((v) => setHapticsEnabled(v !== '0'))
      .catch(() => {});
  }, []);

  const toggleHaptics = (next: boolean) => {
    // Optimistic: the switch must move under the finger, not after a DB write.
    setHapticsEnabled(next);
    saveAppSetting('haptics_enabled', next ? '1' : '0', 'bool').catch(() => {});
  };

  // A switch that says "on" while the phone stays silent is the reason
  // vibration gets reported as broken. The cue is an untagged one-shot, so the
  // "Touch feedback" setting does not govern it - but missing hardware and the
  // system-wide vibration switch still do, and neither is visible from here
  // without asking. Re-checked on focus so returning from system settings
  // clears the warning instead of stranding it until the next cold start.
  const [silenced, setSilenced] = useState<SilencedReason>('none');
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getVibrationStatus()
        .then((status) => {
          if (!cancelled) setSilenced(cueSilencedReason(status));
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Every hook above this line. The guard used to sit directly under the
  // useAuth call with three more hooks below it, so the render that first
  // saw `user` as null (a logout while this tab is mounted, or the frame
  // before the profile loads) ran a different number of hooks than the one
  // before it - which React treats as a hook-order violation, not as an
  // early return.
  if (!user) return null;

  const currentLevel = LEVELS[user.level_id] || LEVELS[1];
  const initials = user.name ? user.name.slice(0, 1).toUpperCase() : 'K';

  const handleSelectLevel = async (levelNumber: number) => {
    setUpdatingLevel(true);
    try {
      // 1. Update auth context and SQLite locally
      await updateUserFields({ level_id: levelNumber });

      // 2. Trigger instant push sync to backend so server knows about the change immediately
      await syncNow(user.id);

      setLevelModalVisible(false);
    } catch (e) {
      console.error(e);
      Alert.alert(t('profile.errorTitle'), t('profile.failedToUpdateLevel'));
    } finally {
      setUpdatingLevel(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Watermark />
      {/* Title Row */}
      {/* No gear here any more: it opened a screen that was itself just a list
          of settings, so everything it held now lives below. */}
      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>{t('profile.profile')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
      {/* Identity Profile Details */}
      <View style={styles.identityContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.email}>{user.email}</Text>
      </View>

      {/* Menu Options List */}
      <View style={styles.menuContainer}>
        <TouchableOpacity
          style={styles.menuRow}
          accessibilityRole="button"
          activeOpacity={0.85}
          onPress={() => setLevelModalVisible(true)}
        >
          <Text style={styles.menuLabel}>{t('profile.difficulty')}</Text>
          <View style={styles.menuRight}>
            <Text style={styles.menuValue}>{t(levelNameKey(currentLevel.number))}</Text>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M9 5l7 7-7 7" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuRow}
          accessibilityRole="button"
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Schedule')}
        >
          <Text style={styles.menuLabel}>{t('profile.scheduleReminders')}</Text>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M9 5l7 7-7 7" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>

        {/* A row, not a link: the whole point is that it is one tap. */}
        <View style={styles.menuRow}>
          {/* "Haptics", not "Vibration". The row toggles the app's own cue,
              while the phone has a system vibration switch of its own that can
              silence it - two things called the same thing, one of which the
              app cannot control. The hint now states the dependency up front
              rather than leaving it to the warning that only appears once the
              cue has already failed to be felt. */}
          <View style={styles.vibrationLabel}>
            <Text style={styles.menuLabel}>{t('profile.haptics')}</Text>
            <Text style={styles.menuHint}>{t('profile.hapticsHint')}</Text>
          </View>
          <Switch
            value={hapticsEnabled}
            onValueChange={toggleHaptics}
            trackColor={{ false: 'rgba(242, 245, 238, 0.16)', true: COLORS.accent }}
            thumbColor={COLORS.white}
            accessibilityLabel={t('profile.haptics')}
          />
        </View>

        {/* Only when the switch is on: with it off, nothing is expected to
            buzz and the phone's own setting is beside the point. */}
        {hapticsEnabled && silenced === 'systemOff' ? (
          <TouchableOpacity
            style={styles.vibrationNotice}
            accessibilityRole="button"
            activeOpacity={0.85}
            onPress={() => {
              openSystemSoundSettings().catch(() => {});
            }}
          >
            <Text style={styles.vibrationNoticeText}>
              {t('profile.vibrationSilencedBySystem')}
            </Text>
            <Text style={styles.vibrationNoticeLink}>
              {t('profile.openSystemSettings')}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* No vibrator at all: stating it is honest, but there is nothing to
            tap through to, so this one is not a button. */}
        {hapticsEnabled && silenced === 'noHardware' ? (
          <View style={styles.vibrationNotice}>
            <Text style={styles.vibrationNoticeText}>
              {t('profile.vibrationNoHardware')}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Everything the gear used to hide. */}
      <SettingsSections />
      </ScrollView>

      {/* Difficulty level selector - full page, matches the web /levels screen */}
      <Modal
        visible={levelModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setLevelModalVisible(false)}
      >
        <SafeAreaView style={styles.levelPage}>
          <View style={styles.levelHeader}>
            <TouchableOpacity
              style={styles.levelBackBtn}
              onPress={() => setLevelModalVisible(false)}
            >
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path d="M15 6l-6 6 6 6" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.levelScroll}>
            <View style={styles.levelIntro}>
              <Text style={styles.levelPageTitle}>{t('profile.setTheDifficultyOfKegel')}</Text>
              <Text style={styles.levelPageSubtitle}>{t('profile.theHigherTheLevelThe')}</Text>
            </View>

            <View style={styles.levelList}>
              {Object.values(LEVELS).map((lvl) => {
                const selected = lvl.number === user.level_id;
                return (
                  <TouchableOpacity
                    key={lvl.number}
                    style={[styles.levelRow, selected ? styles.levelRowSelected : styles.levelRowIdle]}
                    onPress={() => handleSelectLevel(lvl.number)}
                    disabled={updatingLevel}
                    activeOpacity={0.85}
                  >
                    <View style={styles.laurelBadge}>
                      <Svg width={40} height={40} viewBox="0 0 48 48" style={styles.laurelSvg}>
                        <Path d="M14 12c-5 4-5 18 2 24" fill="none" stroke="#c2c7cf" strokeWidth={2} strokeLinecap="round" />
                        <Path d="M34 12c5 4 5 18-2 24" fill="none" stroke="#c2c7cf" strokeWidth={2} strokeLinecap="round" />
                      </Svg>
                      <Text style={styles.laurelNumber}>{lvl.number}</Text>
                    </View>

                    <View style={styles.levelRowInfo}>
                      <Text style={[styles.levelRowName, selected && styles.levelRowNameSelected]}>
                        {t(levelNameKey(lvl.number))}
                      </Text>
                      {selected && <Text style={styles.levelRowCurrent}>{t('profile.currentDifficulty')}</Text>}
                    </View>

                    {updatingLevel && selected ? (
                      <ActivityIndicator color={COLORS.onAccent} size="small" />
                    ) : (
                      <View style={[styles.levelRadio, selected ? styles.levelRadioSelected : styles.levelRadioIdle]}>
                        {selected && <View style={styles.levelRadioDot} />}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  vibrationLabel: { flex: 1, paddingRight: 12 },
  vibrationNotice: {
    marginTop: SPACE.sm,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface2,
    gap: SPACE.xs,
  },
  vibrationNoticeText: { ...TYPE.bodySm, color: COLORS.textMuted, lineHeight: 19 },
  vibrationNoticeLink: { ...TYPE.bodySm, color: COLORS.accent, fontWeight: '700' },
  menuHint: { fontSize: 12.5, color: COLORS.textDim, marginTop: 2 },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  settingsBtnInline: {
    // 36px sat under both the iOS HIG and Material minimum target.
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...GLASS,
  },
  pageTitle: {
    ...TYPE.display,
    color: COLORS.white,
  },
  identityContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    // The identity mark is the one place on this screen worth accenting.
    borderColor: 'rgba(193, 255, 114, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: COLORS.accent,
  },
  name: {
    ...TYPE.heading,
    color: COLORS.white,
    marginTop: SPACE.lg,
  },
  email: {
    ...TYPE.bodySm,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  menuContainer: {
    marginHorizontal: SPACE.lg,
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg + 4,
    paddingVertical: 16,
    // Rows sit on a consistent rhythm rather than sizing to their content.
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: COLORS.white,
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuValue: {
    ...TYPE.bodySm,
    color: COLORS.textMuted,
  },

  // Level selector - full page matching the web /levels screen
  levelPage: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  levelBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelScroll: {
    paddingBottom: 96,
  },
  levelIntro: {
    paddingHorizontal: 24,
  },
  levelPageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    lineHeight: 30,
  },
  levelPageSubtitle: {
    marginTop: 8,
    fontSize: 15,
    color: COLORS.textMuted,
  },
  levelList: {
    marginTop: 24,
    paddingHorizontal: 16,
    gap: 12,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  levelRowIdle: {
    ...GLASS,
    backgroundColor: COLORS.surface,
  },
  levelRowSelected: {
    backgroundColor: COLORS.accent,
  },
  laurelBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  laurelSvg: {
    position: 'absolute',
  },
  laurelNumber: {
    color: '#e9ebee',
    fontSize: 15,
    fontWeight: '700',
  },
  levelRowInfo: {
    flex: 1,
  },
  levelRowName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  levelRowNameSelected: {
    color: COLORS.onAccent,
  },
  levelRowCurrent: {
    marginTop: 2,
    fontSize: 13,
    color: COLORS.onAccent,
    opacity: 0.8,
  },
  levelRadio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelRadioIdle: {
    borderColor: 'rgba(255,255,255,0.25)',
  },
  levelRadioSelected: {
    borderColor: COLORS.onAccent,
  },
  levelRadioDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.onAccent,
  },
});
