import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import {
  AuthField,
  useAuthFit,
  AUTH_ROOMY_MIN,
} from '../../components/AuthField';
import { TYPE, SPACE, RADIUS, DISABLED_OPACITY, Palette } from '../../theme/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import { getWebBaseUrl } from '../../services/api';
import { nativeGoogleSignIn } from '../../services/googleAuth';
import Svg, { Path } from 'react-native-svg';
import { Watermark } from '../../components/Watermark';
import { GoogleLogo } from '../../components/GoogleLogo';

export const RegisterScreen = () => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<any>>();
  const { register, googleNativeLogin } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { compact, onLayout } = useAuthFit(AUTH_ROOMY_MIN.register);
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
        {/* Centred when it fits, scrollable when it cannot.
            `flexGrow: 1` with `justifyContent: center` means the content sits
            in the middle of the box and the scroll view has nothing to scroll
            - it looks and behaves exactly like the plain View it replaced.
            The difference only shows when the box shrinks: keyboard up, a
            small phone, large system text. Then it scrolls instead of putting
            the submit button somewhere the reader cannot reach. */}
        <ScrollView
          onLayout={onLayout}
          contentContainerStyle={[styles.inner, compact && styles.innerCompact]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={[styles.head, compact && styles.headCompact]}>
            <Text
              style={compact ? styles.titleCompact : styles.title}
              maxFontSizeMultiplier={1.3}
            >
              {t('register.createAccount')}
            </Text>
            <Text
              style={compact ? styles.subtitleCompact : styles.subtitle}
              numberOfLines={2}
              maxFontSizeMultiplier={1.3}
            >
              {t('register.subtitle')}
            </Text>
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

          <View style={[styles.form, compact && styles.formCompact]}>
            <AuthField
              compact={compact}
              label={t('register.name')}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
            />

            <AuthField
              compact={compact}
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
              compact={compact}
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
              compact={compact}
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

          <View style={[styles.dividerContainer, compact && styles.dividerCompact]}>
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
            style={[styles.switchContainer, compact && styles.switchCompact]}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.switchLabel}>
              {t('register.alreadyHaveAnAccount')} <Text style={styles.switchLink}>{t('register.logIn')}</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
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
    // flexGrow, not flex: this is a scroll CONTENT container now, and `flex`
    // on one caps it at the viewport height, which is the one thing that
    // would stop it scrolling when it needs to.
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  innerCompact: { paddingBottom: SPACE.md },
  // See LoginScreen: the gaps below the form close first, because none of
  // them carries anything the reader has to read.
  dividerCompact: { marginVertical: SPACE.md },
  switchCompact: { marginTop: SPACE.lg },
  head: { gap: SPACE.sm, marginBottom: SPACE.xl },
  headCompact: { gap: SPACE.xs, marginBottom: SPACE.lg },
  title: { ...TYPE.display, color: COLORS.white },
  titleCompact: { ...TYPE.heading, color: COLORS.white },
  subtitle: { ...TYPE.body, color: COLORS.textMuted, lineHeight: 22 },
  subtitleCompact: { ...TYPE.bodySm, color: COLORS.textMuted, lineHeight: 18 },
  form: { gap: SPACE.lg, marginBottom: SPACE.lg },
  formCompact: { gap: SPACE.md, marginBottom: SPACE.md },
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
    color: COLORS.accentText,
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
    backgroundColor: COLORS.whiteFaint,
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
    borderColor: COLORS.borderStrong,
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
