import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../theme/colors';
import { api } from '../../services/api';
import { Watermark } from '../../components/Watermark';
import Svg, { Path } from 'react-native-svg';

type RouteParams = {
  VerifyEmail: {
    email: string;
  };
};

export const VerifyEmailScreen = () => {
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

  const handleVerify = async () => {
    setError('');
    if (code.length !== 6) {
      setError(t('verifyEmail.enterSixDigitCode'));
      return;
    }

    setLoading(true);
    const res = await api.verifyEmail({ email, code });
    setLoading(false);

    if (res.ok && res.data?.success) {
      // Code accepted: establish the session now (register deliberately does not
      // sign in, so the verify screen stays mounted until this point). The
      // navigator switches automatically once the auth context is populated.
      await completeAuth(res.data);
    } else {
      setError(res.error || t('verifyEmail.verificationFailed'));
    }
  };

  const handleResend = async () => {
    setResendSuccess('');
    setError('');
    setResendLoading(true);
    const res = await api.resendVerification({ email });
    setResendLoading(false);

    if (res.ok) {
      setResendSuccess(t('verifyEmail.codeResent'));
    } else {
      setError(res.error || t('verifyEmail.failedToResendCode'));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Watermark />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.inner}>
          <Text style={styles.title}>{t('verifyEmail.verifyEmail')}</Text>
          <Text style={styles.subtitle}>
            We've sent a 6-digit verification code to {'\n'}
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
                  stroke={COLORS.accent}
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
            disabled={resendLoading}
          >
            {resendLoading ? (
              <ActivityIndicator color={COLORS.accent} />
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
  keyboardView: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
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
    color: COLORS.accent,
    fontWeight: '600',
  },
  form: {
    marginBottom: 20,
  },
  codeInput: {
    height: 60,
    backgroundColor: COLORS.surface,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '600',
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
});
