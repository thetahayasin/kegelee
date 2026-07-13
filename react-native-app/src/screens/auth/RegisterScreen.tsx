import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS } from '../../theme/colors';
import { getWebBaseUrl } from '../../services/api';
import Svg, { Path } from 'react-native-svg';
import { Watermark } from '../../components/Watermark';

export const RegisterScreen = () => {
  const navigation = useNavigation<NavigationProp<any>>();
  const { register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleRegister = async () => {
    setError('');
    if (!name || !email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    // simple regex to check for a digit in password matching laravel validation
    if (!/\d/.test(password)) {
      setError('Password must contain at least one number.');
      return;
    }

    setLoading(true);
    const res = await register(name.trim(), email.trim().toLowerCase(), password);
    setLoading(false);

    if (res.success) {
      // Successfully registered. Now redirect to verification screen.
      navigation.navigate('VerifyEmail', { email: email.trim().toLowerCase() });
    } else {
      setError(res.error || 'Registration failed.');
    }
  };

  const handleGoogleSignup = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      // Same backend Custom-Tab flow as login; Google finds-or-creates the user.
      await Linking.openURL(`${getWebBaseUrl()}/auth/google/native`);
    } catch (e) {
      setError('Could not open Google sign-up. Please try again.');
    } finally {
      setGoogleLoading(false);
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
          <Text style={styles.title}>Create Account</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

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

            <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={COLORS.onAccent} />
              ) : (
                <Text style={styles.btnText}>Create account</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
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
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchContainer}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.switchLabel}>
              Already have an account? <Text style={styles.switchLink}>Log in</Text>
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
  btn: {
    backgroundColor: COLORS.accent,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.onAccent,
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
  },
  errorText: {
    color: COLORS.danger,
    textAlign: 'center',
    fontSize: 14,
    marginBottom: 16,
  },
});
