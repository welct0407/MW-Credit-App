import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const transpile=file=>ts.transpileModule(readFileSync(new URL('../../apps/pwa/src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const repositorySource=transpile('owner-offline.ts'),syncSource=transpile('offline-sync.ts');
const domError=name=>Object.assign(Error(name),{name});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const settle=async()=>{for(let i=0;i<20;i++)await tick()};

/** Minimal IndexedDB: one shared committed map, writes staged per transaction, a lost connection is unusable
 * (WebKit gives no close event for it) and a transaction adding a pending row can be made to abort with UnknownError before commit. */
function fakeIndexedDB(){
 const data=new Map(),state={opens:0,abortNext:0,commits:0};let current=null;
 const range=(lower,upper)=>({lower,upper,includes:key=>key>=lower&&key<=upper});
 function connection(){
  const db={closed:false,onclose:null,onversionchange:null,objectStoreNames:{contains:name=>name==='records'},close(){db.closed=true},
   transaction(_name,mode){
    if(db.closed)throw domError('InvalidStateError');
    const staged=new Map(data),tx={oncomplete:null,onerror:null,onabort:null,error:null,mode},queue=[];let done=false;
    const abortWith=error=>{if(done)return;done=true;tx.error=error;tx.onabort?.({target:tx})};
    const request=run=>{const req={onsuccess:null,onerror:null,result:undefined};queue.push(()=>{req.result=run();req.onsuccess?.({target:req})});return req};
    const pump=()=>setTimeout(()=>{if(done)return;const next=queue.shift();if(next){next();pump();return}
     if(state.abortNext>0&&[...staged.keys()].some(key=>key.startsWith('pending:')&&!data.has(key))){state.abortNext--;abortWith(domError('UnknownError'));return}
     done=true;if(mode==='readwrite'){data.clear();for(const [key,value] of staged)data.set(key,value);state.commits++}tx.oncomplete?.()},0);
    const inRange=key=>[...staged.keys()].filter(item=>key.includes(item)).sort();
    tx.abort=()=>abortWith(null);
    tx.objectStore=()=>({
     get:key=>request(()=>structuredClone(staged.get(key))),
     put:value=>request(()=>{staged.set(value.key,value)}),
     delete:key=>request(()=>{if(typeof key==='string')staged.delete(key);else for(const item of inRange(key))staged.delete(item)}),
     getAll:key=>request(()=>inRange(key).map(item=>structuredClone(staged.get(item)))),
     getAllKeys:key=>request(()=>inRange(key)),
    });
    pump();return tx;
   }};
  return db;
 }
 const indexedDB={open(){state.opens++;const req={onsuccess:null,onerror:null,onupgradeneeded:null,result:null};setTimeout(()=>{current=connection();req.result=current;req.onsuccess?.()},0);return req}};
 return {indexedDB,IDBKeyRange:{bound:range},state,data,drop:()=>{current.closed=true},current:()=>current};
}
function repository(fake){
 const exports={},window=new EventTarget();
 runInNewContext(repositorySource,{exports,require:name=>name.includes('environment')?{offlineNamespace:()=>'mw-credit-synthetic-owner:test',applicationEnvironment:'synthetic'}:{validateViewedSnapshot:()=>{}},indexedDB:fake.indexedDB,IDBKeyRange:fake.IDBKeyRange,window,navigator:{onLine:true},crypto,Blob,Event,CustomEvent,JSON,setTimeout,clearTimeout,sessionStorage:{length:0,key:()=>null,removeItem:()=>{}}});
 return exports.ownerOfflineRepository({issuer:'synthetic',uid:'owner'},'synthetic');
}
const command=id=>({requestId:id,operation:'loan.update',targetId:'loan',inputs:{principal:'100'}});
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];

test('a dropped IndexedDB connection is reopened and the saved change stays readable',async()=>{
 const fake=fakeIndexedDB(),repo=repository(fake);
 await repo.savePending(ids[0],{command:command(ids[0])});assert.equal(fake.state.opens,1);
 fake.drop();
 const rows=await repo.list('pending');
 assert.equal(rows.length,1);assert.equal(rows[0].value.command.requestId,ids[0]);assert.equal(fake.state.opens,2);
 await repo.savePending(ids[1],{command:command(ids[1])});assert.equal((await repo.list('pending')).length,2);assert.equal(fake.state.opens,2);
});
test('a transaction aborted by a lost connection runs once more and writes the row once',async()=>{
 const fake=fakeIndexedDB(),repo=repository(fake);
 await repo.list('pending');const commits=fake.state.commits;
 fake.state.abortNext=1;await repo.savePending(ids[0],{command:command(ids[0])});
 assert.equal(fake.state.opens,2);assert.equal(fake.state.commits,commits+2,'the reopened sweep and the save commit; the aborted attempt did not');
 assert.deepEqual([...fake.data.keys()].filter(key=>key.startsWith('pending:')),['pending:'+ids[0]]);
});
test('a second lost connection in the retry is reported, not retried again',async()=>{
 const fake=fakeIndexedDB(),repo=repository(fake);
 await repo.list('pending');fake.state.abortNext=2;
 await assert.rejects(repo.savePending(ids[0],{command:command(ids[0])}),/Offline storage unavailable/);
 assert.equal(fake.data.has('pending:'+ids[0]),false);
 await repo.savePending(ids[0],{command:command(ids[0])});assert.equal(fake.data.has('pending:'+ids[0]),true);
});
test('a closed or superseded connection is forgotten and the next call opens a fresh one',async()=>{
 const fake=fakeIndexedDB(),repo=repository(fake);
 await repo.list('pending');fake.current().onclose();await repo.list('pending');assert.equal(fake.state.opens,2);
 fake.current().onversionchange();assert.equal(fake.current().closed,true);await repo.list('pending');assert.equal(fake.state.opens,3);
});

test('the saved-change coordinator keeps its back-off when storage cannot be read, then syncs',async()=>{
 const exports={},window=new EventTarget(),document=new EventTarget(),timers=[],calls=[];document.visibilityState='visible';
 let storageDown=true,row={key:'pending:'+ids[0],savedAt:1,value:{command:command(ids[0])},sync:{state:'queued',attempted:false}};
 const guard=async value=>{if(storageDown)throw Error('Offline storage unavailable');return value};
 const offline={environment:'synthetic',scopeName:'owner',syncAuthorized:()=>guard(true),migrateSavedNotes:()=>guard(),list:()=>guard(row?[row]:[]),claimPending:async()=>row,pending:async()=>row,markPendingDispatched:async()=>true,settlePending:async(_id,_owner,sync)=>{row=sync?{...row,sync}:null}};
 runInNewContext(syncSource,{exports,require:()=>({commandOriginAllowed:()=>true}),navigator:{onLine:true},location:{origin:'https://synthetic.invalid'},window,document,crypto,URL,Response,Event,CustomEvent,AbortController,setTimeout:(run,delay)=>{if(delay>=1000&&delay!==15000){timers.push({run,delay});return timers.length}return setTimeout(run,delay)},clearTimeout:handle=>{if(typeof handle==='object')clearTimeout(handle)},
  fetch:async(_url,init)=>{calls.push(init.method??'GET');return new Response(JSON.stringify(init.method==='POST'?{kind:'recorded',originalOutcome:{status:'applied'}}:{kind:'unresolved'}))}});
 const stop=exports.startSavedRequestSync({origin:'https://synthetic.invalid',offline,token:async()=>'synthetic',authFailure:()=>{}});
 await settle();
 assert.equal(timers.length,1,'retry armed although the pending list could not be read');assert.equal(timers[0].delay,1000);assert.equal(calls.length,0);
 storageDown=false;timers.shift().run();await settle();
 assert.deepEqual(calls,['GET','POST']);assert.equal(row,null);
 // Only the in-flight cleanup remains; nothing is left to retry.
 while(timers.length)timers.shift().run();await settle();assert.deepEqual(calls,['GET','POST']);assert.equal(timers.length,0);
 stop();
});
