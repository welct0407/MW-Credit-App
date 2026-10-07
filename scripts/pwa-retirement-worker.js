// Recovery-only worker served at /sw.js alongside a pre-worker rollback artifact.
// No fetch handler: every request uses the network; Firebase persistence is untouched.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith('mw-credit-dev-public-')).map(name => caches.delete(name)));
  await self.registration.unregister();
})()));
