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
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp, useIsFocused } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { Palette, TYPE, SPACE, RADIUS } from '../../theme/colors';
import {
  ThemeMode,
  useTheme,
  useThemeMode,
  useThemedStyles,
} from '../../theme/ThemeContext';
import { LanguagePicker } from '../../components/LanguagePicker';
import i18n, { LanguageTag, SUPPORTED_LANGUAGES } from '../../i18n';
import { api } from '../../services/api';
import { requestAppleAuthorization } from '../../services/appleAuth';
import { clearProgressData } from '../../db/queries';
import { entitledSubscription } from '../../services/entitlement';
import { manageSubscriptionUrl } from '../../services/billing';
import { syncNow } from '../../services/sync';
import { getDBConnection } from '../../db/sqlite';
import { formatSubscriptionDate } from '../../utils/localDate';
import Svg, { Path } from 'react-native-svg';
import { Chevron } from '../../components/Chevron';
import { Watermark } from '../../components/Watermark';
import { track } from '../../services/events';

/**
 * Written out rather than built as `settings.appearance_${mode}`, so that a
 * grep for a key finds it and the locale audit can see it is in use. An
 * interpolated key is invisible to both.
 */
/**
 * Where "contact support" actually goes.
 *
 * Six strings across the app tell the reader to contact support and none of
 * them said how. One address, in one place, so the row and any future link
 * cannot disagree.
 */
const SUPPORT_EMAIL = 'support@kegelee.com';

/**
 * The legal pages the app links to by slug, for before the content sync has
 * run. Same slugs the paywall and the sign-up screen use.
 */
const FALLBACK_LEGAL_PAGES = [
  { slug: 'terms', title: '' },
  { slug: 'privacy-policy', title: '' },
];
const FALLBACK_LEGAL_TITLE_KEYS: Record<string, string> = {
  terms: 'register.terms',
  'privacy-policy': 'register.privacyPolicy',
};

const APPEARANCE_KEYS: Record<ThemeMode, string> = {
  system: 'settings.appearanceSystem',
  light: 'settings.appearanceLight',
  dark: 'settings.appearanceDark',
};

interface SettingsSectionsProps {
  /**
   * Rendered directly after the subscription section.
   *
   * The Profile tab has three rows of its own - difficulty, reminders,
   * haptics - which used to sit ABOVE this whole component, putting the
   * subscription row below them and below the fold. Moving the component up
   * instead would have put Log out and Delete account above them, which is
   * worse. Threading the rows through here puts the subscription first and
   * leaves everything else in a sensible order, with one data load.
   */
  afterSubscription?: React.ReactNode;
}

