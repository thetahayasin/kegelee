// Livewire 4 ships and boots its own bundle (including Alpine), so this file
// only carries small, app-wide helpers used by the workout player and
// offline-first resilience for NativePHP Android.

window.kegel = {
    haptic(ms = 20) {
        try {
            if (window.navigator?.vibrate) window.navigator.vibrate(ms);
        } catch (e) {}
    },
};

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

    Livewire.hook('request', ({ fail }) => {
        fail(({ status, preventDefault }) => {
            // 419 = session expired: reload silently instead of confirm()
            if (status === 419) {
                preventDefault();
                window.location.reload();
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
    offlineBanner.textContent = 'You are offline';
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

window.addEventListener('offline', showOfflineBanner);
window.addEventListener('online', () => {
    hideOfflineBanner();
    // Re-send any pending Livewire commits
    if (window.Livewire) {
        Livewire.all().forEach(c => c.$wire.$refresh());
    }
});

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
