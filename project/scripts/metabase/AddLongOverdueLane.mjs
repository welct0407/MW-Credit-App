// R102: add the "Long overdue" lane (Daily Collection Status 'Long Overdue', V114) to the Collection Monitor
// (dashboard 3, tab 19). Metabase reads PROD only, so --apply runs right after the PROD promotion that installs V114:
//   node AddLongOverdueLane.mjs --prepare   private rollback baseline (refuses to overwrite one)
//   node AddLongOverdueLane.mjs --apply     creates the two lane cards and applies the plan (refuses replay)
//   node AddLongOverdueLane.mjs --verify    read-back against the baseline; then Verify-CollectionMonitor.mjs
//   node AddLongOverdueLane.mjs [--dry-run] offline: builds the plan from a synthetic dashboard; no network
// Changes: model 162 (collection-summary) gains the status in its zero-filled VALUES list; two new questions
// (people scalar, borrower table) built from the shared CollectionMonitor lane specs; the five lanes are re-laid
// out on rows 6 and 8 (widths 5,5,5,5,4); the detail-status filter and the detail row highlights gain the status;
// the remaining-pages scalar "Not paid / overdue" also counts it. No database write; the unclassified card keeps
// expecting 0 because CollectionMonitor's `lanes` now lists the status.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {lanes,specs,shape,out as monitorOut} from './CollectionMonitor.mjs';

export const DASHBOARD=3,TAB=19,DETAIL=248,SUMMARY=162,PARAMETER='collection-detail-status',REMAINING_NAME='Not paid / overdue';
export const LONG={key:'long',status:'Long Overdue'};
export const placementIds={unpaid:[242,243],partial:[244,245],overdue:[240,241],paid:[246,247]};
export const oldStatuses=['Not Paid','Partially Paid','Overdue','Fully Paid'];
export const newStatuses=lanes.map(l=>l.status);
assert.deepEqual(newStatuses,['Not Paid','Partially Paid','Overdue','Long Overdue','Fully Paid'],'CollectionMonitor lanes must list Long Overdue between Overdue and Fully Paid');
const longLane=lanes.find(l=>l.key===LONG.key);
const backup=process.env.MW_METABASE_PRIVATE_DIR?path.join(process.env.MW_METABASE_PRIVATE_DIR,'r102-long-overdue-lane'):'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r102-long-overdue-lane';
const output='outputs/r102-long-overdue-lane';
const main=!!process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]),flag=name=>main&&process.argv.includes(name);
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');

/** Lane widths across the 24-column grid: 5,5,5,5,4 for five lanes. */
export const widths=(n=lanes.length)=>Array.from({length:n},(_,i)=>Math.floor(24/n)+(i<24%n?1:0));
export const columns=(n=lanes.length)=>widths(n).map((_,i)=>widths(n).slice(0,i).reduce((a,b)=>a+b,0));

