// Service Worker for Driver GPS Tracking
const CACHE_NAME = 'driver-gps-v1';
const urlsToCache = [
  '/driver-tracking-test.html',
  '/driver-manifest.json'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// Background Sync - for sending location when offline
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);
  
  if (event.tag === 'sync-location') {
    event.waitUntil(syncLocationData());
  }
});

// Function to sync location data
async function syncLocationData() {
  try {
    // Get pending location data from IndexedDB or localStorage
    const pendingData = await getPendingLocationData();
    
    if (pendingData && pendingData.length > 0) {
      console.log('[Service Worker] Syncing', pendingData.length, 'location updates');
      
      // Send each pending location update
      for (const data of pendingData) {
        await sendLocationToFirebase(data);
      }
      
      // Clear pending data after successful sync
      await clearPendingLocationData();
      console.log('[Service Worker] Sync completed successfully');
    }
  } catch (error) {
    console.error('[Service Worker] Sync failed:', error);
    throw error; // Retry sync
  }
}

// Helper function to get pending location data
async function getPendingLocationData() {
  // This would read from IndexedDB in a real implementation
  // For now, return empty array
  return [];
}

// Helper function to send location to Firebase
async function sendLocationToFirebase(data) {
  // This would send to Firebase in a real implementation
  console.log('[Service Worker] Sending location:', data);
  return Promise.resolve();
}

// Helper function to clear pending data
async function clearPendingLocationData() {
  // This would clear IndexedDB in a real implementation
  return Promise.resolve();
}

// Periodic Background Sync (experimental)
self.addEventListener('periodicsync', (event) => {
  console.log('[Service Worker] Periodic sync:', event.tag);
  
  if (event.tag === 'update-location') {
    event.waitUntil(updateLocationInBackground());
  }
});

// Function to update location in background
async function updateLocationInBackground() {
  try {
    console.log('[Service Worker] Updating location in background');
    
    // Get current position
    // Note: Geolocation API is not available in Service Worker
    // This is a limitation - we can only sync previously captured data
    
    // Notify all clients to update location
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'UPDATE_LOCATION',
        timestamp: Date.now()
      });
    });
    
  } catch (error) {
    console.error('[Service Worker] Background update failed:', error);
  }
}

// Message handler - receive messages from main app
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CACHE_LOCATION') {
    // Cache location data for later sync
    cacheLocationData(event.data.location);
  }
});

// Function to cache location data
function cacheLocationData(location) {
  // This would save to IndexedDB in a real implementation
  console.log('[Service Worker] Caching location:', location);
}

// Push notification handler (for future use)
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);
  
  const options = {
    body: event.data ? event.data.text() : 'تحديث جديد',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    dir: 'rtl',
    lang: 'ar'
  };
  
  event.waitUntil(
    self.registration.showNotification('تتبع السائق', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked');
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('/driver-tracking-test.html')
  );
});

console.log('[Service Worker] Loaded successfully');

