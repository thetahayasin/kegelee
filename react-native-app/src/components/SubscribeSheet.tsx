import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { TouchableOpacity } from './Touchable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { COLORS, DISABLED_OPACITY } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { getAppSetting } from '../db/queries';
import { getWebBaseUrl } from '../services/api';
import { nativeGoogleSignIn } from '../services/googleAuth';
import { setPendingPlan } from '../services/billing';
import {
  PLANS,
  featuredPlan,
  sheetIntervalLabel,
} from '../constants/plans';
import { GoogleLogo } from './GoogleLogo';

/**
 * Bottom-sheet paywall for guests (web: App\Livewire\App\SubscribeSheet).
 *
 * Lives on the guest funnel screens: Learn the basics shows the sticky
 * "Subscribe" bar (and auto-opens the sheet after the last free lesson);
 * onboarding hides the bar and opens the sheet from its own final CTA.
 *
 * Flow: pick a plan -> Continue -> inline register/login (or Google). The
 * chosen plan is stashed as the pending purchase, and once the account is
 * authenticated the paywall - the first screen an unsubscribed user reaches -
 * launches the Google Play purchase for it, which is the web sheet's
 * triggerPurchase() continuing right after auth. New email accounts pass
 * through the 6-digit verification code first (accounts are verify-first on
 * the device), so the sheet hands off to the VerifyEmail screen.
 */

interface SubscribeSheetProps {
  visible: boolean;
  /** Dismissed (backdrop, X, hardware back). The host decides where that
   *  lands - onboarding drops to the basics, knowledge just hides it. */
  onClose: () => void;
  /** Open the sheet from the sticky bar (only used with showBar). */
  onOpen?: () => void;
  /** The sticky "Subscribe" CTA bar shown while the sheet is closed. The
   *  knowledge funnel shows it; onboarding opens the sheet from its own CTA. */
  showBar?: boolean;
  /** Route into the email-verification step after a successful registration
   *  (or an unverified sign-in). Host-specific navigation. */
  onNavigateToVerify: (email: string) => void;
}

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  password_confirmation?: string;
};

