import React, { createContext, useContext, useState, useEffect } from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';
import { api, setApiToken } from '../services/api';
import { getDBUser, saveDBUser, clearUserData, getWorkoutSessionsCount, getActiveSubscription } from '../db/queries';
import { syncNow, onSyncComplete } from '../services/sync';
import { cancelAllReminders } from '../services/reminders';
import { googleNativeSignOut } from '../services/googleAuth';
import { BASICS_LESSONS } from '../constants/basics';

const REQUIRED_LESSON_SLUGS = BASICS_LESSONS.map((l) => l.slug);

// Durable "gate is open" marker per account. Written when the user finishes
// the basics on this device AND when a sign-in payload says the account
// already cleared them (basics_completed) - so the gate is right immediately
// and across cold starts, without waiting for a sync. Named under the
// @basics_done_ prefix so logout's key sweep clears it with the lesson data.
const basicsGateKey = (userId: number) => `@basics_done_gate_${userId}`;

// Whether this account is past "Learn the basics": the persisted gate marker,
// all three lessons recorded locally (kept in step with the backend's
// completed_lessons by every sync), local training history, or admin. This is
// the ONLY gate signal - deliberately NOT the backend onboarded_at, which is
// set on Google sign-up before the lessons are ever done.
const computeBasicsDone = async (userId: number, isAdmin: boolean): Promise<boolean> => {
  if (isAdmin) return true;
  try {
    if ((await AsyncStorage.getItem(basicsGateKey(userId))) === '1') return true;
  } catch (e) {}
  try {
    const raw = await AsyncStorage.getItem(`@basics_done_${userId}`);
    const done: string[] = raw ? JSON.parse(raw) : [];
    if (REQUIRED_LESSON_SLUGS.every((s) => done.includes(s))) return true;
  } catch (e) {}
  try {
    if ((await getWorkoutSessionsCount(userId)) > 0) return true;
  } catch (e) {}
  return false;
};

