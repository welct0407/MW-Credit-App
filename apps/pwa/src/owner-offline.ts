import {offlineNamespace,applicationEnvironment,type ApplicationEnvironment} from './environment';
import {validateViewedSnapshot,type ViewedSnapshot} from './viewed-snapshot';
const expiry=24*60*60*1000;
/** APP-OFFLINE-04: offline read data is kept for 7 days after the last successful online check (lease:owner.verifiedAt). */
const retention=7*expiry;
const retainedKinds=['dataset','dataset-progress','dataset-media','cache','snapshot'];
/** Keys are `kind:id`; a bounded key range reads or deletes one kind without walking the store. */
const kindRange=(kind:string)=>IDBKeyRange.bound(kind+':',kind+':\uffff');
/** Deletes stale offline read data; pending:* rows, drafts, the lease and meta rows are never touched. */
function sweepStale(db:IDBDatabase){return new Promise<void>(resolve=>{
 const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');
 tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>resolve();
 const lease=store.get('lease:owner');lease.onsuccess=()=>{const verifiedAt=lease.result?.value?.verifiedAt;if(typeof verifiedAt==='number'&&Date.now()-verifiedAt<retention)return;
  for(const kind of retainedKinds)store.delete(kindRange(kind))};
})}
/** The same rule for every other owner namespace of this environment on the device (once per page load, never blocks the current owner). */
const sweptEnvironments=new Set<string>();
async function sweepOtherOwners(environment:ApplicationEnvironment,current:string){
 if(sweptEnvironments.has(environment)||typeof indexedDB.databases!=='function')return;sweptEnvironments.add(environment);
 const prefix='mw-credit-'+environment+'-owner:';
 for(const {name} of await indexedDB.databases().catch(()=>[])){
  if(!name||name===current||!name.startsWith(prefix))continue;
  await new Promise<void>(resolve=>{const request=indexedDB.open(name);
   request.onupgradeneeded=()=>request.transaction?.abort();request.onerror=request.onblocked=()=>resolve();
   request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('records')){db.close();resolve();return;}void sweepStale(db).then(()=>{db.close();resolve()})};
  });
 }
}
const namespaceEpochs=new Map<string,number>();
/** deferred: the row waited past its first send (saved offline, or re-queued after a failed/busy attempt); only such rows announce mw-offline-synced (SYNC-UX-R01). */
export type PendingSync={state:'queued'|'syncing'|'blocked';code?:string;outcome?:any;attempted?:boolean;leaseOwner?:string;leaseUntil?:number;exclusive?:boolean;deferred?:boolean};
type Saved<T>={key:string;kind:'snapshot'|'draft'|'pending'|'lease'|'cache'|'dataset'|'dataset-media';savedAt:number;value:T;sync?:PendingSync;identity?:string};
export type CachedResponse={data:any;contentType:string;format:'json'|'blob';savedAt:number;revision:number};
const changed=()=>window.dispatchEvent(new Event('mw-offline-saved'));
const readsInvalidated=()=>window.dispatchEvent(new Event('mw-read-invalidated'));
async function pendingIdentity(value:any){
 const image=value?.receipt?.image;
 if(!(image instanceof Blob))return JSON.stringify(value);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await image.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');
 return JSON.stringify({...value,receipt:{...value.receipt,image:{type:image.type,size:image.size,hash}}});
}
/** Caller must supply the currently verified owner session. No authentication is inferred here. */
export function ownerOfflineRepository(identity:{issuer:string;uid:string},environment:ApplicationEnvironment=applicationEnvironment) {
 const name=offlineNamespace(identity,environment);
 const instanceEpoch=namespaceEpochs.get(name)??0;
 const validInstance=()=>instanceEpoch===(namespaceEpochs.get(name)??0);
 // WebKit can drop an installed app's IndexedDB connection (backgrounding, storage restart). A closed,
 // superseded or failed connection is forgotten so the next transaction opens a fresh one.
 let opened:Promise<IDBDatabase>|null=null;
 const drop=(connection:Promise<IDBDatabase>)=>{if(opened===connection)opened=null};
 const open=():Promise<IDBDatabase>=>{if(opened)return opened;const connection=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'key'});
  request.onsuccess=()=>{const db=request.result;db.onclose=()=>drop(connection);db.onversionchange=()=>{db.close();drop(connection)};void sweepStale(db).then(()=>{resolve(db);void sweepOtherOwners(environment,name).catch(()=>{})})};request.onerror=()=>{drop(connection);reject(Error('Offline storage unavailable'))};
 });opened=connection;return connection};
 const lost=(error:unknown)=>['UnknownError','InvalidStateError'].includes((error as {name?:string}|null)?.name??'');
 // Capture the durable namespace epoch when this owner-scoped instance is created.
 // Purge advances it atomically; late writes from other tabs cannot restore old data.
 const capturedEpoch=open().then(db=>new Promise<string>((resolve,reject)=>{
  const tx=db.transaction('records','readonly'),req=tx.objectStore('records').get('meta:epoch');
  req.onsuccess=()=>resolve(req.result?.value??'initial');req.onerror=()=>reject(Error('Offline storage unavailable'));
 }));
 void capturedEpoch.catch(()=>{});
 async function transaction<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore,done:(value:T)=>void,fail:(error:Error)=>void)=>void,bypassEpoch=false,retried=false):Promise<T>{
  if(mode==='readwrite'&&!bypassEpoch&&!validInstance())throw Error('Offline owner scope revoked');
  const connection=open(),db=await connection,expected=await capturedEpoch;
  if(mode==='readwrite'&&!bypassEpoch&&!validInstance())throw Error('Offline owner scope revoked');
  return new Promise((resolve,reject)=>{let settled=false,tx:IDBTransaction,value:T;
   // A lost connection aborts the transaction before it commits: reopen and run the whole transaction once more.
   const reopen=(error:unknown)=>{if(settled||retried||!lost(error))return false;settled=true;drop(connection);resolve(transaction(mode,work,bypassEpoch,true));return true};
   try{tx=db.transaction('records',mode)}catch(error){if(!reopen(error))reject(error);return}
   tx.oncomplete=()=>{settled=true;resolve(value)};tx.onerror=tx.onabort=event=>{if(!reopen(tx.error??(event.target as IDBRequest|null)?.error)){settled=true;reject(Error('Offline storage unavailable, full or owner scope revoked'))}};
   const store=tx.objectStore('records');
   const fail=(error:Error)=>{settled=true;reject(error);tx.abort()};
   const execute=()=>{try{work(store,result=>{value=result},fail)}catch(error){settled=true;tx.abort();reject(error)}};
   if(mode==='readwrite'&&!bypassEpoch){const req=store.get('meta:epoch');req.onsuccess=()=>{if(!validInstance()||(req.result?.value??'initial')!==expected){tx.abort();return;}execute()};}
   else execute();
  });
 }
 async function read<T>(kind:Saved<T>['kind'],id:string){
  const value=await transaction<Saved<T>|undefined>('readonly',(store,done)=>{const req=store.get(kind+':'+id);req.onsuccess=()=>done(req.result)});
  if(value?.kind==='snapshot'&&Date.now()-value.savedAt>expiry){await remove(kind,id);return null;}
  return value??null;
 }
 function bumpReadRevision(store:IDBObjectStore){const request=store.get('meta:read-revision');request.onsuccess=()=>store.put({key:'meta:read-revision',kind:'meta',value:(request.result?.value??0)+1})}
 async function cacheTransaction<T>(mode:IDBTransactionMode,fallback:T,work:(store:IDBObjectStore,done:(value:T)=>void)=>void){
  if(!validInstance())return fallback;const expected=await capturedEpoch;
  return transaction<T>(mode,(store,done)=>{const epoch=store.get('meta:epoch');epoch.onsuccess=()=>{if(!validInstance()||(epoch.result?.value??'initial')!==expected){done(fallback);return;}const lease=store.get('lease:owner');lease.onsuccess=()=>{if(!lease.result||Date.now()-lease.result.value.verifiedAt>=expiry){done(fallback);return;}work(store,done)}}});
 }
 async function remove(kind:Saved<unknown>['kind'],id:string){await transaction<void>('readwrite',(store,done)=>{store.delete(kind+':'+id);if(kind==='pending')bumpReadRevision(store);done()});if(kind==='pending'){changed();readsInvalidated()}}
 async function save<T>(kind:Saved<T>['kind'],id:string,value:T,savedAt=Date.now()){
  if(!id)throw Error('Offline record identity required');
  const identity=kind==='pending'?await pendingIdentity(value):undefined;
  await transaction<void>('readwrite',(store,done,fail)=>{
   const req=store.get(kind+':'+id);req.onsuccess=()=>{
    const existing=req.result as Saved<unknown>|undefined;
    if(kind==='pending'&&existing){if((existing.identity??JSON.stringify(existing.value))!==identity){fail(Error('Saved request is immutable'));return;}done();return;}
    const put=()=>{store.put({key:kind+':'+id,kind,savedAt,value,...(kind==='pending'?{identity,sync:{state:'queued',attempted:false,deferred:!navigator.onLine}}:{})});done()};
    if(kind!=='draft'&&kind!=='snapshot'){put();return;}
    const others=store.getAll(kindRange(kind));others.onsuccess=()=>{
     const rows=(others.result as Saved<unknown>[]).filter(row=>row.key!==kind+':'+id);
     if(kind==='draft'&&rows.length>=5){fail(Error('Offline draft limit reached'));return;}
     if(kind==='snapshot')for(const row of rows.sort((a,b)=>b.savedAt-a.savedAt).slice(19))store.delete(row.key);
     put();
    };
   };
  });
  if(kind==='pending'){changed();window.dispatchEvent(new Event('mw-offline-queued'));}
 }
 return {
  scopeName:name,environment,
  async readRevision(){
   if(!validInstance())return null;const expected=await capturedEpoch;
   return transaction<number|null>('readonly',(store,done)=>{const epoch=store.get('meta:epoch');epoch.onsuccess=()=>{if(!validInstance()||(epoch.result?.value??'initial')!==expected){done(null);return;}const request=store.get('meta:read-revision');request.onsuccess=()=>done(request.result?.value??0)}});
  },
  async readCacheRevision(){return cacheTransaction<number|null>('readonly',null,(store,done)=>{const request=store.get('meta:cache-revision');request.onsuccess=()=>done(request.result?.value??0)})},
  async invalidateReads(){await transaction<void>('readwrite',(store,done)=>{bumpReadRevision(store);done()});readsInvalidated()},
  async readDataset(domain:string){return cacheTransaction<any|null>('readonly',null,(store,done)=>{const request=store.get('dataset:'+domain);request.onsuccess=()=>{const row=request.result;if(!row){done(null);return;}const current=store.get('meta:read-revision');current.onsuccess=()=>done({...row.value,cacheStale:row.revision!==(current.result?.value??0)})}})},
  /** R064: a partial walk survives the owner's own settled writes; the coordinator re-pins it to the current revision and rechecks. */
  async readDatasetProgress(domain:string){return cacheTransaction<any|null>('readonly',null,(store,done)=>{const request=store.get('dataset-progress:'+domain);request.onsuccess=()=>done(request.result?.value??null)})},
  async discardDatasetProgress(domain:string){return cacheTransaction<void>('readwrite',undefined,(store,done)=>{store.delete('dataset-progress:'+domain);done()})},
  async saveDatasetProgress(domain:string,value:any,revision:number,expectedCursor?:string|null){
   if(!['records','collection','cash','management','notifications'].includes(domain)||value?.schemaVersion!==1||value.domain!==domain||value.complete!==false||!value.data)throw Error('Invalid offline dataset progress');
   return cacheTransaction<boolean>('readwrite',false,(store,done)=>{const current=store.get('meta:read-revision');current.onsuccess=()=>{if((current.result?.value??0)!==revision){done(false);return;}const stage=store.get('dataset-progress:'+domain);stage.onsuccess=()=>{if(expectedCursor!==undefined&&(stage.result?.value?.nextCursor??null)!==expectedCursor){done(false);return;}store.put({key:'dataset-progress:'+domain,kind:'dataset-progress',savedAt:Date.now(),revision,value});done(true)}}});
  },
  async saveDataset(domain:string,value:any,revision:number,expectedCursor?:string|null,expectedBase?:string|null,invalidateCache=true){
   if(!['records','collection','cash','management','notifications'].includes(domain)||value?.schemaVersion!==1||value.domain!==domain||value.complete!==true||!value.data)throw Error('Incomplete offline dataset');
   // Complete datasets are retained separately from the evictable response cache.
   // A failed/quota-exceeded transaction leaves the previous complete bundle intact.
   return cacheTransaction<boolean>('readwrite',false,(store,done)=>{const current=store.get('meta:read-revision');current.onsuccess=()=>{if((current.result?.value??0)!==revision){done(false);return;}const stage=store.get('dataset-progress:'+domain);stage.onsuccess=()=>{if(expectedCursor!==undefined&&(stage.result?.value?.nextCursor??null)!==expectedCursor){done(false);return;}const existing=store.get('dataset:'+domain);existing.onsuccess=()=>{const prior=existing.result?.value;
    if(expectedBase!==undefined&&(prior?JSON.stringify([prior.generation??null,prior.asOf,prior.sourceVersion??null]):null)!==expectedBase||existing.result?.revision===revision&&Date.parse(prior?.asOf)>Date.parse(value.asOf)){done(false);return;}
    // Data and checkpoint move together. Local mutations, drafts and pending
    // commands keep their own revision and immutable payloads.
    store.put({key:'dataset:'+domain,kind:'dataset',savedAt:Date.now(),revision,value});store.delete('dataset-progress:'+domain);
    // A response cached before this commit must not hide the newer dataset.
    if(!invalidateCache){done(true);return;}
    const cacheRevision=store.get('meta:cache-revision');cacheRevision.onsuccess=()=>store.put({key:'meta:cache-revision',kind:'meta',value:(cacheRevision.result?.value??0)+1});
    store.delete(kindRange('cache'));done(true);
   }}}});
  },
  /** R078: applies a narrow local patch to a complete bundle in one transaction. The progress row of a walk in
   * flight, the read revision and the bundle metadata stay as they are: that walk's commit replaces the patch.
   * mutate runs inside the transaction (synchronous) and returns the patched bundle, or null to leave it. */
  async patchDataset(domain:string,mutate:(value:any)=>any){
   return cacheTransaction<boolean>('readwrite',false,(store,done)=>{const request=store.get('dataset:'+domain);request.onsuccess=()=>{const row=request.result;if(!row?.value?.complete){done(false);return;}
    let value:any;try{value=mutate(structuredClone(row.value))}catch{value=null}
    const prior=row.value;if(value?.complete!==true||value.domain!==domain||!value.data||value.sourceVersion!==prior.sourceVersion||value.asOf!==prior.asOf||value.generation!==prior.generation){done(false);return;}
    store.put({...row,savedAt:Date.now(),value});done(true)}});
  },
  async readDatasetMedia(key:string){return cacheTransaction<CachedResponse|null>('readonly',null,(store,done)=>{const request=store.get('dataset-media:'+key);request.onsuccess=()=>{const row=request.result;if(!row){done(null);return;}const current=store.get('meta:read-revision');current.onsuccess=()=>done({data:row.value,format:'blob',contentType:row.value.type,savedAt:row.savedAt,revision:current.result?.value??0})}})},
  /** Keys of every stored receipt (without the kind prefix); blobs are not loaded. */
  async listDatasetMediaKeys(){return cacheTransaction<string[]>('readonly',[],(store,done)=>{const request=store.getAllKeys(kindRange('dataset-media'));request.onsuccess=()=>done((request.result as string[]).map(key=>key.slice('dataset-media:'.length)))})},
  async removeDatasetMedia(key:string){return cacheTransaction<void>('readwrite',undefined,(store,done)=>{store.delete('dataset-media:'+key);done()})},
  /** savedAt: a receipt seeded from the server copy the owner just uploaded records the server's receipt time (R078). */
  async saveDatasetMedia(key:string,value:Blob,revision:number,savedAt=Date.now()){
   if(!(value instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(value.type))throw Error('Invalid offline receipt');
   return cacheTransaction<boolean>('readwrite',false,(store,done)=>{const current=store.get('meta:read-revision');current.onsuccess=()=>{if((current.result?.value??0)!==revision){done(false);return;}store.put({key:'dataset-media:'+key,kind:'dataset-media',savedAt,revision,value});done(true)}});
  },
  async readCachedResponse(key:string){return cacheTransaction<CachedResponse|null>('readwrite',null,(store,done)=>{const request=store.get('cache:'+key);request.onsuccess=()=>{const row=request.result;if(!row){done(null);return;}const current=store.get('meta:read-revision');current.onsuccess=()=>{if(row.revision!==(current.result?.value??0)){done(null);return;}store.put({...row,lastUsed:Date.now()});done({...row.value,savedAt:row.savedAt,revision:row.revision})}}})},
  async saveCachedResponse(key:string,value:Omit<CachedResponse,'savedAt'|'revision'>,revision:number,expectedCacheRevision?:number|null){
   const size=value.format==='blob'&&value.data instanceof Blob?value.data.size:new TextEncoder().encode(JSON.stringify(value.data)).byteLength;
   if(size>8388608)return false;
   return cacheTransaction<boolean>('readwrite',false,(store,done)=>{const version=store.get('meta:read-revision');version.onsuccess=()=>{if((version.result?.value??0)!==revision){done(false);return;}const cacheRevision=store.get('meta:cache-revision');cacheRevision.onsuccess=()=>{if(expectedCacheRevision!==undefined&&(cacheRevision.result?.value??0)!==expectedCacheRevision){done(false);return;}const request=store.getAll(kindRange('cache'));request.onsuccess=()=>{const rows=request.result.filter((row:any)=>row.key!=='cache:'+key).sort((a:any,b:any)=>(b.lastUsed??b.savedAt)-(a.lastUsed??a.savedAt));let count=1,bytes=size;for(const row of rows){count++;bytes+=row.size??0;if(count>512||bytes>33554432)store.delete(row.key)}store.put({key:'cache:'+key,kind:'cache',savedAt:Date.now(),lastUsed:Date.now(),size,value,revision});done(true)}}}});
  },
  async authorize(){await save('lease','owner',{verifiedAt:Date.now()});window.dispatchEvent(new Event('mw-offline-queued'))},
  async authorized(){const lease=await read<{verifiedAt:number}>('lease','owner');return !!lease&&Date.now()-lease.value.verifiedAt<expiry},
  async list(kind:'snapshot'|'draft'|'pending'){
   const rows=await transaction<Saved<any>[]>('readonly',(store,done)=>{const req=store.getAll(kindRange(kind));req.onsuccess=()=>done(req.result)});
   return rows.filter(row=>row.kind===kind&&(kind!=='snapshot'||Date.now()-row.savedAt<expiry));
  },
  /** R072 troubleshooting: row counts per kind, the stored and partial dataset domains and the lease time, from keys only (no data loads). */
  async diagnosticCounts(){
   return transaction<{kinds:Record<string,number>;datasets:string[];progress:string[];leaseVerifiedAt:number|null}>('readonly',(store,done)=>{const keys=store.getAllKeys();keys.onsuccess=()=>{const kinds:Record<string,number>={},datasets:string[]=[],progress:string[]=[];
    for(const key of keys.result as string[]){const kind=String(key).split(':')[0];kinds[kind]=(kinds[kind]??0)+1;if(kind==='dataset')datasets.push(String(key).slice(8));if(kind==='dataset-progress')progress.push(String(key).slice(17))}
    const lease=store.get('lease:owner');lease.onsuccess=()=>{const verifiedAt=lease.result?.value?.verifiedAt;done({kinds,datasets:datasets.sort(),progress:progress.sort(),leaseVerifiedAt:typeof verifiedAt==='number'?verifiedAt:null})}}});
  },
  async saveViewedSnapshot(value:ViewedSnapshot){validateViewedSnapshot(value);const lease=await read<{verifiedAt:number}>('lease','owner');if(!lease||Date.now()-lease.value.verifiedAt>=expiry)throw Error('Offline owner lease expired');await save('snapshot',value.domain+':'+value.recordId,value,Date.parse(value.asOf))},
  async saveSnapshot(id:string,value:{charges:unknown[];[key:string]:unknown}){if(value.charges.length>100)throw Error('Offline snapshot exceeds 100 charges');await save('snapshot',id,value)},
  snapshot:<T,>(id:string)=>read<T>('snapshot',id),
  async saveDraft(id:string,value:{image?:Blob|null;[key:string]:unknown}){if(value.image&&value.image.size>5242880)throw Error('Offline receipt exceeds 5 MiB');await save('draft',id,value)},
  draft:<T,>(id:string)=>read<T>('draft',id),
  savePending:<T,>(id:string,value:T)=>save('pending',id,value),
  pending:<T,>(id:string)=>read<T>('pending',id),
  async syncAuthorized(){
   if(!validInstance())return false;
   const expected=await capturedEpoch;
   return transaction<boolean>('readonly',(store,done)=>{const epoch=store.get('meta:epoch');epoch.onsuccess=()=>{if(!validInstance()||(epoch.result?.value??'initial')!==expected){done(false);return;}const lease=store.get('lease:owner');lease.onsuccess=()=>done(!!lease.result&&Date.now()-lease.result.value.verifiedAt<expiry)}});
  },
  async claimPending(id:string,owner:string,exclusive=false){
   const claimed=await transaction<Saved<any>|null>('readwrite',(store,done)=>{const request=store.get('pending:'+id);request.onsuccess=()=>{const row=request.result as Saved<any>|undefined;if(!row||row.sync?.state==='blocked'||((row.sync?.leaseUntil??0)>Date.now()&&!(exclusive&&row.sync?.exclusive))){done(null);return;}row.sync={state:'syncing',attempted:row.sync?.attempted??true,leaseOwner:owner,leaseUntil:Date.now()+90000,exclusive,deferred:row.sync?.deferred===true};store.put(row);done(row)}});if(claimed)changed();return claimed;
  },
  async markPendingDispatched(id:string,owner:string){
   return transaction<boolean>('readwrite',(store,done)=>{const request=store.get('pending:'+id);request.onsuccess=()=>{const row=request.result as Saved<any>|undefined;if(row?.sync?.leaseOwner!==owner){done(false);return;}row.sync={...row.sync,attempted:true};store.put(row);done(true)}});
  },
  async coalescePendingNote(oldId:string,newId:string,value:any){
   const identity=await pendingIdentity(value);
   const replaced=await transaction<boolean>('readwrite',(store,done)=>{const request=store.get('pending:'+oldId);request.onsuccess=()=>{const row=request.result as Saved<any>|undefined;if(!row||row.sync?.attempted!==false||(row.sync?.leaseUntil??0)>Date.now()||row.value?.command?.operation!=='borrower.update'||value?.command?.operation!=='borrower.update'||row.value.command.targetId!==value.command.targetId||value.command.requestId!==newId||newId===oldId){done(false);return;}
    const before={...row.value.command.inputs,note:null},after={...value.command.inputs,note:null};if(JSON.stringify(before)!==JSON.stringify(after)||row.value.command.expectedVersion!==value.command.expectedVersion){done(false);return;}const existing=store.get('pending:'+newId);existing.onsuccess=()=>{if(existing.result){done(false);return;}const nextValue=row.value.notePredecessor?{...value,notePredecessor:row.value.notePredecessor}:value;store.delete(row.key);store.put({key:'pending:'+newId,kind:'pending',savedAt:Date.now(),value:nextValue,identity:row.value.notePredecessor?JSON.stringify(nextValue):identity,sync:{state:'queued',attempted:false,deferred:row.sync?.deferred===true||!navigator.onLine}});done(true)}}});
   if(replaced){changed();window.dispatchEvent(new Event('mw-offline-queued'));}return replaced;
  },
  async bindPendingNote(id:string,owner:string,command:any){
   return transaction<boolean>('readwrite',(store,done)=>{const request=store.get('pending:'+id);request.onsuccess=()=>{const row=request.result as Saved<any>|undefined,prior=row?.value?.command;
    if(!row?.value?.notePredecessor||row.sync?.leaseOwner!==owner||row.sync.attempted!==false||command?.operation!=='borrower.update'||command.requestId!==id||JSON.stringify({...prior,expectedVersion:command.expectedVersion})!==JSON.stringify(command)){done(false);return;}
    const value={...row.value,command};delete value.notePredecessor;store.put({...row,value,identity:JSON.stringify(value)});done(true)}});
  },
  async settlePending(id:string,owner:string,sync:PendingSync|null){
   let deferred=false;await transaction<void>('readwrite',(store,done)=>{const request=store.get('pending:'+id);request.onsuccess=()=>{const row=request.result as Saved<any>|undefined;if(row?.sync?.leaseOwner===owner){deferred=row.sync.deferred===true;if(sync===null){store.delete(row.key);bumpReadRevision(store)}else store.put({...row,sync:{...sync,deferred:true}});}done()}});changed();if(sync===null){if(deferred)window.dispatchEvent(new CustomEvent('mw-offline-synced',{detail:{id}}));readsInvalidated()}
  },
  async migrateSavedNotes(){
   await transaction<void>('readwrite',(store,done)=>{const marker=store.get('meta:note-queue-v1');marker.onsuccess=()=>{if(marker.result){done();return;}const drafts=store.getAll(kindRange('draft'));drafts.onsuccess=()=>{const pendingRows=store.getAll(kindRange('pending'));pendingRows.onsuccess=()=>{for(const row of drafts.result as Saved<any>[]){const draft=row.value?.draft;if(row.kind!=='draft'||draft?.kind!=='collection-note'||typeof draft.id!=='string'||typeof draft.text!=='string'||!draft.record||!/^[a-f0-9]{64}$/.test(draft.record.version??''))continue;
    const fields=['name','description','communicationName','instagramUsername','city','workingLocation','address','hidden','referrerId','preferredReceivingAccountId','note'];
    if(fields.some(key=>!Object.hasOwn(draft.record,key)))continue;
    if(draft.text===(draft.record.note??'')){store.delete(row.key);continue;}
    const inputs=Object.fromEntries(fields.map(key=>[key,key==='note'?draft.text:draft.record[key]]));
    const duplicate=(pendingRows.result as Saved<any>[]).some(other=>other.value?.command?.operation==='borrower.update'&&other.value.command.targetId===draft.id&&other.value.command.expectedVersion===draft.record.version&&JSON.stringify(other.value.command.inputs)===JSON.stringify(inputs));
    if(!duplicate){const requestId=crypto.randomUUID(),value={domain:'borrower',borrowerLabel:row.value.label,command:{requestId,operation:'borrower.update',targetId:draft.id,expectedVersion:draft.record.version,predecessorRequestId:null,inputs,receiptId:null}};store.put({key:'pending:'+requestId,kind:'pending',savedAt:row.savedAt,value,identity:JSON.stringify(value),sync:{state:'queued',attempted:false,deferred:!navigator.onLine}});}store.delete(row.key);
   }store.put({key:'meta:note-queue-v1',kind:'meta',value:true,savedAt:Date.now()});done()}}}});changed();
  },
  remove,
  /** True once a purge advanced this namespace past the epoch this instance captured; writes need a fresh instance. */
  revoked(){return !validInstance()},
  /** keepPending (involuntary 401/403): snapshots, drafts, caches, datasets, media, lease and meta go; unsynced pending:* rows (with their inline receipt images) stay for the same UID to sync later. */
  async purge(options?:{keepPending?:boolean}){try{const prefix='mw-credit.loan-delete:'+encodeURIComponent(name)+':';for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key?.startsWith(prefix))sessionStorage.removeItem(key)}}catch{}namespaceEpochs.set(name,(namespaceEpochs.get(name)??0)+1);await transaction<void>('readwrite',(store,done)=>{
   const epoch={key:'meta:epoch',kind:'meta',value:crypto.randomUUID(),savedAt:Date.now()};
   if(!options?.keepPending){store.clear();store.put(epoch);done();return;}
   const cursor=store.openCursor();cursor.onsuccess=()=>{const current=cursor.result;if(!current){store.put(epoch);done();return;}if(current.value?.kind!=='pending')current.delete();current.continue()};
  },true)},
 };
}
export type OwnerOfflineRepository=ReturnType<typeof ownerOfflineRepository>;
