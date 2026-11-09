// Loan Reports decommission (owner, 9 November 2026: "decommission the old dashboards"). Archiving only: reversible, nothing is
// deleted. Dashboard 3 is renamed "Loan Reports · retired 2026-11-09" and archived with dashboards 1-31 (1 was already archived);
// then the questions placed only on those dashboards that nothing kept still reaches are archived; dashboard 32 becomes
// "Loan Reports" and collection 10 "Loan Reports · dashboard". The plan never archives models: it lists unreferenced ones.
//  --plan    private baseline (once, outside Git) and the plan; the sanitized evidence file with applied:false.
//  --apply   recomputes the plan, refuses on drift or a subscription/alert stop condition, renames, archives, records.
//  --models  after --apply, on the owner's later instruction: archives the unreferenced models 76, 319 and 320 (MODELS).
//  --verify  end state: archived flags, names, homepage, no active card depending on an archived one, the matrix iframe.
// Reachability as Retire-StatementObjects.mjs: roots are the kept dashboards (dashcards, series, visualizer sources, click
// targets, filter value sources), question 276 (Grafana probe), subscriptions/alerts, every model in collection 8 and every
// active question that is not a candidate; the closure follows card__n, {{#n}}, card ids and snippet references.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,privateDirFor,root} from './ReportingApi.mjs';

export const DATE='2026-11-09';
export const RETIRE=Array.from({length:31},(_,i)=>i+1);
export const KEEP=32,COLLECTION=10,LOAN_REPORTS_COLLECTION=5,MODELS_COLLECTION=8,PROBE=276;
export const NAMES={dashboard3:`Loan Reports · retired ${DATE}`,dashboard32:'Loan Reports',collection10:'Loan Reports · dashboard',collection5:'Loan Reports'};
const priv=privateDirFor('loan-reports-decommission-20261109');
const evidencePath=`${root}/outputs/loan-reports-redesign-20261026/decommission-${DATE}.json`;
const savePriv=(n,x)=>fs.writeFileSync(`${priv}/${n}.json`,JSON.stringify(x,null,1)+'\n');
const readEvidence=()=>fs.existsSync(evidencePath)?JSON.parse(fs.readFileSync(evidencePath,'utf8')):null;
const writeEvidence=x=>fs.writeFileSync(evidencePath,JSON.stringify(x,null,2)+'\n');

