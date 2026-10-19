import {activitySnapshot,subscribeActivity} from './request-activity';
import {applyDatasetPatch,deltaMovesRows,datasetDigests} from './dataset-patch';
import {recordClientEvent} from './client-events';
import type {OwnerOfflineRepository} from './owner-offline';

type Access={origin:string;offline?:OwnerOfflineRepository;offlineOnly?:boolean;token:()=>Promise<string>;authFailure:(status:number)=>void};
const domains=['records','collection','cash','management','notifications'] as const;
/** foreground: a screen is waiting on this sync (SYNC-UX-02 shows progress only then or before the first complete download). */
/** failedDomains: the data domains whose last check failed, sorted and comma-joined (receipts are never listed). */
export type OfflinePreparation={state:'idle'|'preparing'|'ready'|'incomplete';completed:number;total:number;progress:number;chunks:number;syncActive:boolean;domainsPending:boolean;updating:boolean;updateFailed:boolean;failedDomains:string;lastChecked:number|null;foreground:boolean;fullSync:boolean};
const idle:OfflinePreparation={state:'idle',completed:0,total:domains.length,progress:0,chunks:0,syncActive:false,domainsPending:false,updating:false,updateFailed:false,failedDomains:'',lastChecked:null,foreground:false,fullSync:false};
const states=new Map<string,OfflinePreparation>(),listeners=new Set<()=>void>();
export const getOfflinePreparation=(scopeName?:string)=>scopeName?states.get(scopeName)??idle:idle;
export const subscribeOfflinePreparation=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};
// UX-REFRESH-03: an unchanged status keeps its snapshot and does not wake listeners (the app shell).
function publish(scope:string,value:OfflinePreparation){const prior=states.get(scope);if(prior&&(Object.keys(value) as (keyof OfflinePreparation)[]).every(key=>prior[key]===value[key]))return;states.set(scope,value);listeners.forEach(listener=>{listener()})}

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

/** Bounded requests: at most DATASET_DATA_FLIGHTS data domains at once (R078; never two for one domain).
 * Foreground navigation pauses the next chunk; it does not throw away a request which the server is
 * already processing. */
export const DATASET_POLL_MS=30*1000;
export const DATASET_DATA_FLIGHTS=2;
/** A walk writes its durable progress row for its first chunk, then once per this many chunks, before a
 * pause and when a chunk fails (R078); a chunk lost before it was written is fetched again on resume. */
export const DATASET_PROGRESS_SAVE_CHUNKS=4;
/** The data domains an own write is confirmed in (R078 item 6); management refreshes on the regular poll. */
/** R078 reconciliation (owner, 19 October 2026: twice a day): the first idle, visible, online moment after 06:00
 * and after 18:00 Bangkok time, or 12 h after the last completed one (stored in IndexedDB meta). */
const HOUR=60*60*1000,BANGKOK_OFFSET=7*HOUR;
export const RECONCILE_MAX_AGE_MS=12*HOUR,RECONCILE_TIMEOUT_MS=50*1000;
/** A pass that could not finish (unavailable, 5xx, timeout, network) waits this long before it is tried again. */
export const RECONCILE_RETRY_MS=30*60*1000;
/** The latest 06:00 or 18:00 Bangkok boundary at or before `now` (Bangkok has no daylight saving). */
export function reconcileSlot(now:number){const local=now+BANGKOK_OFFSET,day=Math.floor(local/(24*HOUR))*24*HOUR;return Math.max(...[day-6*HOUR,day+6*HOUR,day+18*HOUR].filter(at=>at<=local))-BANGKOK_OFFSET}
/** A stored time ahead of now (a phone clock that was wrong) counts as due, never as "done for a while". */
export const reconcileDue=(now:number,last:number)=>last>now||now-last>=RECONCILE_MAX_AGE_MS||last<reconcileSlot(now);
/** Whether a failed attempt still holds the next pass back (an attempt in the future does not). */
export const reconcileBackingOff=(now:number,attempt:{at:number}|null)=>!!attempt&&attempt.at<=now&&now-attempt.at<RECONCILE_RETRY_MS;
const sha256Hex=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');
/** A protocol v4 change cursor (services/api/offline-dataset-delta.mjs validChangeCursor). */
export const validChangeCursor=(value:any)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')==='businessDate,seq,xmin'&&/^(0|[1-9]\d{0,18})$/.test(value.seq)&&/^(0|[1-9]\d{0,19})$/.test(value.xmin)&&/^\d{4}-\d{2}-\d{2}$/.test(value.businessDate);
const hasLocalRows=(value:any):boolean=>Array.isArray(value)?value.some(hasLocalRows):!!value&&typeof value==='object'&&(Object.hasOwn(value,'localPending')||Object.values(value).some(hasLocalRows));
/** The data domains reconciled (notifications has its own endpoint and no source version). */
export const DATASET_RECONCILE_DOMAINS=Object.freeze(['records','collection','cash','management']);
export const DATASET_CONFIRM_DOMAINS=Object.freeze(['records','collection','cash']);
/** R064: online and background-prepare triggers recheck a domain only after this age; focus, visible-again,
 * the poll and manual sync bypass it (owner decision 17 October 2026). */
export const DATASET_RECHECK_MIN_MS=10*1000;
/** A failed domain (or receipt) is retried after a bounded exponential back-off: 30 s, 60 s, 2 min,
 * then every 5 min. Success resets it for that task; online, focus and visible-again reset every task.
 * Background triggers (the poll, a successful live read, a page served from the local bundle) wait
 * for the back-off; an explicit sync, an own write and a waiting screen retry at once. */
export const DATASET_RETRY_BACKOFF_MS=[30*1000,60*1000,2*60*1000,5*60*1000] as const;
const REQUEST_TIMEOUT_MS=25000;
/** services/api/offline-dataset-delta.mjs rejects a need list longer than this. */
const NEED_BATCH=2048;
/** R066: receipts are kept offline for payments whose payment date (the date the
 * user sees on the payment) is within the last 30 days; a receipt time stands in
 * when a row has no payment date. Older receipts load online on demand only. */
