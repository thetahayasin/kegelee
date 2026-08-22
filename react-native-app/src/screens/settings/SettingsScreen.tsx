import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Linking,
  TouchableWithoutFeedback,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp, useIsFocused } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../theme/colors';
import { api } from '../../services/api';
import { getAppSetting, clearUserData, getActiveSubscription } from '../../db/queries';
import { planBySlug } from '../../constants/plans';
import { getRevenueCatManagementUrl } from '../../services/billing';
import { getDBConnection } from '../../db/sqlite';
import Svg, { Path } from 'react-native-svg';
import { Watermark } from '../../components/Watermark';

export const SettingsScreen = () => {
  const { t } = useTranslation();
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

      // 2. Fetch subscription status - the ACTIVE subscription (an entitled
      // trialing/active one, or a canceled one whose paid period hasn't
      // ended), exactly like the web Settings' activeSubscription().
      const sub = await getActiveSubscription(user.id);
      setSubscription(sub);

      // Subscription management deep link (RevenueCat customer management URL or store deep link)
      if (sub) {
        const rcUrl = await getRevenueCatManagementUrl(user.id).catch(() => null);
        if (rcUrl) {
          setManageUrl(rcUrl);
        } else if (sub.store === 'google_play') {
          const packageName = await getAppSetting('google_play_package_name', 'com.kegelee.app');
          const sku = planBySlug(sub.plan_slug)?.store_product_id;
          setManageUrl(
            'https://play.google.com/store/account/subscriptions' +
              (sku && packageName ? `?sku=${sku}&package=${packageName}` : ''),
          );
        } else {
          setManageUrl('https://play.google.com/store/account/subscriptions');
        }
      } else {
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
    // Intentionally keyed to focus/mount only: loadData is recreated every
    // render, so listing it here would refetch in a loop. Wrap it in
    // useCallback before adding it to these deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Present the REAL subscription state rather than a fixed "Active" badge.
  // Every field here is synced from the backend, which derives it from
  // RevenueCat webhooks - so a cancellation, trial or billing failure shows
  // truthfully, and access is never implied to end before RevenueCat says so.
  const formatSubDate = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const subStatus = String(subscription?.status || '').toLowerCase();
  const subEnds = formatSubDate(subscription?.ends_at ?? null);
  const subRenews = Number(subscription?.auto_renewing) === 1;

  let subscriptionLabel = 'Active';
  let subscriptionDetail = '';

  if (subStatus === 'trialing') {
    subscriptionLabel = 'Trial';
    const trialEnds = formatSubDate(subscription?.trial_ends_at ?? null) || subEnds;
    subscriptionDetail = subRenews
      ? trialEnds && `Free trial ends ${trialEnds}, then billing starts.`
      : trialEnds && `Free trial ends ${trialEnds}. It will not renew.`;
  } else if (subStatus === 'past_due') {
    subscriptionLabel = 'Payment issue';
    subscriptionDetail =
      'There is an issue with your subscription payment. Please update your payment method in Google Play.';
  } else if (subStatus === 'canceled') {
    subscriptionLabel = 'Cancelled';
    subscriptionDetail = subEnds
      ? `Cancelled. Your access remains active until ${subEnds}.`
      : 'Cancelled. Your access remains active until the end of the paid period.';
  } else if (subStatus === 'expired') {
    subscriptionLabel = 'Expired';
    subscriptionDetail = 'Your subscription has ended.';
  } else if (subEnds) {
    subscriptionDetail = subRenews
      ? `Renews on ${subEnds}.`
      : `Auto-renewal is off. Access ends ${subEnds}.`;
  }

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
        <Text style={styles.pageTitle}>{t('settings.settings')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Subscription section */}
        <Text style={styles.sectionLabel}>{t('settings.subscription')}</Text>
        <View style={styles.menuContainer}>
          {subscription ? (
            // Tappable so a subscriber can reach the plan switcher. The paywall
            // doubles as "Manage Plan" and owns the RevenueCat product-change
            // flow (upgrade prorates immediately, downgrade defers to period
            // end). Without this route that flow is unreachable in-app and the
            // only way to change plan is leaving for Google Play.
            <TouchableOpacity
              style={styles.subRow}
              onPress={() => navigation.navigate('Paywall')}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.menuText}>{t('settings.subscription')}</Text>
                <Text style={styles.menuSubtext}>
                  {subscriptionDetail ? subscriptionDetail + ' - tap to change plan' : 'Tap to change plan'}
                </Text>
              </View>
              <View style={[styles.badge, styles.badgeActive]}>
                <Text style={[styles.badgeText, styles.badgeTextActive]}>
                  {subscriptionLabel}
                </Text>
              </View>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M9 18l6-6-6-6"
                  stroke={COLORS.textMuted}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => navigation.navigate('Paywall')}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.menuText}>{t('settings.noActiveSubscription')}</Text>
                <Text style={styles.menuSubtext}>{t('settings.subscribeToUnlockFullAccess')}</Text>
              </View>
              <View style={styles.subscribePill}>
                <Text style={styles.subscribePillText}>{t('settings.subscribe')}</Text>
              </View>
            </TouchableOpacity>
          )}

          {manageUrl && (
            <TouchableOpacity
              style={[styles.menuRow, styles.borderTop]}
              onPress={() => Linking.openURL(manageUrl)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.menuText}>{t('settings.manageSubscription')}</Text>
                <Text style={styles.menuSubtext}>
                  {subStatus === 'past_due'
                    ? 'Update your payment method in Google Play.'
                    : 'Opens Google Play to change plan, cancel, or turn off auto-renew.'}
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
            <Text style={styles.sectionLabel}>{t('settings.terms')}</Text>
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

        {/* Standalone actions, ordered by consequence: the routine one first,
            the irreversible one last and visually set apart. Previously Log out
            was the loudest button on the page (solid accent, the app's primary
            CTA colour) sitting between two identical red buttons, so "clear my
            progress" and "destroy my account" read as the same weight. */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.logoutBtn]}
            onPress={logout}
          >
            <Text style={styles.logoutBtnText}>{t('settings.logOut')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.resetBtn]}
            onPress={() => {
              setResetError('');
              setResetModalVisible(true);
            }}
          >
            <Text style={styles.resetBtnText}>{t('settings.resetProgress')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn, styles.deleteBtnSpaced]}
            onPress={() => {
              setDeleteError('');
              setDeleteStep('warn');
              setDeleteCode('');
              setDeleteModalVisible(true);
            }}
          >
            <Text style={styles.deleteBtnText}>{t('settings.deleteAccount')}</Text>
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
              <Text style={styles.modalTitle}>{t('settings.resetProgress2')}</Text>

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
                  <Text style={styles.modalCancelBtnText}>{t('settings.cancel')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalConfirmDeleteBtn]}
                  onPress={handleResetProgress}
                  disabled={resetLoading}
                >
                  {resetLoading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.modalConfirmDeleteBtnText}>{t('settings.reset')}</Text>
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
              <Text style={styles.modalTitle}>{t('settings.deleteAccount2')}</Text>

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
                      {t('settings.thisDoes')} <Text style={{ fontWeight: 'bold' }}>not</Text> cancel your active app store or RevenueCat subscription. Cancel it in your subscription settings first to stop being billed.
                    </Text>
                  </View>

                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalCancelBtn]}
                      onPress={closeDeleteModal}
                      disabled={deleteLoading}
                    >
                      <Text style={styles.modalCancelBtnText}>{t('settings.cancel')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalDeleteBtn]}
                      onPress={handleSendDeleteCode}
                      disabled={deleteLoading}
                    >
                      {deleteLoading ? (
                        <ActivityIndicator color={COLORS.white} />
                      ) : (
                        <Text style={styles.modalDeleteBtnText}>{t('settings.sendCode')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.modalBody}>
                    {t('settings.weEmailedA6Digit')} <Text style={{ fontWeight: 'bold', color: COLORS.white }}>{user?.email}</Text>. Enter it to permanently delete your account.
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
                      <Text style={styles.modalCancelBtnText}>{t('settings.cancel')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalConfirmDeleteBtn]}
                      onPress={handleDeleteAccount}
                      disabled={deleteLoading}
                    >
                      {deleteLoading ? (
                        <ActivityIndicator color={COLORS.white} />
                      ) : (
                        <Text style={styles.modalConfirmDeleteBtnText}>{t('settings.deletePermanently')}</Text>
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
    // The label column is flex:1, so without a gap it grows until it touches
    // the trailing chevron / external-link icon.
    gap: 14,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 14,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.03)',
  },
  menuText: {
    fontSize: 15,
    fontWeight: 'semibold',
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
  badgeActive: {
    backgroundColor: 'rgba(193, 255, 114, 0.15)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  badgeTextActive: {
    color: COLORS.accent,
  },
  subscribePill: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  subscribePillText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.onAccent,
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
  // Neutral, not the accent CTA: signing out is routine, not the thing the
  // page most wants you to do.
  logoutBtn: {
    backgroundColor: COLORS.surface2,
  },
  logoutBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  // Cautionary, not destructive: progress can be rebuilt, an account cannot.
  resetBtn: {
    backgroundColor: 'transparent',
    borderColor: COLORS.whiteFaint,
    borderWidth: 1,
  },
  resetBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.whiteMuted,
  },
  // Extra air above the only irreversible action on the screen.
  deleteBtnSpaced: {
    marginTop: 8,
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
    fontWeight: 'semibold',
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
