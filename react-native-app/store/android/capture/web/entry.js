/**
 * Screenshot entry: seed a demo account, then start the real app.
 *
 * Everything on screen is the app's own code - App.tsx, its navigator and its
 * screens - reading this data from its own SQLite schema and AsyncStorage
 * keys. Only the native modules underneath are replaced (see shims/). The
 * account is a local demonstration and never talks to kegelee.com: the
 * capture script fails every request that leaves the page.
 *
 * Query string: ?lang=<app language tag>
 */
import 'react-native-gesture-handler';
import React from 'react';
import { AppRegistry, View } from 'react-native-web';
import AsyncStorage from '@react-native-async-storage/async-storage';

import App from '../../../../App';
import { initDB, getDBConnection } from '../../../../src/db/sqlite';

const params = new URLSearchParams(window.location.search);
const LANG = params.get('lang') || 'en';
const RTL = ['ar', 'he'].includes(LANG.split('-')[0]);

const USER_ID = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Twenty-three finished days and the first of today's two sessions done:
 * Month 1, day 24, a 23-day streak, and everything up to "Starter" unlocked
 * with the next exercise visibly on its way.
 */
const COMPLETED_DAYS = 23;

/** UTC throughout; the capture browser runs in UTC as well. */
const dateKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const at = (ms, hh, mm) => {
  const d = new Date(ms);
  d.setUTCHours(hh, mm, 0, 0);
  return d.toISOString();
};

async function seedDatabase() {
  await initDB();
  const db = await getDBConnection();
  const now = Date.now();
  const sql = (q, p = []) => db.executeSql(q, p);

  await sql(
    `INSERT OR REPLACE INTO users (id, name, email, is_admin, level_id, level_started_days, onboarded_at, timezone, api_token)
     VALUES (?, ?, ?, 0, 2, 9, ?, 'UTC', 'screenshot-demo')`,
    [USER_ID, 'Alex', 'alex@example.com', at(now - (COMPLETED_DAYS + 2) * DAY_MS, 9, 0)],
  );

  // Two sessions a day, morning and evening, for every finished day; one
  // session so far today.
  const exercises = ['trembling', 'holding', 'front-clamp', 'reverse-clamp', 'flash', 'steady-trembling', 'clamp', 'starter'];
  let n = 0;
  const session = async (dayMs, hh, mm, seconds) => {
    const done = at(dayMs, hh, mm);
    const start = new Date(Date.parse(done) - seconds * 1000).toISOString();
    n += 1;
    await sql(
      `INSERT INTO workout_sessions (user_id, client_id, exercise_id, exercise_slug, level_id, duration_seconds, is_extra, started_at, completed_at, synced)
       VALUES (?, ?, NULL, ?, ?, ?, 0, ?, ?, 1)`,
      [USER_ID, `demo-${n}`, exercises[n % exercises.length], seconds > 90 ? 2 : 1, seconds, start, done],
    );
  };

  for (let i = COMPLETED_DAYS; i >= 1; i--) {
    const dayMs = now - i * DAY_MS;
    const seconds = i > 9 ? 60 : 120;
    await session(dayMs, 8, 10 + (i % 20), seconds);
    await session(dayMs, 20, 5 + (i % 30), seconds);
    await sql(
      `INSERT INTO training_days (user_id, date, sessions_count, required_sessions, completed_at)
       VALUES (?, ?, 2, 2, ?)`,
      [USER_ID, dateKey(dayMs), at(dayMs, 20, 30)],
    );
  }
  await session(now, 8, 15, 120);
  await sql(
    `INSERT INTO training_days (user_id, date, sessions_count, required_sessions, completed_at)
     VALUES (?, ?, 1, 2, NULL)`,
    [USER_ID, dateKey(now)],
  );

  // Longest hold, measured every two or three days and creeping upward.
  const holds = [6.2, 7.0, 7.4, 8.9, 9.6, 10.8, 11.5, 12.9, 13.4, 14.8, 16.1];
  for (let k = 0; k < holds.length; k++) {
    const dayMs = now - (holds.length - 1 - k) * 2 * DAY_MS - DAY_MS;
    await sql(
      'INSERT INTO measurements (user_id, client_id, seconds, measured_at, synced) VALUES (?, ?, ?, ?, 1)',
      [USER_ID, `demo-m-${k}`, holds[k], at(dayMs, 19, 40)],
    );
  }

  // Reminders: weekdays morning and evening, weekends one gentle morning.
  for (let weekday = 0; weekday < 7; weekday++) {
    const weekend = weekday >= 5;
    await sql(
      'INSERT INTO reminders (user_id, weekday, times, is_enabled, synced) VALUES (?, ?, ?, 1, 1)',
      [USER_ID, weekday, JSON.stringify(weekend ? ['09:30'] : ['08:00', '20:00'])],
    );
  }

  // Premium, so no padlock or upsell sits over the screens being shown.
  await sql(
    `INSERT INTO subscriptions (user_id, plan_id, plan_slug, status, store, purchase_token, started_at, ends_at, auto_renewing, store_product_id)
     VALUES (?, 3, 'yearly', 'active', 'google_play', 'screenshot-demo', ?, ?, 1, 'premium_yearly')`,
    [USER_ID, new Date(now - 30 * DAY_MS).toISOString(), new Date(now + 335 * DAY_MS).toISOString()],
  );
}

async function seedStorage() {
  const entries = {
    '@app_language': LANG,
    '@device_language': LANG,
    '@onboarded': 'true',
    '@api_token': 'screenshot-demo',
    [`@basics_done_gate_${USER_ID}`]: '1',
    [`@basics_done_${USER_ID}`]: JSON.stringify(['why', 'find', 'first']),
    [`@upsell_welcome_shown_${USER_ID}`]: String(Date.now()),
  };
  // Every coach-mark tour already seen, so none sits over a screenshot.
  for (const tour of ['session', 'home', 'progress', 'schedule', 'profile']) {
    entries[`@tour_${tour}_${USER_ID}`] = '1';
  }
  for (const [key, value] of Object.entries(entries)) {
    await AsyncStorage.setItem(key, value);
  }
}

/** RN-web takes direction from the nearest `dir`, as a phone takes it from the locale. */
const Root = () =>
  React.createElement(
    View,
    { dir: RTL ? 'rtl' : 'ltr', lang: LANG, style: { flex: 1 } },
    React.createElement(App),
  );

(async () => {
  try {
    await seedStorage();
    await seedDatabase();
  } catch (e) {
    window.__seedError = String(e?.stack || e);
    throw e;
  }
  AppRegistry.registerComponent('Kegelee', () => Root);
  AppRegistry.runApplication('Kegelee', { rootTag: document.getElementById('root') });
})();
