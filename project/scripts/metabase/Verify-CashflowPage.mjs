import fs from 'node:fs';import assert from 'node:assert/strict';
import {api as rawApi,assertSource,read,write} from './ReportingApi.mjs';import {baselineDir,redactedReads} from './Baselines.mjs';
const api=redactedReads(rawApi);  // R103: compare the redacted form the baselines hold
const privateDir=await baselineDir('r016-20260922');  // R103: Baselines.mjs (override or private bucket)
await assertSource();const state=read('cashflow-state.json'),d=await api('GET','dashboard/3'),checks=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);};
const near=(a,b)=>a===null||b===null?a===b:Math.abs(Number(a)-Number(b))<1e-7;
async function sql(query){const r=await api('POST','dataset',{database:2,type:'native',native:{query}});assert.equal(r.status,'completed');return r.data.rows;}
const choices=(await api('POST',`card/${state.cards.accounts}/query`,{})).data.rows;
const today=(await sql(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date`))[0][0].slice(0,10);
async function query(key,scope,start,end){const id=state.cards[key],dc=d.dashcards.find(c=>c.card_id===id);const r=await api('POST',`dashboard/3/dashcard/${dc.id}/card/${id}/query`,{parameters:[{id:'cashflow-period',type:'date/range',value:start+'~'+end},{id:'cashflow-account',type:'string/=',value:[scope]}]});assert.equal(r.status,'completed');assert.ok(!r.data.rows_truncated);return r.data.rows;}
const periods=[['month',today.slice(0,7)+'-01',today],['known','2026-09-18',today],['one-day','2026-09-18','2026-09-18'],['empty','2000-01-01','2000-01-02']];
for(const [index,[scope]] of choices.entries()){
 assert.match(scope,/^[a-zA-Z0-9_-]+$/);
 for(const [label,start,end] of periods){
  const source=(await sql(`SELECT (array_agg("Opening Balance" ORDER BY "Date"))[1],sum("Money In"),sum("Money Out"),sum("Net Movement"),(array_agg("Closing Balance" ORDER BY "Date" DESC))[1],sum("Transaction Count") FROM public.reporting_cashflow_daily WHERE "Scope ID"='${scope}' AND "Date" BETWEEN DATE '${start}' AND DATE '${end}'`))[0];
  const results={};for(const key of ['opening','in','out','net','closing'])results[key]=(await query(key,scope,start,end))[0][0];
  check(`scope ${index} ${label}: five cards follow real dashboard date/account filters`,['opening','in','out','net','closing'].every((k,i)=>near(results[k],source[i])));
  const tx=await query('transactions',scope,start,end);check(`scope ${index} ${label}: complete transaction count`,tx.length===Number(source[5]??0));
  check(`scope ${index} ${label}: compact date and posting time`,tx.every(r=>/^\d{2}\/\d{2} \d{2}:\d{2}$/.test(r[0])));
  check(`scope ${index} ${label}: transaction totals reconcile`,!tx.length||(near(tx.reduce((n,r)=>n+Number(r[3]),0),source[1])&&near(tx.reduce((n,r)=>n+Number(r[4]),0),source[2])));
  if(source[0]!==null)check(`scope ${index} ${label}: opening plus net flow equals closing`,near(Number(source[0])+Number(source[3]),source[4]));
 }
}
const [monthStart,monthEnd]=periods[0].slice(1),rendered=await query('transactions','__ALL__',monthStart,monthEnd);
const original=await sql(`SELECT "Date","Posted At" FROM public.reporting_cashflow_transactions WHERE "Scope ID"='__ALL__' AND "Date" BETWEEN DATE '${monthStart}' AND DATE '${monthEnd}' ORDER BY "Date","Posted At","Ledger ID" COLLATE "C","Entry ID" COLLATE "C"`);
check('All-account displayed dates follow statement date and Bangkok posting time',rendered.length===original.length&&rendered.every((row,i)=>row[0]===original[i][0].slice(8,10)+'/'+original[i][0].slice(5,7)+' '+original[i][1].slice(11,16)));
const before=JSON.parse(fs.readFileSync(privateDir+'/cashflow-before/dashboard-3.json'));
const project=c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]));
assert.deepEqual(d.dashcards.filter(c=>c.dashboard_tab_id!==state.tab_id).map(project).sort((a,b)=>a.id-b.id),before.dashcards.map(project).sort((a,b)=>a.id-b.id));checks.push('Previous nine page layouts unchanged');
assert.deepEqual(await api('GET','collection/graph'),JSON.parse(fs.readFileSync(privateDir+'/cashflow-before/collection-graph.json')));checks.push('Partner-only permissions unchanged');
const previous=read('cashflow-verification.json');
write('cashflow-verification.json',{verified_at:new Date().toISOString(),checks,check_count:checks.length,scopes:choices.length,periods:periods.map(p=>p[0]),actual_dashboard_parameters_tested:true,financial_values_published:false,browser:previous.browser});
console.log(`${checks.length} live dashboard checks passed across ${choices.length} account scopes.`);
