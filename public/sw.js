/* ParentRecall service worker.
   - App shell: cache-first (instant launch, works offline).
   - API GETs: network-first with cache fallback (fresh when online, readable offline).
   - API writes (POST/PUT/DELETE): network only, never cached. */
const SHELL_CACHE = 'parentrecall-shell-v2';
const API_CACHE = 'parentrecall-api-v2';
const SHELL = [
  '/', '/index.html', '/styles.css', '/app.js', '/logo.png',
  '/icon-192.png', '/icon-512.png', '/manifest.json', '/vendor/xlsx.full.min.js'
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
    // network-first, fall back to the last cached copy when offline
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
  // app shell: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && url.origin === location.origin) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => { if (req.mode === 'navigate') return caches.match('/index.html'); });
    })
  );
});
