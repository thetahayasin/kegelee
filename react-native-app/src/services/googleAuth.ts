import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { api, getWebBaseUrl } from './api';
import { getAppSetting, saveAppSetting } from '../db/queries';
import { reportError } from './errors';

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
  | { status: 'unavailable'; reason: string }
  /**
   * The native picker cannot work in THIS build, and never will until someone
   * fixes the Cloud console.
   *
   * Google's DEVELOPER_ERROR (code 10) means the Android OAuth client does not
   * match the app that is asking: wrong SHA-1, wrong package name, or a client
   * created in a different project than the web client whose id we send. It
   * was being folded in with 'unavailable', which is the bucket for a device
   * that legitimately cannot do native sign-in - so a release signed with the
   * wrong key looked exactly like a phone without Play Services, and every
   * user silently fell through to the browser instead of anyone finding out.
   *
   * Callers should treat it as 'unavailable' (fall back to the browser flow) -
   * the difference is that this one is logged as an error, because it is one.
   */
  | { status: 'misconfigured'; reason: string };

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
    const reason =
      (isErrorWithCode(error) && String(error.code)) || error?.message || 'unknown';

    // DEVELOPER_ERROR is reported as code 10 by the Android SDK. The constant
    // is read through an index because it is Android-only and the library's
    // cross-platform type does not declare it; the literal 10 is the fallback,
    // and is the part Google's own documentation guarantees.
    const developerErrorCode = (statusCodes as Record<string, unknown>).DEVELOPER_ERROR;
    const developerError =
      isErrorWithCode(error) &&
      ((developerErrorCode !== undefined && error.code === developerErrorCode) ||
        String(error.code) === '10');

    if (developerError) {
      reportError(
        new Error(`Google native sign-in is misconfigured for this build (code ${reason})`),
        'googleAuth:developer-error',
      );
      return { status: 'misconfigured', reason };
    }

    // Surfaced in adb logcat / metro.
    console.warn('[googleAuth] native sign-in failed', error?.code, error?.message);
    return { status: 'unavailable', reason };
  }
};

/**
 * Where the one-time value that ties a browser sign-in to THIS app lives.
 *
 * The Custom-Tab flow comes back through a deeplink carrying a token that
 * establishes a session. Any app on the device can register the same
 * `kegelee://` scheme and any web page can navigate to it, so on its own that
 * deeplink is "here is a session, please sign in as it" from an unauthenticated
 * source. Generating a value before opening the browser and requiring the
 * callback to carry it back means the app only accepts a redirect that answers
 * a sign-in IT started.
 */
const GOOGLE_STATE_KEY = '@google_oauth_state';

/**
 * Not a cryptographic nonce, and it does not need to be.
 *
 * There is no CSPRNG wired into this app. What this value has to do is be
 * unguessable by a page that wants to hand us a session - and it is
 * short-lived, single-use, and never leaves the device except in the URL the
 * user's own browser was sent to.
 */
const newNonce = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;

/**
 * Open the browser (Custom Tab) Google flow, remembering who asked.
 *
 * The nonce is written BEFORE the browser opens, because the callback can
 * arrive before this promise's caller resumes - a redirect that lands with
 * nothing stored would be rejected as unsolicited.
 */
export const openGoogleBrowserSignIn = async (): Promise<void> => {
  const nonce = newNonce();
  try {
    await AsyncStorage.setItem(GOOGLE_STATE_KEY, nonce);
  } catch {}
  await Linking.openURL(
    `${getWebBaseUrl()}/auth/google/native?state=${encodeURIComponent(nonce)}`,
  );
};

/**
 * Read and clear the pending nonce. Single use: a redirect replayed a second
 * time finds nothing waiting and is refused.
 */
export const consumeGoogleNonce = async (): Promise<string | null> => {
  try {
    const stored = await AsyncStorage.getItem(GOOGLE_STATE_KEY);
    await AsyncStorage.removeItem(GOOGLE_STATE_KEY).catch(() => {});
    return stored;
  } catch {
    return null;
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
