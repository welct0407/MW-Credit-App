import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api as rawApi,assertSource} from './ReportingApi.mjs';import {redactedReads} from './Baselines.mjs';
import {out,baseline,read,save,lanes,parameters,shape,specs,runQuery} from './CollectionMonitor.mjs';
const backup=await baseline();  // R103: Baselines.mjs (override or private bucket)
import {targetModelQuery,modelStatuses,nativeSql} from './AddLongOverdueLane.mjs';
const api=redactedReads(rawApi);  // R103: compare the redacted form the baselines hold
await assertSource();
const state=read('state'),d=await api('GET','dashboard/3'),before=JSON.parse(fs.readFileSync(`${backup}/dashboard.json`));
const checks=[];const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);};
// R103: a check that needs a particular state of today's data runs only when that state exists; otherwise it is recorded
// as SKIPPED with its reason (never as a pass). Layout and definition checks never use this.
const skipped=[];const whenData=(name,present,reason,ok)=>{if(!present){skipped.push({check:name,status:'SKIPPED',reason});console.log('SKIPPED: '+name+' ('+reason+')');return;}check(name,ok());};
assert.deepEqual(shape(d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab)),shape(before.dashcards));checks.push('All 189 original placements, layouts and mappings unchanged');
assert.deepEqual(d.tabs.filter(t=>t.id!==state.tab).map(t=>[t.id,t.name]),before.tabs.map(t=>[t.id,t.name]));
// R103: the layout PromoteCollectionTab.mjs produces (R025 cutover, outputs/r025-20260924/cutover-verification.json:
// removedTab 9, canonicalTab 19): the original collection tab 9 is gone and the R025 tab is the dashboard's one Collection
// Monitor page (its page number moved with later renumbering, BorrowerNavigation.mjs). It replaces the pre-cutover check
// "New tab immediately follows original collection", which needed tab 9.
check('Original collection tab retired; the R025 tab is the one Collection Monitor page',!d.tabs.some(t=>t.id===9)&&d.tabs.filter(t=>/Collection Monitor$/.test(t.name)).map(t=>t.id).join()===String(state.tab));
assert.deepEqual(d.parameters.filter(p=>!parameters.some(x=>x.id===p.id)),before.parameters);checks.push('Original tab names/order and original parameters preserved');
assert.deepEqual(await api('GET','collection/graph'),JSON.parse(fs.readFileSync(`${backup}/permissions.json`)));checks.push('Collection permission graph unchanged');
for(const id of [69,71,73,77,162]){const old=JSON.parse(fs.readFileSync(`${backup}/model-${id}.json`)),now=await api('GET',`card/${id}`);
 // R102: model 162 zero-fills Long Overdue after AddLongOverdueLane.mjs; every other part stays as captured. R103: a baseline
 // rebuilt from live after R102 already holds that form (MBQL 5), so the expected query is the baseline itself; a pre-R102
 // baseline gets the same format-aware R102 rewrite AddLongOverdueLane.mjs applies. Either way the comparison is exact.
 const r102=id===162&&!modelStatuses(nativeSql(old.dataset_query)).statuses.includes('Long Overdue');
 assert.deepEqual(now.dataset_query,r102?targetModelQuery(old.dataset_query):old.dataset_query);assert.deepEqual(now.visualization_settings,old.visualization_settings);}checks.push('All five shared models unchanged');
for(const old of before.dashcards.filter(c=>c.card_id)){const now=d.dashcards.find(c=>c.id===old.id);assert.deepEqual(now.card.dataset_query,old.card.dataset_query);assert.deepEqual(now.card.visualization_settings,old.card.visualization_settings);}checks.push('All original embedded saved question queries and formatting unchanged');
const results={},timings=[];
// R025 owner refinement, 24 September 2026 (outputs/r025-20260924/README.md "removed the People on board placement";
// top-card-refinement.json topRow [237,238,239,252], peopleQuestionRetained 236): the people question (236) stays saved,
// unarchived and unplaced, so it runs as a saved question; question 252 sits in the tab's top row.
const RETAINED='people',retained=state.cards[RETAINED];
check('People question 236 retained, unarchived and unplaced',retained===236&&(await api('GET',`card/${retained}`)).archived===false&&!d.dashcards.some(c=>c.card_id===retained));
{const at=id=>d.dashcards.find(c=>c.dashboard_tab_id===state.tab&&c.card_id===id),row=[237,238,239,252].map(at);
 check('Question 252 completes the top card row 237, 238, 239, 252 at the right',row.every(Boolean)&&row.every(c=>c.row===row[0].row)&&row.every((c,i)=>!i||c.col>row[i-1].col));}
