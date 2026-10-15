import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,read,write} from './ReportingApi.mjs';
import {backup,prior} from './StatementCleanup.mjs';
await assertSource();const d=await api('GET','dashboard/3'),state=read('statement-cleanup-state.json'),checks=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);};
const result=async(route,body)=>{const r=await api('POST',route,body);if(r.status!=='completed'){fs.writeFileSync(backup+'/verify-error.json',JSON.stringify(r));throw Error('Query failed '+route);}assert.ok(!r.data.rows_truncated);return r.data;};
const sql=query=>result('dataset',{database:2,type:'native',native:{query}});
const near=(a,b)=>a===null||b===null?a===b:Math.abs(Number(a)-Number(b))<.005;
const query=async(key,tab,value,type='date/single',scope='__ALL__')=>{const id=state.cards[key]??Number(key.slice(1)),p=d.dashcards.find(c=>c.dashboard_tab_id===tab&&c.card_id===id);assert.ok(p,key);return result(`dashboard/3/dashcard/${p.id}/card/${id}/query`,{parameters:[{id:tab===16?'review-income':'review-flow',type,value},...(tab===15?[{id:'review-account',type:'string/=',value:[scope]}]:[])]});};
const today=(await sql('SELECT public.olap_reporting_date()')).rows[0][0].slice(0,10),yesterday=new Date(new Date(today+'T12:00Z')-86400000).toISOString().slice(0,10);
const cases=[['today',today,'date/single',today,today],['yesterday',yesterday,'date/single',yesterday,yesterday],['this month',today.slice(0,7)+'-01~'+today,'date/range',today.slice(0,7)+'-01',today],['before opening','2026-09-01','date/single','2026-09-01','2026-09-01'],['opening','2026-09-18','date/single','2026-09-18','2026-09-18'],['past range','2026-09-18~2026-09-20','date/range','2026-09-18','2026-09-20']];
const accounts=(await result('card/199/query',{})).rows.map(r=>r[0]);
for(const [label,value,type,start,end] of cases){
 const qi={};for(const key of ['q168','q169','q170','q171','income-status','expense-category','expense-detail'])qi[key]=await query(key,16,value,type);
 const oracle=(await sql(`SELECT (SELECT coalesce(sum("Interest Paid"::numeric),0) FROM public.olap_repayments_analytics WHERE "Payment Date" BETWEEN DATE '${start}' AND DATE '${end}'),(SELECT coalesce(sum("Expense Amount"),0) FROM public.reporting_expenses WHERE "Expense Date" BETWEEN DATE '${start}' AND DATE '${end}'),DATE '${end}'-DATE '${start}'+1`)).rows[0];
 check(label+': income/expenses/net/calendar-day average match independent live sources',near(qi.q168.rows[0][0],oracle[0])&&near(qi.q169.rows[0][0],-oracle[1])&&near(qi.q170.rows[0][0],oracle[0]-oracle[1])&&near(qi.q171.rows[0][0],(oracle[0]-oracle[1])/oracle[2]));
 check(label+': category and expense detail reconcile',near(qi['expense-category'].rows.reduce((a,r)=>a+Number(r[1]),0),oracle[1])&&near(qi['expense-detail'].rows.reduce((a,r)=>a+Number(r[2]),0),oracle[1]));
 check(label+': historical and current income statements remain live',qi['income-status'].rows.some(r=>r[0]==='Source'&&r[1]==='Live on report refresh'));
 for(const scope of accounts){
  const q={};for(const key of ['q195','q192','q193','q194','q197','flow-status','movement','transactions'])q[key]=await query(key,15,value,type,scope);
  const expected=(await sql(`SELECT (SELECT "Opening Balance" FROM public.reporting_cashflow_daily WHERE "Scope ID"='${scope}' AND "Date"=DATE '${start}'),coalesce(sum("Money In"),0),coalesce(sum("Money Out"),0),coalesce(sum("Net Movement"),0),(SELECT "Closing Balance" FROM public.reporting_cashflow_daily WHERE "Scope ID"='${scope}' AND "Date"=DATE '${end}') FROM public.reporting_cashflow_transactions WHERE "Scope ID"='${scope}' AND "Date" BETWEEN DATE '${start}' AND DATE '${end}'`)).rows[0];
  check(label+': five cash totals match existing governed provider for scope '+accounts.indexOf(scope),['q195','q192','q193','q194','q197'].every((k,i)=>near(q[k].rows[0][0],expected[i])));
  const total=q.movement.rows.find(r=>r[0]==='TOTAL');check(label+': movement total and live detail match for scope '+accounts.indexOf(scope),!!total&&near(total[1],expected[1])&&near(total[2],expected[2])&&near(total[3],expected[3])&&near(q.transactions.rows.reduce((a,r)=>a+Number(r[3]),0),expected[1])&&near(q.transactions.rows.reduce((a,r)=>a+Number(r[4]),0),expected[2]));
  check(label+': live source and truthful opening availability for scope '+accounts.indexOf(scope),q['flow-status'].rows.some(r=>r[0]==='Source'&&r[1]==='Live on report refresh')&&q['flow-status'].rows.some(r=>r[0]==='Status'&&r[1]===(expected[0]===null?'Opening unavailable':'Balances match')));
 }
}
for(const value of ['2000-01-01','2099-01-01']){
 check(value+': income unavailable, not zero', (await query('q170',16,value)).rows[0][0]===null);
 check(value+': cash unavailable, not fallback', (await query('q197',15,value)).rows[0][0]===null);
 check(value+': no live detail',(await query('transactions',15,value)).rows.length===0);
}
for(const scope of accounts){
 const r=await query('flow-trend',15,'thismonth','date/all-options',scope);
 const expected=(await sql(scope==='__ALL__'?`SELECT "Snapshot Date","Cash Money In","Cash Money Out" FROM public.reporting_daily_snapshot WHERE "Snapshot Date">=date_trunc('month',public.olap_reporting_date()) AND "Snapshot Date"<public.olap_reporting_date() ORDER BY 1`:`SELECT "Snapshot Date","Money In","Money Out" FROM public.reporting_cash_account_snapshot WHERE "Ref Cash Account"='${scope}' AND "Snapshot Date">=date_trunc('month',public.olap_reporting_date()) AND "Snapshot Date"<public.olap_reporting_date() ORDER BY 1`)).rows;
 check('Cash trend uses correct stored grain for scope '+accounts.indexOf(scope),r.rows.length===expected.length&&r.rows.every((x,i)=>x[0].slice(0,10)===expected[i][0].slice(0,10)&&near(x[1],expected[i][1])&&near(x[2],expected[i][2])&&x[0].slice(0,10)<today));
}
const trend=await query('income-trend',16,'thismonth','date/all-options');
const tr=(await sql(`SELECT "Snapshot Date","Interest Received"::numeric,"Business Expenses"::numeric,"Net Profit"::numeric FROM public.reporting_daily_snapshot WHERE "Snapshot Date">=date_trunc('month',public.olap_reporting_date()) AND "Snapshot Date"<public.olap_reporting_date() ORDER BY 1`)).rows;
check('Income trend matches stored daily amounts and excludes today',trend.rows.length===tr.length&&trend.rows.every((r,i)=>[1,2,3].every(j=>near(r[j],tr[i][j]))&&r[0].slice(0,10)<today));
for(const tab of [15,16])for(const p of d.dashcards.filter(c=>c.dashboard_tab_id===tab&&c.card_id))await result(`dashboard/3/dashcard/${p.id}/card/${p.card_id}/query`,{parameters:[{id:tab===16?'review-income':'review-flow',type:'date/all-options',value:'thismonth'},...(tab===15?[{id:'review-account',type:'string/=',value:['__ALL__']}]:[])]});
check('Every final statement visual executes through its dashboard mappings',true);
const project=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','series','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
const keep=cs=>cs.filter(c=>![5,12,13,15,16].includes(c.dashboard_tab_id)).map(project).sort((a,b)=>a.id-b.id);
assert.deepEqual(keep(d.dashcards),keep(prior('dashboard-3').dashcards));checks.push('Other seven pages and Cash Position placements preserved exactly');
const poc=await api('GET','dashboard/2'),oldPoc=prior('dashboard-2');
check('Separate POC layout, queries and filters unchanged',JSON.stringify(poc.dashcards.map(project))===JSON.stringify(oldPoc.dashcards.map(project))&&JSON.stringify(poc.parameters)===JSON.stringify(oldPoc.parameters)&&JSON.stringify(poc.tabs)===JSON.stringify(oldPoc.tabs));
assert.deepEqual(await api('GET','collection/graph'),prior('collection-graph'));checks.push('Partner permissions unchanged');
check('Exactly ten ordered canonical pages',d.tabs.map(t=>t.id).join(',')==='4,14,6,7,8,9,10,11,16,15');
write('statement-cleanup/verification.json',{at:new Date().toISOString(),checks,check_count:checks.length,financial_values_published:false,today,account_scopes:accounts.length});
console.log(checks.length+' focused report checks passed');
