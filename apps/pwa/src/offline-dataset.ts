import {activitySnapshot,subscribeActivity} from './request-activity';
import type {OwnerOfflineRepository} from './owner-offline';

type Access={origin:string;offline?:OwnerOfflineRepository;offlineOnly?:boolean;token:()=>Promise<string>;authFailure:(status:number)=>void};
const domains=['records','collection','cash','management','notifications'] as const;
/** foreground: a screen is waiting on this sync (SYNC-UX-02 shows progress only then or before the first complete download). */
export type OfflinePreparation={state:'idle'|'preparing'|'ready'|'incomplete';completed:number;total:number;progress:number;chunks:number;syncActive:boolean;updating:boolean;updateFailed:boolean;lastChecked:number|null;foreground:boolean};
const idle:OfflinePreparation={state:'idle',completed:0,total:domains.length,progress:0,chunks:0,syncActive:false,updating:false,updateFailed:false,lastChecked:null,foreground:false};
const states=new Map<string,OfflinePreparation>(),listeners=new Set<()=>void>();
export const getOfflinePreparation=(scopeName?:string)=>scopeName?states.get(scopeName)??idle:idle;
export const subscribeOfflinePreparation=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};
function publish(scope:string,value:OfflinePreparation){states.set(scope,value);listeners.forEach(listener=>{listener()})}

// Stable content references let a later check reuse committed display data.
const canonicalValue=(value:any):any=>Array.isArray(value)?value.map(canonicalValue):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,key==='asOf'&&typeof value[key]==='string'?null:canonicalValue(value[key])])):value;
const valueHash=async(value:any)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),byte=>byte.toString(16).padStart(2,'0')).join('');
const hydrateValue=(value:any,asOf:string):any=>Array.isArray(value)?value.map(item=>hydrateValue(item,asOf)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='asOf'&&item===null?asOf:hydrateValue(item,asOf)])):value;
const datasetBase=(bundle:any):string|null=>bundle?JSON.stringify([bundle.generation??null,bundle.asOf,bundle.sourceVersion??null]):null;
async function indexDataset(bundle:any){
 const values:Record<string,any>={...bundle?.contentValues};
 if(bundle?.data&&!bundle.contentValues){
  const visit=async(value:any):Promise<void>=>{if(!value||typeof value!=='object')return;const canonical=canonicalValue(value);values[await valueHash(canonical)]=canonical;if(value&&typeof value==='object')for(const child of Object.values(value))await visit(child)};
  await visit(bundle.data);
 }
 return values;
}

/** One bounded request at a time. Foreground navigation pauses the next chunk;
 * it does not throw away a request which the server is already processing. */
