import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Alert,
  TouchableWithoutFeedback,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { AuthField } from '../../components/AuthField';
import { COLORS, TYPE, SPACE, RADIUS, DISABLED_OPACITY } from '../../theme/colors';
import Svg, { Path } from 'react-native-svg';
import { api, getWebBaseUrl } from '../../services/api';
import { nativeGoogleSignIn } from '../../services/googleAuth';
import { getAppSetting } from '../../db/queries';
import { Watermark } from '../../components/Watermark';
import { GoogleLogo } from '../../components/GoogleLogo';

export const LoginScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<any>>();
  const { login, googleNativeLogin } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(true);

  // Forgot password modal state
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetCodeSent, setResetCodeSent] = useState(false);

  const closeResetModal = () => {
    setResetModalVisible(false);
    setResetSuccess('');
    setResetError('');
    setResetCode('');
    setResetNewPassword('');
    setResetCodeSent(false);
  };

  useEffect(() => {
    // Check if google login is enabled from synced backend config
    const checkGoogleConfig = async () => {
      try {
        const flag = await getAppSetting('google_login_enabled', '1');
        setGoogleEnabled(flag === '1');
      } catch {}
    };
    checkGoogleConfig();
  }, []);

  const handleLogin = async () => {
    setError('');
    if (!email || !password) {
      setError(t('login.fillAllFields'));
      return;
    }
    setLoading(true);
    const res = await login(email.trim().toLowerCase(), password);
    setLoading(false);
    if (!res.success) {
      if (res.error === 'unverified') {
        navigation.navigate('VerifyEmail', { email: email.trim().toLowerCase() });
      } else {
        setError(res.error || t('login.invalidCredentials'));
      }
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      // Native first: the system Google account picker, no browser. The
      // backend verifies the resulting ID token and signs the account in.
      const native = await nativeGoogleSignIn();
      if (native.status === 'success') {
        const res = await googleNativeLogin(native.idToken);
        if (!res.success) {
          setError(res.error || t('login.googleSignInFailed'));
        }
        // On success the auth context is populated and the keyed navigator
        // swaps phases by itself - nothing to do here.
        return;
      }
      if (native.status === 'cancelled') {
        // User closed/cancelled account picker: stay on screen, do not open browser.
        return;
      }

      // Native unavailable (no Play Services, client id not configured, etc.):
      // Fallback directly to the browser Custom-Tab flow.
      await Linking.openURL(`${getWebBaseUrl()}/auth/google/native`);
    } catch {
      setError(t('login.couldNotOpenGoogle'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleRequestResetCode = async () => {
    setResetError('');
    setResetSuccess('');
    if (!resetEmail) {
      setResetError(t('login.enterYourEmail'));
      return;
    }
    setResetLoading(true);
    const res = await api.requestResetPasswordCode({ email: resetEmail.trim().toLowerCase() });
    setResetLoading(false);
    if (res.ok) {
      setResetSuccess(t('login.codeSentEnterBelow'));
      setResetCodeSent(true);
    } else {
      setResetError(res.error || t('login.failedToSendResetCode'));
    }
  };

  const handleResetPassword = async () => {
    setResetError('');
    setResetSuccess('');
    if (!/^\d{6}$/.test(resetCode.trim())) {
      setResetError(t('login.enterSixDigitCode'));
      return;
    }
    if (resetNewPassword.length < 6 || !/\d/.test(resetNewPassword)) {
      setResetError(t('login.passwordRules'));
      return;
    }
    setResetLoading(true);
    const res = await api.resetPassword({
      email: resetEmail.trim().toLowerCase(),
      code: resetCode.trim(),
      password: resetNewPassword,
    });
    setResetLoading(false);
    if (res.ok) {
      closeResetModal();
      setEmail(resetEmail.trim().toLowerCase());
      Alert.alert(t('login.passwordResetTitle'), t('login.passwordResetBody'));
    } else {
      setResetError(res.error || t('login.failedToResetPassword'));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Watermark />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Knowledge' }] })}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path d="M18 6L6 18M6 6l12 12" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.inner}>
          <View style={styles.head}>
            <Text style={styles.title}>{t('login.logIn')}</Text>
            <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
          </View>

          {error ? (
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
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <AuthField
              label={t('login.email')}
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />

            <AuthField
              label={t('login.password')}
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secure
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />

            <TouchableOpacity
              onPress={() => {
                setResetEmail(email);
                setResetModalVisible(true);
              }}
              style={styles.forgotBtn}
            >
              <Text style={styles.forgotText}>{t('login.forgotPassword')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.onAccent} />
              ) : (
                <Text style={styles.btnText}>{t('login.logIn2')}</Text>
              )}
            </TouchableOpacity>
          </View>

          {googleEnabled && (
            <>
              <View style={styles.dividerContainer}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.divider} />
              </View>

              <TouchableOpacity
                style={styles.googleBtn}
                onPress={handleGoogleLogin}
                disabled={googleLoading}
              >
                {googleLoading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <GoogleLogo size={20} />
                    <Text style={styles.googleBtnText}>{t('login.continueWithGoogle')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.switchContainer}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.switchLabel}>
              {t('login.newHere')} <Text style={styles.switchLink}>{t('login.createAccount')}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Forgot Password Reset Modal */}
      <Modal
        visible={resetModalVisible}
        animationType="slide"
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
              <Text style={styles.modalTitle}>{t('login.resetPassword')}</Text>
              {resetError ? (
                <View style={styles.errorContainer}>
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
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
              {resetSuccess ? (
                <View style={styles.successContainer}>
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3"
                      stroke={COLORS.accent}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                  <Text style={styles.successText}>{resetSuccess}</Text>
                </View>
              ) : null}

              {!resetCodeSent ? (
                <TextInput
                  style={styles.input}
                  placeholder={t('login.enterYourEmail')}
                  placeholderTextColor={COLORS.textMuted}
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder={t('login.6DigitCode')}
                    placeholderTextColor={COLORS.textMuted}
                    value={resetCode}
                    onChangeText={setResetCode}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder={t('login.newPassword')}
                    placeholderTextColor={COLORS.textMuted}
                    value={resetNewPassword}
                    onChangeText={setResetNewPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalCloseBtn]}
                  onPress={closeResetModal}
                >
                  <Text style={styles.modalCloseBtnText}>{t('login.close')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalActionBtn]}
                  onPress={resetCodeSent ? handleResetPassword : handleRequestResetCode}
                  disabled={resetLoading}
                >
                  {resetLoading ? (
                    <ActivityIndicator color={COLORS.onAccent} />
                  ) : (
                    <Text style={styles.modalActionBtnText}>
                      {resetCodeSent ? t('login.resetPasswordCta') : t('login.sendCodeCta')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
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
  header: {
    paddingHorizontal: 12,
    paddingTop: 8,
    alignItems: 'flex-end',
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  // Used by the reset-password modal, which keeps plain inputs. Matched to
  // AuthField so the two do not disagree when the modal opens over the form.
  input: {
    minHeight: 56,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    color: COLORS.white,
    fontSize: 16,
    marginBottom: SPACE.lg,
  },
  head: { gap: SPACE.sm, marginBottom: SPACE.xl },
  title: { ...TYPE.display, color: COLORS.white },
  subtitle: { ...TYPE.body, color: COLORS.textMuted, lineHeight: 22 },
  form: { gap: SPACE.lg, marginBottom: SPACE.lg },
  forgotBtn: { alignSelf: 'flex-end', paddingVertical: SPACE.xs },
  forgotText: { ...TYPE.bodySm, color: COLORS.accent, fontWeight: '600' },
  btn: {
    backgroundColor: COLORS.accent,
    height: 56,
    borderRadius: RADIUS.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACE.xs,
  },
  // A control that looks identical while it works reads as an app that
  // ignored the tap.
  btnDisabled: { opacity: DISABLED_OPACITY },
  btnText: { ...TYPE.section, color: COLORS.onAccent },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dividerText: {
    color: COLORS.textMuted,
    marginHorizontal: 12,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  googleBtn: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
    marginStart: 12,
  },
  switchContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  switchLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  switchLink: {
    color: COLORS.accent,
    fontWeight: 'bold',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    // Errors read as errors. This was the same lime wash as the success
    // container, so a failed attempt looked identical to a win.
    backgroundColor: 'rgba(255, 107, 107, 0.10)',
    borderColor: 'rgba(255, 107, 107, 0.28)',
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
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(193, 255, 114, 0.1)',
    borderColor: 'rgba(193, 255, 114, 0.25)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 10,
  },
  successText: {
    flex: 1,
    color: COLORS.accent,
    fontSize: 14,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
  },
  modalCloseBtn: {
    backgroundColor: COLORS.surface2,
  },
  modalCloseBtnText: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
  modalActionBtn: {
    backgroundColor: COLORS.accent,
  },
  modalActionBtnText: {
    color: COLORS.onAccent,
    fontWeight: 'bold',
  },
});
