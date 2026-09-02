import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { Palette } from '../../theme/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import { api } from '../../services/api';
import { Watermark } from '../../components/Watermark';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';

type RouteParams = {
  VerifyEmail: {
    email: string;
  };
};

const RESEND_COOLDOWN_SECONDS = 60;
/** Per address: two accounts being verified on one device do not share a cooldown. */
const resendKey = (email: string) => `@verify_resend_until_${email.toLowerCase()}`;

export const VerifyEmailScreen = () => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RouteParams, 'VerifyEmail'>>();
  const navigation = useNavigation<NavigationProp<any>>();
  const { completeAuth } = useAuth();
  
  const email = route.params?.email || '';
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  /**
   * Seconds before the code can be sent again.
   *
   * Resend had no rate limit and no timer, on a step that sits between a
   * person and a purchase. Email is slow enough that silence reads as failure,
   * so the tap gets repeated - which sends more mail, invalidates the code
   * that was already in flight on some backends, and makes the delivery
   * problem worse rather than better. A visible countdown answers the actual
   * question, which is "how long do I wait".
   */
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  /**
   * The cooldown survives a relaunch.
   *
   * It lived only in component state, so backgrounding the app - which is
   * exactly what someone does to go and read the email - reset it to zero.
   * The rate limit then meant nothing: the tap that the countdown existed to
   * prevent was available again the moment the reader came back with the code
   * still in flight. The DEADLINE is stored rather than the seconds left, so
   * time spent outside the app counts against it like time spent inside.
   */
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(resendKey(email))
      .then((raw) => {
        if (cancelled || !raw) return;
        const until = parseInt(raw, 10);
        if (!Number.isFinite(until)) return;
        const left = Math.ceil((until - Date.now()) / 1000);
        if (left > 0) setResendIn(Math.min(left, RESEND_COOLDOWN_SECONDS));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [email]);

  const handleVerify = async () => {
    setError('');
    if (code.length !== 6) {
      setError(t('verifyEmail.enterSixDigitCode'));
      return;
    }

    setLoading(true);
    // `completeAuth` writes to the database and the auth context, either of
    // which can throw. It was awaited outside any guard AFTER setLoading(false)
    // had already run for the request, so a failure there left the screen with
    // no session, no error and a Verify button that looked ready but would
    // resubmit a code the server has now consumed.
    try {
      const res = await api.verifyEmail({ email, code });
      if (res.ok && res.data?.success) {
        // Code accepted: establish the session now (register deliberately does
        // not sign in, so the verify screen stays mounted until this point).
        // The navigator switches automatically once the auth context is
        // populated.
        await completeAuth(res.data);
      } else {
        setError(res.error || t('verifyEmail.verificationFailed'));
      }
    } catch (e) {
      console.error('Email verification failed', e);
      setError(t('common.couldNotLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || resendLoading) return;
    setResendSuccess('');
    setError('');
    setResendLoading(true);
    try {
      const res = await api.resendVerification({ email });
      if (res.ok) {
        setResendSuccess(t('verifyEmail.codeResent'));
        // Only on success. A send that failed should be retryable at once -
        // making someone wait out a cooldown for our error would be the wrong
        // way round.
        setResendIn(RESEND_COOLDOWN_SECONDS);
        AsyncStorage.setItem(
          resendKey(email),
          String(Date.now() + RESEND_COOLDOWN_SECONDS * 1000),
        ).catch(() => {});
      } else {
        setError(res.error || t('verifyEmail.failedToResendCode'));
      }
    } catch (e) {
      console.error('Resend verification failed', e);
      setError(t('common.couldNotLoad'));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Watermark />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Same shape as Log in and Sign up: centred while it fits, and
            scrollable the moment the keyboard takes the bottom of the box.
            This screen has a code field and a Verify button below it, so
            without the scroll the button goes exactly where the keyboard is
            the instant the reader taps to type the code. */}
        <ScrollView
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Text style={styles.title}>{t('verifyEmail.verifyEmail')}</Text>
          {/* Was a bare English literal - the same defect as the paywall's
              "and the app store terms.", on a screen every single paying
              customer passes through on their way to the purchase. */}
          <Text style={styles.subtitle}>
            {t('verifyEmail.sentCodeTo')} {'\n'}
            <Text style={styles.emailHighlight}>{email}</Text>
          </Text>

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
          {resendSuccess ? (
            <View style={styles.successContainer}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3"
                  stroke={COLORS.accentText}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              <Text style={styles.successText}>{resendSuccess}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <TextInput
              style={styles.codeInput}
              placeholder="000000"
              placeholderTextColor={COLORS.textMuted}
              value={code}
              onChangeText={(val) => setCode(val.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              // Lets Android offer the code straight from the notification
              // instead of making the reader memorise six digits, switch apps
              // and type them back in.
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
            />

            <TouchableOpacity style={styles.btn} onPress={handleVerify} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={COLORS.onAccent} />
              ) : (
                <Text style={styles.btnText}>{t('verifyEmail.verifyCode')}</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.resendContainer}
            onPress={handleResend}
            disabled={resendLoading || resendIn > 0}
            accessibilityRole="button"
          >
            {resendLoading ? (
              <ActivityIndicator color={COLORS.accent} />
            ) : resendIn > 0 ? (
              <Text style={styles.resendWaitText}>
                {t('verifyEmail.resendIn', { count: resendIn })}
              </Text>
            ) : (
              <Text style={styles.resendText}>{t('verifyEmail.didnTReceiveTheCode')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backContainer}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.backText}>{t('verifyEmail.backToLogIn')}</Text>
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
  keyboardView: {
    flex: 1,
  },
  inner: {
    // flexGrow, not flex - a scroll content container capped at the viewport
    // cannot scroll.
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.whiteMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  emailHighlight: {
    color: COLORS.accentText,
    fontWeight: '600',
  },
  form: {
    marginBottom: 20,
  },
  codeInput: {
    height: 60,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    color: COLORS.white,
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 12,
    marginBottom: 24,
  },
  btn: {
    backgroundColor: COLORS.accent,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  resendContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  resendText: {
    color: COLORS.accentText,
    fontSize: 14,
    fontWeight: '600',
  },
  // Muted while counting down: the control is genuinely unavailable, and
  // accent on a disabled affordance invites the tap it will not accept.
  resendWaitText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  backContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  backText: {
    color: COLORS.textMuted,
    fontSize: 14,
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
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentWash,
    borderColor: COLORS.accentEdge,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 10,
  },
  successText: {
    flex: 1,
    color: COLORS.accentText,
    fontSize: 14,
    lineHeight: 18,
  },
});