export const SubscribeSheet: React.FC<SubscribeSheetProps> = ({
  visible,
  onClose,
  onOpen,
  showBar = true,
  onNavigateToVerify,
}) => {
  const { t } = useTranslation();
  const { register, login, googleNativeLogin } = useAuth();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<'plans' | 'auth'>('plans');
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [selectedPlan, setSelectedPlan] = useState<string>(featuredPlan().slug);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(true);

  // Auth fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');

  useEffect(() => {
    getAppSetting('google_login_enabled', '1')
      .then((flag) => setGoogleEnabled(flag === '1'))
      .catch(() => {});
  }, []);

  // Opening resets to the plans step with the featured plan pre-selected.
  useEffect(() => {
    if (visible) {
      setStep('plans');
      setMessage(null);
      setErrors({});
      setSelectedPlan(featuredPlan().slug);
    }
  }, [visible]);

  const close = () => {
    setName('');
    setEmail('');
    setPassword('');
    setPasswordConfirmation('');
    setErrors({});
    setMessage(null);
    onClose();
  };

  const selectAndProceed = () => {
    setStep('auth');
    setMessage(null);
    setErrors({});
  };

  const handleRegister = async () => {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = 'Name is required.';
    if (!email.trim()) next.email = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Password is required.';
    else if (password.length < 6 || !/[0-9]/.test(password)) {
      next.password = 'Password must be at least 6 characters and include a number.';
    }
    if (password !== passwordConfirmation) {
      next.password_confirmation = "Passwords don't match.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    // Stash the chosen plan BEFORE the auth round-trip: the purchase resumes
    // on the paywall as soon as the account is signed in (post-verification).
    await setPendingPlan(selectedPlan);
    const res = await register(name.trim(), email.trim().toLowerCase(), password);
    setSubmitting(false);

    if (res.success) {
      // Accounts are verify-first on the device: the session (and then the
      // purchase) starts once the emailed code is accepted.
      close();
      onNavigateToVerify(email.trim().toLowerCase());
    } else {
      setErrors({ email: res.error || 'Could not reach the server. Check your internet connection and try again.' });
    }
  };

  const handleLogin = async () => {
    const next: FieldErrors = {};
    if (!email.trim()) next.email = 'Email is required.';
    if (!password) next.password = 'Password is required.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    await setPendingPlan(selectedPlan);
    const res = await login(email.trim().toLowerCase(), password);
    setSubmitting(false);

    if (res.success) {
      // The auth context is populated and the navigator swaps by itself: a
      // subscribed account goes straight into the app (the web's redirect to
      // home), an unsubscribed one lands on the paywall, which continues the
      // purchase for the pending plan.
      return;
    }
    if (res.error === 'unverified') {
      close();
      onNavigateToVerify(email.trim().toLowerCase());
      return;
    }
    setErrors({
      email: /credentials|password/i.test(res.error || '')
        ? 'Email or password is incorrect.'
        : res.error || 'Could not reach the server. Check your internet connection and try again.',
    });
  };

  const handleGoogle = async () => {
    setMessage(null);
    setGoogleLoading(true);
    try {
      await setPendingPlan(selectedPlan);
      // Native first: the system Google account picker, no browser. The
      // backend verifies the resulting ID token and signs the account in.
      const native = await nativeGoogleSignIn();
      if (native.status === 'success') {
        const res = await googleNativeLogin(native.idToken);
        if (!res.success) {
          setMessage(res.error || 'Google sign-in failed. Please try again.');
        }
        // On success the navigator swaps phases by itself (paywall or app).
        return;
      }
      if (native.status === 'cancelled') return;

      // Native unavailable (no Play Services, client id not configured, ...):
      // fall back to the browser Custom-Tab flow. It returns via the
      // kegelee://auth/google/finish deeplink, which AuthContext redeems -
      // the pending plan then continues on the paywall like every other path.
      await Linking.openURL(`${getWebBaseUrl()}/auth/google/native`);
    } catch {
      setMessage('Could not open Google sign-in. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const closeIcon = (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );

  const googleButton = (
    <>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>
      <TouchableOpacity style={styles.googleBtn} onPress={handleGoogle} disabled={googleLoading}>
        {googleLoading ? (
          <ActivityIndicator color="#1f1f1f" />
        ) : (
          <>
            <GoogleLogo size={20} />
            <Text style={styles.googleBtnText}>{t('subscribeSheet.continueWithGoogle')}</Text>
          </>
        )}
      </TouchableOpacity>
    </>
  );

  return (
    <>
      {/* Sticky subscribe bar (funnel on the knowledge screen; hidden on
          onboarding, which opens the sheet from its own final CTA). */}
      {showBar && !visible && (
        <View style={[styles.bar, { paddingBottom: 16 + insets.bottom }]}>
          <TouchableOpacity style={styles.barBtn} onPress={onOpen}>
            <Text style={styles.barBtnText}>{t('subscribeSheet.subscribe')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom sheet */}
      <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close} />

          <View style={[styles.panel, { paddingBottom: 24 + insets.bottom }]}>
            <View style={styles.handle} />

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {step === 'plans' ? (
                <>
                  <View style={styles.titleRow}>
                    <Text style={styles.title}>{t('subscribeSheet.startYourTransformationJourneyNow')}</Text>
                    <TouchableOpacity style={styles.roundBtn} onPress={close} accessibilityLabel={t('subscribeSheet.close')}>
                      {closeIcon}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.plansWrap}>
                    {PLANS.map((plan) => {
                      const sel = selectedPlan === plan.slug;
                      return (
                        <TouchableOpacity
                          key={plan.slug}
                          activeOpacity={0.85}
                          style={[styles.planRow, sel && styles.planRowSelected]}
                          onPress={() => setSelectedPlan(plan.slug)}
                        >
                          {/* Radio indicator */}
                          <View style={[styles.radio, sel && styles.radioSelected]}>
                            {sel && <View style={styles.radioDot} />}
                          </View>
                          <View style={styles.planInfo}>
                            <View style={styles.planInfoRow}>
                              <Text style={styles.planName}>{plan.name}</Text>
                              <View style={styles.planPriceWrap}>
                                <Text style={styles.planPrice}>${plan.price.toFixed(2)}</Text>
                                <Text style={styles.planInterval}>{sheetIntervalLabel(plan)}</Text>
                              </View>
                            </View>
                          </View>
                          {plan.is_featured && (
                            <View style={styles.featuredBadge}>
                              <Text style={styles.featuredBadgeText}>BEST VALUE</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    style={[styles.continueBtn, !selectedPlan && styles.btnDisabled]}
                    disabled={!selectedPlan}
                    onPress={selectAndProceed}
                  >
                    <Text style={styles.continueBtnText}>{t('subscribeSheet.continue')}</Text>
                  </TouchableOpacity>

                  <Text style={styles.legalText}>
                    Payment is processed securely through RevenueCat and the app store on confirmation. Your
                    subscription renews automatically at the price shown until you cancel it
                    in your subscription settings; uninstalling the app does not cancel or refund it. By
                    continuing you agree to our{' '}
                    <Text
                      style={styles.legalLink}
                      onPress={() => Linking.openURL(`${getWebBaseUrl()}/p/terms`)}
                    >
                      {t('subscribeSheet.terms')}
                    </Text>
                    .
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.authHeader}>
                    <TouchableOpacity
                      style={styles.roundBtn}
                      onPress={() => setStep('plans')}
                      accessibilityLabel={t('subscribeSheet.back')}
                    >
                      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                        <Path d="M15 18l-6-6 6-6" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" />
                      </Svg>
                    </TouchableOpacity>
                    <Text style={styles.authTitle}>
                      {authMode === 'register' ? 'Create account' : 'Sign in'}
                    </Text>
                    <TouchableOpacity
                      style={[styles.roundBtn, styles.authClose]}
                      onPress={close}
                      accessibilityLabel={t('subscribeSheet.close')}
                    >
                      {closeIcon}
                    </TouchableOpacity>
                  </View>

                  {authMode === 'register' ? (
                    <View style={styles.form}>
                      <View>
                        <TextInput
                          style={styles.input}
                          placeholder={t('subscribeSheet.fullName')}
                          placeholderTextColor={COLORS.textMuted}
                          autoComplete="name"
                          value={name}
                          onChangeText={setName}
                        />
                        {errors.name ? <Text style={styles.fieldError}>{errors.name}</Text> : null}
                      </View>
                      <View>
                        <TextInput
                          style={styles.input}
                          placeholder={t('subscribeSheet.emailAddress')}
                          placeholderTextColor={COLORS.textMuted}
                          autoCapitalize="none"
                          keyboardType="email-address"
                          autoComplete="email"
                          value={email}
                          onChangeText={setEmail}
                        />
                        {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}
                      </View>
                      <View>
                        <TextInput
                          style={styles.input}
                          placeholder={t('subscribeSheet.password6Characters1Number')}
                          placeholderTextColor={COLORS.textMuted}
                          secureTextEntry
                          autoComplete="new-password"
                          value={password}
                          onChangeText={setPassword}
                        />
                        {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}
                      </View>
                      <View>
                        <TextInput
                          style={styles.input}
                          placeholder={t('subscribeSheet.confirmPassword')}
                          placeholderTextColor={COLORS.textMuted}
                          secureTextEntry
                          autoComplete="new-password"
                          value={passwordConfirmation}
                          onChangeText={setPasswordConfirmation}
                        />
                        {errors.password_confirmation ? (
                          <Text style={styles.fieldError}>{errors.password_confirmation}</Text>
                        ) : null}
                      </View>
                      {message ? <Text style={styles.fieldError}>{message}</Text> : null}
                      <TouchableOpacity
                        style={styles.submitBtn}
                        onPress={handleRegister}
                        disabled={submitting}
                      >
                        {submitting ? (
                          <Text style={styles.submitBtnText}>{t('subscribeSheet.creatingAccount')}</Text>
                        ) : (
                          <Text style={styles.submitBtnText}>{t('subscribeSheet.createAccountSubscribe')}</Text>
                        )}
                      </TouchableOpacity>
                      {googleEnabled && googleButton}
                      <TouchableOpacity
                        style={styles.switchLink}
                        onPress={() => {
                          setAuthMode('login');
                          setErrors({});
                        }}
                      >
                        <Text style={styles.switchLinkText}>{t('subscribeSheet.alreadyHaveAnAccountSign')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.form}>
                      <View>
                        <TextInput
                          style={styles.input}
                          placeholder={t('subscribeSheet.emailAddress')}
                          placeholderTextColor={COLORS.textMuted}
                          autoCapitalize="none"
                          keyboardType="email-address"
                          autoComplete="email"
                          value={email}
                          onChangeText={setEmail}
                        />
                        {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}
                      </View>
                      <View>
                        <TextInput
                          style={styles.input}
                          placeholder={t('subscribeSheet.password')}
                          placeholderTextColor={COLORS.textMuted}
                          secureTextEntry
                          autoComplete="current-password"
                          value={password}
                          onChangeText={setPassword}
                        />
                        {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}
                      </View>
                      {message ? <Text style={styles.fieldError}>{message}</Text> : null}
                      <TouchableOpacity
                        style={styles.submitBtn}
                        onPress={handleLogin}
                        disabled={submitting}
                      >
                        {submitting ? (
                          <Text style={styles.submitBtnText}>{t('subscribeSheet.signingIn')}</Text>
                        ) : (
                          <Text style={styles.submitBtnText}>{t('subscribeSheet.signInSubscribe')}</Text>
                        )}
                      </TouchableOpacity>
                      {googleEnabled && googleButton}
                      <TouchableOpacity
                        style={styles.switchLink}
                        onPress={() => {
                          setAuthMode('register');
                          setErrors({});
                        }}
                      >
                        <Text style={styles.switchLinkText}>{t('subscribeSheet.noAccountYetCreateOne')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(6,8,16,0.97)',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  barBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
  },
  panel: {
    maxHeight: '90%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    padding: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 27,
    color: COLORS.white,
  },
  roundBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plansWrap: {
    marginTop: 16,
    gap: 10,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: COLORS.surface2,
    borderRadius: 16,
    padding: 16,
  },
  planRowSelected: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(193,255,114,0.10)',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: COLORS.accent,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  planInfo: {
    flex: 1,
  },
  planInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  planName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  planPriceWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  planPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  planInterval: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  featuredBadge: {
    position: 'absolute',
    top: -10,
    end: 16,
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  featuredBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.onAccent,
    letterSpacing: 0.5,
  },
  continueBtn: {
    marginTop: 20,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: DISABLED_OPACITY,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  legalText: {
    marginTop: 12,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    color: COLORS.textMuted,
  },
  legalLink: {
    color: COLORS.accent,
    textDecorationLine: 'underline',
  },
  authHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  authTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  authClose: {
    marginStart: 'auto',
  },
  form: {
    gap: 12,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 16,
    fontSize: 14,
    color: COLORS.white,
  },
  fieldError: {
    marginTop: 4,
    fontSize: 12,
    color: '#f87171',
  },
  submitBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dividerText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  switchLink: {
    marginTop: 4,
    alignItems: 'center',
  },
  switchLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.accent,
  },
});