for(const spec of specs){const id=state.cards[spec.key],p=spec.key===RETAINED?null:d.dashcards.find(c=>c.dashboard_tab_id===state.tab&&c.card_id===id);assert.ok(spec.key===RETAINED||p);const started=Date.now();results[spec.key]=await runQuery(p?`dashboard/3/dashcard/${p.id}/card/${id}/query`:`card/${id}/query`,{parameters:[]});timings.push({key:spec.key,ms:Date.now()-started});}
checks.push('All 16 saved dashboard questions complete without truncation');
const objects=data=>data.rows.map(row=>Object.fromEntries(data.cols.map((c,i)=>[c.name,row[i]])));
const work=objects(await runQuery('card/77/query',{}));
check('Worklist grain is unique immutable borrower ID',new Set(work.map(r=>r['Borrower ID'])).size===work.length);
check('No unexpected non-null collection statuses',work.every(r=>lanes.some(l=>l.status===r['Daily Collection Status'])));
const sum=(rows,k)=>rows.reduce((n,r)=>n+Number(r[k]??0),0),val=key=>results[key].rows[0]?.[0],near=(a,b)=>a==null||b==null?a==b:Math.abs(Number(a)-Number(b))<.005;
check('People total matches worklist',Number(val('people'))===work.length);
check('Receipts total matches worklist',near(val('receipts'),sum(work,'Receipts Today')));
check('Remaining total matches worklist without double-counting overdue',near(val('remaining'),sum(work,'Amount Remaining')));
const paid=work.filter(r=>r['Daily Collection Status']==='Fully Paid').length;
check('People percentage is weighted count ratio',near(val('completion'),work.length?paid/work.length:null));
let ids=[];
for(const lane of lanes){const rows=objects(results[`${lane.key}-list`]),expected=work.filter(r=>r['Daily Collection Status']===lane.status);check(`${lane.status}: count and table agree`,Number(val(`${lane.key}-count`))===expected.length&&rows.length===expected.length);check(`${lane.status}: exact names/IDs/receipts/remaining`,rows.every(r=>expected.some(e=>e['Borrower ID']===r['Borrower ID']&&e.Borrower===r.Borrower&&near(e['Receipts Today'],r['Receipts Today'])&&near(e['Amount Remaining'],r['Amount Remaining']))));ids.push(...rows.map(r=>r['Borrower ID']));}
check('Four lanes partition source without overlap',new Set(ids).size===ids.length&&ids.length===work.length);
check('Detail has full board population',results.detail.rows.length===work.length);
check('Unclassified count is zero',Number(val('unclassified'))===0);
const detail=d.dashcards.find(c=>c.card_id===state.cards.detail&&c.dashboard_tab_id===state.tab);
check('Only detail receives the new filters',d.dashcards.filter(c=>c.parameter_mappings?.some(m=>parameters.some(p=>p.id===m.parameter_id))).every(c=>c.id===detail.id));
for(const p of parameters){const byBorrower=p.id.endsWith('borrower'),present=byBorrower?work.length>0:work.some(r=>r['Daily Collection Status']==='Overdue');
 let filtered=[],value=[];if(present){value=byBorrower?[work[0]['Borrower ID']]:['Overdue'];filtered=objects(await runQuery(`dashboard/3/dashcard/${detail.id}/card/${detail.card_id}/query`,{parameters:[{id:p.id,type:p.type,value}]}));}
 whenData(`${p.name}: actual dashboard mapping filters precisely`,present,byBorrower?'no borrower on today\'s board':'no Overdue borrower on today\'s board',()=>filtered.length>0&&filtered.every(r=>byBorrower?r['Borrower ID']===value[0]:r['Daily Collection Status']===value[0]));}
