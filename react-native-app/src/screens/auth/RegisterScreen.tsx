import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { AuthField } from '../../components/AuthField';
import { COLORS, TYPE, SPACE, RADIUS, DISABLED_OPACITY } from '../../theme/colors';
import { getWebBaseUrl } from '../../services/api';
import { nativeGoogleSignIn } from '../../services/googleAuth';
import Svg, { Path } from 'react-native-svg';
import { Watermark } from '../../components/Watermark';
import { GoogleLogo } from '../../components/GoogleLogo';

export const RegisterScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<any>>();
  const { register, googleNativeLogin } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleRegister = async () => {
    setError('');
    if (!name || !email || !password || !confirmPassword) {
      setError(t('register.fillAllFields'));
      return;
    }
    if (password.length < 6) {
      setError(t('register.passwordTooShort'));
      return;
    }
    // simple regex to check for a digit in password matching laravel validation
    if (!/\d/.test(password)) {
      setError(t('register.passwordNeedsNumber'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('register.passwordsDoNotMatch'));
      return;
    }

    setLoading(true);
    const res = await register(name.trim(), email.trim().toLowerCase(), password);
    setLoading(false);

    if (res.success) {
      // Successfully registered. Now redirect to verification screen.
      navigation.navigate('VerifyEmail', { email: email.trim().toLowerCase() });
    } else {
      setError(res.error || t('register.registrationFailed'));
    }
  };

  const handleGoogleSignup = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      // Native first (system account picker); Google finds-or-creates the
      // user server-side, so sign-up and sign-in are the same call.
      const native = await nativeGoogleSignIn();
      if (native.status === 'success') {
        const res = await googleNativeLogin(native.idToken);
        if (!res.success) {
          setError(res.error || t('register.googleSignUpFailed'));
        }
        return;
      }
      if (native.status === 'cancelled') {
        // User closed/cancelled account picker: stay on screen, do not open browser.
        return;
      }

      // Native unavailable (no Play Services, client id not configured, etc.):
      // Fallback directly to the backend Custom-Tab flow (returns via deeplink).
      await Linking.openURL(`${getWebBaseUrl()}/auth/google/native`);
    } catch {
      setError(t('register.couldNotOpenGoogle'));
    } finally {
      setGoogleLoading(false);
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
            <Text style={styles.title}>{t('register.createAccount')}</Text>
            <Text style={styles.subtitle}>{t('register.subtitle')}</Text>
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
              label={t('register.name')}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
            />

            <AuthField
              label={t('register.email')}
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
              label={t('register.password')}
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secure
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
            />

            {/* Stated up front, not revealed as an error after submitting.
                A rule the user cannot see until they break it is a trap. */}
            <Text style={styles.hint}>{t('register.passwordHint')}</Text>

            <AuthField
              label={t('register.confirmPassword')}
              placeholder="••••••••"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secure
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={handleRegister}
              errorText={
                confirmPassword.length > 0 && confirmPassword !== password
                  ? t('register.passwordsDoNotMatch')
                  : null
              }
            />

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.onAccent} />
              ) : (
                <Text style={styles.btnText}>{t('register.createAccount2')}</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>{t('common.or')}</Text>
            <View style={styles.divider} />
          </View>

          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogleSignup}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <GoogleLogo size={20} />
                <Text style={styles.googleBtnText}>{t('register.continueWithGoogle')}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchContainer}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.switchLabel}>
              {t('register.alreadyHaveAnAccount')} <Text style={styles.switchLink}>{t('register.logIn')}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  head: { gap: SPACE.sm, marginBottom: SPACE.xl },
  title: { ...TYPE.display, color: COLORS.white },
  subtitle: { ...TYPE.body, color: COLORS.textMuted, lineHeight: 22 },
  form: { gap: SPACE.lg, marginBottom: SPACE.lg },
  hint: { ...TYPE.caption, color: COLORS.textDim, marginTop: -SPACE.sm },
  btn: {
    backgroundColor: COLORS.accent,
    height: 56,
    borderRadius: RADIUS.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACE.xs,
  },
  btnDisabled: { opacity: DISABLED_OPACITY },
  btnText: { ...TYPE.section, color: COLORS.onAccent },
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
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
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
});
