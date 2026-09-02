// The web is the marketing site, the legal pages and the admin panel; the
// training app is the React Native client in react-native-app/. Livewire 4
// ships and boots its own bundle (including Alpine), so this file only carries
// the few helpers those server-rendered pages need.

// ---------------------------------------------------------------------------
// Livewire request resilience
// ---------------------------------------------------------------------------
// Suppress Livewire's default error modal (a full-page HTML dump) and retry
// transient failures a few times before telling the user.
document.addEventListener('livewire:init', () => {
    const MAX_RETRIES = 3;
    const RETRY_BASE_MS = 800;
    let retryCount = 0;

    Livewire.hook('request', ({ payload, succeed, fail }) => {
        // Only a successful round trip clears the counter. It used to be reset
        // inside the retry timer, so the cap was never reached and a server
        // that was down got refreshed forever.
        succeed(() => { retryCount = 0; });

        fail(({ status, preventDefault }) => {
            // 419 = the session (and its CSRF token) expired: reload silently
            // rather than showing a confirm() dialog.
            if (status === 419) {
                preventDefault();
                window.location.reload();
                return;
            }

            // 401 = no longer signed in. Land on the admin login instead of
            // surfacing the raw {"message":"Unauthenticated."} body.
            if (status === 401) {
                preventDefault();
                window.location.href = '/mystic/login';
                return;
            }

            if (retryCount < MAX_RETRIES) {
                preventDefault();
                retryCount++;
                // 0.8s, 1.6s, 3.2s. Refreshing on a fixed short delay turned
                // one failure into a request storm.
                setTimeout(() => refreshComponents(payload), RETRY_BASE_MS * Math.pow(2, retryCount - 1));
                return;
            }

            preventDefault();
            retryCount = 0;
            showToast('Connection lost. Refresh the page to try again.');
        });
    });

    // Refresh only the components whose request failed. The ids are in the
    // request body; refreshing every component on the page made one failed
    // commit cost N more requests.
    function refreshComponents(payload) {
        let ids = [];
        try {
            const body = typeof payload === 'string' ? JSON.parse(payload) : payload;
            ids = (body?.components || [])
                .map((c) => {
                    const snapshot = typeof c.snapshot === 'string' ? JSON.parse(c.snapshot) : c.snapshot;
                    return snapshot?.memo?.id;
                })
                .filter(Boolean);
        } catch (e) {
            // Unreadable payload; fall through to the whole page below.
        }

        try {
            const targets = ids.map((id) => Livewire.find(id)).filter(Boolean);
            (targets.length ? targets : Livewire.all()).forEach((c) => c.$wire.$refresh());
        } catch (e) {}
    }
});

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
        position: 'fixed', bottom: '1.5rem',
        left: '50%', transform: 'translateX(-50%)',
        padding: '10px 20px', borderRadius: '12px',
        fontSize: '13px', fontWeight: '600',
        background: 'rgba(22,24,31,0.97)', color: '#fff',
        border: '1px solid rgba(255,255,255,0.1)',
        zIndex: '9999',
        transition: 'opacity 0.3s ease',
    });
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 3500);
}

window.showToast = showToast;
