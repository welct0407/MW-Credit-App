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

/** Model 162: the zero-filled status list gains 'Long Overdue' after 'Overdue' (exactly one match). */
export function targetModelSql(sql){
 const from="('Overdue')) s(status)",to="('Overdue'),('Long Overdue')) s(status)";
 assert.equal(sql.split(from).length,2,'collection-summary VALUES list not in the expected R025 form');
 return sql.replace(from,to);
}
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
/** "Not paid / overdue": ['or', Not Paid, Overdue] gains a Long Overdue clause cloned from the Overdue one. */
export function targetRemainingQuery(query){
 const next=structuredClone(query),filter=next.query?.filter;
 assert.ok(Array.isArray(filter)&&filter[0]==='or'&&filter.length===3,'remaining-pages filter not in the expected form');
 assert.deepEqual(filter.slice(1).map(c=>c[2]),['Not Paid','Overdue']);
 const clause=structuredClone(filter[2]);clause[2]=LONG.status;filter.push(clause);
 return next;
}

async function live(){
 const {api,assertSource}=await import('./ReportingApi.mjs');
 await assertSource();
 const dashboard=await api('GET',`dashboard/${DASHBOARD}`),detail=await api('GET',`card/${DETAIL}`),summary=await api('GET',`card/${SUMMARY}`);
 const remaining=(await api('GET','card?f=all')).filter(c=>c.name===REMAINING_NAME&&!c.archived);
 assert.equal(remaining.length,1,`exactly one live "${REMAINING_NAME}" question`);
 return {api,dashboard,detail,summary,remaining:remaining[0]};
}
const sqlOf=card=>card.dataset_query?.native?.query;
/** The two live lane questions --apply created ({count, list}), or null before the R102 apply. */
export function longLaneCards(){
 if(!fs.existsSync(`${backup}/state.json`))return null;
 const {cards}=JSON.parse(fs.readFileSync(`${backup}/state.json`,'utf8'));
 return {count:cards['long-count'],list:cards['long-list']};
}

if(flag('--prepare')){
 const {dashboard,detail,summary,remaining}=await live();
 assert.equal(dashboard.tabs.find(t=>t.id===TAB)?.name,'8 · Collection Monitor');
 assert.deepEqual(dashboard.parameters.find(p=>p.id===PARAMETER).values_source_config.values,oldStatuses);
 targetDetail(detail);targetModelSql(sqlOf(summary));targetRemainingQuery(remaining.dataset_query);
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
 await api('PUT',`card/${SUMMARY}`,{dataset_query:{...summary.dataset_query,native:{...summary.dataset_query.native,query:targetModelSql(sqlOf(summary))}}});
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
 assert.equal(sqlOf(summary),targetModelSql(sqlOf(before.summary)));
 assert.deepEqual(remaining.dataset_query,targetRemainingQuery(before.remaining.dataset_query));
 fs.mkdirSync(output,{recursive:true});
 write(`${output}/verification.json`,{at:new Date().toISOString(),dashboard:DASHBOARD,tab:TAB,statusOrder:newStatuses,cards:state.cards,
  checks:['Five lanes on rows 6 and 8 in status order, widths 5/5/5/5/4','Other placements unchanged','Detail filter and highlights list Long Overdue','Model 162 zero-fills Long Overdue','Not paid / overdue counts Long Overdue'],databaseChanges:false});
 console.log('R102 long overdue lane checks passed; run Verify-CollectionMonitor.mjs next');
}

if(main&&!['--prepare','--apply','--verify'].some(f=>process.argv.includes(f))){
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
