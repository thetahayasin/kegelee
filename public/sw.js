const CACHE_NAME = 'kegel-v1';

const PRECACHE = [
    '/',
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(c => c.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(names =>
            Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Skip non-GET and Livewire update requests (POST to /livewire/update)
    if (e.request.method !== 'GET') return;

    // Skip livewire internal routes
    if (url.pathname.startsWith('/livewire/')) return;

    // Static assets: cache-first (CSS, JS, fonts, images)
    if (/\.(css|js|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)(\?|$)/.test(url.pathname)
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

    // HTML pages: network-first with cache fallback
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
                .catch(() => caches.match(e.request).then(c => c || caches.match('/')))
        );
        return;
    }

    // Videos: cache if small enough, otherwise network-only
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
