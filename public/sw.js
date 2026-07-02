const CACHE_NAME = 'kegel-v5';

const PRECACHE = [
    '/welcome',
    '/offline.html',
];

// ---------------------------------------------------------------------------
// INSTALL — pre-cache onboarding + offline fallback.
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

    // ----- HTML pages: network-first, cache fallback, offline shell last resort -----
    if (e.request.headers.get('accept')?.includes('text/html')) {
        e.respondWith(
            fetch(e.request)
                .then(resp => {
                    if (resp.ok) {
                        const clone = resp.clone();
                        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                    }
                    return resp;
                })
                .catch(() =>
                    caches.match(e.request)
                        .then(c => c || caches.match('/welcome'))
                        .then(c => c || caches.match('/offline.html'))
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
