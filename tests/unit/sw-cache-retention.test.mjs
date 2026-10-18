import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
// R072: activation prunes old public builds even while tabs are open (installed apps update in place),
// keeping this build, the build that last activated (marker) and any older build an open tab reports running.
// Like CacheStorage, every match returns a fresh Response.
const copy=value=>value instanceof Response?value.clone():value;
const P='mw-credit-dev-public-',worker=readFileSync('apps/pwa/pwa/sw.js','utf8');
function load(stores,clients=[],{version='current',deleteThrows=false,deleteHangs=false}={}){
 const handlers={},log=[],delays=[];
 const caches={keys:async()=>[...stores.keys()],open:async name=>{if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {match:async path=>copy(store.get(path)),put:async(path,value)=>{store.set(path,value)}}},
  match:async(path,{cacheName})=>copy(stores.get(cacheName)?.get(path)),delete:async name=>{if(deleteThrows)throw Error('quota');log.push('delete:'+name);if(deleteHangs)return new Promise(()=>{});return stores.delete(name)}};
 const self={location:{origin:'https://dev.example'},addEventListener:(name,fn)=>handlers[name]=fn,clients:{matchAll:async options=>{log.push('matchAll:'+JSON.stringify(options));return clients},claim:async()=>{log.push('claim')}}};
 const context={self,URL,MessageChannel,Response,caches,console,fetch:async()=>'network',setTimeout:(fn,ms)=>{delays.push(ms);return setTimeout(fn,ms===1500?100:ms)},clearTimeout};
 vm.runInNewContext(worker.replace('__BUILD_VERSION__',version),context);
 return {context,log,delays,handlers,async activate(){const run=context.activateBuild();await run.claimed;await run.pruned},handler(){let work;handlers.activate({waitUntil:p=>work=p});return work},fetch(path){let promise;handlers.fetch({request:{method:'GET',url:'https://dev.example'+path,mode:'cors',headers:{has:()=>false}},respondWith:p=>promise=p});return promise}};
}
const build=(entry,order)=>new Map([['/','shell'],[entry,'chunk:'+entry],...(order?[['/__activated',new Response(String(order))]]:[])]);
const order=async(stores,name)=>Number(await copy(stores.get(name).get('/__activated'))?.text());
const replying=entry=>({posts:[],postMessage(message,ports){this.posts.push(message);ports[0].postMessage({entry})}});
const silent=()=>({posts:[],postMessage(message){this.posts.push(message)}});
test('retainedCaches keeps current and previous, adds reported matches and never selects other caches',()=>{
 const {retainedCaches}=load(new Map()).context,names=['unrelated',P+'a',P+'b',P+'c',P+'current'];
 assert.deepEqual([...retainedCaches(names,P+'current',P+'c',[])],[P+'c',P+'current']);
 assert.deepEqual([...retainedCaches(names,P+'current',P+'c',[P+'a'])],[P+'a',P+'c',P+'current']);
 assert.deepEqual([...retainedCaches(names,P+'current',P+'c',['unrelated'])],[P+'c',P+'current']);
 assert.deepEqual([...retainedCaches([P+'current'],P+'current',undefined,[])],[P+'current']);
});
test('no open clients and no marker: two builds kept by creation order, other caches untouched, current marked, claim first',async()=>{
 const stores=new Map([['unrelated',new Map()],[P+'a',build('/assets/a.js')],[P+'b',build('/assets/b.js')],[P+'current',build('/assets/current.js')]]);const w=load(stores);
 await w.activate();assert.deepEqual([...stores.keys()],['unrelated',P+'b',P+'current']);assert.equal(await order(stores,P+'current'),1);assert.deepEqual(w.log,['claim','matchAll:{"type":"window","includeUncontrolled":true}','delete:'+P+'a']);
});
test('a build superseded while waiting is not "previous": the last activated build an unanswering tab runs is kept',async()=>{
 const stores=new Map([[P+'a',build('/assets/a.js',1)],[P+'b',build('/assets/b.js')],[P+'current',build('/assets/current.js')]]);
 await load(stores,[silent()]).activate();assert.deepEqual([...stores.keys()],[P+'a',P+'current']);assert.equal(await order(stores,P+'current'),2);
});
test('rollback to a retained build keeps the build that activated last, not the newest created',async()=>{
 const stores=new Map([[P+'current',build('/assets/current.js',1)],[P+'b',build('/assets/b.js',3)],[P+'c',build('/assets/c.js',2)]]);
 await load(stores).activate();assert.deepEqual([...stores.keys()],[P+'current',P+'b']);assert.equal(await order(stores,P+'current'),4);
});
test('first rollout (no marker) with an open tab keeps every build; the next activation prunes to two',async()=>{
 const stores=new Map(Array.from({length:35},(_,i)=>[P+'old'+i,build('/assets/old'+i+'.js')]));stores.set(P+'current',build('/assets/current.js'));stores.set('unrelated',new Map());
 const first=load(stores,[silent()]);await first.activate();assert.equal(stores.size,37);assert.equal(await order(stores,P+'current'),1);assert.equal(first.log[0],'claim');
 stores.set(P+'next',build('/assets/next.js'));await load(stores,[silent()],{version:'next'}).activate();assert.deepEqual([...stores.keys()],[P+'current','unrelated',P+'next']);assert.equal(await order(stores,P+'next'),2);
});
test('a replying client on an old build keeps its cache; a silent client keeps nothing extra; claim before deletes',async()=>{
 const stores=new Map([[P+'a',build('/assets/a.js',1)],[P+'b',build('/assets/b.js')],[P+'c',build('/assets/c.js',2)],[P+'d',build('/assets/d.js',3)],[P+'current',build('/assets/current.js')],['unrelated',new Map([['/assets/a.js','x']])]]);
 const old=replying('/assets/b.js'),frozen=silent(),w=load(stores,[old,frozen]);await w.activate();
 assert.deepEqual([...stores.keys()],[P+'b',P+'d',P+'current','unrelated']);assert.equal(JSON.stringify([...old.posts,...frozen.posts]),JSON.stringify([{type:"GET_CLIENT_ENTRY",v:1},{type:"GET_CLIENT_ENTRY",v:1}]));
 assert.deepEqual([...w.delays],[1500,1500]);assert.deepEqual(w.log.filter(x=>x.startsWith('delete:')).sort(),['delete:'+P+'a','delete:'+P+'c']);assert.equal(w.log[0],'claim');
});
test('bogus, missing or unmatched entries keep only two builds; a throwing client is treated as silent',async()=>{
 for(const entry of ['/evil.js','/assets/../a.js','/assets/x/a.js','https://dev.example/assets/a.js',null,7,'/assets/unknown.js']){
  const stores=new Map([[P+'a',new Map([['/assets/a.js','x'],['/evil.js','x'],['/assets/../a.js','x'],['/assets/x/a.js','x']])],[P+'b',build('/assets/b.js',1)],[P+'current',build('/assets/current.js')]]);
  await load(stores,[replying(entry),{postMessage(){throw Error('detached')}}]).activate();assert.deepEqual([...stores.keys()],[P+'b',P+'current'],String(entry));
 }
});
test('a failing delete still claims clients and settles the prune',async()=>{
 const stores=new Map([[P+'a',build('/a.js',1)],[P+'b',build('/b.js',2)],[P+'current',build('/c.js')]]),w=load(stores,[],{deleteThrows:true});
 await w.activate();assert.equal(w.log[0],'claim');
});
test('activation (waitUntil) completes at claim, before any delete; a delete that never finishes does not hold it',async()=>{
 const stores=new Map([[P+'a',build('/a.js',1)],[P+'b',build('/b.js',2)],[P+'c',build('/c.js',3)],[P+'current',build('/current.js')]]),w=load(stores,[silent()],{deleteHangs:true});
 await w.handler();assert.equal(w.log[0],'claim');assert.ok(!w.log.some(x=>x.startsWith('delete:')));assert.equal(await order(stores,P+'current'),4);
 for(let i=0;i<40&&!w.log.some(x=>x.startsWith('delete:'));i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.deepEqual(w.log,['claim','matchAll:{"type":"window","includeUncontrolled":true}','delete:'+P+'a']);
});
test('a pending prune extends the worker lifetime from startup version messages and fetches without delaying replies',async()=>{
 const stores=new Map([[P+'a',build('/a.js',1)],[P+'b',build('/assets/b.js',2)],[P+'current',build('/current.js')]]),w=load(stores,[],{deleteHangs:true});
 await w.handler();const extended=[],replies=[];
 w.handlers.message({data:{type:'GET_BUILD_VERSION'},ports:[{postMessage:value=>replies.push(value.version)}],waitUntil:p=>extended.push(p)});
 assert.deepEqual(replies,['current']);assert.equal(extended.length,1);assert.equal(typeof extended[0].then,'function');
 let response;w.handlers.fetch({request:{method:'GET',url:'https://dev.example/assets/b.js',mode:'cors',headers:{has:()=>false}},respondWith:p=>response=p,waitUntil:p=>extended.push(p)});
 assert.equal(extended.length,2);assert.equal(extended[1],extended[0]);assert.equal(await response,'chunk:/assets/b.js');
 const idle=load(new Map()),none=[];idle.handlers.message({data:{type:'GET_BUILD_VERSION'},ports:[],waitUntil:p=>none.push(p)});assert.deepEqual(none,[]);
});
test('retained asset lookup checks the current cache first and never recreates a missing cache',async()=>{
 const stores=new Map([[P+'old',new Map([['/assets/shared.js','old-copy']])],[P+'current',new Map([['/assets/shared.js','current-copy']])]]);
 assert.equal(await load(stores).fetch('/assets/shared.js'),'current-copy');
 const empty=new Map();assert.equal(await load(empty).fetch('/assets/shared.js'),'network');assert.equal(empty.size,0);
});
