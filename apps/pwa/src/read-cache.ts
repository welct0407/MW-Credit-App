import {beginRequest} from './request-activity';
import {readOfflineDataset,isOfflineDatasetCursor,refreshOfflineDataset} from './offline-dataset';
import {commandOriginAllowed} from './environment';
import type {OwnerOfflineRepository,CachedResponse} from './owner-offline';

type Access={origin:string;offline?:OwnerOfflineRepository;offlineOnly?:boolean;token:()=>Promise<string>;authFailure:(status:number)=>void};
type Options<T>={origin?:string;signal?:AbortSignal;onCached?:(data:T)=>void;policy?:'cache-first'|'network-only'};
export type CachedReadResult<T>={response:Response;data:T;fromCache:boolean};
const failures=new Set<string>(),refreshFailures=new Set<string>(),listeners=new Set<()=>void>();
const failureEpochs=new Map<string,number>();
export const subscribeCachedReadFailure=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};
export const hasCachedReadFailure=(scopeName?:string)=>scopeName?[...failures].some(key=>key.startsWith(scopeName+'|')):failures.size>0;
export const hasReadRefreshFailure=(scopeName?:string)=>scopeName?[...refreshFailures].some(key=>key.startsWith(scopeName+'|')):refreshFailures.size>0;
export function clearCachedReadFailures(scopeName?:string){if(scopeName)failureEpochs.set(scopeName,(failureEpochs.get(scopeName)??0)+1);else for(const [scope,epoch] of failureEpochs)failureEpochs.set(scope,epoch+1);let changed=false;for(const entries of [failures,refreshFailures])for(const key of entries)if(!scopeName||key.startsWith(scopeName+'|')){entries.delete(key);changed=true}if(changed)listeners.forEach(listener=>listener())}
function refreshFailure(key:string,value:boolean){const before=refreshFailures.has(key);if(value)refreshFailures.add(key);else refreshFailures.delete(key);if(before!==value)listeners.forEach(listener=>listener())}
function failure(key:string,value:boolean){const before=failures.has(key);if(value)failures.add(key);else failures.delete(key);if(before!==value)listeners.forEach(listener=>listener())}
function allowed(access:Access,url:URL,format:'json'|'blob'){
 const repository=access.offline;if(!repository||url.username||url.password||url.hash)return false;
 if(repository.environment==='synthetic'){if(url.origin!==location.origin)return false}
 else if(!commandOriginAllowed(url.origin,repository.environment)&&!(url.protocol==='https:'&&new RegExp('^mw-credit-app-read-'+repository.environment+'-[a-z0-9-]+(?:\\.[a-z0-9-]+)?\\.run\\.app$').test(url.hostname)))return false;
 if(format==='blob')return /^\/api\/(?:payment-records\/[^/]+\/receipt|payment-commands\/[^/]+\/receipts\/[^/]+)$/.test(url.pathname);
 if(/\/(?:close-preview|correction-preview|close-preparation|draft|auto-assign|select-all)(?:\/|$)/.test(url.pathname))return false;
 return /^\/api\/(?:borrowers|collection|dashboard|borrower-records|borrower-options|loan-records|loan-options|charge-records|payment-records|payment-drafts|expense-records|expense-options|management|cash-overview|cash-statements|preferences|notifications|upcoming|upcoming-charges)(?:\/|$)/.test(url.pathname);
}
function cacheable(data:unknown){
 if(data instanceof Blob)return ['image/png','image/jpeg','image/webp'].includes(data.type);
 const encoded=JSON.stringify(data);
 return typeof encoded==='string'&&!/"(?:authorization|accessToken|refreshToken|idToken|signedUrl|signedURL)"\s*:|X-Goog-(?:Signature|Credential)|[?&](?:Signature|X-Amz-Signature)=/i.test(encoded);
}
function savedResult<T>(value:CachedResponse):CachedReadResult<T>{return {response:new Response(null,{status:200,headers:{'Content-Type':value.contentType}}),data:structuredClone(value.data),fromCache:true}}

