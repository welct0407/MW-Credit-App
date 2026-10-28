// R103: project/scripts/metabase/Baselines.mjs with a fake gcloud and a fake Metabase API (no network, no bucket).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BUCKET,BASELINES,REQUIRED,MINIMUM,baselineDir,refreshBaselines,diagnosticsDir,redact,redactedReads,embeddedSecret,withoutTab,R025_PARAMETERS,pruneNoncurrent} from '../../project/scripts/metabase/Baselines.mjs';

const temp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mw-baselines-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
// A fake gcloud: records argv; a download "sync" copies the named fixture files into the destination.
function fakeGcloud(fixtures={},versions=[]){
 // versions: the versioned bucket, [{name,generation,timeDeleted}] with names relative to the bucket.
 const calls=[],bucket=BUCKET.slice(5).split('/')[0];let next=1000;
 const run=args=>{calls.push(args);
  if(args[0]==='storage'&&args[1]==='rsync'&&String(args.at(-2)).startsWith('gs://')){
   const name=String(args.at(-2)).slice(BUCKET.length+1),wanted=Object.keys(fixtures[name]??{}).map(f=>path.normalize(f));
   if(args.includes('--delete-unmatched-destination-objects'))for(const f of fs.readdirSync(args.at(-1),{recursive:true}))if(fs.statSync(path.join(args.at(-1),f)).isFile()&&!wanted.includes(f))fs.rmSync(path.join(args.at(-1),f));
   for(const [file,text] of Object.entries(fixtures[name]??{})){const target=path.join(args.at(-1),file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);}}
  if(args[0]==='storage'&&args[1]==='rsync'&&String(args.at(-1)).startsWith('gs://')){
   const [src,dst]=args.slice(-2),prefix=dst.slice(5+bucket.length+1)+'/',local=fs.readdirSync(src,{recursive:true}).filter(f=>fs.statSync(path.join(src,f)).isFile()).map(f=>prefix+f.split(path.sep).join('/'));
   for(const v of versions)if(!v.timeDeleted&&v.name.startsWith(prefix)&&(local.includes(v.name)||args.includes('--delete-unmatched-destination-objects')))v.timeDeleted='2026-10-28T00:00:00Z';
   for(const name of local)versions.push({name,generation:String(next++),timeDeleted:null});}
  if(args[0]==='storage'&&args[1]==='ls')return JSON.stringify(versions.map(v=>({type:'cloud_object',url:`gs://${bucket}/${v.name}#${v.generation}`,metadata:{bucket:v.bucket??bucket,name:v.name,generation:v.generation,...(v.timeDeleted?{timeDeleted:v.timeDeleted}:{})}})));
  if(args[0]==='storage'&&args[1]==='rm')for(const url of args.slice(2)){const [name,generation]=url.slice(5+bucket.length+1).split('#');const i=versions.findIndex(v=>v.name===name&&v.generation===generation);
   if(i<0||!versions[i].timeDeleted)throw Error('fake gcloud: rm of a missing or live object '+url);versions.splice(i,1);}
  return '';};
 return {calls,run,versions};
}
const IFRAME='<iframe src="https://charts.mw-credit.com/#key=SYNTH3TIC-chart-secret&detail=32:382" title="x"></iframe>';
const LINK='https://reports.example/embed?token=SYNTH3TIC.jwt.value&theme=night';
// A fake Metabase API: dashboards, graph, snippets and cards, plus the view-definition dataset.
function fakeApi({secret='',viewStatus='completed',dashboardCards=60}={}){
 const calls=[];
 const api=async(method,route)=>{calls.push([method,route]);assert.ok(method==='GET'||(method==='POST'&&route==='dataset'),'read-only API calls only: '+method+' '+route);
  if(route==='dashboard/3')return {id:3,note:secret,parameters:[{id:'collection-detail-borrower'},{id:'cash-date'},{id:'collection-detail-status'}],tabs:[{id:9,name:'8 · Daily Collection'},{id:19,name:'8R · Collection'}],
   dashcards:[{card_id:69,dashboard_tab_id:9},{card_id:71,dashboard_tab_id:9},{card_id:null,dashboard_tab_id:9,visualization_settings:{iframe:IFRAME}},{card_id:69,dashboard_tab_id:9},{card_id:300,dashboard_tab_id:19},
    ...Array.from({length:dashboardCards},(_,i)=>({card_id:1000+i,dashboard_tab_id:9}))]};
  if(route==='collection/graph')return {groups:{}};
  if(route==='native-query-snippet')return [{id:1}];
  if(route==='dataset')return {status:viewStatus,data:{rows:[["SELECT 'Long Overdue'"]]}};
  const card=route.match(/^card\/(\d+)$/);if(card)return {id:Number(card[1]),description:LINK};
  throw Error('unexpected route '+route);};
 return {calls,api};
}

