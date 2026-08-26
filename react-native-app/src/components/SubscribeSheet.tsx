import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
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
import { COLORS, DISABLED_OPACITY, TYPE, SPACE, RADIUS, GLASS } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { getAppSetting } from '../db/queries';
import { getWebBaseUrl } from '../services/api';
import { nativeGoogleSignIn } from '../services/googleAuth';
import { setPendingPlan, getPlanPricing, PlanPricing } from '../services/billing';
import {
  PLANS,
  featuredPlan,
  planNameKey,
  planDescriptionKey,
} from '../constants/plans';
import { planMonths, perMonthLabel, savingsPercent } from '../constants/pricing';
import { GoogleLogo } from './GoogleLogo';
import { AuthField } from './AuthField';

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
  // Live store prices, exactly as the paywall reads them. Without this the
  // sheet rendered the catalogue's USD figure to every market - a number the
  // Play sheet on the very next tap would contradict.
  const [pricing, setPricing] = useState<Record<string, PlanPricing>>({});

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

  // Fetched on open rather than at mount: this component is rendered behind
  // every guest funnel screen, and a store round-trip on each of them buys
  // nothing until the sheet is actually on screen. An empty result is not an
  // error - the rows fall back to the catalogue price and simply advertise no
  // trial, which is the one claim we must never make on a guess.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    getPlanPricing()
      .then((p) => {
        if (!cancelled) setPricing(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const trialDays =
    PLANS.map((p) => pricing[p.slug]?.freeTrialDays).find((days) => !!days) ?? null;
  const selectedPlanDef = PLANS.find((p) => p.slug === selectedPlan) ?? featuredPlan();

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
    if (!name.trim()) next.name = t('subscribeSheet.nameRequired');
    if (!email.trim()) next.email = t('subscribeSheet.emailRequired');
    else if (!/\S+@\S+\.\S+/.test(email.trim())) next.email = t('subscribeSheet.emailInvalid');
    if (!password) next.password = t('subscribeSheet.passwordRequired');
    else if (password.length < 6 || !/[0-9]/.test(password)) {
      next.password = t('subscribeSheet.passwordRules');
    }
    if (password !== passwordConfirmation) {
      next.password_confirmation = t('subscribeSheet.passwordsDoNotMatch');
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
      setErrors({ email: res.error || t('subscribeSheet.couldNotReachServer') });
    }
  };

  const handleLogin = async () => {
    const next: FieldErrors = {};
    if (!email.trim()) next.email = t('subscribeSheet.emailRequired');
    if (!password) next.password = t('subscribeSheet.passwordRequired');
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
        ? t('subscribeSheet.emailOrPasswordIncorrect')
        : res.error || t('subscribeSheet.couldNotReachServer'),
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
          setMessage(res.error || t('subscribeSheet.googleSignInFailed'));
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
      setMessage(t('subscribeSheet.couldNotOpenGoogle'));
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
        <Text style={styles.dividerText}>{t('common.or')}</Text>
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
                    <Text style={styles.title}>{t('subscribeSheet.headline')}</Text>
                    <TouchableOpacity style={styles.roundBtn} onPress={close} accessibilityLabel={t('subscribeSheet.close')}>
                      {closeIcon}
                    </TouchableOpacity>
                  </View>

                  {/* Only when the store actually serves one to this customer.
                      Reuses the paywall's line rather than minting a second
                      key saying the same sentence in 29 languages. */}
                  {trialDays ? (
                    <View style={styles.trialBanner}>
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                        <Path
                          d="M12 6v6l4 2"
                          stroke={COLORS.accent}
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <Path
                          d="M12 3a9 9 0 1 0 9 9"
                          stroke={COLORS.accent}
                          strokeWidth={2.5}
                          strokeLinecap="round"
                        />
                      </Svg>
                      <Text style={styles.trialBannerText}>
                        {t('paywall.everyPlanStartsWithTrial', { count: trialDays })}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.plansWrap}>
                    {PLANS.map((plan) => {
                      const sel = selectedPlan === plan.slug;
                      const months = planMonths(plan);
                      const perMonth = perMonthLabel(pricing[plan.slug], months);
                      const savings = savingsPercent(pricing, plan, months);
                      return (
                        <TouchableOpacity
                          key={plan.slug}
                          activeOpacity={0.85}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: sel }}
                          style={[styles.planRow, sel && styles.planRowSelected]}
                          onPress={() => setSelectedPlan(plan.slug)}
                        >
                          <View style={[styles.radio, sel && styles.radioSelected]}>
                            {sel && <View style={styles.radioDot} />}
                          </View>

                          <View style={styles.planInfo}>
                            {/* The plan NAME already carries the period ("1
                                Year", "3 Months") and is translated, so the
                                price needs no English "/year" glued to it -
                                which is what the sheet used to print into
                                every locale. */}
                            <Text style={styles.planName}>{t(planNameKey(plan.slug))}</Text>
                            <Text style={styles.planDescription} numberOfLines={1}>
                              {t(planDescriptionKey(plan.slug))}
                            </Text>
                          </View>

                          <View style={styles.planPriceWrap}>
                            <Text style={styles.planPrice}>
                              {pricing[plan.slug]?.priceString ?? `$${plan.price.toFixed(2)}`}
                            </Text>
                            {perMonth ? (
                              <Text style={styles.planPerMonth}>
                                {t('common.perMonth', { price: perMonth })}
                              </Text>
                            ) : null}
                          </View>

                          {savings ? (
                            <View style={styles.savingsPill}>
                              <Text style={styles.savingsPillText}>
                                {t('paywall.savePercent', { percent: savings })}
                              </Text>
                            </View>
                          ) : plan.is_featured ? (
                            <View style={styles.featuredBadge}>
                              <Text style={styles.featuredBadgeText}>{t('subscribeSheet.bestValue')}</Text>
                            </View>
                          ) : null}
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
                    {t('subscribeSheet.billingDisclosure')}{' '}
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
                      {authMode === 'register'
                        ? t('subscribeSheet.createAccount')
                        : t('subscribeSheet.signIn')}
                    </Text>
                    <TouchableOpacity
                      style={[styles.roundBtn, styles.authClose]}
                      onPress={close}
                      accessibilityLabel={t('subscribeSheet.close')}
                    >
                      {closeIcon}
                    </TouchableOpacity>
                  </View>

                  {/* What they picked, carried into the form. The sheet used to
                      drop the plan entirely at this step, so the screen asking
                      for a password no longer said what was being bought - and
                      the button under it promises to subscribe. */}
                  <View style={styles.planSummary}>
                    <Text style={styles.planSummaryName}>
                      {t(planNameKey(selectedPlanDef.slug))}
                    </Text>
                    <Text style={styles.planSummaryPrice}>
                      {pricing[selectedPlanDef.slug]?.priceString
                        ?? `$${selectedPlanDef.price.toFixed(2)}`}
                    </Text>
                  </View>

                  {authMode === 'register' ? (
                    <View style={styles.form}>
                      <AuthField
                        label={t('subscribeSheet.fullName')}
                        placeholder={t('subscribeSheet.fullName')}
                        autoComplete="name"
                        textContentType="name"
                        returnKeyType="next"
                        value={name}
                        onChangeText={setName}
                        errorText={errors.name}
                      />
                      <AuthField
                        label={t('subscribeSheet.emailAddress')}
                        placeholder="you@example.com"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                        textContentType="emailAddress"
                        returnKeyType="next"
                        value={email}
                        onChangeText={setEmail}
                        errorText={errors.email}
                      />
                      <AuthField
                        label={t('subscribeSheet.password')}
                        placeholder="••••••••"
                        secure
                        autoCapitalize="none"
                        autoComplete="new-password"
                        textContentType="newPassword"
                        returnKeyType="next"
                        value={password}
                        onChangeText={setPassword}
                        errorText={errors.password}
                      />
                      {/* Stated up front rather than sprung as an error after
                          submitting - a rule you cannot see until you break it
                          is a trap. Same line the Register screen shows. */}
                      <Text style={styles.hint}>{t('register.passwordHint')}</Text>
                      <AuthField
                        label={t('subscribeSheet.confirmPassword')}
                        placeholder="••••••••"
                        secure
                        autoCapitalize="none"
                        autoComplete="new-password"
                        textContentType="newPassword"
                        returnKeyType="go"
                        value={passwordConfirmation}
                        onChangeText={setPasswordConfirmation}
                        onSubmitEditing={handleRegister}
                        errorText={errors.password_confirmation}
                      />
                      {message ? <Text style={styles.fieldError}>{message}</Text> : null}
                      <TouchableOpacity
                        style={styles.submitBtn}
                        onPress={handleRegister}
                        disabled={submitting}
                      >
                        {submitting ? (
                          <Text style={styles.submitBtnText}>{t('subscribeSheet.creatingAccount')}</Text>
                        ) : (
                          <Text style={styles.submitBtnText}>
                            {/* "Subscribe" directly under "every plan starts
                                with a free trial" contradicts the banner and
                                overstates what the next tap does. The paywall
                                already owns this sentence in every locale. */}
                            {trialDays
                              ? t('paywall.startFreeTrialCta', { count: trialDays })
                              : t('subscribeSheet.createAccountSubscribe')}
                          </Text>
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
                      <AuthField
                        label={t('subscribeSheet.emailAddress')}
                        placeholder="you@example.com"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                        textContentType="emailAddress"
                        returnKeyType="next"
                        value={email}
                        onChangeText={setEmail}
                        errorText={errors.email}
                      />
                      <AuthField
                        label={t('subscribeSheet.password')}
                        placeholder="••••••••"
                        secure
                        autoCapitalize="none"
                        autoComplete="current-password"
                        textContentType="password"
                        returnKeyType="go"
                        value={password}
                        onChangeText={setPassword}
                        onSubmitEditing={handleLogin}
                        errorText={errors.password}
                      />
                      {message ? <Text style={styles.fieldError}>{message}</Text> : null}
                      <TouchableOpacity
                        style={styles.submitBtn}
                        onPress={handleLogin}
                        disabled={submitting}
                      >
                        {submitting ? (
                          <Text style={styles.submitBtnText}>{t('subscribeSheet.signingIn')}</Text>
                        ) : (
                          <Text style={styles.submitBtnText}>
                            {trialDays
                              ? t('paywall.startFreeTrialCta', { count: trialDays })
                              : t('subscribeSheet.signInSubscribe')}
                          </Text>
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
  /**
   * Rebuilt on the shared tokens.
   *
   * This sheet predated the design system and was the last surface still
   * inventing its own scale: font sizes 10/11/12/14/15/18/20, radii 12/16/40,
   * and raw `rgba(255,255,255,0.1)` borders, none of which lined up with the
   * TYPE / SPACE / RADIUS / COLORS the screens around it were rebuilt on. That
   * mismatch - not any one element - is what made the buying screen read as
   * generic next to the rest of the app.
   */
  bar: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.navBar,
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.lg,
  },
  barBtn: {
    height: 56,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barBtnText: { ...TYPE.section, color: COLORS.onAccent },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  backdrop: { position: 'absolute', top: 0, start: 0, end: 0, bottom: 0 },
  panel: {
    maxHeight: '90%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderStrong,
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.borderStrong,
    marginBottom: SPACE.lg,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  title: { ...TYPE.title, flex: 1, color: COLORS.white, lineHeight: 32 },
  roundBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    alignSelf: 'flex-start',
    marginTop: SPACE.md,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accentWash,
  },
  trialBannerText: { ...TYPE.bodySm, color: COLORS.accentSoft, fontWeight: '700' },

  // Room above for the badge that straddles the first card's top edge.
  plansWrap: { marginTop: SPACE.xl, gap: SPACE.md },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.lg,
  },
  planRowSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentWash,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: COLORS.accent },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
  },
  planInfo: { flex: 1, gap: 2 },
  planName: { ...TYPE.section, color: COLORS.white },
  planDescription: { ...TYPE.caption, color: COLORS.textMuted },
  planPriceWrap: { alignItems: 'flex-end' },
  planPrice: { ...TYPE.section, color: COLORS.white },
  planPerMonth: { ...TYPE.caption, color: COLORS.textMuted, marginTop: 1 },

  // Both ride the card's top edge, and only one is ever shown: a real saving
  // outranks "best value", which is a claim rather than a number.
  savingsPill: {
    position: 'absolute',
    top: -9,
    end: SPACE.lg,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
  },
  savingsPillText: { ...TYPE.overline, fontSize: 10, color: COLORS.onAccent },
  featuredBadge: {
    position: 'absolute',
    top: -9,
    end: SPACE.lg,
    backgroundColor: COLORS.surface3,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
  },
  featuredBadgeText: { ...TYPE.overline, fontSize: 10, color: COLORS.accentSoft },

  continueBtn: {
    marginTop: SPACE.xl,
    height: 56,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: DISABLED_OPACITY },
  continueBtnText: { ...TYPE.section, color: COLORS.onAccent },

  legalText: {
    marginTop: SPACE.md,
    ...TYPE.caption,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    color: COLORS.textDim,
  },
  legalLink: { color: COLORS.accent, textDecorationLine: 'underline' },

  authHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    marginBottom: SPACE.lg,
  },
  authTitle: { ...TYPE.heading, color: COLORS.white },
  authClose: { marginStart: 'auto' },

  planSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
    marginBottom: SPACE.xl,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.md,
    ...GLASS,
    borderColor: 'rgba(193,255,114,0.30)',
    backgroundColor: COLORS.accentWash,
  },
  planSummaryName: { ...TYPE.body, color: COLORS.white, fontWeight: '700' },
  planSummaryPrice: { ...TYPE.body, color: COLORS.accentSoft, fontWeight: '700' },

  form: { gap: SPACE.lg },
  hint: { ...TYPE.caption, color: COLORS.textDim, marginTop: -SPACE.md },
  fieldError: { ...TYPE.caption, color: COLORS.danger },

  submitBtn: {
    height: 56,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { ...TYPE.section, color: COLORS.onAccent },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { ...TYPE.bodySm, color: COLORS.textDim },

  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.md,
    height: 56,
    borderRadius: RADIUS.xl,
    backgroundColor: '#ffffff',
  },
  googleBtnText: { ...TYPE.body, fontSize: 15, fontWeight: '600', color: '#1f1f1f' },

  switchLink: { alignItems: 'center', paddingVertical: SPACE.xs },
  switchLinkText: { ...TYPE.body, color: COLORS.accent, fontWeight: '700' },
});
