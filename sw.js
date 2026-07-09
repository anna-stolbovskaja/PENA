// Service Worker — PEÑA offline cache + push notifications
// Caches app shell for offline use, network-first for CDN resources

const CACHE_NAME = 'pena-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/lib/ledger.js',
  '/lib/p2p.js',
  '/lib/wdk.js',
  '/lib/qvac.js',
  '/lib/icons.js',
  '/lib/ui.js',
  '/manifest.json',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(err => console.error('SW install error:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for CDN resources (Tailwind, ethers, Tesseract)
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'esm.sh') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for app shell
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          const fetchPromise = fetch(event.request)
            .then(response => {
              if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
              }
              return response;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        })
    );
  }
});

// ═══════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'PEÑA';
  const options = {
    body: data.body || 'New treasury activity',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'pena-notification',
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            return;
          }
        }
        return clients.openWindow(event.notification.data.url || '/');
      })
  );
});

// Listen for messages from main thread to trigger local notifications
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(event.data.title || 'PEÑA', {
      body: event.data.body || '',
      icon: '/icon.svg',
      tag: event.data.tag || 'pena-local',
    });
  }
});
