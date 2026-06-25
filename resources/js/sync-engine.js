/**
 * Kegelee Sync Engine — two-way offline-first sync.
 *
 * Pull: server content → IndexedDB (server always wins for content).
 * Push: queued user data from IndexedDB → server (never deletes until confirmed).
 *
 * Runs automatically:
 * - On app boot (pre-seed if empty, then sync if online).
 * - On `navigator.onLine` change (sync immediately when connectivity returns).
 * - Every 15 minutes while online (catch admin content changes).
 */

import db from './offline-db.js';
import {
    SEED_EXERCISES, SEED_LEVELS, SEED_ONBOARDING_SLIDES,
    SEED_KNOWLEDGE_LESSONS, SEED_SETTINGS,
} from './pre-seed-data.js';

// Read the API key from the meta tag injected in the layout.
function apiKey() {
    const el = document.querySelector('meta[name="sync-api-key"]');
    return el ? el.content : '';
}

function apiBase() {
    const el = document.querySelector('meta[name="sync-api-base"]');
    return el ? el.content : '';
}

function csrfToken() {
    const el = document.querySelector('meta[name="csrf-token"]');
    return el ? el.content : '';
}

async function authHeaders(key) {
    const headers = {
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json',
    };

    const emailEl = document.querySelector('meta[name="user-email"]');
    const hashEl = document.querySelector('meta[name="user-hash"]');

    let email = emailEl ? emailEl.content : '';
    let hash = hashEl ? hashEl.content : '';

    if (!email || !hash) {
        try {
            const profile = await db.get('sync_meta', 'user_profile');
            if (profile && profile.value) {
                if (!email && profile.value.email) email = profile.value.email;
                if (!hash && profile.value.password_hash) hash = profile.value.password_hash;
            }
        } catch (e) {
            // DB not ready yet or read failed
        }
    }

    if (email) headers['X-User-Email'] = email;
    if (hash) headers['X-User-Password-Hash'] = hash;

    return headers;
}

