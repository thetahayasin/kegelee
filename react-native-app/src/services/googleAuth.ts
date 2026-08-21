import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { api } from './api';
import { getAppSetting, saveAppSetting } from '../db/queries';

/**
 * Fully native Google sign-in (the system account picker - no browser).
 *
 * The SDK needs the backend's OAuth WEB client id (it becomes the ID token's
 * audience, which the backend pins during verification). It is resolved from
 * the synced app settings; guests who haven't synced yet fall back to a live
 * fetch of the public /content endpoint, and the result is cached.
 *
 * The Custom-Tab browser flow remains the callers' fallback for environments
 * where native sign-in can't run (no Play Services, missing client id).
 */

let configuredWithId: string | null = null;

/**
 * Compiled-in fallback for the backend's OAuth *web* client id. A client id is
 * public by design (it ships in every OAuth request), and baking it means a
 * device that has never synced - or one that cannot reach the content endpoint
 * while Google itself is reachable - can still use the native picker instead of
 * silently degrading to the Custom-Tab browser flow.
 */
const GOOGLE_WEB_CLIENT_ID = '692228818665-5jbf66ps860i983p1mndba11af9f9het.apps.googleusercontent.com';

const resolveWebClientId = async (): Promise<string | null> => {
  try {
    const cached = (await getAppSetting('google_web_client_id', '')).trim();
    if (cached) {
      return cached;
    }
  } catch {}

  try {
    const res = await api.pullContent();
    const id = res.ok ? String(res.data?.settings?.google_web_client_id || '').trim() : '';
    if (id) {
      try {
        await saveAppSetting('google_web_client_id', id, 'string');
      } catch {}
      return id;
    }
  } catch {}

  return GOOGLE_WEB_CLIENT_ID || null;
};

export type NativeGoogleResult =
  | { status: 'success'; idToken: string }
  | { status: 'cancelled' }
  | { status: 'unavailable'; reason: string };

export const nativeGoogleSignIn = async (): Promise<NativeGoogleResult> => {
  const webClientId = await resolveWebClientId();
  if (!webClientId) {
    return { status: 'unavailable', reason: 'no-client-id' };
  }

  try {
    if (configuredWithId !== webClientId) {
      GoogleSignin.configure({ webClientId });
      configuredWithId = webClientId;
    }

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Drop any remembered choice first so the account picker always shows -
    // otherwise a previous session's account is silently reused, and there is
    // no way to sign in with a different one.
    try {
      await GoogleSignin.signOut();
    } catch {}

    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') {
      return { status: 'cancelled' };
    }

    let idToken = response.data?.idToken || (response as any)?.idToken;
    if (!idToken) {
      try {
        const tokens = await GoogleSignin.getTokens();
        idToken = tokens?.idToken;
      } catch {}
    }

    if (!idToken) {
      console.warn('[googleAuth] signIn succeeded but returned no idToken');
      return { status: 'unavailable', reason: 'no-id-token' };
    }
    return { status: 'success', idToken };
  } catch (error: any) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
      return { status: 'cancelled' };
    }
    // Surfaced in adb logcat / metro. Code 10 (DEVELOPER_ERROR) = the Android
    // OAuth client doesn't match this build: wrong SHA-1, wrong package, or
    // created in a different Cloud project than the web client.
    console.warn('[googleAuth] native sign-in failed', error?.code, error?.message);
    return {
      status: 'unavailable',
      reason: (isErrorWithCode(error) && String(error.code)) || error?.message || 'unknown',
    };
  }
};

/** Best-effort native session drop (used at logout so accounts can switch). */
export const googleNativeSignOut = async (): Promise<void> => {
  try {
    if (configuredWithId) {
      await GoogleSignin.signOut();
    }
  } catch {}
};
