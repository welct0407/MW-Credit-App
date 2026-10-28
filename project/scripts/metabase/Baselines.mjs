// R103: where the Verify-* scripts read their Metabase baselines, and the one command that rebuilds them.
//
// baselineDir(name) resolves, in order: MW_METABASE_PRIVATE_DIR/<name> when that directory exists (a local override,
// e.g. on VM-01), else a read-only sync of gs://mw-credit-operator-private-737787224638/metabase-baselines/<name>/ into
// $MW_PRIVATE_ROOT/metabase-baselines/<name> (default ~/.mw-private). An empty result refuses. Reading never deletes
// local files and never uploads.
//
// Owner decisions (R103): the baselines are rebuilt from live Metabase, nothing is uploaded from VM-01, and only the
// latest set is kept. `node scripts/metabase/Baselines.mjs --refresh` (from project/) is the only path that writes to
// the bucket and it is never run implicitly: it asserts the PROD reporting source, captures the files in BASELINES with
// read-only Metabase API calls (admin key from Secret Manager, never printed), refuses a file that names or contains a
// credential, then replaces each prefix with `gcloud storage rsync --delete-unmatched-destination-objects`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const BUCKET='gs://mw-credit-operator-private-737787224638/metabase-baselines';
const NAME=/^[a-z0-9][a-z0-9.-]{0,63}$/;
const CREDENTIAL_NAME=/key|token|secret|password|credential/i;
// R103: an embedded secret (the dashboard 3 iframe `#key=`, any URL fragment or query `key=`/`token=`) is replaced by the
// `<private>` placeholder that project/outputs uses, before anything is written; the verifiers compare the redacted form.
export const PRIVATE='<private>';
const EMBEDDED=/([#?&](?:key|token)=)(?!<private>)[^&#"'\s<>\\]*/gi;
export function redact(value){
 if(typeof value==='string')return value.replace(EMBEDDED,'$1'+PRIVATE);
 if(Array.isArray(value))return value.map(redact);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redact(v)]));
 return value;
}
/** The verifiers' view of Metabase: GET responses redacted like the baselines; queries pass through unchanged. */
export const redactedReads=api=>async(method,route,body)=>method==='GET'?redact(await api(method,route,body)):api(method,route,body);
/** True when a captured text still carries an embedded secret (a key=/token= value other than the placeholder). */
export const embeddedSecret=text=>/[#?&](?:key|token)=(?!<private>)[^&#"'\s<>\\]/i.test(text);

export function gcloud(args){
 const r=spawnSync('gcloud',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 if(r.status!==0)throw Error(`gcloud ${args.slice(0,2).join(' ')} failed (${r.status??r.error?.code}): ${(r.stderr||'').trim().split('\n').slice(-1)[0]||''}`);
 return r.stdout;
}
const privateRoot=env=>env.MW_PRIVATE_ROOT||path.join(os.homedir(),'.mw-private');
// Private diagnostics (failed-query bodies) of the baseline readers: local only, never under a synced baseline.
export const diagnosticsDir=(name,env=process.env)=>path.join(privateRoot(env),'metabase-diagnostics',name);
const files=dir=>fs.existsSync(dir)?fs.readdirSync(dir,{recursive:true}).filter(f=>fs.statSync(path.join(dir,f)).isFile()):[];

// R103 (Chase): the files each Verify-* script needs, and the fewest files a sane set has. A refresh never uploads (or
// deletes with --delete-unmatched) a set that misses one of them, and a sync refuses a local copy that misses one.
const CASH_SNAPSHOT_CARDS=[47,48,68,73,74,164,179,180,182,183,184,187,188,197,200,201,202];
export const REQUIRED={
 'r025-collection-monitor':['dashboard.json','permissions.json',...[69,71,73,77,162].map(id=>`model-${id}.json`),'borrower-view-definition.json'],
 'r016-20260922':['remaining-pages-before/dashboard.json','cashflow-before/dashboard-3.json','cashflow-before/collection-graph.json','income-before/dashboard.json',
  'income-before/permissions.json','income-symbols-before/dashboard.json',...['cash-review-before','cash-snapshot-report-before'].flatMap(d=>['dashboard','collection-graph','snippets'].map(f=>`${d}/${f}.json`)),
  ...CASH_SNAPSHOT_CARDS.map(id=>`cash-snapshot-report-before/card-${id}.json`)],
 'r035-borrower-pages':['metabase/dashboard-before.json','metabase/permissions-before.json'],
};
// r016 also holds one card file per saved question on dashboard 3 (about 200 today); fewer than 50 means a broken capture.
export const MINIMUM={'r025-collection-monitor':8,'r016-20260922':REQUIRED['r016-20260922'].length+50,'r035-borrower-pages':2};
export function checkSet(name,dir){
 const present=new Set(files(dir).map(f=>f.split(path.sep).join('/'))),missing=(REQUIRED[name]??[]).filter(f=>!present.has(f));
 if(missing.length)throw Error(`Metabase baseline ${name} is missing ${missing.length} expected file(s), e.g. ${missing[0]}`);
 if(present.size<(MINIMUM[name]??1))throw Error(`Metabase baseline ${name} has ${present.size} files, fewer than the minimum ${MINIMUM[name]??1}`);
 return present.size;
}

export async function baselineDir(name,{env=process.env,run=gcloud}={}){
 if(!NAME.test(name))throw Error('Invalid baseline name: '+name);
 if(env.MW_METABASE_PRIVATE_DIR){const local=path.join(env.MW_METABASE_PRIVATE_DIR,name);if(fs.existsSync(local)&&fs.statSync(local).isDirectory())return local;}
 const local=path.join(privateRoot(env),'metabase-baselines',name);
 fs.mkdirSync(local,{recursive:true,mode:0o700});
 // Mirror the bucket: stale local files in this directory only are removed (the bucket is never written here).
 run(['storage','rsync','--recursive','--delete-unmatched-destination-objects',`${BUCKET}/${name}`,local]);
 if(!files(local).length)throw Error(`No Metabase baselines for ${name}: run "node scripts/metabase/Baselines.mjs --refresh" (owner-approved) first`);
 checkSet(name,local);
 return local;
}

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// R103 (approved): the R025 "original" baseline is dashboard 3 without what R025 added: its collection tab (state.tab),
// that tab's placements and its two detail filters (CollectionMonitor.mjs `parameters`; a unit test pins the ids).
export const R025_PARAMETERS=['collection-detail-borrower','collection-detail-status'];
export function withoutTab(dashboard,tab){
 if(!dashboard.tabs.some(t=>t.id===tab))throw Error('R025 collection tab '+tab+' not on dashboard 3');
 return {...dashboard,tabs:dashboard.tabs.filter(t=>t.id!==tab),dashcards:dashboard.dashcards.filter(c=>c.dashboard_tab_id!==tab),
  parameters:(dashboard.parameters??[]).filter(p=>!R025_PARAMETERS.includes(p.id))};
}
const dashboardCards=d=>[...new Set(d.dashcards.map(c=>c.card_id).filter(Number.isInteger))].sort((a,b)=>a-b);
// What each Verify-* script reads, captured from live Metabase: name -> async (api, put) => put(relativeFile, value).
export const BASELINES={
 'r025-collection-monitor':async(api,put,{r025Tab=JSON.parse(fs.readFileSync(path.join(projectRoot,'outputs/r025-20260924/state.json'),'utf8')).tab}={})=>{ // Verify-CollectionMonitor
  put('dashboard.json',withoutTab(await api('GET','dashboard/3'),r025Tab));put('permissions.json',await api('GET','collection/graph'));
  for(const id of [69,71,73,77,162])put(`model-${id}.json`,await api('GET',`card/${id}`));
  const def=await api('POST','dataset',{database:2,type:'native',native:{query:`SELECT pg_get_viewdef('public.olap_borrowers_analytics'::regclass,true) AS definition`}});
  if(def.status!=='completed')throw Error('View definition query failed');put('borrower-view-definition.json',def.data);  // the shape CollectionMonitor --prepare stored (runQuery's data)
 },
 'r016-20260922':async(api,put)=>{ // ReportingApi privateDir: RemainingPages, Cashflow, Income, IncomeSymbols, CashReview, CashSnapshotReport
  const dashboard=await api('GET','dashboard/3'),graph=await api('GET','collection/graph'),snippets=await api('GET','native-query-snippet');
  put('remaining-pages-before/dashboard.json',dashboard);
  put('cashflow-before/dashboard-3.json',dashboard);put('cashflow-before/collection-graph.json',graph);
  put('income-before/dashboard.json',dashboard);put('income-before/permissions.json',graph);
  put('income-symbols-before/dashboard.json',dashboard);
  for(const dir of ['cash-review-before','cash-snapshot-report-before']){put(dir+'/dashboard.json',dashboard);put(dir+'/collection-graph.json',graph);put(dir+'/snippets.json',snippets);}
  const cards=new Map();const card=async id=>cards.get(id)??cards.set(id,await api('GET','card/'+id)).get(id);
  for(const id of dashboardCards(dashboard))put(`cash-review-before/card-${id}.json`,await card(id));
  for(const id of CASH_SNAPSHOT_CARDS)put(`cash-snapshot-report-before/card-${id}.json`,await card(id));
 },
 'r035-borrower-pages':async(api,put)=>{ // Verify-BorrowerPages (BorrowerPages priv = <name>/metabase)
  put('metabase/dashboard-before.json',await api('GET','dashboard/3'));put('metabase/permissions-before.json',await api('GET','collection/graph'));
 },
};

// R103 (owner: latest only): the bucket keeps object versions, so after an upload the refresh deletes every noncurrent
// generation under metabase-baselines/, each by its explicit #generation, and confirms none remain. A live object (no
// timeDeleted) or anything outside the prefix is never deleted. Versioning and the 7-day soft delete stay as they are.
const BUCKET_NAME=BUCKET.slice(5).split('/')[0],PREFIX=BUCKET.slice(5+BUCKET_NAME.length+1)+'/';
const listVersions=run=>JSON.parse(run(['storage','ls','-a','--json',`${BUCKET}/**`])||'[]').filter(o=>o.type==='cloud_object');
export function pruneNoncurrent({run=gcloud,expectCurrent}={}){
 const objects=listVersions(run);
 for(const o of objects)if(o.metadata?.bucket!==BUCKET_NAME||!String(o.metadata?.name).startsWith(PREFIX))throw Error('Listing outside the baseline prefix: '+o.url);
 const urls=objects.filter(o=>o.metadata.timeDeleted).map(o=>`gs://${BUCKET_NAME}/${o.metadata.name}#${o.metadata.generation}`);
 const live=new Set(objects.filter(o=>!o.metadata.timeDeleted).map(o=>`${o.metadata.name}#${o.metadata.generation}`));
 if(urls.some(u=>!/#\d+$/.test(u)||live.has(u.slice(`gs://${BUCKET_NAME}/`.length))))throw Error('Refusing to delete a live or unversioned object');
 for(let i=0;i<urls.length;i+=100)run(['storage','rm',...urls.slice(i,i+100)]);
 const after=listVersions(run),left=after.filter(o=>o.metadata?.timeDeleted).length,current=after.length-left;
 if(left)throw Error(`${left} noncurrent baseline generations remain`);
 if(expectCurrent!==undefined&&current!==expectCurrent)throw Error(`Expected ${expectCurrent} current baseline objects, found ${current}`);
 return {deletedNoncurrent:urls.length,current};
}

export async function refreshBaselines({api,assertSource,key,env=process.env,run=gcloud,names=Object.keys(BASELINES),now=new Date(),context={}}){
 await assertSource();
 const stage=path.join(privateRoot(env),'metabase-baselines-refresh',now.toISOString().replace(/[:.]/g,'-'));
 fs.mkdirSync(stage,{recursive:true,mode:0o700});
 const summary={};
 for(const name of names){
  if(!BASELINES[name])throw Error('Unknown baseline '+name);
  const dir=path.join(stage,name),written=[];
  const put=(file,value)=>{const target=path.join(dir,file);if(!target.startsWith(dir+path.sep))throw Error('Baseline path escapes '+name);
   fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.writeFileSync(target,JSON.stringify(redact(value)),{mode:0o600});written.push(file);};
  await BASELINES[name](api,put,context);
  for(const file of written){
   if(CREDENTIAL_NAME.test(file))throw Error(`Refusing credential-like file ${name}/${file}`);
   const text=fs.readFileSync(path.join(dir,file),'utf8');
   if(key&&text.includes(key))throw Error(`Refusing ${name}/${file}: it contains the Metabase API key`);
   if(embeddedSecret(text))throw Error(`Refusing ${name}/${file}: an embedded key=/token= value is not redacted`);
  }
  checkSet(name,dir);  // never sync (with --delete-unmatched) an empty or partial capture
  summary[name]={files:written.length,bytes:written.reduce((s,f)=>s+fs.statSync(path.join(dir,f)).size,0)};
 }
 // Only after every set is captured and checked: replace each prefix (latest only). --checksums-only uploads only changed
 // files, so an unchanged refresh leaves no noncurrent generations in the versioned bucket.
 for(const name of names)run(['storage','rsync','--recursive','--checksums-only','--delete-unmatched-destination-objects',path.join(stage,name),`${BUCKET}/${name}`]);
 fs.rmSync(stage,{recursive:true,force:true});
 const full=names.length===Object.keys(BASELINES).length;
 summary.pruned=pruneNoncurrent({run,expectCurrent:full?Object.values(summary).reduce((n,x)=>n+x.files,0):undefined});
 return summary;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 if(!process.argv.includes('--refresh')){console.log('Usage: node scripts/metabase/Baselines.mjs --refresh   (owner-approved; replaces gs://…/metabase-baselines/<name>/ from live Metabase)');process.exit(2);}
 const {api,assertSource,apiKey}=await import('./ReportingApi.mjs');
 const summary=await refreshBaselines({api,assertSource,key:apiKey()});
 console.log(JSON.stringify({refreshed:summary,bucket:BUCKET,latestOnly:true}));
}
