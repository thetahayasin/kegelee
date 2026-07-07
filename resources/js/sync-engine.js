/**
 * Kegelee Sync Engine — two-way offline-first sync.
 *
 * Exercises, levels, onboarding, plans and the basics tutorials are all
 * hardcoded in the app (PHP catalogues seeded into the device's SQLite);
 * the server-side content sync only refreshes legal pages. This engine's
 * job is user progress: sessions and measurements queue in IndexedDB while
 * offline and push when connectivity returns.
 *
 * Runs automatically:
 * - On app boot (sync if online).
 * - On `navigator.onLine` change (sync immediately when connectivity returns).
 * - Every 15 minutes while online.
 */

import db from './offline-db.js';

function apiBase() {
    const el = document.querySelector('meta[name="sync-api-base"]');
    return el ? el.content : '';
}

function csrfToken() {
    const el = document.querySelector('meta[name="csrf-token"]');
    return el ? el.content : '';
}

// Real connectivity probe. The OS online flag lies (idle radios, captive
// portals), so confirm by reaching the backend health endpoint. Uses no-cors
// so a cross-origin device→backend probe isn't blocked: any resolved response
// (even opaque) means the server is reachable. Result is briefly cached.
let _probe = { at: 0, online: null };
async function probeOnline(maxAgeMs = 6000) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        _probe = { at: Date.now(), online: false };
        return false;
    }
    if (_probe.online !== null && (Date.now() - _probe.at) < maxAgeMs) {
        return _probe.online;
    }
    const origin = (apiBase() || '').replace(/\/api\/?$/, '');
    const url = (origin || '') + '/up';
    let online = false;
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        await fetch(url, { method: 'GET', cache: 'no-store', mode: 'no-cors', signal: ctrl.signal });
        clearTimeout(timer);
        online = true; // resolved (even opaque) ⇒ server reachable
    } catch (e) {
        online = false;
    }
    _probe = { at: Date.now(), online };
    return online;
}

// Identify the acting user via the per-user API token issued at sign-in
// (meta tag on the page, falling back to the cached profile). Same-origin
// requests also carry the session cookie, so the web works even without it.
async function authHeaders() {
    const headers = {
        'Accept': 'application/json',
    };

    const tokenEl = document.querySelector('meta[name="user-token"]');
    let token = tokenEl ? tokenEl.content : '';

    if (!token) {
        try {
            const profile = await db.get('sync_meta', 'user_profile');
            if (profile && profile.value && profile.value.api_token) {
                token = profile.value.api_token;
            }
        } catch (e) {
            // DB not ready yet or read failed
        }
    }

    if (token) headers['X-User-Token'] = token;

    return headers;
}

// ---------------------------------------------------------------------------
// PULL — note the last successful content check (pages sync server-side).
// ---------------------------------------------------------------------------
async function pullContent() {
    const base = apiBase();
    if (!base) return;

    try {
        const res = await fetch(`${base}/v1/content`, {
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin',
        });

        if (!res.ok) return;

        const data = await res.json();

        await db.put('sync_meta', { key: 'last_pull', at: data.synced_at || new Date().toISOString() });
    } catch (e) {
        // Network error — silently skip.
    }
}

