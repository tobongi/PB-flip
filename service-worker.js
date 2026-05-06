// Service-worker killswitch.
//
// Earlier builds shipped a sw-precache worker at this URL. The plugin is now
// removed, but any browser that fetched the old worker still has it
// installed, and the precache strategy keeps serving stale assets across
// deploys. Browsers revalidate the SW URL on every navigation; when they
// fetch this file they install it as the new worker, which then unregisters
// itself, deletes every cache it can see, and force-reloads open clients so
// they pick up fresh content from the network.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch (_) {
        // ignore — we still want to unregister
      }
      try {
        await self.registration.unregister();
      } catch (_) {
        // ignore
      }
      try {
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => {
          if (client && client.navigate) {
            client.navigate(client.url);
          }
        });
      } catch (_) {
        // ignore
      }
    })()
  );
});

// Fetch handler that just hits the network — keeps the killswitch transparent
// while it's still active for any in-flight request.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
