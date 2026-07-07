const CACHE_NAME = 'kegel-v7';

const PRECACHE = [
    '/offline.html',
];

// ---------------------------------------------------------------------------
// INSTALL — pre-cache the offline fallback.
// ---------------------------------------------------------------------------
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(c => c.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

// ---------------------------------------------------------------------------
// ACTIVATE — clean old caches, claim clients immediately.
// ---------------------------------------------------------------------------
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(names =>
            Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
        ).then(() => self.clients.claim())
    );
});

// ---------------------------------------------------------------------------
// FETCH — strategy depends on the request type.
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Skip non-GET and Livewire update requests (POST to /livewire/update).
    if (e.request.method !== 'GET') return;

    // Skip Livewire internal routes.
    if (url.pathname.startsWith('/livewire-')) return;

    // Skip API routes — the sync engine handles these directly.
    if (url.pathname.startsWith('/api/')) return;

    // Skip auth-related routes — these must always be fresh.
    const authPaths = ['/login', '/register', '/verify', '/forgot-password', '/reset-password', '/auth/'];
    if (authPaths.some(p => url.pathname.startsWith(p))) return;

    // Skip admin routes.
    if (url.pathname.startsWith('/admin')) return;

    // Legal pages are online-only - never serve a stale cached policy.
    if (url.pathname.startsWith('/p/') || url.pathname === '/legal') return;

    // ----- Static assets: cache-first -----
    if (/\.(css|js|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico|lottie)(\?|$)/.test(url.pathname)
        || url.pathname.startsWith('/build/')) {
        e.respondWith(
            caches.match(e.request).then(cached => {
                if (cached) return cached;
                return fetch(e.request).then(resp => {
                    if (resp.ok) {
                        const clone = resp.clone();
                        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                    }
                    return resp;
                }).catch(() => cached || new Response('', { status: 503 }));
            })
        );
        return;
    }

    // ----- HTML pages: network ONLY (with one retry), never cached. -----
    // The PHP server is local on the device, so "offline" still serves pages;
    // cached HTML carries stale sessions/CSRF (raw "Unauthenticated" JSON),
    // stale data (level/time frozen until restart) and ghost screens (the
    // /welcome shell replacing other routes). The only real failure mode is
    // the cold-start race while the local server boots - retry covers that.
    if (e.request.headers.get('accept')?.includes('text/html')) {
        e.respondWith(
            fetch(e.request).catch(() =>
                new Promise(resolve => setTimeout(resolve, 600))
                    .then(() => fetch(e.request))
                    .catch(() => caches.match('/offline.html'))
            )
        );
        return;
    }

    // ----- Videos: cache-if-available, otherwise network -----
    if (/\.(mp4|webm|mov)(\?|$)/.test(url.pathname)) {
        e.respondWith(
            caches.match(e.request).then(cached => {
                if (cached) return cached;
                return fetch(e.request);
            })
        );
        return;
    }
});