// ---------------------------------------------------------------------------
// PUSH — send queued user data (sessions, measurements) to the server.
// ---------------------------------------------------------------------------
async function pushUserData() {
    if (halted()) return;
    const base = apiBase();
    if (!base) return;

    // Gather unsynced workout sessions.
    const allSessions = await db.getAll('workout_sessions');
    const pendingSessions = allSessions.filter(s => !s._synced);

    // Gather unsynced measurements.
    const allMeasurements = await db.getAll('measurements');
    const pendingMeasurements = allMeasurements.filter(m => !m._synced);

    // Reminders are NOT pushed from here: the Reminders screen writes them to
    // the local DB (SQLite) and UserSyncService pushes the live rows. Pushing a
    // possibly-stale IndexedDB copy here could overwrite a fresh edit.

    if (!pendingSessions.length && !pendingMeasurements.length) {
        return;
    }

    try {
        const headers = await authHeaders();
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
    if (!base) return;

    try {
        const headers = await authHeaders();
        const res = await fetch(`${base}/v1/user/pull`, {
            headers: headers,
            credentials: 'same-origin',
        });

        if (!res.ok) return;

        const data = await res.json();

        // Store server sessions — deduplicate by completed_at timestamp against
        // existing local entries to prevent offline→online inflation.
        if (data.workout_sessions?.length) {
            const existingSessions = await db.getAll('workout_sessions');
            const existingTimestamps = new Set(
                existingSessions.map(s => s.completed_at_iso || s.completed_at || '')
                    .filter(Boolean)
            );

            for (const s of data.workout_sessions) {
                const ts = s.completed_at || '';
                // Skip if we already have a session within the same second
                if (ts && existingTimestamps.has(ts)) continue;

                await db.put('workout_sessions', {
                    ...s,
                    completed_at_iso: s.completed_at,
                    local_id: s.id,
                    _synced: true,
                    _from_server: true,
                });
                if (ts) existingTimestamps.add(ts);
            }
        }

        // Store server measurements — same deduplication.
        if (data.measurements?.length) {
            const existingMeasurements = await db.getAll('measurements');
            const existingMeasTs = new Set(
                existingMeasurements.map(m => m.measured_at_iso || m.measured_at || '')
                    .filter(Boolean)
            );

            for (const m of data.measurements) {
                const ts = m.measured_at || '';
                if (ts && existingMeasTs.has(ts)) continue;

                await db.put('measurements', {
                    ...m,
                    measured_at_iso: m.measured_at,
                    local_id: m.id,
                    _synced: true,
                    _from_server: true,
                });
                if (ts) existingMeasTs.add(ts);
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

/**
 * Wipe the local offline copy of the user's progress (after a server-confirmed
 * "Reset progress"), so the engine can't re-push the just-deleted data.
 */
async function clearProgressData() {
    try {
        await db.clear('workout_sessions');
        await db.clear('measurements');
        await db.clear('reminders');
        await db.remove('sync_meta', 'user_position');
        await db.put('sync_meta', { key: 'today_progress', value: { done: 0, required: 2 } });
    } catch (e) {}
}

/**
 * Object form used by the Reminders screen. The `reminders` store keys on
 * `weekday`, so this upserts (no duplicate rows). Tolerates string weekdays.
 */
async function queueReminder(data) {
    await db.put('reminders', {
        weekday: parseInt(data.weekday, 10),
        times: data.times || ['08:00'],
        is_enabled: !!data.is_enabled,
    });
}

// ---------------------------------------------------------------------------
// Server-side sync — asks the LOCAL device server to pull fresh backend
// content into its SQLite (the primary render source) and two-way sync the
// signed-in user's data. This is what makes admin content actually appear.
// ---------------------------------------------------------------------------
async function runServerSync() {
    if (halted()) return false;
    try {
        const res = await fetch('/sync/run', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'X-CSRF-TOKEN': csrfToken(),
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
        });
        if (!res.ok) {
            toastSync('Sync request failed (HTTP ' + res.status + ')');
            return false;
        }
        const data = await res.json();

        // Surface failures so they are visible on-device instead of silent.
        if (data.reason === 'not_a_client') {
            toastSync('Sync off: app not detected as device (host ' + (data.diagnostics?.request_host || '?') + ')');
            return false;
        }
        const c = data.content || {};
        if (!c.ok && c.error) {
            toastSync('Sync error: ' + c.error);
        }

        // Refresh the visible Livewire components so new content shows without
        // a hard reload.
        if (data.changed && window.Livewire) {
            window.Livewire.all().forEach(comp => comp.$wire.$refresh());
        }
        return !!data.changed;
    } catch (e) {
        toastSync('Sync failed: ' + (e?.message || 'network error'));
        return false;
    }
}

// Toast only when sync debugging is enabled (meta[name=sync-debug]=1), so we
// don't nag users in production but can diagnose on demand.
function toastSync(msg) {
    const dbg = document.querySelector('meta[name="sync-debug"]');
    if (dbg && dbg.content === '1' && window.showToast) {
        window.showToast(msg);
    }
}

// ---------------------------------------------------------------------------
// Full sync cycle.
// ---------------------------------------------------------------------------
let _syncing = false;
let _failures = 0;
let _nextAllowedAt = 0;

async function fullSync() {
    if (halted()) return;
    if (_syncing) return;                      // single-flight: never overlap
    if (Date.now() < _nextAllowedAt) return;   // honoring backoff window
    if (!(await probeOnline())) return;        // real connectivity, not the OS flag

    _syncing = true;
    try {
        // Primary: server-side pull into local SQLite (renders server-side).
        await runServerSync();

        // Secondary: keep the IndexedDB offline cache warm for offline rendering.
        await pullContent();
        await pushUserData();

        const lastUserPull = await db.get('sync_meta', 'last_user_pull');
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        if (!lastUserPull || new Date(lastUserPull.at).getTime() < fiveMinAgo) {
            await pullUserData();
        }

        _failures = 0;
        _nextAllowedAt = 0;
    } catch (e) {
        // Exponential backoff (capped at 5 min) so a flaky network doesn't spin.
        _failures = Math.min(_failures + 1, 6);
        _nextAllowedAt = Date.now() + Math.min(5 * 60 * 1000, 1000 * Math.pow(2, _failures));
    } finally {
        _syncing = false;
    }
}

// ---------------------------------------------------------------------------
// Boot — initialize the sync engine.
// ---------------------------------------------------------------------------
let _syncInterval = null;
let _stopped = false;

/** Halt all background sync permanently (called on logout). */
function stop() {
    _stopped = true;
    if (_syncInterval) {
        clearInterval(_syncInterval);
        _syncInterval = null;
    }
}

/** True when sync must not run: stopped, or a logout redirect is in flight. */
function halted() {
    return _stopped || (typeof window !== 'undefined' && window.__loggingOut);
}

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

    if (!syncEnabled()) return; // Sync disabled from admin panel.

    // Request persistent storage so browser won't evict IndexedDB.
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
    }

    // Initial sync shortly after load — fullSync() self-gates on real connectivity.
    setTimeout(() => fullSync(), 2000);

    // Sync when connectivity returns (force a fresh probe first).
    window.addEventListener('online', () => {
        _probe = { at: 0, online: null };
        _nextAllowedAt = 0;
        setTimeout(() => fullSync(), 1000);
    });

    // Flush the outbox the moment the app goes to the background, so a just
    // finished session isn't lost if Android kills the webview afterwards.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && !halted()) {
            pushUserData().catch(() => {});
        }
    });

    // Periodic sync at the admin-configured interval.
    _syncInterval = setInterval(() => fullSync(), syncIntervalMs());
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
    queueReminder,
    clearProgressData,
    stop,
    probeOnline,
    db, // expose db for direct reads in Alpine
};

export default window.kegelSync;