test('baselineDir: the MW_METABASE_PRIVATE_DIR directory wins and nothing is synced',async t=>{
 const root=temp(t),override=path.join(root,'override');fs.mkdirSync(path.join(override,'r016-20260922'),{recursive:true});
 const g=fakeGcloud();
 assert.equal(await baselineDir('r016-20260922',{env:{MW_METABASE_PRIVATE_DIR:override,MW_PRIVATE_ROOT:root},run:g.run}),path.join(override,'r016-20260922'));
 assert.deepEqual(g.calls,[]);
});

test('baselineDir: otherwise a read-only rsync from the bucket prefix into MW_PRIVATE_ROOT, never deleting or uploading',async t=>{
 const root=temp(t),full=Object.fromEntries(REQUIRED['r025-collection-monitor'].map(f=>[f,'{}'])),g=fakeGcloud({'r025-collection-monitor':full});
 const env={MW_METABASE_PRIVATE_DIR:path.join(root,'missing'),MW_PRIVATE_ROOT:root};
 const dir=await baselineDir('r025-collection-monitor',{env,run:g.run});
 assert.equal(dir,path.join(root,'metabase-baselines','r025-collection-monitor'));
 assert.deepEqual(g.calls,[['storage','rsync','--recursive','--delete-unmatched-destination-objects',BUCKET+'/r025-collection-monitor',dir]]);
 assert.ok(!String(g.calls[0].at(-1)).startsWith('gs://'),'the destination is the local copy; the bucket is only read');
 assert.equal(fs.readFileSync(path.join(dir,'dashboard.json'),'utf8'),'{}');
 assert.equal(BUCKET,'gs://mw-credit-operator-private-737787224638/metabase-baselines');
});

test('baselineDir: an empty result and an unsafe name refuse',async t=>{
 const root=temp(t),g=fakeGcloud();
 await assert.rejects(baselineDir('r016-20260922',{env:{MW_PRIVATE_ROOT:root},run:g.run}),/No Metabase baselines for r016-20260922: run "node scripts\/metabase\/Baselines.mjs --refresh"/);
 for(const bad of ['../x','a/b','','R016'])await assert.rejects(baselineDir(bad,{env:{MW_PRIVATE_ROOT:root},run:g.run}),/Invalid baseline name/,bad);
 await assert.rejects(baselineDir('r016-20260922',{env:{MW_PRIVATE_ROOT:root},run:()=>{throw Error('gcloud storage rsync failed (1)')}}),/rsync failed/);
});

