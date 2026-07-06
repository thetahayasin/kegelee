// Livewire 4 ships and boots its own bundle (including Alpine), so this file
// only carries small, app-wide helpers used by the workout player and
// offline-first resilience for NativePHP Android.

// ---------------------------------------------------------------------------
// Offline-first sync engine — IndexedDB + server two-way sync
// ---------------------------------------------------------------------------
import './sync-engine.js';

// Boot the sync engine once the DOM is ready.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.kegelSync?.boot());
} else {
    window.kegelSync?.boot();
}

window.kegel = {
    haptic(ms = 20) {
        try {
            if (window.navigator?.vibrate) window.navigator.vibrate(ms);
        } catch (e) {}
    },
};

// ---------------------------------------------------------------------------
// Logout coordination
// ---------------------------------------------------------------------------
// When the user signs out, a hard redirect to /login is in flight. Any
// background request (sync engine, Livewire $refresh, retries) that lands on an
// auth-gated endpoint after Auth::logout() returns a raw "Unauthenticated."
// body. We set a global flag the instant logout starts so every background
// task no-ops until the navigation completes.
window.__loggingOut = false;
window.beginLogout = function () {
    window.__loggingOut = true;
    try { window.kegelSync?.stop(); } catch (e) {}
};
document.addEventListener('auth:logout', window.beginLogout);

// Back/forward can restore a stale page from the browser's bfcache — e.g. the
// old level on the Profile/Home cards right after changing it. Refresh Livewire
// components when a page is restored from bfcache so every card reflects the
// latest server data. Skip during an active workout so the player isn't reset.
window.addEventListener('pageshow', (e) => {
    if (e.persisted && window.Livewire && !window.__loggingOut && !window.kegelPlayerTimer) {
        try { window.Livewire.all().forEach((c) => c.$wire.$refresh()); } catch (err) {}
    }
});

// The Home (training), Profile and Difficulty screens show level-derived data —
// the level name on the "Difficulty" button, the session length and the
// selected radio. wire:navigate serves a cached snapshot on a back/forward
// gesture, which can show the OLD difficulty after a change. Refresh those
// screens whenever they're shown so they always reflect the current level.
// Skipped during a workout.
document.addEventListener('livewire:navigated', () => {
    if (window.__loggingOut || window.kegelPlayerTimer) return;
    const p = location.pathname;
    if (p === '/app' || p === '/profile' || p === '/levels') {
        try { window.Livewire?.all().forEach((c) => c.$wire.$refresh()); } catch (e) {}
    }
});

// ---------------------------------------------------------------------------
// Hardware back-button coordination (Android / webview)
// ---------------------------------------------------------------------------
// The native shell asks appBack.handleSystemBack() on every back press and the
// app decides, native-style:
//   1. An open sheet/dialog closes first (screens register a handler).
//   2. Otherwise back goes UP the app's own screen hierarchy (Exercise ->
//      Exercises -> Home), never replaying raw browser history.
//   3. At a root screen it returns "exit" and the shell minimizes the app.
//   4. Screens without a mapping fall back to normal history.
//
// In a plain browser (dev preview) the shell never calls in; a history
// sentinel keeps the register() interception working there too.
(function () {
    const stack = [];
    let nativeBack = false; // true once the native shell takes over

    // Browser fallback: push a sentinel history entry so the next back press
    // fires popstate without leaving the page.
    function arm() {
        try { history.pushState({ __backGuard: true }, ''); } catch (e) {}
    }

    // The logical parent of each screen. null = root (back minimizes the
    // app); 'default' = no opinion (plain history back).
    function parentOf(path) {
        const authed = !!document.querySelector('meta[name="user-email"]');
        const subscribed = document.querySelector('meta[name="app-subscribed"]')?.content === '1';

        if (path === '/' || path === '/app' || path === '/welcome') return null;
        if (path === '/upgrade') return subscribed ? '/app' : null; // the paywall IS the app when unsubscribed
        if (path === '/knowledge') return authed ? '/app' : '/welcome';
        if (path.startsWith('/knowledge/')) return '/knowledge';
        if (path.startsWith('/exercises/')) return '/exercises';
        if (path === '/exercises') return '/app';
        if (path === '/progress') return '/app';
        if (path === '/profile') return '/app';
        if (path === '/settings') return '/profile';
        if (path === '/change-password') return '/settings';
        if (path === '/levels') return '/profile';
        if (path === '/schedule') return '/profile';
        if (path === '/reminders') return '/schedule';
        if (path.startsWith('/p/')) return authed ? '/settings' : '/welcome';

        return 'default';
    }

    window.appBack = {
        register(handler) {
            stack.push(handler);
            if (!nativeBack) arm();
            return function unregister() {
                const i = stack.lastIndexOf(handler);
                if (i !== -1) stack.splice(i, 1);
            };
        },
        get active() { return stack.length > 0; },

        // Called by the native shell. Returns 'handled' | 'exit' | 'default'.
        handleSystemBack() {
            nativeBack = true;
            if (window.__loggingOut) return 'handled';

            // 1. Open sheet/dialog first.
            if (stack.length) {
                try { stack[stack.length - 1](); } catch (e) {}
                return 'handled';
            }

            // 2. Walk the app hierarchy.
            const target = parentOf(location.pathname);
            if (target === null) return 'exit';
            if (target === 'default') return 'default';

            try {
                if (window.Livewire?.navigate) window.Livewire.navigate(target);
                else window.location.href = target;
            } catch (e) {
                window.location.href = target;
            }
            return 'handled';
        },
    };

    window.addEventListener('popstate', function () {
        if (nativeBack) return; // the shell owns back now; ignore sentinel pops
        if (!stack.length) return; // no interceptor → allow normal back navigation
        arm(); // re-arm for the next back press while the screen is still active
        const handler = stack[stack.length - 1];
        try { handler(); } catch (e) {}
    });
})();

