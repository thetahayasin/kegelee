import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setApiToken } from '../services/api';
import { getDBUser, saveDBUser, clearUserData, getWorkoutSessionsCount, getActiveSubscription, getMeasurements, insertMeasurement } from '../db/queries';
import { syncNow, syncIfStale, onSyncComplete, onAuthFailure, flushPendingWork } from '../services/sync';
import {
  claimGuestEvents,
  deleteGuestEvents,
  setCurrentUserId,
  track,
  trackAppOpened,
} from '../services/events';
import {
  applyReminderSchedule,
  cancelAllReminders,
  cancelAllNudges,
  forgetReminderSchedule,
  scheduleTrialEndingWarning,
} from '../services/reminders';
import {
  forgetEntitlementState,
  forgetServerVerdict,
  rememberServerVerdict,
  resolveEntitlement,
} from '../services/entitlement';
import { googleNativeSignOut, consumeGoogleNonce } from '../services/googleAuth';
import {
  logoutBilling,
  onCustomerInfoChange,
  hasActiveEntitlement,
  refreshCustomerInfo,
  reconcileEntitlementOnLaunch,
  recordCompletedPurchase,
} from '../services/billing';
import { reportError } from '../services/errors';
import { BASICS_LESSONS } from '../constants/basics';
import i18n from '../i18n';

const REQUIRED_LESSON_SLUGS = BASICS_LESSONS.map((l) => l.slug);

/**
 * Where OnboardingScreen leaves the quiz result until there is an account.
 *
 * Declared here rather than in the screen so that anything reading the
 * pending quiz result - the screen, the sync layer - can import it from one
 * place without importing the screen itself.
 */
export const ONBOARDING_QUIZ_KEY = '@onboarding_quiz';

/**
 * The onboarding profile waiting to be reported to the backend.
 *
 * ONBOARDING_QUIZ_KEY is consumed and deleted the moment an account exists,
 * because it describes a first run and must not be applied twice. That made
 * it unavailable to the very next sync, so the answers, the opening hold and
 * the level they produced never reached the server at all. This is the same
 * payload, kept until a push has actually taken it.
 */
export const ONBOARDING_PUSH_KEY = '@onboarding_profile_pending';

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

/**
 * Whether this account may pass the subscription gate.
 *
 * A thin wrapper over the shared resolver, which owns the whole rule: the
 * admin bypass, the backend's own verdict, the local subscription rows and
 * their dates, and the bounded window for a purchase the server has not
 * acknowledged yet. See services/entitlement.
 *
 * The gate is derived from it on EVERY trigger rather than being nudged up and
 * down by whichever event fired last, which is what stopped the app and the
 * Settings screen giving different answers about the same account.
 */
