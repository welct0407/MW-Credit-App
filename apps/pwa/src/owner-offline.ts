const issuer='https://securetoken.google.com/clever-oasis-508610-n7';
const expiry=24*60*60*1000;
const namespaceEpochs=new Map<string,number>();
type Saved<T>={key:string;kind:'snapshot'|'draft'|'pending'|'lease';savedAt:number;value:T};
/** Caller must supply the currently verified owner session. No authentication is inferred here. */
export function ownerOfflineRepository(identity:{issuer:string;uid:string}) {
 if(identity.issuer!==issuer||!identity.uid||identity.uid.length>128)throw Error('Offline owner identity unavailable');
 const name='mw-credit-dev-owner:'+identity.issuer+':'+identity.uid;
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
 async function transaction<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore,done:(value:T)=>void)=>void,bypassEpoch=false):Promise<T>{
  if(mode==='readwrite'&&!bypassEpoch&&!validInstance())throw Error('Offline owner scope revoked');
  const db=await open(),expected=await capturedEpoch;
  if(mode==='readwrite'&&!bypassEpoch&&!validInstance())throw Error('Offline owner scope revoked');
  return new Promise((resolve,reject)=>{const tx=db.transaction('records',mode);let value:T;
   tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(Error('Offline storage unavailable, full or owner scope revoked'));
   const store=tx.objectStore('records');
   const execute=()=>{try{work(store,result=>{value=result})}catch(error){tx.abort();reject(error)}};
   if(mode==='readwrite'&&!bypassEpoch){const req=store.get('meta:epoch');req.onsuccess=()=>{if(!validInstance()||(req.result?.value??'initial')!==expected){tx.abort();return;}execute()};}
   else execute();
  });
 }
 async function read<T>(kind:Saved<T>['kind'],id:string){
  const value=await transaction<Saved<T>|undefined>('readonly',(store,done)=>{const req=store.get(kind+':'+id);req.onsuccess=()=>done(req.result)});
  if(value?.kind==='snapshot'&&Date.now()-value.savedAt>expiry){await remove(kind,id);return null;}
  return value??null;
 }
 async function remove(kind:Saved<unknown>['kind'],id:string){await transaction<void>('readwrite',(store,done)=>{store.delete(kind+':'+id);done()});}
 async function save<T>(kind:Saved<T>['kind'],id:string,value:T){
  if(!id)throw Error('Offline record identity required');
  return transaction<void>('readwrite',(store,done)=>{
   const req=store.getAll();req.onsuccess=()=>{
    const existing=(req.result as Saved<unknown>[]).find(row=>row.key===kind+':'+id);
    if(kind==='pending'&&existing&&JSON.stringify(existing.value)!==JSON.stringify(value)){store.transaction.abort();return;}
    const rows=(req.result as Saved<unknown>[]).filter(row=>row.kind===kind&&row.key!==kind+':'+id);
    if(kind==='draft'&&rows.length>=5){store.transaction.abort();return;}
    if(kind==='snapshot')for(const row of rows.sort((a,b)=>b.savedAt-a.savedAt).slice(19))store.delete(row.key);
    store.put({key:kind+':'+id,kind,savedAt:Date.now(),value});done();
   };
  });
 }
 return {
  async authorize(){await save('lease','owner',{verifiedAt:Date.now()})},
  async authorized(){const lease=await read<{verifiedAt:number}>('lease','owner');return !!lease&&Date.now()-lease.value.verifiedAt<expiry},
  async list(kind:'snapshot'|'draft'|'pending'){
   const rows=await transaction<Saved<any>[]>('readonly',(store,done)=>{const req=store.getAll();req.onsuccess=()=>done(req.result)});
   return rows.filter(row=>row.kind===kind&&(kind!=='snapshot'||Date.now()-row.savedAt<expiry));
  },
  async saveSnapshot(id:string,value:{charges:unknown[];[key:string]:unknown}){if(value.charges.length>100)throw Error('Offline snapshot exceeds 100 charges');await save('snapshot',id,value)},
  snapshot:<T,>(id:string)=>read<T>('snapshot',id),
  async saveDraft(id:string,value:{image?:Blob|null;[key:string]:unknown}){if(value.image&&value.image.size>5242880)throw Error('Offline receipt exceeds 5 MiB');await save('draft',id,value)},
  draft:<T,>(id:string)=>read<T>('draft',id),
  savePending:<T,>(id:string,value:T)=>save('pending',id,value),
  pending:<T,>(id:string)=>read<T>('pending',id),
  remove,
  async purge(){namespaceEpochs.set(name,(namespaceEpochs.get(name)??0)+1);await transaction<void>('readwrite',(store,done)=>{store.clear();store.put({key:'meta:epoch',kind:'meta',value:crypto.randomUUID(),savedAt:Date.now()});done()},true)},
 };
}
export type OwnerOfflineRepository=ReturnType<typeof ownerOfflineRepository>;