// ---------------------------------------------------------------------------
// Service Worker registration
// ---------------------------------------------------------------------------
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ---------------------------------------------------------------------------
// Livewire request resilience
// ---------------------------------------------------------------------------
// Suppress Livewire's default error modal (full-page HTML dump) and silently
// retry failed requests. In NativePHP the server is local, so failures are
// transient (webview reload, brief server restart).
document.addEventListener('livewire:init', () => {
    const MAX_RETRIES = 3;
    const RETRY_MS = 800;
    let retryCount = 0;

    // After a server-confirmed "Reset progress", wipe the offline copy too so
    // the sync engine can't re-push the just-deleted sessions/measurements.
    Livewire.on('progress-reset', () => {
        window.kegelSync?.clearProgressData?.();
    });

    // Navigate while REPLACING the current history entry (used after finishing a
    // knowledge lesson) so the native Back button doesn't return to the video.
    Livewire.on('navigate-replace', (payload) => {
        const data = Array.isArray(payload) ? payload[0] : payload;
        const url = data && data.url;
        if (url) window.location.replace(url);
    });

    Livewire.hook('request', ({ fail }) => {
        fail(({ status, preventDefault }) => {
            // Signing out: a hard redirect is in flight — abandon quietly, never
            // show an error or refresh a now-unauthenticated component.
            if (window.__loggingOut) {
                preventDefault();
                return;
            }

            // 419 = session expired: reload silently instead of confirm()
            if (status === 419) {
                preventDefault();
                window.location.reload();
                return;
            }

            // 401 = no longer authenticated (session ended, or navigating back to
            // an authenticated page after logout). Redirect to login cleanly
            // instead of surfacing the raw {"message":"Unauthenticated."} body.
            if (status === 401) {
                preventDefault();
                window.location.href = '/login';
                return;
            }

            // Transient failure: retry up to MAX_RETRIES
            if (retryCount < MAX_RETRIES) {
                preventDefault();
                retryCount++;
                setTimeout(() => {
                    // Livewire will re-send the pending commit on next interaction
                    // or we can trigger a component refresh
                    Livewire.all().forEach(c => c.$wire.$refresh());
                    retryCount = 0;
                }, RETRY_MS * retryCount);
                return;
            }

            // All retries exhausted: suppress the ugly HTML modal,
            // show a toast instead
            preventDefault();
            retryCount = 0;
            showToast('Connection lost. Pull down to refresh.');
        });
    });
});

// ---------------------------------------------------------------------------
// Offline / online awareness
// ---------------------------------------------------------------------------
let offlineBanner = null;

function showOfflineBanner() {
    if (offlineBanner) return;
    offlineBanner = document.createElement('div');
    offlineBanner.id = 'offline-banner';
    offlineBanner.textContent = 'No internet connection';
    Object.assign(offlineBanner.style, {
        position: 'fixed', top: 'env(safe-area-inset-top, 0)',
        left: '0', right: '0', zIndex: '9999',
        padding: '6px 0', textAlign: 'center',
        fontSize: '12px', fontWeight: '600',
        background: 'rgba(255,70,70,0.9)', color: '#fff',
        transition: 'transform 0.3s ease',
    });
    document.body.appendChild(offlineBanner);
}