export const DATASET_POLL_MS=5*60*1000;
/** R064: focus/visibility/online/background triggers recheck a domain only after this age; manual sync bypasses it. */
export const DATASET_RECHECK_MIN_MS=60*1000;
const REQUEST_TIMEOUT_MS=25000;
export function startOfflinePreparation(access:Access,_options:{readOrigin?:string}={}){
 const repository=access.offline;if(!repository)return()=>{};const repo=repository;
 let stopped=false,running=false,initialized=false,initializing=false,queue:string[]=[],media:string[]=[],requestedDomain:string|null=null,paused=false,timer:ReturnType<typeof setTimeout>|undefined,retryTimer:ReturnType<typeof setTimeout>|undefined,retryAttempts=0,controller:AbortController|null=null,activeTask:string|null=null;
 let lastChecked:number|null=null,recheck=false;
 const recheckDomains=new Set<string>(),domainChecked=new Map<string,number>();
 // Servers before R064 reject the acceptChanged request field; remember per path.
 const legacyPaths=new Set<string>();
 // In-memory partial between chunks: the durable progress row still carries every
 // chunk for crash resume, but the growing partial is not re-read and re-cloned.
 const partials=new Map<string,{partial:any,bundle:any}>();
 const cycleDomains=new Set<string>(),cycleDone=new Set<string>();
 const beginCycle=(targets:readonly string[]=domains)=>{cycleDomains.clear();cycleDone.clear();fractions.clear();chunkCounts.clear();for(const domain of targets)cycleDomains.add(domain)};
 const valueIndexes=new Map<string,{base:string|null,values:Record<string,any>}>();
 const completed=new Set<string>(),failed=new Set<string>(),fractions=new Map<string,number>(),chunkCounts=new Map<string,number>(),changedRetries=new Map<string,number>(),mediaVersion=new Map<string,number>(),preferred=new Set<string>();
 const mediaKeys=(records:any)=>(records?.data?.payments??[]).flatMap((row:any)=>[...(row.receiptReference?['manual']:[]),...(row.agentReceiptPresent?['agent']:[])].map(source=>{const path='/api/payment-records/'+encodeURIComponent(row.id)+'/receipt?source='+source;mediaVersion.set(path,Date.parse(source==='manual'?row.receiptAt:row.agentReceiptAt));if(source===(row.receiptReference?'manual':'agent'))preferred.add(path);return path}));
 // Cache availability and this sweep's completed work are independent.
 const progress=()=>{
  const discovered=!cycleDomains.has('records')||cycleDone.has('records');
  const images=discovered?(media.length?media.filter(path=>completed.has(path)).length/media.length:1):0;
  const core=cycleDomains.size?[...cycleDomains].reduce((sum,domain)=>sum+(cycleDone.has(domain)?1:fractions.get(domain)??0),0)/cycleDomains.size:1;
  const value=cycleDomains.has('records')||media.some(path=>!completed.has(path))?80*core+20*images:100*core;
  const complete=[...cycleDomains].every(domain=>cycleDone.has(domain))&&discovered&&media.every(path=>completed.has(path));
  return Math.max(0,Math.min(complete?100:99,value));
 };
 const syncActive=()=>navigator.onLine&&!access.offlineOnly&&!paused&&document.visibilityState!=='hidden'&&(running||queue.length>0&&(activitySnapshot()===0||!!requestedDomain));
 const status=()=>publish(repo.scopeName,{state:domains.every(domain=>completed.has(domain))&&media.every(path=>completed.has(path))?'ready':paused?'incomplete':queue.length||running?'preparing':'incomplete',completed:completed.size,total:domains.length+media.length,progress:progress(),syncActive:!!syncActive(),updating:domains.every(domain=>completed.has(domain))&&!!syncActive(),updateFailed:domains.every(domain=>completed.has(domain))&&failed.size>0,lastChecked,foreground:requestedDomain!==null,chunks:[...chunkCounts.values()].reduce((sum,count)=>sum+count,0)});
 const ready=(domain:string,changed:boolean)=>window.dispatchEvent(new CustomEvent('mw-offline-dataset-ready',{detail:{scopeName:repo.scopeName,domain,changed}}));
 const failedEvent=(domain:string)=>window.dispatchEvent(new CustomEvent('mw-offline-dataset-failed',{detail:{scopeName:repo.scopeName,domain}}));
 const stale=(domain:string)=>Date.now()-(domainChecked.get(domain)??0)>=DATASET_RECHECK_MIN_MS;
 const retryLater=()=>{if(stopped||retryTimer||retryAttempts>=3||!navigator.onLine||paused)return;const delay=[5000,15000,30000][retryAttempts++];retryTimer=setTimeout(()=>{retryTimer=undefined;resume()},delay)};
 const enqueue=(task:string,first=false)=>{if(queue.includes(task))return;first?queue.unshift(task):queue.push(task)};
 const schedule=()=>{if(stopped||timer)return;timer=setTimeout(()=>{timer=undefined;void pump()},200)};
 const addMedia=()=>{if(domains.every(domain=>completed.has(domain)))for(const path of media)if(!completed.has(path)&&!failed.has(path))enqueue(path)};
 const forget=async(task:string)=>{partials.delete(task);await repo.discardDatasetProgress(task)};
 const giveUp=(task:string)=>{if(task===requestedDomain)failedEvent(task)};
 async function initialize(){if(initializing)return;initializing=true;try{
  if(!await repo.syncAuthorized()){paused=true;status();return}
  beginCycle();
  for(const domain of domains){const [bundle,partial]=await Promise.all([repo.readDataset(domain),repo.readDatasetProgress(domain)]);if(stopped)return;
   if(bundle?.complete){completed.add(domain);if(domain==='records')media=mediaKeys(bundle)}
   if(partial&&bundle?.complete&&partial.protocolVersion!==3)await repo.discardDatasetProgress(domain);
   if(partial?.chunks)chunkCounts.set(domain,partial.chunks);
   if(partial?.progress?.total>0)fractions.set(domain,Math.min(.99,partial.progress.completed/partial.progress.total));
   if(navigator.onLine&&!access.offlineOnly){enqueue(domain)}
  }
  for(const path of media){const saved=await repo.readDatasetMedia('blob:'+new URL(path,access.origin).href);if(stopped)return;if(saved&&saved.savedAt>=(mediaVersion.get(path)??Infinity))completed.add(path)}
  initialized=true;paused=!navigator.onLine||!!access.offlineOnly;addMedia();status();schedule();
 }catch{paused=true;status()}finally{initializing=false}}
 async function pump(){
  if(stopped||running)return;
  if(!initialized){await initialize();return}
  if(!navigator.onLine||access.offlineOnly){paused=true;status();return}
  if((activitySnapshot()>0||document.visibilityState==='hidden')&&!requestedDomain){status();return;}
  if(!await repo.syncAuthorized()){paused=true;if(requestedDomain)failedEvent(requestedDomain);status();return}if(stopped||running)return;paused=false;
  addMedia();if(!queue.length){status();return}
  const task=queue.shift()!,isMedia=task.startsWith('/api/');running=true;activeTask=task;controller=new AbortController();const flight=controller;status();
  let timeout=setTimeout(()=>flight.abort(),REQUEST_TIMEOUT_MS);
  let softGiveUp=false;
  try{
   let revision=await repo.readRevision();if(revision===null||stopped)throw Error();
   // A read revision bump (own settled write) between or during chunks re-pins
   // the partial to the current revision and schedules one trailing recheck;
   // it never restarts the walk.
   const refreshRevision=async()=>{const current=await repo.readRevision();if(current===null||stopped)throw Error();if(current!==revision){revision=current;recheck=true}};
   const memo=isMedia?undefined:partials.get(task);
   const partial=isMedia?null:memo?memo.partial:await repo.readDatasetProgress(task);
   let bundle=isMedia?null:memo?memo.bundle:await repo.readDataset(task);
   const base=partial?.base??datasetBase(bundle),delta=!!bundle?.complete;
   if(partial&&(partial.base??null)!==datasetBase(bundle)){await forget(task);enqueue(task);return}
   const path=isMedia?task:task==='notifications'?'/api/notifications/offline-dataset':'/api/offline-dataset?domain='+task,url=new URL(path,access.origin);if(!isMedia){url.searchParams.set('protocol',delta?'3':'2');if(!delta&&partial?.nextCursor)url.searchParams.set('cursor',partial.nextCursor);}
   if(isMedia){const saved=await repo.readDatasetMedia('blob:'+url.href);if(saved&&saved.savedAt>=(mediaVersion.get(task)??Infinity)){if(preferred.has(task)){const alias=new URL(url);alias.searchParams.set('source','preferred');if(!await repo.saveDatasetMedia('blob:'+alias.href,saved.data,revision))throw Error()}completed.add(task);return}}
   const token=await access.token();if(stopped||flight.signal.aborted)throw Error();
   const legacy=legacyPaths.has(url.pathname);
   const fetchSegment=(need:string[]=[])=>fetch(url,{method:delta?'POST':'GET',...(!delta?{}:{body:JSON.stringify({cursor:partial?.nextCursor??null,need,sourceVersion:bundle?.sourceVersion??null,...(legacy?{}:{acceptChanged:true})})}),signal:flight.signal,headers:{Authorization:'Bearer '+token,...(!delta?{}:{'Content-Type':'application/json'})},credentials:'omit',cache:'no-store',redirect:'error'});
   // Legacy 409: the final chunk is lost, so the walk restarts once; a repeat is
   // not a failure (saved data stays available, the next check walks again).
   const changedOnServer=async()=>{await forget(task);fractions.delete(task);chunkCounts.delete(task);const retries=changedRetries.get(task)??0;if(retries<1){changedRetries.set(task,retries+1);enqueue(task);return}softGiveUp=true;cycleDone.add(task);if(bundle?.complete)ready(task,false);else giveUp(task)};
   let response=await fetchSegment();
   if(response.status===401||response.status===403){access.authFailure(response.status);paused=true;throw Error()}
   if(response.status===400&&delta&&!legacy){const error=await response.json().catch(()=>({}));if(error?.code==='invalid_request'){legacyPaths.add(url.pathname);enqueue(task,true);return}throw Error()}
   if(response.status===409&&!isMedia){const error=await response.json().catch(()=>({}));if(error?.code==='dataset_changed'){await changedOnServer();return}throw Error()}
   if(!response.ok)throw Error();let value=isMedia?await response.blob():await response.json();
   if(stopped||flight.signal.aborted||!await repo.syncAuthorized())throw Error();
   await refreshRevision();
   let full=value;
   if(!isMedia&&value.schemaVersion===3){
    if(value.unchanged){
     if(value.domain!==task||!value.complete||value.nextCursor!==null||!bundle?.complete||partial||value.sourceVersion!==bundle.sourceVersion)throw Error('Invalid unchanged checkpoint');
     if(!await repo.saveDataset(task,{...bundle,cacheStale:false},revision,null,base,!!bundle.cacheStale))throw Error('Dataset changed during check');
     completed.add(task);cycleDone.add(task);failed.delete(task);changedRetries.delete(task);domainChecked.set(task,Date.now());
     ready(task,false);return;
    }
    const indexed=valueIndexes.get(task);
    const values=indexed?.base===datasetBase(bundle)?indexed.values:await indexDataset(bundle);
    valueIndexes.set(task,{base:datasetBase(bundle),values});Object.assign(values,partial?.contentValues??{});
    if(!Array.isArray(value.patches))throw Error('Invalid delta manifest');
    const refs=value.patches.flatMap((patch:any)=>patch.refs??[]);
    if(refs.some((ref:any)=>typeof ref!=='string'||!/^[a-f0-9]{64}$/.test(ref)))throw Error('Invalid delta reference');
    const missing=[...new Set<string>(refs.filter((ref:string)=>!(ref in values)))];
    if(missing.length){
     const manifest=JSON.stringify(value.patches),generation=value.generation;
     // The content re-request is a second round trip with its own timeout.
     clearTimeout(timeout);timeout=setTimeout(()=>flight.abort(),REQUEST_TIMEOUT_MS);
     response=await fetchSegment(missing);
     if(response.status===401||response.status===403){access.authFailure(response.status);paused=true;throw Error()}
     if(response.status===409){await changedOnServer();return}
     if(!response.ok)throw Error();value=await response.json();
     if(partial&&value.generation!==generation||JSON.stringify(value.patches)!==manifest)throw Error('Delta manifest changed');
     for(const [hash,item] of Object.entries(value.values??{})){if(await valueHash(item)!==hash)throw Error('Invalid delta content');values[hash]=item}
    }
    if(stopped||flight.signal.aborted||!await repo.syncAuthorized())throw Error('Stale delta response');
    await refreshRevision();
    const contentValues:Record<string,any>={...partial?.contentValues};
    const patches=value.patches.map((patch:any)=>{
     if(!Array.isArray(patch.refs)||patch.refs.some((ref:string)=>!(ref in values))||patch.mode!=='append'&&patch.refs.length!==1)throw Error('Missing delta content');
     for(const ref of patch.refs)contentValues[ref]=values[ref];
     return {...patch,value:patch.mode==='append'?patch.refs.map((ref:string)=>hydrateValue(values[ref],value.asOf)):hydrateValue(values[patch.refs[0]],value.asOf)};
    });
    value={...value,patches,contentValues};
   }else if(!isMedia&&(delta||value.schemaVersion!==2))throw Error('Unsupported dataset protocol');
   // R064 torn commit: the server finished the walk but its source changed under
   // it. Keep the bundle without a source version and recheck (bounded).
   const torn=!isMedia&&value.complete===true&&value.changed===true;
   if(!isMedia){
    if(value.domain!==task||typeof value.generation!=='string'||!Array.isArray(value.patches)||typeof value.complete!=='boolean'||value.complete!==(value.nextCursor===null)||partial&&partial.generation!==value.generation)throw Error('Invalid dataset segment');
    // The memoized partial was already handed to IndexedDB by value; mutating it
    // in place is safe. A durable partial read back is cloned once.
    const data=memo?partial?.data??{}:structuredClone(partial?.data??{});
    for(const patch of value.patches){const path=[patch?.key,...(patch?.path??[])];if(!patch||!Array.isArray(patch.path??[])||path.some(key=>typeof key!=='string'||['__proto__','prototype','constructor'].includes(key)))throw Error('Invalid dataset patch');
     let target=data;for(const key of path.slice(0,-1)){if(Array.isArray(target)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=target.length))throw Error();if(target[key]===undefined)target[key]={};if(!target[key]||typeof target[key]!=='object')throw Error();target=target[key]}const key=path.at(-1)!;if(Array.isArray(target)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=target.length))throw Error();
     if(patch.mode==='append'){if(!Array.isArray(patch.value)||target[key]!==undefined&&!Array.isArray(target[key]))throw Error();target[key]=[...(target[key]??[]),...patch.value]}
     else if(patch.mode==='merge'){if(!patch.value||Array.isArray(patch.value)||typeof patch.value!=='object')throw Error();target[key]={...target[key],...patch.value}}
     else if(patch.mode==='replace')target[key]=patch.value;else throw Error();
    }
    full={schemaVersion:1,protocolVersion:value.schemaVersion,base,sourceVersion:torn?null:value.sourceVersion,contentValues:value.contentValues,domain:task,businessDate:value.businessDate,asOf:value.asOf,startedAt:partial?.startedAt??value.startedAt??value.asOf,generation:value.generation,complete:value.complete,data,chunks:(partial?.chunks??0)+1,nextCursor:value.nextCursor,progress:value.progress};
    if(!value.complete){if(!value.nextCursor||value.nextCursor===partial?.nextCursor||!await repo.saveDatasetProgress(task,full,revision,partial?.nextCursor??null))throw Error();partials.set(task,{partial:full,bundle});chunkCounts.set(task,full.chunks);if(value.progress?.total>0)fractions.set(task,Math.min(.99,value.progress.completed/value.progress.total));enqueue(task,task===requestedDomain);return}
    // Commit against the durable bundle, not a memoized copy of it.
    if(memo){bundle=await repo.readDataset(task);if((partial.base??null)!==datasetBase(bundle))throw Error('Dataset base changed')}
   }
   const dataChanged=!isMedia&&JSON.stringify(canonicalValue(bundle?.data))!==JSON.stringify(canonicalValue(full.data));
   const saved=isMedia?await repo.saveDatasetMedia('blob:'+url.href,value,revision):await repo.saveDataset(task,full,revision,partial?.nextCursor??null,base,dataChanged||!!bundle?.cacheStale);if(!saved)throw Error();partials.delete(task);if(!isMedia&&full.chunks)chunkCounts.set(task,full.chunks);
   if(isMedia&&preferred.has(task)){const alias=new URL(url);alias.searchParams.set('source','preferred');if(!await repo.saveDatasetMedia('blob:'+alias.href,value,revision))throw Error()}
   if(stopped)return;completed.add(task);cycleDone.add(task);queue=queue.filter(queued=>queued!==task);failed.delete(task);if(task==='records'){const oldVersions=new Map(mediaVersion);preferred.clear();mediaVersion.clear();media=mediaKeys(full);for(const path of media)if(oldVersions.get(path)!==mediaVersion.get(path)){completed.delete(path);failed.delete(path)}}
   if(!isMedia){
    domainChecked.set(task,Date.now());
    if(torn){const retries=changedRetries.get(task)??0;if(retries<2){changedRetries.set(task,retries+1);recheckDomains.add(task)}}else changedRetries.delete(task);
    ready(task,dataChanged);
   }
  }catch{if(!stopped){partials.delete(task);if(!navigator.onLine||flight.signal.aborted&&flight.signal.reason==='offline'){enqueue(task);paused=!navigator.onLine||!!access.offlineOnly}else{failed.add(task);if(!isMedia)giveUp(task)}}}finally{
   clearTimeout(timeout);running=false;activeTask=null;controller=null;if(!queue.includes(task)||failed.has(task)||softGiveUp){if(task===requestedDomain)requestedDomain=null}if(!stopped){addMedia();if(!queue.length&&(recheck||recheckDomains.size)){const targets=recheck?domains:[...recheckDomains];recheck=false;recheckDomains.clear();beginCycle(targets);for(const domain of targets)enqueue(domain)}if(!queue.length&&!failed.size&&domains.every(domain=>completed.has(domain)))lastChecked=Date.now();status();if(queue.length&&!paused)schedule();else if(failed.size)retryLater()}
  }
 }
 const request=(event?:Event)=>{if(stopped)return;const detail=(event as CustomEvent|undefined)?.detail;const priority=domains.includes(detail?.domain)?detail.domain:undefined;
  // A background prepare (a page served from the local bundle) is throttled like focus.
  if(detail?.background&&priority&&completed.has(priority)&&!failed.has(priority)&&!stale(priority))return;
  retryAttempts=0;if(retryTimer){clearTimeout(retryTimer);retryTimer=undefined;}
  if(detail?.foreground)requestedDomain=priority;
  if(event?.type==='mw-read-invalidated'){if(running||queue.length)recheck=true;else{beginCycle();for(const domain of domains)enqueue(domain)}failed.clear()}
  else if(!running&&!queue.length&&event?.type==='mw-offline-prepare'&&!failed.size){beginCycle(priority?[priority]:domains);for(const domain of cycleDomains)enqueue(domain)}
  else{for(const task of failed)enqueue(task);failed.clear()}
  if(priority){cycleDomains.add(priority);cycleDone.delete(priority);fractions.delete(priority);queue=queue.filter(task=>task!==priority);enqueue(priority,true)}
  changedRetries.clear();paused=false;status();schedule();
 };
 const check=()=>{if(stopped||document.visibilityState==='hidden'||!navigator.onLine||access.offlineOnly)return;if(!running&&!queue.length&&!failed.size){const targets=domains.filter(stale);if(targets.length){beginCycle(targets);for(const domain of targets)enqueue(domain)}}resume()};
 const visible=()=>{if(document.visibilityState!=='hidden')check();status()};
 // APP-OFFLINE-03: background poll every 5 minutes; focus, visibility, online and own-write
 // invalidation (mw-read-invalidated) still refresh, the first three at most once a minute.
 const poll=setInterval(check,DATASET_POLL_MS);
 const resume=()=>{if(stopped)return;for(const task of failed)enqueue(task);failed.clear();for(const domain of domains)if(!completed.has(domain)&&domain!==activeTask)enqueue(domain);paused=false;status();schedule()};
 const offline=()=>{paused=true;controller?.abort('offline');status()};
 const unsubscribe=subscribeActivity(()=>{status();if(activitySnapshot()===0)schedule()});
 window.addEventListener('mw-offline-queued',resume);window.addEventListener('online',check);window.addEventListener('offline',offline);window.addEventListener('focus',check);document.addEventListener('visibilitychange',visible);window.addEventListener('mw-read-invalidated',request);window.addEventListener('mw-offline-prepare',request);
 void initialize();
 return()=>{stopped=true;if(timer)clearTimeout(timer);if(retryTimer)clearTimeout(retryTimer);controller?.abort();unsubscribe();window.removeEventListener('mw-offline-queued',resume);window.removeEventListener('online',check);window.removeEventListener('offline',offline);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',visible);clearInterval(poll);window.removeEventListener('mw-read-invalidated',request);window.removeEventListener('mw-offline-prepare',request);states.delete(repo.scopeName);listeners.forEach(listener=>{listener()})};
}

