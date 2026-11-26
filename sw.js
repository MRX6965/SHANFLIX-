/* SHANFLIX service worker */
const VERSION = 'shanflix-v8';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const SHELL_ASSETS = [
  "app.js", "features.js", "sync.js", "player.js", "rows.js", "i18n.js", "config.js",
  './', 'index.html', 'offline.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never intercept video streams / player embeds / range requests
  if (url.hostname.endsWith('vidsync.pro') || req.headers.has('range')) return;

  // Download catalog must always be fresh
  if (url.origin === location.origin && url.pathname.endsWith('/downloads.json')) return;

  // Never touch cross-origin navigations (player iframes)
  if (req.mode === 'navigate' && url.origin !== location.origin) return;

  // Page navigations: network first, fall back to cache, then offline page
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { caches.open(SHELL).then(c => c.put('index.html', res.clone())); return res; })
        .catch(() => caches.match('index.html').then(r => r || caches.match('offline.html')))
    );
    return;
  }

  // TMDB API: network first, cache fallback
  if (url.hostname === 'api.themoviedb.org' || url.pathname === '/api/tmdb') {
    e.respondWith(
      fetch(req)
        .then(res => { if (res.ok) caches.open(RUNTIME).then(c => c.put(req, res.clone())); return res; })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Own scripts/data: network first so updates arrive immediately
  if (url.origin === location.origin && /\.(js|json|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      fetch(req).then(res => { if (res.ok) caches.open(RUNTIME).then(c => c.put(req, res.clone())); return res; })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Same-origin assets, images, fonts: stale-while-revalidate
  const cacheable = url.origin === location.origin ||
    ['image.tmdb.org', 'fonts.googleapis.com', 'fonts.gstatic.com', 'upload.wikimedia.org'].includes(url.hostname);
  if (cacheable) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if (res.ok || res.type === 'opaque') caches.open(RUNTIME).then(c => c.put(req, res.clone()));
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
