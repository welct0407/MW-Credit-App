import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
// R146: the group chat summary's per-device seen state (pure module, transpiled as the PWA build does): the list mark
// rule, the guarded storage reads and writes, and the event that clears a mark without a reload.
const source=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/chat-seen.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {CHAT_SEEN_EVENT,CHAT_MARK_WINDOW_MS,readChatSeen,markChatSeen,chatMarkShown,sessionChatSeen,graphemes,splitNameForMark}=await import('data:text/javascript,'+encodeURIComponent(source));
const now=Date.parse('2026-11-12T08:00:00Z'),at='2026-11-12T07:05:00.000Z';
function install({blocked=false}={}){
 const store=new Map(),events=[];
 globalThis.localStorage=blocked?{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}}:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>{store.set(key,String(value))}};
 globalThis.window={dispatchEvent:event=>{events.push(event.type);return true}};
 return {store,events};
}
test('the mark shows for a summary within 72 hours that this device has not shown; never without readable storage',()=>{
 assert.equal(CHAT_MARK_WINDOW_MS,72*3600*1000);
 assert.equal(chatMarkShown({},'A',at,now),true);
 assert.equal(chatMarkShown({A:at},'A',at,now),false,'already shown');
 assert.equal(chatMarkShown({A:'2026-11-11T07:05:00.000Z'},'A',at,now),true,'a newer summary relights it');
 assert.equal(chatMarkShown({B:at},'A',at,now),true,'another borrower');
 assert.equal(chatMarkShown({},'A','2026-11-09T08:00:00.000Z',now),true,'exactly 72 hours');
 assert.equal(chatMarkShown({},'A','2026-11-09T07:59:59.000Z',now),false,'older than 72 hours: stale, no mark');
 for(const value of [null,undefined,'','not a time',123])assert.equal(chatMarkShown({},'A',value,now),false,String(value));
 assert.equal(chatMarkShown(null,'A',at,now),false,'storage unreadable: no marks');
});
test('seen is stored per scope under mw-credit.chat-seen:<scope>, announced once, and pruned of old entries',()=>{
 const {store,events}=install();
 assert.deepEqual(readChatSeen('scope-1'),{});
 markChatSeen('scope-1','A',at,now);
 assert.deepEqual(JSON.parse(store.get('mw-credit.chat-seen:scope-1')),{A:at});assert.deepEqual(events,[CHAT_SEEN_EVENT]);
 markChatSeen('scope-1','A',at,now);assert.equal(events.length,1,'the same version again writes and announces nothing');
 markChatSeen('scope-1','B','2026-11-12T06:00:00.000Z',now);markChatSeen('scope-2','A','2026-11-10T00:00:00.000Z',now);
 assert.deepEqual(readChatSeen('scope-1'),{A:at,B:'2026-11-12T06:00:00.000Z'});assert.deepEqual(readChatSeen('scope-2'),{A:'2026-11-10T00:00:00.000Z'});
 store.set('mw-credit.chat-seen:scope-1',JSON.stringify({OLD:'2026-09-01T00:00:00.000Z',BAD:'x',A:at}));
 markChatSeen('scope-1','C',at,now);assert.deepEqual(readChatSeen('scope-1'),{A:at,C:at});
});
test('blocked or damaged storage: reads answer null, writes never throw; the page remembers what it showed (R149) and tells the list once',()=>{
 const blocked=install({blocked:true});
 assert.equal(readChatSeen('scope'),null);assert.doesNotThrow(()=>markChatSeen('scope','A',at,now));
 // R149: nothing can be stored, but this page showed it: the list is told once so a server-driven mark clears at once.
 assert.deepEqual(blocked.events,[CHAT_SEEN_EVENT]);assert.deepEqual(sessionChatSeen('scope'),{A:at});markChatSeen('scope','A',at,now);assert.equal(blocked.events.length,1);
 const damaged=install();
 for(const raw of ['not json','[]','"text"','null','7']){damaged.store.set('mw-credit.chat-seen:scope',raw);assert.equal(readChatSeen('scope'),null,raw);markChatSeen('scope','A',at,now);assert.equal(damaged.store.get('mw-credit.chat-seen:scope'),raw,'left as it is')}
 damaged.store.set('mw-credit.chat-seen:scope',JSON.stringify({A:at,B:5,C:null}));assert.deepEqual(readChatSeen('scope'),{A:at});
 delete globalThis.localStorage;assert.equal(readChatSeen('scope'),null,'no storage at all');assert.doesNotThrow(()=>markChatSeen('scope','A',at,now));
});
test('storage that reads but refuses writes: after the card renders there are no marks for the session, and the list is told',async()=>{
 // A fresh module instance: the unwritable flag is per page load.
 const fresh=await import('data:text/javascript,'+encodeURIComponent(source+'\n//refused-writes'));
 const store=new Map([['mw-credit.chat-seen:scope',JSON.stringify({B:at})]]),events=[];
 globalThis.localStorage={getItem:key=>store.has(key)?store.get(key):null,setItem(){throw new Error('QuotaExceededError')}};
 globalThis.window={dispatchEvent:event=>{events.push(event.type);return true}};
 assert.equal(fresh.chatMarkShown(fresh.readChatSeen('scope'),'A',at,now),true,'readable: the mark shows before the card renders');
 assert.doesNotThrow(()=>fresh.markChatSeen('scope','A',at,now));
 assert.deepEqual(events,[fresh.CHAT_SEEN_EVENT],'the list is told even though nothing was stored');
 assert.equal(fresh.readChatSeen('scope'),null);assert.equal(fresh.chatMarkShown(fresh.readChatSeen('scope'),'A',at,now),false,'no mark after the render');
 assert.equal(fresh.chatMarkShown(fresh.readChatSeen('scope'),'C',at,now),false,'and none that could never be cleared');
 assert.deepEqual(fresh.readChatSeen('other-scope'),{},'another scope is unaffected');
 assert.equal(store.get('mw-credit.chat-seen:scope'),JSON.stringify({B:at}),'the stored value is left as it was');
 fresh.markChatSeen('scope','A',at,now);assert.equal(events.length,1,'the same version again: nothing more to announce');
 // R149: another card shown on this page is remembered for the session (the list is told), though nothing can be stored.
 fresh.markChatSeen('scope','C',at,now);assert.equal(events.length,2);assert.deepEqual(fresh.sessionChatSeen('scope'),{A:at,C:at});assert.equal(store.get('mw-credit.chat-seen:scope'),JSON.stringify({B:at}));
});
// R149: the user's own value from the server (the list item's chatSeenAt, V147) joins the rule; times are compared.
test('R149 the mark needs a summary newer than the server value, this page and this device; equal instants in another notation count as seen',()=>{
 const older='2026-11-12T06:00:00.000Z',newer='2026-11-12T07:30:00.000Z';
 // Server value: seen on another device (this device's storage is empty).
 assert.equal(chatMarkShown({},'A',at,now,at),false,'the server has this version');
 assert.equal(chatMarkShown({},'A',at,now,newer),false,'the server is ahead');
 assert.equal(chatMarkShown({},'A',at,now,older),true,'a newer summary relights it');
 assert.equal(chatMarkShown({},'A',at,now,null),true,'the server knows the user has not seen it');
 assert.equal(chatMarkShown({},'A',at,now,undefined),true,'no server field: the device decides, as in R146');
 assert.equal(chatMarkShown({},'A',at,now,'2026-11-12T14:05:00+07:00'),false,'the same instant in another notation');
 assert.equal(chatMarkShown({},'A',at,now,'2026-11-12T07:05:00Z'),false,'the same instant without milliseconds');
 assert.equal(chatMarkShown({},'A',at,now,'not a time'),true,'an unreadable server value is no evidence');
 // This device: also by time (R146 compared texts), so a value written in another notation or ahead still counts.
 assert.equal(chatMarkShown({A:'2026-11-12T07:05:00Z'},'A',at,now,null),false);assert.equal(chatMarkShown({A:newer},'A',at,now,null),false);
 assert.equal(chatMarkShown({A:older},'A',at,now,older),true,'both behind');assert.equal(chatMarkShown({A:older},'A',at,now,at),false);assert.equal(chatMarkShown({A:at},'A',at,now,older),false);
 // This page (session memory).
 assert.equal(chatMarkShown({},'A',at,now,null,{A:at}),false);assert.equal(chatMarkShown({},'A',at,now,null,{A:older}),true);assert.equal(chatMarkShown({},'A',at,now,null,{B:at}),true);
 // Storage unreadable: the server and the page decide; without a server field there are no marks (never permanent ones).
 assert.equal(chatMarkShown(null,'A',at,now,null),true);assert.equal(chatMarkShown(null,'A',at,now,older),true);assert.equal(chatMarkShown(null,'A',at,now,at),false);
 assert.equal(chatMarkShown(null,'A',at,now,null,{A:at}),false,'shown on this page');assert.equal(chatMarkShown(null,'A',at,now,undefined),false);assert.equal(chatMarkShown(null,'A',at,now,undefined,{}),false);
 // The window and the summary checks come first, whatever the server says.
 assert.equal(chatMarkShown({},'A','2026-11-09T07:59:59.000Z',now,null),false);assert.equal(chatMarkShown({},'A',null,now,null),false);
});
test('R149 the device value only moves forward: an older version rendered later changes nothing',()=>{
 const {store,events}=install();
 markChatSeen('forward','A',at,now);markChatSeen('forward','A','2026-11-12T06:00:00.000Z',now);markChatSeen('forward','A','2026-11-12T07:05:00Z',now);
 assert.deepEqual(JSON.parse(store.get('mw-credit.chat-seen:forward')),{A:at});assert.equal(events.length,1);assert.deepEqual(sessionChatSeen('forward'),{A:at});
 markChatSeen('forward','A','2026-11-12T07:30:00.000Z',now);assert.deepEqual(readChatSeen('forward'),{A:'2026-11-12T07:30:00.000Z'});assert.equal(events.length,2);
 const copy=sessionChatSeen('forward');copy.A='changed';assert.deepEqual(sessionChatSeen('forward'),{A:'2026-11-12T07:30:00.000Z'},'a copy');assert.deepEqual(sessionChatSeen('never'),{});
});