/** The statuses of the model 162 zero-filled list `FROM (VALUES ('A'),('B'),...) s(status)`, parsed (exactly one list). */
const VALUES_LIST=/FROM \(VALUES ((?:\('[A-Za-z ]+'\),?)+)\) s\(status\)/g;
export function modelStatuses(sql){
 assert.equal(typeof sql,'string','collection-summary SQL missing');
 const found=[...sql.matchAll(VALUES_LIST)];
 assert.equal(found.length,1,'collection-summary VALUES list not in the expected R025 form');
 const tuples=[...found[0][1].matchAll(/\('([A-Za-z ]+)'\)/g)].map(t=>t[1]);
 return {statuses:tuples,start:found[0].index,length:found[0][0].length};
}
/** Model 162: the parsed status list (exactly the four R025 statuses) is re-rendered with 'Long Overdue' after 'Overdue'. */
export function targetModelSql(sql){
 const {statuses,start,length}=modelStatuses(sql);
 assert.deepEqual(statuses,['Fully Paid','Partially Paid','Not Paid','Overdue'],'collection-summary statuses are not the R025 four');
 const next=[...statuses.slice(0,statuses.indexOf('Overdue')+1),LONG.status,...statuses.slice(statuses.indexOf('Overdue')+1)];
 return sql.slice(0,start)+'FROM (VALUES '+next.map(x=>`('${x}')`).join(',')+') s(status)'+sql.slice(start+length);
}
/** The native SQL of a saved query in either stored format: legacy {native:{query}} or MBQL 5 {stages:[native stage]}. */
export function nativeSql(dq){
 if(dq?.type==='native'&&typeof dq.native?.query==='string')return dq.native.query;
 if(dq?.['lib/type']==='mbql/query'&&Array.isArray(dq.stages)&&dq.stages.length===1&&dq.stages[0]['lib/type']==='mbql.stage/native'&&typeof dq.stages[0].native==='string')return dq.stages[0].native;
 throw new assert.AssertionError({message:'model 162 query is in neither known stored format'});
}
/** The same saved query with its native SQL replaced, keeping its stored format and every other key. */
export function withNativeSql(dq,sql){
 nativeSql(dq);const next=structuredClone(dq);
 if(next.type==='native')next.native.query=sql;else next.stages[0].native=sql;
 return next;
}
/** Model 162's dataset_query after R102 (structural: parse, re-render, same format). */
export const targetModelQuery=dq=>withNativeSql(dq,targetModelSql(nativeSql(dq)));
/** New card bodies from the shared lane specs (people scalar and borrower table). */
export function newCards(collectionId){
 return ['count','list'].map(kind=>{const {key,...body}=specs.find(s=>s.key===`${LONG.key}-${kind}`);return {kind,body:{...body,type:'question',collection_id:collectionId}};});
}
/** Tab 19 placements: every lane on rows 6 (people) and 8 (borrowers) in lane order, new lane placements added. */
export function targetCards(dashboard,ids){
 const byKey={...placementIds,[LONG.key]:[ids.count,ids.list]},col=columns(),w=widths();
 const template=dashboard.dashcards.filter(c=>placementIds.overdue.includes(c.card_id));
 assert.equal(template.length,2,'overdue lane placements');
 const added=[ids.count,ids.list].map((cardId,i)=>{const t=template.find(c=>c.card_id===placementIds.overdue[i]);
  return {id:-1-i,card_id:cardId,dashboard_tab_id:TAB,col:0,row:t.row,size_x:t.size_x,size_y:t.size_y,series:[],parameter_mappings:[],visualization_settings:structuredClone(t.visualization_settings??{})};});
 return [...dashboard.dashcards,...added].map(card=>{
  const index=lanes.findIndex(l=>byKey[l.key].includes(card.card_id));
  if(index<0)return card;
  assert.equal(card.dashboard_tab_id,TAB);assert.ok(card.row===6||card.row===8);
  return {...card,col:col[index],size_x:w[index]};
 });
}
export const targetParameters=dashboard=>dashboard.parameters.map(p=>p.id===PARAMETER?{...p,values_source_config:{...p.values_source_config,values:newStatuses}}:p);
export function targetDetail(detail){
 const settings=structuredClone(detail.visualization_settings),rules=settings['table.column_formatting'];
 assert.deepEqual(rules.map(r=>r.value),oldStatuses,'detail highlight rules not in the R036 order');
 settings['table.column_formatting']=newStatuses.map(status=>rules.find(r=>r.value===status)??{columns:['Daily Collection Status'],type:'single',operator:'=',value:status,color:longLane.pale,highlight_row:true});
 return settings;
}
/** "Not paid / overdue": ['or', Not Paid, Overdue] gains a Long Overdue clause cloned from the Overdue one. Legacy MBQL
 * ({query:{filter}}) and MBQL 5 ({stages:[{filters:[['or',{lib/uuid},clause,clause]]}]}, where a clause is
 * ['=',{lib/uuid},['field',{…,lib/uuid},'Daily Collection Status'],'Status']) are parsed; anything else is refused. The new
 * MBQL 5 clause gets fresh lib/uuid values. */