const computeSubscribed = async (userId: number, isAdmin: boolean): Promise<boolean> => {
  try {
    return (await resolveEntitlement(userId, isAdmin)).active;
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
  // Whether the account has a live subscription.
  //
  // No longer a gate on the app. It is a feature flag: the lessons, the
  // training tab and the first three exercises are free, while progress
  // tracking, the schedule and the level picker sit behind it - and a free
  // account's training day stops advancing at FREE_DAY_CAP, so subscribing
  // resumes the plan rather than restarting it.
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

  /**
   * The signed-in account, readable from callbacks that must keep a stable
   * identity across renders.
   *
   * PaywallScreen memoises its purchase handler on `markSubscribed`, so a
   * fresh function on every user change would either invalidate that memo or
   * sit in a deps array as a lint error. The ref lets the callbacks below stay
   * `[]`-memoised while still acting on the current account.
   */
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  /**
   * Re-derive the gate from the shared resolver.
   *
   * The single way `subscribed` moves. Everything that used to call
   * `setSubscribed` directly - the sync listener, the RevenueCat push, the
   * foreground refresh, the expiry timer - calls this instead, so the answer
   * comes from one rule applied to durable state rather than from whichever
   * event happened to fire last.
   *
   * That is what fixes the two halves of the same bug. The gate could
   * previously only be RAISED by those events and LOWERED by exactly one of
   * them, so an account whose subscription had ended kept its premium features
   * until a sync completed - while the Settings screen, reading the local rows
   * directly, already said there was no subscription. Deriving on every
   * trigger from a time-aware rule means the gate falls on its own, offline
   * and unprompted, at the moment the entitlement does.
   */
  const evaluateEntitlement = useCallback(async (): Promise<boolean> => {
    const current = userRef.current;
    if (!current) return false;
    try {
      const { active } = await resolveEntitlement(current.id, current.is_admin);
      setSubscribed(active);
      return active;
    } catch (e) {
      // The resolver reads SQLite and AsyncStorage and swallows both, so this
      // is close to unreachable - but a failure to READ the rule is not
      // evidence against the customer, so the gate is left where it was.
      reportError(e, 'auth:evaluateEntitlement');
      return false;
    }
  }, []);

  /**
   * Instant access right after a Play purchase completes.
   *
   * The local subscription row is already written by the time this is called
   * (PaywallScreen checks `getActiveSubscription` before calling it), so this
   * is not an unbacked grant - it is skipping the round trip that would
   * otherwise sit between paying and being let in.
   *
   * The stored server verdict is dropped first. A `false` recorded moments
   * before somebody paid would otherwise outrank the row they have just
   * bought, and leave them looking at the paywall until the next sync
   * corrected it.
   */
  const markSubscribed = useCallback(() => {
    setSubscribed(true);
    const current = userRef.current;
    if (!current) return;
    forgetServerVerdict(current.id)
      .then(() => evaluateEntitlement())
      .catch(() => {});
  }, [evaluateEntitlement]);

  /**
   * Tell the events module who is signed in.
   *
   * Two callers cannot reach this context at all: the crash boundary, which
   * sits above every provider, and the notification handler, which runs
   * outside React entirely. Publishing the id here means they can attribute an
   * event without a database read on a path that is already going wrong.
   */
  useEffect(() => {
    setCurrentUserId(user?.id ?? null);
  }, [user]);

  /**
   * Reminders follow the entitlement, in both directions.
   *
   * Two things were wrong here. The first is that a reminder is not a piece of
   * app state: it is an alarm handed to Android, and it outlives the process
   * that created it. They were created as weekly REPEATING triggers, which is
   * an instruction to fire forever, so cancelling them required the app to run
   * - and the defining feature of a lapsed account is that it does not open
   * the app. Someone who cancelled went on being reminded indefinitely by a
   * screen they could no longer open. That half is fixed at the source: the
   * schedule is now a bounded series that runs out on its own, capped at the
   * entitlement (see services/reminders).
   *
   * The second is that this effect only ever CANCELLED, while the sync's own
   * reminders section re-scheduled on every pull. The two fought over the same
   * alarms and the one that ran more often won. Both now call the same
   * `applyReminderSchedule`, which applies the whole rule - clear when not
   * entitled, schedule the local rows out to the entitlement when entitled -
   * so there is nothing left for them to disagree about.
   *
   * Guarded two ways. `isLoading` keeps it from acting on the false that every
   * cold start begins with, before the restore has decided; and the ref keeps
   * it to once per account-and-state rather than once per render, because
   * applying the schedule is real work at the native bridge.
   */
  const remindersAppliedFor = useRef<string | null>(null);
  useEffect(() => {
    // Wait for the restore to decide. `subscribed` is false while it runs, and
    // acting on that would cancel a paying subscriber's reminders on every
    // single app open.
    if (isLoading || !user) return;
    const key = `${user.id}:${subscribed}`;
    // Already handled this state; nothing to do until it changes.
    if (remindersAppliedFor.current === key) return;
    remindersAppliedFor.current = key;

    applyReminderSchedule(user.id, user.is_admin).catch(() => {});
    if (!subscribed) {
      cancelAllNudges().catch(() => {});
    }
  }, [isLoading, subscribed, user]);

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

            /**
             * Ask the store what this customer actually owns.
             *
             * A purchase can complete and the local row never be written: the
             * app is killed between Play returning and recordCompletedPurchase
             * finishing, or the purchase happened on another device, or the
             * account was reinstalled. The subscription is real, RevenueCat
             * knows about it, and this device's SQLite does not - so the person
             * who paid opens the app to a paywall, and the only route back is
             * a Restore button they have no reason to think they need.
             *
             * Deliberately NOT awaited. It is a network call to RevenueCat, and
             * holding the splash on it would make every cold start as slow as
             * the slowest billing round trip - for a case that is rare. The
             * gate opens a moment later instead.
             *
             * RAISE-only, like every other gate listener here: an entitlement
             * that is absent proves nothing (offline, a RevenueCat hiccup), and
             * revocation stays with the backend-confirmed path in onSyncComplete.
             */
            const cachedId = cachedUser.id;
            const cachedIsAdmin = cachedUser.is_admin === 1;
            (async () => {
              // Only when nothing local already covers it: re-recording a
              // purchase that is already written would restate a row the sync
              // has since corrected.
              const active = await getActiveSubscription(cachedId).catch(() => null);
              if (active) return;
              const purchase = await reconcileEntitlementOnLaunch(cachedId);
              if (!purchase) return;
              const result = await recordCompletedPurchase(cachedId, purchase);
              // 'duplicate' counts: it means a row saying exactly this already
              // exists, which is itself proof of entitlement. 'unmatched' and
              // 'expired' do not - the first is a product this build does not
              // sell, the second an entitlement that has already run out.
              if (result === 'recorded' || result === 'duplicate') {
                setSubscribed(true);
              } else if (await computeSubscribed(cachedId, cachedIsAdmin)) {
                setSubscribed(true);
              }
            })().catch((e) => reportError(e, 'auth:reconcileEntitlement'));
          }
        }
      } catch (e) {
        reportError(e, 'auth:bootstrap');
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

    /**
     * The same handover for the behaviour log.
     *
     * Everything a guest did - the quiz, the slides they swiped through, the
     * lessons, the first look at the plans - is sitting in user_events under
     * the guest id, invisible to every push because nothing ever asks for
     * user 0. This is the moment those rows acquire an owner, and it has to
     * happen BEFORE the sync below or the first push leaves them behind and
     * the funnel loses its whole first half.
     */
    await claimGuestEvents(localUser.id);

    // The free session moves with the lessons, for the same reason.


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
    //
    // Stored, not just applied. This is the same verdict the pull sends, from
    // the same server-side method, and everything that re-derives the gate
    // afterwards reads it from there - so recording it is what stops the very
    // first local re-derivation, seconds later, reaching the opposite
    // conclusion from an empty subscriptions table.
    await rememberServerVerdict(
      localUser.id,
      typeof userPayload.is_subscribed === 'boolean' ? userPayload.is_subscribed : undefined,
    );
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

    // No notification-permission prompt here.
    //
    // It used to fire on this line: a bare system dialog thrown at someone who
    // had just typed a password and had not yet seen a single screen of the
    // app, with nothing on it explaining what the notifications were for. On
    // Android 13+ that is the worst possible moment to ask - the answer is
    // reflexive, and a refusal is effectively permanent. Every one of those
    // refusals silently disabled the reminders feature for good, which is the
    // only mechanism the app has for bringing anyone back.
    //
    // scheduleReminders() already requests permission at the point someone
    // actually sets a reminder, where the reason is self-evident and the ask
    // follows the user's own intent instead of preceding it. That is the only
    // place it should happen, and it covers the sync path below too.

    // Clear any reminders left over from a previously signed-in user before the
    // sync below reschedules this account's own reminders from the backend. This
    // covers both login and first-time register ("getting started"), so a new
    // user never inherits the previous person's notifications.
    await cancelAllReminders();
    await cancelAllNudges();

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

        // The hold taken during onboarding becomes this account's FIRST
        // measurement.
        //
        // Without a baseline there is nothing for a later measurement to be
        // better than, and 'your hold went from 9 seconds to 14' is the only
        // sentence this app can say that proves it works - the whole category
        // is invisible otherwise. Guarded on the account having no history of
        // its own, so signing in on a second device cannot staple a stranger's
        // first attempt onto a real training record.
        const baseline = Number(JSON.parse(raw)?.baseline);
        if (Number.isFinite(baseline) && baseline > 0) {
          try {
            const existing = await getMeasurements(localUser.id, 1);
            if (existing.length === 0) {
              await insertMeasurement(localUser.id, baseline, 0);
            }
          } catch {}
        }

        // Hand the whole profile to the sync layer before dropping it here.
        // The backend records it write-once, so a repeat push is harmless and
        // a lost one is retried on the next sync.
        try {
          const parsed = JSON.parse(raw) ?? {};
          await AsyncStorage.setItem(
            ONBOARDING_PUSH_KEY,
            JSON.stringify({
              experience: parsed.experience ?? null,
              daily_time: parsed.dailyTime ?? null,
              baseline_seconds: parsed.baseline ?? 0,
              level: parsed.level ?? null,
              skipped: !!parsed.skipped,
            }),
          );
        } catch {}

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
    const userId = user?.id;

    /**
     * Signing out must always finish, whatever fails on the way.
     *
     * isLoading is what Root renders the whole navigator behind, and every
     * step here can reject: Notifee is missing, RevenueCat's logout is on a
     * dead connection, SQLite errors on the final clear. Any one of those used
     * to leave isLoading stuck at true with no code path back - a spinner that
     * never resolves, escapable only by force-quitting the app - AND with the
     * token still in place, so the "failed" logout had also not logged anybody
     * out.
     *
     * So the external cleanups are each best-effort and reported, and the part
     * that actually ends the session runs regardless of how they went.
     */
    const bestEffort = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        reportError(e, `auth:logout:${label}`);
      }
    };

    try {
      /**
       * Record the sign-out and get the outbox off the device, in that order,
       * before anything is torn down.
       *
       * clearUserData below deletes this account's user_events along with
       * everything else it owns, so whatever is still queued at that point is
       * gone - including the logged_out event written a moment earlier. An
       * events-only push is used rather than a full sync: a sync pulls state
       * back down and writes it to the very tables being cleared.
       *
       * Both are best-effort and both are awaited. A person on a plane must
       * still be able to sign out, so nothing here can fail the logout; but a
       * push that is fired and forgotten would race the delete and usually
       * lose.
       */
      if (userId) {
        await bestEffort('trackLogout', () => track(userId, 'logged_out'));
        // The training too, not just the instrumentation. clearUserData below
        // drops every row this account owns, so a session finished offline is
        // gone unless it goes now - which is what the confirmation dialog used
        // to warn about instead of fixing.
        await bestEffort('flushPendingWork', () =>
          flushPendingWork(userId, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
        );
      }
      // Guest rows belong to nobody, so clearUserData - which is scoped to an
      // account - cannot reach them. Left behind, the next person to sign in
      // on this device would claim a stranger's onboarding as their own.
      await bestEffort('guestEvents', deleteGuestEvents);

      // Cancel this device's scheduled reminders so the next user who signs in
      // does not inherit the previous account's notifications.
      await bestEffort('reminders', cancelAllReminders);

      // Drop the native Google session so the next sign-in shows the account
      // picker instead of silently reusing this account.
      await bestEffort('google', googleNativeSignOut);

      // Drop the RevenueCat identity too, so the next account on this device is
      // never read against the previous customer's cached entitlements.
      await bestEffort('billing', logoutBilling);

      // Drop every cached "learn the basics" progress key (per-user and guest) so a
      // different account signing in on this device always starts the basics fresh
      // instead of showing another user's lessons as already completed.
      await bestEffort('basicsKeys', async () => {
        const keys = await AsyncStorage.getAllKeys();
        const basicsKeys = keys.filter(k => k.startsWith('@basics_done_'));
        if (basicsKeys.length > 0) {
          await AsyncStorage.removeMany(basicsKeys);
        }
      });

      // Clear storage keys
      await bestEffort('token', () => AsyncStorage.removeItem('@api_token'));
      // What the entitlement rule remembers is this account's, and it is read
      // back by user id - so leaving it behind would let one person's stored
      // answer decide the next person's access on a shared device. The
      // reminder record goes with it: the notifications were cancelled above,
      // and a record claiming they still stand would make the next sign-in
      // skip the rebuild it needs.
      if (userId !== undefined) {
        await bestEffort('entitlement', () => forgetEntitlementState(userId));
        await bestEffort('reminderState', () => forgetReminderSchedule(userId));
      }
      setToken(null);
      setApiToken(null);
      setUser(null);
      setBasicsDone(false);
      setSubscribed(false);

      // Clear SQLite tables. Scoped to this account - see clearUserData.
      await bestEffort('sqlite', () => clearUserData(userId));
    } finally {
      setIsLoading(false);
    }
  };

  const updateUserFields = async (fields: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...fields };
    setUser(updated);

    // Persist to local SQLite user cache.
    //
    // onboarded_at is deliberately NOT written here. This function is called
    // for a level change or a timezone change, and it used to restamp
    // onboarded_at with `now` every single time - so the date somebody
    // actually finished onboarding was destroyed by the next unrelated edit,
    // and the sync then pushed that fresh date to the server. The onboarding
    // date has exactly one writer, the sign-in payload, and one corrector, the
    // pull.
    await saveDBUser({
      level_id: updated.level_id,
      level_started_days: updated.level_started_days,
      timezone: updated.timezone,
    });
  };

  /**
   * Re-evaluate the gate after every successful sync.
   *
   * The pull carries the backend's own verdict and refreshes the local rows,
   * so this is what closes the gate when a subscription expires or Google
   * reports a cancellation via RTDN, and what opens it when a pull reveals a
   * subscription bought on another device. It is the RN equivalent of the web
   * re-checking isSubscribed() on every navigation.
   *
   * This used to restate the whole entitlement rule inline - the server's
   * verdict, then the local rows, then the unverified-purchase grace window,
   * then a special case for a device holding no rows at all - and it was the
   * ONLY place that could close the gate. Both halves of that were wrong. The
   * rule now lives in services/entitlement, where the cold start, the
   * foreground and the expiry timer all read the same copy of it; and the
   * verdict is written down rather than applied once and forgotten, so it
   * still counts the next time anything asks.
   *
   * Reaching this listener AT ALL is the "successful server response" that
   * makes a revocation safe to act on: it only fires once a push and a pull
   * have both come back clean. A network failure returns early in syncNow and
   * never gets here, so a connectivity problem can never cost anyone access.
   */
  useEffect(() => {
    if (!user) return;
    const off = onSyncComplete((syncedUserId, serverSubscribed) => {
      if (syncedUserId !== user.id) return;
      (async () => {
        // Written down first, because the resolver reads it. `undefined` is a
        // backend that does not send the field - silence, not a verdict - and
        // rememberServerVerdict ignores it rather than overwriting the last
        // real answer with it.
        await rememberServerVerdict(user.id, serverSubscribed);

        const entitled = await evaluateEntitlement();

        // Keep the trial warning in step with whatever the sync just learned.
        // Passing a null trial_ends_at cancels it, so this one call covers
        // every transition: a trial starting, converting, being cancelled, or
        // having been bought on another device entirely. The trial's end date
        // was previously known to the app and told to nobody - a conversion
        // moment missed, and the kind of unannounced charge people dispute.
        const active = entitled
          ? await getActiveSubscription(user.id).catch(() => null)
          : null;
        scheduleTrialEndingWarning(
          String(active?.status || '').toLowerCase() === 'trialing'
            ? active?.trial_ends_at ?? null
            : null,
        ).catch(() => {});
      })().catch(() => {});
    });
    return off;
  }, [user, evaluateEntitlement]);

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

  /**
   * RevenueCat pushes a new CustomerInfo whenever entitlements change -
   * renewal, expiry, a billing problem, or a purchase restored on another
   * device. Without this the app only learns on its next sync.
   *
   * Still deliberately asymmetric about what it does with a "yes": an active
   * entitlement RevenueCat has already verified opens the gate immediately,
   * because making somebody who has paid wait for a round trip would be wrong.
   * A "no" is not acted on here - a transient RevenueCat blip must not yank
   * access from a paying customer - but the sync it triggers reaches the
   * listener above, which re-derives the answer from the backend's verdict.
   */
  useEffect(() => {
    if (!user) return;
    const off = onCustomerInfoChange((customerInfo) => {
      if (hasActiveEntitlement(customerInfo)) {
        markSubscribed();
      }
      syncNow(user.id).catch(() => {});
    });
    return off;
  }, [user, markSubscribed]);

  /**
   * Re-check entitlement every time the app comes back to the foreground.
   *
   * Three things happen here and they cover different failures.
   *
   * `evaluateEntitlement` is the local one: no network, no store, just the
   * rule applied to what this device already knows. It is what closes the gate
   * for somebody whose subscription ended while the app was in the background
   * or the phone was offline, and it is the reason the app and the Settings
   * screen can no longer give different answers about the same account - both
   * now read the same resolver, on the same event.
   *
   * The sync picks the row up once our backend has processed the RevenueCat
   * webhook, and closes the hole a renewal used to fall into: every other
   * syncNow call site lives inside a tab or workout screen, and the navigator
   * unmounts all of them the moment the gate closes, so somebody sitting on
   * the paywall had no code left running that could notice Play had charged
   * them. refreshCustomerInfo asks RevenueCat directly, which is live well
   * before the webhook and covers the case where it was delayed or missed.
   * Both are RAISE-only; revocation stays with the two paths that cannot be
   * wrong about it - the local clock, and the backend's own verdict.
   */
  useEffect(() => {
    if (!user) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      // Free, and first: it needs no network and settles the common case
      // before anything slower has started.
      evaluateEntitlement().catch(() => {});
      // Refill the reminder window if it is running down, and clear it if the
      // entitlement has gone. Also network-free: it exists precisely for the
      // device whose sync never succeeds, which would otherwise either fall
      // silent when the horizon elapsed or go on notifying past a lapse it
      // never heard about. Skips the native work entirely when nothing has
      // changed and the window still has room.
      applyReminderSchedule(user.id, user.is_admin).catch(() => {});
      // syncIfStale, not syncNow. Android delivers 'active' for every
      // transient interruption - a notification shade pull, a permission
      // dialog, the recents switcher - so on a phone in normal use this fired
      // a full push-and-pull every few seconds. The renewal case it exists for
      // is not time-critical to the second, and refreshCustomerInfo below asks
      // RevenueCat directly on every foreground regardless.
      syncIfStale(user.id).catch(() => {});
      // Throttled to one every 30 minutes inside events.ts, for the reason
      // named in the comment above: Android calls a notification shade pull a
      // foreground, and counting those would make "people who opened the app
      // today" a measure of how often the phone was picked up.
      trackAppOpened('foreground');
      refreshCustomerInfo(user.id)
        .then((active) => {
          if (active) markSubscribed();
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, [user, evaluateEntitlement, markSubscribed]);

  /**
   * Close the gate when the entitlement's own clock runs out.
   *
   * Every other path here is event-driven - a sync finished, RevenueCat spoke,
   * the app came forward - and time passing is none of those. A subscription
   * whose period ended while the app sat open on screen kept working, because
   * nothing was left to notice: the row was already local, already read, and
   * no new event was coming. Backgrounding and returning fixed it, which is a
   * fix nobody thinks to try.
   *
   * The deadline comes from the resolver, so it is the boundary of the whole
   * rule rather than of one column: a cancelled row's paid-through date, a
   * past_due row's grace period, an unverified purchase's window, or the point
   * at which the server's stored verdict goes stale, whichever comes first.
   *
   * Two things the previous version got wrong, and both left the gate open.
   * It read `ends_at` and gave up when the delay was already negative - which
   * is exactly the state a gate that has been raised by some other path and
   * never lowered is in, so the one case that most needed closing was the one
   * case it skipped. And it gave up on any delay past ~24 days rather than
   * waiting as long as it could and asking again, so a yearly plan simply had
   * no timer.
   *
   * Re-derives rather than trusting the timer: by the time it fires a sync may
   * have extended, replaced or renewed the entitlement.
   */
  useEffect(() => {
    if (!user || !subscribed || user.is_admin) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // setTimeout takes a 32-bit signed millisecond count, so anything beyond
    // ~24 days overflows and fires immediately. Waiting the maximum and then
    // re-arming covers a yearly plan without a poll.
    const MAX_DELAY = 0x7fffffff;

    const armFor = (deadline: number) => {
      // A second past the boundary, so the re-read lands on the far side of it
      // rather than exactly on it.
      const delay = Math.min(Math.max(deadline + 1000 - Date.now(), 0), MAX_DELAY);
      timer = setTimeout(() => {
        if (cancelled) return;
        arm();
      }, delay);
    };

    const arm = () => {
      resolveEntitlement(user.id, user.is_admin)
        .then((entitlement) => {
          if (cancelled) return;
          setSubscribed(entitlement.active);
          // No deadline at all - an open-ended entitlement - has nothing to
          // wait for. A closed gate has nothing to wait for either: the paths
          // that reopen it are all events, and they re-run this effect.
          if (!entitlement.active || entitlement.expiresAt === null) return;
          armFor(entitlement.expiresAt);
        })
        .catch(() => {});
    };

    arm();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user, subscribed]);

  /**
   * Google sign-in returns from the Custom Tab through the app deeplink
   * (kegelee://auth/google/finish?token=..). Redeem the one-time token here so
   * the session is established no matter which screen is on top.
   *
   * The token is only accepted when the redirect carries back the `state`
   * value this app generated before it opened the browser. A custom scheme is
   * not owned by anybody: another installed app can register `kegelee://`, and
   * any web page can navigate to it, so without the check this handler signed
   * the user in as whatever account an arbitrary link named. Requiring the
   * nonce means the app only ever completes a sign-in it started itself, and
   * only once - consumeGoogleNonce clears it, so a replayed link finds nothing.
   *
   * STRICT now that the backend echoes `state` back on every redirect. It was
   * deliberately tolerant while it did not: a link with no state at all was
   * let through with a report, so the flow kept working during the rollout.
   * That tolerance was also the hole - a forged link does not have to guess a
   * nonce it can simply omit - and it closes the moment the parameter is
   * guaranteed to be there. Missing and wrong are now the same answer: this is
   * not a sign-in this app started, so nothing is redeemed.
   */
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url || !url.includes('auth/google/finish')) {
        return;
      }
      const tokenMatch = url.match(/[?&]token=([^&#]+)/);
      if (!tokenMatch) return;

      const expected = await consumeGoogleNonce();
      const stateMatch = url.match(/[?&]state=([^&#]+)/);
      const received = stateMatch ? decodeURIComponent(stateMatch[1]) : null;

      // Three refusals, one branch: no nonce was stored (nothing was started
      // from this device), the link carried no state, or it carried the wrong
      // one. Reported separately from each other only in the message, because
      // the answer is identical and a caller cannot act on the difference.
      if (!expected || !received || received !== expected) {
        reportError(
          new Error(
            received
              ? 'Google deeplink state did not match a sign-in this app started'
              : 'Google deeplink arrived without a state parameter',
          ),
          'auth:google-deeplink-state',
        );
        return;
      }

      await redeemGoogleLogin(decodeURIComponent(tokenMatch[1]));
    };
    Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url).catch(() => {});
    });
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
