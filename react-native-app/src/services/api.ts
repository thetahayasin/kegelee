import AsyncStorage from '@react-native-async-storage/async-storage';

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

export const getApiToken = () => activeToken;

// Init API settings from AsyncStorage
export const initApi = async () => {
  const customUrl = await AsyncStorage.getItem('@api_base_url');
  if (customUrl) {
    activeApiBase = customUrl;
  }
  const token = await AsyncStorage.getItem('@api_token');
  if (token) {
    activeToken = token;
  }
};

// Hard cap per request: fetch has NO timeout of its own, so on a dead
// connection a request (and everything serialized behind it, like the sync
// engine's in-flight lock) would otherwise hang indefinitely.
const REQUEST_TIMEOUT_MS = 20000;

const request = async (endpoint: string, method: 'GET' | 'POST', body?: any) => {
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
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { error: 'Invalid server response' };
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: json.error || json.message || 'Request failed',
        errors: json.errors,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: json,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      error:
        error?.name === 'AbortError'
          ? 'Request timed out. Check your internet connection and try again.'
          : error.message || 'Network request failed',
    };
  } finally {
    clearTimeout(timer);
  }
};

export const api = {
  // Auth endpoints
  login: (body: any) => request('/auth/login', 'POST', body),
  register: (body: any) => request('/auth/register', 'POST', body),
  changePassword: (body: any) => request('/auth/change-password', 'POST', body),
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

  // Public content fallback
  pullContent: () => request('/content', 'GET'),
  pullPage: (slug: string) => request(`/pages/${slug}`, 'GET'),
};
