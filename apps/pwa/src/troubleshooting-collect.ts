import {applicationEnvironment,firebaseIssuer} from './environment';
import {releaseNumber} from './release';
import {readRunningBuildVersion} from './build-version';
import {clientEvents} from './client-events';
import type {OwnerOfflineRepository} from './owner-offline';
import type {OfflinePreparation} from './offline-dataset';
import {accountHash,buildTroubleshootingPayload,describePendingRows,sha256Hex,signedOutPendingRow,troubleshootingFileName,type PendingRowInput} from './troubleshooting-report';
import {encryptTroubleshooting,troubleshootingFileText,troubleshootingSupported} from './troubleshooting-envelope';
/** R072 troubleshooting: browser reads for the encrypted file. Each section fails on its own; nothing here writes. */
export type TroubleshootingContext={pwa:{startup:string;standalone:boolean;waiting:boolean;reloadAvailable:boolean;unavailable:boolean;canonical:boolean};status:string;rootError:{code?:string;reference?:string}|null;signInErrorCode:string|null;uid:string|null;hasCommandAccess:boolean;repository:OwnerOfflineRepository|null;preparation:OfflinePreparation|null};
export const troubleshootingAvailable=()=>troubleshootingSupported(__TROUBLESHOOTING_PUBLIC_KEY__);
const domains=['records','collection','cash','management','notifications'];
const minutes=(time:number|null|undefined)=>typeof time==='number'?Math.round((Date.now()-time)/60000):null;
const megabytes=(bytes:number|undefined)=>typeof bytes==='number'?Math.round(bytes/104857.6)/10:null;
async function section<T>(read:()=>Promise<T>,timeoutMs=4000):Promise<T|{unavailable:string}>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('timed out')),timeoutMs)})])}
 catch(error){return {unavailable:error instanceof Error?error.message:'error'}}
 finally{clearTimeout(timer)}
}
async function device(){
 const storage=navigator.storage,estimate=await storage?.estimate?.().catch(()=>null),connection=(navigator as Navigator&{connection?:{effectiveType?:string}}).connection;
 return {userAgent:navigator.userAgent,platform:navigator.platform,language:navigator.language,viewport:{width:innerWidth,height:innerHeight},devicePixelRatio,displayMode:['standalone','minimal-ui','fullscreen','browser'].find(mode=>matchMedia('(display-mode: '+mode+')').matches)??'unknown',timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,online:navigator.onLine,connection:connection?.effectiveType??null,storage:estimate?{usageMB:megabytes(estimate.usage),quotaMB:megabytes(estimate.quota)}:null,persisted:await storage?.persisted?.().catch(()=>null)??null};
}
async function serviceWorker(){
 if(!('serviceWorker' in navigator))return {supported:false};
 const registration=await navigator.serviceWorker.getRegistration().catch(()=>undefined),names=typeof caches==='undefined'?[]:(await caches.keys()).filter(name=>name.startsWith('mw-credit-'));
 return {supported:true,controller:!!navigator.serviceWorker.controller,active:registration?.active?.state??null,waiting:registration?.waiting?.state??null,installing:registration?.installing?.state??null,caches:await Promise.all(names.map(async name=>({name,entries:(await (await caches.open(name)).keys()).length})))};
}
const kindRange=(kind:string)=>IDBKeyRange.bound(kind+':',kind+':￿');
/** Signed out: every owner store of this environment on the device, read-only (as owner-offline.ts sweepOtherOwners finds them); counts and sync metadata only. */
async function signedOutStorage(names:string[]){
 if(typeof indexedDB?.databases!=='function')return {supported:false,note:'indexedDB.databases() is not supported in this browser; saved changes could not be counted.'};
 const prefix='mw-credit-'+applicationEnvironment+'-owner:',owners=[];
 for(const {name} of await indexedDB.databases()){
  if(!name?.startsWith(prefix))continue;
  // The namespace and the bare uid inside it are both scrubber secrets.
  const owner=name.slice(prefix.length),uid=owner.startsWith(firebaseIssuer+':')?owner.slice(firebaseIssuer.length+1):owner.slice(owner.lastIndexOf(':')+1);names.push(name,owner,uid);
  const summary=await new Promise<{kinds:Record<string,number>;pending:ReturnType<typeof signedOutPendingRow>[]}|null>(resolve=>{const request=indexedDB.open(name);
   request.onupgradeneeded=()=>request.transaction?.abort();request.onerror=request.onblocked=()=>resolve(null);
   request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('records')){db.close();resolve(null);return}
    const tx=db.transaction('records','readonly'),store=tx.objectStore('records'),keys=store.getAllKeys(),rows=store.getAll(kindRange('pending'));
    tx.oncomplete=()=>{db.close();const kinds:Record<string,number>={};for(const key of keys.result)kinds[String(key).split(':')[0]]=(kinds[String(key).split(':')[0]]??0)+1;resolve({kinds,pending:(rows.result as PendingRowInput[]).map(signedOutPendingRow)})};
    tx.onerror=tx.onabort=()=>{db.close();resolve(null)};
   };
  });
  owners.push({namespace:(await sha256Hex(name)).slice(0,16),...(summary??{unavailable:'could not open'})});
 }
 return {supported:true,owners};
}
async function offline(repository:OwnerOfflineRepository,preparation:OfflinePreparation|null){
 const counts=await repository.diagnosticCounts();
 return {preparation:preparation&&{state:preparation.state,completed:preparation.completed,total:preparation.total,updating:preparation.updating,updateFailed:preparation.updateFailed,failedDomains:preparation.failedDomains?preparation.failedDomains.split(','):[],lastCheckedAgeMinutes:minutes(preparation.lastChecked)},
  domains:domains.map(domain=>({domain,complete:counts.datasets.includes(domain),partial:counts.progress.includes(domain)})),leaseAgeMinutes:minutes(counts.leaseVerifiedAt),kinds:counts.kinds,
  drafts:counts.kinds.draft??0,snapshots:counts.kinds.snapshot??0,receipts:counts.kinds['dataset-media']??0,pending:counts.kinds.pending??0};
}
/** Reads everything for the payload, then scrubs it (troubleshooting-report.ts). */
export async function collectTroubleshooting(context:TroubleshootingContext,createdAt=new Date()){
 const {pwa,repository,uid}=context,signedIn=!!uid,names:string[]=[];
 const app={release:releaseNumber,commit:__SOURCE_COMMIT__,build:await readRunningBuildVersion().catch(()=>null),environment:applicationEnvironment,pwa:{startup:pwa.startup,standalone:pwa.standalone,waiting:pwa.waiting,reloadAvailable:pwa.reloadAvailable,unavailable:pwa.unavailable,canonical:pwa.canonical}};
 const codes={status:context.status,rootError:context.rootError?{code:context.rootError.code??null,reference:context.rootError.reference??null}:null,signInError:context.signInErrorCode};
 const pending=signedIn&&repository?await section(async()=>describePendingRows(await repository.list('pending'))):undefined;
 const failedSaves=pending&&'failed' in pending?pending.failed.length:0;
 const payload=buildTroubleshootingPayload({
  app,device:await section(device),serviceWorker:await section(serviceWorker),
  session:signedIn?{...codes,accountHash:await accountHash(uid),hasCommandAccess:context.hasCommandAccess}:codes,
  events:clientEvents(),
  ...(signedIn?{offline:repository?await section(()=>offline(repository,context.preparation)):{unavailable:'no offline repository'},pending:pending as never}:{signedOutStorage:await section(()=>signedOutStorage(names))}),
 },{createdAt,secrets:[uid,repository?.scopeName,...names,import.meta.env.VITE_API_ORIGIN,import.meta.env.VITE_COMMAND_API_ORIGIN,import.meta.env.VITE_FIREBASE_API_KEY,import.meta.env.VITE_FIREBASE_APP_ID]});
 return {payload,failedSaves};
}
/** The encrypted .txt (text/plain: Chromium Web Share rejects .json). Throws when it cannot be made; there is no plaintext fallback. */
export async function prepareTroubleshootingFile(context:TroubleshootingContext){
 if(!troubleshootingAvailable())throw Error('Troubleshooting file unavailable');
 const createdAt=new Date(),{payload,failedSaves}=await collectTroubleshooting(context,createdAt);
 const envelope=await encryptTroubleshooting(payload,{publicKeyPem:__TROUBLESHOOTING_PUBLIC_KEY__,environment:applicationEnvironment,createdAt});
 return {file:new File([troubleshootingFileText(envelope)],troubleshootingFileName(applicationEnvironment,createdAt),{type:'text/plain'}),failedSaves};
}