function hideOfflineBanner() {
    if (!offlineBanner) return;
    offlineBanner.remove();
    offlineBanner = null;
}

// Reconcile the banner with REAL connectivity — the OS online flag lies, so we
// confirm by probing the backend. Emits app:online / app:offline so screens
// that need the network (videos, etc.) can show a "no connection" state.
let _wasOffline = false;
async function refreshConnectivity() {
    if (window.__loggingOut) return;
    let online = true;
    try {
        online = window.kegelSync ? await window.kegelSync.probeOnline() : navigator.onLine;
    } catch (e) {
        online = navigator.onLine;
    }

    if (online) {
        hideOfflineBanner();
        window.dispatchEvent(new CustomEvent('app-online'));
        // Recovering from offline: re-pull fresh data into visible components.
        if (_wasOffline && window.Livewire && !window.__loggingOut) {
            Livewire.all().forEach(c => c.$wire.$refresh());
        }
        _wasOffline = false;
    } else {
        showOfflineBanner();
        window.dispatchEvent(new CustomEvent('app-offline'));
        _wasOffline = true;
    }

    return online;
}

// Instant OS signals plus a periodic real probe (captive portals, dropped radios).
window.addEventListener('offline', () => { showOfflineBanner(); _wasOffline = true; });
window.addEventListener('online', refreshConnectivity);
setInterval(refreshConnectivity, 20000);
setTimeout(refreshConnectivity, 2500);

// Returning to the foreground after the screen was off for a while: Android may
// still report the radio as down for a moment, the 'online' event is unreliable,
// and the 20s probe can be far away - which left a stale "No internet" banner up
// until it fired. Re-probe on resume and retry with backoff until the network is
// actually back, so the banner clears within a second or two of waking.
async function recheckOnResume(attempt) {
    if (document.visibilityState !== 'visible' || window.__loggingOut) return;
    const online = await refreshConnectivity();
    if (!online && attempt < 4) {
        setTimeout(() => recheckOnResume(attempt + 1), [1000, 2000, 4000, 8000][attempt]);
    }
}
document.addEventListener('visibilitychange', () => recheckOnResume(0));
window.addEventListener('focus', () => recheckOnResume(0));

// Promise<boolean> helper screens can await before doing online-only work.
window.appOnline = () => (window.kegelSync ? window.kegelSync.probeOnline() : Promise.resolve(navigator.onLine));
if (!navigator.onLine) showOfflineBanner();

// ---------------------------------------------------------------------------
// Toast helper
// ---------------------------------------------------------------------------
function showToast(msg) {
    let el = document.getElementById('kegel-toast');
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'kegel-toast';
    el.textContent = msg;
    Object.assign(el.style, {
        position: 'fixed', bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        left: '50%', transform: 'translateX(-50%)',
        padding: '10px 20px', borderRadius: '12px',
        fontSize: '13px', fontWeight: '600',
        background: 'rgba(22,24,31,0.95)', color: '#fff',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(12px)', zIndex: '9999',
        transition: 'opacity 0.3s ease',
    });
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 3500);
}

window.showToast = showToast;

// ---------------------------------------------------------------------------
// Google Play Billing bridge
// NativePHP Mobile dispatches billing results as custom DOM events.
// We forward them to Livewire so the Paywall component can react.
// ---------------------------------------------------------------------------
(function () {
    const map = {
        // NativePHP Mobile v3 event name → Livewire event name
        'native:billing.purchaseCompleted':   'native:InAppPurchase.purchaseCompleted',
        'native:billing.purchaseFailed':      'native:InAppPurchase.purchaseFailed',
        'native:billing.purchaseCancelled':   'native:InAppPurchase.purchaseCancelled',
        // Also handle alternative casing emitted by some versions
        'native:InAppPurchase.PurchaseCompleted':  'native:InAppPurchase.purchaseCompleted',
        'native:InAppPurchase.PurchaseFailed':     'native:InAppPurchase.purchaseFailed',
        'native:InAppPurchase.PurchaseCancelled':  'native:InAppPurchase.purchaseCancelled',
    };

    Object.entries(map).forEach(([domEvent, livewireEvent]) => {
        document.addEventListener(domEvent, (e) => {
            if (window.Livewire) {
                Livewire.dispatch(livewireEvent, e.detail ?? {});
            }
        });
    });
}());