// Whether this account may pass the subscription gate: an active/trialing
// subscription (or a canceled one whose paid period hasn't ended) in the
// local subscriptions table, kept current by every sync. Admins bypass the
// gate so they can preview the app - the same rule as the web's
// EnsureSubscribed middleware.
const computeSubscribed = async (userId: number, isAdmin: boolean): Promise<boolean> => {
  if (isAdmin) return true;
  try {
    return !!(await getActiveSubscription(userId));
  } catch (e) {
    return false;
  }
};

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
  // Gate for the authenticated app: false = user is held on "Learn the basics"
  // until they finish it, true = the main app is unlocked.
  basicsDone: boolean;
  markBasicsDone: () => void;
  // Subscription gate, checked BEFORE the basics gate (web middleware order
  // ['subscribed', 'basics']): false = the paywall is the whole app.
  subscribed: boolean;
  markSubscribed: () => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  completeAuth: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  redeemGoogleLogin: (token: string) => Promise<{ success: boolean; error?: string }>;
  googleNativeLogin: (idToken: string) => Promise<{ success: boolean; error?: string }>;
  updateUserFields: (fields: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [onboarded, setOnboardedState] = useState<boolean>(false);
  const [basicsDone, setBasicsDone] = useState<boolean>(false);
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  // Instant access right after a Play purchase completes (the local
  // subscription row is already written): flip the gate without waiting for
  // a sync round-trip, like the web's local-record-then-redirect.
  const markSubscribed = () => setSubscribed(true);

  const markBasicsDone = () => {
    setBasicsDone(true);
    // Persist the gate marker and the full lesson set, so the next cold
    // start's computeBasicsDone agrees with this decision even if one lesson's
    // own AsyncStorage write was missed. This is what keeps a finished user
    // going STRAIGHT to Training on every app open - never back to the list.
    if (user) {
      AsyncStorage.setItem(basicsGateKey(user.id), '1').catch(() => {});
      AsyncStorage.setItem(
        `@basics_done_${user.id}`,
        JSON.stringify(REQUIRED_LESSON_SLUGS),
      ).catch(() => {});
    }
  };

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
            // Decide the gates before we drop the splash, so a restored
            // session lands on the right screen with no dashboard flash. The
            // subscription gate reads the locally cached subscription rows,
            // so it is right even fully offline.
            const [nextSubscribed, nextBasics] = await Promise.all([
              computeSubscribed(cachedUser.id, cachedUser.is_admin === 1),
              computeBasicsDone(cachedUser.id, cachedUser.is_admin === 1),
            ]);
            setSubscribed(nextSubscribed);
            setBasicsDone(nextBasics);
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

    // Decide the basics gate BEFORE revealing the authenticated navigator. The
    // sign-in payload's basics_completed (admin / lessons done / training
    // history, computed server-side) is authoritative for a RETURNING account;
    // honoring it here sends the user straight to Training. A fresh account (or
    // an older backend without the field) falls back to the local compute,
    // which for a new user is correctly false. Persist the marker so cold
    // starts agree even before the first sync lands.
    let nextBasicsDone: boolean;
    if (userPayload.basics_completed === true) {
      try {
        await AsyncStorage.setItem(basicsGateKey(localUser.id), '1');
      } catch (e) {}
      nextBasicsDone = true;
    } else {
      nextBasicsDone = await computeBasicsDone(localUser.id, localUser.is_admin);
    }

    // Subscription gate seed: the sign-in payload's is_subscribed (computed
    // server-side, like basics_completed) is authoritative at this moment -
    // the local subscriptions table is still empty until the first sync
    // pulls the rows down. A subscribed returning user goes straight in; an
    // unsubscribed one lands on the paywall, exactly like the web login flow.
    const nextSubscribed =
      localUser.is_admin || userPayload.is_subscribed === true;

    // Reveal the app. setUser flips isAuthenticated to true; pairing it with the
    // gate values in the SAME tick (no await between the setState calls)
    // batches them into ONE render, so the authenticated navigator mounts
    // directly on the correct stack - no "Learn the basics" flash behind the
    // notification permission dialog while basicsDone catches up.
    setSubscribed(nextSubscribed);
    setBasicsDone(nextBasicsDone);
    setUser(localUser);

    // Migrate guest basics lessons progress to the logged-in user
    AsyncStorage.getItem('@basics_done_guest')
      .then(async guestProgress => {
        if (guestProgress) {
          const userProgressKey = `@basics_done_${localUser.id}`;
          const existingUserProgress = await AsyncStorage.getItem(userProgressKey);
          if (!existingUserProgress) {
            await AsyncStorage.setItem(userProgressKey, guestProgress);
          } else {
            const guestLessons: string[] = JSON.parse(guestProgress);
            const userLessons: string[] = JSON.parse(existingUserProgress);
            const merged = Array.from(new Set([...userLessons, ...guestLessons]));
            await AsyncStorage.setItem(userProgressKey, JSON.stringify(merged));
          }
        }
      })
      .catch(e => console.warn('Failed to migrate guest progress:', e));

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

    syncNow(userPayload.id)
      .catch(e => {
        console.error('Failed to run initial sync on login', e);
      })
      .finally(async () => {
        // Once this account's completed lessons / training history have landed
        // locally, re-evaluate the gate so a returning user who already finished
        // the basics unlocks the app without having to reopen it. RAISE-only:
        // never set false here - the user may have completed the basics on this
        // device while the sync was in flight (markBasicsDone already opened
        // the app), and lowering the gate would yank them back to the lessons.
        try {
          if (await computeBasicsDone(localUser.id, localUser.is_admin)) {
            setBasicsDone(true);
          }
        } catch (e) {}
        // Subscription gate: the pull just landed the account's subscription
        // rows in SQLite, so recompute from them. RAISE-only, like the basics
        // gate above: a purchase completed on the paywall while this sync was
        // in flight already opened the gate, and lowering it here would yank
        // the user back to the paywall (the onSyncComplete listener handles
        // genuine revocations on LATER syncs, once the local row exists).
        try {
          if (await computeSubscribed(localUser.id, localUser.is_admin)) {
            setSubscribed(true);
          }
        } catch (e) {}
      });
  };

  const login = async (email: string, password: string) => {
    // Do NOT toggle the global isLoading here. Root renders the whole
    // AppNavigator behind isLoading, so flipping it mid-call unmounts and
    // remounts the auth stack, discarding any navigation the calling screen
    // does next (e.g. Login -> VerifyEmail for an unverified account) and
    // snapping back to the initial route. The screens own their button spinners.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const res = await api.login({ email, password, timezone: tz });

    if (res.ok && res.data?.success) {
      // Client-side guard: never sign in an account whose email isn't verified,
      // even if the backend handed back a session. This holds the verify-first
      // rule on-device regardless of the server, then routes to the code screen
      // (making sure a fresh code is sent since we're not using the 403 path).
      if (!res.data.user?.email_verified_at) {
        try {
          await api.resendVerification({ email });
        } catch (e) {}
        return { success: false, error: 'unverified' };
      }
      await handleAuthResponse(res.data);
      return { success: true };
    }
    return { success: false, error: res.error || 'Login failed' };
  };

  const register = async (name: string, email: string, password: string) => {
    // See login(): never toggle the global isLoading here. Doing so remounts the
    // auth navigator during signup, throwing away the RegisterScreen's
    // navigate('VerifyEmail') and dumping the user back on the Login screen with
    // no verification step. RegisterScreen shows its own button spinner.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const res = await api.register({ name, email, password, timezone: tz });

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

  // Fully native Google sign-in: the screen obtained an ID token from the
  // native account picker; the backend verifies it and returns the standard
  // auth payload. No global isLoading toggle (see login()) - the screens own
  // their spinners, and the keyed container swaps phases once authed.
  const googleNativeLogin = async (idToken: string) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const res = await api.googleToken(idToken, tz);

    if (res.ok && res.data?.success) {
      await handleAuthResponse(res.data);
      return { success: true };
    }
    return { success: false, error: res.error || 'Google sign-in failed' };
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

    // Drop the native Google session so the next sign-in shows the account
    // picker instead of silently reusing this account.
    await googleNativeSignOut();

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
    setBasicsDone(false);
    setSubscribed(false);

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

  // Re-evaluate the subscription gate after every successful sync: the pull
  // keeps the local subscriptions table current, so this is what closes the
  // gate when a subscription expires or Google reports a cancellation via
  // RTDN (the web re-checks isSubscribed() on every navigation). It also
  // opens the gate when a pull reveals a subscription bought on another
  // device. computeSubscribed keeps the admin bypass.
  useEffect(() => {
    if (!user) return;
    const off = onSyncComplete((syncedUserId) => {
      if (syncedUserId !== user.id) return;
      computeSubscribed(user.id, user.is_admin)
        .then(setSubscribed)
        .catch(() => {});
    });
    return off;
  }, [user]);

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
        basicsDone,
        markBasicsDone,
        subscribed,
        markSubscribed,
        login,
        register,
        completeAuth,
        logout,
        redeemGoogleLogin,
        googleNativeLogin,
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