export const RECEIPT_OFFLINE_DAYS=30;
const bangkokDay=(at:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
export const receiptWindowStart=(now=Date.now())=>bangkokDay(now-RECEIPT_OFFLINE_DAYS*24*60*60*1000);
export function receiptRetainedOffline(row:any,now=Date.now()){
 const day=typeof row?.paymentDate==='string'&&row.paymentDate?row.paymentDate.slice(0,10):typeof (row?.receiptAt??row?.agentReceiptAt)==='string'?String(row.receiptAt??row.agentReceiptAt).slice(0,10):null;
 return !!day&&day>=receiptWindowStart(now);
}
/** The one stored receipt for a payment; the `preferred` alias resolves to it at read time (read-cache.ts). */
export const receiptMediaCandidates=(url:URL)=>url.searchParams.get('source')!=='preferred'?['blob:'+url.href]:['manual','agent'].map(source=>{const alias=new URL(url);alias.searchParams.set('source',source);return 'blob:'+alias.href});
export function startOfflinePreparation(access:Access,_options:{readOrigin?:string}={}){
 const repository=access.offline;if(!repository)return()=>{};const repo=repository;
 let stopped=false,initialized=false,initializing=false,queue:string[]=[],media:string[]=[],requestedDomain:string|null=null,paused=false,timer:ReturnType<typeof setTimeout>|undefined,retryTimer:ReturnType<typeof setTimeout>|undefined;
 // recheck: an own write settled during this cycle; the domains it touches are confirmed once the cycle ends.
 let lastChecked:number|null=null,recheck=false,pollTimer:ReturnType<typeof setTimeout>|undefined;
 // R078: every task in flight with its abort controller. At most DATASET_DATA_FLIGHTS data domains run
 // at once (never the same domain twice); a receipt runs alone, only while no data domain is queued or in flight.
 const active=new Map<string,AbortController>();
 // While a starting records check asks for every domain's source version, the other data domains wait
 // for that answer instead of each sending its own unchanged check.
 let versionsPending=false;
 const recheckDomains=new Set<string>(),domainChecked=new Map<string,number>();
 // Request fields each dataset path accepts: 3 = since (R078 protocol v4), 2 = versions and acceptChanged
 // (R078), 1 = acceptChanged (R064), 0 = neither. A 400 invalid_request steps the path down once per field.
 const pathLevels=new Map<string,number>();
 // Domains whose next check walks instead of asking for a v4 delta (a delta that moved rows between owners).
 const walkNext=new Set<string>();
 // UX-FULL (owner, 19 October 2026): a full sync walks every domain from the start, ignoring the stored source
 // version, the change cursor and the versions shortcut. A domain leaves this set when a forced walk commits.
 const forceWalk=new Set<string>();
 // In-memory partial between chunks. The durable progress row is written for the first chunk of a walk,
 // then every DATASET_PROGRESS_SAVE_CHUNKS chunks, before a pause and when a chunk fails; `saved` is the
 // cursor of that durable row. A chunk lost before it was saved is fetched again on resume.
 type WalkPartial={partial:any;bundle:any;saved:string|null;unsaved:number;revision:number};
 const partials=new Map<string,WalkPartial>();
 const cycleDomains=new Set<string>(),cycleDone=new Set<string>();
 // UX-SYNC-01: the shown progress never moves back within a cycle (two domains in flight, joining domains).
 let progressFloor=0;
 // Own-write invalidations seen in this tab; a walk that then notices the read revision move needs only its own recheck.
 let invalidations=0;
 const beginCycle=(targets:readonly string[]=domains)=>{if(targets.length===domains.length)armPoll();progressFloor=0;cycleDomains.clear();cycleDone.clear();fractions.clear();chunkCounts.clear();for(const domain of targets)cycleDomains.add(domain)};
 const valueIndexes=new Map<string,{base:string|null,values:Record<string,any>}>();
 const completed=new Set<string>(),failed=new Set<string>(),backoff=new Map<string,{attempts:number;next:number}>(),fractions=new Map<string,number>(),chunkCounts=new Map<string,number>(),changedRetries=new Map<string,number>(),mediaVersion=new Map<string,number>();
 const mediaKeys=(records:any)=>(records?.data?.payments??[]).filter((row:any)=>receiptRetainedOffline(row)).flatMap((row:any)=>[...(row.receiptReference?['manual']:[]),...(row.agentReceiptPresent?['agent']:[])].map(source=>{const path='/api/payment-records/'+encodeURIComponent(row.id)+'/receipt?source='+source;mediaVersion.set(path,Date.parse(source==='manual'?row.receiptAt:row.agentReceiptAt));return path}));
 // Stored receipts outside the current window (aged out, deleted payments, legacy
 // `preferred` alias copies) are removed; only one blob per receipt is kept.
 const pruneMedia=async()=>{const keep=new Set(media.map(path=>'blob:'+new URL(path,access.origin).href));for(const key of await repo.listDatasetMediaKeys())if(!keep.has(key))await repo.removeDatasetMedia(key)};
 // Cache availability and this sweep's completed work are independent.
 const progress=()=>{
  const discovered=!cycleDomains.has('records')||cycleDone.has('records');
  const images=discovered?(media.length?media.filter(path=>completed.has(path)).length/media.length:1):0;
  const core=cycleDomains.size?[...cycleDomains].reduce((sum,domain)=>sum+(cycleDone.has(domain)?1:fractions.get(domain)??0),0)/cycleDomains.size:1;
  const value=cycleDomains.has('records')||media.some(path=>!completed.has(path))?80*core+20*images:100*core;
  const complete=[...cycleDomains].every(domain=>cycleDone.has(domain))&&discovered&&media.every(path=>completed.has(path));
  progressFloor=Math.max(progressFloor,Math.max(0,Math.min(complete?100:99,value)));
  return complete?100:progressFloor;
 };
 // UX-HOLD-07: the banner, "Updated HH:MM" and readiness follow the data domains only. A receipt that
 // failed retries quietly in the background on the same back-off; it does not reopen preparation.
 const isMediaTask=(task:string)=>task.startsWith('/api/');
 const quietMedia=new Set<string>();
 const failedDomains=()=>domains.filter(domain=>failed.has(domain));
 const dataFlights=()=>[...active.keys()].filter(task=>!isMediaTask(task)).length;
 const domainRunning=()=>dataFlights()>0;
 // A chunked walk between two segments (its next segment queued with a kept partial) is still in flight for
 // refresh triggers: a poll or focus landing in that gap joins the cycle like one landing during a request.
 const walking=()=>domainRunning()||queue.some(task=>!isMediaTask(task)&&partials.has(task));
 const syncActive=()=>navigator.onLine&&!access.offlineOnly&&!paused&&document.visibilityState!=='hidden'&&(active.size>0||queue.length>0&&(activitySnapshot()===0||!!requestedDomain));
 const status=()=>publish(repo.scopeName,{state:domains.every(domain=>completed.has(domain))&&media.every(path=>completed.has(path)||quietMedia.has(path))?'ready':paused?'incomplete':queue.length||active.size?'preparing':'incomplete',completed:completed.size,total:domains.length+media.length,progress:progress(),syncActive:!!syncActive(),domainsPending:!paused&&(domainRunning()||queue.some(task=>!isMediaTask(task))),updating:domains.every(domain=>completed.has(domain))&&!!syncActive(),updateFailed:domains.every(domain=>completed.has(domain))&&failedDomains().length>0,failedDomains:failedDomains().join(','),lastChecked,foreground:requestedDomain!==null,fullSync:forceWalk.size>0,chunks:[...chunkCounts.values()].reduce((sum,count)=>sum+count,0)});
 const ready=(domain:string,changed:boolean)=>window.dispatchEvent(new CustomEvent('mw-offline-dataset-ready',{detail:{scopeName:repo.scopeName,domain,changed}}));
 const failedEvent=(domain:string)=>window.dispatchEvent(new CustomEvent('mw-offline-dataset-failed',{detail:{scopeName:repo.scopeName,domain}}));
 const stale=(domain:string)=>Date.now()-(domainChecked.get(domain)??0)>=DATASET_RECHECK_MIN_MS;
 // Back-off bookkeeping: a failed task is waiting until its next retry time.
 const waiting=(task:string)=>failed.has(task)&&(backoff.get(task)?.next??0)>Date.now();
 const succeeded=(task:string)=>{failed.delete(task);backoff.delete(task);quietMedia.delete(task)};
 const fail=(task:string)=>{failed.add(task);if(isMediaTask(task))quietMedia.add(task);const attempts=(backoff.get(task)?.attempts??0)+1;backoff.set(task,{attempts,next:Date.now()+DATASET_RETRY_BACKOFF_MS[Math.min(attempts,DATASET_RETRY_BACKOFF_MS.length)-1]})};
 const resetBackoff=()=>{backoff.clear();if(retryTimer){clearTimeout(retryTimer);retryTimer=undefined}};
 // One timer for the earliest due failed task; resume() then re-queues only the due ones.
 const retryLater=()=>{if(stopped||!navigator.onLine||paused||!failed.size)return;const due=Math.min(...[...failed].map(task=>backoff.get(task)?.next??0));if(retryTimer)clearTimeout(retryTimer);retryTimer=setTimeout(()=>{retryTimer=undefined;resume()},Math.max(0,due-Date.now()))};
 const enqueue=(task:string,first=false)=>{if(queue.includes(task))return;first?queue.unshift(task):queue.push(task)};
 // New work starts after a short settle delay; the next segment of a walk in progress starts at once (R078).
 const schedule=()=>{if(stopped||timer)return;timer=setTimeout(()=>{timer=undefined;void pump()},200)};
 const addMedia=()=>{if(domains.every(domain=>completed.has(domain)))for(const path of media)if(!completed.has(path)&&!failed.has(path))enqueue(path)};
 const forget=async(task:string)=>{partials.delete(task);await repo.discardDatasetProgress(task)};
 // The receipt window moves with time: recompute it whenever the records check completes.
 const refreshMedia=async(records:any)=>{const oldVersions=new Map(mediaVersion);mediaVersion.clear();media=mediaKeys(records);for(const path of media)if(oldVersions.get(path)!==mediaVersion.get(path)){completed.delete(path);succeeded(path)}await pruneMedia()};
 const giveUp=(task:string)=>{if(task===requestedDomain)failedEvent(task)};
 // R078 item 6: a bundle carrying an own write applied locally (own-write-apply.ts) is never confirmed by an
 // unchanged answer: its check walks, and the server's rows replace the local ones.
 const localPatch=(bundle:any)=>Array.isArray(bundle?.localPending)&&bundle.localPending.length>0;
 // Data domains whose unchanged check a records versions answer can stand in for.
 const versionPeer=(task:string)=>task==='collection'||task==='cash'||task==='management';
 // A queued peer domain whose stored complete bundle already has the reported source version needs no
 // request of its own: it is checked, unchanged (UX-REFRESH-02: the bundle is not rewritten).
 async function applyVersions(versions:any){
  if(!versions||typeof versions!=='object'||Array.isArray(versions))return;
  for(const domain of domains.filter(versionPeer)){
   const version=versions[domain];if(typeof version!=='string'||!/^[a-f0-9]{64}$/.test(version)||!queue.includes(domain)||active.has(domain)||partials.has(domain))continue;
   const [bundle,partial]=await Promise.all([repo.readDataset(domain),repo.readDatasetProgress(domain)]);
   if(stopped||!queue.includes(domain)||active.has(domain)||forceWalk.has(domain)||partial||!bundle?.complete||bundle.cacheStale||localPatch(bundle)||bundle.sourceVersion!==version)continue;
   queue=queue.filter(queued=>queued!==domain);completed.add(domain);cycleDone.add(domain);succeeded(domain);changedRetries.delete(domain);domainChecked.set(domain,Date.now());
   if(domain===requestedDomain)requestedDomain=null;
   ready(domain,false);
  }
 }
 async function initialize(){if(initializing)return;initializing=true;try{
  if(!await repo.syncAuthorized()){paused=true;status();return}
  beginCycle();
  for(const domain of domains){const [bundle,partial]=await Promise.all([repo.readDataset(domain),repo.readDatasetProgress(domain)]);if(stopped)return;
   // A reconciliation heal (needsWalk) survives a reload: the domain walks from the start, never a delta.
   if(bundle?.complete&&bundle.needsWalk===true)forceWalk.add(domain);
   if(bundle?.complete){completed.add(domain);if(domain==='records'){mediaVersion.clear();media=mediaKeys(bundle);await pruneMedia()}}
   if(partial&&bundle?.complete&&partial.protocolVersion!==3)await repo.discardDatasetProgress(domain);
   if(partial?.chunks)chunkCounts.set(domain,partial.chunks);
   if(partial?.progress?.total>0)fractions.set(domain,Math.min(.99,partial.progress.completed/partial.progress.total));
   if(navigator.onLine&&!access.offlineOnly){enqueue(domain)}
  }
  for(const path of media){const saved=await repo.readDatasetMedia('blob:'+new URL(path,access.origin).href);if(stopped)return;if(saved&&saved.savedAt>=(mediaVersion.get(path)??Infinity))completed.add(path)}
  initialized=true;paused=!navigator.onLine||!!access.offlineOnly;addMedia();status();schedule();
 }catch{paused=true;status()}finally{initializing=false}}
 // Picks the next task that may start now, or nothing. Data domains come first (two at a time); a
 // receipt never delays them. While the user is busy (a live read in flight) or the app is hidden,
 // only a domain a screen is waiting on runs.
 const pick=():string|undefined=>{
  const free=(task:string)=>!active.has(task)&&!(versionsPending&&versionPeer(task)&&task!==requestedDomain);
  if(activitySnapshot()>0||document.visibilityState==='hidden'){
   const index=requestedDomain?queue.indexOf(requestedDomain):-1;
   return index>=0&&free(requestedDomain!)&&dataFlights()<DATASET_DATA_FLIGHTS?queue.splice(index,1)[0]:undefined;
  }
  const index=queue.findIndex(task=>!isMediaTask(task)&&free(task));
  if(index>=0)return dataFlights()<DATASET_DATA_FLIGHTS?queue.splice(index,1)[0]:undefined;
  if(active.size||queue.some(task=>!isMediaTask(task)))return undefined;
  return queue.shift();
 };
 async function pump(){
  if(stopped)return;
  if(!initialized){await initialize();return}
  if(!navigator.onLine||access.offlineOnly){paused=true;status();return}
  if((activitySnapshot()>0||document.visibilityState==='hidden')&&!requestedDomain){status();return;}
  addMedia();if(!queue.length){status();return}
  if(!await repo.syncAuthorized()){paused=true;if(requestedDomain&&!active.has(requestedDomain))failedEvent(requestedDomain);status();return}if(stopped)return;paused=false;
  // Picking is synchronous: overlapping pumps never start the same task twice or exceed the limits.
  for(let task=pick();task!==undefined;task=pick())void run(task);
  status();
 }
 async function run(task:string){
  const isMedia=isMediaTask(task),flight=new AbortController();active.set(task,flight);
  // A starting records check also asks for the other domains' versions (applyVersions).
  const forced=forceWalk.has(task);
  let ownsVersions=false;if(task==='records'&&!forced&&!versionsPending&&queue.some(queued=>versionPeer(queued)&&!active.has(queued))){versionsPending=true;ownsVersions=true}
  const releaseVersions=()=>{if(!ownsVersions)return;ownsVersions=false;versionsPending=false;if(!stopped)void pump()};
  status();
  let timeout=setTimeout(()=>flight.abort(),REQUEST_TIMEOUT_MS);
  let softGiveUp=false,continued=false;
  try{
   let revision=await repo.readRevision();if(revision===null||stopped)throw Error();
   // A read revision bump (own settled write) between or during chunks re-pins
   // the partial to the current revision and schedules one trailing recheck;
   // it never restarts the walk.
   // A bump with no invalidation event in this tab (another tab's write) rechecks every confirm domain.
   const seenInvalidations=invalidations,revisionMoved=()=>{if(invalidations!==seenInvalidations)recheckDomains.add(task);else recheck=true};
   const refreshRevision=async()=>{const current=await repo.readRevision();if(current===null||stopped)throw Error();if(current!==revision){revision=current;revisionMoved()}};
   const memo=isMedia?undefined:partials.get(task);
   const partial=isMedia?null:memo?memo.partial:await repo.readDatasetProgress(task);
   let bundle=isMedia?null:memo?memo.bundle:await repo.readDataset(task);
   // Cursor of the durable progress row (the commit below expects it), not of the in-memory partial.
   const durable:string|null=memo?memo.saved:partial?.nextCursor??null;
   const base=partial?.base??datasetBase(bundle),delta=!!bundle?.complete;
   if(partial&&(partial.base??null)!==datasetBase(bundle)){await forget(task);enqueue(task);return}
   // A full sync restarts a walk that began before it (that walk may have started as a delta or a check).
   if(forced&&partial&&!partial.forced){await forget(task);enqueue(task,true);continued=true;return}
   const path=isMedia?task:task==='notifications'?'/api/notifications/offline-dataset':'/api/offline-dataset?domain='+task,url=new URL(path,access.origin);if(!isMedia){url.searchParams.set('protocol',delta?'3':'2');if(!delta&&partial?.nextCursor)url.searchParams.set('cursor',partial.nextCursor);}
   if(isMedia){const saved=await repo.readDatasetMedia('blob:'+url.href);if(saved&&saved.savedAt>=(mediaVersion.get(task)??Infinity)){completed.add(task);succeeded(task);return}}
   const level=pathLevels.get(url.pathname)??3,askVersions=ownsVersions&&delta&&!partial&&level>=2;
   // R078 protocol v4: a complete records bundle asks for the records changed since its change cursor.
   const since=task==='records'&&delta&&!partial&&!forced&&level>=3&&!walkNext.has(task)&&validChangeCursor(bundle?.changes)?bundle.changes:null;
   if(!askVersions)releaseVersions();
   const token=await access.token();if(stopped||flight.signal.aborted)throw Error();
   const fetchSegment=(need:string[]=[])=>fetch(url,{method:delta?'POST':'GET',...(!delta?{}:{body:JSON.stringify({cursor:partial?.nextCursor??null,need,sourceVersion:forced||localPatch(bundle)?null:bundle?.sourceVersion??null,...(level>=1?{acceptChanged:true}:{}),...(askVersions&&!need.length?{versions:true}:{}),...(since?{since}:{})})}),signal:flight.signal,headers:{Authorization:'Bearer '+token,...(!delta?{}:{'Content-Type':'application/json'})},credentials:'omit',cache:'no-store',redirect:'error'});
   // Legacy 409: the final chunk is lost, so the walk restarts once; a repeat is
   // not a failure (saved data stays available, the next check walks again).
   const changedOnServer=async()=>{await forget(task);fractions.delete(task);chunkCounts.delete(task);const retries=changedRetries.get(task)??0;if(retries<1){changedRetries.set(task,retries+1);enqueue(task);return}softGiveUp=true;cycleDone.add(task);if(bundle?.complete)ready(task,false);else giveUp(task)};
   let response=await fetchSegment();
   if(response.status===401||response.status===403){access.authFailure(response.status);paused=true;throw Error()}
   if(response.status===400&&delta&&level>0){const error=await response.json().catch(()=>({}));if(error?.code==='invalid_request'){pathLevels.set(url.pathname,since?2:askVersions?1:0);enqueue(task,true);continued=true;return}throw Error()}
   if(response.status===409&&!isMedia){const error=await response.json().catch(()=>({}));if(error?.code==='dataset_changed'){await changedOnServer();return}throw Error()}
   if(!response.ok)throw Error();let value=isMedia?await response.blob():await response.json();
   if(stopped||flight.signal.aborted||!await repo.syncAuthorized())throw Error();
   await refreshRevision();
   if(askVersions){try{if(value?.schemaVersion===3)await applyVersions(value.versions)}catch{/* The peers then check on their own. */}releaseVersions()}
   let full=value;
   // schemaVersion 4: a records delta since the bundle's change cursor (complete, applied onto the bundle).
   const v4=!isMedia&&value.schemaVersion===4&&value.delta===true&&!!since;
   if(!isMedia&&(value.schemaVersion===3||v4)){
    if(value.unchanged){
     if(value.domain!==task||!value.complete||value.nextCursor!==null||!bundle?.complete||partial||value.sourceVersion!==bundle.sourceVersion)throw Error('Invalid unchanged checkpoint');
     // UX-REFRESH-02: a current bundle is not rewritten; only the check time is recorded.
     // A bundle without a change cursor takes the one of this check once (protocol v4 starts from it).
     const cursor=!bundle.changes&&validChangeCursor(value.changes)?{changes:value.changes}:null;
     if((bundle.cacheStale||cursor)&&!await repo.saveDataset(task,{...bundle,cacheStale:false,...cursor},revision,null,base,!!bundle.cacheStale))throw Error('Dataset changed during check');
     completed.add(task);cycleDone.add(task);succeeded(task);changedRetries.delete(task);domainChecked.set(task,Date.now());if(forced)forceWalk.delete(task);
     if(task==='records')await refreshMedia(bundle);
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
     // Content re-requests are extra round trips, each with its own timeout. The
     // server caps one need list at NEED_BATCH hashes; batch as defence in depth.
     for(let offset=0;offset<missing.length;offset+=NEED_BATCH){
      clearTimeout(timeout);timeout=setTimeout(()=>flight.abort(),REQUEST_TIMEOUT_MS);
      response=await fetchSegment(missing.slice(offset,offset+NEED_BATCH));
      if(response.status===401||response.status===403){access.authFailure(response.status);paused=true;throw Error()}
      if(response.status===409){await changedOnServer();return}
      if(!response.ok)throw Error();const batch=await response.json();
      if(partial&&batch.generation!==generation||JSON.stringify(batch.patches)!==manifest)throw Error('Delta manifest changed');
      for(const [hash,item] of Object.entries(batch.values??{})){if(await valueHash(item)!==hash)throw Error('Invalid delta content');values[hash]=item}
      value=batch;
     }
    }
    if(stopped||flight.signal.aborted||!await repo.syncAuthorized())throw Error('Stale delta response');
    await refreshRevision();
    const contentValues:Record<string,any>={...(v4?bundle.contentValues:partial?.contentValues)};
    const patches=value.patches.map((patch:any)=>{
     if(!Array.isArray(patch.refs)||patch.refs.some((ref:string)=>!(ref in values))||patch.mode!=='append'&&patch.mode!=='upsert'&&patch.refs.length!==1)throw Error('Missing delta content');
     for(const ref of patch.refs)contentValues[ref]=values[ref];
     return {...patch,value:patch.mode==='append'||patch.mode==='upsert'?patch.refs.map((ref:string)=>hydrateValue(values[ref],value.asOf)):hydrateValue(values[patch.refs[0]],value.asOf)};
    });
    value={...value,patches,contentValues};
   }else if(!isMedia&&(delta||value.schemaVersion!==2))throw Error('Unsupported dataset protocol');
   // R064 torn commit: the server finished the walk but its source changed under
   // it. Keep the bundle without a source version and recheck (bounded).
   const torn=!isMedia&&value.complete===true&&value.changed===true;
   if(!isMedia){
    if(value.domain!==task||typeof value.generation!=='string'||!Array.isArray(value.patches)||typeof value.complete!=='boolean'||value.complete!==(value.nextCursor===null)||partial&&partial.generation!==value.generation)throw Error('Invalid dataset segment');
    // The memoized partial was already handed to IndexedDB by value, or was never
    // stored; mutating it in place is safe. A durable partial read back is cloned once.
    if(v4&&(!value.complete||value.nextCursor!==null||!validChangeCursor(value.changes)||value.sourceVersion!==null&&typeof value.sourceVersion!=='string'))throw Error('Invalid dataset delta');
    // A delta that moved a row to another owner cannot be applied (the old owner's rows are not re-read): walk.
    if(v4&&deltaMovesRows(bundle.data,value.patches)){walkNext.add(task);enqueue(task,true);continued=true;return}
    const data=v4?structuredClone(bundle.data):memo?partial?.data??{}:structuredClone(partial?.data??{});
    for(const patch of value.patches)applyDatasetPatch(data,patch);
    full={schemaVersion:1,...(forced&&(!partial||partial.forced)?{forced:true}:{}),...(v4||value.changes||partial?.changes?{changes:v4?value.changes:partial?.changes??(validChangeCursor(value.changes)?value.changes:null)}:{}),protocolVersion:value.schemaVersion,base,sourceVersion:torn?null:value.sourceVersion,contentValues:value.contentValues,domain:task,businessDate:value.businessDate,asOf:value.asOf,startedAt:partial?.startedAt??value.startedAt??value.asOf,generation:value.generation,complete:value.complete,data,chunks:(partial?.chunks??0)+1,nextCursor:value.nextCursor,progress:value.progress};
    // An own write applied locally (item 6) is settled once no locally patched row remains; otherwise the
    // next check walks (no change cursor, no source version) so the server's rows replace every local one.
    if(v4&&localPatch(bundle)){if(hasLocalRows(full.data))Object.assign(full,{localPending:bundle.localPending,changes:null,sourceVersion:null})}
    if(value.complete)delete full.forced;
    if(!value.complete){
     if(!value.nextCursor||value.nextCursor===partial?.nextCursor)throw Error();
     // R078: persist the first chunk of a walk (a resume point), then every few chunks, and before a pause.
     const unsaved=(memo?.unsaved??0)+1,save=durable===null||unsaved>=DATASET_PROGRESS_SAVE_CHUNKS||document.visibilityState==='hidden'||!navigator.onLine;
     if(save&&!await repo.saveDatasetProgress(task,full,revision,durable))throw Error();
     partials.set(task,save?{partial:full,bundle,saved:full.nextCursor,unsaved:0,revision}:{partial:full,bundle,saved:durable,unsaved,revision});
     chunkCounts.set(task,full.chunks);if(value.progress?.total>0)fractions.set(task,Math.min(.99,value.progress.completed/value.progress.total));
     // The next segment of a walk in progress goes first and starts without the settle delay.
     enqueue(task,true);continued=true;return;
    }
    // Commit against the durable bundle, not a memoized copy of it.
    if(memo){bundle=await repo.readDataset(task);if((partial.base??null)!==datasetBase(bundle))throw Error('Dataset base changed')}
   }
   const dataChanged=!isMedia&&JSON.stringify(canonicalValue(bundle?.data))!==JSON.stringify(canonicalValue(full.data));
   // UX-REFRESH-02: a single-chunk check that changed nothing (notifications has no source
   // watermark and re-sends its content each time) keeps the stored bundle as it is.
   const keep=!isMedia&&!v4&&!dataChanged&&!torn&&!partial&&!!bundle?.complete&&!bundle.cacheStale&&full.sourceVersion===bundle.sourceVersion&&full.businessDate===bundle.businessDate;
   const saved=isMedia?await repo.saveDatasetMedia('blob:'+url.href,value,revision):keep||await repo.saveDataset(task,full,revision,durable,base,dataChanged||!!bundle?.cacheStale);if(!saved)throw Error();partials.delete(task);if(!isMedia&&full.chunks)chunkCounts.set(task,full.chunks);
   if(stopped)return;completed.add(task);cycleDone.add(task);queue=queue.filter(queued=>queued!==task);succeeded(task);if(!v4)walkNext.delete(task);if(forced)forceWalk.delete(task);if(task==='records')await refreshMedia(full);
   if(!isMedia){
    domainChecked.set(task,Date.now());
    if(torn){const retries=changedRetries.get(task)??0;if(retries<2){changedRetries.set(task,retries+1);recheckDomains.add(task)}}else changedRetries.delete(task);
    ready(task,dataChanged);
   }
  }catch{if(!stopped){
   // Keep the chunks this walk applied in memory: a failed segment resumes after them.
   const kept=partials.get(task);partials.delete(task);
   if(kept?.unsaved){try{const current=await repo.readRevision();if(current!==null&&await repo.saveDatasetProgress(task,kept.partial,current,kept.saved)&&current!==kept.revision)recheckDomains.add(task)}catch{/* The durable row stays at its earlier cursor. */}}
   if(!navigator.onLine||flight.signal.aborted&&flight.signal.reason==='offline'){enqueue(task);paused=!navigator.onLine||!!access.offlineOnly}else{fail(task);if(!isMedia)giveUp(task)}}}finally{
   clearTimeout(timeout);if(active.get(task)===flight)active.delete(task);releaseVersions();
   // A full sync requested while this check ran walks the domain next; a forced walk that failed ends its part of the full sync.
   if(!stopped&&forceWalk.has(task)){if(forced&&failed.has(task))forceWalk.delete(task);else if(!forced&&!queue.includes(task)&&!failed.has(task))enqueue(task,true)}if(!queue.includes(task)||failed.has(task)||softGiveUp){if(task===requestedDomain)requestedDomain=null}
   if(!stopped){
    addMedia();const dataBusy=domainRunning();
    if(!queue.length&&!dataBusy&&(recheck||recheckDomains.size)){const targets=recheck?[...new Set([...DATASET_CONFIRM_DOMAINS,...recheckDomains])]:[...recheckDomains];recheck=false;recheckDomains.clear();beginCycle(targets);for(const domain of targets)enqueue(domain)}
    if(!isMedia&&!dataBusy&&!queue.some(queued=>!isMediaTask(queued))&&!failedDomains().length&&domains.every(domain=>completed.has(domain)))lastChecked=Date.now();
    status();if(queue.length&&!paused){if(continued)void pump();else schedule()}else if(failed.size)retryLater();else if(!active.size)void maybeReconcile()
   }
  }
 }
 const request=(event?:Event)=>{if(stopped)return;const detail=(event as CustomEvent|undefined)?.detail;const priority=domains.includes(detail?.domain)?detail.domain:undefined;
  // A background prepare (a page served from the local bundle) is throttled like focus and
  // waits for a failed domain's back-off; an explicit request retries failed work at once.
  const background=!!detail?.background;
  if(background&&priority&&(waiting(priority)||completed.has(priority)&&!failed.has(priority)&&!stale(priority)))return;
  if(!background&&retryTimer){clearTimeout(retryTimer);retryTimer=undefined;}
  if(detail?.foreground)requestedDomain=priority;
  // UX-FULL: every domain walks from the start (detail.full, with detail.all for the header progress); stored
  // receipts are re-checked against their receipt time and only missing or outdated ones are downloaded.
  if(event?.type==='mw-offline-prepare'&&detail?.full&&!priority){for(const domain of domains)forceWalk.add(domain);for(const path of media)completed.delete(path);failed.clear()}
  // R078 item 6: an own write is confirmed by checking the domains it touches (DATASET_CONFIRM_DOMAINS), not a
  // full cycle; management follows on the regular poll. A domain already walking is confirmed after its walk.
  if(event?.type==='mw-read-invalidated'){
   failed.clear();invalidations++;
   if(!active.size&&!queue.length){beginCycle(DATASET_CONFIRM_DOMAINS);for(const domain of DATASET_CONFIRM_DOMAINS)enqueue(domain)}
   else for(const domain of DATASET_CONFIRM_DOMAINS){if(active.has(domain)||partials.has(domain))recheckDomains.add(domain);else if(!queue.includes(domain)){cycleDomains.add(domain);cycleDone.delete(domain);fractions.delete(domain);enqueue(domain)}}
  }
  else{
   // A receipt still downloading or retrying does not block a sync of the data domains (pump takes them first).
   if(!domainRunning()&&!queue.some(task=>!isMediaTask(task))&&event?.type==='mw-offline-prepare'&&!failedDomains().length){beginCycle(priority?[priority]:domains);for(const domain of cycleDomains)enqueue(domain)}
   // A manual sync of everything (header refresh: detail.all) also checks the domains that did not fail; a domain already
   // queued or in flight is joined rather than fetched twice. A plain mw-offline-prepare (read-cache background prepare) still retries only failed work.
   else if(detail?.all&&!priority&&event?.type==='mw-offline-prepare'){const targets=domains.filter(domain=>!active.has(domain)&&!queue.includes(domain));if(targets.length){if(domainRunning()||queue.some(task=>!isMediaTask(task)))for(const domain of targets){cycleDomains.add(domain);cycleDone.delete(domain);fractions.delete(domain);enqueue(domain)}else{beginCycle(targets);for(const domain of targets)enqueue(domain)}}}
   for(const task of [...failed])if(!background||!waiting(task)){failed.delete(task);enqueue(task)}
  }
  if(priority){cycleDomains.add(priority);cycleDone.delete(priority);fractions.delete(priority);queue=queue.filter(task=>task!==priority);enqueue(priority,true)}
  changedRetries.clear();paused=false;status();schedule();
 };
 // force: refresh every domain regardless of age (focus, visible-again, poll). A cycle already
 // queued or in flight absorbs the trigger, so focus+visibilitychange (+online) in one burst
 // start one cycle and never a second concurrent fetch. Hidden, offline or offline-only: no-op.
 // A failed domain still in its back-off is left out of the cycle; the other domains refresh.
 // Work queued while hidden (a due retry) is joined by the rest rather than replacing the refresh;
 // a receipt downloading or queued never delays the data domains.
 const check=(force=false)=>{if(stopped||document.visibilityState==='hidden'||!navigator.onLine||access.offlineOnly)return;if(!walking()){const targets=(force?[...domains]:domains.filter(stale)).filter(domain=>!waiting(domain)&&!queue.includes(domain));if(targets.length){if(queue.some(task=>!isMediaTask(task)))for(const domain of targets){cycleDomains.add(domain);cycleDone.delete(domain);fractions.delete(domain);enqueue(domain)}else{beginCycle(targets);for(const domain of targets)enqueue(domain)}}}resume()};
 // A real return to the app (focus, visible again) or reconnecting resets every back-off.
 const focused=()=>{resetBackoff();check(true)},online=()=>{resetBackoff();check()};
 const visible=()=>{if(document.visibilityState!=='hidden'){resetBackoff();check(true)}status()};
 // APP-OFFLINE-03: background poll every 30 seconds while visible and online; every focus,
 // visible-again and own-write invalidation (mw-read-invalidated) also refresh. Any full cycle
 // re-arms the poll, so a focus refresh is not followed by a redundant poll moments later.
 function armPoll(){if(pollTimer)clearTimeout(pollTimer);if(!stopped)pollTimer=setTimeout(()=>{pollTimer=undefined;check(true);if(!pollTimer)armPoll()},DATASET_POLL_MS)}
 armPoll();
 // Re-queues failed work whose back-off has passed (a successful live read, own queued
 // command and the poll land here) and arms the timer for the rest.
 const resume=()=>{if(stopped)return;for(const task of [...failed])if(!waiting(task)){failed.delete(task);enqueue(task)}for(const domain of domains)if(!completed.has(domain)&&!active.has(domain)&&!waiting(domain))enqueue(domain);paused=false;status();schedule();retryLater()};
 // R078 reconciliation. Runs only when the normal checks are idle, without progress UI, one domain at a time:
 // the server walks the domain in one snapshot and compares its digests with the stored bundle's. A mismatch is
 // logged ('reconcile-mismatch', key names only) and heals: the bundle loses its source version and the domain
 // takes the Full sync path. Receipts are checked locally (present, non-empty, saved at or after their receipt time).
 let reconciling=false,reconcileAgain=false,reconcileUnsupported=false;
 const reconcileIdle=()=>!stopped&&initialized&&!paused&&navigator.onLine&&!access.offlineOnly&&document.visibilityState!=='hidden'&&activitySnapshot()===0&&!active.size&&!queue.length&&!failed.size&&!forceWalk.size&&domains.every(domain=>completed.has(domain));
 // 'failed': the server could not answer (holds the next pass back); 'skipped': a local reason (no server cost).
 // A domain healed once in a slot is not walked again in that slot when it still differs (no walk loop).
 const healedSlot=new Map<string,number>();
 async function reconcileDomain(domain:string,slot:number):Promise<'match'|'mismatch'|'other'|'skipped'|'failed'>{
  const [bundle,partial]=await Promise.all([repo.readDataset(domain),repo.readDatasetProgress(domain)]);
  if(!bundle?.complete||partial||partials.has(domain)||active.has(domain)||queue.includes(domain)||localPatch(bundle)||hasLocalRows(bundle.data)||typeof bundle.sourceVersion!=='string')return 'skipped';
  const [revision,cacheRevision]=[await repo.readRevision(),await repo.readCacheRevision()];if(revision===null)return 'skipped';
  const digests=await datasetDigests(bundle.data,sha256Hex),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),RECONCILE_TIMEOUT_MS);
  let value:any;
  try{
   const response=await fetch(new URL('/api/offline-dataset?domain='+domain+'&protocol=3',access.origin),{method:'POST',body:JSON.stringify({reconcile:true,sourceVersion:bundle.sourceVersion,digests}),headers:{Authorization:'Bearer '+await access.token(),'Content-Type':'application/json'},signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});
   if(response.status===400){reconcileUnsupported=true;return 'skipped'}
   if(response.status===401||response.status===403){access.authFailure(response.status);return 'failed'}
   if(!response.ok)return 'failed';value=await response.json();
  }catch{return stopped?'skipped':'failed'}finally{clearTimeout(timer)}
  if(stopped)return 'skipped';
  if(value?.reconcile!==true||value.domain!==domain)return 'failed';
  // The stored data must still be the data that was digested.
  if(await repo.readRevision()!==revision||await repo.readCacheRevision()!==cacheRevision||datasetBase(await repo.readDataset(domain))!==datasetBase(bundle))return 'skipped';
  if(value.result==='match'){recordClientEvent({kind:'reconcile-match',code:domain});return 'match'}
  if(value.result!=='mismatch')return value.result==='stale'||value.result==='changed'?'other':'failed';
  const keys=(Array.isArray(value.keys)?value.keys:[]).filter((key:unknown)=>typeof key==='string'&&/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(key));
  recordClientEvent({kind:'reconcile-mismatch',code:domain,message:keys.join(',')});
  if(healedSlot.get(domain)===slot)return 'other';healedSlot.set(domain,slot);
  // The heal is durable: no source version, no change cursor (a v4 delta would patch the corrupted rows) and a
  // needsWalk marker that forces the walk again after a reload; the walk's commit writes a bundle without it.
  const {cacheStale:_stale,changes:_changes,...stored}=bundle;
  if(!await repo.saveDataset(domain,{...stored,sourceVersion:null,needsWalk:true},revision,null,datasetBase(bundle),false))return 'skipped';
  forceWalk.add(domain);if(!active.size&&!queue.length)beginCycle([domain]);else{cycleDomains.add(domain);cycleDone.delete(domain);fractions.delete(domain)}enqueue(domain);status();schedule();
  return 'mismatch';
 }
 async function checkReceipts(){
  for(const path of media){const saved=await repo.readDatasetMedia('blob:'+new URL(path,access.origin).href).catch(()=>null);const version=mediaVersion.get(path)??Number.POSITIVE_INFINITY;
   if(!(saved?.data instanceof Blob)||saved.data.size<=0||!(saved.savedAt>=version)){completed.delete(path);succeeded(path)}}
  addMedia();status();schedule();
 }
 async function maybeReconcile(){
  // An idle moment while a pass runs (a healed domain finished its walk) is taken once that pass ends.
  if(reconciling){reconcileAgain=true;return}
  if(reconcileUnsupported||!reconcileIdle())return;reconciling=true;reconcileAgain=false;
  try{
   const last=await repo.readReconciledAt(),now=Date.now();
   // A first complete download is itself a fresh walk: it starts the 12-hour clock.
   if(last===null){await repo.saveReconciledAt(now);return}
   if(!reconcileDue(now,last))return;
   // A pass that failed waits RECONCILE_RETRY_MS; the domains it finished in the same slot are not asked again.
   const stored=await repo.readReconcileAttempt(),slot=reconcileSlot(now),attempt=stored&&stored.at<=now&&stored.slot===slot?stored:null;
   if(reconcileBackingOff(now,attempt))return;
   const done=new Set(attempt?.done??[]);let complete=true,failedPass=false;
   for(const domain of DATASET_RECONCILE_DOMAINS){if(done.has(domain))continue;if(!reconcileIdle()){complete=false;break}
    const result=await reconcileDomain(domain,slot);if(result==='skipped'){complete=false;continue}if(result==='failed'){complete=false;failedPass=true;break}
    // A healed domain is checked again once its walk commits (the pass resumes at the next idle moment).
    if(result==='mismatch')complete=false;else done.add(domain)}
   await checkReceipts();
   if(complete){await repo.saveReconciledAt(Date.now());await repo.saveReconcileAttempt(null)}
   else if(failedPass)await repo.saveReconcileAttempt({at:Date.now(),slot,done:[...done]});
   else if(done.size)await repo.saveReconcileAttempt({at:attempt?.at??0,slot,done:[...done]});
  }catch{/* The next idle moment tries again. */}finally{reconciling=false;if(reconcileAgain){reconcileAgain=false;setTimeout(()=>void maybeReconcile(),0)}}
 }
 const offline=()=>{paused=true;for(const flight of active.values())flight.abort('offline');status()};
 const unsubscribe=subscribeActivity(()=>{status();if(activitySnapshot()===0)schedule()});
 window.addEventListener('mw-offline-queued',resume);window.addEventListener('online',online);window.addEventListener('offline',offline);window.addEventListener('focus',focused);document.addEventListener('visibilitychange',visible);window.addEventListener('mw-read-invalidated',request);window.addEventListener('mw-offline-prepare',request);
 void initialize();
 return()=>{stopped=true;if(timer)clearTimeout(timer);if(retryTimer)clearTimeout(retryTimer);for(const flight of active.values())flight.abort();unsubscribe();window.removeEventListener('mw-offline-queued',resume);window.removeEventListener('online',online);window.removeEventListener('offline',offline);window.removeEventListener('focus',focused);document.removeEventListener('visibilitychange',visible);if(pollTimer)clearTimeout(pollTimer);window.removeEventListener('mw-read-invalidated',request);window.removeEventListener('mw-offline-prepare',request);states.delete(repo.scopeName);listeners.forEach(listener=>{listener()})};
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
