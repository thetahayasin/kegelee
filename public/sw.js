// Tombstone.
//
// The web app that needed a service worker (offline screens, cached assets)
// is gone: the product is the React Native client, and the web is a marketing
// site, the legal pages and the admin panel. Browsers that installed the old
// worker still have it, and it would keep serving cached copies of pages that
// no longer exist - so this replacement drops its caches and unregisters
// itself the moment it activates. Delete this file once the old worker can no
// longer be in the wild.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((names) => Promise.all(names.map((n) => caches.delete(n))))
            .then(() => self.registration.unregister())
            .then(() => self.clients.matchAll({ type: 'window' }))
            .then((clients) => clients.forEach((c) => c.navigate(c.url)))
            .catch(() => {})
    );
});
