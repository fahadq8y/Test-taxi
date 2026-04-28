// White Horse Taxi - Service Worker
// Cache-first strategy للملفات الثابتة، Network-first للـ Firestore
const CACHE_NAME = 'white-horse-v1';
const APP_SHELL = [
  '/',
  '/tracking.html',
  '/tracking-management.html',
  '/driver-details.html',
  '/manifest.webmanifest',
  // External CDN resources (fonts, leaflet, tailwind)
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js',
  'https://unpkg.com/lucide@latest'
];

// install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // cache.addAll fails if any single resource fails → use individual addAll with catch
      return Promise.allSettled(
        APP_SHELL.map(url => cache.add(url).catch(err => console.warn('SW cache fail:', url, err)))
      );
    }).then(() => self.skipWaiting())
  );
});

// activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// fetch handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Firestore + Firebase requests: network-first (دائماً تحديث)
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  
  // Tile servers (OSM, etc): cache-first مع time limit
  if (url.hostname.includes('tile.openstreetmap.org') ||
      url.hostname.includes('arcgisonline.com') ||
      url.hostname.includes('cartocdn.com')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          // cache فقط الناجحة
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME + '-tiles').then(c => c.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }
  
  // App shell: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // background revalidation
        fetch(event.request).then((fresh) => {
          if (fresh && fresh.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, fresh.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then((res) => {
        if (res && res.status === 200 && event.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => {
        // offline fallback لـ html
        if (event.request.mode === 'navigate') {
          return caches.match('/tracking.html');
        }
      });
    })
  );
});

// رسالة من الصفحة لتحديث SW يدوياً
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
