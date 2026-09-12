import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { api } from './api';
import i18n from '../i18n';

export interface AppleAuthorization {
  challenge_id: string;
  state: string;
  identity_token: string;
  authorization_code: string;
  name?: string;
  timezone: string;
}

let inProgress = false;

/** The server nonce binds both Apple tokens to this single, short-lived attempt. */
export async function requestAppleAuthorization(
  purpose: 'login' | 'delete' = 'login',
): Promise<AppleAuthorization | null> {
  if (inProgress) return null;
  inProgress = true;
  try {
    if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
      throw new Error(i18n.t('login.appleUnavailable'));
    }
    const res = await (purpose === 'delete' ? api.appleDeleteChallenge() : api.appleChallenge());
    if (!res.ok) throw new Error(res.error || i18n.t('login.appleSignInFailed'));
    const challenge = res.data;
    if (typeof challenge?.challenge_id !== 'string' ||
        typeof challenge?.nonce !== 'string' || challenge.nonce.length !== 64 ||
        typeof challenge?.state !== 'string' || challenge.state.length !== 64) {
      throw new Error(i18n.t('login.appleSignInFailed'));
    }
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: challenge.nonce,
      state: challenge.state,
    });
    if (credential.state !== challenge.state || !credential.identityToken || !credential.authorizationCode) {
      throw new Error(i18n.t('login.appleSignInFailed'));
    }
    return {
      challenge_id: challenge.challenge_id,
      state: challenge.state,
      identity_token: credential.identityToken,
      authorization_code: credential.authorizationCode,
      name: credential.fullName ? AppleAuthentication.formatFullName(credential.fullName) : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  } catch (error) {
    if ((error as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return null;
    // Native errors can contain account details; only show our own translated copy.
    if ((error as { code?: string })?.code) throw new Error(i18n.t('login.appleSignInFailed'));
    throw error;
  } finally {
    inProgress = false;
  }
}