test('refresh: captures every Verify-* file from the live API, then replaces each prefix (latest only)',async t=>{
 const previous=[{name:'metabase-baselines/r025-collection-monitor/dashboard.json',generation:'7',timeDeleted:'2026-10-27T00:00:00Z'},{name:'metabase-baselines/r025-collection-monitor/dashboard.json',generation:'8',timeDeleted:null},{name:'metabase-baselines/r016-20260922/old-only.json',generation:'9',timeDeleted:null}];
 const root=temp(t),g=fakeGcloud({},previous),m=fakeApi();let asserted=0;
 const uploaded={};
 const texts=[];
 const run=args=>{const out=g.run(args);const [src,dst]=args.slice(-2);if(args[1]==='rsync'&&String(dst).startsWith('gs://')){const list=fs.readdirSync(src,{recursive:true}).filter(f=>fs.statSync(path.join(src,f)).isFile()).sort();uploaded[dst.slice(BUCKET.length+1)]=list;for(const f of list)texts.push([f,fs.readFileSync(path.join(src,f),'utf8')]);}return out;};
 const summary=await refreshBaselines({api:m.api,assertSource:async()=>{asserted++},key:'mb_synthetic_key',env:{MW_PRIVATE_ROOT:root},run,context:{r025Tab:19}});
 assert.equal(asserted,1);
 assert.deepEqual(Object.keys(summary),[...Object.keys(BASELINES),'pruned']);
 const rsyncs=g.calls.filter(c=>c[1]==='rsync');
 assert.deepEqual(rsyncs.map(c=>c.slice(0,5)),Object.keys(BASELINES).map(()=>['storage','rsync','--recursive','--checksums-only','--delete-unmatched-destination-objects']));
 assert.deepEqual(rsyncs.map(c=>c.at(-1)),Object.keys(BASELINES).map(n=>BUCKET+'/'+n));
 assert.deepEqual(uploaded['r025-collection-monitor'],['borrower-view-definition.json','dashboard.json',...[162,69,71,73,77].map(id=>`model-${id}.json`),'permissions.json'].sort());
 const r016=uploaded['r016-20260922'];
 for(const file of ['remaining-pages-before/dashboard.json','cashflow-before/dashboard-3.json','cashflow-before/collection-graph.json','income-before/dashboard.json',
  'income-before/permissions.json','income-symbols-before/dashboard.json','cash-review-before/dashboard.json','cash-review-before/snippets.json','cash-review-before/card-69.json',
  'cash-review-before/card-300.json','cash-snapshot-report-before/card-202.json','cash-snapshot-report-before/collection-graph.json'])assert.ok(r016.includes(path.normalize(file)),file);
 assert.ok(!r016.some(f=>/card-null|undefined/.test(f)));
 assert.deepEqual(uploaded['r035-borrower-pages'],['metabase/dashboard-before.json','metabase/permissions-before.json'].map(path.normalize));
 assert.equal(summary['r016-20260922'].files,r016.length);
 assert.ok(!fs.existsSync(path.join(root,'metabase-baselines-refresh'))||!fs.readdirSync(path.join(root,'metabase-baselines-refresh')).length,'the staging copy is removed');
 assert.equal(m.calls.filter(([,route])=>route==='card/300').length,1,'a card on the dashboard and in no other list is read once');
 // Redaction: no uploaded file keeps a key=/token= value other than <private>, nor the API key.
 assert.equal(texts.length,Object.values(uploaded).flat().length);
 for(const [file,text] of texts){
  for(const [,value] of text.matchAll(/[#?&](?:key|token)=(<private>|[^&#"'\s<>\\]*)/gi))assert.equal(value,'<private>',file);
  assert.ok(!text.includes('SYNTH3TIC')&&!text.includes('mb_synthetic_key'),file);
 }
 const r025=JSON.parse(texts.find(([f])=>f==='dashboard.json')[1]);  // only the R025 set has a top-level dashboard.json
 assert.deepEqual(r025.tabs.map(t=>t.id),[9],'the R025 tab is dropped from the R025 baseline');
 assert.deepEqual(r025.parameters.map(p=>p.id),['cash-date'],'the R025 detail filters are dropped too');
 assert.deepEqual(JSON.parse(texts.find(([f])=>f==='borrower-view-definition.json')[1]).rows[0][0],"SELECT 'Long Overdue'",'stored as rows[0][0], as Verify-CollectionMonitor reads it');assert.ok(r025.dashcards.every(c=>c.dashboard_tab_id===9));
 assert.ok(texts.some(([,t])=>t.includes('#key=<private>&detail=32:382')),'the iframe keeps its shape');
 // Latest only: every noncurrent generation (the old 7 and 8, the dropped old-only.json) is deleted by #generation; the new set stays.
 const removed=g.calls.filter(c=>c[1]==='rm').flatMap(c=>c.slice(2));
 assert.deepEqual(removed.sort(),['metabase-baselines/r016-20260922/old-only.json#9','metabase-baselines/r025-collection-monitor/dashboard.json#7','metabase-baselines/r025-collection-monitor/dashboard.json#8'].map(n=>BUCKET.slice(0,BUCKET.lastIndexOf('/metabase-baselines'))+'/'+n).sort());
 assert.ok(g.versions.every(v=>!v.timeDeleted));assert.equal(g.versions.length,Object.values(uploaded).flat().length);
 assert.deepEqual(summary.pruned,{deletedNoncurrent:3,current:g.versions.length});
 assert.ok(g.calls.findIndex(c=>c[1]==='rm')>g.calls.findLastIndex(c=>c[1]==='rsync'),'pruning only after every upload');
});

test('refresh: a file carrying the API key, a failed view query or a failed source assertion uploads nothing',async t=>{
 const root=temp(t);
 for(const [options,pattern] of [[{api:fakeApi({secret:'mb_synthetic_key'}).api},/contains the Metabase API key/],[{api:fakeApi({viewStatus:'failed'}).api},/View definition query failed/],
  [{api:fakeApi().api,assertSource:async()=>{throw Error('Unexpected reporting source')}},/Unexpected reporting source/]]){
  const g=fakeGcloud();
  await assert.rejects(refreshBaselines({assertSource:async()=>{},key:'mb_synthetic_key',env:{MW_PRIVATE_ROOT:root},run:g.run,...options}),pattern);
  assert.deepEqual(g.calls,[],'no upload');
 }
 await assert.rejects(refreshBaselines({api:fakeApi().api,assertSource:async()=>{},env:{MW_PRIVATE_ROOT:root},run:fakeGcloud().run,names:['nope']}),/Unknown baseline/);
});

test('importing the readers never syncs; diagnostics stay outside the synced baselines',async()=>{
 const monitor=await import('../../project/scripts/metabase/CollectionMonitor.mjs');
 assert.deepEqual(R025_PARAMETERS,monitor.parameters.map(p=>p.id),'the dropped filters are exactly the R025 ones');
 for(const name of ['CashReviewPages','CashSnapshotReport']){const m=await import(`../../project/scripts/metabase/${name}.mjs`);
  assert.equal(m.backup,undefined,name+' resolves nothing on import');assert.equal(typeof m.useBaseline,'function');assert.throws(()=>m.prior('dashboard'),/await useBaseline\(\) first/);}
 assert.equal(typeof monitor.baseline,'function');assert.equal(monitor.BASELINE,'r025-collection-monitor');assert.equal('backup' in monitor,false);
 assert.equal(diagnosticsDir('r016-20260922',{MW_PRIVATE_ROOT:'/p'}),path.join('/p','metabase-diagnostics','r016-20260922'));
 const sources=['Verify-CollectionMonitor','Verify-RemainingPages','Verify-BorrowerPages','Verify-CashReview','Verify-CashSnapshotReport','Verify-CashflowPage','Verify-IncomePage','Verify-IncomeSymbols','CollectionMonitor','CashReviewPages','CashSnapshotReport']
  .map(name=>[name,fs.readFileSync(new URL(`../../project/scripts/metabase/${name}.mjs`,import.meta.url),'utf8')]);
 for(const [name,text] of sources){assert.match(text,/baselineDir|baseline\(\)|Baselines\.mjs|from '\.\/CashSnapshotReport\.mjs'/,name);assert.doesNotMatch(text,/C:\/Users\/MWCredit\/Documents\/ChatGPT\/AppSheet-Loan-Project\/(r016|r025|r035)/,name);}
});

test('redaction: placeholder form, idempotent, and the verifiers compare redacted GETs only',async()=>{
 assert.equal(redact(IFRAME),IFRAME.replace('SYNTH3TIC-chart-secret','<private>'));
 assert.equal(redact(LINK),'https://reports.example/embed?token=<private>&theme=night');
 assert.deepEqual(redact(redact({a:[IFRAME,{b:LINK}],n:1,z:null})),redact({a:[IFRAME,{b:LINK}],n:1,z:null}));
 assert.equal(redact('monkey=1 and keys=2'),'monkey=1 and keys=2');
 assert.ok(embeddedSecret(JSON.stringify(IFRAME)));assert.ok(!embeddedSecret(JSON.stringify(redact(IFRAME))));
 const raw=async(method,route)=>method==='GET'?{iframe:IFRAME,route}:{rows:[[LINK]]};
 const api=redactedReads(raw);
 assert.equal((await api('GET','dashboard/3')).iframe,redact(IFRAME));
 assert.equal((await api('POST','dataset',{})).rows[0][0],LINK,'query results are not altered');
 assert.throws(()=>withoutTab({tabs:[{id:9}],dashcards:[]},19),/R025 collection tab 19/);
});

test('refresh refuses a file that would keep an unredacted embedded value (e.g. in a property name) and uploads nothing',async t=>{
 const root=temp(t),g=fakeGcloud();
 const api=async(_method,route)=>route==='collection/graph'?{'https://x/#key=abc':1}:{tabs:[],dashcards:[]};
 await assert.rejects(refreshBaselines({api,assertSource:async()=>{},env:{MW_PRIVATE_ROOT:root},run:g.run,names:['r035-borrower-pages']}),/embedded key=\/token= value is not redacted/);
 assert.deepEqual(g.calls,[]);
});

test('pruneNoncurrent: deletes only noncurrent generations by #generation, refuses anything outside the prefix, confirms',()=>{
 const g=fakeGcloud({},[{name:'metabase-baselines/a.json',generation:'1',timeDeleted:'t'},{name:'metabase-baselines/a.json',generation:'2',timeDeleted:null},{name:'metabase-baselines/b/c.json',generation:'3',timeDeleted:'t'}]);
 assert.deepEqual(pruneNoncurrent({run:g.run,expectCurrent:1}),{deletedNoncurrent:2,current:1});
 assert.deepEqual(g.versions.map(v=>v.name+'#'+v.generation),['metabase-baselines/a.json#2']);
 assert.ok(g.calls.filter(c=>c[1]==='rm').flatMap(c=>c.slice(2)).every(u=>/#\d+$/.test(u)));
 assert.deepEqual(pruneNoncurrent({run:g.run}),{deletedNoncurrent:0,current:1});
 const outside=fakeGcloud({},[{name:'prod-backups/x.dump',generation:'5',timeDeleted:'t'}]);
 assert.throws(()=>pruneNoncurrent({run:outside.run}),/outside the baseline prefix/);assert.ok(!outside.calls.some(c=>c[1]==='rm'));
 const other=fakeGcloud({},[{name:'metabase-baselines/a.json',generation:'5',timeDeleted:'t',bucket:'another-bucket'}]);
 assert.throws(()=>pruneNoncurrent({run:other.run}),/outside the baseline prefix/);
 assert.throws(()=>pruneNoncurrent({run:fakeGcloud({},[{name:'metabase-baselines/a.json',generation:'2',timeDeleted:null}]).run,expectCurrent:2}),/Expected 2 current/);
 const stuck=fakeGcloud({},[{name:'metabase-baselines/a.json',generation:'1',timeDeleted:'t'}]);const run=args=>args[1]==='rm'?'':stuck.run(args);
 assert.throws(()=>pruneNoncurrent({run}),/1 noncurrent baseline generations remain/);
});

test('baselineDir mirrors the bucket (stale local files go, this directory only) and refuses a set missing an expected file',async t=>{
 const root=temp(t),full=Object.fromEntries(REQUIRED['r025-collection-monitor'].map(f=>[f,'{}'])),env={MW_PRIVATE_ROOT:root};
 const local=path.join(root,'metabase-baselines','r025-collection-monitor'),sibling=path.join(root,'metabase-baselines','r016-20260922');
 fs.mkdirSync(local,{recursive:true});fs.mkdirSync(sibling,{recursive:true});fs.writeFileSync(path.join(local,'completed-dashboard.json'),'stale');fs.writeFileSync(path.join(sibling,'keep.json'),'x');
 await baselineDir('r025-collection-monitor',{env,run:fakeGcloud({'r025-collection-monitor':full}).run});
 assert.ok(!fs.existsSync(path.join(local,'completed-dashboard.json')),'stale local file removed');assert.ok(fs.existsSync(path.join(sibling,'keep.json')),'other directories untouched');
 const partial={...full};delete partial['model-162.json'];
 await assert.rejects(baselineDir('r025-collection-monitor',{env,run:fakeGcloud({'r025-collection-monitor':partial}).run}),/missing 1 expected file\(s\), e.g. model-162.json/);
 const r016=Object.fromEntries(REQUIRED['r016-20260922'].map(f=>[f,'{}']));
 await assert.rejects(baselineDir('r016-20260922',{env,run:fakeGcloud({'r016-20260922':r016}).run}),new RegExp(`fewer than the minimum ${MINIMUM['r016-20260922']}`));
});

test('refresh never uploads or deletes from an empty or partial capture',async t=>{
 const root=temp(t);
 for(const [api,pattern] of [[fakeApi({dashboardCards:10}).api,/r016-20260922 has \d+ files, fewer than the minimum/],[async(_method,route)=>route==='dataset'?{status:'completed',data:{rows:[['x']]}}:{tabs:[{id:19}],dashcards:[]},/r016-20260922 has \d+ files, fewer than the minimum/]]){
  const g=fakeGcloud();
  await assert.rejects(refreshBaselines({api,assertSource:async()=>{},env:{MW_PRIVATE_ROOT:root},run:g.run,context:{r025Tab:19}}),pattern);
  assert.deepEqual(g.calls,[],'no rsync, no rm');
 }
});
