/* Only public offline assets belong in this cache. Never cache application or account data. */
const VERSION = '__BUILD_VERSION__';
const PREFIX = 'mw-credit-dev-public-';
const CACHE = PREFIX + VERSION;
const PUBLIC_ASSETS = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const responses = await Promise.all(PUBLIC_ASSETS.map(async path => {
      const response = await fetch(path, {cache: 'no-store', credentials: 'omit', redirect: 'error'});
      const expected = path.endsWith('.png') ? 'image/png' : 'text/html';
      if (!response.ok || !response.headers.get('content-type')?.includes(expected)) throw new Error('Public asset unavailable');
      if (path.endsWith('.png')) {
        const bytes = new Uint8Array(await response.clone().arrayBuffer());
        if (bytes.slice(0, 8).join(',') !== '137,80,78,71,13,10,26,10') throw new Error('Invalid icon');
      } else if (!(await response.clone().text()).includes('Connection required')) throw new Error('Invalid offline document');
      return response;
    }));
    const cache = await caches.open(CACHE);
    await Promise.all(PUBLIC_ASSETS.map((path, index) => cache.put(path, responses[index])));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin || url.pathname !== '/' || url.search || request.headers.has('Authorization')) return;
  event.respondWith(fetch(request).catch(async () => {
    const fallback = await (await caches.open(CACHE)).match('/offline.html');
    if (!fallback) throw new Error('Offline fallback unavailable');
    return fallback;
  }));
});
