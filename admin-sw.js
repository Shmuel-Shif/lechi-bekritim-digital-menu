/* LECHAIM Admin — Service Worker (PWA installability) */
const CACHE = 'lechaim-admin-v1';
const PRECACHE = [
  './admin.html',
  './admin.webmanifest',
  './css/admin.css',
  './js/admin.js',
  './js/admin-tables.js',
  './js/admin-coupons.js',
  './js/admin-pwa.js',
  './js/supabase-config.js',
  './js/supabase-order-service.js',
  './js/menu-data.js',
  './js/inventory.js',
  './js/order-session.js',
  './js/order-engine.js',
  './js/print-engine.js',
  './assets/logo/logo-image.png',
  './assets/logo/logo-text.png',
  './assets/pwa/admin-icon-192.png',
  './assets/pwa/admin-icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Network-first for HTML so admin updates show quickly; cache fallback offline */
  if (req.mode === 'navigate' || url.pathname.endsWith('admin.html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./admin.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