export function remainingStatuses(dq){
 if(Array.isArray(dq?.query?.filter)){const f=dq.query.filter;assert.ok(f[0]==='or'&&f.length>=3&&f.slice(1).every(c=>Array.isArray(c)&&c[0]==='='&&c[1]?.[1]==='Daily Collection Status'),'remaining-pages filter not in the expected form');return {format:'legacy',statuses:f.slice(1).map(c=>c[2])};}
 const stage=dq?.['lib/type']==='mbql/query'&&Array.isArray(dq.stages)&&dq.stages.length===1?dq.stages[0]:null;
 assert.ok(stage&&stage['lib/type']==='mbql.stage/mbql'&&stage['source-card']===77&&Array.isArray(stage.filters)&&stage.filters.length===1,'remaining-pages filter not in the expected form');
 const f=stage.filters[0],uuid=x=>typeof x?.['lib/uuid']==='string';
 assert.ok(Array.isArray(f)&&f[0]==='or'&&uuid(f[1])&&f.length>=4,'remaining-pages filter not in the expected form');
 for(const c of f.slice(2))assert.ok(Array.isArray(c)&&c.length===4&&c[0]==='='&&uuid(c[1])&&Array.isArray(c[2])&&c[2][0]==='field'&&uuid(c[2][1])&&c[2][1]['base-type']==='type/Text'&&c[2][2]==='Daily Collection Status'&&typeof c[3]==='string','remaining-pages filter clause not in the expected form');
 return {format:'mbql5',statuses:f.slice(2).map(c=>c[3])};
}
export function targetRemainingQuery(dq){
 const {format,statuses}=remainingStatuses(dq);
 assert.deepEqual(statuses,['Not Paid','Overdue'],'remaining-pages filter does not name exactly Not Paid and Overdue');
 const next=structuredClone(dq);
 if(format==='legacy'){const clause=structuredClone(next.query.filter[2]);clause[2]=LONG.status;next.query.filter.push(clause);return next;}
 const f=next.stages[0].filters[0],clause=structuredClone(f[3]);
 clause[1]={...clause[1],'lib/uuid':randomUUID()};clause[2]=[clause[2][0],{...clause[2][1],'lib/uuid':randomUUID()},clause[2][2]];clause[3]=LONG.status;
 f.push(clause);return next;
}
/** Card 251 "Unclassified people · expected 0": its not-equals list names the classified statuses; R102 adds Long Overdue so
 * the guard counts only unknown statuses again. MBQL 5 ([['not',{lib/uuid},['=',{lib/uuid},['field',{…},'Daily Collection
 * Status'],...statuses]]]) and legacy MBQL (['not',['=',['field','Daily Collection Status',{…}],...statuses]]) are parsed;
 * the statuses must be exactly the four R025 ones (any order); anything else is refused. */
