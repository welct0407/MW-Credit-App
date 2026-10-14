import {activitySnapshot,subscribeActivity} from './request-activity';
import type {OwnerOfflineRepository} from './owner-offline';

type Access={origin:string;offline?:OwnerOfflineRepository;offlineOnly?:boolean;token:()=>Promise<string>;authFailure:(status:number)=>void};
const domains=['records','collection','cash','management','notifications'] as const;
export type OfflinePreparation={state:'idle'|'preparing'|'ready'|'incomplete';completed:number;total:number;progress:number;chunks:number};
const idle:OfflinePreparation={state:'idle',completed:0,total:domains.length,progress:0,chunks:0};
const states=new Map<string,OfflinePreparation>(),listeners=new Set<()=>void>();
export const getOfflinePreparation=(scopeName?:string)=>scopeName?states.get(scopeName)??idle:idle;
export const subscribeOfflinePreparation=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};
function publish(scope:string,value:OfflinePreparation){states.set(scope,value);listeners.forEach(listener=>listener())}

/** One bounded request at a time. Foreground navigation pauses the next chunk;
 * it does not throw away a request which the server is already processing. */
export function startOfflinePreparation(access:Access,_options:{readOrigin?:string}={}){
 const repository=access.offline;if(!repository||repository.environment==='prod')return()=>{};const repo=repository;
 let stopped=false,running=false,initialized=false,initializing=false,queue:string[]=[],media:string[]=[],requestedDomain:string|null=null,paused=false,timer:ReturnType<typeof setTimeout>|undefined,retryTimer:ReturnType<typeof setTimeout>|undefined,retryAttempts=0,controller:AbortController|null=null,activeTask:string|null=null;
 const completed=new Set<string>(),failed=new Set<string>(),fractions=new Map<string,number>(),chunkCounts=new Map<string,number>(),changedRetries=new Map<string,number>(),mediaVersion=new Map<string,number>(),preferred=new Set<string>();
 const mediaKeys=(records:any)=>(records?.data?.payments??[]).flatMap((row:any)=>[...(row.receiptReference?['manual']:[]),...(row.agentReceiptPresent?['agent']:[])].map(source=>{const path='/api/payment-records/'+encodeURIComponent(row.id)+'/receipt?source='+source;mediaVersion.set(path,Date.parse(source==='manual'?row.receiptAt:row.agentReceiptAt));if(source===(row.receiptReference?'manual':'agent'))preferred.add(path);return path}));
 const progress=()=>{const core=domains.reduce((sum,domain)=>sum+(completed.has(domain)?1:fractions.get(domain)??0),0),images=media.filter(path=>completed.has(path)).length;return core===domains.length?(media.length?80+20*images/media.length:100):80*core/domains.length};
 const status=()=>publish(repo.scopeName,{state:paused?'incomplete':queue.length||running?'preparing':!failed.size&&domains.every(domain=>completed.has(domain))&&media.every(path=>completed.has(path))?'ready':'incomplete',completed:completed.size,total:domains.length+media.length,progress:progress(),chunks:[...chunkCounts.values()].reduce((sum,count)=>sum+count,0)});
 const retryLater=()=>{if(stopped||retryTimer||retryAttempts>=3||!navigator.onLine||paused)return;const delay=[5000,15000,30000][retryAttempts++];retryTimer=setTimeout(()=>{retryTimer=undefined;resume()},delay)};
 const enqueue=(task:string,first=false)=>{if(queue.includes(task))return;first?queue.unshift(task):queue.push(task)};
 const schedule=()=>{if(stopped||timer)return;timer=setTimeout(()=>{timer=undefined;void pump()},200)};
 const addMedia=()=>{if(domains.every(domain=>completed.has(domain)))for(const path of media)if(!completed.has(path)&&!failed.has(path))enqueue(path)};
 async function initialize(){if(initializing)return;initializing=true;try{
  if(!await repo.syncAuthorized()){paused=true;status();return}
  for(const domain of domains){const [bundle,partial]=await Promise.all([repo.readDataset(domain),repo.readDatasetProgress(domain)]);if(stopped)return;
   if(bundle?.complete){completed.add(domain);if(domain==='records')media=mediaKeys(bundle)}
   if(partial?.chunks)chunkCounts.set(domain,partial.chunks);
   if(partial?.progress?.total>0)fractions.set(domain,Math.min(.99,partial.progress.completed/partial.progress.total));
   if(navigator.onLine&&!access.offlineOnly&&(partial||!bundle||bundle.cacheStale||Date.now()-Date.parse(bundle.asOf)>300000)){completed.delete(domain);enqueue(domain)}
  }
  for(const path of media){const saved=await repo.readDatasetMedia('blob:'+new URL(path,access.origin).href);if(stopped)return;if(saved&&saved.savedAt>=(mediaVersion.get(path)??Infinity))completed.add(path)}
  initialized=true;paused=!navigator.onLine||!!access.offlineOnly;addMedia();if(paused&&completed.size>=domains.length+media.length)paused=false;status();schedule();
 }catch{paused=true;status()}finally{initializing=false}}
 async function pump(){
  if(stopped||running)return;
  if(!initialized){await initialize();return}
  if(!navigator.onLine||access.offlineOnly){paused=completed.size<domains.length+media.length;status();return}
  if(activitySnapshot()>0&&!requestedDomain)return;
  if(!await repo.syncAuthorized()){paused=true;status();return}if(stopped||running)return;paused=false;
  addMedia();if(!queue.length){status();return}
  const task=queue.shift()!,isMedia=task.startsWith('/api/');running=true;activeTask=task;controller=new AbortController();const flight=controller;status();
  const timeout=setTimeout(()=>flight.abort(),25000);
  try{
   const revision=await repo.readRevision();if(revision===null||stopped)throw Error();
   const partial=isMedia?null:await repo.readDatasetProgress(task);
   const path=isMedia?task:task==='notifications'?'/api/notifications/offline-dataset':'/api/offline-dataset?domain='+task,url=new URL(path,access.origin);if(!isMedia)url.searchParams.set('protocol','2');if(partial?.nextCursor)url.searchParams.set('cursor',partial.nextCursor);
   if(isMedia){const saved=await repo.readDatasetMedia('blob:'+url.href);if(saved&&saved.savedAt>=(mediaVersion.get(task)??Infinity)){if(preferred.has(task)){const alias=new URL(url);alias.searchParams.set('source','preferred');if(!await repo.saveDatasetMedia('blob:'+alias.href,saved.data,revision))throw Error()}completed.add(task);return}}
   const token=await access.token();if(stopped||flight.signal.aborted)throw Error();
   const response=await fetch(url,{signal:flight.signal,headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',redirect:'error'});
   if(response.status===401||response.status===403){access.authFailure(response.status);paused=true;throw Error()}
   if(response.status===409&&!isMedia){const error=await response.json();if(error.code==='dataset_changed'){await repo.discardDatasetProgress(task);fractions.delete(task);chunkCounts.delete(task);const retries=changedRetries.get(task)??0;if(retries<1){changedRetries.set(task,retries+1);enqueue(task);return}}throw Error()}
   if(!response.ok)throw Error();const value=isMedia?await response.blob():await response.json();
   if(stopped||flight.signal.aborted||!await repo.syncAuthorized())throw Error();
   if(await repo.readRevision()!==revision){if(!isMedia){await repo.discardDatasetProgress(task);fractions.delete(task)}enqueue(task);return}
   let full=value;
   if(!isMedia&&value.schemaVersion===2){
    if(value.domain!==task||typeof value.generation!=='string'||!Array.isArray(value.patches)||typeof value.complete!=='boolean'||value.complete!==(value.nextCursor===null)||partial&&partial.generation!==value.generation)throw Error('Invalid dataset segment');
    const data=structuredClone(partial?.data??{});
    for(const patch of value.patches){const path=[patch?.key,...(patch?.path??[])];if(!patch||!Array.isArray(patch.path??[])||path.some(key=>typeof key!=='string'||['__proto__','prototype','constructor'].includes(key)))throw Error('Invalid dataset patch');
     let target=data;for(const key of path.slice(0,-1)){if(Array.isArray(target)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=target.length))throw Error();if(target[key]===undefined)target[key]={};if(!target[key]||typeof target[key]!=='object')throw Error();target=target[key]}const key=path.at(-1)!;if(Array.isArray(target)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=target.length))throw Error();
     if(patch.mode==='append'){if(!Array.isArray(patch.value)||target[key]!==undefined&&!Array.isArray(target[key]))throw Error();target[key]=[...(target[key]??[]),...patch.value]}
     else if(patch.mode==='merge'){if(!patch.value||Array.isArray(patch.value)||typeof patch.value!=='object')throw Error();target[key]={...target[key],...patch.value}}
     else if(patch.mode==='replace')target[key]=patch.value;else throw Error();
    }
    full={schemaVersion:1,domain:task,businessDate:value.businessDate,asOf:value.asOf,startedAt:partial?.startedAt??value.startedAt??value.asOf,generation:value.generation,complete:value.complete,data,chunks:(partial?.chunks??0)+1,nextCursor:value.nextCursor,progress:value.progress};
    if(!value.complete){if(!value.nextCursor||value.nextCursor===partial?.nextCursor||!await repo.saveDatasetProgress(task,full,revision,partial?.nextCursor??null))throw Error();chunkCounts.set(task,full.chunks);if(value.progress?.total>0)fractions.set(task,Math.min(.99,value.progress.completed/value.progress.total));enqueue(task,task===requestedDomain);return}
   }
   const saved=isMedia?await repo.saveDatasetMedia('blob:'+url.href,value,revision):await repo.saveDataset(task,full,revision,partial?.nextCursor??null);if(!saved)throw Error();if(!isMedia&&full.chunks)chunkCounts.set(task,full.chunks);
   if(isMedia&&preferred.has(task)){const alias=new URL(url);alias.searchParams.set('source','preferred');if(!await repo.saveDatasetMedia('blob:'+alias.href,value,revision))throw Error()}
   if(stopped)return;completed.add(task);queue=queue.filter(queued=>queued!==task);failed.delete(task);if(task==='records'){for(const path of media){completed.delete(path);failed.delete(path)}preferred.clear();mediaVersion.clear();media=mediaKeys(full);}
   if(!isMedia)window.dispatchEvent(new CustomEvent('mw-offline-dataset-ready',{detail:{scopeName:repo.scopeName,domain:task}}));
  }catch{if(!stopped){if(!navigator.onLine||flight.signal.aborted&&flight.signal.reason==='offline'){enqueue(task);paused=true}else failed.add(task)}}finally{
   clearTimeout(timeout);running=false;activeTask=null;controller=null;if(completed.has(task)||failed.has(task)){if(task===requestedDomain)requestedDomain=null}if(!stopped){addMedia();status();if(queue.length&&!paused)schedule();else if(failed.size)retryLater()}
  }
 }
 const request=(event?:Event)=>{if(stopped)return;retryAttempts=0;if(retryTimer){clearTimeout(retryTimer);retryTimer=undefined;}const detail=(event as CustomEvent|undefined)?.detail;const priority=detail?.domain;
  if(detail?.foreground)requestedDomain=priority;
  if(event?.type==='mw-read-invalidated'){for(const domain of domains){completed.delete(domain);fractions.delete(domain);chunkCounts.delete(domain);enqueue(domain)}failed.clear()}
  else if(!running&&!queue.length&&event?.type==='mw-offline-prepare'&&!failed.size){for(const domain of domains){completed.delete(domain);fractions.delete(domain);chunkCounts.delete(domain);enqueue(domain)}}
  else{for(const task of failed)enqueue(task);failed.clear()}
  if(priority){completed.delete(priority);queue=queue.filter(task=>task!==priority);enqueue(priority,true)}
  changedRetries.clear();paused=false;status();schedule();
 };
 const resume=()=>{if(stopped)return;for(const task of failed)enqueue(task);failed.clear();for(const domain of domains)if(!completed.has(domain)&&domain!==activeTask)enqueue(domain);paused=false;schedule()};
 const offline=()=>{controller?.abort('offline');paused=completed.size<domains.length+media.length;status()};
 const unsubscribe=subscribeActivity(()=>{if(activitySnapshot()===0)schedule()});
 window.addEventListener('mw-offline-queued',resume);window.addEventListener('online',resume);window.addEventListener('offline',offline);window.addEventListener('focus',resume);window.addEventListener('mw-read-invalidated',request);window.addEventListener('mw-offline-prepare',request);
 void initialize();
 return()=>{stopped=true;if(timer)clearTimeout(timer);if(retryTimer)clearTimeout(retryTimer);controller?.abort();unsubscribe();window.removeEventListener('mw-offline-queued',resume);window.removeEventListener('online',resume);window.removeEventListener('offline',offline);window.removeEventListener('focus',resume);window.removeEventListener('mw-read-invalidated',request);window.removeEventListener('mw-offline-prepare',request);states.delete(repo.scopeName);listeners.forEach(listener=>listener())};
}

const routeDomain=(route:string)=>route.startsWith('/api/management')?'management':route.startsWith('/api/cash-')||route==='/api/preferences'?'cash':route.startsWith('/api/notifications')?'notifications':route.startsWith('/api/collection')||route.includes('/upcoming')||route.includes('/collection-receipts')?'collection':'records';
export async function refreshOfflineDataset(access:Access,path:string):Promise<any|null>{
 const repo=access.offline;if(!repo||!navigator.onLine||access.offlineOnly)return readOfflineDataset(access,path);
 const domain=routeDomain(parsed(path,access.origin).pathname);
 await new Promise<void>((resolve,reject)=>{const cleanup=()=>{clearTimeout(timer);window.removeEventListener('mw-offline-dataset-ready',ready)};const ready=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.scopeName===repo.scopeName&&detail.domain===domain){cleanup();resolve()}};const timer=setTimeout(()=>{cleanup();reject(Error('Offline preparation incomplete'))},65000);window.addEventListener('mw-offline-dataset-ready',ready);window.dispatchEvent(new CustomEvent('mw-offline-prepare',{detail:{domain,foreground:true}}));});
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
 const repo=access.offline;if(!repo||repo.environment==='prod'||!await repo.syncAuthorized())return null;
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
