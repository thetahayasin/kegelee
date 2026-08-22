import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Linking,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp, useIsFocused } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../theme/colors';
import { api } from '../../services/api';
import { getAppSetting, clearUserData } from '../../db/queries';
import { getDBConnection } from '../../db/sqlite';
import Svg, { Path, Circle } from 'react-native-svg';
import { Watermark } from '../../components/Watermark';

export const SettingsScreen = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const isFocused = useIsFocused();
  const { user, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [manageUrl, setManageUrl] = useState<string | null>(null);

  // Modals state
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'warn' | 'code'>('warn');
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const closeResetModal = () => {
    setResetModalVisible(false);
    setResetError('');
  };

  const closeDeleteModal = () => {
    setDeleteModalVisible(false);
    setDeleteError('');
    setDeleteCode('');
    setDeleteStep('warn');
  };

  const loadData = async () => {
    if (!user) return;
    try {
      const db = await getDBConnection();

      // 1. Fetch published pages
      const pagesRes = await db.executeSql(
        'SELECT id, title, slug FROM pages ORDER BY sort_order'
      );
      const pagesList = [];
      for (let i = 0; i < pagesRes[0].rows.length; i++) {
        pagesList.push(pagesRes[0].rows.item(i));
      }
      setPages(pagesList);

      // 2. Fetch subscription status
      const subRes = await db.executeSql(
        'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [user.id]
      );
      if (subRes[0].rows.length > 0) {
        const sub = subRes[0].rows.item(0);
        setSubscription(sub);

        if (sub.status === 'active' || sub.status === 'trialing') {
          const packageName = await getAppSetting('google_play_package_name', 'com.kegelee.app');
          setManageUrl(`https://play.google.com/store/account/subscriptions?package=${packageName}`);
        }
      } else {
        setSubscription(null);
        setManageUrl(null);
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
  }, [isFocused]);

  const handleResetProgress = async () => {
    setResetError('');
    setResetLoading(true);
    // Call server to reset first
    const res = await api.resetProgress();
    if (res.ok && res.data?.success) {
      // Clear local database rows
      await clearUserData();
      setResetLoading(false);
      setResetModalVisible(false);
      Alert.alert('Reset Successful', 'Your training progress has been cleared.');
      navigation.navigate('MainTabs');
    } else {
      setResetLoading(false);
      setResetError(res.error || 'Failed to reset progress. Please check internet connection.');
    }
  };

  const handleSendDeleteCode = async () => {
    setDeleteError('');
    setDeleteLoading(true);
    const res = await api.deleteAccountCode();
    setDeleteLoading(false);
    if (res.ok) {
      setDeleteStep('code');
    } else {
      setDeleteError(res.error || 'Failed to send delete code. Please check internet connection.');
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError('');
    if (!deleteCode || deleteCode.length !== 6) {
      setDeleteError('Please enter the 6-digit code.');
      return;
    }
    setDeleteLoading(true);
    const res = await api.deleteAccount(deleteCode);
    setDeleteLoading(false);
    if (res.ok) {
      await clearUserData();
      await logout();
      setDeleteModalVisible(false);
      Alert.alert('Deleted', 'Your account has been permanently deleted.');
    } else {
      setDeleteError(res.error || 'Failed to delete account.');
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
    <SafeAreaView style={styles.container}>
      <Watermark />
      {/* Title Row */}
      <View style={styles.titleRow}>
        <TouchableOpacity style={styles.backBtnInline} onPress={() => navigation.goBack()}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M15 19l-7-7 7-7" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Subscription section */}
        <Text style={styles.sectionLabel}>Subscription</Text>
        <View style={styles.menuContainer}>
          {subscription ? (
            <View style={styles.subRow}>
              <Text style={styles.menuText}>Subscription Status</Text>
              <View style={[styles.badge, subscription.status === 'trialing' ? styles.badgeTrial : styles.badgeActive]}>
                <Text style={[styles.badgeText, subscription.status === 'trialing' ? styles.badgeTextTrial : styles.badgeTextActive]}>
                  {subscription.status === 'trialing' ? 'Free trial' : 'Active'}
                </Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.menuRow}>
              <Text style={styles.menuText}>No active subscription</Text>
              <View style={styles.badgeActive}>
                <Text style={styles.badgeTextActive}>Subscribe</Text>
              </View>
            </TouchableOpacity>
          )}

          {manageUrl && (
            <TouchableOpacity
              style={[styles.menuRow, styles.borderTop]}
              onPress={() => Linking.openURL(manageUrl)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.menuText}>Cancel subscription</Text>
                <Text style={styles.menuSubtext}>
                  Opens Google Play (the only place to cancel or turn off auto-renew).
                </Text>
              </View>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"
                  stroke={COLORS.textMuted}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </TouchableOpacity>
          )}
        </View>

        {/* Legal Pages section */}
        {pages.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Terms</Text>
            <View style={styles.menuContainer}>
              {pages.map((p, idx) => (
                <TouchableOpacity
                  key={p.slug}
                  style={[styles.menuRow, idx > 0 && styles.borderTop]}
                  onPress={() => navigation.navigate('LegalPage', { slug: p.slug, title: p.title })}
                >
                  <Text style={styles.menuText}>{p.title}</Text>
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                    <Path d="M9 5l7 7-7 7" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Standalone actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => {
              setResetError('');
              setResetModalVisible(true);
            }}
          >
            <Text style={styles.deleteBtnText}>Reset progress</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.logoutBtn]}
            onPress={logout}
          >
            <Text style={styles.logoutBtnText}>Log out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => {
              setDeleteError('');
              setDeleteStep('warn');
              setDeleteCode('');
              setDeleteModalVisible(true);
            }}
          >
            <Text style={styles.deleteBtnText}>Delete account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Reset Progress Modal */}
      <Modal
        visible={resetModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeResetModal}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeResetModal}
        >
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Reset progress?</Text>

              {resetError ? (
                <View style={styles.errorContainer}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M12 9v4M12 17h.01M10.3 4.3 2.5 18a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z"
                      stroke={COLORS.danger}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                  <Text style={styles.errorText}>{resetError}</Text>
                </View>
              ) : null}

              <Text style={styles.modalBody}>
                This will clear your training days, sessions, measurements and knowledge progress. This action cannot be undone.
              </Text>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                  onPress={closeResetModal}
                  disabled={resetLoading}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalConfirmDeleteBtn]}
                  onPress={handleResetProgress}
                  disabled={resetLoading}
                >
                  {resetLoading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.modalConfirmDeleteBtnText}>Reset</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* Delete Account Modal */}
      <Modal
        visible={deleteModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeDeleteModal}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeDeleteModal}
        >
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Delete account?</Text>

              {deleteError ? (
                <View style={styles.errorContainer}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M12 9v4M12 17h.01M10.3 4.3 2.5 18a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z"
                      stroke={COLORS.danger}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                  <Text style={styles.errorText}>{deleteError}</Text>
                </View>
              ) : null}

              {deleteStep === 'warn' ? (
                <>
                  <Text style={styles.modalBody}>
                    This permanently deletes your account and all of your data: training days, sessions, measurements, and progress. This <Text style={{ fontWeight: 'bold', color: COLORS.white }}>cannot be undone</Text>.
                  </Text>
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                      This does <Text style={{ fontWeight: 'bold' }}>not</Text> cancel your Google Play subscription. Cancel it in Google Play first to stop being billed.
                    </Text>
                  </View>

                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalCancelBtn]}
                      onPress={closeDeleteModal}
                      disabled={deleteLoading}
                    >
                      <Text style={styles.modalCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalDeleteBtn]}
                      onPress={handleSendDeleteCode}
                      disabled={deleteLoading}
                    >
                      {deleteLoading ? (
                        <ActivityIndicator color={COLORS.white} />
                      ) : (
                        <Text style={styles.modalDeleteBtnText}>Send code</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.modalBody}>
                    We emailed a 6-digit code to <Text style={{ fontWeight: 'bold', color: COLORS.white }}>{user?.email}</Text>. Enter it to permanently delete your account.
                  </Text>

                  <TextInput
                    style={styles.deleteInput}
                    value={deleteCode}
                    placeholder="000000"
                    placeholderTextColor={COLORS.textMuted}
                    onChangeText={(val) => setDeleteCode(val.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                  />

                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalCancelBtn]}
                      onPress={closeDeleteModal}
                      disabled={deleteLoading}
                    >
                      <Text style={styles.modalCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalConfirmDeleteBtn]}
                      onPress={handleDeleteAccount}
                      disabled={deleteLoading}
                    >
                      {deleteLoading ? (
                        <ActivityIndicator color={COLORS.white} />
                      ) : (
                        <Text style={styles.modalConfirmDeleteBtnText}>Delete permanently</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
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
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  backBtnInline: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  sectionLabel: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
  },
  menuContainer: {
    marginHorizontal: 16,
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
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.03)',
  },
  menuText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  menuSubtext: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeTrial: {
    backgroundColor: 'rgba(193, 255, 114, 0.15)',
  },
  badgeActive: {
    backgroundColor: 'rgba(193, 255, 114, 0.15)', // Same accent styling
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  badgeTextTrial: {
    color: COLORS.accentSoft,
  },
  badgeTextActive: {
    color: COLORS.accent,
  },
  actionsContainer: {
    marginTop: 36,
    paddingHorizontal: 20,
    gap: 12,
  },
  actionBtn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  logoutBtn: {
    backgroundColor: COLORS.accent,
  },
  logoutBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  deleteBtn: {
    backgroundColor: 'rgba(255, 77, 77, 0.05)',
    borderColor: 'rgba(255, 77, 77, 0.3)',
    borderWidth: 1,
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.danger,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  warningBox: {
    backgroundColor: 'rgba(255, 77, 77, 0.1)',
    borderColor: 'rgba(255, 77, 77, 0.25)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  warningText: {
    fontSize: 12,
    color: COLORS.danger,
    lineHeight: 18,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelBtn: {
    backgroundColor: COLORS.surface2,
  },
  modalCancelBtnText: {
    color: COLORS.white,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    backgroundColor: COLORS.accent,
  },
  modalConfirmBtnText: {
    color: COLORS.onAccent,
    fontWeight: 'bold',
  },
  modalDeleteBtn: {
    backgroundColor: COLORS.danger,
    shadowColor: COLORS.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  modalDeleteBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  deleteInput: {
    height: 52,
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    color: COLORS.white,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 10,
    marginBottom: 20,
  },
  modalConfirmDeleteBtn: {
    backgroundColor: COLORS.danger,
    shadowColor: COLORS.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  modalConfirmDeleteBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 77, 77, 0.1)',
    borderColor: 'rgba(255, 77, 77, 0.25)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 10,
  },
  errorText: {
    flex: 1,
    color: COLORS.danger,
    fontSize: 14,
    lineHeight: 18,
  },
});
