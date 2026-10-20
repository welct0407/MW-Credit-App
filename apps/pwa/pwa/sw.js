/* Only public offline assets belong in this cache. Never cache API, authentication, receipt or account responses. */
const VERSION = '__BUILD_VERSION__';
const PREFIX = 'mw-credit-dev-public-';
const CACHE = PREFIX + VERSION;
const ACTIVATED = '/__activated'; // Activation order marker inside each public cache; never served.
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
// Retained public builds: this one, the newest previous one, and any older build an
// open tab reported still running (matches). Caches outside PREFIX are never selected.
function retainedCaches(names,current,previous,matches){return names.filter(name=>name.startsWith(PREFIX)&&(name===current||name===previous||matches.includes(name)))}
// An open page reports its running entry; silence (older build, frozen, uncontrolled) within 1.5 s counts as none.
function clientEntry(client){return new Promise(resolve=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();resolve(null)},1500);channel.port1.onmessage=message=>{clearTimeout(timer);channel.port1.close();const entry=message.data?.entry;resolve(typeof entry==='string'&&/^\/assets\/[^/]+\.js$/.test(entry)?entry:null)};try{client.postMessage({type:'GET_CLIENT_ENTRY',v:1},[channel.port2])}catch{clearTimeout(timer);channel.port1.close();resolve(null)}})}
// Activation marks this build and claims open tabs first. A navigation waits until the worker has finished
// activating and iOS deletes caches slowly, so pruning runs after activation, outside the activate waitUntil.
// Startup version messages and fetches extend the worker's lifetime with the pending prune (never delaying their
// responses); an interrupted prune finishes at the next activation. Installed apps update while open (ACTIVATE_UPDATE),
// so pruning cannot wait for zero clients; it never deletes the build an open tab still runs, nor private drafts.
let pruning=null;
function activateBuild(){
  const claimed=(async()=>{let names=[],previous;
    try{
      // Previous is the build that last activated (highest marker); a build superseded while waiting never carries one.
      names=(await caches.keys()).filter(name=>name.startsWith(PREFIX));const activated=[];
      for(const name of names)if(name!==CACHE){const order=Number(await(await caches.match(ACTIVATED,{cacheName:name}))?.text());if(order>0)activated.push([order,name])}
      activated.sort((a,b)=>a[0]-b[0]);previous=activated.at(-1)?.[1];
      await(await caches.open(CACHE)).put(ACTIVATED,new Response(String((activated.at(-1)?.[0]??0)+1)));
    }catch{/* Unmarked, this build is not "previous" next time; open tabs still protect it. */}
    await self.clients.claim();return {names,previous}})();
  const pruned=claimed.then(({names,previous})=>prune(names,previous)).catch(()=>{/* Best effort; the next activation retries. */}).finally(()=>{if(pruning===pruned)pruning=null});
  pruning=pruned;return {claimed,pruned};
}
async function prune(names,previous){
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  // No marker yet (first activation of this rule): keep the former behaviour, pruning only with no open tab.
  if(!previous&&clients.length)return;
  const kept=previous??names.filter(name=>name!==CACHE).at(-1),entries=(await Promise.all(clients.map(clientEntry))).filter(Boolean),matches=[];
  if(entries.length)for(const name of names)if(name!==CACHE&&name!==kept)for(const entry of entries)if(await caches.match(entry,{cacheName:name})){matches.push(name);break}
  const keep=retainedCaches(names,CACHE,kept,matches);
  // One at a time, so the reloaded page's cache reads are not queued behind a whole batch of deletes.
  for(const name of names)if(!keep.includes(name))await caches.delete(name);
}
self.addEventListener('activate', event => {event.waitUntil(activateBuild().claimed)});
self.addEventListener('message', event => {
  if(pruning&&event.data?.type==='GET_BUILD_VERSION')event.waitUntil(pruning);
  if(event.data?.type==='GET_BUILD_VERSION')event.ports?.[0]?.postMessage({version:VERSION});
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  if(pruning)event.waitUntil(pruning); // Lifetime only; responses below never wait for it.
  const request = event.request;
  const url = new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.search||request.headers.has('Authorization'))return;
  if(APP_ASSETS.includes(url.pathname)&&url.pathname!=='/'){event.respondWith((async()=>{const cached=await caches.match(url.pathname,{cacheName:CACHE});return cached||fetch(request)})());return;}
  // A still-open previous build may request an old hashed asset after activation.
  // Only exact keys already verified during a retained worker install are eligible.
  if(/^\/assets\/[^/]+\.(js|css|png)$/.test(url.pathname)){
    event.respondWith((async()=>{for(const name of [CACHE,...(await caches.keys()).filter(name=>name.startsWith(PREFIX)&&name!==CACHE)]){const cached=await caches.match(url.pathname,{cacheName:name});if(cached)return cached}return fetch(request)})());return;
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

// R079: a v2 push carries the event's own title and body (activity, amount, borrower; owner-accepted on the
// lock screen). A v1 push, or text out of bounds, shows the neutral fallback. The tap still resolves the
// opaque event through authenticated same-environment APIs after sign-in.
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{let payload;try{payload=event.data?.json()}catch{return;}
 if((payload?.v!==1&&payload?.v!==2)||typeof payload.eventId!=='string'||!/^[a-f0-9-]{36}$/.test(payload.eventId))return;
 const text=value=>typeof value==='string'&&value.length>=1;
 const own=payload.v===2&&text(payload.title)&&text(payload.body)&&payload.title.length<=60&&payload.body.length<=200;
 await self.registration.showNotification(own?payload.title:'MW Credit',{body:own?payload.body:'New activity · มีรายการใหม่',tag:'mw-credit-'+payload.eventId,data:{eventId:payload.eventId}});
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const id=event.notification.data?.eventId;if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))return;
 const url=new URL('/?notification='+id,self.location.origin).href;
 // APP-OFFLINE-05: an open tab (the focused one first) decides in place, so an open form is never reloaded away.
 // Only a page that does not acknowledge within 1.5 s (older build, frozen or uncontrolled) is navigated as before.
 event.waitUntil((async()=>{const windows=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(c=>new URL(c.url).origin===self.location.origin);const existing=windows.find(c=>c.focused)??windows[0];
  if(!existing){await self.clients.openWindow(url);return;}
  try{await existing.focus()}catch{/* Focus is best effort; routing continues. */}
  const handled=await new Promise(resolve=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();resolve(false)},1500);channel.port1.onmessage=message=>{clearTimeout(timer);channel.port1.close();resolve(message.data?.handled===true)};try{existing.postMessage({type:'NOTIFICATION_OPEN',v:1,eventId:id},[channel.port2])}catch{clearTimeout(timer);channel.port1.close();resolve(false)}});
  if(!handled)await existing.navigate(url);
 })());
});
