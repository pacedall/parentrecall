/* ParentRecall service worker.
   - App shell: stale-while-revalidate (instant launch, auto-updates on next load).
   - API GETs: network-first with cache fallback (fresh when online, readable offline).
   - API writes (POST/PUT/DELETE): network only, never cached.
   Bump the cache version on each release to force a clean refresh. */
const SHELL_CACHE = 'parentrecall-shell-v19';
const API_CACHE = 'parentrecall-api-v19';
const SHELL = [
  '/', '/index.html', '/styles.css', '/app.js', '/logo.png',
  '/icon-192.png', '/icon-512.png', '/manifest.json',
  '/vendor/xlsx.full.min.js', '/vendor/dicebear.js',
  '/icon-maskable-192.png', '/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== SHELL_CACHE && k !== API_CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET') return; // writes: let them hit the network normally
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(API_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  if (req.method !== 'GET') return;

  // App shell: stale-while-revalidate.
  // Serve the cached copy instantly, but always fetch a fresh copy in the
  // background and update the cache, so the next load picks up new deploys.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && url.origin === location.origin) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || (req.mode === 'navigate' ? caches.match('/index.html') : undefined));
      return cached || network;
    })
  );
});
