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
import { nativeGoogleSignIn, openGoogleBrowserSignIn } from '../../services/googleAuth';
import Svg, { Path } from 'react-native-svg';
import { Watermark } from '../../components/Watermark';
import { GoogleLogo } from '../../components/GoogleLogo';
import { track } from '../../services/events';

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
    /**
     * Counted here, not on the button.
     *
     * Below the two local checks on purpose: a mistyped confirmation is not an
     * attempt to sign up, it is a typo, and counting it would make the funnel's
     * first step bigger than the number of people who ever reached the server.
     * There is no account yet either, so this is a guest row - claimed the
     * moment the registration succeeds.
     */
    track(null, 'signup_started', 'email');
    // See the same guard in LoginScreen: `register` can throw, and an
    // unguarded await left the button spinning with nothing said and no way to
    // try again.
    try {
      const res = await register(name.trim(), email.trim().toLowerCase(), password);
      if (res.success) {
        // Successfully registered. Now redirect to verification screen.
        navigation.navigate('VerifyEmail', { email: email.trim().toLowerCase() });
      } else {
        setError(res.error || t('register.registrationFailed'));
      }
    } catch (e) {
      console.error('Registration failed', e);
      setError(t('common.couldNotLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError('');
    setGoogleLoading(true);
    // Before the picker opens, so an account chooser that gets dismissed still
    // counts as somebody who tried to sign up this way. Which of the two routes
    // people take is the point of the subject.
    track(null, 'signup_started', 'google');
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

      // A build whose Google client id is wrong is not a device without Play
      // Services, and it must not be presented as one: the browser fallback
      // will fail the same way, so silently opening it sends the reader
      // through a second failure with no explanation. Say what happened and
      // leave the email form, which does work, in front of them.
      if (native.status === 'misconfigured') {
        setError(t('common.googleUnavailable'));
        return;
      }

      // Native unavailable (no Play Services, client id not configured, etc.):
      // fall back to the backend Custom-Tab flow, which returns via deeplink.
      //
      // openGoogleBrowserSignIn rather than opening the URL by hand: it stores
      // the one-time nonce the deep link is checked against, and a redirect
      // arriving without one cannot be told apart from a forged one.
      await openGoogleBrowserSignIn();
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
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('login.close')}
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

          {/* The agreement, where the agreement is actually made.
              Creating the account is the moment someone is bound by these,
              and until now the only route to either document was the paywall
              or Settings - so an account could be created without the terms
              ever being nameable, let alone readable. Two real 44pt targets
              rather than an inline tappable span: a span inside a sentence is
              both hard to hit and invisible to a screen reader as a link. */}
          <View style={styles.legalBlock}>
            <Text style={styles.legalIntro}>{t('register.agreeIntro')}</Text>
            <View style={styles.legalLinks}>
              <TouchableOpacity
                style={styles.legalLinkBtn}
                accessibilityRole="link"
                onPress={() =>
                  navigation.navigate('LegalPage', {
                    slug: 'terms',
                    title: t('register.terms'),
                  })
                }
              >
                <Text style={styles.legalLinkText}>{t('register.terms')}</Text>
              </TouchableOpacity>
              <Text style={styles.legalSeparator}>·</Text>
              <TouchableOpacity
                style={styles.legalLinkBtn}
                accessibilityRole="link"
                onPress={() =>
                  navigation.navigate('LegalPage', {
                    slug: 'privacy-policy',
                    title: t('register.privacyPolicy'),
                  })
                }
              >
                <Text style={styles.legalLinkText}>{t('register.privacyPolicy')}</Text>
              </TouchableOpacity>
            </View>
          </View>

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
  legalBlock: {
    marginTop: 18,
    alignItems: 'center',
  },
  legalIntro: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: COLORS.textMuted,
    paddingHorizontal: 24,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legalLinkBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  legalLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accentText,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 12,
    color: COLORS.textDim,
  },
  closeBtn: {
    width: 44,
    height: 44,
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
