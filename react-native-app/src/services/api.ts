import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';
import { saveDBUser } from '../db/queries';

// Default to production API URL. Can be modified for local dev.
const DEFAULT_API_BASE = 'https://kegelee.com/api';
let activeApiBase = DEFAULT_API_BASE;
let activeToken: string | null = null;

export const setApiBaseUrl = (url: string) => {
  activeApiBase = url.replace(/\/$/, '');
};

export const getApiBaseUrl = () => activeApiBase;

// Web origin (no /api suffix) - used to open server-rendered flows like the
// Google OAuth Custom Tab (/auth/google/native).
export const getWebBaseUrl = () => activeApiBase.replace(/\/api\/?$/, '');

export const setApiToken = (token: string | null) => {
  activeToken = token;
};

// getApiToken and initApi used to live here. Nothing called either: the token
// is set by AuthContext the moment the session is restored, and the base URL
// override was a development affordance that no screen ever read. A getter
// nobody calls is a second source of truth waiting to disagree with the first.

/**
 * Why the request failed, in terms the UI can translate.
 *
 * Screens were showing `error.message` straight from fetch, which on Android
 * is an untranslated, unhelpful string like "Network request failed" - and on
 * some devices a stack-shaped one. The message is still returned for logs;
 * this is the part a screen is allowed to switch on.
 *
 *   network - the request never got an answer (offline, DNS, timeout).
 *   server  - it reached us and we broke (5xx, unreadable body).
 *   unknown - anything else, including a 4xx whose own message should be shown.
 */
export type ApiErrorKey = 'network' | 'server' | 'unknown';

/**
 * Deliberately NOT a discriminated union on `ok`.
 *
 * Callers all over the app read `res.error` and `res.data?.x` without
 * narrowing first, and a union would turn that into a wall of type errors for
 * no behavioural gain. Every field is optional instead, which is the truth
 * about this shape anyway.
 */
export interface ApiResult {
  ok: boolean;
  status: number;
  data?: any;
  error?: string;
  errors?: any;
  errorKey?: ApiErrorKey;
}

// Hard cap per request: fetch has NO timeout of its own, so on a dead
// connection a request (and everything serialized behind it, like the sync
// engine's in-flight lock) would otherwise hang indefinitely.
const REQUEST_TIMEOUT_MS = 20000;

const request = async (
  endpoint: string,
  method: 'GET' | 'POST',
  body?: any,
): Promise<ApiResult> => {
  const url = `${activeApiBase}/v1${endpoint}`;
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  if (activeToken) {
    headers['X-User-Token'] = activeToken;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const options: RequestInit = {
    method,
    headers,
    signal: controller.signal,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const text = await response.text();
    let json: any = {};
    let unreadable = false;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        // A body we cannot read is the server misbehaving, not the network.
        unreadable = true;
        json = { error: i18n.t('errors.invalidServerResponse') };
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: json.error || json.message || i18n.t('errors.requestFailed'),
        errors: json.errors,
        // A 4xx carries its own message and the screen should show that;
        // 'unknown' says "there is nothing generic to say here".
        errorKey: response.status >= 500 || unreadable ? 'server' : 'unknown',
      };
    }

    return {
      ok: true,
      status: response.status,
      data: json,
    };
  } catch (error: any) {
    // Nothing came back at all. fetch rejects for every reason there is - no
    // connection, DNS, TLS, our own abort - and none of them are
    // distinguishable to a user, so they are one key.
    return {
      ok: false,
      status: 0,
      errorKey: 'network',
      error:
        error?.name === 'AbortError'
          ? i18n.t('errors.requestTimedOut')
          : error?.message || i18n.t('errors.networkRequestFailed'),
    };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Adopt a token the server just rotated.
 *
 * Changing the password invalidates every other session, including this
 * device's own - the backend hands back a fresh api_token in the same
 * response and the old one stops working immediately. Without taking it here,
 * the very next request 401s, sync emits an auth failure, and AuthContext
 * logs the user out for successfully changing their password.
 *
 * All three places the token lives are updated: the in-memory header used by
 * the next request, AsyncStorage (which the bootstrap reads on a cold start),
 * and the users row. Storage failures are swallowed on purpose - the session
 * in memory is already correct, and a write that failed is a worse reason to
 * fail the password change than no reason at all.
 */
const adoptRotatedToken = async (data: any): Promise<void> => {
  const rotated =
    typeof data?.api_token === 'string' && data.api_token
      ? data.api_token
      : typeof data?.user?.api_token === 'string' && data.user.api_token
        ? data.user.api_token
        : null;
  if (!rotated || rotated === activeToken) return;
  setApiToken(rotated);
  try {
    await AsyncStorage.setItem('@api_token', rotated);
  } catch {}
  try {
    await saveDBUser({ api_token: rotated });
  } catch {}
};

export const api = {
  // Auth endpoints
  login: (body: any) => request('/auth/login', 'POST', body),
  register: (body: any) => request('/auth/register', 'POST', body),
  changePassword: async (body: any): Promise<ApiResult> => {
    const res = await request('/auth/change-password', 'POST', body);
    // Before resolving, so the caller's next request already carries it.
    if (res.ok) await adoptRotatedToken(res.data);
    return res;
  },
  verifyEmail: (body: any) => request('/auth/verify', 'POST', body),
  resendVerification: (body: any) => request('/auth/resend', 'POST', body),
  requestResetPasswordCode: (body: any) => request('/auth/reset-code', 'POST', body),
  resetPassword: (body: any) => request('/auth/reset', 'POST', body),
  googleRedeem: (token: string, timezone?: string) => request('/auth/google/redeem', 'POST', { token, timezone }),
  // Fully native Google sign-in: post the ID token from the native account
  // picker; the backend verifies it and returns the standard auth payload.
  googleToken: (idToken: string, timezone?: string) =>
    request('/auth/google/token', 'POST', { id_token: idToken, timezone }),

  // User actions
  deleteAccountCode: () => request('/user/delete-code', 'POST'),
  deleteAccount: (code: string) => request('/user/delete', 'POST', { code }),
  resetProgress: () => request('/user/reset', 'POST'),

  // Sync operations
  pushState: (payload: any) => request('/user/push', 'POST', payload),
  pullState: () => request('/user/pull', 'GET'),

  // Public content fallback.
  //
  // `locale` is the device's current language. The backend serves each legal
  // page in that language where a translation exists and falls back to English
  // per page, so a partly-translated set never yields a blank policy.
  pullContent: (locale?: string) =>
    request(`/content${locale ? `?locale=${encodeURIComponent(locale)}` : ''}`, 'GET'),
  pullPage: (slug: string, locale?: string) =>
    request(`/pages/${slug}${locale ? `?locale=${encodeURIComponent(locale)}` : ''}`, 'GET'),
};