// R149: chat-seen-sync.ts sends what the device showed (POST /api/collection/{id}/chat-seen). Stub fetch; invented ids.
const syncSource=ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/chat-seen-sync.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
let syncInstance=0;
const loadSync=()=>import('data:text/javascript,'+encodeURIComponent(syncSource+'\n//instance-'+(++syncInstance)));
const UNSENT='mw-credit.chat-seen-unsent:';
function server(answers=[]){
 const calls=[];let tokens=0;
 const fetcher=async(url,init)=>{calls.push({url,method:init.method,headers:init.headers,body:init.body,cache:init.cache,credentials:init.credentials,redirect:init.redirect});const answer=answers.length?answers.shift():200;if(answer==='network')throw new TypeError('Failed to fetch');return {status:answer}};
 return {calls,fetcher,access:{origin:'https://command.example.invalid',token:async()=>'token-'+(++tokens)}};
}
function online(value=true){Object.defineProperty(globalThis,'navigator',{value:{onLine:value},configurable:true,writable:true})}
function storage({blocked=false}={}){
 const store=new Map();
 globalThis.localStorage=blocked?{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}}:{getItem:key=>store.has(key)?store.get(key):null,setItem:(key,value)=>{store.set(key,String(value))},removeItem:key=>{store.delete(key)}};
 return store;
}
test('R149 one POST per newly shown version: exact request, nothing when the server already has it, nothing twice',async()=>{
 const sync=await loadSync(),store=storage(),s=server();online();
 await sync.syncChatSeen('scope',s.access,'B one/2',at,null,s.fetcher);
 assert.deepEqual(s.calls,[{url:'https://command.example.invalid/api/collection/B%20one%2F2/chat-seen',method:'POST',headers:{Authorization:'Bearer token-1','Content-Type':'application/json'},
  body:'{"lastMessageAt":"2026-11-12T07:05:00.000Z"}',cache:'no-store',credentials:'omit',redirect:'error'}]);
 assert.equal(store.has(UNSENT+'scope'),false,'nothing left waiting');
 await sync.syncChatSeen('scope',s.access,'B one/2',at,null,s.fetcher);await sync.syncChatSeen('scope',s.access,'B one/2','2026-11-12T06:00:00.000Z',null,s.fetcher);
 assert.equal(s.calls.length,1,'the same or an older version is not sent again');
 await sync.syncChatSeen('scope',s.access,'B one/2','2026-11-12T07:30:00.000Z',at,s.fetcher);assert.equal(s.calls.length,2,'a newer version is');
 // The server's own value already covers the version (another device showed it): no request.
 for(const known of [at,'2026-11-12T07:30:00.000Z','2026-11-12T14:05:00+07:00'])await sync.syncChatSeen('scope',s.access,'C',at,known,s.fetcher);
 assert.equal(s.calls.length,2);
 await sync.syncChatSeen('scope',s.access,'C',at,'2026-11-12T06:00:00.000Z',s.fetcher);assert.equal(s.calls.length,3,'behind: sent');
 // The body is always ISO UTC with milliseconds, whatever notation the summary carried; an unreadable time is never sent.
 await sync.syncChatSeen('scope',s.access,'D','2026-11-12T07:05:00Z',undefined,s.fetcher);assert.equal(s.calls[3].body,'{"lastMessageAt":"2026-11-12T07:05:00.000Z"}');
 await sync.syncChatSeen('scope',s.access,'E','not a time',null,s.fetcher);await sync.syncChatSeen('scope',s.access,'',at,null,s.fetcher);assert.equal(s.calls.length,4);
 // Another scope (another signed-in user) has its own queue and its own answers.
 await sync.syncChatSeen('other',s.access,'B one/2',at,null,s.fetcher);assert.equal(s.calls.length,5);
});
test('R149 a refusal for good (every 4xx except 401, 408, 409, 429) is dropped; a network error, 401, 408, 409, 429 or 5xx keeps the value and stops the pass',async()=>{
 for(const status of [400,403,404,405,410,413,415,422,499]){
  const sync=await loadSync(),store=storage(),s=server([status]);online();
  await sync.syncChatSeen('scope',s.access,'A',at,null,s.fetcher);
  assert.equal(s.calls.length,1,String(status));assert.equal(store.has(UNSENT+'scope'),false,status+' is dropped');assert.deepEqual(sync.readUnsentChatSeen('scope'),{});
  await sync.syncChatSeen('scope',s.access,'A',at,null,s.fetcher);assert.equal(s.calls.length,1,status+': not asked again for the same version');
 }
 for(const failure of ['network',500,502,503,599,401,408,409,429,302,0]){
  const sync=await loadSync(),store=storage(),s=server([failure]);online();
  assert.equal(sync.queueChatSeen('scope','A',at,null),true);assert.equal(sync.queueChatSeen('scope','B','2026-11-12T06:00:00.000Z',null),true);
  await sync.flushChatSeen('scope',s.access,s.fetcher);
  assert.equal(s.calls.length,1,failure+': the pass stops at the first failure');
  assert.deepEqual(JSON.parse(store.get(UNSENT+'scope')),{A:at,B:'2026-11-12T06:00:00.000Z'},failure+' keeps both');
  await sync.flushChatSeen('scope',s.access,s.fetcher);
  assert.equal(s.calls.length,3,'the next pass sends both');assert.equal(store.has(UNSENT+'scope'),false);
  assert.deepEqual(s.calls.slice(1).map(call=>call.url.split('/').at(-2)),['A','B']);
 }
});
test('R149 offline: queued without a request, sent once when a later pass runs online; the queue is forward only and bounded',async()=>{
 const sync=await loadSync(),store=storage(),s=server();online(false);
 await sync.syncChatSeen('scope',s.access,'A',at,null,s.fetcher);await sync.syncChatSeen('scope',s.access,'A',at,null,s.fetcher);
 assert.equal(s.calls.length,0);assert.deepEqual(JSON.parse(store.get(UNSENT+'scope')),{A:at});
 assert.equal(sync.queueChatSeen('scope','A','2026-11-12T06:00:00.000Z',null),false,'an older version does not replace the waiting one');
 assert.equal(sync.queueChatSeen('scope','A','2026-11-12T07:30:00.000Z',null),true);assert.deepEqual(sync.readUnsentChatSeen('scope'),{A:'2026-11-12T07:30:00.000Z'});
 online(true);await sync.flushChatSeen('scope',s.access,s.fetcher);await sync.flushChatSeen('scope',s.access,s.fetcher);
 assert.equal(s.calls.length,1,'one request for the newest waiting version');assert.equal(s.calls[0].body,'{"lastMessageAt":"2026-11-12T07:30:00.000Z"}');assert.equal(store.has(UNSENT+'scope'),false);
 // Bound: 200 waiting values at most, the oldest dropped first.
 online(false);const base=Date.parse('2026-11-01T00:00:00Z');
 for(let index=0;index<205;index++)sync.queueChatSeen('bound','B'+index,new Date(base+index*60000).toISOString(),null);
 const kept=sync.readUnsentChatSeen('bound');assert.equal(Object.keys(kept).length,200);assert.equal('B0' in kept,false);assert.equal('B4' in kept,false);assert.equal('B5' in kept,true);assert.equal('B204' in kept,true);
 // A damaged stored value is ignored and replaced by the next write.
 store.set(UNSENT+'damaged','not json');assert.deepEqual(sync.readUnsentChatSeen('damaged'),{});store.set(UNSENT+'damaged',JSON.stringify({A:at,B:5,C:'x','':at}));assert.deepEqual(sync.readUnsentChatSeen('damaged'),{A:at});
 online(true);
});
test('R149 blocked storage: the unsent value waits in memory for the session and is still sent',async()=>{
 const sync=await loadSync();storage({blocked:true});const s=server(['network']);online();
 await sync.syncChatSeen('scope',s.access,'A',at,null,s.fetcher);
 assert.equal(s.calls.length,1);assert.deepEqual(sync.readUnsentChatSeen('scope'),{A:at},'kept in memory');
 await sync.flushChatSeen('scope',s.access,s.fetcher);assert.equal(s.calls.length,2);assert.deepEqual(sync.readUnsentChatSeen('scope'),{});
 delete globalThis.localStorage;assert.doesNotThrow(()=>sync.queueChatSeen('scope','B',at,null));assert.deepEqual(sync.readUnsentChatSeen('scope'),{B:at},'no storage at all');
});
// Chase's finding: storage that reads but refuses writes (full, or read-only) cannot forget a sent value.
test('R149 storage that reads but refuses writes: an accepted or refused-for-good value is not sent again on later triggers; a newer version still is',async()=>{
 for(const answer of [200,404]){
  const sync=await loadSync(),s=server([answer]);online();
  const stored=new Map([[UNSENT+'scope',JSON.stringify({A:at})]]);
  globalThis.localStorage={getItem:key=>stored.has(key)?stored.get(key):null,setItem(){throw new Error('QuotaExceededError')},removeItem(){throw new Error('QuotaExceededError')}};
  await sync.flushChatSeen('scope',s.access,s.fetcher);assert.equal(s.calls.length,1,String(answer));
  assert.equal(stored.get(UNSENT+'scope'),JSON.stringify({A:at}),'storage still holds it');
  for(let trigger=0;trigger<3;trigger++)await sync.flushChatSeen('scope',s.access,s.fetcher);
  await sync.syncChatSeen('scope',s.access,'A',at,null,s.fetcher);
  assert.equal(s.calls.length,1,answer+': answered once, never resent in this session');
  // A newer version of the same borrower, and another borrower, are still sent (once each).
  await sync.syncChatSeen('scope',s.access,'A','2026-11-12T07:30:00.000Z',null,s.fetcher);await sync.syncChatSeen('scope',s.access,'B',at,null,s.fetcher);
  await sync.flushChatSeen('scope',s.access,s.fetcher);
  assert.deepEqual(s.calls.slice(1).map(call=>call.url.split('/').at(-2)+' '+JSON.parse(call.body).lastMessageAt),['A 2026-11-12T07:30:00.000Z','B '+at]);
 }
});
test('R149 one pass per scope: a version shown while a request is in flight is sent by the same pass, never in parallel',async()=>{
 const sync=await loadSync(),store=storage();online();
 const calls=[];let release,active=0,peak=0;const gate=new Promise(resolve=>{release=resolve});
 const fetcher=async url=>{calls.push(url.split('/').at(-2));active++;peak=Math.max(peak,active);if(calls.length===1)await gate;active--;return {status:200}};
 const access={origin:'https://command.example.invalid',token:async()=>'token'};
 const first=sync.syncChatSeen('scope',access,'A',at,null,fetcher);
 await new Promise(resolve=>setTimeout(resolve,5));
 const second=sync.syncChatSeen('scope',access,'B',at,null,fetcher);
 assert.deepEqual(calls,['A']);release();await Promise.all([first,second]);
 assert.deepEqual(calls,['A','B']);assert.equal(peak,1);assert.equal(store.has(UNSENT+'scope'),false);
 // A token failure keeps the value (nothing was sent).
 const failing={origin:access.origin,token:async()=>{throw Error('signed out')}};
 await sync.syncChatSeen('scope',failing,'C',at,null,fetcher);assert.deepEqual(calls,['A','B']);assert.deepEqual(sync.readUnsentChatSeen('scope'),{C:at});
});
// UX-CHAT-06: the name is split for the glued mark on grapheme boundaries, with and without Intl.Segmenter.
test('the no-wrap tail of the mark: the last word, or the last 8 graphemes of a long one, never splitting a Thai cluster or an emoji',()=>{
 const base=text=>!/^(?:\p{M}|\u200D|[\uFE00-\uFE0F])/u.test(text)&&!/^[\uDC00-\uDFFF]/.test(text);
 const thai='ผู้กู้ตัวอย่างชื่อยาวมากเป็นพิเศษสุดๆ'; // invented long name without a space
 assert.ok(!base(thai.slice(thai.length-8)),'the UTF-16 cut this replaces starts on a vowel mark');
 for(const [label,segmenter] of [['Intl.Segmenter',undefined],['fallback (no Intl.Segmenter)',null]]){
  const split=name=>segmenter===undefined?splitNameForMark(name):splitNameForMark(name,segmenter);
  const [head,tail]=split(thai);
  assert.equal(head+tail,thai,label+': the name is unchanged');assert.ok(base(tail),label+': the tail starts on a base character: '+tail);assert.ok(tail.length<thai.length);
  assert.equal(graphemes(tail,segmenter===undefined?Intl.Segmenter:segmenter).length,8,label+': eight graphemes');
  assert.deepEqual(split('Somchai K.'),['Somchai ','K.'],label);assert.deepEqual(split('Nok'),['','Nok'],label);
  assert.deepEqual(split('Long synthetic borrower English name for wrapping'),['Long synthetic borrower English name for ','wrapping'],label);
  assert.deepEqual(split('trailing space '),['trailing ','space '],label);
  // Sixteen graphemes stay whole; seventeen are cut to the last eight.
  assert.deepEqual(split('x '+'ก้'.repeat(16)),['x ','ก้'.repeat(16)],label);assert.deepEqual(split('x '+'ก้'.repeat(17)),['x '+'ก้'.repeat(9),'ก้'.repeat(8)],label);
  // Emoji: surrogate pairs, a variation selector and a zero-width-joiner family stay in one piece.
  const emoji='abcdefghijklmnop'+'😀'+'❤️'+'👨‍👩‍👧'+'xyz12';
  const [emojiHead,emojiTail]=split(emoji);assert.equal(emojiHead+emojiTail,emoji,label);assert.equal(emojiTail,'😀❤️👨‍👩‍👧xyz12',label);
  for(const name of [thai,emoji,'x '+'ก้'.repeat(17)]){const [h,t]=split(name);assert.ok(h.isWellFormed()&&t.isWellFormed(),label+': no lone surrogate')}
 }
 assert.deepEqual(graphemes('ผู้',null),['ผู้']);assert.deepEqual(graphemes('a😀b',null),['a','😀','b']);
 // A Segmenter that throws falls back as well.
 assert.deepEqual(graphemes('กี่',class{constructor(){throw Error('unsupported')}}),['กี่']);
});