// ---------------------------------------------------------------------------
// Pre-seed — writes hardcoded data into IndexedDB on first ever boot.
// ---------------------------------------------------------------------------
async function ensurePreSeeded() {
    const meta = await db.get('sync_meta', 'seeded');
    if (meta) return; // already seeded

    const exerciseCount = await db.count('exercises');
    if (exerciseCount === 0) {
        await db.putAll('exercises', SEED_EXERCISES);
    }

    const levelCount = await db.count('levels');
    if (levelCount === 0) {
        await db.putAll('levels', SEED_LEVELS);
    }

    const slideCount = await db.count('onboarding_slides');
    if (slideCount === 0) {
        await db.putAll('onboarding_slides', SEED_ONBOARDING_SLIDES);
    }

    const lessonCount = await db.count('knowledge_lessons');
    if (lessonCount === 0) {
        await db.putAll('knowledge_lessons', SEED_KNOWLEDGE_LESSONS);
    }

    // Settings are stored as {key, value} pairs.
    const settingCount = await db.count('settings');
    if (settingCount === 0) {
        for (const [key, value] of Object.entries(SEED_SETTINGS)) {
            await db.put('settings', { key, value });
        }
    }

    await db.put('sync_meta', { key: 'seeded', at: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// PULL — fetch fresh content from the server and update IndexedDB.
// ---------------------------------------------------------------------------
async function pullContent() {
    const base = apiBase();
    const key = apiKey();
    if (!base || !key) return;

    try {
        const res = await fetch(`${base}/v1/content`, {
            headers: { 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' },
            credentials: 'same-origin',
        });

        if (!res.ok) return;

        const data = await res.json();

        if (data.exercises?.length) {
            await db.putAll('exercises', data.exercises);
        }
        if (data.levels?.length) {
            await db.putAll('levels', data.levels);
        }
        if (data.onboarding_slides?.length) {
            await db.putAll('onboarding_slides', data.onboarding_slides);
        }
        if (data.knowledge_lessons?.length) {
            await db.putAll('knowledge_lessons', data.knowledge_lessons);
        }
        if (data.settings) {
            for (const [key, value] of Object.entries(data.settings)) {
                await db.put('settings', { key, value });
            }
        }

        await db.put('sync_meta', { key: 'last_pull', at: data.synced_at || new Date().toISOString() });
    } catch (e) {
        // Network error — silently skip, data stays as-is.
    }
}

// ---------------------------------------------------------------------------
// PUSH — send queued user data (sessions, measurements) to the server.
// ---------------------------------------------------------------------------
async function pushUserData() {
    const base = apiBase();
    const key = apiKey();
    if (!base || !key) return;

    // Gather unsynced workout sessions.
    const allSessions = await db.getAll('workout_sessions');
    const pendingSessions = allSessions.filter(s => !s._synced);

    // Gather unsynced measurements.
    const allMeasurements = await db.getAll('measurements');
    const pendingMeasurements = allMeasurements.filter(m => !m._synced);

    // Gather reminders.
    const reminders = await db.getAll('reminders');

    if (!pendingSessions.length && !pendingMeasurements.length && !reminders.length) {
        return;
    }

    try {
        const headers = await authHeaders(key);
        headers['Content-Type'] = 'application/json';
        headers['X-CSRF-TOKEN'] = csrfToken();

        const res = await fetch(`${base}/v1/user/push`, {
            method: 'POST',
            headers: headers,
            credentials: 'same-origin',
            body: JSON.stringify({
                workout_sessions: pendingSessions.map(s => ({
                    exercise_slug: s.exercise_slug,
                    duration_seconds: s.duration_seconds,
                    completed_at_iso: s.completed_at_iso,
                    is_extra: s.is_extra || false,
                })),
                measurements: pendingMeasurements.map(m => ({
                    seconds: m.seconds,
                    measured_at_iso: m.measured_at_iso,
                })),
                reminders: reminders.map(r => ({
                    weekday: r.weekday,
                    times: r.times,
                    is_enabled: r.is_enabled,
                })),
            }),
        });

        if (res.status === 401) {
            // Auth expired — keep data, retry after login.
            return;
        }

        if (!res.ok) return;

        // Mark sessions as synced.
        for (const s of pendingSessions) {
            s._synced = true;
            await db.put('workout_sessions', s);
        }

        // Mark measurements as synced.
        for (const m of pendingMeasurements) {
            m._synced = true;
            await db.put('measurements', m);
        }

        await db.put('sync_meta', { key: 'last_push', at: new Date().toISOString() });
    } catch (e) {
        // Network error — keep data, retry later.
    }
}

// ---------------------------------------------------------------------------
// PULL user data — re-hydrate IndexedDB from server (fresh install).
// ---------------------------------------------------------------------------
async function pullUserData() {
    const base = apiBase();
    const key = apiKey();
    if (!base || !key) return;

    try {
        const headers = await authHeaders(key);
        const res = await fetch(`${base}/v1/user/pull`, {
            headers: headers,
            credentials: 'same-origin',
        });

        if (!res.ok) return;

        const data = await res.json();

        // Store server sessions (already synced).
        if (data.workout_sessions?.length) {
            for (const s of data.workout_sessions) {
                await db.put('workout_sessions', {
                    ...s,
                    local_id: s.id,
                    _synced: true,
                    _from_server: true,
                });
            }
        }

        // Store server measurements.
        if (data.measurements?.length) {
            for (const m of data.measurements) {
                await db.put('measurements', {
                    ...m,
                    local_id: m.id,
                    _synced: true,
                    _from_server: true,
                });
            }
        }

        // Store reminders.
        if (data.reminders?.length) {
            for (const r of data.reminders) {
                await db.put('reminders', r);
            }
        }

        // Store user position and today progress metadata
        if (data.position) {
            await db.put('sync_meta', { key: 'user_position', value: data.position });
        }
        if (data.today) {
            await db.put('sync_meta', { key: 'today_progress', value: data.today });
        }
        if (data.user) {
            await db.put('sync_meta', { key: 'user_profile', value: data.user });
        }

        await db.put('sync_meta', { key: 'last_user_pull', at: data.synced_at || new Date().toISOString() });
    } catch (e) {
        // Silently skip.
    }
}

// ---------------------------------------------------------------------------
// Queue helpers — called from Livewire/Alpine when user completes an action.
// ---------------------------------------------------------------------------

/** Queue a completed workout session for offline sync. */
async function queueSession(data) {
    await db.add('workout_sessions', {
        exercise_slug: data.exercise_slug || null,
        duration_seconds: data.duration_seconds || 0,
        completed_at_iso: data.completed_at_iso || new Date().toISOString(),
        is_extra: data.is_extra || false,
        _synced: false,
    });
}

/** Queue a measurement for offline sync. */
async function queueMeasurement(data) {
    await db.add('measurements', {
        seconds: data.seconds || 0,
        measured_at_iso: data.measured_at_iso || new Date().toISOString(),
        _synced: false,
    });
}

/** Save reminder state locally (also queued for push). */
async function saveReminder(weekday, times, isEnabled) {
    await db.put('reminders', {
        weekday,
        times: times || ['08:00'],
        is_enabled: isEnabled,
    });
}

// ---------------------------------------------------------------------------
// Full sync cycle.
// ---------------------------------------------------------------------------
async function fullSync() {
    if (!navigator.onLine) return;

    await pullContent();
    await pushUserData();

    // Only pull user data if we haven't done it recently (avoids overwriting local).
    const lastUserPull = await db.get('sync_meta', 'last_user_pull');
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    if (!lastUserPull || new Date(lastUserPull.at).getTime() < fiveMinAgo) {
        await pullUserData();
    }
}

// ---------------------------------------------------------------------------
// Boot — initialize the sync engine.
// ---------------------------------------------------------------------------
let _syncInterval = null;

function syncEnabled() {
    const el = document.querySelector('meta[name="sync-enabled"]');
    return !el || el.content !== '0'; // default to enabled
}

function syncIntervalMs() {
    const el = document.querySelector('meta[name="sync-interval"]');
    const mins = el ? parseInt(el.content, 10) : 15;
    return Math.max(5, mins) * 60 * 1000;
}

async function boot() {
    await db.open();
    await ensurePreSeeded();

    if (!syncEnabled()) return; // Sync disabled from admin panel.

    // Request persistent storage so browser won't evict IndexedDB.
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
    }

    // Sync now if online.
    if (navigator.onLine) {
        // Small delay so the page finishes loading first.
        setTimeout(() => fullSync(), 2000);
    }

    // Sync when connectivity returns.
    window.addEventListener('online', () => {
        setTimeout(() => fullSync(), 1000);
    });

    // Periodic sync at admin-configured interval.
    _syncInterval = setInterval(() => {
        if (navigator.onLine) fullSync();
    }, syncIntervalMs());
}

// Expose on window for Livewire/Alpine access.
window.kegelSync = {
    boot,
    fullSync,
    pullContent,
    pushUserData,
    pullUserData,
    queueSession,
    queueMeasurement,
    saveReminder,
    db, // expose db for direct reads in Alpine
};

export default window.kegelSync;