export const SettingsSections: React.FC<SettingsSectionsProps> = ({
  afterSubscription,
}) => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode();
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<any>>();
  const isFocused = useIsFocused();
  const { user, logout, subscribed } = useAuth();

  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [manageUrl, setManageUrl] = useState<string | null>(null);

  // Modals state
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'warn' | 'code'>('warn');
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const openSupportEmail = () => {
    const subject = encodeURIComponent(t('settings.supportEmailSubject'));
    // The account id, because the first thing support has to do is find the
    // account, and asking for it in the reply costs a round trip.
    const body = encodeURIComponent(
      t('settings.supportEmailBody', { id: user?.id ?? '-' }),
    );
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(
      () => {
        // No mail app configured. The address is on screen beside the row, so
        // the reader still has what they need.
        Alert.alert(t('settings.contactSupport'), SUPPORT_EMAIL);
      },
    );
  };

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

      /**
       * 2. The row behind the badge - its plan, dates and renewal state.
       *
       * WHETHER to show an active card is `subscribed` from the auth context,
       * not the presence of this row. The two can differ, and when they did
       * this screen was the one that looked broken: an account entitled by the
       * backend's own verdict, or by a purchase whose row had not landed yet,
       * saw "No active subscription" here while every premium feature in the
       * app was open. Both now come from the same resolver, so the card and
       * the rest of the app cannot contradict each other; this row only fills
       * in the detail when there is one to show.
       */
      const sub = await entitledSubscription(user.id, !!user.is_admin);
      setSubscription(sub);

      // Settings and the paywall share the store-aware cancellation route.
      setManageUrl(
        subscribed ? await manageSubscriptionUrl(user.id, sub?.plan_slug) : null,
      );
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
    // `subscribed` belongs here: it decides which card is drawn, so the screen
    // has to re-read the row when the gate moves under it - a purchase, an
    // expiry noticed while this screen is on top.
    // Otherwise intentionally keyed to focus/mount only: loadData is recreated
    // every render, so listing it here would refetch in a loop. Wrap it in
    // useCallback before adding it to these deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, subscribed]);

  const handleResetProgress = async () => {
    if (!user) return;
    setResetError('');
    setResetLoading(true);
    try {
      // Call server to reset first
      const res = await api.resetProgress();
      if (res.ok && res.data?.success) {
        // clearProgressData, NOT clearUserData.
        //
        // clearUserData wipes the whole local database - the user row and the
        // session token with it - so "Reset progress" quietly signed the
        // account out and dropped it back at the login screen, having promised
        // only to clear training days. The account stays; the progress goes.
        await clearProgressData(user.id);
        // Push the cleared state up so the next device to sync does not hand
        // the deleted days straight back.
        syncNow(user.id).catch(() => {});
        setResetModalVisible(false);
        Alert.alert(t('settings.resetSuccessTitle'), t('settings.resetSuccessBody'));
        navigation.navigate('MainTabs');
      } else {
        setResetError(res.error || t('settings.failedToResetProgress'));
      }
    } catch (e) {
      console.error('Failed to reset progress', e);
      setResetError(t('settings.failedToResetProgress'));
    } finally {
      setResetLoading(false);
    }
  };

  const handleSendDeleteCode = async () => {
    setDeleteError('');
    setDeleteLoading(true);
    try {
      const res = await api.deleteAccountCode(Platform.OS);
      if (!res.ok) throw new Error(res.error || t('settings.failedToSendDeleteCode'));
      if (res.data?.requires_apple_auth) {
        const authorization = await requestAppleAuthorization('delete');
        if (!authorization) return;
        const deleted = await api.appleDelete(authorization);
        if (!deleted.ok) throw new Error(deleted.error || t('settings.failedToDeleteAccount'));
        await logout();
        setDeleteModalVisible(false);
        Alert.alert(t('settings.deletedTitle'), t('settings.deletedBody'));
      } else {
        setDeleteStep('code');
      }
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : t('settings.failedToDeleteAccount'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError('');
    if (!deleteCode || deleteCode.length !== 6) {
      setDeleteError(t('settings.enterSixDigitCode'));
      return;
    }
    setDeleteLoading(true);
    const res = await api.deleteAccount(deleteCode);
    setDeleteLoading(false);
    if (res.ok) {
      // `logout` already calls clearUserData; doing it here too meant wiping
      // the database, then signing out of the row that had just been deleted.
      await logout();
      setDeleteModalVisible(false);
      Alert.alert(t('settings.deletedTitle'), t('settings.deletedBody'));
    } else {
      setDeleteError(res.error || t('settings.failedToDeleteAccount'));
    }
  };

  // Present the REAL subscription state rather than a fixed "Active" badge.
  // Every field here is synced from the backend, which derives it from
  // RevenueCat webhooks - so a cancellation, trial or billing failure shows
  // truthfully, and access is never implied to end before RevenueCat says so.
  // Shared with the home screen's subscription banner - see localDate.

  const subStatus = String(subscription?.status || '').toLowerCase();
  const subEnds = formatSubscriptionDate(subscription?.ends_at ?? null);
  const subRenews = Number(subscription?.auto_renewing) === 1;

  let subscriptionLabel = t('settings.subActive');
  let subscriptionDetail = '';

  if (subStatus === 'trialing') {
    subscriptionLabel = t('settings.subTrial');
    const trialEnds = formatSubscriptionDate(subscription?.trial_ends_at ?? null) || subEnds;
    subscriptionDetail = subRenews
      ? trialEnds && t('settings.trialEndsThenBilling', { date: trialEnds })
      : trialEnds && t('settings.trialEndsNoRenew', { date: trialEnds });
  } else if (subStatus === 'past_due') {
    subscriptionLabel = t('settings.subPaymentIssue');
    subscriptionDetail = t(Platform.OS === 'ios' ? 'settings.paymentIssueDetailApple' : 'settings.paymentIssueDetail');
  } else if (subStatus === 'canceled') {
    subscriptionLabel = t('settings.subCancelled');
    subscriptionDetail = subEnds
      ? t('settings.cancelledUntilDate', { date: subEnds })
      : t('settings.cancelledUntilPeriodEnd');
  } else if (subStatus === 'expired') {
    subscriptionLabel = t('settings.subExpired');
    subscriptionDetail = t('settings.expiredDetail');
  } else if (subEnds) {
    subscriptionDetail = subRenews
      ? t('settings.renewsOn', { date: subEnds })
      : t('settings.autoRenewalOff', { date: subEnds });
  }

  if (loading) {
    return (
      <View style={styles.loadingInline}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <>
      <View style={styles.sectionsWrap}>
        {/* Subscription section */}
        <Text style={styles.sectionLabel}>{t('settings.subscription')}</Text>
        <View style={styles.menuContainer}>
          {subscribed ? (
            // Tappable so a subscriber can reach the plan switcher. The paywall
            // doubles as "Manage Plan" and owns the RevenueCat product-change
            // flow (upgrade prorates immediately, downgrade defers to period
            // end). Without this route that flow is unreachable in-app and the
            // only way to change plan is leaving for Google Play.
            <TouchableOpacity
              style={styles.subRow}
              onPress={() => navigation.navigate('Paywall', { source: 'settings' })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.menuText}>{t('settings.subscription')}</Text>
                <Text style={styles.menuSubtext}>
                  {subscriptionDetail
                    ? t('settings.detailTapToChange', { detail: subscriptionDetail })
                    : t('settings.tapToChangePlan')}
                </Text>
              </View>
              <View style={[styles.badge, styles.badgeActive]}>
                <Text style={[styles.badgeText, styles.badgeTextActive]}>
                  {subscriptionLabel}
                </Text>
              </View>
              <Chevron color={COLORS.textMuted} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => navigation.navigate('Paywall', { source: 'settings' })}
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
              onPress={() => {
                // Leaving for Play's own subscription page. Worth counting
                // because everything that happens after this tap - a
                // cancellation, a payment method fixed - happens somewhere
                // this app cannot see, and a rise here is the earliest warning
                // the cancellations report gets.
                track(user?.id, 'subscription_managed', subStatus || null);
                Linking.openURL(manageUrl);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.menuText}>{t('settings.manageSubscription')}</Text>
                <Text style={styles.menuSubtext}>
                  {subStatus === 'past_due'
                    ? t(Platform.OS === 'ios' ? 'settings.updatePaymentMethodApple' : 'settings.updatePaymentMethod')
                    : t(Platform.OS === 'ios' ? 'settings.opensAppStore' : 'settings.opensGooglePlay')}
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

        {/* The profile's own rows.
            They carry their own top margin, but the subscription card above
            has no bottom one - it relied on the next SECTION LABEL's
            paddingTop, and these rows are not a section label. Without this
            the two cards sat edge to edge with no seam at all. */}
        <View style={styles.afterSubscriptionGap}>{afterSubscription}</View>

        {/* Appearance.
            A segmented control rather than a row that opens a picker: there
            are exactly three choices, all of them one word, and the result is
            visible the instant it is tapped - so making the reader open a
            sheet to see three options and come back would be ceremony around
            nothing. System is first because it is the default and the one
            most people want. */}
        <Text style={styles.sectionLabel}>{t('settings.appearance')}</Text>
        <View style={styles.menuContainer}>
          <View style={styles.segment} accessibilityRole="radiogroup">
            {(['system', 'light', 'dark'] as ThemeMode[]).map((m) => {
              const active = themeMode === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  onPress={() => {
                    setThemeMode(m);
                    track(user?.id, 'appearance_changed', m);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active, checked: active }}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      active && styles.segmentTextActive,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {t(APPEARANCE_KEYS[m])}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Language */}
        <Text style={styles.sectionLabel}>{t('settings.language')}</Text>
        <View style={styles.menuContainer}>
          <TouchableOpacity
            style={styles.menuRow}
            accessibilityRole="button"
            onPress={() => setLanguagePickerVisible(true)}
          >
            <Text style={styles.menuText}>{t('settings.language')}</Text>
            <View style={styles.languageValue}>
              {/* The current language in its own name, matching the picker. */}
              <Text style={styles.menuSubtext}>
                {SUPPORTED_LANGUAGES[i18n.language as LanguageTag] ?? i18n.language}
              </Text>
              <Chevron color={COLORS.textMuted} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Help.
            "Contact support" is said in half a dozen error messages across the
            app, and there was nowhere in the app to contact support FROM - the
            instruction named an action the product did not offer. One row,
            where a person looks for it. */}
        <Text style={styles.sectionLabel}>{t('settings.help')}</Text>
        <View style={styles.menuContainer}>
          <TouchableOpacity
            style={styles.menuRow}
            accessibilityRole="button"
            onPress={openSupportEmail}
          >
            <Text style={styles.menuText}>{t('settings.contactSupport')}</Text>
            <View style={styles.supportRight}>
              <Text style={styles.menuSubtext} numberOfLines={1}>
                {SUPPORT_EMAIL}
              </Text>
              <Chevron color={COLORS.textMuted} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Legal pages.
            Rendered from the synced list when there is one, and from the two
            slugs the app itself links to otherwise. `pages` is filled by the
            authenticated content sync, so before the first successful sync -
            a fresh install, or an install that has been offline - the whole
            section was absent and Terms and Privacy were unreachable from
            Settings. The screen behind them says so and offers a retry, which
            is a far better answer than a heading that is not there. */}
        <Text style={styles.sectionLabel}>{t('settings.terms')}</Text>
        <View style={styles.menuContainer}>
          {(pages.length > 0 ? pages : FALLBACK_LEGAL_PAGES).map((p, idx) => {
            const title = p.title || t(FALLBACK_LEGAL_TITLE_KEYS[p.slug] ?? 'settings.terms');
            return (
              <TouchableOpacity
                key={p.slug}
                style={[styles.menuRow, idx > 0 && styles.borderTop]}
                accessibilityRole="button"
                onPress={() => navigation.navigate('LegalPage', { slug: p.slug, title })}
              >
                <Text style={styles.menuText}>{title}</Text>
                <Chevron color={COLORS.textMuted} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Standalone actions, ordered by consequence: the routine one first,
            the irreversible one last and visually set apart. Previously Log out
            was the loudest button on the page (solid accent, the app's primary
            CTA colour) sitting between two identical red buttons, so "clear my
            progress" and "destroy my account" read as the same weight. */}
        <View style={styles.actionsContainer}>
          {/* Not confirmed. Signing out is what every other app does in one
              tap, and the two things the old dialog warned about are no longer
              true: logout pushes the outbox before clearing, so nothing
              unsynced is lost, and "you will need your password" was wrong for
              anybody who signed up with Google and has none. Reset progress
              and Delete account below are still confirmed, because those are
              the ones that cannot be undone by signing back in. */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.logoutBtn]}
            accessibilityRole="button"
            onPress={() => {
              logout();
            }}
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
      </View>

      <LanguagePicker
        visible={languagePickerVisible}
        onClose={() => setLanguagePickerVisible(false)}
      />

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

              <Text style={styles.modalBody}>{t('settings.resetConfirmBody')}</Text>
              
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
        {/* The second step of this modal has a code field in it. Without the
            keyboard avoidance the keyboard covered the field and the two
            buttons under it, so the reader could type a code they could not
            see and could not reach Delete - on the one flow in the app with no
            other route to completion. */}
        <KeyboardAvoidingView
          style={styles.modalFill}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeDeleteModal}
        >
          <TouchableWithoutFeedback>
            <ScrollView
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
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
                    {t('settings.deleteWarnBody')}{' '}
                    <Text style={{ fontWeight: 'bold', color: COLORS.white }}>
                      {t('settings.deleteWarnCannotUndo')}
                    </Text>
                  </Text>
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                      {t('settings.deleteWarnSubscription')}
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
                        <Text style={styles.modalDeleteBtnText}>{t('common.continue')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  {/* One key with the address interpolated, not a prefix key
                      plus a hardcoded tail: the sentence used to end in English
                      in every language, and splitting it around the email would
                      break anywhere the word order differs. */}
                  <Text style={styles.modalBody}>
                    {t('settings.deleteCodeSent', { email: user?.email ?? '' })}
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
            </ScrollView>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

/**
 * The old standalone screen, kept so the route still resolves.
 *
 * Nothing navigates here any more - Profile renders the sections directly - but
 * a stale deep link or a saved navigation state pointing at 'Settings' should
 * land somewhere sensible rather than crashing.
 */
export const SettingsScreen = () => {
  const styles = useThemedStyles(makeStyles);
  return (
    <SafeAreaView style={styles.container}>
      <Watermark />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SettingsSections />
      </ScrollView>
    </SafeAreaView>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  // Sections render inside Profile's ScrollView now, so they own padding but
  // never scrolling - nesting a second scroller would break momentum on both.
  sectionsWrap: { paddingHorizontal: 0 },
  afterSubscriptionGap: { marginTop: SPACE.lg },
  // Three equal thirds inside the same card the menu rows use, so the control
  // reads as part of the list rather than as a widget dropped on top of it.
  segment: {
    flexDirection: 'row',
    padding: SPACE.xs,
    gap: SPACE.xs,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.md,
  },
  // The selected third carries the accent wash and the accent label: the same
  // pairing the active tab uses, so the two mean the same thing.
  segmentBtnActive: { backgroundColor: COLORS.accentWash },
  segmentText: { ...TYPE.bodySm, color: COLORS.textMuted, fontWeight: '600' },
  segmentTextActive: { color: COLORS.accentText, fontWeight: '700' },
  loadingInline: { paddingVertical: 48, alignItems: 'center' },
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
  languageValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    borderTopColor: COLORS.border,
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
  supportRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeActive: {
    backgroundColor: COLORS.accentWash,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  badgeTextActive: {
    color: COLORS.accentText,
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
  // Same treatment as Reset progress below it. Without the border it was a
  // bare fill, which against surface2 on the light palette is barely a button
  // at all - and it sits directly above two bordered buttons, so it read as
  // the one unfinished control in the group.
  logoutBtn: {
    backgroundColor: COLORS.surface2,
    borderColor: COLORS.borderStrong,
    borderWidth: 1,
  },
  logoutBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  // Cautionary, not destructive: progress can be rebuilt, an account cannot.
  resetBtn: {
    backgroundColor: COLORS.surface2,
    borderColor: COLORS.borderStrong,
    borderWidth: 1,
  },
  resetBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  // Extra air above the only irreversible action on the screen.
  deleteBtnSpaced: {
    marginTop: 8,
  },
  deleteBtn: {
    backgroundColor: COLORS.dangerWash,
    borderColor: COLORS.dangerEdge,
    borderWidth: 1,
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.danger,
  },

  // Modal styles
  modalFill: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.scrim,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  // flexGrow with centring: the card sits in the middle while it fits and
  // scrolls only once the keyboard has taken the room it needed.
  modalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.dangerWash,
    borderColor: COLORS.dangerEdge,
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
    color: COLORS.onDanger,
    fontWeight: 'bold',
  },
  deleteInput: {
    height: 52,
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    borderColor: COLORS.border,
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
    color: COLORS.onDanger,
    fontWeight: 'bold',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerWash,
    borderColor: COLORS.dangerEdge,
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
