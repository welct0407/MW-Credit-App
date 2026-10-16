import {offlineNamespace,applicationEnvironment,type ApplicationEnvironment} from './environment';
import {validateViewedSnapshot,type ViewedSnapshot} from './viewed-snapshot';
const expiry=24*60*60*1000;
const namespaceEpochs=new Map<string,number>();
export type PendingSync={state:'queued'|'syncing'|'blocked';code?:string;outcome?:any;attempted?:boolean;leaseOwner?:string;leaseUntil?:number;exclusive?:boolean};
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
 let opened:Promise<IDBDatabase>|null=null;
 const open=()=>opened??=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'key'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Offline storage unavailable'));
 });
 // Capture the durable namespace epoch when this owner-scoped instance is created.
 // Purge advances it atomically; late writes from other tabs cannot restore old data.
 const capturedEpoch=open().then(db=>new Promise<string>((resolve,reject)=>{
  const tx=db.transaction('records','readonly'),req=tx.objectStore('records').get('meta:epoch');
  req.onsuccess=()=>resolve(req.result?.value??'initial');req.onerror=()=>reject(Error('Offline storage unavailable'));
 }));
 void capturedEpoch.catch(()=>{});
 async function transaction<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore,done:(value:T)=>void,fail:(error:Error)=>void)=>void,bypassEpoch=false):Promise<T>{
  if(mode==='readwrite'&&!bypassEpoch&&!validInstance())throw Error('Offline owner scope revoked');
  const db=await open(),expected=await capturedEpoch;
  if(mode==='readwrite'&&!bypassEpoch&&!validInstance())throw Error('Offline owner scope revoked');
  return new Promise((resolve,reject)=>{const tx=db.transaction('records',mode);let value:T;
   tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(Error('Offline storage unavailable, full or owner scope revoked'));
   const store=tx.objectStore('records');
   const fail=(error:Error)=>{reject(error);tx.abort()};
   const execute=()=>{try{work(store,result=>{value=result},fail)}catch(error){tx.abort();reject(error)}};
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
   const req=store.getAll();req.onsuccess=()=>{
    const existing=(req.result as Saved<unknown>[]).find(row=>row.key===kind+':'+id);
    if(kind==='pending'&&existing){if((existing.identity??JSON.stringify(existing.value))!==identity){fail(Error('Saved request is immutable'));return;}done();return;}
    const rows=(req.result as Saved<unknown>[]).filter(row=>row.kind===kind&&row.key!==kind+':'+id);
    if(kind==='draft'&&rows.length>=5){fail(Error('Offline draft limit reached'));return;}
    if(kind==='snapshot')for(const row of rows.sort((a,b)=>b.savedAt-a.savedAt).slice(19))store.delete(row.key);
    store.put({key:kind+':'+id,kind,savedAt,value,...(kind==='pending'?{identity,sync:{state:'queued',attempted:false}}:{})});done();
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
  async readDatasetProgress(domain:string){return cacheTransaction<any|null>('readonly',null,(store,done)=>{const request=store.get('dataset-progress:'+domain);request.onsuccess=()=>{const row=request.result;if(!row){done(null);return;}const current=store.get('meta:read-revision');current.onsuccess=()=>done(row.revision===(current.result?.value??0)?row.value:null)}})},
  async discardDatasetProgress(domain:string){return cacheTransaction<void>('readwrite',undefined,(store,done)=>{store.delete('dataset-progress:'+domain);done()})},
  async saveDatasetProgress(domain:string,value:any,revision:number,expectedCursor?:string|null){
   if(!['records','collection','cash','management','notifications'].includes(domain)||value?.schemaVersion!==1||value.domain!==domain||value.complete!==false||!value.data)throw Error('Invalid offline dataset progress');
   return cacheTransaction<boolean>('readwrite',false,(store,done)=>{const current=store.get('meta:read-revision');current.onsuccess=()=>{if((current.result?.value??0)!==revision){done(false);return;}const stage=store.get('dataset-progress:'+domain);stage.onsuccess=()=>{if(expectedCursor!==undefined&&(stage.result?.revision===revision?stage.result?.value?.nextCursor??null:null)!==expectedCursor){done(false);return;}store.put({key:'dataset-progress:'+domain,kind:'dataset-progress',savedAt:Date.now(),revision,value});done(true)}}});
  },
  async saveDataset(domain:string,value:any,revision:number,expectedCursor?:string|null,expectedBase?:string|null,invalidateCache=true){
   if(!['records','collection','cash','management','notifications'].includes(domain)||value?.schemaVersion!==1||value.domain!==domain||value.complete!==true||!value.data)throw Error('Incomplete offline dataset');
   // Complete datasets are retained separately from the evictable response cache.
   // A failed/quota-exceeded transaction leaves the previous complete bundle intact.
   return cacheTransaction<boolean>('readwrite',false,(store,done)=>{const current=store.get('meta:read-revision');current.onsuccess=()=>{if((current.result?.value??0)!==revision){done(false);return;}const stage=store.get('dataset-progress:'+domain);stage.onsuccess=()=>{if(expectedCursor!==undefined&&(stage.result?.revision===revision?stage.result?.value?.nextCursor??null:null)!==expectedCursor){done(false);return;}const existing=store.get('dataset:'+domain);existing.onsuccess=()=>{const prior=existing.result?.value;
    if(expectedBase!==undefined&&(prior?JSON.stringify([prior.generation??null,prior.asOf,prior.sourceVersion??null]):null)!==expectedBase||existing.result?.revision===revision&&Date.parse(prior?.asOf)>Date.parse(value.asOf)){done(false);return;}
    // Data and checkpoint move together. Local mutations, drafts and pending
    // commands keep their own revision and immutable payloads.
    store.put({key:'dataset:'+domain,kind:'dataset',savedAt:Date.now(),revision,value});store.delete('dataset-progress:'+domain);
    // A response cached before this commit must not hide the newer dataset.
    if(!invalidateCache){done(true);return;}
    const cacheRevision=store.get('meta:cache-revision');cacheRevision.onsuccess=()=>store.put({key:'meta:cache-revision',kind:'meta',value:(cacheRevision.result?.value??0)+1});
    const caches=store.openCursor();caches.onsuccess=()=>{const cursor=caches.result;if(!cursor){done(true);return;}if(cursor.value.kind==='cache')cursor.delete();cursor.continue()};
   }}}});
  },
  async readDatasetMedia(key:string){return cacheTransaction<CachedResponse|null>('readonly',null,(store,done)=>{const request=store.get('dataset-media:'+key);request.onsuccess=()=>{const row=request.result;if(!row){done(null);return;}const current=store.get('meta:read-revision');current.onsuccess=()=>done({data:row.value,format:'blob',contentType:row.value.type,savedAt:row.savedAt,revision:current.result?.value??0})}})},
  async saveDatasetMedia(key:string,value:Blob,revision:number){
   if(!(value instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(value.type))throw Error('Invalid offline receipt');
   return cacheTransaction<boolean>('readwrite',false,(store,done)=>{const current=store.get('meta:read-revision');current.onsuccess=()=>{if((current.result?.value??0)!==revision){done(false);return;}store.put({key:'dataset-media:'+key,kind:'dataset-media',savedAt:Date.now(),revision,value});done(true)}});
  },
  async readCachedResponse(key:string){return cacheTransaction<CachedResponse|null>('readwrite',null,(store,done)=>{const request=store.get('cache:'+key);request.onsuccess=()=>{const row=request.result;if(!row){done(null);return;}const current=store.get('meta:read-revision');current.onsuccess=()=>{if(row.revision!==(current.result?.value??0)){done(null);return;}store.put({...row,lastUsed:Date.now()});done({...row.value,savedAt:row.savedAt,revision:row.revision})}}})},
  async saveCachedResponse(key:string,value:Omit<CachedResponse,'savedAt'|'revision'>,revision:number,expectedCacheRevision?:number|null){
   const size=value.format==='blob'&&value.data instanceof Blob?value.data.size:new TextEncoder().encode(JSON.stringify(value.data)).byteLength;
   if(size>8388608)return false;
   return cacheTransaction<boolean>('readwrite',false,(store,done)=>{const version=store.get('meta:read-revision');version.onsuccess=()=>{if((version.result?.value??0)!==revision){done(false);return;}const cacheRevision=store.get('meta:cache-revision');cacheRevision.onsuccess=()=>{if(expectedCacheRevision!==undefined&&(cacheRevision.result?.value??0)!==expectedCacheRevision){done(false);return;}const request=store.getAll();request.onsuccess=()=>{const rows=request.result.filter((row:any)=>row.kind==='cache'&&row.key!=='cache:'+key).sort((a:any,b:any)=>(b.lastUsed??b.savedAt)-(a.lastUsed??a.savedAt));let count=1,bytes=size;for(const row of rows){count++;bytes+=row.size??0;if(count>512||bytes>33554432)store.delete(row.key)}store.put({key:'cache:'+key,kind:'cache',savedAt:Date.now(),lastUsed:Date.now(),size,value,revision});done(true)}}}});
  },
  async authorize(){await save('lease','owner',{verifiedAt:Date.now()});window.dispatchEvent(new Event('mw-offline-queued'))},
  async authorized(){const lease=await read<{verifiedAt:number}>('lease','owner');return !!lease&&Date.now()-lease.value.verifiedAt<expiry},
  async list(kind:'snapshot'|'draft'|'pending'){
   const rows=await transaction<Saved<any>[]>('readonly',(store,done)=>{const req=store.getAll();req.onsuccess=()=>done(req.result)});
   return rows.filter(row=>row.kind===kind&&(kind!=='snapshot'||Date.now()-row.savedAt<expiry));
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
   const claimed=await transaction<Saved<any>|null>('readwrite',(store,done)=>{const request=store.get('pending:'+id);request.onsuccess=()=>{const row=request.result as Saved<any>|undefined;if(!row||row.sync?.state==='blocked'||((row.sync?.leaseUntil??0)>Date.now()&&!(exclusive&&row.sync?.exclusive))){done(null);return;}row.sync={state:'syncing',attempted:row.sync?.attempted??true,leaseOwner:owner,leaseUntil:Date.now()+90000,exclusive};store.put(row);done(row)}});if(claimed)changed();return claimed;
  },
  async markPendingDispatched(id:string,owner:string){
   return transaction<boolean>('readwrite',(store,done)=>{const request=store.get('pending:'+id);request.onsuccess=()=>{const row=request.result as Saved<any>|undefined;if(row?.sync?.leaseOwner!==owner){done(false);return;}row.sync={...row.sync,attempted:true};store.put(row);done(true)}});
  },
  async coalescePendingNote(oldId:string,newId:string,value:any){
   const identity=await pendingIdentity(value);
   const replaced=await transaction<boolean>('readwrite',(store,done)=>{const request=store.get('pending:'+oldId);request.onsuccess=()=>{const row=request.result as Saved<any>|undefined;if(!row||row.sync?.attempted!==false||(row.sync?.leaseUntil??0)>Date.now()||row.value?.command?.operation!=='borrower.update'||value?.command?.operation!=='borrower.update'||row.value.command.targetId!==value.command.targetId||value.command.requestId!==newId||newId===oldId){done(false);return;}
    const before={...row.value.command.inputs,note:null},after={...value.command.inputs,note:null};if(JSON.stringify(before)!==JSON.stringify(after)||row.value.command.expectedVersion!==value.command.expectedVersion){done(false);return;}const existing=store.get('pending:'+newId);existing.onsuccess=()=>{if(existing.result){done(false);return;}const nextValue=row.value.notePredecessor?{...value,notePredecessor:row.value.notePredecessor}:value;store.delete(row.key);store.put({key:'pending:'+newId,kind:'pending',savedAt:Date.now(),value:nextValue,identity:row.value.notePredecessor?JSON.stringify(nextValue):identity,sync:{state:'queued',attempted:false}});done(true)}}});
   if(replaced){changed();window.dispatchEvent(new Event('mw-offline-queued'));}return replaced;
  },
  async bindPendingNote(id:string,owner:string,command:any){
   return transaction<boolean>('readwrite',(store,done)=>{const request=store.get('pending:'+id);request.onsuccess=()=>{const row=request.result as Saved<any>|undefined,prior=row?.value?.command;
    if(!row?.value?.notePredecessor||row.sync?.leaseOwner!==owner||row.sync.attempted!==false||command?.operation!=='borrower.update'||command.requestId!==id||JSON.stringify({...prior,expectedVersion:command.expectedVersion})!==JSON.stringify(command)){done(false);return;}
    const value={...row.value,command};delete value.notePredecessor;store.put({...row,value,identity:JSON.stringify(value)});done(true)}});
  },
  async settlePending(id:string,owner:string,sync:PendingSync|null){
   await transaction<void>('readwrite',(store,done)=>{const request=store.get('pending:'+id);request.onsuccess=()=>{const row=request.result as Saved<any>|undefined;if(row?.sync?.leaseOwner===owner){if(sync===null){store.delete(row.key);bumpReadRevision(store)}else store.put({...row,sync});}done()}});changed();if(sync===null)readsInvalidated();
  },
  async migrateSavedNotes(){
   await transaction<void>('readwrite',(store,done)=>{const request=store.getAll();request.onsuccess=()=>{if(request.result.some((row:any)=>row.key==='meta:note-queue-v1')){done();return;}for(const row of request.result as Saved<any>[]){const draft=row.value?.draft;if(row.kind!=='draft'||draft?.kind!=='collection-note'||typeof draft.id!=='string'||typeof draft.text!=='string'||!draft.record||!/^[a-f0-9]{64}$/.test(draft.record.version??''))continue;
    const fields=['name','description','communicationName','instagramUsername','city','workingLocation','address','hidden','referrerId','preferredReceivingAccountId','note'];
    if(fields.some(key=>!Object.hasOwn(draft.record,key)))continue;
    if(draft.text===(draft.record.note??'')){store.delete(row.key);continue;}
    const inputs=Object.fromEntries(fields.map(key=>[key,key==='note'?draft.text:draft.record[key]]));
    const duplicate=(request.result as Saved<any>[]).some(other=>other.kind==='pending'&&other.value?.command?.operation==='borrower.update'&&other.value.command.targetId===draft.id&&other.value.command.expectedVersion===draft.record.version&&JSON.stringify(other.value.command.inputs)===JSON.stringify(inputs));
    if(!duplicate){const requestId=crypto.randomUUID(),value={domain:'borrower',borrowerLabel:row.value.label,command:{requestId,operation:'borrower.update',targetId:draft.id,expectedVersion:draft.record.version,predecessorRequestId:null,inputs,receiptId:null}};store.put({key:'pending:'+requestId,kind:'pending',savedAt:row.savedAt,value,identity:JSON.stringify(value),sync:{state:'queued',attempted:false}});}store.delete(row.key);
   }store.put({key:'meta:note-queue-v1',kind:'meta',value:true,savedAt:Date.now()});done()}});changed();
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
