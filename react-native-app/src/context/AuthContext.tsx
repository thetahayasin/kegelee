import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';
import { api, setApiToken } from '../services/api';
import { getDBUser, saveDBUser, clearUserData, getWorkoutSessionsCount, getActiveSubscription, getSubscriptions } from '../db/queries';
import { syncNow, onSyncComplete, onAuthFailure } from '../services/sync';
import { cancelAllReminders } from '../services/reminders';
import { googleNativeSignOut } from '../services/googleAuth';
import { logoutBilling, onCustomerInfoChange, hasActiveEntitlement, refreshCustomerInfo, purchaseRecordedAt } from '../services/billing';
import { BASICS_LESSONS } from '../constants/basics';
import i18n from '../i18n';

const REQUIRED_LESSON_SLUGS = BASICS_LESSONS.map((l) => l.slug);

/**
 * Where OnboardingScreen leaves the quiz result until there is an account.
 *
 * Declared here rather than in the screen because SubscribeSheet - which the
 * screen renders - imports this context, so importing the other way round
 * would close a cycle.
 */
export const ONBOARDING_QUIZ_KEY = '@onboarding_quiz';

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
  } catch {}
  try {
    const raw = await AsyncStorage.getItem(`@basics_done_${userId}`);
    const done: string[] = raw ? JSON.parse(raw) : [];
    if (REQUIRED_LESSON_SLUGS.every((s) => done.includes(s))) return true;
  } catch {}
  try {
    if ((await getWorkoutSessionsCount(userId)) > 0) return true;
  } catch {}
  return false;
};

// Whether this account may pass the subscription gate: an active/trialing
// subscription (or a canceled one whose paid period hasn't ended) in the
// local subscriptions table, kept current by every sync. Admins bypass the
// gate so they can preview the app - the same rule as the web's
// EnsureSubscribed middleware.
// How long an optimistic, server-unconfirmed purchase keeps access.
//
// recordCompletedPurchase grants immediately, so nobody waits on a round trip
// to start training. The backend acknowledges through the sync push and the
// RevenueCat webhook, and an acknowledged row comes back from the pull with a
// plan_id set.
//
// 72h is far beyond any legitimate acknowledgement delay - the push goes out
// seconds after the purchase - while bounding a grant the server never
// recognises to three days instead of the twelve months a yearly plan's
// ends_at would otherwise allow. Erring long is deliberate: the cost of
// waiting is a few free days, the cost of being early is locking out someone
// who actually paid.
const UNVERIFIED_GRACE_MS = 72 * 60 * 60 * 1000;