export const UNCLASSIFIED=251;
export function unclassifiedStatuses(dq){
 if(dq?.query?.filter){const f=dq.query.filter;assert.ok(Array.isArray(f)&&f[0]==='not'&&f.length===2&&Array.isArray(f[1])&&f[1][0]==='='&&f[1][1]?.[1]==='Daily Collection Status'&&f[1].length>=3,'unclassified filter not in the expected form');return {format:'legacy',statuses:f[1].slice(2)};}
 const stage=dq?.['lib/type']==='mbql/query'&&Array.isArray(dq.stages)&&dq.stages.length===1?dq.stages[0]:null,uuid=x=>typeof x?.['lib/uuid']==='string';
 assert.ok(stage&&stage['lib/type']==='mbql.stage/mbql'&&stage['source-card']===77&&Array.isArray(stage.filters)&&stage.filters.length===1,'unclassified filter not in the expected form');
 const f=stage.filters[0],eq=f?.[2];
 assert.ok(Array.isArray(f)&&f.length===3&&f[0]==='not'&&uuid(f[1])&&Array.isArray(eq)&&eq[0]==='='&&uuid(eq[1])&&Array.isArray(eq[2])&&eq[2][0]==='field'&&uuid(eq[2][1])&&eq[2][2]==='Daily Collection Status'&&eq.length>=4&&eq.slice(3).every(x=>typeof x==='string'),'unclassified filter not in the expected form');
 return {format:'mbql5',statuses:eq.slice(3)};
}
export function targetUnclassifiedQuery(dq){
 const {format,statuses}=unclassifiedStatuses(dq);
 assert.deepEqual([...statuses].sort(),[...oldStatuses].sort(),'unclassified filter does not list exactly the four R025 statuses');
 const next=structuredClone(dq);
 if(format==='legacy')next.query.filter[1].push(LONG.status);else next.stages[0].filters[0][2].push(LONG.status);
 return next;
}
/** A saved query with every lib/uuid removed (Metabase may regenerate them); for read-back comparisons. */
export const withoutUuids=value=>Array.isArray(value)?value.map(withoutUuids):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>k!=='lib/uuid').map(([k,v])=>[k,withoutUuids(v)])):value;

async function live(){
 const {api,assertSource}=await import('./ReportingApi.mjs');
 await assertSource();
 const dashboard=await api('GET',`dashboard/${DASHBOARD}`),detail=await api('GET',`card/${DETAIL}`),summary=await api('GET',`card/${SUMMARY}`);
 const remaining=(await api('GET','card?f=all')).filter(c=>c.name===REMAINING_NAME&&!c.archived);
 assert.equal(remaining.length,1,`exactly one live "${REMAINING_NAME}" question`);
 return {api,dashboard,detail,summary,remaining:remaining[0]};
}
/** The two live lane questions --apply created ({count, list}), or null before the R102 apply. */
export function longLaneCards(){
 if(!fs.existsSync(`${backup}/state.json`))return null;
 const {cards}=JSON.parse(fs.readFileSync(`${backup}/state.json`,'utf8'));
 return {count:cards['long-count'],list:cards['long-list']};
}

/** The live state --prepare and --plan accept: tab 19 (stable id; its number prefix changes) is the Collection Monitor,
 * the lane placements are R036's, and every rewrite target parses. */
function preflight({dashboard,detail,summary,remaining}){
 assert.match(dashboard.tabs.find(t=>t.id===TAB)?.name??'',/Collection Monitor$/,'tab 19 is not the Collection Monitor');
 assert.deepEqual(dashboard.parameters.find(p=>p.id===PARAMETER).values_source_config.values,oldStatuses);
 const placed=dashboard.dashcards.filter(c=>Object.values(placementIds).flat().includes(c.card_id));
 assert.deepEqual(placed.map(c=>[c.card_id,c.dashboard_tab_id,c.row,c.col,c.size_x]).sort((a,b)=>a[0]-b[0]),
  [[240,19,6,12,6],[241,19,8,12,6],[242,19,6,0,6],[243,19,8,0,6],[244,19,6,6,6],[245,19,8,6,6],[246,19,6,18,6],[247,19,8,18,6]],'lane placements are not the R036 ones');
 return {detail:targetDetail(detail),model:targetModelQuery(summary.dataset_query),remaining:targetRemainingQuery(remaining.dataset_query)};
}
if(flag('--plan')){
 // Read-only: the exact change per object, from the live state (nothing is written).
 const state=await live(),t=preflight(state);
 const lanePlacements=targetCards(state.dashboard,{count:'NEW-count',list:'NEW-list'}).filter(c=>[...Object.values(placementIds).flat(),'NEW-count','NEW-list'].includes(c.card_id));
 console.log(JSON.stringify({plan:true,
  'card 162 (model)':{statuses:{before:modelStatuses(nativeSql(state.summary.dataset_query)).statuses,after:modelStatuses(nativeSql(t.model)).statuses},otherQueryKeysUnchanged:JSON.stringify(withNativeSql(t.model,''))===JSON.stringify(withNativeSql(state.summary.dataset_query,''))},
  [`card ${state.remaining.id} (Not paid / overdue)`]:{statuses:{before:remainingStatuses(state.remaining.dataset_query).statuses,after:remainingStatuses(t.remaining).statuses}},
  'card 248 (detail) highlight rules':{before:state.detail.visualization_settings['table.column_formatting'].map(r=>r.value),after:t.detail['table.column_formatting'].map(r=>r.value)},
  'dashboard 3 parameter collection-detail-status':{before:state.dashboard.parameters.find(p=>p.id===PARAMETER).values_source_config.values,after:newStatuses},
  'dashboard 3 tab 19 lane placements [card,row,col,width]':lanePlacements.map(c=>[c.card_id,c.row,c.col,c.size_x]).sort((a,b)=>a[1]-b[1]||a[2]-b[2]),
  'new cards':newCards(null).map(c=>c.body.name)},null,1));
}
if(flag('--prepare')){
 const {dashboard,detail,summary,remaining}=await live();
 preflight({dashboard,detail,summary,remaining});
 fs.mkdirSync(backup,{recursive:true});
 assert.ok(!fs.existsSync(`${backup}/before.json`),'Existing rollback snapshot must not be overwritten');
 write(`${backup}/before.json`,{dashboard,detail,summary,remaining});
 console.log('R102 rollback baseline captured privately');
}

