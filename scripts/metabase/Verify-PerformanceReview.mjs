import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,read,write} from './ReportingApi.mjs';
import {backup,specs,shape,common} from './PerformanceReview.mjs';
import {backup as rollingBackup,chartSettings} from './PerformanceRolling.mjs';
await assertSource();
const state=read('performance-redesign/state.json'),d=await api('GET','dashboard/3'),before=JSON.parse(fs.readFileSync(backup+'/dashboard.json')),checks=[];
const rollingInstalled=fs.existsSync(new URL('../../outputs/r016-20260922/performance-redesign/rolling-state.json',import.meta.url));
const tabBaseline=rollingInstalled?JSON.parse(fs.readFileSync(rollingBackup+'/dashboard.json')):before;
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);};
const result=async(route,body)=>{const r=await api('POST',route,body);if(r.status!=='completed'){fs.writeFileSync(backup+'/verification-error.json',JSON.stringify(r));throw Error('Query failed '+route);}assert.ok(!r.data.rows_truncated);return r.data;};
const sql=query=>result('dataset',{database:2,type:'native',native:{query}});
const query=(key,value,type='date/all-options')=>{const id=state.cards[key],p=d.dashcards.find(c=>c.dashboard_tab_id===state.tab&&c.card_id===id);assert.ok(p);return result(`dashboard/3/dashcard/${p.id}/card/${id}/query`,{parameters:[{id:'review-performance',type,value}]});};
const near=(a,b)=>a===null||b===null?a===b:Math.abs(Number(a)-Number(b))<.005;
const date=x=>x?.slice(0,10),add=(x,n)=>new Date(new Date(x+'T12:00:00Z').getTime()+n*86400000).toISOString().slice(0,10);
const today=date((await sql('SELECT public.olap_reporting_date()')).rows[0][0]),yesterday=add(today,-1);
assert.deepEqual(shape(d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab)),shape(before.dashcards));checks.push('All original dashboard placements preserved exactly');
assert.deepEqual(d.tabs.filter(t=>t.id!==state.tab),tabBaseline.tabs.filter(t=>t.id!==state.tab));assert.deepEqual(d.parameters.filter(p=>p.id!=='review-performance'),before.parameters);checks.push('All original tabs and parameters preserved against current owner baseline');
assert.deepEqual(await api('GET','collection/graph'),JSON.parse(fs.readFileSync(backup+'/permissions.json')));checks.push('Collection permissions unchanged');
const qsql=q=>q.native?.query??q.stages?.[0]?.native;
for(const id of [70,71,74]){const old=JSON.parse(fs.readFileSync(backup+`/model-${id}.json`)),now=await api('GET','card/'+id);assert.equal(qsql(now.dataset_query),qsql(old.dataset_query));assert.deepEqual(now.visualization_settings,old.visualization_settings);}checks.push('Shared models 70, 71, 74 unchanged');
for(const s of specs){const c=await api('GET','card/'+state.cards[s.key]);if(rollingInstalled&&s.key==='daily-interest'){assert.equal(c.dataset_query.stages[0]['source-card'],read('performance-redesign/rolling-state.json').helper);assert.deepEqual(c.visualization_settings,chartSettings());continue;}assert.equal(qsql(c.dataset_query),qsql(s.dataset_query));assert.deepEqual(c.visualization_settings,s.visualization_settings);}checks.push('Original question specifications preserved; upgraded daily question references rolling helper (separate verifier covers its full calculation)');
const cases=[['default','past30days',add(today,-30),yesterday],['today',today,today,today],['yesterday',yesterday,yesterday,yesterday],['historical','2026-08-01~2026-08-09','2026-08-01','2026-08-09'],['month to date',today.slice(0,7)+'-01~'+today,today.slice(0,7)+'-01',today],['future','2099-01-01','2099-01-01','2099-01-01']];
for(const [label,value,start,end] of cases){
 const live={};for(const key of ['interest','principal','loans','type','live-status'])live[key]=await query(key,value);
 const eligible=start<=today,effectiveEnd=end>today?today:end;
 const oracle=eligible?(await sql(`SELECT (SELECT coalesce(sum("Interest Paid"::numeric),0) FROM public.olap_repayments_analytics WHERE "Payment Date" BETWEEN DATE '${start}' AND DATE '${effectiveEnd}'),(SELECT coalesce(sum("Principal Amount"::numeric),0) FROM public.olap_loans_analytics WHERE "Loan Date" BETWEEN DATE '${start}' AND DATE '${effectiveEnd}'),(SELECT count(*) FROM public.olap_loans_analytics WHERE "Loan Date" BETWEEN DATE '${start}' AND DATE '${effectiveEnd}')`)).rows[0]:[null,null,null];
 check(label+': live KPIs match independent governed OLAP sums/counts',['interest','principal','loans'].every((k,i)=>near(live[k].rows[0][0],oracle[i])));
 check(label+': type breakdown reconciles to live interest',eligible?near(live.type.rows.reduce((a,r)=>a+Number(r[1]),0),oracle[0]):live.type.rows.length===0);
 check(label+': live source explicitly labeled',live['live-status'].rows.some(r=>r[0]==='Source'&&r[1]==='Live on report refresh'));
 const history={};for(const key of ['daily-interest','daily-principal','daily-loans','weekly-average','active','detail','snapshot-status'])history[key]=await query(key,value);
 const endHistory=end>=today?yesterday:end;
 const expected=(await sql(`SELECT "Snapshot Date","Interest Received"::numeric,"Principal Issued"::numeric,"Principal Returned"::numeric,"Loans Issued","Principal Issued"::numeric/nullif("Loans Issued",0),"Active Loans EOD","Active Borrowers EOD" FROM public.reporting_daily_snapshot WHERE "Snapshot Date" BETWEEN DATE '${start}' AND DATE '${endHistory}' ORDER BY 1 DESC`)).rows;
 check(label+': daily detail matches stored rows and six governed measures',history.detail.rows.length===expected.length&&history.detail.rows.every((r,i)=>date(r[0])===date(expected[i][0])&&r.slice(1).every((v,j)=>near(v,expected[i][j+1]))));
 check(label+': history excludes today/future',history.detail.rows.every(r=>date(r[0])<today));
 for(const [key,columns] of [['daily-interest',[1]],['daily-principal',[2,3]],['daily-loans',[4]],['active',[6,7]]]){
  const asc=[...expected].reverse();check(label+': '+key+' matches snapshot series',history[key].rows.length===asc.length&&history[key].rows.every((r,i)=>date(r[0])===date(asc[i][0])&&columns.every((k,j)=>near(r[j+1],asc[i][k]))));
 }
 const weekly=(await sql(`SELECT date_trunc('week',"Snapshot Date")::date,sum("Principal Issued"::numeric)/nullif(sum("Loans Issued"),0) FROM public.reporting_daily_snapshot WHERE "Snapshot Date" BETWEEN DATE '${start}' AND DATE '${endHistory}' GROUP BY 1 ORDER BY 1`)).rows;
 check(label+': weekly average is weighted across selected dates',history['weekly-average'].rows.length===weekly.length&&history['weekly-average'].rows.every((r,i)=>date(r[0])===date(weekly[i][0])&&near(r[1],weekly[i][1])));
 if(label==='default')check('Default is exactly 30 completed dates',history.detail.rows.length===30&&date(history.detail.rows[0][0])===yesterday&&date(history.detail.rows[29][0])===add(today,-30));
 if(label==='today'||label==='future')check(label+': no previous-day fallback',history.detail.rows.length===0&&history['snapshot-status'].rows.some(r=>r[0]==='Stored period'&&r[1]==='No completed dates'));
}
// Query the actual installed filter with an explicitly cleared value.
const cleared=await query('detail',null);const counts=(await sql('SELECT count(*) FROM public.reporting_daily_snapshot WHERE "Snapshot Date"<public.olap_reporting_date()')).rows[0][0];
check('Cleared filter includes all available completed snapshot history',cleared.rows.length===Number(counts));
const missing=await query('detail','2000-01-01~2000-01-03');
check('Pre-coverage dates remain explicit null rows, never fabricated zeros',missing.rows.length===3&&missing.rows.every(r=>r.slice(1).every(v=>v===null)));
check('Missing snapshot warning visible',(await query('snapshot-status','2000-01-01~2000-01-03')).rows.some(r=>r[0]==='Coverage'&&r[1].includes('missing 3')));
check('Missing week average remains null',(await query('weekly-average','2000-01-01~2000-01-03')).rows.every(r=>r[1]===null));
// Controlled read-only fixtures exercise gaps, disjoint dates and signed arithmetic without source writes.
const fixture=`WITH history("Date","Snapshot ID","Principal issued","Loans issued") AS (VALUES (DATE '2026-08-03','a',100::numeric,1),(DATE '2026-08-04','b',900::numeric,3),(DATE '2026-08-05','c',0::numeric,0),(DATE '2026-08-10','d',0::numeric,0),(DATE '2026-08-17','e',-50::numeric,1))`;
const weeklySpec=specs.find(s=>s.key==='weekly-average').dataset_query.native.query;
const tail=weeklySpec.slice(weeklySpec.indexOf(' SELECT date_trunc'));
const synthetic=(await sql(fixture+tail)).rows;
check('Synthetic weighted average, zero-loan null and signed values',near(synthetic[0][1],250)&&synthetic[1][1]===null&&near(synthetic[2][1],-50));
const gapFixture=fixture.replace("(DATE '2026-08-05','c',0::numeric,0)","(DATE '2026-08-05',NULL,NULL::numeric,NULL::integer)");
check('Synthetic internal missing day invalidates its whole weekly average',(await sql(gapFixture+tail)).rows[0][1]===null);
const discontinuous=common.replace(/selected AS \([\s\S]*?\), bounds AS/,`selected AS (SELECT unnest(ARRAY[DATE '2026-08-01',DATE '2026-08-03']) AS "Date"), bounds AS`);
const disjoint=(await sql(discontinuous+' SELECT continuous,(SELECT count(*) FROM live_days),(SELECT count(*) FROM history_days) FROM bounds')).rows[0];
check('Disjoint selection is rejected rather than expanded into a continuous span',disjoint[0]===false&&Number(disjoint[1])===0&&Number(disjoint[2])===0);
write('performance-redesign/verification.json',{at:new Date().toISOString(),dashboard:3,tab:state.tab,today,checks,check_count:checks.length,financial_values_published:false,source_writes:false});
console.log(checks.length+' focused Performance checks passed.');
