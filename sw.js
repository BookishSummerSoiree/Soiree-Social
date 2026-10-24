// ── SOIREE SOCIAL SERVICE WORKER ─────────────────────────────────────────
// Version bump this string any time you update the app — it forces a cache refresh
const CACHE_NAME = 'soiree-social-v22';

// Files to cache for offline use
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './logo.png',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Jost:wght@300;400;500&display=swap',
];

// ── INSTALL: cache core files ─────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        // Font CDN may fail in some environments — that's OK
        console.warn('SW precache partial failure (fonts may be skipped):', err);
        return cache.addAll(['./index.html', './manifest.json']);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean up old caches ────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: serve from cache, fall back to network ─────────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses for our own files
        if (response && response.status === 200 && response.type !== 'opaque') {
          const url = event.request.url;
          if (url.includes(self.location.origin) || url.includes('fonts.googleapis') || url.includes('fonts.gstatic')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
        }
        return response;
      }).catch(() => {
        // If both cache and network fail, return the cached app shell
        return caches.match('./index.html');
      });
    })
  );
});

// ── PUSH NOTIFICATIONS: 8am weekday check-in ─────────────────────────────
// Receives scheduled alarm messages from the main app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_CHECKIN') {
    // Store the next scheduled time
    const { nextAlarm } = event.data;
    self.nextAlarm = nextAlarm;
  }
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body } = event.data;
    self.registration.showNotification(title, {
      body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'soiree-social-checkin',
      requireInteraction: false,
      data: { url: self.registration.scope }
    });
  }
});

// ── NOTIFICATION CLICK: open/focus the app ───────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // If app is already open, focus it
      for (const client of windowClients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'OPEN_CHECKIN' });
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(self.registration.scope).then(client => {
          if (client) {
            setTimeout(() => client.postMessage({ type: 'OPEN_CHECKIN' }), 1500);
          }
        });
      }
    })
  );
});