export const routeDomain=(route:string)=>route.startsWith('/api/management')?'management':route.startsWith('/api/cash-')||route==='/api/preferences'?'cash':route.startsWith('/api/notifications')?'notifications':route.startsWith('/api/collection')||route.includes('/upcoming')||route.includes('/collection-receipts')?'collection':'records';
/** Waits for the domain's next completed check; rejects as soon as that check fails (SYNC-UX-05). */
export async function refreshOfflineDataset(access:Access,path:string):Promise<any|null>{
 const repo=access.offline;if(!repo||!navigator.onLine||access.offlineOnly)return readOfflineDataset(access,path);
 const domain=routeDomain(parsed(path,access.origin).pathname);
 await new Promise<void>((resolve,reject)=>{const cleanup=()=>{clearTimeout(timer);window.removeEventListener('mw-offline-dataset-ready',ready);window.removeEventListener('mw-offline-dataset-failed',failed)};const matches=(event:Event)=>{const detail=(event as CustomEvent).detail;return detail?.scopeName===repo.scopeName&&detail.domain===domain};const ready=(event:Event)=>{if(matches(event)){cleanup();resolve()}};const failed=(event:Event)=>{if(matches(event)){cleanup();reject(Error('Offline preparation failed'))}};const timer=setTimeout(()=>{cleanup();reject(Error('Offline preparation incomplete'))},65000);window.addEventListener('mw-offline-dataset-ready',ready);window.addEventListener('mw-offline-dataset-failed',failed);window.dispatchEvent(new CustomEvent('mw-offline-prepare',{detail:{domain,foreground:true}}));});
 return readOfflineDataset(access,path);
}
function parsed(path:string,origin=location.origin){return new URL(path,origin)}
export function isOfflineDatasetCursor(path:string){try{return (parsed(path).searchParams.get('cursor')??parsed(path).searchParams.get('before'))?.startsWith('offline:')??false}catch{return false}}
function sumAmounts(values:any[]){if(values.some(value=>value==null||!/^[-]?\d+(?:\.\d+)?$/.test(String(value))))return null;const scale=Math.max(0,...values.map(value=>(String(value).split('.')[1]??'').length));const total=values.reduce((sum:bigint,value:any)=>{const text=String(value),negative=text.startsWith('-'),[whole,fraction='']=text.replace(/^-/,'').split('.');return sum+(negative?-1n:1n)*BigInt(whole+fraction.padEnd(scale,'0'))},0n);const sign=total<0n?'-':'',digits=(total<0n?-total:total).toString().padStart(scale+1,'0');return sign+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits)}
const rowIdentity=(row:any)=>row.id??row.eventId??row.month??(row.dueDate?row.borrowerId+':'+row.dueDate:null);
const compare=(a:any,b:any)=>String(a??'')<String(b??'')?-1:String(a??'')>String(b??'')?1:0;
const matches=(row:any,q:string)=>!q||[row.name,row.description,row.borrowerName,row.borrowerDescription,row.borrowerDisplayName,row.displayName,row.label].some(value=>String(value??'').toLocaleLowerCase().includes(q.toLocaleLowerCase()));
async function serverCursorIndex(rows:any[],url:URL,bundle:any,cursor:string){
 if(cursor.length>16384||!/^[A-Za-z0-9_-]+$/.test(cursor))return -1;
 const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(cursor.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
 const route=url.pathname,parts=route.split('/').filter(Boolean).map(decodeURIComponent),query=url.searchParams,q=(query.get('q')??'').trim();
 const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');
 if(value.q!==undefined&&value.q!==q||value.queryHash!==undefined&&value.queryHash!==await hash(q))return -1;
 const borrowerScope=query.get('borrowerId')??(['borrowers','collection','payment-drafts','upcoming-charges'].includes(parts[1])?(parts[2]??null):null);
 if(value.borrowerId!==undefined&&value.borrowerId!==borrowerScope)return -1;
 if(value.parentId!==undefined&&value.parentId!==borrowerScope)return -1;
 if(value.businessDate!==undefined&&value.businessDate!==(query.get('businessDate')??bundle.businessDate)||value.day!==undefined&&value.day!==(query.get('businessDate')??bundle.businessDate))return -1;
 for(const field of ['holderId','partnerId','accountId','metric'])if(value[field]!==undefined&&value[field]!==query.get(field))return -1;
 if(parts[1]==='loan-records'&&parts[3]&&value.loanId!==undefined&&value.loanId!==parts[2])return -1;
 if(value.dueDate!==undefined&&value.dueDate!==parts[4])return -1;
 if(parts[1]==='payment-drafts'&&value.scope!==(query.get('scope')??'all'))return -1;
 if(parts[3]==='collection-receipts'){
  const ids=JSON.parse(query.get('chargeIds')??'[]');if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))return -1;
  if(value.scope!==await hash(JSON.stringify([parts[2],query.get('businessDate'),[...ids].sort()])))return -1;
 }
 if(route==='/api/cash-statements'){
  if(value.date!==query.get('date')||typeof value.ledgerId!=='string'||typeof value.direction!=='string'||typeof value.timestamp!=='string')return -1;
  return rows.findIndex(row=>row.ledgerId===value.ledgerId&&row.direction===value.direction&&row.timestamp===value.timestamp&&row.date===value.date);
 }
 if(parts[1]==='upcoming-charges'){
  if(typeof value.id!=='string'||typeof value.date!=='string')return -1;
  if(!parts[2])return rows.findIndex(row=>row.borrowerId===value.id&&row.dueDate===value.date);
  if(value.date!==parts[3])return -1;
 }
 if(route==='/api/payment-records'&&value.kind==='payment-months'){
  if(value.month!==null||!Array.isArray(value.tuple)||value.tuple.length!==2||typeof value.tuple[1]!=='string')return -1;
  return rows.findIndex(row=>(row.month??'')===value.tuple[1]);
 }
 if(route==='/api/payment-records'&&value.month!==undefined&&value.month!==query.get('month'))return -1;
 const id=value.id??value.eventId??(Array.isArray(value.tuple)?value.tuple.at(-1):undefined);if(typeof id!=='string')return -1;
 if(parts[1]==='notifications')return rows.findIndex(row=>row.eventId===id&&row.occurredAt===value.at);
 if(value.kind==='collection-upcoming')return rows.findIndex(row=>row.id===id&&row.loanId===value.loanId);
 return rows.findIndex(row=>row.id===id);
}
async function page(rows:any[],url:URL,bundle:any,extra:any={}){
 const limit=Number(url.searchParams.get('limit')??25);if(!Number.isInteger(limit)||limit<1||limit>100)return null;
 const scope=new URL(url);scope.searchParams.delete('cursor');scope.searchParams.delete('before');scope.searchParams.sort();const key=scope.pathname+'?'+scope.searchParams;
 let offset=0;const cursor=url.searchParams.get('cursor')??url.searchParams.get('before');
 if(cursor){if(!cursor.startsWith('offline:')){try{const found=await serverCursorIndex(rows,url,bundle,cursor);if(found<0)return null;offset=found+1}catch{return null}}else try{const value=JSON.parse(decodeURIComponent(cursor.slice(8)));if(value.scope!==key||!Number.isInteger(value.offset)||value.offset<0)return null;offset=value.offset;if(value.asOf!==bundle.asOf){const anchor=rows.findIndex(row=>rowIdentity(row)===value.anchor);if(anchor<0)return null;offset=anchor+1}}catch{return null}}
 const items=rows.slice(offset,offset+limit),nextCursor=offset+limit<rows.length?'offline:'+encodeURIComponent(JSON.stringify({scope:key,asOf:bundle.asOf,offset:offset+limit,anchor:rowIdentity(items.at(-1))})):null;
 return {...extra,items,nextCursor};
}
export async function readOfflineDataset(access:Access,path:string):Promise<any|null>{
 const repo=access.offline;if(!repo||!await repo.syncAuthorized())return null;
 const url=parsed(path,access.origin),route=url.pathname,q=(url.searchParams.get('q')??'').trim();if([...q].length>100||/[\u0000-\u001f\u007f]/.test(q))return null;
 const domain=routeDomain(route);
 const bundle=await repo.readDataset(domain);if(!bundle||bundle.schemaVersion!==1||!bundle.complete||!await repo.syncAuthorized())return null;
 const data=bundle.data,parts=route.split('/').filter(Boolean).map(decodeURIComponent),id=parts[2],tail=parts[3];
 const envelope={ok:true,source:repo.environment,businessDate:bundle.businessDate,asOf:bundle.asOf};
 const filtered=(rows:any[])=>rows.filter(row=>matches(row,q));
 const byDate=(field:string)=>(a:any,b:any)=>(a[field]==null?1:0)-(b[field]==null?1:0)||compare(b[field],a[field])||compare(a.id,b.id);
 if(domain==='records'){
  if(parts[1]==='payment-drafts'&&id&&!tail){const draft=data.paymentDrafts?.[id]?.[url.searchParams.get('scope')??'all'];if(!draft||draft.draftError)return null;const result=await page(draft.charges??[],url,bundle,draft);if(!result)return null;const {items,...rest}=result;return {...rest,charges:items}}
  if(route==='/api/dashboard')return data.dashboard;
  if(route==='/api/borrower-options'){const options=data.borrowerOptions;if(!options)return null;return {...options,referrers:filtered(options.referrers??options.items??[]).sort((a:any,b:any)=>compare(a.label??a.name,b.label??b.name)||compare(a.id,b.id))}}
  if(route==='/api/loan-options')return data.loanOptions;
  if(route==='/api/expense-options')return data.expenseOptions;
  const records:any={'borrower-records':data.borrowers,'loan-records':data.loans,'charge-records':data.charges,'payment-records':data.payments,'expense-records':data.expenses};
  if(id&&records[parts[1]]&&!tail){const item=records[parts[1]].find((row:any)=>row.id===id);return item?{item}:null}
  if(route==='/api/borrowers')return page(filtered(data.borrowerList??[]).sort((a:any,b:any)=>(a.hasActiveLoan===true?0:a.hasActiveLoan===false?1:2)-(b.hasActiveLoan===true?0:b.hasActiveLoan===false?1:2)||(a.createdDate==null?1:0)-(b.createdDate==null?1:0)||compare(a.createdDate,b.createdDate)||compare(a.id,b.id)),url,bundle,{...envelope,order:'active-inactive-unknown,created-date-asc-null-last,row-id-asc'});
  if(parts[1]==='borrowers'&&id&&!tail){const item=data.borrowerList?.find((row:any)=>row.id===id);return item?{...envelope,item}:null}
  if(parts[1]==='borrowers'&&tail==='loans'){
   const rank=(row:any)=>row.status==='ยังไม่ปิดยอด'?0:row.status==='ปิดยอดแล้ว'?1:2;
   const rows=(data.borrowerLoans??[]).filter((row:any)=>row.borrowerId===id).sort((a:any,b:any)=>rank(a)-rank(b)||byDate('loanDate')(a,b));
   if(parts[4]){const item=rows.find((row:any)=>row.id===parts[4]);return item?{...envelope,item}:null}return page(rows,url,bundle,envelope);
  }
  if(parts[1]==='borrowers'&&tail==='payments')return page((data.paymentHistory??[]).filter((row:any)=>row.borrowerId===id).sort(byDate('paymentDate')),url,bundle);
  if(parts[1]==='loan-records'&&['charges','payments'].includes(tail))return data.loanRelated?.[id]?page(data.loanRelated[id][tail]??[],url,bundle):null;
  if(route==='/api/loan-records')return page(filtered(data.loanList??[]),url,bundle);
  if(route==='/api/expense-records')return page([...(data.expenses??[])].sort((a,b)=>compare(b.expenseDate,a.expenseDate)||compare(b.id,a.id)),url,bundle);
  if(route==='/api/payment-records'){
   const borrowerId=url.searchParams.get('borrowerId'),unassigned=url.searchParams.get('unassigned')==='true',month=url.searchParams.get('month'),child=borrowerId!==null||unassigned;
   const payments=filtered((data.payments??[]).map((row:any)=>({...row,borrowerDisplayName:row.borrowerId==null?'Unavailable':(row.borrowerName??'')+' - '+(row.borrowerDescription??'')})));
   if(!child){const groups=new Map<string,any>();for(const row of payments)groups.set(row.borrowerId??'',{id:row.borrowerId??'',borrowerId:row.borrowerId,borrowerDisplayName:row.borrowerDisplayName});return page([...groups.values()].sort((a,b)=>compare(a.borrowerDisplayName,b.borrowerDisplayName)||compare(a.id,b.id)),url,bundle,{level:'borrowers'})}
   const selected=payments.filter((row:any)=>(row.borrowerId??null)===(unassigned?null:borrowerId));
   if(month===null){const ids=new Set(selected.map((row:any)=>row.borrowerId));return page((data.paymentMonths??[]).filter((row:any)=>ids.has(row.borrowerId??null)).sort((a:any,b:any)=>(a.month==null?1:0)-(b.month==null?1:0)||compare(b.month,a.month)),url,bundle,{level:'months'})}
   return page(selected.filter((row:any)=>(row.paymentDate?.slice(0,7)??'undated')===month).sort((a:any,b:any)=>(a.paymentDate==null?1:0)-(b.paymentDate==null?1:0)||compare(b.paymentDate,a.paymentDate)||(a.createdAt==null?1:0)-(b.createdAt==null?1:0)||compare(b.createdAt,a.createdAt)||compare(a.id,b.id)).map((row:any)=>({...row,accountLabel:row.cashAccountLabel})),url,bundle,{level:'payments'});
  }
 }
 if(domain==='collection'){
  if(url.searchParams.has('businessDate')&&url.searchParams.get('businessDate')!==bundle.businessDate)return null;
  if(route==='/api/collection'){const rows=filtered(data.items??[]);return page(rows.map(row=>{const group=rows.filter(item=>item.status===row.status);return {...row,groupRemaining:sumAmounts(group.map(item=>item.amountRemaining)),groupCollected:sumAmounts(group.map(item=>item.amountCollected))}}),url,bundle,envelope);}
  if(parts[1]==='collection'&&id&&tail==='charges'){const borrower=data.items?.find((row:any)=>row.id===id);return borrower?page((data.charges??[]).filter((row:any)=>row.borrowerId===id).sort(byDate('chargeDate')),url,bundle,{...envelope,borrower}):null}
  if(tail==='upcoming'){
   const entry=(data.borrowerUpcoming??Object.values(data.borrowerUpcomingByKey??{})).find((row:any)=>row.borrowerId===id&&row.scope===(parts[1]==='collection'?'collection':'borrower'));if(!entry)return null;
   if(!parts[4])return {...envelope,...entry};const detail=entry.previews?.find((row:any)=>row.dueDate===parts[4]);return detail?page(detail.items,url,bundle,{...envelope,...detail}):null;
  }
  if(route==='/api/upcoming-charges')return page(filtered(data.upcoming?.items??[]),url,bundle,data.upcoming??envelope);
  if(parts[1]==='upcoming-charges'&&id&&tail){const detail=(data.upcomingDetails??Object.values(data.upcomingDetailsByKey??{})).find((row:any)=>row.borrowerId===id&&row.dueDate===tail);return detail?page(detail.items,url,bundle,detail):null}
  if(tail==='collection-receipts'){let chargeIds:string[];try{chargeIds=JSON.parse(url.searchParams.get('chargeIds')??'[]')}catch{return null}return page((data.receipts??[]).filter((row:any)=>row.borrowerId===id&&row.chargeIds?.some((chargeId:string)=>chargeIds.includes(chargeId))).sort((a:any,b:any)=>(a.paymentDate==null?1:0)-(b.paymentDate==null?1:0)||compare(b.paymentDate,a.paymentDate)||compare(b.id,a.id)),url,bundle,envelope)}
 }
 if(domain==='cash'){
  if(route==='/api/cash-overview')return data.overview;
  if(route==='/api/preferences')return data.preferences;
  if(route==='/api/cash-statements'){const statement=(data.statements??Object.values(data.statementsByKey??{})).find((row:any)=>row.accountId===url.searchParams.get('accountId')&&row.date===url.searchParams.get('date'));return statement?page(statement.items,url,bundle,statement):null}
 }
 if(domain==='management'){
  if(id==='cash-position')return data.position;
  if(id==='analytics-overview')return data.analyticsOverview;
  if(id==='analytics-chart'){const chart=data.charts?.[url.searchParams.get('metric')??''];return chart?page(chart.items,url,bundle,chart):null}
  if(id==='openings'){const item=data.openings?.find((row:any)=>row.id===tail);return item?{item}:null}
  const rows=data.sections?.[id];if(!rows)return null;
  if(tail){const item=rows.find((row:any)=>row.id===tail);return item?{item}:null}
  const holderId=url.searchParams.get('holderId'),partnerId=url.searchParams.get('partnerId');
  return page(filtered(rows).filter((row:any)=>(!holderId||row.holderId===holderId)&&(!partnerId||row.partnerId===partnerId)),url,bundle);
 }
 if(domain==='notifications'){
  if(id==='status')return data.status;
  if(id)return data.targets?.find((row:any)=>row.eventId===id)??null;
  return page(data.items??[],url,bundle);
 }
 return null;
}
