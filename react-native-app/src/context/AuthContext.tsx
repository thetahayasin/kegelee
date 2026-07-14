import React, { createContext, useContext, useState, useEffect } from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';
import { api, setApiToken } from '../services/api';
import { getDBUser, saveDBUser, clearUserData } from '../db/queries';
import { syncNow } from '../services/sync';
import { cancelAllReminders } from '../services/reminders';

export interface User {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
  level_id: number;
  level_started_days: number;
  onboarded: boolean;
  timezone: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  onboarded: boolean;
  setOnboarded: (val: boolean) => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  completeAuth: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  redeemGoogleLogin: (token: string) => Promise<{ success: boolean; error?: string }>;
  updateUserFields: (fields: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [onboarded, setOnboardedState] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize Auth State from storage & DB
  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        // Read onboarding flag
        const onboardVal = await AsyncStorage.getItem('@onboarded');
        setOnboardedState(onboardVal === 'true');

        // Check active token
        const storedToken = await AsyncStorage.getItem('@api_token');
        if (storedToken) {
          setToken(storedToken);
          setApiToken(storedToken);

          // Get user from SQLite local cache
          const cachedUser = await getDBUser();
          if (cachedUser) {
            setUser({
              id: cachedUser.id,
              name: cachedUser.name,
              email: cachedUser.email,
              is_admin: cachedUser.is_admin === 1,
              level_id: cachedUser.level_id,
              level_started_days: cachedUser.level_started_days,
              onboarded: cachedUser.onboarded_at !== null,
              timezone: cachedUser.timezone,
            });
          }
        }
      } catch (e) {
        console.error('Failed to restore auth session', e);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrapAsync();
  }, []);

  const setOnboarded = async (val: boolean) => {
    setOnboardedState(val);
    await AsyncStorage.setItem('@onboarded', val ? 'true' : 'false');
  };

  const handleAuthResponse = async (data: any) => {
    const userPayload = data.user;
    const apiToken = userPayload.api_token;

    // Cache locally
    await AsyncStorage.setItem('@api_token', apiToken);
    setToken(apiToken);
    setApiToken(apiToken);

    // "Learn the basics" is per ACCOUNT: the backend's onboarded_at is the only
    // source of truth for whether this user has finished it. We deliberately do
    // NOT carry guest basics progress into the account, so every newly registered
    // user is routed through Learn the basics before the dashboard (a fresh
    // account comes back with onboarded_at = null). Drop any guest progress so it
    // can't mark the account onboarded or pre-fill its lesson checkmarks.
    const onboardedAt = userPayload.onboarded_at || null;
    try {
      await AsyncStorage.removeItem('@basics_done_guest');
    } catch (e) {}

    // Save to SQLite
    await saveDBUser({
      id: userPayload.id,
      name: userPayload.name,
      email: userPayload.email,
      google_id: userPayload.google_id || null,
      is_admin: userPayload.is_admin ? 1 : 0,
      level_id: userPayload.level_id || 1,
      level_started_days: userPayload.level_started_days || 0,
      onboarded_at: onboardedAt,
      timezone: userPayload.timezone || null,
      api_token: apiToken,
    });

    const localUser: User = {
      id: userPayload.id,
      name: userPayload.name,
      email: userPayload.email,
      is_admin: !!userPayload.is_admin,
      level_id: userPayload.level_id || 1,
      level_started_days: userPayload.level_started_days || 0,
      onboarded: onboardedAt !== null,
      timezone: userPayload.timezone || null,
    };

    setUser(localUser);

    // Request notification permission and trigger background sync
    try {
      await notifee.requestPermission();
    } catch (e) {
      console.warn('Failed to request Notifee notification permission', e);
    }

    // Clear any reminders left over from a previously signed-in user before the
    // sync below reschedules this account's own reminders from the backend. This
    // covers both login and first-time register ("getting started"), so a new
    // user never inherits the previous person's notifications.
    await cancelAllReminders();

    syncNow(userPayload.id).catch(e => {
      console.error('Failed to run initial sync on login', e);
    });
  };

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const res = await api.login({ email, password, timezone: tz });
    setIsLoading(false);

    if (res.ok && res.data?.success) {
      await handleAuthResponse(res.data);
      return { success: true };
    }
    return { success: false, error: res.error || 'Login failed' };
  };

  const register = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const res = await api.register({ name, email, password, timezone: tz });
    setIsLoading(false);

    if (res.ok && res.data?.success) {
      // Deliberately do NOT authenticate yet. Signing in here would swap the
      // navigator away from the auth stack and unmount the VerifyEmail screen
      // before the user can enter their code. The session starts when the code
      // is verified (completeAuth from VerifyEmailScreen).
      return { success: true };
    }
    return { success: false, error: res.error || 'Registration failed' };
  };

  // Establish the session from an auth payload obtained outside login/register
  // (e.g. the email-verification endpoint, which returns the same user+token
  // shape). Used by VerifyEmailScreen to sign the user in after their code is
  // accepted.
  const completeAuth = async (data: any) => {
    await handleAuthResponse(data);
  };

  const redeemGoogleLogin = async (googleRedeemToken: string) => {
    setIsLoading(true);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const res = await api.googleRedeem(googleRedeemToken, tz);
    setIsLoading(false);

    if (res.ok && res.data?.success) {
      await handleAuthResponse(res.data);
      return { success: true };
    }
    return { success: false, error: res.error || 'Google login failed' };
  };

  const logout = async () => {
    setIsLoading(true);

    // Cancel this device's scheduled reminders so the next user who signs in
    // does not inherit the previous account's notifications.
    await cancelAllReminders();

    // Drop every cached "learn the basics" progress key (per-user and guest) so a
    // different account signing in on this device always starts the basics fresh
    // instead of showing another user's lessons as already completed.
    try {
      const keys = await AsyncStorage.getAllKeys();
      const basicsKeys = keys.filter(k => k.startsWith('@basics_done_'));
      if (basicsKeys.length > 0) {
        await AsyncStorage.removeMany(basicsKeys);
      }
    } catch (e) {}

    // Clear storage keys
    await AsyncStorage.removeItem('@api_token');
    setToken(null);
    setApiToken(null);
    setUser(null);

    // Clear SQLite tables
    await clearUserData();
    setIsLoading(false);
  };

  const updateUserFields = async (fields: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...fields };
    setUser(updated);

    // Persist to local SQLite user cache
    await saveDBUser({
      level_id: updated.level_id,
      level_started_days: updated.level_started_days,
      timezone: updated.timezone,
      onboarded_at: updated.onboarded ? new Date().toISOString() : null,
    });
  };

  // Google sign-in returns from the Custom Tab through the app deeplink
  // (kegelee://auth/google/finish?token=..). Redeem the one-time token here so
  // the session is established no matter which screen is on top.
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url || !url.includes('auth/google/finish')) {
        return;
      }
      const tokenMatch = url.match(/[?&]token=([^&#]+)/);
      if (tokenMatch) {
        redeemGoogleLogin(decodeURIComponent(tokenMatch[1]));
      }
    };
    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        onboarded,
        setOnboarded,
        login,
        register,
        completeAuth,
        logout,
        redeemGoogleLogin,
        updateUserFields,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