// Card ids a value names: card__n, {{#n}}, visualizer "card:n" sources, card-id/card_id/source-card keys, question click targets.
export function refs(value){
 const found=new Set();
 const walk=v=>{
  if(typeof v==='string'){for(const m of v.matchAll(/(?:card__|\{\{#|^card:)(\d+)/g))found.add(Number(m[1]));}
  else if(Array.isArray(v))v.forEach(walk);
  else if(v&&typeof v==='object'){
   if(v.linkType==='question'&&Number.isInteger(v.targetId))found.add(v.targetId);
   for(const [k,x] of Object.entries(v)){if(['card-id','card_id','source-card','source_card_id'].includes(k)&&Number.isInteger(x))found.add(x);else walk(x);}
  }
 };
 walk(value);return found;
}
// Everything a dashboard uses: dashcard and series cards, ids inside dashcard settings, filter value sources.
export function dashboardRefs(d){
 const s=new Set();
 for(const c of d.dashcards??[]){if(c.card_id)s.add(c.card_id);for(const x of c.series??[])if(x.id)s.add(x.id);for(const id of refs(c.visualization_settings))s.add(id);}
 for(const id of refs(d.parameters))s.add(id);
 return s;
}
// Pure plan from an inventory (unit-testable): archive = cards on retired dashboards, minus models, minus anything reachable.
export function plan(inv){
 const retire=new Set(RETIRE),byId=new Map(inv.cards.map(c=>[c.id,c]));
 const kept=inv.dashboards.filter(d=>!retire.has(d.id)&&!d.archived),retired=inv.dashboards.filter(d=>retire.has(d.id));
 assert(kept.some(d=>d.id===KEEP),`dashboard ${KEEP} must stay active`);
 const candidates=new Set();for(const d of retired)for(const id of dashboardRefs(d))if(byId.has(id)&&byId.get(id).type!=='model')candidates.add(id);
 // Subscriptions and alerts: any that targets a retired dashboard or a candidate question stops the run before archiving.
 const consumers=[...inv.pulses,...inv.alerts,...inv.notifications.filter(n=>n.payload_type!=='notification/system-event')];
 const stops=consumers.filter(n=>retire.has(n.dashboard_id)||retire.has(n.payload?.dashboard_id)||[...refs(n)].some(id=>candidates.has(id))).map(n=>({id:n.id,kind:n.payload_type??(n.alert_condition?'alert':'pulse'),dashboard:n.dashboard_id??n.payload?.dashboard_id??null}));
 const visit=(roots)=>{
  const seen=new Set();
  const go=id=>{if(seen.has(id))return;seen.add(id);const c=byId.get(id);if(!c)return;
   for(const r of refs([c.dataset_query,c.parameters]))go(r);for(const r of refs(c.visualization_settings))go(r);
   const text=JSON.stringify(c.dataset_query);for(const s of inv.snippets)if(text.includes('snippet: '+s.name)||text.includes('"snippet-id":'+s.id))for(const r of refs(s.content))go(r);};
  for(const id of roots)go(id);return seen;
 };
 const liveRoots=new Set([PROBE,...kept.flatMap(d=>[...dashboardRefs(d)]),...consumers.flatMap(n=>[...refs(n)])]);
 const models=inv.cards.filter(c=>c.type==='model');
 const roots=new Set([...liveRoots,...models.filter(c=>c.collection_id===MODELS_COLLECTION).map(c=>c.id),...inv.cards.filter(c=>!candidates.has(c.id)).map(c=>c.id)]);
 const reachable=visit(roots),live=visit(liveRoots);
 const card=c=>({id:c.id,name:c.name,display:c.display,collection_id:c.collection_id});
 const archive=[...candidates].filter(id=>!reachable.has(id)).sort((a,b)=>a-b).map(id=>card(byId.get(id)));
 const retained=[...candidates].filter(id=>reachable.has(id)).sort((a,b)=>a-b);
 return {
  dashboards:retired.map(d=>({id:d.id,name:d.name,archived:!!d.archived,collection_id:d.collection_id,dashcards:d.dashcards?.length??0})),
  archiveCards:archive,
  retainedCandidates:{count:retained.length,onLiveDashboardOrProbe:retained.filter(id=>live.has(id)).length,otherDependents:retained.filter(id=>!live.has(id))},
  unreferencedModels:models.filter(c=>!live.has(c.id)).map(card),
  models:models.length,consumers:consumers.length,stops,
 };
}
async function inventory(){
 const cards=[];for(const c of await api('GET','card'))cards.push(c.dataset_query&&c.visualization_settings?c:await api('GET','card/'+c.id));
 const dashboards=[];for(const id of RETIRE)dashboards.push(await api('GET','dashboard/'+id));
 for(const x of await api('GET','dashboard'))if(!RETIRE.includes(x.id))dashboards.push(await api('GET','dashboard/'+x.id));
 return {cards:cards.filter(c=>!c.archived),dashboards,snippets:await api('GET','native-query-snippet'),
  notifications:await api('GET','notification?include_inactive=true'),pulses:await api('GET','pulse'),alerts:await api('GET','alert'),
  homepage:{enabled:await api('GET','setting/custom-homepage'),dashboard:await api('GET','setting/custom-homepage-dashboard')},
  collections:Object.fromEntries(await Promise.all([LOAN_REPORTS_COLLECTION,COLLECTION,MODELS_COLLECTION].map(async id=>[id,await api('GET','collection/'+id)])))};
}
const summary=p=>({dashboards:p.dashboards.length,alreadyArchived:p.dashboards.filter(d=>d.archived).map(d=>d.id),archiveCards:p.archiveCards.length,
 retainedCandidates:p.retainedCandidates,unreferencedModels:p.unreferencedModels.map(m=>m.id),models:p.models,consumers:p.consumers,stops:p.stops});
const args=process.argv.slice(2);
if(args.includes('--plan')||args.includes('--apply')){
 await assertSource();fs.mkdirSync(priv,{recursive:true});
 const prior=readEvidence();assert(!prior?.applied,'Decommission already applied: keep its evidence; use --verify (rollback: the evidence file\'s rollback lists)');
 const inv=await inventory(),p=plan(inv);
 // The private baseline is written once, before any change: dashboards 1-31, all active cards, snippets, consumers, homepage.
 if(!fs.existsSync(`${priv}/baseline.json`))savePriv('baseline',{at:new Date().toISOString(),...inv});
 savePriv('plan',p);
 const evidence={at:new Date().toISOString(),owner_instruction:`${DATE}: decommission the old dashboards (archive, reversible; never hard delete)`,
  applied:false,renames:[{object:'dashboard',id:3,from:inv.dashboards.find(d=>d.id===3).name,to:NAMES.dashboard3},{object:'dashboard',id:KEEP,from:inv.dashboards.find(d=>d.id===KEEP).name,to:NAMES.dashboard32},{object:'collection',id:COLLECTION,from:inv.collections[COLLECTION].name,to:NAMES.collection10}],
  homepage_dashboard:inv.homepage.dashboard,...p,private_baseline:'baseline.json in the private directory loan-reports-decommission-20261109 (outside Git)'};
 if(args.includes('--plan')){writeEvidence(evidence);console.log(JSON.stringify(summary(p),null,1));}
 else{
  const planned=JSON.parse(fs.readFileSync(`${priv}/plan.json`,'utf8'));
  assert.deepEqual(p.archiveCards.map(c=>c.id),planned.archiveCards.map(c=>c.id),'plan drift: run --plan and review again');
  if(p.stops.length)throw Error('Stop: a subscription or alert targets a dashboard or question to archive: '+JSON.stringify(p.stops));
  assert.equal(Number(inv.homepage.dashboard),KEEP,'homepage must be dashboard 32 before the decommission');
  assert.equal(inv.collections[LOAN_REPORTS_COLLECTION].name,NAMES.collection5);
  const after={dashboards:{},cards:{}};
  await api('PUT','dashboard/3',{name:NAMES.dashboard3});
  for(const d of p.dashboards){if(!d.archived)await api('PUT','dashboard/'+d.id,{archived:true});after.dashboards[d.id]=(await api('GET','dashboard/'+d.id)).archived;}
  for(const c of p.archiveCards){await api('PUT','card/'+c.id,{archived:true});after.cards[c.id]=(await api('GET','card/'+c.id)).archived;}
  await api('PUT','dashboard/'+KEEP,{name:NAMES.dashboard32});await api('PUT','collection/'+COLLECTION,{name:NAMES.collection10});
  const gone=new Set(p.archiveCards.map(c=>c.id)),broken=[];
  for(const c of await api('GET','card'))if(!c.archived)for(const id of refs([c.dataset_query,c.parameters,c.visualization_settings]))if(gone.has(id))broken.push([c.id,id]);
  assert.deepEqual(broken,[],'an active question depends on an archived one');
  Object.assign(evidence,{applied:true,applied_at:new Date().toISOString(),
   dashboards:p.dashboards.map(d=>({...d,archived_before:d.archived,archived_after:after.dashboards[d.id]})).map(({archived,...d})=>d),
   archiveCards:p.archiveCards.map(c=>({...c,archived_before:false,archived_after:after.cards[c.id]})),
   rollback:{unarchive_dashboards:p.dashboards.filter(d=>!d.archived).map(d=>d.id),unarchive_cards:p.archiveCards.map(c=>c.id),
    renames:evidence.renames.map(r=>({...r,from:r.to,to:r.from})),
    how:'PUT card/<id> and dashboard/<id> {"archived":false}; PUT the renames back; any dashcard Metabase dropped is restored from the private baseline (PUT dashboard/<id> dashcards).'}});
  writeEvidence(evidence);
  console.log(JSON.stringify({applied:true,dashboards:Object.keys(after.dashboards).length,cards:Object.keys(after.cards).length,allArchived:Object.values(after.dashboards).every(Boolean)&&Object.values(after.cards).every(Boolean)}));
 }
}
// Owner, 9 November 2026: "archive the three unused models too". Only these ids, only while the live plan still lists exactly
// them as unreferenced and no active question, filter or the chart service query names them; archive only, never delete.
export const MODELS=[76,319,320];
if(args.includes('--models')){
 await assertSource();const e=readEvidence();assert(e?.applied,'run --apply first');assert(!e.archiveModels,'models step already applied');
 const inv=await inventory(),p=plan(inv),byId=new Map(inv.cards.map(c=>[c.id,c]));
 assert.deepEqual(p.unreferencedModels.map(m=>m.id).sort((a,b)=>a-b),MODELS,'the live unreferenced models differ from the owner-approved list');
 const users=inv.cards.filter(c=>!MODELS.includes(c.id)).flatMap(c=>[...refs([c.dataset_query,c.parameters,c.visualization_settings])].filter(id=>MODELS.includes(id)).map(id=>[c.id,id]));
 const filters=inv.dashboards.filter(d=>!d.archived).flatMap(d=>[...dashboardRefs(d)].filter(id=>MODELS.includes(id)).map(id=>[d.id,id]));
 const chartSql=[...refs(fs.readFileSync(`${root}/scripts/metabase/chart_service/query.sql`,'utf8'))].filter(id=>MODELS.includes(id));
 if(users.length||filters.length||chartSql.length||p.stops.length)throw Error('Stop: a model to archive is still referenced: '+JSON.stringify({users,filters,chartSql,stops:p.stops}));
 const done=[];
 for(const id of MODELS){const c=byId.get(id);assert.equal(c.type,'model');await api('PUT','card/'+id,{archived:true});done.push({id,name:c.name,display:c.display,collection_id:c.collection_id,archived_before:false,archived_after:(await api('GET','card/'+id)).archived});}
 Object.assign(e,{archiveModels:done,models_applied_at:new Date().toISOString(),models_owner_instruction:`${DATE}: archive the three unused models too`});
 e.rollback.unarchive_models=MODELS;writeEvidence(e);
 console.log(JSON.stringify({archivedModels:done.map(m=>[m.id,m.archived_after])}));
}
if(args.includes('--verify')){
 await assertSource();const e=readEvidence();assert(e?.applied,'run --apply first');
 const checks=[],check=(name,ok,detail)=>checks.push({name,passed:!!ok,...(detail?{detail}:{})});
 const ds=await Promise.all(RETIRE.map(id=>api('GET','dashboard/'+id)));
 check('dashboards 1-31 archived',ds.every(d=>d.archived),{archived:ds.filter(d=>d.archived).length});
 const d3=ds.find(d=>d.id===3);check('dashboard 3 renamed',d3.name===NAMES.dashboard3);
 const d32=await api('GET','dashboard/'+KEEP),c10=await api('GET','collection/'+COLLECTION),c5=await api('GET','collection/'+LOAN_REPORTS_COLLECTION);
 check('dashboard 32 active and renamed',!d32.archived&&d32.name===NAMES.dashboard32);
 check('collection 10 renamed, collection 5 unchanged',c10.name===NAMES.collection10&&!c10.archived&&c5.name===NAMES.collection5);
 const home=await api('GET','setting/custom-homepage-dashboard'),homeOn=await api('GET','setting/custom-homepage');
 check('homepage is dashboard 32',Number(home)===KEEP&&homeOn===true);
 const archived=new Set(e.archiveCards.map(c=>c.id)),states=await Promise.all([...archived].map(id=>api('GET','card/'+id).then(c=>c.archived)));
 check('planned questions archived',states.every(Boolean),{questions:archived.size});
 const active=(await api('GET','card')).filter(c=>!c.archived),broken=[];
 for(const c of active)for(const id of refs([c.dataset_query,c.parameters,c.visualization_settings]))if(archived.has(id))broken.push([c.id,id]);
 const used=dashboardRefs(d32),dead=[...used].filter(id=>!active.some(c=>c.id===id));
 check('no active question or dashboard 32 card depends on an archived question',!broken.length&&!dead.length,{broken,dead});
 // Models: only the owner-approved unused ones (--models) are archived.
 const gone=e.archiveModels??[],goneIds=new Set(gone.map(m=>m.id)),modelStates=await Promise.all(gone.map(m=>api('GET','card/'+m.id).then(c=>c.archived)));
 const usingModels=active.flatMap(c=>[...refs([c.dataset_query,c.parameters,c.visualization_settings])].filter(id=>goneIds.has(id)).map(id=>[c.id,id]));
 check('only the approved models archived',active.filter(c=>c.type==='model').length===e.models-gone.length&&modelStates.every(Boolean)&&!usingModels.length,{active:active.filter(c=>c.type==='model').length,archived:[...goneIds],usingModels});
 check('copies 419-421 active',[419,420,421].every(id=>active.some(c=>c.id===id)));
 // The matrix iframe of dashboard 32 (copied from dashcard 1501): its page and data answer with the key in its fragment.
 // The key stays in memory; only statuses and a row count are recorded.
 const frame=d32.dashcards.map(c=>c.visualization_settings?.virtual_card?.visualization_settings?.iframe).find(x=>x&&/#key=/.test(x));
 const src=frame&&/src="([^"#]+)#([^"]+)"/.exec(frame),frag=src&&new URLSearchParams(src[2]);
 let iframe={found:!!src};
 if(src){const page=await fetch(src[1],{signal:AbortSignal.timeout(30000)}),data=await fetch(new URL('/api/matrix',src[1]),{headers:{Authorization:'Bearer '+frag.get('key')},signal:AbortSignal.timeout(30000)});
  const body=data.ok?await data.json():null;iframe={found:true,detail:frag.get('detail'),page:page.status,data:data.status,rows:body?.rows?.length??0};}
 check('dashboard 32 matrix iframe works',iframe.page===200&&iframe.data===200&&iframe.rows>0&&iframe.detail===`${KEEP}:382`,iframe);
 e.verification={at:new Date().toISOString(),passed:checks.every(c=>c.passed),checks};writeEvidence(e);
 console.log(JSON.stringify({passed:e.verification.passed,failed:checks.filter(c=>!c.passed)},null,1));
}
