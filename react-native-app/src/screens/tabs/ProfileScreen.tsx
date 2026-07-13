import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Watermark } from '../../components/Watermark';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS, GLASS } from '../../theme/colors';
import { LEVELS } from '../../constants/catalogues';
import { syncNow } from '../../services/sync';
import Svg, { Path, Circle } from 'react-native-svg';

export const ProfileScreen = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const { user, updateUserFields } = useAuth();
  
  const [levelModalVisible, setLevelModalVisible] = useState(false);
  const [updatingLevel, setUpdatingLevel] = useState(false);

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
      Alert.alert('Error', 'Failed to update training level.');
    } finally {
      setUpdatingLevel(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Watermark />
      {/* Title Row */}
      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>Profile</Text>
        <TouchableOpacity
          style={styles.settingsBtnInline}
          onPress={() => navigation.navigate('Settings')}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
              d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
              stroke={COLORS.textMuted}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </TouchableOpacity>
      </View>

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
          onPress={() => setLevelModalVisible(true)}
        >
          <Text style={styles.menuLabel}>Difficulty</Text>
          <View style={styles.menuRight}>
            <Text style={styles.menuValue}>{currentLevel.name}</Text>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M9 5l7 7-7 7" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => navigation.navigate('Schedule')}
        >
          <Text style={styles.menuLabel}>Schedule & reminders</Text>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M9 5l7 7-7 7" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>


      </View>

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
              <Text style={styles.levelPageTitle}>Set the difficulty of Kegel Training program</Text>
              <Text style={styles.levelPageSubtitle}>The higher the level, the harder the training</Text>
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
                        {lvl.name}
                      </Text>
                      {selected && <Text style={styles.levelRowCurrent}>Current difficulty</Text>}
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  identityContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    ...GLASS,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.textMuted,
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    marginTop: 16,
  },
  email: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  menuContainer: {
    marginHorizontal: 16,
    ...GLASS,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: 'semibold',
    color: COLORS.white,
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuValue: {
    fontSize: 14,
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
