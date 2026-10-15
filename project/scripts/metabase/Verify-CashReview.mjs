import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,read,write,privateDir,assertSource} from './ReportingApi.mjs';
import {original,prior,assertPreserved,backup,specs} from './CashReviewPages.mjs';
await assertSource();
const state=read('cash-review-state.json'),d=await api('GET','dashboard/3'),checks=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);};
const near=(a,b)=>a===null||b===null?a===b:Math.abs(Number(a)-Number(b))<0.005;
const result=async(route,body)=>{const r=await api('POST',route,body);if(r.status!=='completed'){fs.writeFileSync(privateDir+'/cash-review-query-error.json',JSON.stringify(r));throw Error('Query failed; private diagnostic: '+route);}assert.ok(!r.data.rows_truncated);return r.data;};
const sql=q=>result('dataset',{database:2,type:'native',native:{query:q}});
const today=(await sql("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date" )).rows[0][0].slice(0,10);
assertPreserved(d);checks.push('All original ten page layouts, ordering and filter definitions preserved');
assert.deepEqual(await api('GET','collection/graph'),prior('collection-graph'));checks.push('Partner collection permissions unchanged');
assert.deepEqual(await api('GET','native-query-snippet'),prior('snippets'));checks.push('All existing snippets unchanged');
const oldIds=fs.readdirSync(backup).filter(n=>/^card-\d+\.json$/.test(n)).map(n=>Number(n.match(/\d+/)[0]));
for(const id of oldIds){const a=prior('card-'+id),b=await api('GET','card/'+id);for(const k of ['name','dataset_query','visualization_settings','result_metadata','collection_id','archived'])assert.deepEqual(b[k],a[k],`Existing card ${id} ${k}`);}
checks.push(`${oldIds.length} existing saved questions/models unchanged`);
const byTab=index=>d.dashcards.filter(c=>c.card_id&&c.dashboard_tab_id===state.tabs[index].id);
function params(index,date=today,scope='__ALL__'){
 if(index===0)return [{id:'review-position',type:'date/single',value:date},{id:'review-position-trend',type:'date/range',value:today.slice(0,7)+'-01~'+today}];
 return [{id:index===1?'review-flow':'review-income',type:'date/range',value:date.includes('~')?date:date+'~'+date},...(index===1?[{id:'review-account',type:'string/=',value:[scope]}]:[])];
}
async function query(index,id,ps){const c=byTab(index).find(c=>c.card_id===id);assert.ok(c);return result(`dashboard/3/dashcard/${c.id}/card/${id}/query`,{parameters:ps});}
for(let i=0;i<3;i++)for(const c of byTab(i)){await query(i,c.card_id,params(i,i===0?today:today.slice(0,7)+'-01~'+today));checks.push(`Review tab ${i+1} card ${c.card_id} saved dashboard mapping executes`);}
for(const date of ['2026-09-18',today,'2026-09-17']){
 const ps=params(0,date),q={};
 for(const id of [179,180,197,200,201,183])q[id]=await query(0,id,ps);
 const source=(await sql(`SELECT "Cash Pool Remaining","Business Cash Held","Advance Due","Retained Profit Through Date","Cash Reconciliation Difference" FROM public.reporting_cash_daily WHERE "Date"=DATE '${date}'`)).rows[0];
 check(`${date}: dated remaining capital, custody and advances match model`,[179,180,200].every((id,j)=>near(q[id].rows[0][0],source[j])));
 check(`${date}: signed cash equals cash held less advances`,near(q[197].rows[0][0],source[1]===null?null:Number(source[1])-Number(source[2])));
 const amounts=q[201].rows.map(r=>r[1]);
 check(`${date}: reconciliation shows all-period retained profit and diagnostic`,near(amounts[1],source[3])&&near(amounts[2],source[4]));
 if(source[1]!==null){check(`${date}: reconciliation arithmetic`,near(Number(amounts[0])+Number(amounts[1])+Number(amounts[2]),amounts[3])&&near(Number(amounts[3])+Number(amounts[4]),amounts[5]));check(`${date}: individual account balances sum to signed total`,near(q[183].rows.reduce((s,r)=>s+Number(r[2]),0),q[197].rows[0][0]));}
 else check(`${date}: pre-opening custody remains unavailable`,q[180].rows[0][0]===null&&q[197].rows[0][0]===null);
}
const choices=await result('card/199/query',{}),scope=choices.rows.find(r=>r[0]!=='__ALL__')[0];
for(const [name,range,account] of [['known','2026-09-18~'+today,'__ALL__'],['individual','2026-09-18~'+today,scope],['before-opening','2026-09-01~2026-09-17','__ALL__'],['empty','2000-01-01~2000-01-02','__ALL__']]){
 const ps=params(1,range,account),q={};for(const id of [192,193,194,195,197,203])q[id]=await query(1,id,ps);
 const grouped=q[203].rows,sums=[1,2,3].map(col=>grouped.reduce((s,r)=>s+Number(r[col]),0));
 check(`${name}: movement type totals reconcile to inflow/outflow/net`,[192,193,194].every((id,j)=>near(q[id].rows[0][0]??0,sums[j])));
 if(q[195].rows[0][0]!==null)check(`${name}: opening plus net equals closing`,near(Number(q[195].rows[0][0])+Number(q[194].rows[0][0]),q[197].rows[0][0]));
}
for(const [name,range] of [['month',today.slice(0,7)+'-01~'+today],['historical','2026-09-01~2026-09-17'],['empty','2000-01-01~2000-01-02']]){
 const ps=params(2,range),q={};for(const id of [168,169,170,171,173,174,175,178,204])q[id]=await query(2,id,ps);
 check(`${name}: income minus signed expenses equals net profit`,near(Number(q[168].rows[0][0])+Number(q[169].rows[0][0]),q[170].rows[0][0]));
 check(`${name}: net-profit waterfall excludes distributions`,q[204].rows.length===2&&near(q[204].rows.reduce((s,r)=>s+Number(r[1]),0),q[170].rows[0][0]));
 check(`${name}: FIFO distribution reconciles to unsettled profit`,near(Number(q[170].rows[0][0])+Number(q[173].rows[0][0])+Number(q[174].rows[0][0]),q[175].rows[0][0]));
 check(`${name}: expense categories match signed expense card`,near(q[178].rows.reduce((s,r)=>s+Number(r[1]),0),-Number(q[169].rows[0][0])));
}
const trend=await query(0,202,params(0));check('Trend uses separate date range and unique chronological dates',new Set(trend.rows.map(r=>r[0])).size===trend.rows.length&&trend.rows.every((r,j)=>j===0||r[0]>trend.rows[j-1][0]));
const fresh=await api('GET','dashboard/3');assertPreserved(fresh);
write('cash-review-verification.json',{verified_at:new Date().toISOString(),checks,check_count:checks.length,old_pages_preserved:true,old_questions_and_models_unchanged:oldIds.length,new_questions:specs.length,new_models:0,new_snippets:0,financial_values_published:false,total_tabs:fresh.tabs.length,total_visual_placements:fresh.dashcards.filter(c=>c.card_id).length,total_distinct_questions:new Set(fresh.dashcards.map(c=>c.card_id).filter(Boolean)).size});
console.log(checks.length+' focused checks passed; no financial values published.');
