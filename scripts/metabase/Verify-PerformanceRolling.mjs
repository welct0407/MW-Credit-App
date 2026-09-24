// Read-only MBQL tests. Source rows and generated SQL stay outside the repository.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,write,read} from './ReportingApi.mjs';
import {backup,rolling,coverage,guarded,outer,execute,f,chartSettings} from './PerformanceRolling.mjs';
const checks=[];
const check=(name,ok=true)=>{assert.ok(ok,name);checks.push(name);};
const near=(a,b)=>a===null||b===null?a===b:Math.abs(Number(a)-Number(b))<1e-7;
const day=r=>r[0].slice(0,10);
await assertSource();
const props=await api('GET','session/properties');check('Report timezone is Bangkok',props['report-timezone']==='Asia/Bangkok');
const all=await execute(outer());const rows=all.data.rows,cols=all.data.cols.map(c=>c.name),ix=n=>cols.indexOf(n);
check('Calendar grain has unique consecutive dates',rows.every((r,i)=>i===0||Date.parse(r[0])-Date.parse(rows[i-1][0])===86400000));
for(const [v,m] of [['Gross interest','7-day average · daily'],['Cumulative gross interest','7-day average · cumulative']]){
 check(m+' reconciles independently across all dates',rows.every((r,i)=>{const a=rows.slice(Math.max(0,i-6),i+1).map(x=>x[ix(v)]);const expected=i<6||a.some(x=>x===null)?null:a.reduce((s,x)=>s+Number(x),0)/7;return near(r[ix(m)],expected);}));
}
const grain=await execute({'source-table':'card__74',breakout:[f('Date','type/Date')],aggregation:[['count']]});
check('Source model has one snapshot per date',grain.data.rows.every(r=>r[1]===1));
for(const [a,b] of [['2026-09-01','2026-09-01'],['2026-09-01','2026-09-30'],['2026-08-26','2026-09-01'],['2026-08-01','2026-09-23'],['2099-01-01','2099-01-31'],['2000-01-01','2000-01-31']]){
 const r=await execute({...outer(),filter:['between',f('Date','type/Date'),a,b]});assert.deepEqual(r.data.rows,rows.filter(x=>day(x)>=a&&day(x)<=b));check('Outer-filter invariance '+a+'..'+b);
}
// Read-only calendar fixture; no temporary table, SQL text, source edits or saved test questions.
async function fixture(values){
 const calendar=['field',569,{'base-type':'type/Date'}];
 const dates=values.map((_,i)=>`2026-08-${String(i+1).padStart(2,'0')}`);
 const expression=items=>['case',items.flatMap((v,i)=>v===null?[]:[[['=',calendar,dates[i]],v]])];
 let sum=0;const cumulative=values.map(v=>sum+=v??0);
 const input={ 'source-table':36,filter:['between',calendar,dates[0],dates.at(-1)],expressions:{Profit:expression(values),'Cumulative Profit':expression(cumulative),'Missing input':expression(values.map(v=>v===null?1:0))},fields:[calendar,['expression','Profit'],['expression','Cumulative Profit'],['expression','Missing input']]};
 const covered={...coverage,'source-query':input,aggregation:coverage.aggregation.filter(a=>!['Generated at','History start'].includes(a[2].name))};
 const g={...guarded,'source-query':covered,fields:guarded.fields.filter(a=>!['History start','Generated at'].includes(a[1]))};
 const r={...rolling,'source-query':g,aggregation:rolling.aggregation.slice(0,4)};
 return (await execute(r)).data.rows;
}
const base=Array.from({length:15},(_,i)=>(i+1)*10),known=await fixture(base);
check('Synthetic first six MA rows are null',known.slice(0,6).every(r=>r[2]===null&&r[4]===null));
check('Known day seven: daily MA 40, cumulative 280, cumulative MA 120',near(known[6][2],40)&&near(known[6][3],280)&&near(known[6][4],120));
check('Known day eight: daily MA 50, cumulative 360, cumulative MA 170',near(known[7][2],50)&&near(known[7][3],360)&&near(known[7][4],170));
const gap=await fixture(base.map((v,i)=>i===2?null:v));
check('Missing date propagates null then daily MA recovers',gap.slice(0,9).every(r=>r[2]===null)&&near(gap[9][2],70));
check('Cumulative remains null after missing input',gap.slice(2).every(r=>r[3]===null&&r[4]===null));
const signed=await fixture(base.map((v,i)=>i===2?-30:i===3?0:v));
check('Zero and negative values remain signed',near(signed[6][2],180/7)&&near(signed[6][3],180));
const corrected=await fixture(base.map((v,i)=>i===6?v+7:v));
check('Old correction affects exactly seven daily MA dates',corrected.every((r,i)=>near(r[2],i<6?null:known[i][2]+(i<=12?1:0))));
check('Old correction propagates through cumulative',corrected.every((r,i)=>near(r[3],known[i][3]+(i>=6?7:0))));
if(process.argv.includes('--installed')){
 const state=read('performance-redesign/rolling-state.json'),d=await api('GET','dashboard/3'),before=JSON.parse(fs.readFileSync(backup+'/dashboard.json'));
 const shape=cards=>cards.map(c=>Object.fromEntries(['id','card_id','dashboard_tab_id','col','row','size_x','size_y','series','parameter_mappings','visualization_settings'].map(k=>[k,c[k]]))).sort((a,b)=>a.id-b.id);
 assert.deepEqual(shape(d.dashcards.filter(c=>c.dashboard_tab_id!==18)),shape(before.dashcards.filter(c=>c.dashboard_tab_id!==18)));check('All other placements preserved');
 assert.deepEqual(d.tabs,before.tabs);assert.deepEqual(d.parameters,before.parameters);check('Owner tab order/name and all dashboard parameters preserved');
 assert.deepEqual(await api('GET','collection/graph'),JSON.parse(fs.readFileSync(backup+'/permissions.json')));check('Permissions unchanged');
 const model=await api('GET','card/74');assert.deepEqual(model.dataset_query,JSON.parse(fs.readFileSync(backup+'/model74.json')).dataset_query);check('Existing source model unchanged');
 for(const p of before.dashcards.filter(c=>c.card_id&&c.card_id!==222)){
  const n=d.dashcards.find(x=>x.id===p.id);assert.deepEqual(n.card.dataset_query,p.card.dataset_query);assert.deepEqual(n.card.visualization_settings,p.card.visualization_settings);
 }check('All pre-existing questions other than 222 unchanged');
 for(const [id,cumulative] of [[222,false],[state.cumulative,true]]){const c=await api('GET','card/'+id);assert.deepEqual(c.visualization_settings,chartSettings(cumulative));check('Saved series styling, axis and null settings '+id);}
 const readiness=d.dashcards.find(x=>x.card_id===state.readiness);
 for(const [value,expected] of [['2026-09-01~2026-09-30',[23,23,23]],['2026-08-01~2026-08-07',[7,1,1]],['2026-09-24',[0,0,0]]]){
  const r=await api('POST',`dashboard/3/dashcard/${readiness.id}/card/${state.readiness}/query`,{parameters:[{id:'review-performance',type:'date/all-options',value}]});assert.equal(r.status,'completed');assert.deepEqual(r.data.rows[0].slice(1),expected);check('Readiness counts '+value);
 }
 for(const [key,indices] of [['daily',[0,1,2]],['cumulative',[0,3,4]]]){
  const id=key==='daily'?222:state.cumulative,p=d.dashcards.find(x=>x.card_id===id&&x.dashboard_tab_id===18);
  for(const value of ['2026-09-01','2026-09-01~2026-09-30','2026-08-26~2026-09-01','2026-09-24','2099-01-01',null]){
   const r=await api('POST',`dashboard/3/dashcard/${p.id}/card/${id}/query`,{parameters:[{id:'review-performance',type:'date/all-options',value}]});assert.equal(r.status,'completed');
   const [a,b=a]=value?.split('~')??['0000','9999'];assert.deepEqual(r.data.rows,rows.filter(x=>day(x)>=a&&day(x)<=b).map(x=>indices.map(i=>x[i])));check(key+' installed dashboard filter '+(value??'cleared'));
  }
 }
}
write('performance-redesign/rolling-verification.json',{at:new Date().toISOString(),mode:process.argv.includes('--installed')?'installed':'preflight',checks,count:checks.length,financial_values_published:false,database_writes:false});
console.log(`${checks.length} rolling-average checks passed.`);
