import {activitySnapshot,subscribeActivity} from './request-activity';
import type {OwnerOfflineRepository} from './owner-offline';

type Access={origin:string;offline?:OwnerOfflineRepository;offlineOnly?:boolean;token:()=>Promise<string>;authFailure:(status:number)=>void};
const domains=['records','collection','cash','management','notifications'] as const;
export type OfflinePreparation={state:'idle'|'preparing'|'ready'|'incomplete';completed:number;total:number;progress:number};
const idle:OfflinePreparation={state:'idle',completed:0,total:domains.length,progress:0};
const states=new Map<string,OfflinePreparation>(),listeners=new Set<()=>void>();
export const getOfflinePreparation=(scopeName?:string)=>scopeName?states.get(scopeName)??idle:idle;
export const subscribeOfflinePreparation=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};
function publish(scope:string,value:OfflinePreparation){states.set(scope,value);listeners.forEach(listener=>listener())}

/** Background preparation yields to every foreground read, including during media downloads. */
export function startOfflinePreparation(access:Access,_options:{readOrigin?:string}={}){
 const repo=access.offline;if(!repo||repo.environment==='prod')return()=>{};
 let stopped=false,running=0,queue:string[]=[],media:string[]=[],mediaVersion=new Map<string,number>(),preferred=new Set<string>(),mediaStarted=false,completed=new Set<string>(),failed=false,cycle=0,timer:ReturnType<typeof setTimeout>|undefined;
 const controllers=new Set<AbortController>(),foregroundControllers=new Set<AbortController>();let requestedDomain:string|null=null;
 const mediaKeys=(records:any)=>((records?.data?.payments??[]) as any[]).flatMap(row=>[...(row.receiptReference?['manual']:[]),...(row.agentReceiptPresent?['agent']:[])].map(source=>{const path='/api/payment-records/'+encodeURIComponent(row.id)+'/receipt?source='+source;mediaVersion.set(path,Date.parse(source==='manual'?row.receiptAt:row.agentReceiptAt));if(source===(row.receiptReference?'manual':'agent'))preferred.add(path);return path}));
 const progress=()=>{const core=domains.filter(domain=>completed.has(domain)).length,images=media.filter(path=>completed.has(path)).length;return core===domains.length?(media.length?80+20*images/media.length:100):80*core/domains.length};
 const status=()=>publish(repo.scopeName,{state:queue.length||running?'preparing':failed?'incomplete':'ready',completed:completed.size,total:domains.length+media.length,progress:progress()});
 const retained=async()=>{const mine=cycle;try{
  if(!await repo.syncAuthorized())throw Error();const bundles=await Promise.all(domains.map(domain=>repo.readDataset(domain)));
  const core=bundles.filter(bundle=>bundle?.complete).length;let count=core;const images=mediaKeys(bundles[0]);
  for(const path of images){if(stopped||mine!==cycle)return;if(await repo.readDatasetMedia('blob:'+new URL(path,access.origin).href))count++}
  if(!stopped&&mine===cycle)publish(repo.scopeName,{state:count===domains.length+images.length?'ready':'incomplete',completed:count,total:domains.length+images.length,progress:core===domains.length?(images.length?80+20*(count-core)/images.length:100):80*core/domains.length});
 }catch{if(!stopped&&mine===cycle)publish(repo.scopeName,{state:'incomplete',completed:0,total:domains.length,progress:0})}};
 const pump=async()=>{
  if(stopped||!navigator.onLine||access.offlineOnly||(activitySnapshot()>0&&!requestedDomain))return;
  if(!await repo.syncAuthorized()||stopped)return;
  if(!mediaStarted&&domains.every(domain=>completed.has(domain))){mediaStarted=true;queue.push(...media)}
  while(running<(requestedDomain||mediaStarted?1:2)&&queue.length&&(activitySnapshot()===0||!!requestedDomain)){
   const task=queue.shift()!,isMedia=task.startsWith('/api/'),mine=cycle,controller=new AbortController();controllers.add(controller);if(task===requestedDomain)foregroundControllers.add(controller);running++;status();
   void(async()=>{const timeout=setTimeout(()=>controller.abort(),60000);try{
    const revision=await repo.readRevision();if(revision===null||stopped||controller.signal.aborted)throw Error();
    const path=isMedia?task:task==='notifications'?'/api/notifications/offline-dataset':'/api/offline-dataset?domain='+task,url=new URL(path,access.origin);
    if(isMedia){const saved=await repo.readDatasetMedia('blob:'+url.href);if(stopped||mine!==cycle||controller.signal.aborted)return;if(saved&&saved.savedAt>=(mediaVersion.get(task)??Infinity)){if(preferred.has(task)){const alias=new URL(url);alias.searchParams.set('source','preferred');if(!await repo.saveDatasetMedia('blob:'+alias.href,saved.data,revision))throw Error()}if(stopped||mine!==cycle||controller.signal.aborted)return;completed.add(task);return}}
    const token=await access.token();if(stopped||controller.signal.aborted)throw Error();
    const response=await fetch(url,{signal:controller.signal,headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',redirect:'error'});
    if(response.status===401||response.status===403){access.authFailure(response.status);throw Error()}
    if(!response.ok)throw Error();const value=isMedia?await response.blob():await response.json();
    if(stopped||mine!==cycle||controller.signal.aborted||!await repo.syncAuthorized())return;
    const saved=isMedia?await repo.saveDatasetMedia('blob:'+url.href,value,revision):await repo.saveDataset(task,value,revision);if(!saved)throw Error();if(isMedia&&preferred.has(task)){const alias=new URL(url);alias.searchParams.set('source','preferred');if(!await repo.saveDatasetMedia('blob:'+alias.href,value,revision))throw Error()}
    if(stopped||mine!==cycle||controller.signal.aborted)return;completed.add(task);if(task==='records')media=mediaKeys(value);
    if(!isMedia)window.dispatchEvent(new CustomEvent('mw-offline-dataset-ready',{detail:{scopeName:repo.scopeName,domain:task}}));
   }catch{if(!stopped&&mine===cycle){if(controller.signal.reason==='foreground')queue.unshift(task);else failed=true}}finally{
    clearTimeout(timeout);controllers.delete(controller);foregroundControllers.delete(controller);if(mine===cycle&&task===requestedDomain)requestedDomain=null;running--;
    if(!stopped&&mine===cycle){if(!mediaStarted&&domains.every(domain=>completed.has(domain))){mediaStarted=true;queue.push(...media)}status()}if(!stopped)schedule();
   }})();
  }
 };
 const schedule=()=>{if(stopped||timer)return;timer=setTimeout(()=>{timer=undefined;void pump()},200)};
 const restart=(event?:Event)=>{if(stopped)return;cycle++;controllers.forEach(controller=>controller.abort());completed=new Set();failed=false;media=[];mediaVersion.clear();preferred.clear();mediaStarted=false;const priority=(event as CustomEvent|undefined)?.detail?.domain;requestedDomain=(event as CustomEvent|undefined)?.detail?.foreground?priority:null;queue=[...domains].sort((a,b)=>(a===priority?-1:0)-(b===priority?-1:0));if(!navigator.onLine||access.offlineOnly){queue=[];void retained();return}publish(repo.scopeName,{state:'preparing',completed:0,total:domains.length,progress:0});schedule()};
 const focus=()=>{if(!running&&!queue.length)restart();else schedule()};
 const offline=()=>{cycle++;queue=[];controllers.forEach(controller=>controller.abort());void retained()};
 const unsubscribe=subscribeActivity(()=>{if(activitySnapshot()>0)controllers.forEach(controller=>{if(!foregroundControllers.has(controller))controller.abort('foreground')});else schedule()});
 window.addEventListener('mw-offline-queued',schedule);window.addEventListener('online',restart);window.addEventListener('offline',offline);window.addEventListener('focus',focus);window.addEventListener('mw-read-invalidated',restart);window.addEventListener('mw-offline-prepare',restart);
 restart();
 return()=>{stopped=true;cycle++;if(timer)clearTimeout(timer);controllers.forEach(controller=>controller.abort());unsubscribe();window.removeEventListener('mw-offline-queued',schedule);window.removeEventListener('online',restart);window.removeEventListener('offline',offline);window.removeEventListener('focus',focus);window.removeEventListener('mw-read-invalidated',restart);window.removeEventListener('mw-offline-prepare',restart);states.delete(repo.scopeName);listeners.forEach(listener=>listener())};
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
  if(route==='/api/borrower-options'){const options=data.borrowerOptions;if(!options)return null;return {...options,referrers:filtered(options.referrers??options.items??[])}}
  if(route==='/api/loan-options')return data.loanOptions;
  if(route==='/api/expense-options')return data.expenseOptions;
  const records:any={'borrower-records':data.borrowers,'loan-records':data.loans,'charge-records':data.charges,'payment-records':data.payments,'expense-records':data.expenses};
  if(id&&records[parts[1]]&&!tail){const item=records[parts[1]].find((row:any)=>row.id===id);return item?{item}:null}
  if(route==='/api/borrowers')return page(filtered(data.borrowerList??[]),url,bundle,{...envelope,order:'active-inactive-unknown,created-date-asc-null-last,row-id-asc'});
  if(parts[1]==='borrowers'&&id&&!tail){const item=data.borrowerList?.find((row:any)=>row.id===id);return item?{...envelope,item}:null}
  if(parts[1]==='borrowers'&&tail==='loans'){
   const rank=(row:any)=>row.status==='ยังไม่ปิดยอด'?0:row.status==='ปิดยอดแล้ว'?1:2;
   const rows=(data.borrowerLoans??[]).filter((row:any)=>row.borrowerId===id).sort((a:any,b:any)=>rank(a)-rank(b)||byDate('loanDate')(a,b));
   if(parts[4]){const item=rows.find((row:any)=>row.id===parts[4]);return item?{...envelope,item}:null}return page(rows,url,bundle,envelope);
  }
  if(parts[1]==='borrowers'&&tail==='payments')return page((data.paymentHistory??[]).filter((row:any)=>row.borrowerId===id),url,bundle);
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
  if(parts[1]==='collection'&&id&&tail==='charges'){const borrower=data.items?.find((row:any)=>row.id===id);return borrower?page((data.charges??[]).filter((row:any)=>row.borrowerId===id),url,bundle,{...envelope,borrower}):null}
  if(tail==='upcoming'){
   const entry=data.borrowerUpcoming?.find((row:any)=>row.borrowerId===id&&row.scope===(parts[1]==='collection'?'collection':'borrower'));if(!entry)return null;
   if(!parts[4])return {...envelope,...entry};const detail=entry.previews?.find((row:any)=>row.dueDate===parts[4]);return detail?page(detail.items,url,bundle,{...envelope,...detail}):null;
  }
  if(route==='/api/upcoming-charges')return page(filtered(data.upcoming?.items??[]),url,bundle,data.upcoming??envelope);
  if(parts[1]==='upcoming-charges'&&id&&tail){const detail=data.upcomingDetails?.find((row:any)=>row.borrowerId===id&&row.dueDate===tail);return detail?page(detail.items,url,bundle,detail):null}
  if(tail==='collection-receipts'){let chargeIds:string[];try{chargeIds=JSON.parse(url.searchParams.get('chargeIds')??'[]')}catch{return null}return page((data.receipts??[]).filter((row:any)=>row.borrowerId===id&&row.chargeIds?.some((chargeId:string)=>chargeIds.includes(chargeId))),url,bundle,envelope)}
 }
 if(domain==='cash'){
  if(route==='/api/cash-overview')return data.overview;
  if(route==='/api/preferences')return data.preferences;
  if(route==='/api/cash-statements'){const statement=data.statements?.find((row:any)=>row.accountId===url.searchParams.get('accountId')&&row.date===url.searchParams.get('date'));return statement?page(statement.items,url,bundle,statement):null}
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
