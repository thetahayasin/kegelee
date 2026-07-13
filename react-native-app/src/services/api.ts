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

const request = async (endpoint: string, method: 'GET' | 'POST', body?: any) => {
  const url = `${activeApiBase}/v1${endpoint}`;
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  if (activeToken) {
    headers['X-User-Token'] = activeToken;
  }

  const options: RequestInit = {
    method,
    headers,
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
      } catch (e) {
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
      error: error.message || 'Network request failed',
    };
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
  googleRedeem: (token: string) => request('/auth/google/redeem', 'POST', { token }),

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
