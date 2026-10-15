import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,read,write,privateDir,root} from './ReportingApi.mjs';
import {prior,projection,layout,modelSpecs} from './CashSnapshotReport.mjs';
await assertSource();const d=await api('GET','dashboard/3'),state=read('cash-snapshot-report-state.json'),baseline=prior('dashboard'),checks=[];
const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sorted=a=>a.map(projection).sort((a,b)=>a.id-b.id);
assert.deepEqual(sorted(d.dashcards.filter(c=>c.dashboard_tab_id!==14)),sorted(baseline.dashcards.filter(c=>c.dashboard_tab_id!==14)));checks.push('All twelve other tabs and placement definitions preserved');
assert.deepEqual(d.parameters,baseline.parameters);assert.deepEqual(d.tabs,baseline.tabs);checks.push('Dashboard filter definitions and all tab identities preserved');
assert.deepEqual(sorted(d.dashcards.filter(c=>c.dashboard_tab_id===14)),sorted(layout(d,state)));checks.push('Final 2R layout matches maintained definition');
assert.deepEqual(await api('GET','collection/graph'),prior('collection-graph'));checks.push('Partner permissions preserved');
for(const old of prior('snippets')){const current=(await api('GET','native-query-snippet')).find(s=>s.id===old.id);assert.deepEqual(current,old);}checks.push('Existing three snippets preserved');
for(const id of [47,48,68,73,74,164,179,180,182,183,184,187,188,197,200,201]){const old=prior('card-'+id),now=await api('GET','card/'+id);for(const k of ['name','dataset_query','visualization_settings','result_metadata','archived'])assert.deepEqual(now[k],old[k]);}checks.push('All existing shared live/historical cards and model definitions preserved');
const result=async(route,body)=>{const r=await api('POST',route,body);if(r.status!=='completed'){fs.writeFileSync(privateDir+'/cash-snapshot-report-before/verify-error.json',JSON.stringify(r));throw Error('Query failed: '+route);}assert.ok(!r.data.rows_truncated);return r.data;};
const sql=query=>result('dataset',{database:2,type:'native',native:{query}});
const today=(await sql("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date")).rows[0][0].slice(0,10);
const yesterday=new Date(new Date(today+'T12:00:00Z').getTime()-86400000).toISOString().slice(0,10);
async function query(key,date,type='date/single'){
 const id=state.cards[key],place=d.dashcards.find(c=>c.dashboard_tab_id===14&&c.card_id===id);
 return result(`dashboard/3/dashcard/${place.id}/card/${id}/query`,{parameters:[{id:key==='trend'?'review-position-trend':'review-position',type,value:date}]});
}
const near=(a,b)=>a===null||b===null?a===b:Math.abs(Number(a)-Number(b))<.005;
for(const [label,value,type,effective] of [['today',today,'date/single',today],['yesterday',yesterday,'date/single',yesterday],['known opening','2026-09-18','date/single','2026-09-18'],['before opening','2026-09-01','date/single','2026-09-01'],['past range','2026-09-01~2026-09-20','date/range','2026-09-20'],['current range',today.slice(0,7)+'-01~'+today,'date/range',today]]){
 const q={};for(const key of ['remaining','cash','status','holders','accounts'])q[key]=await query(key,value,type);
 const oracle=await sql(effective===today?`SELECT p."Total Cash Pool"-p."Outstanding Principal",(SELECT CASE WHEN count(*)>0 AND bool_and("Initialized") THEN sum("Current Balance") END FROM public.reporting_cash_accounts) FROM public.olap_portfolio_summary p`:`SELECT "Available Cash EOD"::numeric,"Cash Balance EOD" FROM public.reporting_daily_snapshot WHERE "Snapshot Date"=DATE '${effective}'`);
 check(label+': lending capital and signed net cash match independent source',near(q.remaining.rows[0][0],oracle.rows[0][0])&&near(q.cash.rows[0][0],oracle.rows[0][1]));
 const status=Object.fromEntries(q.status.rows.map(r=>[r[1],r[2]]));
 check(label+': correct position date and live/snapshot source',status['Position date']===effective&&status.Source===(effective===today?'Live on refresh':'Hourly snapshot'));
 const accounts=await sql(effective===today?'SELECT "Cash Holder","Account",CASE WHEN "Initialized" THEN "Current Balance" END,"Balance Status" FROM public.reporting_cash_accounts ORDER BY "Cash Holder","Account","Cash Account ID"':`SELECT "Holder Name","Account Label","Closing Balance","Balance Status" FROM public.reporting_cash_account_snapshot WHERE "Snapshot Date"=DATE '${effective}' ORDER BY "Holder Name","Account Label","Ref Cash Account"`);
 check(label+': every signed account balance and availability matches source',same(q.accounts.rows,accounts.rows.map(r=>r.slice(1))));
 const grouped=new Map();for(const [holder,,balance] of accounts.rows){const list=grouped.get(holder)??[];list.push(balance);grouped.set(holder,list);}
 check(label+': holder sums preserve negative and unknown balances',q.holders.rows.every(([holder,total])=>near(total,grouped.get(holder).some(v=>v===null)?null:grouped.get(holder).reduce((s,v)=>s+Number(v),0))));
 if(effective<today){const generated=await sql(`SELECT to_char("Generated At",'YYYY-MM-DD HH24:MI') FROM public.reporting_daily_snapshot WHERE "Snapshot Date"=DATE '${effective}'`);check(label+': displayed refresh timestamp is stored generation time',status['As of']===generated.rows[0][0]);}
}
for(const value of ['2000-01-01','2099-01-01']){const cash=await query('cash',value),status=await query('status',value),accounts=await query('accounts',value);check(value+': unavailable selection does not fall back or become zero',cash.rows[0][0]===null&&status.rows.find(r=>r[1]==='Availability')[2]==='No date in available reporting range'&&accounts.rows.length===0);}
for(const [label,value,type] of [['default','past30days','date/all-options'],['custom','2026-09-01~'+today,'date/range'],['today only',today,'date/single']]){
 const trend=await query('trend',value,type);check(label+': trend contains only unique completed dates',trend.rows.every((r,i)=>r[0].slice(0,10)<today&&(i===0||r[0]>trend.rows[i-1][0])));
 for(const row of trend.rows){const oracle=await sql(`SELECT "Available Cash EOD"::numeric,"Cash Balance EOD" FROM public.reporting_daily_snapshot WHERE "Snapshot Date"=DATE '${row[0].slice(0,10)}'`);assert.ok(near(row[1],oracle.rows[0][0])&&near(row[2],oracle.rows[0][1]));}checks.push(label+': every plotted balance matches stored snapshot');
}
for(const card of d.dashcards.filter(c=>c.dashboard_tab_id===14&&c.card_id)){await result(`dashboard/3/dashcard/${card.id}/card/${card.card_id}/query`,{parameters:d.parameters.filter(p=>p.id.startsWith('review-position')).map(p=>({id:p.id,type:p.type,value:p.default}))});}checks.push('All nine final default dashboard queries completed');
for(const [key]of modelSpecs){const model=read('models.json')[key];const r=await result(`card/${model.id}/query`,{});check(key+': unique non-null grain and documented metadata',r.rows.every(row=>row[0]!==null)&&new Set(r.rows.map(row=>row[0])).size===r.rows.length&&r.cols.length===model.columns.length);}
for(const day of [today,yesterday])for(const unknown of [false,true]){
 const second=unknown?'NULL::numeric':'-125::numeric',status=unknown?'Opening balance missing':'Known';
 const raw=fs.readFileSync(root+'/scripts/metabase/cash-position-snapshot-snippet.sql','utf8');
 const account=`SELECT * FROM (VALUES ('a','h','Synthetic holder','A',100::numeric,true,'Known'),('b','h','Synthetic holder','B',${second},${!unknown},'${status}')) a("Cash Account ID","Cash Holder ID","Cash Holder","Account","Current Balance","Initialized","Balance Status")`;
 const mocks={portfolio:'SELECT 50::numeric AS "Available Cash"',
 'cash-accounts':account,
 'daily-cash-snapshot':`SELECT DATE '${yesterday}' AS "Date",50::numeric AS "Remaining Lending Capital",${unknown?'NULL::numeric':'-25::numeric'} AS "Net Cash Balance",TIMESTAMP '${yesterday} 23:00:00' AS "Generated At",DATE '${yesterday}' AS "Available From",'${status}'::text AS "Balance Status"`,
 'account-cash-snapshot':`SELECT a.*,a."Current Balance" AS "Balance",DATE '${yesterday}' AS "Date",TIMESTAMP '${yesterday} 23:00:00' AS "Generated At" FROM (${account}) a`};
 const content=raw.replace(/\{\{model:([^}]+)\}\}/g,(_,key)=>'('+mocks[key]+')').replace('[[AND {{position_date}}]]',`AND d."Date"=DATE '${day}'`);
 const r=await sql(`WITH p AS (${content}) SELECT DISTINCT "Net Cash Balance",(SELECT CASE WHEN bool_and("Balance" IS NOT NULL) THEN sum("Balance") END FROM p), (SELECT min("Balance") FROM p) FROM p`);
 check(`${day===today?'Live':'Past'} synthetic ${unknown?'unknown':'negative'} balances propagate through real routing logic`,unknown?r.rows[0][0]===null&&r.rows[0][1]===null:near(r.rows[0][0],-25)&&near(r.rows[0][1],-25)&&near(r.rows[0][2],-125));
}
write('cash-snapshot-report-verification.json',{verified_at:new Date().toISOString(),checks,check_count:checks.length,financial_values_published:false,reporting_only:true,other_tabs_preserved:true,visuals:d.dashcards.filter(c=>c.card_id).length,questions:new Set(d.dashcards.map(c=>c.card_id).filter(Boolean)).size,models:Object.keys(read('models.json')).length,model_fields:Object.values(read('models.json')).reduce((s,m)=>s+m.columns.length,0),today,yesterday});
fs.writeFileSync(privateDir+'/cash-snapshot-report-before/completed-dashboard.json',JSON.stringify(d,null,2));
console.log(checks.length+' focused checks passed; no financial values published.');