if(flag('--apply')){
 const {api,dashboard,detail,summary,remaining}=await live();
 const before=JSON.parse(fs.readFileSync(`${backup}/before.json`,'utf8'));
 assert.ok(!fs.existsSync(`${backup}/state.json`),'Already applied: refusing replay (use --verify)');
 assert.deepEqual(shape(dashboard.dashcards),shape(before.dashboard.dashcards),'dashboard changed since --prepare');
 assert.deepEqual(summary.dataset_query,before.summary.dataset_query,'model 162 changed since --prepare');
 const collectionId=(await api('GET',`card/${placementIds.overdue[0]}`)).collection_id;
 const state={at:new Date().toISOString(),cards:{}};
 for(const {kind,body} of newCards(collectionId)){state.cards[`${LONG.key}-${kind}`]=(await api('POST','card',body)).id;write(`${backup}/state.json`,state);}
 await api('PUT',`card/${SUMMARY}`,{dataset_query:targetModelQuery(summary.dataset_query)});
 await api('PUT',`dashboard/${DASHBOARD}/cards`,{tabs:dashboard.tabs,cards:targetCards(dashboard,{count:state.cards['long-count'],list:state.cards['long-list']})});
 await api('PUT',`dashboard/${DASHBOARD}`,{parameters:targetParameters(dashboard)});
 await api('PUT',`card/${DETAIL}`,{visualization_settings:targetDetail(detail)});
 await api('PUT',`card/${remaining.id}`,{dataset_query:targetRemainingQuery(remaining.dataset_query)});
 // Verify-CollectionMonitor.mjs reads the R025 state: record the two new lane questions there too.
 const monitorState=path.join(monitorOut,'state.json');
 if(fs.existsSync(monitorState)){const s=JSON.parse(fs.readFileSync(monitorState,'utf8'));Object.assign(s.cards,state.cards);write(monitorState,s);}
 console.log(`Long overdue lane installed: cards ${state.cards['long-count']} and ${state.cards['long-list']}`);
}

