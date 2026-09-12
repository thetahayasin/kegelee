import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { requestAppleAuthorization } from '../services/appleAuth';

export function AppleSignInButton({ onError, disabled = false }: {
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const { completeAuth } = useAuth();
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let mounted = true;
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(value => {
        if (mounted) setAvailable(value);
      }).catch(() => {});
    }
    return () => { mounted = false; };
  }, []);

  const signIn = async () => {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    onError('');
    try {
      const authorization = await requestAppleAuthorization();
      if (!authorization) return;
      const res = await api.appleToken(authorization);
      if (!res.ok || !res.data?.user?.api_token) {
        throw new Error(res.error || t('login.appleSignInFailed'));
      }
      await completeAuth(res.data);
    } catch (error) {
      onError(error instanceof Error ? error.message : t('login.appleSignInFailed'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  if (!available) return null;
  return (
    <View style={styles.container} pointerEvents={busy || disabled ? 'none' : 'auto'}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
        cornerRadius={12}
        style={styles.button}
        onPress={signIn}
        accessibilityState={{ disabled: busy || disabled, busy }}
      />
      {busy && <ActivityIndicator style={styles.spinner} color="#000000" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  button: { width: '100%', height: 48 },
  spinner: { position: 'absolute', right: 16, top: 14 },
});
