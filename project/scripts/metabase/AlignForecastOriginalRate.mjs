// R048: align only Forecast watchlist Loan Key with the stored integer rate.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {api,assertSource,root} from './ReportingApi.mjs';
import {shape} from './ForecastPlanning.mjs';
const priv='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r048-forecast-original-rate';
const out=root+'/outputs/r048-forecast-original-rate';
const oldExpr=`coalesce(to_char(k."Effective Daily Interest Rate"::numeric*100,'FM999990.00')||'%','Unavailable')`;
const newExpr=`coalesce(k."Original Daily Interest Rate"::text||'%','Unavailable')`;
const save=(dir,name,value)=>fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(value,null,2)+'\n');
const query=c=>c.dataset_query.stages?.[0]?.native??c.dataset_query.native?.query;
const change=c=>{const d=structuredClone(c.dataset_query);if(d.stages)d.stages[0].native=query(c).replace(oldExpr,newExpr);else d.native.query=query(c).replace(oldExpr,newExpr);return d;};
async function rows(q){const r=await api('POST','dataset',q);assert.equal(r.status,'completed');assert(!r.data.rows_truncated);return r.data;}
await assertSource();
fs.mkdirSync(priv,{recursive:true});fs.mkdirSync(out,{recursive:true});
assert(!fs.existsSync(priv+'/card-before.json'),'Completed capture exists; do not replay');
const [card,dashboard]=await Promise.all([api('GET','card/360'),api('GET','dashboard/3')]);
assert.equal(card.name,'Forecast watchlist');assert.equal(query(card).split(oldExpr).length,2);
assert(dashboard.dashcards.some(x=>x.card_id===360&&x.dashboard_tab_id===262));
save(priv,'card-before',card);save(priv,'dashboard-before',dashboard);
const next=change(card);
const [before,probe]=await Promise.all([rows(card.dataset_query),rows(next)]);
assert.deepEqual(before.cols.map(x=>x.name),probe.cols.map(x=>x.name));
const key=probe.cols.findIndex(x=>x.name==='Loan Key');assert(key>=0);
assert.equal(before.rows.length,probe.rows.length);
for(let i=0;i<before.rows.length;i++)for(let j=0;j<before.cols.length;j++){
 if(j!==key)assert.deepEqual(before.rows[i][j],probe.rows[i][j],`Other value changed at ${i}/${j}`);
 else assert(/-\d+%$/.test(probe.rows[i][j]),'Rate suffix is not a whole percentage');
}
save(priv,'rows-before',before);save(priv,'rows-proposed',probe);
const backup=await api('POST','dashboard/3/copy',{name:'R048 recovery - before Forecast original integer rate',collection_id:5});
save(out,'backup',{dashboard:backup.id,card:360,at:new Date().toISOString()});
const current=await api('GET','card/360');assert.equal(query(current),query(card));assert.deepEqual(current.visualization_settings,card.visualization_settings);
await api('PUT','card/360',{dataset_query:next});
const [saved,afterDashboard]=await Promise.all([api('GET','card/360'),api('GET','dashboard/3')]);
assert.equal(query(saved),query(card).replace(oldExpr,newExpr));assert.deepEqual(saved.visualization_settings,card.visualization_settings);
assert.deepEqual(shape(afterDashboard),shape(dashboard));assert.deepEqual(afterDashboard.tabs,dashboard.tabs);assert.deepEqual(afterDashboard.parameters,dashboard.parameters);
const final=await rows(saved.dataset_query);assert.deepEqual(final.rows,probe.rows);
save(out,'saved',{id:saved.id,key:'watchlist',name:saved.name,display:saved.display,dataset_query:saved.dataset_query,visualization_settings:saved.visualization_settings,description:saved.description});
const verification={passed:true,at:new Date().toISOString(),question:360,tab:262,rows:final.rows.length,integerPercentageSuffixes:true,usesStoredOriginalRate:true,otherValuesUnchanged:true,dashboardUnchanged:true,backupDashboard:backup.id};
save(out,'verification',verification);console.log(JSON.stringify(verification));