const computeSubscribed = async (userId: number, isAdmin: boolean): Promise<boolean> => {
  if (isAdmin) return true;
  try {
    return !!(await getActiveSubscription(userId));
  } catch {
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
  // Stable identity: PaywallScreen calls this from a useCallback-memoised
  // purchase handler, and a fresh function every render would either
  // invalidate that memo or sit in the deps array as a lint error.
  const markSubscribed = useCallback(() => setSubscribed(true), []);

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

    const onboardedAt = userPayload.onboarded_at || null;

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

    // Carry "Learn the basics" progress from the guest session into the
    // account, BEFORE the gate is computed below.
    //
    // The three lessons are the same three screens with or without an account,
    // and the guest funnel deliberately puts them FIRST: read the basics, then
    // the plans sheet asks you to sign up. Signing up used to wipe the guest
    // key, so the reward for converting was doing the whole thing a second
    // time, starting from a locked lesson 2 and 3. Merge instead - a union, so
    // an existing account's own progress can only grow, never be overwritten
    // by a thinner guest set.
    //
    // Awaited on purpose: computeBasicsDone below reads this very key, so
    // writing it first is what lets a guest who finished all three land
    // directly on Training instead of flashing the basics gate. Nothing is
    // given away - the paywall gate runs BEFORE the basics gate - and the
    // login-time sync further down pushes the merged set as completed_lessons,
    // which is what makes it stick server-side for the next device.
    try {
      const guestRaw = await AsyncStorage.getItem('@basics_done_guest');
      if (guestRaw) {
        const parse = (raw: string | null): string[] => {
          try {
            const v = raw ? JSON.parse(raw) : [];
            return Array.isArray(v) ? v : [];
          } catch {
            return [];
          }
        };
        const userKey = `@basics_done_${localUser.id}`;
        const merged = Array.from(
          new Set([...parse(await AsyncStorage.getItem(userKey)), ...parse(guestRaw)]),
        );
        await AsyncStorage.setItem(userKey, JSON.stringify(merged));
        // Only a COMPLETE set opens the gate. Partial progress just restores
        // the checkmarks and drops the user back on the lesson they stopped at.
        if (REQUIRED_LESSON_SLUGS.every(s => merged.includes(s))) {
          await AsyncStorage.setItem(basicsGateKey(localUser.id), '1');
        }
      }
      // Consumed either way: the progress belongs to the account now, and
      // leaving it behind would hand it to whoever signs in next.
      await AsyncStorage.removeItem('@basics_done_guest');
    } catch {}

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
      } catch {}
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

    // Starting level from the onboarding quiz.
    //
    // Applied BEFORE the first sync on purpose: the push sends level_id and the
    // pull writes the server's answer straight back over it, so setting this
    // afterwards would last until the response landed and then silently revert.
    //
    // Only ever applied to an account still sitting on the default level 1. A
    // returning user who signs in on a new phone has a real level on the server,
    // and a stale quiz answer must not pull them back down to it.
    try {
      const raw = await AsyncStorage.getItem(ONBOARDING_QUIZ_KEY);
      if (raw) {
        const quizLevel = Number(JSON.parse(raw)?.level);
        const usable =
          Number.isFinite(quizLevel) && quizLevel >= 1 && quizLevel <= 5;
        if (usable && quizLevel !== 1 && localUser.level_id === 1) {
          localUser.level_id = quizLevel;
          setUser({ ...localUser });
          await saveDBUser({ level_id: quizLevel });
        }
        // Consumed either way - it describes a first run, not a preference.
        await AsyncStorage.removeItem(ONBOARDING_QUIZ_KEY);
      }
    } catch {}

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
        } catch {}
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
        } catch {}
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
        } catch {}
        return { success: false, error: 'unverified' };
      }
      await handleAuthResponse(res.data);
      return { success: true };
    }
    return { success: false, error: res.error || i18n.t('errors.loginFailed') };
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
    return { success: false, error: res.error || i18n.t('errors.registrationFailed') };
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
    return { success: false, error: res.error || i18n.t('errors.googleSignInFailed') };
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
    return { success: false, error: res.error || i18n.t('errors.googleLoginFailed') };
  };

  const logout = async () => {
    setIsLoading(true);

    // Cancel this device's scheduled reminders so the next user who signs in
    // does not inherit the previous account's notifications.
    await cancelAllReminders();

    // Drop the native Google session so the next sign-in shows the account
    // picker instead of silently reusing this account.
    await googleNativeSignOut();

    // Drop the RevenueCat identity too, so the next account on this device is
    // never read against the previous customer's cached entitlements.
    await logoutBilling();

    // Drop every cached "learn the basics" progress key (per-user and guest) so a
    // different account signing in on this device always starts the basics fresh
    // instead of showing another user's lessons as already completed.
    try {
      const keys = await AsyncStorage.getAllKeys();
      const basicsKeys = keys.filter(k => k.startsWith('@basics_done_'));
      if (basicsKeys.length > 0) {
        await AsyncStorage.removeMany(basicsKeys);
      }
    } catch {}

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
      (async () => {
        // Reaching this listener AT ALL is the "successful server response"
        // the revocation rule requires: it only fires once a push and a pull
        // have both come back clean. A network failure returns early in
        // syncNow and never gets here, so a connectivity problem can never
        // cost anyone access.
        if (user.is_admin) {
          setSubscribed(true);
          return;
        }

        const active = await getActiveSubscription(user.id).catch(() => null);

        if (active) {
          // A row the backend has acknowledged comes back from the pull with a
          // plan_id. recordCompletedPurchase writes plan_id: null, so a null
          // one is still nothing but our own optimistic grant.
          const serverConfirmed = active.plan_id != null;
          // When WE recorded the purchase, not when the subscription first
          // began. started_at carries RevenueCat's originalPurchaseDate, which
          // is months old for anyone resubscribing, restoring, switching plans
          // or reinstalling - so measuring the grace window from it expired
          // that window before the customer had finished paying, and this
          // branch closed the gate on them seconds after markSubscribed opened
          // it. Falls back to started_at only for rows written before this was
          // recorded, which are old enough that the distinction is moot.
          const recordedAt = await purchaseRecordedAt(user.id).catch(() => null);
          const grantedAt = recordedAt ?? Date.parse(active.started_at || '');
          const stillInGrace =
            !Number.isFinite(grantedAt) ||
            Date.now() - grantedAt < UNVERIFIED_GRACE_MS;

          // Keep access while the backend agrees, and keep it while the
          // purchase has not yet had a fair chance to reach the backend.
          if (serverConfirmed || stillInGrace) {
            setSubscribed(true);
            return;
          }

          // Unconfirmed, and well past the point where a working purchase
          // would have been acknowledged - across at least one successful
          // round trip. Only now is this a purchase the server does not
          // recognise rather than one it has not seen yet.
          setSubscribed(false);
          return;
        }

        // No active row. Lower only on positive evidence: rows present but
        // none active is a real expiry. NO rows at all is absence of
        // information, and treating that as revocation is what used to yank
        // paying users to the paywall and flicker the navigator between
        // stacks.
        const rows = await getSubscriptions(user.id).catch(() => []);
        if (rows.length > 0) {
          setSubscribed(false);
        }
      })().catch(() => {});
    });
    return off;
  }, [user]);

  // The account this device is signed in as no longer exists, or is no longer
  // allowed in. Deleting a user on the backend used to leave the app fully
  // usable: the subscription gate reads the LOCAL subscriptions table, that row
  // still had a future ends_at, and every sync failed quietly in the
  // background - so a deleted account kept its access until someone logged out
  // by hand.
  //
  // logout() is the right response rather than just closing the gate: the token
  // is dead, so there is nothing left this session can do. It clears the token,
  // the cached user, the SQLite tables and this device's reminders, which is
  // exactly the cleanup a deleted account needs anyway.
  useEffect(() => {
    if (!user) return;
    return onAuthFailure((rejectedUserId) => {
      if (rejectedUserId !== user.id) return;
      logout().catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // RevenueCat pushes a new CustomerInfo whenever entitlements change -
  // renewal, expiry, a billing problem, or a purchase restored on another
  // device. Without this the app only learns on its next sync.
  //
  // Deliberately asymmetric: an active entitlement opens the gate immediately
  // (RevenueCat has already verified the purchase, so making the user wait for
  // a sync would be wrong), but we never CLOSE the gate from here. Revocation
  // stays with the backend-confirmed path in onSyncComplete, so a transient
  // RevenueCat blip can't yank access from a paying user. Triggering a sync
  // here means a genuine expiry is still picked up promptly.
  useEffect(() => {
    if (!user) return;
    const off = onCustomerInfoChange((customerInfo) => {
      if (hasActiveEntitlement(customerInfo)) {
        setSubscribed(true);
      }
      syncNow(user.id).catch(() => {});
    });
    return off;
  }, [user]);

  // Re-check entitlement every time the app comes back to the foreground.
  //
  // This is what closes the hole a renewal used to fall into. Every other
  // syncNow call site lives inside a tab or workout screen, and the navigator
  // unmounts all of them the moment the subscription gate closes - so a user
  // sitting on the paywall had no code left running that could ever notice
  // Play had charged them and renewed. They stayed locked out until the app
  // was killed and reopened, which is the one thing that remounted the paywall
  // and re-ran its one-shot sync.
  //
  // Both halves are needed. The sync picks up the row once our backend has
  // processed the RevenueCat webhook; refreshCustomerInfo asks RevenueCat
  // directly, which is live well before that and covers the case where the
  // webhook is delayed or was missed. RAISE-only, like every other gate
  // listener here: revocation stays with the backend-confirmed path in
  // onSyncComplete, so a foreground with flaky network can never cost a paying
  // user their access.
  useEffect(() => {
    if (!user) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      syncNow(user.id).catch(() => {});
      refreshCustomerInfo(user.id)
        .then((active) => {
          if (active) setSubscribed(true);
        })
        .catch(() => {});
    });
    return () => sub.remove();
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
