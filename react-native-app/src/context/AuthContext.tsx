import React, { createContext, useContext, useState, useEffect } from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setApiToken } from '../services/api';
import { getDBUser, saveDBUser, clearUserData } from '../db/queries';

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

    // Save to SQLite
    await saveDBUser({
      id: userPayload.id,
      name: userPayload.name,
      email: userPayload.email,
      google_id: userPayload.google_id || null,
      is_admin: userPayload.is_admin ? 1 : 0,
      level_id: userPayload.level_id || 1,
      level_started_days: userPayload.level_started_days || 0,
      onboarded_at: userPayload.onboarded_at || null,
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
      onboarded: !!userPayload.onboarded_at,
      timezone: userPayload.timezone || null,
    };

    setUser(localUser);
  };

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    const res = await api.login({ email, password });
    setIsLoading(false);

    if (res.ok && res.data?.success) {
      await handleAuthResponse(res.data);
      return { success: true };
    }
    return { success: false, error: res.error || 'Login failed' };
  };

  const register = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    const res = await api.register({ name, email, password });
    setIsLoading(false);

    if (res.ok && res.data?.success) {
      await handleAuthResponse(res.data);
      return { success: true };
    }
    return { success: false, error: res.error || 'Registration failed' };
  };

  const redeemGoogleLogin = async (googleRedeemToken: string) => {
    setIsLoading(true);
    const res = await api.googleRedeem(googleRedeemToken);
    setIsLoading(false);

    if (res.ok && res.data?.success) {
      await handleAuthResponse(res.data);
      return { success: true };
    }
    return { success: false, error: res.error || 'Google login failed' };
  };

  const logout = async () => {
    setIsLoading(true);
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
