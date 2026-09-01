/* LECHAIM Admin — Service Worker (PWA installability) */
const CACHE = 'lechaim-admin-v180';
const PRECACHE = [
  './admin.html',
  './admin.webmanifest',
  './css/admin.css',
  './js/admin.js',
  './js/admin-tables.js',
  './js/admin-settings.js',
  './js/admin-till.js',
  './js/admin-staff-hours.js',
  './js/stock-catalog.js',
  './js/admin-stock.js',
  './js/admin-coupons.js',
  './js/admin-reservations.js',
  './js/kitchen-alert-service.js',
  './js/admin-kitchen-alerts.js',
  './js/admin-kitchen-board.js',
  './js/kitchen-progress.js',
  './js/kitchen-dish-groups.js',
  './js/admin-pwa.js',
  './js/admin-push.js',
  './js/supabase-config.js',
  './js/supabase-order-service.js',
  './js/opening-hours.js',
  './js/app-settings.js',
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
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});

function isAdminClient(client) {
  const href = String(client?.url || '');
  try {
    const path = new URL(href).pathname.replace(/\/+$/, '') || '/';
    return path.endsWith('/admin.html') || path.endsWith('/admin');
  } catch (_) {
    return /admin\.html/i.test(href);
  }
}

async function listWindowClients() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
}

async function hasVisibleAdminClient() {
  const list = await listWindowClients();
  return list.some((client) => (
    client.visibilityState === 'visible' && isAdminClient(client)
  ));
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {
      title: 'לחיים אדמין',
      body: 'יש עדכון באדמין',
      url: './admin.html',
    };
    try {
      if (event.data) payload = { ...payload, ...event.data.json() };
    } catch (_) {
      try {
        const text = event.data && event.data.text();
        if (text) payload.body = text;
      } catch (err) {
        console.warn('[admin-sw] push payload parse failed', err);
      }
    }

    if (await hasVisibleAdminClient()) return;

    await self.registration.showNotification(payload.title || 'לחיים אדמין', {
      body: payload.body || '',
      icon: './assets/pwa/admin-icon-192.png',
      badge: './assets/pwa/admin-icon-192.png',
      lang: 'he',
      dir: 'rtl',
      tag: payload.tag || 'lechaim-admin',
      renotify: true,
      data: payload,
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const payload = event.notification.data || {};
  const target = payload.url
    ? new URL(payload.url, self.registration.scope).href
    : new URL('admin.html', self.registration.scope).href;

  event.waitUntil((async () => {
    const list = await listWindowClients();
    const adminClients = list.filter(isAdminClient);
    const visible = adminClients.find((client) => client.visibilityState === 'visible');
    const focusClient = visible || adminClients[0] || null;
    if (focusClient) {
      if (typeof focusClient.focus === 'function') await focusClient.focus();
      if (typeof focusClient.postMessage === 'function') {
        focusClient.postMessage({ type: 'admin-push-open', payload });
      }
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