async function read<T>(access:Access,path:string,options:Options<T>,format:'json'|'blob'):Promise<CachedReadResult<T>>{
 const url=new URL(path,options.origin||access.origin||location.origin),repository=access.offline;
 const dayScoped=/^\/api\/collection(?:\/|$)|\/upcoming(?:-charges)?(?:\/|$)/.test(url.pathname)&&!url.searchParams.has('businessDate');
 const day=dayScoped?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()):'';
 let cacheAllowed=options.policy!=='network-only'&&allowed(access,url,format);
 const key=format+':'+url.href+(day?'|day='+day:''),scopeKey=(repository?.scopeName??'uncached')+'|'+key;
 const failureScope=repository?.scopeName??'uncached',failureEpoch=failureEpochs.get(failureScope)??0;
 failureEpochs.set(failureScope,failureEpoch);
 const reportFailure=(failed:boolean,cachedFailure=false)=>{if(failureEpoch!==(failureEpochs.get(failureScope)??0))return;refreshFailure(scopeKey,failed);failure(scopeKey,failed&&cachedFailure)};
 const controller=new AbortController(),abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)controller.abort();
 let settled=false,denied=false,cached:CachedResponse|null=null;
 const requireCurrent=()=>{if(controller.signal.aborted)throw new DOMException('Read cancelled','AbortError')};
 const currentRevision=async()=>{try{return await repository!.readRevision()}catch{cacheAllowed=false;return undefined}};
 const localCursor=format==='json'&&isOfflineDatasetCursor(url.href);
 const cachedRead=cacheAllowed?repository!.readCachedResponse(key).catch(()=>null).then(async value=>{
  if(!value&&format==='blob')value=await repository!.readDatasetMedia(key).catch(()=>null);
  if(!value&&format==='json'){
   const data=await readOfflineDataset(access,url.href).catch(()=>null),revision=await currentRevision();
   if(data!==null&&revision!=null)value={data,format:'json',contentType:'application/json',savedAt:Date.now(),revision};
  }
  if(value&&value.format===format&&!settled&&!controller.signal.aborted&&await repository!.syncAuthorized()&&await repository!.readRevision()===value.revision){
   cached=value;options.onCached?.(structuredClone(value.data));
  }
  return value;
 }).catch(()=>null):Promise.resolve(null);
 const done=navigator.onLine&&!access.offlineOnly&&!localCursor?beginRequest():()=>{};
 const timer=setTimeout(()=>controller.abort(),localCursor?65000:15000);
 try{
  if(!navigator.onLine||access.offlineOnly)throw Error('Offline');
  if(localCursor){
   await cachedRead;requireCurrent();
   const refreshed=await refreshOfflineDataset(access,url.href);requireCurrent();
   if(refreshed===null)throw Error('Offline page is no longer available; refresh the first page');
   settled=true;reportFailure(false);return {response:new Response(null,{status:200}),data:refreshed as T,fromCache:true};
  }
  // Capture the mutation revision before dispatch. An applied write makes
  // this response obsolete even when its HTTP request completes successfully.
  let revision=cacheAllowed?await currentRevision():undefined;
  for(let attempt=0;attempt<2;attempt++){
   requireCurrent();const token=await access.token();requireCurrent();
   const response=await fetch(url.href,{method:'GET',headers:{Authorization:'Bearer '+token,'X-MW-Wake-Deadline':String(Date.now()+15000)},signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
   requireCurrent();
   if(response.status===401||response.status===403){denied=true;settled=true;failure(scopeKey,false);access.authFailure(response.status);throw Error('Read authorization denied')}
   const data=await (format==='blob'&&response.ok?response.blob():response.json()) as T;requireCurrent();
   if(cacheAllowed){
    const current=await currentRevision();requireCurrent();
    if(current===null){denied=true;settled=true;throw Error('Read owner scope revoked')}
    if(current!==undefined&&current!==revision){revision=current;if(attempt===0)continue;throw Error('Read changed during refresh')}
   }
   if(response.status>=500||response.status===429)throw Error('Read temporarily unavailable');
   if(response.ok&&cacheAllowed&&revision!=null&&cacheable(data)){
    try{
     if(!await repository!.syncAuthorized())await repository!.authorize();
     await repository!.saveCachedResponse(key,{data,format,contentType:response.headers.get('Content-Type')??(format==='json'?'application/json':'application/octet-stream')},revision);
    }catch{/* Unavailable local storage must not block an authenticated online read. */}
    requireCurrent();const current=await currentRevision();if(current!==undefined&&current!==revision)throw Error('Read changed during refresh');
   }else if(cacheAllowed&&response.status===404)await repository!.remove('cache',key).catch(()=>{});
   settled=true;reportFailure(!response.ok);return {response,data,fromCache:false};
  }
  throw Error('Read changed during refresh');
 }catch(error){
  if(!denied&&!options.signal?.aborted)reportFailure(true);
  const fallback=cached??await cachedRead.catch(()=>null);
  // Explicit navigation aborts and authorization failures must never resurrect
  // cached records. Timeouts may retain the already displayed saved response.
  if(!denied&&!options.signal?.aborted&&fallback&&fallback.format===format&&await repository!.syncAuthorized()&&await repository!.readRevision()===fallback.revision){
   settled=true;reportFailure(true,true);return savedResult<T>(fallback);
  }
  throw error;
 }finally{settled=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);done()}
}
export const readCachedJson=<T=any>(access:Access,path:string,options:Options<T>={})=>read<T>(access,path,options,'json');
export const readCachedBlob=(access:Access,path:string,options:Options<Blob>={})=>read<Blob>(access,path,options,'blob');
export const invalidateCachedReads=(access:Pick<Access,'offline'>)=>access.offline?.invalidateReads().catch(()=>{})??Promise.resolve();
