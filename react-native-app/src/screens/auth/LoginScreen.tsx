import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../theme/colors';
import Svg, { Path } from 'react-native-svg';
import { api, getWebBaseUrl } from '../../services/api';
import { getAppSetting } from '../../db/queries';
import { Watermark } from '../../components/Watermark';

export const LoginScreen = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const { login } = useAuth();
  
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
      } catch (e) {}
    };
    checkGoogleConfig();
  }, []);

  const handleLogin = async () => {
    setError('');
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    const res = await login(email.trim().toLowerCase(), password);
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Invalid credentials.');
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      // Open the backend's Google OAuth start in the system browser. Google
      // blocks OAuth inside embedded WebViews, so this must be a real browser.
      // It returns to the app via the kegelee://auth/google/finish deeplink,
      // which AuthContext redeems - the app then navigates itself once signed in.
      const url = `${getWebBaseUrl()}/auth/google/native`;
      const opened = await Linking.openURL(url);
      // openURL resolves once the browser is handed the URL; the app is now
      // backgrounded until the deeplink returns.
      void opened;
    } catch (err: any) {
      setError('Could not open Google sign-in. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleRequestResetCode = async () => {
    setResetError('');
    setResetSuccess('');
    if (!resetEmail) {
      setResetError('Please enter your email.');
      return;
    }
    setResetLoading(true);
    const res = await api.requestResetPasswordCode({ email: resetEmail.trim().toLowerCase() });
    setResetLoading(false);
    if (res.ok) {
      setResetSuccess('Code sent! Enter it below with a new password.');
      setResetCodeSent(true);
    } else {
      setResetError(res.error || 'Failed to send reset code.');
    }
  };

  const handleResetPassword = async () => {
    setResetError('');
    setResetSuccess('');
    if (!/^\d{6}$/.test(resetCode.trim())) {
      setResetError('Enter the 6-digit code from your email.');
      return;
    }
    if (resetNewPassword.length < 6 || !/\d/.test(resetNewPassword)) {
      setResetError('Password must be at least 6 characters and include a number.');
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
      Alert.alert('Password reset', 'Your password has been reset. Please log in.');
    } else {
      setResetError(res.error || 'Failed to reset password.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Watermark />
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Knowledge' }] })}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path d="M18 6L6 18M6 6l12 12" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" />
        </Svg>
      </TouchableOpacity>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.inner}>
          <Text style={styles.title}>Log In</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={COLORS.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={COLORS.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <TouchableOpacity
              onPress={() => {
                setResetEmail(email);
                setResetModalVisible(true);
              }}
              style={styles.forgotBtn}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={COLORS.onAccent} />
              ) : (
                <Text style={styles.btnText}>Log in</Text>
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
                  <Text style={styles.googleBtnText}>Continue with Google</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.switchContainer}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.switchLabel}>
              New here? <Text style={styles.switchLink}>Create account</Text>
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            {resetError ? <Text style={styles.errorText}>{resetError}</Text> : null}
            {resetSuccess ? <Text style={styles.successText}>{resetSuccess}</Text> : null}

            {!resetCodeSent ? (
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
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
                  placeholder="6-digit code"
                  placeholderTextColor={COLORS.textMuted}
                  value={resetCode}
                  onChangeText={setResetCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <TextInput
                  style={styles.input}
                  placeholder="New password"
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
                <Text style={styles.modalCloseBtnText}>Close</Text>
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
                    {resetCodeSent ? 'Reset Password' : 'Send Code'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  closeBtn: {
    position: 'absolute',
    top: 8,
    left: 12,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
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
    marginBottom: 24,
  },
  form: {
    marginBottom: 20,
  },
  input: {
    height: 52,
    backgroundColor: COLORS.surface,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    color: COLORS.white,
    fontSize: 16,
    marginBottom: 16,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotText: {
    color: COLORS.textMuted,
    fontSize: 14,
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
    fontWeight: 'semibold',
    color: COLORS.white,
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
  errorText: {
    color: COLORS.danger,
    textAlign: 'center',
    fontSize: 14,
    marginBottom: 16,
  },
  successText: {
    color: COLORS.accent,
    textAlign: 'center',
    fontSize: 14,
    marginBottom: 16,
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