if(flag('--verify')){
 const {dashboard,detail,summary,remaining}=await live();
 const before=JSON.parse(fs.readFileSync(`${backup}/before.json`,'utf8')),state=JSON.parse(fs.readFileSync(`${backup}/state.json`,'utf8'));
 const ids={count:state.cards['long-count'],list:state.cards['long-list']};
 const expected=targetCards(before.dashboard,ids),strip=cards=>shape(cards.map(c=>({...c,id:c.id<0?0:c.id}))).map(({id,...c})=>c);
 const ours=new Set([...Object.values(placementIds).flat(),ids.count,ids.list]);
 assert.deepEqual(strip(dashboard.dashcards.filter(c=>!ours.has(c.card_id))),strip(expected.filter(c=>!ours.has(c.card_id))),'other placements unchanged');
 const lanesAt=row=>dashboard.dashcards.filter(c=>c.dashboard_tab_id===TAB&&c.row===row&&ours.has(c.card_id)).sort((a,b)=>a.col-b.col);
 assert.deepEqual(lanesAt(6).map(c=>c.card_id),[242,244,240,ids.count,246]);
 assert.deepEqual(lanesAt(8).map(c=>c.card_id),[243,245,241,ids.list,247]);
 assert.deepEqual(lanesAt(6).map(c=>[c.col,c.size_x]),columns().map((c,i)=>[c,widths()[i]]));
 assert.deepEqual(dashboard.parameters,targetParameters(before.dashboard));
 assert.deepEqual(detail.visualization_settings,targetDetail(before.detail));
 assert.equal(nativeSql(summary.dataset_query),targetModelSql(nativeSql(before.summary.dataset_query)));
 assert.deepEqual(modelStatuses(nativeSql(summary.dataset_query)).statuses,['Fully Paid','Partially Paid','Not Paid','Overdue','Long Overdue']);
 assert.deepEqual(remainingStatuses(remaining.dataset_query).statuses,['Not Paid','Overdue','Long Overdue']);
 assert.deepEqual(withoutUuids(remaining.dataset_query),withoutUuids(targetRemainingQuery(before.remaining.dataset_query)));
 fs.mkdirSync(output,{recursive:true});
 write(`${output}/verification.json`,{at:new Date().toISOString(),dashboard:DASHBOARD,tab:TAB,statusOrder:newStatuses,cards:state.cards,
  checks:['Five lanes on rows 6 and 8 in status order, widths 5/5/5/5/4','Other placements unchanged','Detail filter and highlights list Long Overdue','Model 162 zero-fills Long Overdue','Not paid / overdue counts Long Overdue'],databaseChanges:false});
 console.log('R102 long overdue lane checks passed; run Verify-CollectionMonitor.mjs next');
}

// R102 follow-up step (card 251): the main --apply left the unclassified guard listing four statuses. Same guards: a
// private before-copy that is never overwritten, a read-only plan, a refused replay and a read-back.
const UNCLASSIFIED_FLAGS=['--plan-unclassified','--prepare-unclassified','--apply-unclassified','--verify-unclassified'];
async function liveUnclassified(){const {api,assertSource}=await import('./ReportingApi.mjs');await assertSource();const card=await api('GET',`card/${UNCLASSIFIED}`);assert.ok(!card.archived&&card.name==='Unclassified people · expected 0','card 251 is not the unclassified guard');return {api,card};}
if(flag('--plan-unclassified')){const {card}=await liveUnclassified(),next=targetUnclassifiedQuery(card.dataset_query);
 console.log(JSON.stringify({plan:true,'card 251 (Unclassified people · expected 0)':{statuses:{before:unclassifiedStatuses(card.dataset_query).statuses,after:unclassifiedStatuses(next).statuses},otherKeysUnchanged:JSON.stringify(withoutUuids({...next,stages:next.stages?.map(x=>({...x,filters:[]}))}))===JSON.stringify(withoutUuids({...card.dataset_query,stages:card.dataset_query.stages?.map(x=>({...x,filters:[]}))}))}},null,1));}
if(flag('--prepare-unclassified')){const {card}=await liveUnclassified();targetUnclassifiedQuery(card.dataset_query);
 assert.ok(fs.existsSync(`${backup}/state.json`),'the main R102 --apply must have run first');assert.ok(!fs.existsSync(`${backup}/before-251.json`),'Existing card 251 snapshot must not be overwritten');
 write(`${backup}/before-251.json`,card);console.log('Card 251 rollback copy captured privately');}
