/* Only public offline assets belong in this cache. Never cache API, authentication, receipt or account responses. */
const VERSION = '__BUILD_VERSION__';
const PREFIX = 'mw-credit-dev-public-';
const CACHE = PREFIX + VERSION;
const APP_ASSETS = /*APP_ASSETS*/[];
const PUBLIC_ASSETS = [...APP_ASSETS, '/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const responses = await Promise.all(PUBLIC_ASSETS.map(async path => {
      const response = await fetch(path, {cache: 'no-store', credentials: 'omit', redirect: 'error'});
      const expected = path.endsWith('.png') ? 'image/png' : path.endsWith('.js') ? 'javascript' : path.endsWith('.css') ? 'text/css' : 'text/html';
      if (!response.ok || !response.headers.get('content-type')?.includes(expected)) throw new Error('Public asset unavailable');
      // Drain each response before awaiting the whole batch. Holding unread app
      // bodies can exhaust browser connection slots and stall the remaining assets.
      const body=await response.arrayBuffer();
      if (path.endsWith('.png')) {
        const bytes = new Uint8Array(body);
        if (bytes.slice(0, 8).join(',') !== '137,80,78,71,13,10,26,10') throw new Error('Invalid icon');
      } else if (path==='/offline.html' && !new TextDecoder().decode(body).includes('Connection required')) throw new Error('Invalid offline document');
      return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
    }));
    const cache = await caches.open(CACHE);
    await Promise.all(PUBLIC_ASSETS.map((path, index) => cache.put(path, responses[index])));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    // Existing tabs may still use any retained public build. Unknown clients are
    // treated conservatively; activation never deletes their assets or private drafts.
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    if(clients.length===0){const previous=names.filter(name=>name.startsWith(PREFIX)&&name!==CACHE).at(-1);await Promise.all(names.filter(name=>name.startsWith(PREFIX)&&name!==CACHE&&name!==previous).map(name=>caches.delete(name)))}
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if(event.data?.type==='GET_BUILD_VERSION')event.ports?.[0]?.postMessage({version:VERSION});
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.search||request.headers.has('Authorization'))return;
  if(APP_ASSETS.includes(url.pathname)&&url.pathname!=='/'){event.respondWith((async()=>{const cached=await(await caches.open(CACHE)).match(url.pathname);return cached||fetch(request)})());return;}
  // A still-open previous build may request an old hashed asset after activation.
  // Only exact keys already verified during a retained worker install are eligible.
  if(/^\/assets\/[^/]+\.(js|css|png)$/.test(url.pathname)){
    event.respondWith((async()=>{for(const name of (await caches.keys()).filter(name=>name.startsWith(PREFIX))){const cached=await(await caches.open(name)).match(url.pathname);if(cached)return cached}return fetch(request)})());return;
  }
  if(request.mode!=='navigate'||url.pathname!=='/')return;
  // The installed worker pins a complete public shell. Version checks run in
  // usePwa without delaying navigation; a waiting build still requires explicit activation.
  event.respondWith((async () => {
    const cache=await caches.open(CACHE);
    const shell=await cache.match('/');
    if(shell)return shell;
    try{return await fetch(request)}catch(error){
      const fallback=await cache.match('/offline.html');
      if(!fallback)throw error;
      return fallback;
    }
  })());
});

// Generic lock-screen contents only. The application resolves the opaque event
// through authenticated same-environment APIs after sign-in.
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{let payload;try{payload=event.data?.json()}catch{return;}
 if(payload?.v!==1||typeof payload.eventId!=='string'||!/^[a-f0-9-]{36}$/.test(payload.eventId))return;
 await self.registration.showNotification('MW Credit',{body:'An update is available.',tag:'mw-credit-'+payload.eventId,data:{eventId:payload.eventId}});
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const id=event.notification.data?.eventId;if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))return;
 const url=new URL('/?notification='+id,self.location.origin).href;
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(c=>new URL(c.url).origin===self.location.origin);if(existing){await existing.navigate(url);await existing.focus()}else await self.clients.openWindow(url)})());
});