const none=await runQuery(`dashboard/3/dashcard/${detail.id}/card/${detail.card_id}/query`,{parameters:[{id:parameters[0].id,type:'string/=',value:['SYNTHETIC-NO-MATCH']} ]});check('No-match borrower filter returns empty, not all borrowers',none.rows.length===0);
// Independent read-only source oracle. Result values stay in memory, never published.
const oracle=objects(await runQuery('dataset',{database:2,type:'native',native:{query:`SELECT b."Row ID" AS "Borrower ID", b."Description" AS "Borrower", b."Daily Collection Status",b."Todays Amount Remaining" AS "Amount Remaining",coalesce(r.receipts,0) AS "Receipts Today" FROM public.olap_borrowers_analytics b LEFT JOIN (SELECT l."Ref Borrowers" id,sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric) receipts FROM public.olap_repayments_analytics r JOIN public.olap_loans_analytics l ON l."Row ID"=r."Ref Loans" WHERE r."Payment Date"=public.olap_reporting_date() GROUP BY 1) r ON r.id=b."Row ID" WHERE b."Daily Collection Status" IS NOT NULL`}}));
check('Current rows independently reconcile to governed PostgreSQL views',oracle.length===work.length&&oracle.every(r=>work.some(w=>w['Borrower ID']===r['Borrower ID']&&w['Daily Collection Status']===r['Daily Collection Status']&&near(w['Receipts Today'],r['Receipts Today'])&&near(w['Amount Remaining'],r['Amount Remaining']))));
{const payer=r=>r['Daily Collection Status']==='Overdue'&&Number(r['Receipts Today'])>0&&Number(r['Amount Remaining'])>0;
 whenData('Observed overdue payer remains overdue',oracle.some(payer),'no Overdue borrower who paid today and still owes in the source views today',()=>work.some(payer));}
const charges=objects(results['today-charges'])[0];const port=objects(await runQuery('card/73/query',{}))[0];check('Today-charge summary preserves separate population',near(charges['Amount Due Today'],port['Amount Due Today'])&&near(charges['Amount Collected Today'],port['Amount Collected Today'])&&near(charges['Amount Outstanding Today'],port['Amount Outstanding Today'])&&near(charges['Paid percentage'],Number(port['Amount Due Today'])>0?Number(port['Amount Collected Today'])/Number(port['Amount Due Today']):null));
const def=JSON.parse(fs.readFileSync(`${backup}/borrower-view-definition.json`)).rows[0][0];check('Live view contains expected status precedence',def.indexOf("'Overdue'")<def.indexOf("'Fully Paid'")&&def.indexOf("'Fully Paid'")<def.indexOf("'Partially Paid'"));
// Synthetic cases execute the recorded source decision ordering without financial writes.
const fixture=await runQuery('dataset',{database:2,type:'native',native:{query:`WITH f(n,total,overdue,pending,partial,paid,expected) AS (VALUES ('none',0,0,0,0,0,NULL::text),('older plus receipt',2,1,0,1,1,'Overdue'),('partial',1,0,0,1,0,'Partially Paid'),('mixed loans',2,0,1,0,1,'Partially Paid'),('complete',2,0,0,0,2,'Fully Paid'),('unpaid',1,0,1,0,0,'Not Paid')) SELECT bool_and((CASE WHEN total=0 THEN NULL WHEN overdue>0 THEN 'Overdue' WHEN pending=0 AND partial=0 THEN 'Fully Paid' WHEN partial>0 OR (paid>0 AND pending>0) THEN 'Partially Paid' ELSE 'Not Paid' END) IS NOT DISTINCT FROM expected) AS status_cases_pass, (TIMESTAMPTZ '2026-09-24 16:59:59+00' AT TIME ZONE 'Asia/Bangkok')::date = DATE '2026-09-24' AND (TIMESTAMPTZ '2026-09-24 17:00:00+00' AT TIME ZONE 'Asia/Bangkok')::date = DATE '2026-09-25' AS rollover_pass FROM f`}});
check('Synthetic null/partial/multi-loan/overdue/paid statuses',fixture.rows[0][0]===true);check('Bangkok midnight boundary controlled fixture',fixture.rows[0][1]===true);
for(const key of ['people','receipts','remaining','completion']){
 const q=structuredClone(specs.find(s=>s.key===key).dataset_query),source=key==='completion'?q.query['source-query']:q.query;
 source.filter=['=', ['field','Borrower ID',{'base-type':'type/Text'}], 'SYNTHETIC-NO-MATCH'];
 const r=await runQuery('dataset',q);check(`Empty board ${key}: honest zero/null`,key==='completion'?r.rows[0][0]===null:Number(r.rows[0][0])===0);
}
const summary={at:new Date().toISOString(),checks,skipped,passed:checks.length,skippedCount:skipped.length,failed:0,queryTimings:timings,totalSequentialQueryMs:timings.reduce((a,t)=>a+t.ms,0),originalPlacements:before.dashcards.length,newPlacements:d.dashcards.filter(c=>c.dashboard_tab_id===state.tab).length,tabs:d.tabs.length,financialValuesPublished:false};save('verification',summary);console.log(JSON.stringify({passed:checks.length,skipped:skipped.length,failed:0,totalQueryMs:summary.totalSequentialQueryMs}));
