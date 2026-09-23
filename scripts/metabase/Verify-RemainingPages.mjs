import fs from 'node:fs';import assert from 'node:assert/strict';
import {api,assertSource,read,write,privateDir} from './ReportingApi.mjs';
await assertSource();const models=read('models.json'),state=read('remaining-install-state.json'),questions=read('remaining-questions.json'),dashboard=await api('GET','dashboard/3'),checks=[];
async function sql(query){const r=await api('POST','dataset',{database:2,type:'native',native:{query,'template-tags':{}}});if(r.status!=='completed')throw Error('Independent SQL failed');return r.data.rows;}
async function card(key,parameters){const id=state.cards[key].id,page=state.cards[key].page,tab=dashboard.tabs.find(t=>t.name.startsWith(page+' ·'));const dc=dashboard.dashcards.find(c=>c.card_id===id&&(!tab||c.dashboard_tab_id===tab.id));const r=await api('POST',parameters?`dashboard/3/dashcard/${dc.id}/card/${id}/query`:`card/${id}/query`,parameters?{parameters}:{});if(r.status!=='completed')throw Error('Question failed '+key);return r.data.rows;}
function compare(a,b,label){assert.equal(a.length,b.length,label+' rows');for(let r=0;r<a.length;r++){assert.equal(a[r].length,b[r].length,label+' columns');for(let c=0;c<a[r].length;c++){const x=a[r][c],y=b[r][c];if(typeof x==='number'||typeof y==='number')assert.ok(Math.abs(Number(x)-Number(y))<1e-7,label+' numeric mismatch');else assert.equal(x,y,label+' mismatch');}}checks.push({check:label,passed:true});}
const scalars={
 'b-active':'SELECT count(*) FROM public.olap_borrowers_analytics WHERE "Has Active Loan" IS TRUE',
 'b-interest':'SELECT sum("Total Interest Earned") FROM public.olap_borrowers_analytics',
 'p-count':'SELECT count(*) FROM public.olap_loans_analytics',
 'p-principal':'SELECT sum("Principal Amount"::numeric) FROM public.olap_loans_analytics',
 'r-past-due':`SELECT sum(CASE WHEN "Charge Date"<(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AND "Amount Remaining">0 THEN "Amount Remaining" ELSE 0 END) FROM public.olap_charges_analytics`,
 'r-top3':'SELECT "Top 3 Borrower Concentration" FROM public.olap_portfolio_summary',
 'c-due-count':'SELECT count(*) FROM public.olap_borrowers_analytics WHERE "Daily Collection Status" IS NOT NULL',
 'c-paid-count':`SELECT count(*) FROM public.olap_borrowers_analytics WHERE "Daily Collection Status"='Fully Paid'`,
 'c-partial-count':`SELECT count(*) FROM public.olap_borrowers_analytics WHERE "Daily Collection Status"='Partially Paid'`,
 'c-unpaid-count':`SELECT count(*) FROM public.olap_borrowers_analytics WHERE "Daily Collection Status" IN ('Not Paid','Overdue')`,
 'f-remaining':'SELECT "Projected Monthly Profit"-"Realized Profit MTD" FROM public.olap_portfolio_summary',
 'f-realization':'SELECT "Realized Profit MTD"/NULLIF("Projected Monthly Profit",0) FROM public.olap_portfolio_summary'
};
for(const [key,query]of Object.entries(scalars))compare(await card(key),await sql(query),key+' source reconciliation');
for(const [key,status]of [['paid','Fully Paid'],['partial','Partially Paid'],['unpaid','Not Paid'],['overdue','Overdue']]){
 const query=['paid','partial'].includes(key)?`SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric),0) FROM public.olap_repayments_analytics r JOIN public.olap_loans_analytics l ON l."Row ID"=r."Ref Loans" JOIN public.olap_borrowers_analytics b ON b."Row ID"=l."Ref Borrowers" WHERE b."Daily Collection Status"='${status}' AND r."Payment Date"=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date`:`SELECT coalesce(sum("Todays Amount Remaining"),0) FROM public.olap_borrowers_analytics WHERE "Daily Collection Status"='${status}'`;
 compare(await card('c-'+key+'-amount'),await sql(query),'Collection '+status+' amount');
}
const grain={borrowers:'Borrower ID',loans:'Loan ID',repayments:'Repayment ID','borrower-performance':'Borrower',portfolio:'Portfolio ID',daily:'Date',charges:'Charge ID',partners:'Partner ID',collections:'Borrower ID','collection-summary':'Collection Status'};
for(const [key,m]of Object.entries(models)){const r=await api('POST',`card/${m.id}/query`,{});assert.equal(r.status,'completed');const col=r.data.cols.findIndex(c=>c.name===(m.grain_field??grain[key])),keys=r.data.rows.map(row=>row[col]);assert.ok(col>=0&&keys.every(v=>v!=null)&&new Set(keys).size===keys.length);checks.push({check:key+' unique non-null grain',rows:keys.length,passed:true});}
for(const q of questions){const c=await api('GET','card/'+state.cards[q.key].id),s=c.dataset_query.stages;assert.equal(s.length,1);assert.equal(s[0]['source-card'],models[q.model].id);assert.ok(!s[0].joins&&!s[0].expressions&&!s[0].native);}
checks.push({check:'80 new visuals use models without chart SQL, joins or business expressions',passed:true});
const b=(await sql('SELECT "Row ID","Total Outstanding Principal","Portfolio Outstanding Principal" FROM public.olap_borrowers_analytics WHERE "Total Outstanding Principal">0 ORDER BY "Row ID" LIMIT 2'));
for(let i=0;i<b.length;i++)for(const amount of [0,1000,20000]){const parameters=[{id:'insight-borrower',type:'string/=',value:[b[i][0]]},{id:'proposed-amount',type:'number/=',value:[amount]}];const exposure=await card('i-exposure',parameters);assert.equal(exposure.length,1);assert.ok(Math.abs(exposure[0][1]-b[i][1])<1e-7&&Math.abs(exposure[0][2]-b[i][1]-amount)<1e-7);const current=await card('i-current-share',parameters),proposed=await card('i-proposed-share',parameters);assert.ok(Math.abs(current.reduce((s,r)=>s+r[1],0)-b[i][2])<1e-7);if(amount===0)assert.equal(proposed.length,0);else assert.ok(Math.abs(proposed.reduce((s,r)=>s+r[1],0)-b[i][2]-amount)<1e-7);compare(await card('i-principal',parameters),[[b[i][1]]],`Borrower ${i+1}, scenario ${amount}`);}
for(const key of ['i-exposure','i-current-share','i-proposed-share'])assert.equal((await card(key,[{id:'insight-borrower',type:'string/=',value:[b[0][0]]},{id:'proposed-amount',type:'number/=',value:[-1]}])).length,0);
checks.push({check:'Scenario uses selected immutable key; 0, 1000, 20000 and negative boundary validated',passed:true});
const dateParams=[{id:'performance-date',type:'date/range',value:'2026-09-01~2026-09-15'}];
compare(await card('p-principal',dateParams),await sql(`SELECT sum("Principal Amount"::numeric) FROM public.olap_loans_analytics WHERE "Loan Date" BETWEEN DATE '2026-09-01' AND DATE '2026-09-15'`),'Performance loan-date filter');
compare(await card('p-interest',dateParams),await sql(`SELECT sum("Interest Paid"::numeric) FROM public.olap_repayments_analytics WHERE "Payment Date" BETWEEN DATE '2026-09-01' AND DATE '2026-09-15'`),'Performance payment-date filter');
const before=JSON.parse(fs.readFileSync(privateDir+'/remaining-pages-before/dashboard.json'));const project=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
assert.deepEqual(dashboard.dashcards.filter(c=>[4,5].includes(c.dashboard_tab_id)).map(project).sort((a,b)=>a.id-b.id),before.dashcards.map(project).sort((a,b)=>a.id-b.id));
const originalTabs=dashboard.tabs.filter(t=>Number(t.name[0])<=8);assert.equal(originalTabs.length,8);assert.equal(dashboard.dashcards.filter(c=>c.card_id&&originalTabs.some(t=>t.id===c.dashboard_tab_id)).length,109);
const permissions=await api('GET','collection/graph');assert.equal(permissions.groups['5']['8'],'read');assert.equal(permissions.groups['5']['5'],'read');assert.ok(!permissions.groups['1']?.['8']);
checks.push({check:'First two layouts unchanged; eight tabs; 109 visuals; partner collection permissions retained',passed:true});
write('remaining-verification.json',{verified_at:new Date().toISOString(),checks,models:Object.keys(models).length,model_questions:80,shared_snippet_scenario_questions:3,database_changes:'See authorized access batches in reporting-sources-grants-applied.json; no schema or data writes'});console.log(`${checks.length} reconciliation, grain, scenario, filter and preservation checks passed.`);