if(flag('--apply-unclassified')){const {api,card}=await liveUnclassified(),before=JSON.parse(fs.readFileSync(`${backup}/before-251.json`,'utf8'));
 assert.ok(!fs.existsSync(`${backup}/unclassified-state.json`),'Card 251 already updated: refusing replay (use --verify-unclassified)');
 assert.deepEqual(card.dataset_query,before.dataset_query,'card 251 changed since --prepare-unclassified');
 await api('PUT',`card/${UNCLASSIFIED}`,{dataset_query:targetUnclassifiedQuery(card.dataset_query)});write(`${backup}/unclassified-state.json`,{at:new Date().toISOString(),card:UNCLASSIFIED});
 console.log('Card 251 now counts only statuses outside the five lanes');}
if(flag('--verify-unclassified')){const {api,card}=await liveUnclassified(),before=JSON.parse(fs.readFileSync(`${backup}/before-251.json`,'utf8'));
 assert.deepEqual(unclassifiedStatuses(card.dataset_query).statuses,[...unclassifiedStatuses(before.dataset_query).statuses,LONG.status]);
 assert.deepEqual(withoutUuids(card.dataset_query),withoutUuids(targetUnclassifiedQuery(before.dataset_query)));
 const r=await api('POST',`card/${UNCLASSIFIED}/query`,{});assert.equal(r.status,'completed');const value=r.data.rows[0]?.[0]??0;
 console.log(JSON.stringify({card:UNCLASSIFIED,statuses:unclassifiedStatuses(card.dataset_query).statuses,value}));assert.equal(Number(value),0,'card 251 must return 0');}
if(main&&![...UNCLASSIFIED_FLAGS,'--prepare','--plan','--apply','--verify'].some(f=>process.argv.includes(f))){
 // Offline dry run: the plan against a synthetic dashboard in the R036 shape; no network, no key.
 const at=(id,col,row)=>({id,card_id:id,dashboard_tab_id:TAB,col,row,size_x:6,size_y:row===6?2:9,series:[],parameter_mappings:[],visualization_settings:{}});
 const dashboard={dashcards:[at(242,0,6),at(244,6,6),at(240,12,6),at(246,18,6),at(243,0,8),at(245,6,8),at(241,12,8),at(247,18,8)],
  parameters:[{id:PARAMETER,values_source_config:{values:oldStatuses}}]};
 const cards=targetCards(dashboard,{count:9001,list:9002});
 const row=r=>cards.filter(c=>c.row===r).sort((a,b)=>a.col-b.col).map(c=>`${c.card_id}@${c.col}+${c.size_x}`);
 const sql=fs.readFileSync(new URL('./models/collection-summary.sql',import.meta.url),'utf8');
 assert.ok(sql.includes("('Long Overdue')"),'models/collection-summary.sql lists Long Overdue');
 const legacy=sql.replace(",('Long Overdue')","");
 assert.equal(targetModelSql(legacy),sql);
 const detail=targetDetail({visualization_settings:{'table.column_formatting':oldStatuses.map(value=>({columns:['Daily Collection Status'],type:'single',operator:'=',value,color:'#FFF',highlight_row:true}))}});
 const remaining=targetRemainingQuery({query:{filter:['or',['=',['field','Daily Collection Status',{}],'Not Paid'],['=',['field','Daily Collection Status',{}],'Overdue']]}});
 console.log(JSON.stringify({dryRun:true,newCards:newCards(5).map(c=>c.body.name),row6:row(6),row8:row(8),parameters:targetParameters(dashboard)[0].values_source_config.values,
  detailRules:detail['table.column_formatting'].map(r=>r.value),remainingFilter:remaining.query.filter.slice(1).map(c=>c[2])},null,1));
}
